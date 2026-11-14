import { put, list } from '@vercel/blob';
import type {
  StoredAccount,
  Patient,
  UnifiedCloudDatabase,
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
  getAdminPassword,
} from './data-store';

export type { UnifiedCloudDatabase };

const ACCOUNTS_BLOB_PATH = 'dialycare_cloud_accounts.json';
const DATABASE_BLOB_PATH = 'dialycare_cloud_database_v1.json';

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
  lastUpdated: new Date().toISOString(),
};

function sanitizeAccount(acc: StoredAccount): StoredAccount {
  const isSuperAdmin = acc.username.toLowerCase() === 'admin' || acc.user.role === 'admin';
  return {
    ...acc,
    user: {
      ...acc.user,
      role: isSuperAdmin ? 'admin' : acc.user.role,
      status: isSuperAdmin ? 'active' : (acc.user.status || 'active'),
    },
  };
}

/**
 * Retrieve all registered accounts from the cloud store (Vercel Blob)
 * with robust in-memory fallback.
 */
export async function getCloudAccounts(): Promise<StoredAccount[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    return memoryAccounts.map(sanitizeAccount);
  }
  try {
    const { blobs } = await list({ prefix: ACCOUNTS_BLOB_PATH });
    const found = blobs.find((b) => b.pathname === ACCOUNTS_BLOB_PATH);
    const targetUrl = found ? found.url : null;

    if (targetUrl) {
      // Append cache buster to always fetch the freshest copy
      const res = await fetch(`${targetUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const sanitized = raw.map(sanitizeAccount);
          memoryAccounts = sanitized;
          return sanitized;
        }
      }
    }

    // If blob not found yet, seed it with initial accounts
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
    return initialAccounts;
  } catch (error) {
    console.warn('[CloudStore] Vercel Blob fetch failed, using fallback memory accounts:', error);
    return memoryAccounts.map(sanitizeAccount);
  }
}

/**
 * Overwrite accounts in Vercel Blob
 */
export async function saveCloudAccounts(accounts: StoredAccount[]): Promise<void> {
  const sanitized = accounts.map(sanitizeAccount);
  memoryAccounts = sanitized;

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    return;
  }

  try {
    await put(ACCOUNTS_BLOB_PATH, JSON.stringify(sanitized, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    console.warn('[CloudStore] Failed to write accounts to Vercel Blob:', error);
  }
}

/**
 * Add or update an account in the cloud store
 */
export async function upsertCloudAccount(account: StoredAccount): Promise<StoredAccount[]> {
  const accounts = await getCloudAccounts();
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
        result[idx] = sanitizeAccount({
          ...existing,
          ...inc,
          user: {
            ...existing.user,
            ...inc.user,
            patientProfile: inc.user.patientProfile || existing.user.patientProfile,
          },
        });
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
  const currentAccounts = await getCloudAccounts();
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
  const accounts = await getCloudAccounts();
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
  const accounts = await getCloudAccounts();
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

  return target;
}

// ============================================================================
// FULL UNIFIED CLUSTER DATABASE (ACCOUNTS + CLINICAL DATA + REALTIME SYNC)
// ============================================================================

/**
 * Retrieve the complete unified clinical database from Vercel Blob
 */
export async function getCloudDatabase(): Promise<UnifiedCloudDatabase> {
  const fallbackAccounts = await getCloudAccounts();
  memoryDatabase.accounts = fallbackAccounts;

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    for (const demoP of INITIAL_DEMO_PATIENTS) {
      if (!memoryDatabase.patients.some((p) => p.id === demoP.id)) {
        memoryDatabase.patients.push(demoP);
      }
    }
    ensurePatientsFromAccounts(memoryDatabase.accounts, memoryDatabase.patients);
    return memoryDatabase;
  }

  try {
    const { blobs } = await list({ prefix: DATABASE_BLOB_PATH });
    const found = blobs.find((b) => b.pathname === DATABASE_BLOB_PATH);
    const targetUrl = found ? found.url : null;

    if (targetUrl) {
      const res = await fetch(`${targetUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const raw = (await res.json()) as Partial<UnifiedCloudDatabase>;
        if (raw && typeof raw === 'object') {
          // Reconcile accounts from both ACCOUNTS_BLOB_PATH and DATABASE_BLOB_PATH
          const { merged: loadedAccounts } = reconcileAccounts(
            fallbackAccounts,
            Array.isArray(raw.accounts) ? raw.accounts.map(sanitizeAccount) : []
          );

          // Seed canonical demo patients if missing from raw.patients
          const mergedPatients: Patient[] = Array.isArray(raw.patients) ? [...raw.patients] : [];
          for (const demoP of INITIAL_DEMO_PATIENTS) {
            if (!mergedPatients.some((p) => p.id === demoP.id)) {
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
            lastUpdated: raw.lastUpdated || new Date().toISOString(),
          };

          // Guarantee that every active patient account has a record in patients
          ensurePatientsFromAccounts(completeDb.accounts, completeDb.patients);

          memoryDatabase = completeDb;
          return completeDb;
        }
      }
    }

    // Seed database if not existing yet
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
      lastUpdated: new Date().toISOString(),
    };
    ensurePatientsFromAccounts(initialDb.accounts, initialDb.patients);
    await saveCloudDatabase(initialDb);
    return initialDb;
  } catch (error) {
    console.warn('[CloudStore] Vercel Blob getCloudDatabase failed, using memory fallback:', error);
    for (const demoP of INITIAL_DEMO_PATIENTS) {
      if (!memoryDatabase.patients.some((p) => p.id === demoP.id)) {
        memoryDatabase.patients.push(demoP);
      }
    }
    ensurePatientsFromAccounts(memoryDatabase.accounts, memoryDatabase.patients);
    return memoryDatabase;
  }
}

/**
 * Save complete unified clinical database to Vercel Blob
 */
export async function saveCloudDatabase(db: UnifiedCloudDatabase): Promise<void> {
  memoryDatabase = db;
  // Also keep accounts blob updated for backward-compatibility
  await saveCloudAccounts(db.accounts);

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    return;
  }

  try {
    await put(DATABASE_BLOB_PATH, JSON.stringify(db, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    console.warn('[CloudStore] Failed to write unified database to Vercel Blob:', error);
  }
}

/**
 * Automatically create and append Patient records for any active patient account
 */
function ensurePatientsFromAccounts(accounts: StoredAccount[], patients: Patient[]): void {
  for (const acc of accounts) {
    if (acc.user.role === 'patient' && (acc.user.status === 'active' || !acc.user.status)) {
      const cleanPhone = (acc.phone || acc.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
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
  const current = await getCloudDatabase();

  // 1. Merge Accounts
  const mergedAccounts = incoming.accounts && incoming.accounts.length > 0
    ? await mergeCloudAccounts(incoming.accounts)
    : current.accounts;

  // 2. Merge Patients
  const mergedPatients = [...current.patients];
  for (const demoP of INITIAL_DEMO_PATIENTS) {
    if (!mergedPatients.some((p) => p.id === demoP.id)) {
      mergedPatients.push(demoP);
    }
  }
  if (incoming.patients && incoming.patients.length > 0) {
    for (const inc of incoming.patients) {
      const cleanIncPhone = (inc.phone || '').replace(/[\s\-\(\)\+]/g, '');
      const idx = mergedPatients.findIndex(
        (p) =>
          (p.id && inc.id && p.id === inc.id) ||
          (p.username && inc.username && p.username.toLowerCase() === inc.username.toLowerCase()) ||
          (cleanIncPhone && p.phone && p.phone.replace(/[\s\-\(\)\+]/g, '') === cleanIncPhone)
      );
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
  ensurePatientsFromAccounts(mergedAccounts, mergedPatients);

  // 3. Merge Dialysis Sessions (by id, latest recordedAt wins)
  const mergedSessions = [...current.dialysisSessions];
  if (incoming.dialysisSessions && incoming.dialysisSessions.length > 0) {
    for (const inc of incoming.dialysisSessions) {
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

  // 4. Merge Lab Results (by id)
  const mergedLabs = [...current.labResults];
  if (incoming.labResults && incoming.labResults.length > 0) {
    for (const inc of incoming.labResults) {
      const idx = mergedLabs.findIndex((l) => l.id === inc.id);
      if (idx === -1) {
        mergedLabs.push(inc);
      } else {
        mergedLabs[idx] = { ...mergedLabs[idx], ...inc };
      }
    }
  }

  // 5. Merge Medications (by id)
  const mergedMeds = [...current.medications];
  if (incoming.medications && incoming.medications.length > 0) {
    for (const inc of incoming.medications) {
      const idx = mergedMeds.findIndex((m) => m.id === inc.id);
      if (idx === -1) {
        mergedMeds.push(inc);
      } else {
        mergedMeds[idx] = { ...mergedMeds[idx], ...inc };
      }
    }
  }

  // 6. Merge Notifications (by id, read status propagates)
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

  // 7. Merge Adherence Logs (by id or composite patient+type+loggedAt)
  const mergedAdherence = [...current.adherenceLogs];
  if (incoming.adherenceLogs && incoming.adherenceLogs.length > 0) {
    for (const inc of incoming.adherenceLogs) {
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

  // 8. Merge Fluid Logs (by id or composite patient+loggedAt+amount)
  const mergedFluid = [...current.fluidLogs];
  if (incoming.fluidLogs && incoming.fluidLogs.length > 0) {
    for (const inc of incoming.fluidLogs) {
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

  // 9. Merge Diet Logs (by id or composite patient+loggedAt+mealType)
  const mergedDiet = [...current.dietLogs];
  if (incoming.dietLogs && incoming.dietLogs.length > 0) {
    for (const inc of incoming.dietLogs) {
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

  // 10. Merge Adherence Surveys (by id or composite patient+submittedAt)
  const mergedSurveys = [...current.adherenceSurveys];
  if (incoming.adherenceSurveys && incoming.adherenceSurveys.length > 0) {
    for (const inc of incoming.adherenceSurveys) {
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

  // 11. Merge Reminders (by id)
  const mergedReminders = [...current.reminders];
  if (incoming.reminders && incoming.reminders.length > 0) {
    for (const inc of incoming.reminders) {
      const idx = mergedReminders.findIndex((r) => r.id === inc.id);
      if (idx === -1) {
        mergedReminders.push(inc);
      } else {
        mergedReminders[idx] = { ...mergedReminders[idx], ...inc };
      }
    }
  }

  // 12. Merge Coaching Tips (by id)
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

  const updatedDatabase: UnifiedCloudDatabase = {
    accounts: mergedAccounts,
    patients: mergedPatients,
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
    lastUpdated: new Date().toISOString(),
  };

  await saveCloudDatabase(updatedDatabase);
  return updatedDatabase;
}
