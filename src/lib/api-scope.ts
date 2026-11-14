/**
 * B1c — per-role read scoping and write filtering for /api/sync and
 * /api/auth/accounts. SERVER ONLY. Pure functions (no I/O) so they are unit-testable.
 *
 * Account <-> patient link: Patient.id === account.user.uid (set by the register
 * route, approveCloudAccount, ensurePatientsFromAccounts and addPatientAccount;
 * patient pages use user.uid as patientId). No phone/username fuzzy matching.
 *
 * Reads:
 *   staff (admin/doctor/nurse/staff): whole database, every account without password.
 *   patient: own public account, own patient record, rows with patientId === uid,
 *            notifications addressed to them (broadcast / their id / their schedule group),
 *            all coaching tips.
 * Writes (POST /api/sync):
 *   nobody writes `accounts` through sync (accounts change only via register/approve/reject).
 *   staff: every clinical collection.
 *   patient: only NEW rows with patientId === uid in dialysisSessions, adherenceLogs,
 *            fluidLogs, dietLogs, adherenceSurveys (an incoming id that already exists is
 *            dropped, so a patient can never alter or steal an existing row — the patient
 *            UI cannot edit/delete sessions: canManage={false});
 *            dialysisSessions.recordedBy is forced to the caller uid;
 *            own patient record: only fluidLimit / avatarId / avatarStyle, everything else
 *            from the server copy. Labs, meds, reminders, notifications, tips: dropped.
 */
import type {
  AdherenceLog,
  AdherenceSurveySubmission,
  DialysisSession,
  DietLog,
  FluidLog,
  Notification,
  Patient,
  StoredAccount,
  UnifiedCloudDatabase,
  UserRole,
} from './types';
import { STAFF_ROLES, toPublicAccount } from './server-auth';

export function isStaffRole(role: UserRole | undefined): boolean {
  return Boolean(role && STAFF_ROLES.includes(role));
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

/** Public (password-less) accounts typed as StoredAccount[] for the existing wire shape. */
export function publicAccounts(accounts: StoredAccount[]): StoredAccount[] {
  return accounts.map((a) => toPublicAccount(a)) as unknown as StoredAccount[];
}

function isSttSchedule(schedule?: string): boolean {
  const s = (schedule || 'SMW').trim().toUpperCase();
  return s === 'STT' || s === 'TTS' || s.includes('SUN') || s.includes('أحد');
}

/** Same visibility rule as data-store getPatientNotifications(). */
export function isNotificationVisibleToPatient(n: Notification, patientId: string, schedule?: string): boolean {
  if (!n) return false;
  if (n.type === 'broadcast') return true;
  if (!Array.isArray(n.recipientIds)) return false;
  if (n.recipientIds.includes(patientId)) return true;
  if (n.type === 'group') {
    const schedUpper = (schedule || 'SMW').trim().toUpperCase();
    const stt = isSttSchedule(schedule);
    return n.recipientIds.some((r) => {
      const up = String(r).trim().toUpperCase();
      if (!stt && (up === 'SMW' || up === 'MWF')) return true;
      if (stt && (up === 'STT' || up === 'TTS')) return true;
      return up === schedUpper;
    });
  }
  return false;
}

/** What the caller is allowed to read. Never returns a password. */
export function scopeDatabaseForAccount(db: UnifiedCloudDatabase, account: StoredAccount): UnifiedCloudDatabase {
  const scrubbedArchived = Array.isArray(db.archivedPatients)
    ? db.archivedPatients.map((arch) => ({
        ...arch,
        account: arch.account ? (toPublicAccount(arch.account) as unknown as StoredAccount) : undefined,
      }))
    : undefined;

  if (isStaffRole(account.user.role)) {
    return {
      ...db,
      accounts: publicAccounts(arr<StoredAccount>(db.accounts)),
      ...(scrubbedArchived !== undefined ? { archivedPatients: scrubbedArchived } : {}),
    };
  }
  const uid = account.user.uid;
  const own = <T extends { patientId?: string }>(rows: unknown): T[] => arr<T>(rows).filter((r) => r.patientId === uid);
  const patients = arr<Patient>(db.patients).filter((p) => p.id === uid);
  const schedule = patients[0]?.dialysisSchedule;
  return {
    accounts: publicAccounts([account]),
    patients,
    dialysisSessions: own<DialysisSession>(db.dialysisSessions),
    labResults: own(db.labResults),
    medications: own(db.medications),
    notifications: arr<Notification>(db.notifications).filter((n) => isNotificationVisibleToPatient(n, uid, schedule)),
    adherenceLogs: own<AdherenceLog>(db.adherenceLogs),
    fluidLogs: own<FluidLog>(db.fluidLogs),
    dietLogs: own<DietLog>(db.dietLogs),
    adherenceSurveys: own<AdherenceSurveySubmission>(db.adherenceSurveys),
    reminders: own(db.reminders),
    coachingTips: arr(db.coachingTips),
    lastUpdated: db.lastUpdated,
  };
}

const CLINICAL_KEYS = [
  'patients',
  'dialysisSessions',
  'labResults',
  'medications',
  'notifications',
  'adherenceLogs',
  'fluidLogs',
  'dietLogs',
  'adherenceSurveys',
  'reminders',
  'coachingTips',
] as const;

const PATIENT_EDITABLE_FIELDS = ['fluidLimit', 'avatarId', 'avatarStyle'] as const;

export interface FilteredWrite {
  patch: Partial<UnifiedCloudDatabase>;
  /**
   * Rows REJECTED for ownership/permission (another patient's data, an existing
   * id owned by someone else, a new row in a read-only collection). Benign
   * re-posts of rows the server already has, and the `accounts` array every
   * client sends, are ignored silently and not counted.
   */
  dropped: number;
}

/**
 * Reduce an incoming /api/sync body to what the caller may write.
 * `current` is the server database BEFORE the merge (used for ownership checks).
 */
export function filterIncomingForAccount(
  incoming: unknown,
  account: StoredAccount,
  current: UnifiedCloudDatabase
): FilteredWrite {
  const body = (incoming && typeof incoming === 'object' ? incoming : {}) as Record<string, unknown>;
  let dropped = 0; // `accounts` is never written through sync (ignored silently: every client sends it)
  const patch: Partial<UnifiedCloudDatabase> = {};

  if (isStaffRole(account.user.role)) {
    for (const key of CLINICAL_KEYS) {
      const rows = arr(body[key]);
      if (rows.length > 0) (patch as Record<string, unknown>)[key] = rows;
    }
    return { patch, dropped };
  }

  const uid = account.user.uid;

  // Append-only patient collections: new ids only, own patientId only.
  const appendOnly = <T extends { id?: string; patientId?: string }>(rows: unknown, existing: T[]): T[] => {
    const ownerById = new Map<string, string | undefined>();
    for (const r of existing) if (r.id) ownerById.set(r.id, r.patientId);
    const out: T[] = [];
    for (const r of arr<T>(rows)) {
      if (r.id && ownerById.has(r.id)) {
        // Existing row: never modified by a patient. Silent if it is their own re-post.
        if (ownerById.get(r.id) !== uid || r.patientId !== uid) dropped++;
        continue;
      }
      if (r.patientId !== uid) {
        dropped++;
        continue;
      }
      out.push(r);
    }
    return out;
  };

  const sessions = appendOnly<DialysisSession>(body.dialysisSessions, arr(current.dialysisSessions)).map((s) => ({
    ...s,
    recordedBy: uid,
  }));
  if (sessions.length) patch.dialysisSessions = sessions;
  const adherence = appendOnly<AdherenceLog>(body.adherenceLogs, arr(current.adherenceLogs));
  if (adherence.length) patch.adherenceLogs = adherence;
  const fluid = appendOnly<FluidLog>(body.fluidLogs, arr(current.fluidLogs));
  if (fluid.length) patch.fluidLogs = fluid;
  const diet = appendOnly<DietLog>(body.dietLogs, arr(current.dietLogs));
  if (diet.length) patch.dietLogs = diet;
  const surveys = appendOnly<AdherenceSurveySubmission>(body.adherenceSurveys, arr(current.adherenceSurveys));
  if (surveys.length) patch.adherenceSurveys = surveys;

  // Own patient record: whitelisted fields onto the server copy.
  const serverCopy = arr<Patient>(current.patients).find((p) => p.id === uid);
  for (const p of arr<Patient>(body.patients)) {
    if (p.id !== uid || !serverCopy) {
      if (p.id !== uid) dropped++;
      continue;
    }
    const changes: Partial<Patient> = {};
    for (const f of PATIENT_EDITABLE_FIELDS) {
      const v = (p as unknown as Record<string, unknown>)[f];
      if (f === 'fluidLimit') {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10000) changes.fluidLimit = v;
      } else if (typeof v === 'string' && v.length > 0 && v.length <= 100) {
        (changes as Record<string, unknown>)[f] = v;
      }
    }
    const differs = (Object.keys(changes) as (keyof Patient)[]).some((k) => serverCopy[k] !== changes[k]);
    if (differs) {
      patch.patients = [{ ...serverCopy, ...(patch.patients?.[0] || {}), ...changes }];
    }
  }

  // Read-only for patients. Re-posts of rows the server already has are silent;
  // anything new (a forged lab, a self-made notification...) is counted.
  for (const key of ['labResults', 'medications', 'notifications', 'reminders', 'coachingTips'] as const) {
    const known = new Set(arr<{ id?: string }>(current[key]).map((r) => r.id).filter(Boolean));
    for (const r of arr<{ id?: string }>(body[key])) {
      if (!r.id || !known.has(r.id)) dropped++;
    }
  }
  return { patch, dropped };
}
