import { put, list } from '@vercel/blob';
import type { StoredAccount, Patient } from './types';
import { DEFAULT_ADMIN_USER, DEFAULT_PATIENT_USER, DEFAULT_PATIENT2_USER, getAdminPassword } from './data-store';

const ACCOUNTS_BLOB_PATH = 'dialycare_cloud_accounts.json';

// In-memory fallback for local dev / offline environments
let memoryAccounts: StoredAccount[] = [
  { username: 'admin', password: getAdminPassword(), user: DEFAULT_ADMIN_USER },
  { username: 'patient1', phone: '01012345678', password: 'patient123', user: DEFAULT_PATIENT_USER },
  { username: 'patient2', phone: '01098765432', password: 'patient123', user: DEFAULT_PATIENT2_USER },
];

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
  return target;
}
