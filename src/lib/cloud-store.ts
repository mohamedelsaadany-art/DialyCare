import { put, getObjectJson, isCloudStorageConfigured } from './r2-client';
import type {
  StoredAccount,
  Patient,
  UnifiedCloudDatabase,
  ArchivedPatientRecord,
} from './types';
import {
  DEFAULT_ADMIN_USER,
  DEFAULT_PATIENT_USER,
  DEFAULT_PATIENT2_USER,
  DEFAULT_PATIENT3_USER,
  DEFAULT_PATIENT4_USER,
  DEFAULT_PATIENT5_USER,
  DEFAULT_PATIENT6_USER,
  DEFAULT_PATIENT7_USER,
  INITIAL_DEMO_PATIENTS,
  INITIAL_ARCHIVED_PATIENTS,
  getAdminPassword,
  normalizePhone,
} from './data-store';
import { isPhoneMatch } from './phone';

export type { UnifiedCloudDatabase, ArchivedPatientRecord };

const ACCOUNTS_BLOB_PATH = 'dialycare_cloud_accounts.json';
const DATABASE_BLOB_PATH = 'dialycare_cloud_database_v1.json';

// In-memory micro-cache for serverless environments (3s TTL)
let cachedCloudDatabase: { data: UnifiedCloudDatabase; fetchedAt: number } | null = null;
let cachedCloudAccounts: { data: StoredAccount[]; fetchedAt: number } | null = null;
export const CACHE_TTL_MS = 3000; // 3 seconds

export function invalidateCloudStoreCache(): void {
  cachedCloudDatabase = null;
  cachedCloudAccounts = null;
}

export function getCloudStoreCache(): {
  database: { data: UnifiedCloudDatabase; fetchedAt: number } | null;
  accounts: { data: StoredAccount[]; fetchedAt: number } | null;
} {
  return {
    database: cachedCloudDatabase,
    accounts: cachedCloudAccounts,
  };
}

// In-memory fallback for local dev / offline / CI test environments
let memoryAccounts: StoredAccount[] = [
  { username: 'admin', password: getAdminPassword(), user: DEFAULT_ADMIN_USER },
  { username: 'patient1', phone: '01012345678', password: 'patient123', user: DEFAULT_PATIENT_USER },
  { username: 'patient2', phone: '01098765432', password: 'patient123', user: DEFAULT_PATIENT2_USER },
  { username: 'patient3', phone: '01234567890', password: 'patient123', user: DEFAULT_PATIENT3_USER },
  { username: 'patient4', phone: '01145678901', password: 'patient123', user: DEFAULT_PATIENT4_USER },
  { username: 'patient5', phone: '01056789012', password: 'patient123', user: DEFAULT_PATIENT5_USER },
  { username: 'patient6', phone: '01267890123', password: 'patient123', user: DEFAULT_PATIENT6_USER },
  { username: 'patient7', phone: '01178901234', password: 'patient123', user: DEFAULT_PATIENT7_USER },
];

let memoryDatabase: UnifiedCloudDatabase = {
  accounts: memoryAccounts,
  patients: [],
  dialysisSessions: [],
  labResults: [],
  medications: [],
  notifications: [],
  adherenceLogs: [],
  fluidLogs: [],
  dietLogs: [],
  adherenceSurveys: [],
  reminders: [],
  coachingTips: [],
  archivedPatients: [],
  lastUpdated: new Date().toISOString(),
};

/**
 * Normalise an account. Only the seeded super admin (uid 'admin-1' AND username
 * 'admin') is forced to role admin / status active. Nothing a client can write
 * (a role of 'admin', a username of 'admin' on another uid) promotes or
 * activates an account any more (B3/B4).
 */
export function isSeededSuperAdmin(acc: StoredAccount): boolean {
  return Boolean(acc && acc.user && acc.user.uid === 'admin-1' && (acc.username || '').trim().toLowerCase() === 'admin');
}

function sanitizeAccount(acc: StoredAccount): StoredAccount {
  const isSuperAdmin = isSeededSuperAdmin(acc);
  return {
    ...acc,
    user: {
      ...acc.user,
      role: isSuperAdmin ? 'admin' : acc.user.role,
      status: isSuperAdmin ? 'active' : (acc.user.status || 'active'),
    },
  };
}

export type BlobReadDecision = 'use' | 'seed' | 'cached' | 'throw';

/**
 * B9 hardening: what to do with the result of reading a blob.
 *  - 'use'    the blob exists and holds valid data
 *  - 'seed'   list() succeeded and the blob is ABSENT (first run only)
 *  - 'cached' the read failed / was invalid, but this instance already loaded the
 *             real data from the blob earlier: serve that copy
 *  - 'throw'  the read failed / was invalid and nothing real is cached. Callers
 *             get an error (500) instead of seed/stale data that the next write
 *             would persist over the real store.
 * Never seeds when the blob exists.
 */
export function decideBlobRead(input: {
  failed: boolean;
  found: boolean;
  ok: boolean;
  parsed: unknown;
  loadedBefore: boolean;
  expect: 'nonEmptyArray' | 'object';
  /** read-modify-write callers: a possibly stale cache must never be written back */
  forWrite?: boolean;
  /** production never seeds: an absent blob there means a transient listing problem */
  production?: boolean;
}): BlobReadDecision {
  const p = input.parsed;
  const valid =
    input.expect === 'nonEmptyArray'
      ? Array.isArray(p) && p.length > 0
      : Boolean(p) && typeof p === 'object' && !Array.isArray(p);
  if (!input.failed && input.found && input.ok && valid) return 'use';
  if (!input.failed && !input.found) return input.production ? 'throw' : 'seed';
  return input.loadedBefore && !input.forWrite ? 'cached' : 'throw';
}

function isProductionStore(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

/** Options for store reads. forWrite: the caller will write the result back (fresh data only). */
export interface StoreReadOptions {
  forWrite?: boolean;
}

let accountsLoadedFromBlob = false;
let databaseLoadedFromBlob = false;
let memoryArchivedInitialSeeded = false;

/**
 * Retrieve all registered accounts from the cloud store (Vercel Blob).
 * In blob mode a failed or invalid read never falls back to the demo seeds
 * (see decideBlobRead); it throws unless this instance already holds the real list.
 */
export async function getCloudAccounts(options: StoreReadOptions = {}): Promise<StoredAccount[]> {
  if (!options.forWrite && cachedCloudAccounts && Date.now() - cachedCloudAccounts.fetchedAt < CACHE_TTL_MS) {
    return cachedCloudAccounts.data.map(sanitizeAccount);
  }

  if (!isCloudStorageConfigured()) {
    const sanitized = memoryAccounts.map(sanitizeAccount);
    if (!options.forWrite) {
      cachedCloudAccounts = { data: sanitized, fetchedAt: Date.now() };
    }
    return sanitized;
  }
  let failed = false;
  let found = false;
  let ok = false;
  let parsed: unknown = undefined;
  try {
    const direct = await getObjectJson<unknown>(ACCOUNTS_BLOB_PATH);
    if (direct !== null) {
      found = true;
      ok = true;
      parsed = direct;
    } else {
      found = false;
      ok = false;
    }
  } catch (error: unknown) {
    const status = (error as { $metadata?: { httpStatusCode?: number }; status?: number })?.$metadata?.httpStatusCode || (error as { status?: number })?.status;
    const name = (error as { name?: string })?.name;
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    const isNotFound = status === 404 || name === 'NotFound' || name === 'NoSuchKey' || code === 'NoSuchKey' || code === 'NotFound' || msg.includes('NoSuchKey') || msg.includes('404');
    if (isNotFound) {
      found = false;
      ok = false;
    } else {
      failed = true;
      console.warn('[CloudStore] Cloud accounts read failed:', msg);
    }
  }

  const decision = decideBlobRead({
    failed,
    found,
    ok,
    parsed,
    loadedBefore: accountsLoadedFromBlob,
    expect: 'nonEmptyArray',
    forWrite: options.forWrite,
    production: isProductionStore(),
  });
  if (decision === 'use') {
    const sanitized = (parsed as StoredAccount[]).map(sanitizeAccount);
    memoryAccounts = sanitized;
    accountsLoadedFromBlob = true;
    if (!options.forWrite) {
      cachedCloudAccounts = { data: sanitized, fetchedAt: Date.now() };
    }
    return sanitized;
  }
  if (decision === 'cached') {
    const sanitized = memoryAccounts.map(sanitizeAccount);
    if (!options.forWrite) {
      cachedCloudAccounts = { data: sanitized, fetchedAt: Date.now() };
    }
    return sanitized;
  }
  if (decision === 'throw') {
    throw new Error('[CloudStore] accounts store temporarily unavailable');
  }

  // 'seed': the accounts blob does not exist yet (first run)
  const initialAccounts: StoredAccount[] = [
    { username: 'admin', password: getAdminPassword(), user: DEFAULT_ADMIN_USER },
    { username: 'patient1', phone: '01012345678', password: 'patient123', user: DEFAULT_PATIENT_USER },
    { username: 'patient2', phone: '01098765432', password: 'patient123', user: DEFAULT_PATIENT2_USER },
    { username: 'patient3', phone: '01234567890', password: 'patient123', user: DEFAULT_PATIENT3_USER },
    { username: 'patient4', phone: '01145678901', password: 'patient123', user: DEFAULT_PATIENT4_USER },
    { username: 'patient5', phone: '01056789012', password: 'patient123', user: DEFAULT_PATIENT5_USER },
    { username: 'patient6', phone: '01267890123', password: 'patient123', user: DEFAULT_PATIENT6_USER },
    { username: 'patient7', phone: '01178901234', password: 'patient123', user: DEFAULT_PATIENT7_USER },
  ];
  await saveCloudAccounts(initialAccounts);
  accountsLoadedFromBlob = true;
  cachedCloudAccounts = { data: initialAccounts, fetchedAt: Date.now() };
  return initialAccounts;
}

/**
 * Overwrite accounts in Vercel Blob
 */
export async function saveCloudAccounts(accounts: StoredAccount[]): Promise<void> {
  invalidateCloudStoreCache();
  const sanitized = accounts.map(sanitizeAccount);
  memoryAccounts = sanitized;

  if (!isCloudStorageConfigured()) {
    return;
  }

  try {
    await put(ACCOUNTS_BLOB_PATH, JSON.stringify(sanitized, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    console.warn('[CloudStore] Failed to write accounts to Cloudflare R2:', error);
  }
}

/**
 * Add or update an account in the cloud store
 */
export async function upsertCloudAccount(account: StoredAccount): Promise<StoredAccount[]> {
  const accounts = await getCloudAccounts({ forWrite: true });
  const cleanUsername = account.username.trim().toLowerCase();
  const cleanPhone = account.phone?.replace(/[\s\-\(\)\+]/g, '') || '';

  const filtered = accounts.filter((a) => {
    const aUser = a.username.trim().toLowerCase();
    const aPhone = a.phone?.replace(/[\s\-\(\)\+]/g, '') || '';
    if (a.user.uid === account.user.uid) return false;
    if (aUser === cleanUsername) return false;
    if (cleanPhone && aPhone === cleanPhone) return false;
    return true;
  });

  filtered.push(sanitizeAccount(account));
  await saveCloudAccounts(filtered);
  return filtered;
}

/**
 * Insert a NEW account only if no existing account shares its uid, username
 * (case-insensitive) or normalised phone. Never replaces anything (B4).
 * Re-reads the store immediately before writing to keep the race window small.
 */
export async function addCloudAccountIfAbsent(account: StoredAccount): Promise<'created' | 'conflict'> {
  const accounts = await getCloudAccounts({ forWrite: true });
  if (findConflictingAccount(accounts, account)) return 'conflict';
  await saveCloudAccounts([...accounts, sanitizeAccount(account)]);
  invalidateCloudStoreCache();
  return 'created';
}

/**
 * Change an account password in cloud store and invalidate micro-cache.
 */
export async function changePasswordInCloud(
  uid: string,
  newPasswordHash: string,
  markChanged: boolean = true
): Promise<boolean> {
  const accounts = await getCloudAccounts({ forWrite: true });
  const idx = accounts.findIndex((a) => a.user && a.user.uid === uid);
  if (idx === -1) return false;
  const updated: StoredAccount = {
    ...accounts[idx],
    password: newPasswordHash,
    ...(markChanged ? { passwordUpdatedAt: new Date().toISOString() } : {}),
  };
  await saveCloudAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  invalidateCloudStoreCache();
  return true;
}

export function findConflictingAccount(accounts: StoredAccount[], candidate: StoredAccount): StoredAccount | undefined {
  const uname = (candidate.username || '').trim().toLowerCase();
  const phone = normalizePhone(candidate.phone || candidate.user?.phone);
  return accounts.find((a) => {
    if (!a || !a.user) return false;
    if (candidate.user?.uid && a.user.uid === candidate.user.uid) return true;
    const aUser = (a.username || '').trim().toLowerCase();
    if (uname && aUser === uname) return true;
    // a phone-shaped username also collides with an existing phone (and vice versa)
    const aPhone = normalizePhone(a.phone || a.user.phone);
    const aUserPhone = /^\+?[\d\s\-()]{6,}$/.test(a.username || '') ? normalizePhone(a.username) : '';
    if (phone && (aPhone === phone || aUserPhone === phone)) return true;
    return false;
  });
}

/**
 * Pure deterministic reconciliation of two account arrays by uid, username, and clean phone.
 */
export function reconcileAccounts(
  baseAccounts: StoredAccount[],
  incomingAccounts: StoredAccount[]
): { merged: StoredAccount[]; hasChanges: boolean } {
  const result = [...baseAccounts];
  let hasChanges = false;

  const isMatch = (a: StoredAccount, b: StoredAccount) => {
    if (a.user.uid && b.user.uid && a.user.uid === b.user.uid) return true;
    if (a.username && b.username && a.username.trim().toLowerCase() === b.username.trim().toLowerCase()) return true;
    const cleanPhoneA = (a.phone || a.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
    const cleanPhoneB = (b.phone || b.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
    if (cleanPhoneA && cleanPhoneB && cleanPhoneA === cleanPhoneB) return true;
    return false;
  };

  for (const inc of incomingAccounts) {
    if (!inc || !inc.user) continue;
    const idx = result.findIndex((curr) => isMatch(curr, inc));
    if (idx === -1) {
      result.push(sanitizeAccount(inc));
      hasChanges = true;
    } else {
      const existing = result[idx];
      const incTime = new Date(inc.user.reviewedAt || inc.user.registeredAt || inc.user.createdAt || 0).getTime();
      const existTime = new Date(existing.user.reviewedAt || existing.user.registeredAt || existing.user.createdAt || 0).getTime();
      // If incoming is active and existing is pending, or incoming has fresher timestamp or profile:
      if (
        (inc.user.status === 'active' && existing.user.status === 'pending') ||
        incTime > existTime ||
        (!existing.user.patientProfile && inc.user.patientProfile)
      ) {
        // B2.1: credentials are never taken from a reconciled copy. Passwords change
        // only through storeAccountPassword / addCloudAccountIfAbsent, so whenever the
        // base account has a password, it (and passwordUpdatedAt) wins over whatever
        // the other copy carries (e.g. an older plaintext still in the database blob).
        const keepCredentials = typeof existing.password === 'string' && existing.password.length > 0;
        const merged: StoredAccount = {
          ...existing,
          ...inc,
          user: {
            ...existing.user,
            ...inc.user,
            patientProfile: inc.user.patientProfile || existing.user.patientProfile,
          },
        };
        if (keepCredentials) {
          merged.password = existing.password;
          if (existing.passwordUpdatedAt) merged.passwordUpdatedAt = existing.passwordUpdatedAt;
          else delete merged.passwordUpdatedAt;
        }
        result[idx] = sanitizeAccount(merged);
        hasChanges = true;
      }
    }
  }

  return { merged: result, hasChanges };
}

/**
 * Merge an array of incoming accounts (e.g. from a client's local store)
 * into the cloud accounts store, reconciling by uid, phone, and username.
 * Ensures local in-clinic created patients on doctors' devices are never lost.
 */
export async function mergeCloudAccounts(incomingAccounts: StoredAccount[]): Promise<StoredAccount[]> {
  const currentAccounts = await getCloudAccounts({ forWrite: true });
  const { merged, hasChanges } = reconcileAccounts(currentAccounts, incomingAccounts);

  if (hasChanges) {
    await saveCloudAccounts(merged);
  }
  return merged;
}

/**
 * Approve an account in the cloud store
 */
export async function approveCloudAccount(
  uid: string,
  reviewerName: string = 'Super Admin'
): Promise<{ account: StoredAccount | null; newPatient?: Patient }> {
  const accounts = await getCloudAccounts({ forWrite: true });
  const target = accounts.find((a) => a.user.uid === uid);
  if (!target) return { account: null };

  target.user.status = 'active';
  target.user.reviewedAt = new Date().toISOString();
  target.user.reviewedBy = reviewerName;

  let newPatient: Patient | undefined;
  if (target.user.role === 'patient') {
    const profile = target.user.patientProfile;
    newPatient = {
      id: uid,
      fullName: target.user.displayName,
      fullNameAr: target.user.displayName,
      phone: target.user.phone || target.username,
      username: target.username,
      dialysisSchedule: profile?.dialysisSchedule || 'SMW',
      dryWeightKg: profile?.dryWeightKg || 70,
      accessType: profile?.accessType || 'AVF',
      dialysisCenter: profile?.dialysisCenter,
      centerName: profile?.dialysisCenter,
      age: profile?.age,
      reminderSchedule: 'standard',
      isActive: true,
      gender: profile?.gender || 'male',
      avatarId: profile?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
      viralMarkers: profile?.viralMarkers,
      emergencyContact: profile?.emergencyContact,
      createdAt: target.user.registeredAt || new Date().toISOString(),
    };
  }

  await saveCloudAccounts(accounts);

  // Directly update in-memory and unified cloud database
  try {
    const patch: Partial<UnifiedCloudDatabase> = {
      accounts: [target],
    };
    if (newPatient) {
      patch.patients = [newPatient];
    }
    await mergeCloudDatabase(patch);
  } catch (err) {
    console.warn('[CloudStore] approveCloudAccount mergeCloudDatabase warning:', err);
  }

  invalidateCloudStoreCache();
  return { account: target, newPatient };
}

/**
 * Reject an account in the cloud store
 */
export async function rejectCloudAccount(
  uid: string,
  reason: string,
  reviewerName: string = 'Super Admin'
): Promise<StoredAccount | null> {
  const accounts = await getCloudAccounts({ forWrite: true });
  const target = accounts.find((a) => a.user.uid === uid);
  if (!target) return null;

  target.user.status = 'rejected';
  target.user.rejectionReason = reason;
  target.user.reviewedAt = new Date().toISOString();
  target.user.reviewedBy = reviewerName;

  await saveCloudAccounts(accounts);

  try {
    await mergeCloudDatabase({
      accounts: [target],
    });
  } catch (err) {
    console.warn('[CloudStore] rejectCloudAccount mergeCloudDatabase warning:', err);
  }

  invalidateCloudStoreCache();
  return target;
}

// ============================================================================
// FULL UNIFIED CLUSTER DATABASE (ACCOUNTS + CLINICAL DATA + REALTIME SYNC)
// ============================================================================

/**
 * Retrieve the complete unified clinical database from Vercel Blob
 */
export async function getCloudDatabase(options: StoreReadOptions = {}): Promise<UnifiedCloudDatabase> {
  if (!options.forWrite && cachedCloudDatabase && Date.now() - cachedCloudDatabase.fetchedAt < CACHE_TTL_MS) {
    return { ...cachedCloudDatabase.data };
  }

  const fallbackAccounts = await getCloudAccounts(options);
  memoryDatabase.accounts = fallbackAccounts;

  if (!isCloudStorageConfigured()) {
    if (!memoryArchivedInitialSeeded) {
      memoryArchivedInitialSeeded = true;
      if (!memoryDatabase.archivedPatients || memoryDatabase.archivedPatients.length === 0) {
        memoryDatabase.archivedPatients = INITIAL_ARCHIVED_PATIENTS.map((p) => ({
        archiveId: `arch-${p.id}`,
        id: p.id,
        patientId: p.id,
        fullName: p.fullName,
        fullNameAr: p.fullNameAr,
        phone: p.phone,
        username: p.username,
        patient: p,
        account: {
          username: p.username || '01099998888',
          phone: p.phone,
          password: 'scrypt$1$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA$a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2U',
          user: {
            uid: p.id,
            role: 'patient',
            username: p.username || '01099998888',
            phone: p.phone,
            displayName: p.fullName,
            language: 'ar',
            status: 'active',
            isArchived: true,
            reactivationStatus: p.reactivationStatus,
            createdAt: String(p.createdAt),
          },
        },
        sessions: [],
        labResults: [],
        medications: [],
        adherenceSurveys: [],
        fluidLogs: [],
        dietLogs: [],
        adherenceLogs: [],
        reminders: [],
        archivedAt: p.archivedAt || new Date().toISOString(),
        purgeAt: p.archiveExpiresAt || new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        archivedBy: p.archivedBy || 'Super Admin',
        reactivationStatus: p.reactivationStatus || 'none',
        reactivationRequestedAt: p.reactivationRequestedAt,
      }));
      }
    }
    if (!memoryDatabase.archivedPatients) {
      memoryDatabase.archivedPatients = [];
    }
    for (const demoP of INITIAL_DEMO_PATIENTS) {
      if (
        !memoryDatabase.patients.some((p) => p.id === demoP.id) &&
        !memoryDatabase.archivedPatients.some((a) => a.patient.id === demoP.id)
      ) {
        memoryDatabase.patients.push(demoP);
      }
    }
    ensurePatientsFromAccounts(memoryDatabase.accounts, memoryDatabase.patients, memoryDatabase.archivedPatients);
    if (!options.forWrite) {
      cachedCloudDatabase = { data: memoryDatabase, fetchedAt: Date.now() };
    }
    return { ...memoryDatabase };
  }

  let failed = false;
  let found = false;
  let ok = false;
  let parsed: unknown = undefined;
  try {
    const direct = await getObjectJson<unknown>(DATABASE_BLOB_PATH);
    if (direct !== null) {
      found = true;
      ok = true;
      parsed = direct;
    } else {
      found = false;
      ok = false;
    }
  } catch (error: unknown) {
    const status = (error as { $metadata?: { httpStatusCode?: number }; status?: number })?.$metadata?.httpStatusCode || (error as { status?: number })?.status;
    const name = (error as { name?: string })?.name;
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    const isNotFound = status === 404 || name === 'NotFound' || name === 'NoSuchKey' || code === 'NoSuchKey' || code === 'NotFound' || msg.includes('NoSuchKey') || msg.includes('404');
    if (isNotFound) {
      found = false;
      ok = false;
    } else {
      failed = true;
      console.warn('[CloudStore] Cloud database read failed:', msg);
    }
  }

  const decision = decideBlobRead({
    failed,
    found,
    ok,
    parsed,
    loadedBefore: databaseLoadedFromBlob,
    expect: 'object',
    forWrite: options.forWrite,
    production: isProductionStore(),
  });
  if (decision === 'throw') {
    throw new Error('[CloudStore] database store temporarily unavailable');
  }
  if (decision === 'cached') {
    memoryDatabase.accounts = fallbackAccounts;
    if (!options.forWrite) {
      cachedCloudDatabase = { data: memoryDatabase, fetchedAt: Date.now() };
    }
    return { ...memoryDatabase };
  }
  {
    if (decision === 'use') {
      {
        const raw = parsed as Partial<UnifiedCloudDatabase>;
        {
          const rawArchived: ArchivedPatientRecord[] = Array.isArray(raw.archivedPatients)
            ? raw.archivedPatients
            : [];

          // Reconcile accounts from both ACCOUNTS_BLOB_PATH and DATABASE_BLOB_PATH
          const { merged: loadedAccounts } = reconcileAccounts(
            fallbackAccounts,
            Array.isArray(raw.accounts) ? raw.accounts.map(sanitizeAccount) : []
          );

          // Seed canonical demo patients if missing from raw.patients and not archived
          const mergedPatients: Patient[] = Array.isArray(raw.patients) ? [...raw.patients] : [];
          for (const demoP of INITIAL_DEMO_PATIENTS) {
            if (
              !mergedPatients.some((p) => p.id === demoP.id) &&
              !rawArchived.some((a) => a.patient.id === demoP.id)
            ) {
              mergedPatients.push(demoP);
            }
          }

          const completeDb: UnifiedCloudDatabase = {
            accounts: loadedAccounts,
            patients: mergedPatients,
            dialysisSessions: Array.isArray(raw.dialysisSessions) ? raw.dialysisSessions : [],
            labResults: Array.isArray(raw.labResults) ? raw.labResults : [],
            medications: Array.isArray(raw.medications) ? raw.medications : [],
            notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
            adherenceLogs: Array.isArray(raw.adherenceLogs) ? raw.adherenceLogs : [],
            fluidLogs: Array.isArray(raw.fluidLogs) ? raw.fluidLogs : [],
            dietLogs: Array.isArray(raw.dietLogs) ? raw.dietLogs : [],
            adherenceSurveys: Array.isArray(raw.adherenceSurveys) ? raw.adherenceSurveys : [],
            reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
            coachingTips: Array.isArray(raw.coachingTips) ? raw.coachingTips : [],
            archivedPatients: rawArchived,
            lastUpdated: raw.lastUpdated || new Date().toISOString(),
          };

          // Guarantee that every active patient account has a record in patients
          ensurePatientsFromAccounts(completeDb.accounts, completeDb.patients, completeDb.archivedPatients);

          memoryDatabase = completeDb;
          databaseLoadedFromBlob = true;
          if (!options.forWrite) {
            cachedCloudDatabase = { data: completeDb, fetchedAt: Date.now() };
          }
          return completeDb;
        }
      }
    }

    // 'seed': the database blob does not exist yet (first run)
    const initialDb: UnifiedCloudDatabase = {
      accounts: fallbackAccounts,
      patients: [...INITIAL_DEMO_PATIENTS],
      dialysisSessions: [],
      labResults: [],
      medications: [],
      notifications: [],
      adherenceLogs: [],
      fluidLogs: [],
      dietLogs: [],
      adherenceSurveys: [],
      reminders: [],
      coachingTips: [],
      archivedPatients: [],
      lastUpdated: new Date().toISOString(),
    };
    ensurePatientsFromAccounts(initialDb.accounts, initialDb.patients, initialDb.archivedPatients);
    await saveCloudDatabase(initialDb);
    databaseLoadedFromBlob = true;
    if (!options.forWrite) {
      cachedCloudDatabase = { data: initialDb, fetchedAt: Date.now() };
    }
    return initialDb;
  }
}

/**
 * Save complete unified clinical database to Vercel Blob
 */
/**
 * B9: the database blob is a SECOND copy of the accounts. It is only used to
 * reconcile review status onto the accounts blob (getCloudDatabase), never for
 * credentials, so it must never contain a password (plaintext or hash) or
 * password metadata. Every database-blob write goes through this, so the first
 * write by anyone scrubs the legacy copies. (A missing `password` key keeps the
 * accounts-blob value during reconcile: `{...existing, ...incoming}`.)
 */
const ACCOUNT_SECRET_KEYS = ['password', 'passwordHash', 'passwordUpdatedAt'] as const;

export function stripAccountSecrets(acc: StoredAccount): StoredAccount {
  const copy = { ...acc } as StoredAccount & Record<string, unknown>;
  for (const k of ACCOUNT_SECRET_KEYS) delete copy[k];
  return copy as StoredAccount;
}

export function serializeDatabaseForBlob(db: UnifiedCloudDatabase): string {
  const accounts = Array.isArray(db.accounts) ? db.accounts.map(stripAccountSecrets) : [];
  const archivedPatients = Array.isArray(db.archivedPatients)
    ? db.archivedPatients.map((ap) => {
        if (!ap.account) return ap;
        return { ...ap, account: stripAccountSecrets(ap.account) };
      })
    : [];
  return JSON.stringify({ ...db, accounts, archivedPatients }, null, 2);
}

export async function saveCloudDatabase(db: UnifiedCloudDatabase): Promise<void> {
  invalidateCloudStoreCache();
  memoryDatabase = db;
  // Also keep accounts blob updated for backward-compatibility
  await saveCloudAccounts(db.accounts);

  if (!isCloudStorageConfigured()) {
    return;
  }

  try {
    await put(DATABASE_BLOB_PATH, serializeDatabaseForBlob(db), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    console.warn('[CloudStore] Failed to write unified database to Cloudflare R2:', error);
  }
}

/**
 * Automatically create and append Patient records for any active patient account
 */
function ensurePatientsFromAccounts(
  accounts: StoredAccount[],
  patients: Patient[],
  archivedPatients: ArchivedPatientRecord[] = []
): void {
  for (const acc of accounts) {
    if (acc.user.role === 'patient' && (acc.user.status === 'active' || !acc.user.status)) {
      const cleanPhone = (acc.phone || acc.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
      if (
        archivedPatients.some((a) => {
          if (a.patient?.id === acc.user.uid) return true;
          if (a.account && a.account.user.uid === acc.user.uid) return true;
          if (a.id === acc.user.uid || a.patientId === acc.user.uid) return true;
          if (acc.username && a.patient?.username && a.patient.username.toLowerCase() === acc.username.toLowerCase()) return true;
          if (acc.username && a.account?.username && a.account.username.toLowerCase() === acc.username.toLowerCase()) return true;
          if (cleanPhone) {
            const aPhone = (a.patient?.phone || a.phone || a.account?.phone || a.account?.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
            if (aPhone && (aPhone === cleanPhone || isPhoneMatch(aPhone, cleanPhone))) return true;
          }
          return false;
        })
      ) {
        continue;
      }
      const exists = patients.some(
        (p) =>
          p.id === acc.user.uid ||
          (p.username && p.username.toLowerCase() === acc.username.toLowerCase()) ||
          (cleanPhone && p.phone && p.phone.replace(/[\s\-\(\)\+]/g, '') === cleanPhone)
      );
      if (!exists) {
        const prof = acc.user.patientProfile;
        patients.push({
          id: acc.user.uid,
          fullName: acc.user.displayName,
          fullNameAr: acc.user.displayName,
          phone: acc.phone || acc.user.phone || acc.username,
          username: acc.username,
          dialysisSchedule: prof?.dialysisSchedule || 'SMW',
          dryWeightKg: prof?.dryWeightKg || 70,
          accessType: prof?.accessType || 'AVF',
          dialysisCenter: prof?.dialysisCenter,
          centerName: prof?.dialysisCenter,
          age: prof?.age,
          reminderSchedule: 'standard',
          isActive: true,
          gender: prof?.gender || 'male',
          avatarId: prof?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
          viralMarkers: prof?.viralMarkers,
          emergencyContact: prof?.emergencyContact,
          createdAt: acc.user.registeredAt || acc.user.createdAt || new Date().toISOString(),
        });
      }
    }
  }
}

/**
 * Merge an incoming partial or full clinical dataset into the cloud database.
 * Reconciles every single entity deterministically and non-destructively.
 */
export async function mergeCloudDatabase(
  incoming: Partial<UnifiedCloudDatabase>
): Promise<UnifiedCloudDatabase> {
  invalidateCloudStoreCache();
  const current = await getCloudDatabase({ forWrite: true });

  // 1. Merge Archived Patients FIRST so all other entities can be reconciled & isolated against it
  const mergedArchived = [...(current.archivedPatients || [])];
  if (incoming.archivedPatients && incoming.archivedPatients.length > 0) {
    for (const inc of incoming.archivedPatients) {
      const idx = mergedArchived.findIndex(
        (a) =>
          (a.archiveId && inc.archiveId && a.archiveId === inc.archiveId) ||
          (a.patient && inc.patient && a.patient.id === inc.patient.id) ||
          (a.id && inc.id && a.id === inc.id)
      );
      if (idx === -1) {
        mergedArchived.push(inc);
      } else {
        const incArchivedAt = new Date(inc.archivedAt || 0).getTime();
        const currArchivedAt = new Date(mergedArchived[idx].archivedAt || 0).getTime();
        if (incArchivedAt >= currArchivedAt) {
          mergedArchived[idx] = { ...mergedArchived[idx], ...inc };
        }
      }
    }
  }

  const isPatientArchived = (patientId?: string, username?: string, phone?: string): boolean => {
    if (!patientId && !username && !phone) return false;
    const cleanPhone = phone ? phone.replace(/[\s\-\(\)\+]/g, '') : '';
    return mergedArchived.some((a) => {
      if (patientId && (a.patient?.id === patientId || a.id === patientId || a.patientId === patientId || (a.account && a.account.user.uid === patientId))) {
        return true;
      }
      if (username) {
        const u = username.toLowerCase();
        if (a.patient?.username && a.patient.username.toLowerCase() === u) return true;
        if (a.account?.username && a.account.username.toLowerCase() === u) return true;
        if (a.username && a.username.toLowerCase() === u) return true;
      }
      if (cleanPhone) {
        const aPhone = (a.patient?.phone || a.phone || a.account?.phone || a.account?.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
        if (aPhone && (aPhone === cleanPhone || isPhoneMatch(aPhone, cleanPhone))) return true;
      }
      return false;
    });
  };

  const getArchivedRecordForPatient = (patientId?: string): ArchivedPatientRecord | undefined => {
    if (!patientId) return undefined;
    return mergedArchived.find((a) => a.patient?.id === patientId || a.id === patientId || a.patientId === patientId || (a.account && a.account.user.uid === patientId));
  };

  // 2. Merge Accounts (filter out archived accounts so they never resurrect into active state)
  const nonArchivedIncomingAccounts = (incoming.accounts || []).filter(
    (acc) => !isPatientArchived(acc.user?.uid, acc.username, acc.phone || acc.user?.phone)
  );
  if (incoming.accounts && incoming.accounts.length > 0) {
    for (const incAcc of incoming.accounts) {
      if (isPatientArchived(incAcc.user?.uid, incAcc.username, incAcc.phone || incAcc.user?.phone)) {
        const archRec = getArchivedRecordForPatient(incAcc.user?.uid);
        if (archRec && (!archRec.account || incAcc.user?.patientProfile)) {
          archRec.account = { ...(archRec.account || incAcc), ...incAcc };
        }
      }
    }
  }

  const mergedAccounts = nonArchivedIncomingAccounts.length > 0
    ? (await mergeCloudAccounts(nonArchivedIncomingAccounts)).filter(
        (a) => !isPatientArchived(a.user?.uid, a.username, a.phone || a.user?.phone)
      )
    : current.accounts.filter(
        (a) => !isPatientArchived(a.user?.uid, a.username, a.phone || a.user?.phone)
      );

  // 3. Merge Patients
  const mergedPatients = current.patients.filter(
    (p) => !isPatientArchived(p.id, p.username, p.phone)
  );
  for (const demoP of INITIAL_DEMO_PATIENTS) {
    if (!mergedPatients.some((p) => p.id === demoP.id) && !isPatientArchived(demoP.id, demoP.username, demoP.phone)) {
      mergedPatients.push(demoP);
    }
  }
  if (incoming.patients && incoming.patients.length > 0) {
    for (const inc of incoming.patients) {
      if (isPatientArchived(inc.id, inc.username, inc.phone)) {
        continue;
      }
      const cleanIncPhone = (inc.phone || '').replace(/[\s\-\(\)\+]/g, '');
      let idx = inc.id ? mergedPatients.findIndex((p) => p.id === inc.id) : -1;
      if (idx === -1) {
        idx = mergedPatients.findIndex(
          (p) =>
            (p.username && inc.username && p.username.toLowerCase() === inc.username.toLowerCase()) ||
            (cleanIncPhone && p.phone && p.phone.replace(/[\s\-\(\)\+]/g, '') === cleanIncPhone)
        );
      }
      if (idx === -1) {
        mergedPatients.push(inc);
      } else {
        mergedPatients[idx] = {
          ...mergedPatients[idx],
          ...inc,
          fullName: inc.fullName || mergedPatients[idx].fullName,
          fullNameAr: inc.fullNameAr || mergedPatients[idx].fullNameAr || inc.fullName,
          dryWeightKg: inc.dryWeightKg || mergedPatients[idx].dryWeightKg,
          dialysisSchedule: inc.dialysisSchedule || mergedPatients[idx].dialysisSchedule,
          accessType: inc.accessType || mergedPatients[idx].accessType,
        };
      }
    }
  }

  // 4. Merge Dialysis Sessions (divert archived to archive record)
  const mergedSessions = current.dialysisSessions.filter((s) => !isPatientArchived(s.patientId));
  if (incoming.dialysisSessions && incoming.dialysisSessions.length > 0) {
    for (const inc of incoming.dialysisSessions) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.sessions)) arch.sessions = [];
          const sIdx = arch.sessions.findIndex((s) => s.id === inc.id);
          if (sIdx === -1) arch.sessions.push(inc);
          else arch.sessions[sIdx] = { ...arch.sessions[sIdx], ...inc };
        }
        continue;
      }
      const idx = mergedSessions.findIndex((s) => s.id === inc.id);
      if (idx === -1) {
        mergedSessions.push(inc);
      } else {
        const incTime = new Date(inc.recordedAt || inc.sessionDate).getTime();
        const currTime = new Date(mergedSessions[idx].recordedAt || mergedSessions[idx].sessionDate).getTime();
        if (incTime >= currTime) {
          mergedSessions[idx] = { ...mergedSessions[idx], ...inc };
        }
      }
    }
  }

  // 5. Merge Lab Results (divert archived to archive record)
  const mergedLabs = current.labResults.filter((l) => !isPatientArchived(l.patientId));
  if (incoming.labResults && incoming.labResults.length > 0) {
    for (const inc of incoming.labResults) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.labResults)) arch.labResults = [];
          const lIdx = arch.labResults.findIndex((l) => l.id === inc.id);
          if (lIdx === -1) arch.labResults.push(inc);
          else arch.labResults[lIdx] = { ...arch.labResults[lIdx], ...inc };
        }
        continue;
      }
      const idx = mergedLabs.findIndex((l) => l.id === inc.id);
      if (idx === -1) {
        mergedLabs.push(inc);
      } else {
        mergedLabs[idx] = { ...mergedLabs[idx], ...inc };
      }
    }
  }

  // 6. Merge Medications (divert archived to archive record)
  const mergedMeds = current.medications.filter((m) => !isPatientArchived(m.patientId));
  if (incoming.medications && incoming.medications.length > 0) {
    for (const inc of incoming.medications) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.medications)) arch.medications = [];
          const mIdx = arch.medications.findIndex((m) => m.id === inc.id);
          if (mIdx === -1) arch.medications.push(inc);
          else arch.medications[mIdx] = { ...arch.medications[mIdx], ...inc };
        }
        continue;
      }
      const idx = mergedMeds.findIndex((m) => m.id === inc.id);
      if (idx === -1) {
        mergedMeds.push(inc);
      } else {
        mergedMeds[idx] = { ...mergedMeds[idx], ...inc };
      }
    }
  }

  // 7. Merge Notifications (by id, read status propagates)
  const mergedNotifs = [...current.notifications];
  if (incoming.notifications && incoming.notifications.length > 0) {
    for (const inc of incoming.notifications) {
      const idx = mergedNotifs.findIndex((n) => n.id === inc.id);
      if (idx === -1) {
        mergedNotifs.push(inc);
      } else {
        const statusPriority: Record<string, number> = { read: 3, dismissed: 2, unread: 1 };
        const currStatus = mergedNotifs[idx].status || 'unread';
        const incStatus = inc.status || 'unread';
        const bestStatus = (statusPriority[incStatus] || 0) >= (statusPriority[currStatus] || 0)
          ? incStatus
          : currStatus;
        mergedNotifs[idx] = {
          ...mergedNotifs[idx],
          ...inc,
          status: bestStatus,
        };
      }
    }
  }

  // 8. Merge Adherence Logs (divert archived to archive record)
  const mergedAdherence = current.adherenceLogs.filter((a) => !isPatientArchived(a.patientId));
  if (incoming.adherenceLogs && incoming.adherenceLogs.length > 0) {
    for (const inc of incoming.adherenceLogs) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.adherenceLogs)) arch.adherenceLogs = [];
          const exists = arch.adherenceLogs.some(
            (a) => (a.id && inc.id && a.id === inc.id) || (a.type === inc.type && String(a.loggedAt) === String(inc.loggedAt))
          );
          if (!exists) arch.adherenceLogs.push(inc);
        }
        continue;
      }
      const exists = mergedAdherence.some(
        (a) =>
          (a.id && inc.id && a.id === inc.id) ||
          (a.patientId === inc.patientId &&
            a.type === inc.type &&
            String(a.loggedAt) === String(inc.loggedAt))
      );
      if (!exists) {
        mergedAdherence.push(inc);
      }
    }
  }

  // 9. Merge Fluid Logs (divert archived to archive record)
  const mergedFluid = current.fluidLogs.filter((f) => !isPatientArchived(f.patientId));
  if (incoming.fluidLogs && incoming.fluidLogs.length > 0) {
    for (const inc of incoming.fluidLogs) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.fluidLogs)) arch.fluidLogs = [];
          const exists = arch.fluidLogs.some(
            (f) => (f.id && inc.id && f.id === inc.id) || (String(f.loggedAt) === String(inc.loggedAt) && f.amountMl === inc.amountMl)
          );
          if (!exists) arch.fluidLogs.push(inc);
        }
        continue;
      }
      const exists = mergedFluid.some(
        (f) =>
          (f.id && inc.id && f.id === inc.id) ||
          (f.patientId === inc.patientId &&
            String(f.loggedAt) === String(inc.loggedAt) &&
            f.amountMl === inc.amountMl)
      );
      if (!exists) {
        mergedFluid.push(inc);
      }
    }
  }

  // 10. Merge Diet Logs (divert archived to archive record)
  const mergedDiet = current.dietLogs.filter((d) => !isPatientArchived(d.patientId));
  if (incoming.dietLogs && incoming.dietLogs.length > 0) {
    for (const inc of incoming.dietLogs) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.dietLogs)) arch.dietLogs = [];
          const exists = arch.dietLogs.some(
            (d) => (d.id && inc.id && d.id === inc.id) || (String(d.loggedAt) === String(inc.loggedAt) && d.mealType === inc.mealType)
          );
          if (!exists) arch.dietLogs.push(inc);
        }
        continue;
      }
      const exists = mergedDiet.some(
        (d) =>
          (d.id && inc.id && d.id === inc.id) ||
          (d.patientId === inc.patientId &&
            String(d.loggedAt) === String(inc.loggedAt) &&
            d.mealType === inc.mealType)
      );
      if (!exists) {
        mergedDiet.push(inc);
      }
    }
  }

  // 11. Merge Adherence Surveys (divert archived to archive record)
  const mergedSurveys = current.adherenceSurveys.filter((s) => !isPatientArchived(s.patientId));
  if (incoming.adherenceSurveys && incoming.adherenceSurveys.length > 0) {
    for (const inc of incoming.adherenceSurveys) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.adherenceSurveys)) arch.adherenceSurveys = [];
          const exists = arch.adherenceSurveys.some(
            (s) => (s.id && inc.id && s.id === inc.id) || s.submittedAt === inc.submittedAt
          );
          if (!exists) arch.adherenceSurveys.push(inc);
        }
        continue;
      }
      const exists = mergedSurveys.some(
        (s) =>
          (s.id && inc.id && s.id === inc.id) ||
          (s.patientId === inc.patientId && s.submittedAt === inc.submittedAt)
      );
      if (!exists) {
        mergedSurveys.push(inc);
      }
    }
  }

  // 12. Merge Reminders (divert archived to archive record)
  const mergedReminders = current.reminders.filter((r) => !isPatientArchived(r.patientId));
  if (incoming.reminders && incoming.reminders.length > 0) {
    for (const inc of incoming.reminders) {
      if (isPatientArchived(inc.patientId)) {
        const arch = getArchivedRecordForPatient(inc.patientId);
        if (arch) {
          if (!Array.isArray(arch.reminders)) arch.reminders = [];
          const rIdx = arch.reminders.findIndex((r) => r.id === inc.id);
          if (rIdx === -1) arch.reminders.push(inc);
          else arch.reminders[rIdx] = { ...arch.reminders[rIdx], ...inc };
        }
        continue;
      }
      const idx = mergedReminders.findIndex((r) => r.id === inc.id);
      if (idx === -1) {
        mergedReminders.push(inc);
      } else {
        mergedReminders[idx] = { ...mergedReminders[idx], ...inc };
      }
    }
  }

  // 13. Merge Coaching Tips (by id)
  const mergedTips = [...current.coachingTips];
  if (incoming.coachingTips && incoming.coachingTips.length > 0) {
    for (const inc of incoming.coachingTips) {
      const idx = mergedTips.findIndex((t) => t.id === inc.id);
      if (idx === -1) {
        mergedTips.push(inc);
      } else {
        mergedTips[idx] = { ...mergedTips[idx], ...inc };
      }
    }
  }

  // Ensure active patients collection does not contain any archived patients
  const activePatients = mergedPatients.filter(
    (p) => !isPatientArchived(p.id, p.username, p.phone)
  );

  ensurePatientsFromAccounts(mergedAccounts, activePatients, mergedArchived);

  const updatedDatabase: UnifiedCloudDatabase = {
    accounts: mergedAccounts,
    patients: activePatients,
    dialysisSessions: mergedSessions,
    labResults: mergedLabs,
    medications: mergedMeds,
    notifications: mergedNotifs,
    adherenceLogs: mergedAdherence,
    fluidLogs: mergedFluid,
    dietLogs: mergedDiet,
    adherenceSurveys: mergedSurveys,
    reminders: mergedReminders,
    coachingTips: mergedTips,
    archivedPatients: mergedArchived,
    lastUpdated: new Date().toISOString(),
  };

  await saveCloudDatabase(updatedDatabase);
  return updatedDatabase;
}

// ============================================================================
// SUPER ADMIN PATIENT ARCHIVE & 14-DAY RETENTION ENGINE
// ============================================================================

/**
 * Archive one or more patients by ID.
 * Extracts the patients, matching accounts, dialysisSessions, labResults,
 * medications, adherenceSurveys, fluidLogs, dietLogs, adherenceLogs, reminders.
 * Creates ArchivedPatientRecord with 14-day purge TTL, removes items from active arrays,
 * and saves to unified database.
 */
export async function archivePatients(
  patientIds: string[],
  reviewerName: string = 'Super Admin'
): Promise<{ archivedCount: number; archivedPatients?: ArchivedPatientRecord[] }> {
  invalidateCloudStoreCache();
  if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
    return { archivedCount: 0, archivedPatients: [] };
  }

  const db = await getCloudDatabase({ forWrite: true });
  if (!db.archivedPatients) {
    db.archivedPatients = [];
  }

  const targetIdSet = new Set(patientIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean));
  let count = 0;
  const newlyArchived: ArchivedPatientRecord[] = [];

  for (const patientId of targetIdSet) {
    const cleanTargetPhone = patientId.replace(/[\s\-\(\)\+]/g, '');
    const alreadyArchived = db.archivedPatients.some((a) => {
      if (a.patient?.id === patientId || a.archiveId === patientId || a.id === patientId || a.patientId === patientId) return true;
      if (a.account && a.account.user.uid === patientId) return true;
      if (a.patient?.username && a.patient.username.toLowerCase() === patientId.toLowerCase()) return true;
      if (cleanTargetPhone) {
        const pPhone = (a.patient?.phone || a.phone || a.account?.phone || a.account?.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
        if (pPhone && (pPhone === cleanTargetPhone || isPhoneMatch(pPhone, patientId))) return true;
      }
      return false;
    });

    if (alreadyArchived) {
      continue;
    }

    const patientIndex = db.patients.findIndex((p) => {
      if (p.id === patientId) return true;
      if (p.username && p.username.toLowerCase() === patientId.toLowerCase()) return true;
      if (cleanTargetPhone) {
        const pPhone = (p.phone || '').replace(/[\s\-\(\)\+]/g, '');
        if (pPhone && (pPhone === cleanTargetPhone || isPhoneMatch(pPhone, patientId))) return true;
      }
      return false;
    });

    let patient: Patient | undefined;

    if (patientIndex >= 0) {
      patient = db.patients[patientIndex];
      db.patients.splice(patientIndex, 1);
    } else {
      const acc = db.accounts.find((a) => {
        if (a.user.uid === patientId) return true;
        if (a.username && a.username.toLowerCase() === patientId.toLowerCase()) return true;
        if (cleanTargetPhone) {
          const aPhone = (a.phone || a.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
          if (aPhone && (aPhone === cleanTargetPhone || isPhoneMatch(aPhone, patientId))) return true;
        }
        return false;
      });
      if (acc) {
        const prof = acc.user.patientProfile;
        patient = {
          id: acc.user.uid,
          fullName: acc.user.displayName,
          fullNameAr: acc.user.displayName,
          phone: acc.phone || acc.user.phone || acc.username,
          username: acc.username,
          dialysisSchedule: prof?.dialysisSchedule || 'SMW',
          dryWeightKg: prof?.dryWeightKg || 70,
          accessType: prof?.accessType || 'AVF',
          dialysisCenter: prof?.dialysisCenter,
          centerName: prof?.dialysisCenter,
          age: prof?.age,
          reminderSchedule: 'standard',
          isActive: false,
          gender: prof?.gender || 'male',
          avatarId: prof?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
          viralMarkers: prof?.viralMarkers,
          emergencyContact: prof?.emergencyContact,
          createdAt: acc.user.registeredAt || acc.user.createdAt || new Date().toISOString(),
        };
      }
    }

    if (!patient) {
      continue;
    }

    const now = new Date();
    const archivedAt = now.toISOString();
    const purgeAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    patient.isActive = false;
    patient.isArchived = true;
    patient.archivedAt = archivedAt;
    patient.archivedBy = reviewerName;
    patient.archiveExpiresAt = purgeAt;
    patient.reactivationStatus = 'none';

    // Extract matching accounts (remove all copies from db.accounts)
    const cleanPatientPhone = (patient.phone || '').replace(/[\s\-\(\)\+]/g, '');
    const accIndices: number[] = [];
    db.accounts.forEach((a, idx) => {
      const aCleanPhone = (a.phone || a.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
      if (
        a.user.uid === patient!.id ||
        (patient!.username && a.username && a.username.toLowerCase() === patient!.username.toLowerCase()) ||
        (cleanPatientPhone && aCleanPhone && (cleanPatientPhone === aCleanPhone || isPhoneMatch(a.phone || a.user?.phone || '', patient!.phone || '')))
      ) {
        accIndices.push(idx);
      }
    });

    let account: StoredAccount | undefined;
    for (let i = accIndices.length - 1; i >= 0; i--) {
      const idx = accIndices[i];
      const extracted = db.accounts.splice(idx, 1)[0];
      if (!account) account = extracted;
    }

    if (account) {
      account.user.isArchived = true;
      account.user.archivedAt = archivedAt;
      account.user.archivedBy = reviewerName;
      account.user.archiveExpiresAt = purgeAt;
      account.user.reactivationStatus = 'none';
    }

    // Extract clinical collections
    const sessions = db.dialysisSessions.filter((s) => s.patientId === patient!.id);
    db.dialysisSessions = db.dialysisSessions.filter((s) => s.patientId !== patient!.id);

    const labResults = db.labResults.filter((l) => l.patientId === patient!.id);
    db.labResults = db.labResults.filter((l) => l.patientId !== patient!.id);

    const medications = db.medications.filter((m) => m.patientId === patient!.id);
    db.medications = db.medications.filter((m) => m.patientId !== patient!.id);

    const adherenceSurveys = db.adherenceSurveys.filter((s) => s.patientId === patient!.id);
    db.adherenceSurveys = db.adherenceSurveys.filter((s) => s.patientId !== patient!.id);

    const fluidLogs = db.fluidLogs.filter((f) => f.patientId === patient!.id);
    db.fluidLogs = db.fluidLogs.filter((f) => f.patientId !== patient!.id);

    const dietLogs = db.dietLogs.filter((d) => d.patientId === patient!.id);
    db.dietLogs = db.dietLogs.filter((d) => d.patientId !== patient!.id);

    const adherenceLogs = db.adherenceLogs.filter((a) => a.patientId === patient!.id);
    db.adherenceLogs = db.adherenceLogs.filter((a) => a.patientId !== patient!.id);

    const reminders = db.reminders.filter((r) => r.patientId === patient!.id);
    db.reminders = db.reminders.filter((r) => r.patientId !== patient!.id);

    const record: ArchivedPatientRecord = {
      archiveId: `arch_${patient.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      id: patient.id,
      patientId: patient.id,
      fullName: patient.fullName,
      fullNameAr: patient.fullNameAr || patient.fullName,
      phone: patient.phone,
      username: patient.username,
      patient,
      account,
      sessions,
      labResults,
      medications,
      adherenceSurveys,
      fluidLogs,
      dietLogs,
      adherenceLogs,
      reminders,
      archivedAt,
      purgeAt,
      archivedBy: reviewerName,
      reactivationStatus: 'none',
    };

    db.archivedPatients.push(record);
    newlyArchived.push(record);
    count++;
  }

  if (count > 0) {
    await saveCloudDatabase(db);
  }

  return { archivedCount: count, archivedPatients: newlyArchived };
}

/**
 * Restore an archived patient back into active collections.
 * Moves the archived record and all its historical clinical records back into active arrays,
 * sets account user.status = 'active', user.reviewedBy = reviewerName, user.reviewedAt = now.toISOString(),
 * removes the record from archivedPatients, and saves to database.
 */
export async function restoreArchivedPatient(
  patientId: string,
  reviewerName: string = 'Super Admin'
): Promise<{ success: boolean; patient?: Patient; account?: StoredAccount }> {
  invalidateCloudStoreCache();
  const db = await getCloudDatabase({ forWrite: true });
  if (!db.archivedPatients || db.archivedPatients.length === 0) {
    return { success: false };
  }

  const cleanTarget = patientId.trim();
  const cleanTargetPhone = cleanTarget.replace(/[\s\-\(\)\+]/g, '');

  const recordIndex = db.archivedPatients.findIndex((a) => {
    if (a.patient?.id === cleanTarget || a.archiveId === cleanTarget || a.id === cleanTarget || a.patientId === cleanTarget) {
      return true;
    }
    if (a.account && a.account.user.uid === cleanTarget) {
      return true;
    }
    if (a.patient?.username && a.patient.username.toLowerCase() === cleanTarget.toLowerCase()) {
      return true;
    }
    if (cleanTargetPhone) {
      const pPhone = (a.patient?.phone || a.phone || a.account?.phone || a.account?.user?.phone || '').replace(/[\s\-\(\)\+]/g, '');
      if (pPhone && (pPhone === cleanTargetPhone || isPhoneMatch(pPhone, cleanTarget))) return true;
    }
    return false;
  });

  if (recordIndex === -1) {
    return { success: false };
  }

  const [record] = db.archivedPatients.splice(recordIndex, 1);

  // Restore Patient
  const patient: Patient = {
    ...record.patient,
    isActive: true,
    isArchived: false,
    archivedAt: undefined,
    archiveExpiresAt: undefined,
    archivedBy: undefined,
    reactivationStatus: undefined,
    reactivationRequestedAt: undefined,
  };
  const existingPIndex = db.patients.findIndex((p) => p.id === patient.id);
  if (existingPIndex >= 0) {
    db.patients[existingPIndex] = patient;
  } else {
    db.patients.push(patient);
  }

  // Restore Account if present
  let restoredAcc: StoredAccount | undefined;
  if (record.account) {
    const acc: StoredAccount = {
      ...record.account,
      user: {
        ...record.account.user,
        status: 'active',
        isArchived: false,
        archivedAt: undefined,
        archiveExpiresAt: undefined,
        archivedBy: undefined,
        reactivationStatus: undefined,
        reactivationRequestedAt: undefined,
        reviewedBy: reviewerName,
        reviewedAt: new Date().toISOString(),
      },
    };
    restoredAcc = acc;
    const existingAccIndex = db.accounts.findIndex(
      (a) =>
        a.user.uid === acc.user.uid ||
        (acc.username && a.username.toLowerCase() === acc.username.toLowerCase())
    );
    if (existingAccIndex >= 0) {
      db.accounts[existingAccIndex] = acc;
    } else {
      db.accounts.push(acc);
    }
  }

  // Restore Dialysis Sessions
  if (Array.isArray(record.sessions)) {
    for (const s of record.sessions) {
      if (!db.dialysisSessions.some((existing) => existing.id === s.id)) {
        db.dialysisSessions.push(s);
      }
    }
  }

  // Restore Lab Results
  if (Array.isArray(record.labResults)) {
    for (const l of record.labResults) {
      if (!db.labResults.some((existing) => existing.id === l.id)) {
        db.labResults.push(l);
      }
    }
  }

  // Restore Medications
  if (Array.isArray(record.medications)) {
    for (const m of record.medications) {
      if (!db.medications.some((existing) => existing.id === m.id)) {
        db.medications.push(m);
      }
    }
  }

  // Restore Adherence Surveys
  if (Array.isArray(record.adherenceSurveys)) {
    for (const s of record.adherenceSurveys) {
      if (!db.adherenceSurveys.some((existing) => existing.id === s.id)) {
        db.adherenceSurveys.push(s);
      }
    }
  }

  // Restore Fluid Logs
  if (Array.isArray(record.fluidLogs)) {
    for (const f of record.fluidLogs) {
      if (!db.fluidLogs.some((existing) => existing.id === f.id)) {
        db.fluidLogs.push(f);
      }
    }
  }

  // Restore Diet Logs
  if (Array.isArray(record.dietLogs)) {
    for (const d of record.dietLogs) {
      if (!db.dietLogs.some((existing) => existing.id === d.id)) {
        db.dietLogs.push(d);
      }
    }
  }

  // Restore Adherence Logs
  if (Array.isArray(record.adherenceLogs)) {
    for (const a of record.adherenceLogs) {
      if (!db.adherenceLogs.some((existing) => existing.id === a.id)) {
        db.adherenceLogs.push(a);
      }
    }
  }

  // Restore Reminders
  if (Array.isArray(record.reminders)) {
    for (const r of record.reminders) {
      if (!db.reminders.some((existing) => existing.id === r.id)) {
        db.reminders.push(r);
      }
    }
  }

  await saveCloudDatabase(db);
  return { success: true, patient, account: restoredAcc };
}

export const restorePatient = restoreArchivedPatient;

/**
 * Permanently purges archived patient records whose 14-day retention TTL has expired.
 * Filters out records where new Date(item.purgeAt).getTime() <= now.getTime().
 * Returns count of permanently deleted records.
 */
export async function purgeExpiredArchivedPatients(now: Date = new Date()): Promise<number> {
  invalidateCloudStoreCache();
  const db = await getCloudDatabase({ forWrite: true });
  if (!db.archivedPatients || db.archivedPatients.length === 0) {
    invalidateCloudStoreCache();
    return 0;
  }

  const nowMs = now.getTime();
  const initialCount = db.archivedPatients.length;
  const kept = db.archivedPatients.filter((item) => {
    const purgeTime = new Date(item.purgeAt || item.patient?.archiveExpiresAt || 0).getTime();
    if (Number.isNaN(purgeTime) || purgeTime === 0) {
      if (item.archivedAt) {
        const archTime = new Date(item.archivedAt).getTime();
        if (!Number.isNaN(archTime) && nowMs - archTime < 14 * 24 * 60 * 60 * 1000) {
          return true;
        }
      }
      return false;
    }
    return purgeTime > nowMs;
  });

  const purgedCount = initialCount - kept.length;
  if (purgedCount > 0) {
    db.archivedPatients = kept;
    await saveCloudDatabase(db);
  }
  invalidateCloudStoreCache();
  return purgedCount;
}

/**
 * Retrieve unexpired archived patient records.
 * Automatically runs purgeExpiredArchivedPatients() first, then returns unexpired records.
 */
export async function getArchivedPatients(): Promise<ArchivedPatientRecord[]> {
  await purgeExpiredArchivedPatients();
  const db = await getCloudDatabase();
  return db.archivedPatients || [];
}

/**
 * Find an unexpired archived patient record matching phone number.
 */
export async function findUnexpiredArchivedPatientByPhone(
  phone: string
): Promise<ArchivedPatientRecord | null> {
  const archived = await getArchivedPatients();
  const cleanInput = phone.replace(/[\s\-\(\)\+]/g, '');
  if (!cleanInput) return null;

  for (const record of archived) {
    const purgeTime = new Date(record.purgeAt).getTime();
    if (!Number.isNaN(purgeTime) && purgeTime <= Date.now()) {
      continue;
    }

    const recPhone =
      record.patient?.phone ||
      record.patient?.username ||
      record.phone ||
      record.username ||
      record.account?.phone ||
      record.account?.username ||
      record.account?.user?.phone;
    if (recPhone) {
      if (isPhoneMatch(recPhone, phone)) {
        return record;
      }
      const cleanRec = recPhone.replace(/[\s\-\(\)\+]/g, '');
      if (cleanRec === cleanInput) {
        return record;
      }
      if (cleanRec.length >= 9 && cleanInput.length >= 9) {
        if (cleanRec.endsWith(cleanInput) || cleanInput.endsWith(cleanRec)) {
          return record;
        }
      }
    }
  }
  return null;
}

/**
 * Update an archived patient record in the database.
 */
export async function updateArchivedPatient(
  updatedRecord: ArchivedPatientRecord
): Promise<void> {
  const db = await getCloudDatabase({ forWrite: true });
  if (!db.archivedPatients) db.archivedPatients = [];
  const idx = db.archivedPatients.findIndex(
    (a) =>
      a.archiveId === updatedRecord.archiveId ||
      a.patient.id === updatedRecord.patient.id ||
      (a.id && updatedRecord.id && a.id === updatedRecord.id)
  );
  if (idx >= 0) {
    db.archivedPatients[idx] = updatedRecord;
  } else {
    db.archivedPatients.push(updatedRecord);
  }
  await saveCloudDatabase(db);
}
