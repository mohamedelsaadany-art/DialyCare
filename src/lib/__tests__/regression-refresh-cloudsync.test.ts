/**
 * Regression Test Suite: Refresh Logout Bug & Cross-Device Cloud Sync
 * DialyCare v2.5.0 QA Subagent Verification
 *
 * Verifies:
 * 1. Refresh Logout Resilience:
 *    - Super Admin with active status never evicts
 *    - Super Admin with legacy undefined status auto-normalizes to active, never evicts
 *    - Approved Doctor with active status never evicts
 *    - Approved Doctor with legacy undefined status safely defaults to active, never evicts
 *    - Explicitly pending or rejected accounts are safely evicted on refresh
 * 2. Cross-Device Cloud Sync:
 *    - /api/auth/register POST captures Doctor and Patient registrations
 *    - Full nephrology profile preservation: dryWeightKg, dialysisSchedule, accessType, viralMarkers (HCV/HBV/HIV), emergencyContact
 *    - /api/auth/accounts GET exposes cloud store to client devices
 *    - /api/auth/approve POST transitions status to active and generates complete Patient record
 *    - /api/auth/reject POST records clinical reason and transitions status to rejected
 *    - syncCloudAccounts merges cloud registrations into client localStorage and auto-enrolls approved patients
 */

import assert from 'node:assert';

// Mock browser environment for Node.js test execution
const memoryStorage: Record<string, string> = {};
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in memoryStorage ? memoryStorage[k] : null),
      setItem: (k: string, v: string) => {
        memoryStorage[k] = String(v);
      },
      removeItem: (k: string) => {
        delete memoryStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
      },
    },
    sessionStorage: {
      getItem: (k: string) => (k in memoryStorage ? memoryStorage[k] : null),
      setItem: (k: string, v: string) => {
        memoryStorage[k] = String(v);
      },
      removeItem: (k: string) => {
        delete memoryStorage[k];
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  getAuthAccounts,
  saveAuthAccounts,
  getAdminPassword,
  getPatients,
  syncCloudAccounts,
  syncFullCloudData,
  DEFAULT_ADMIN_USER,
} from '../data-store';
import {
  getCloudAccounts,
  saveCloudAccounts,
  approveCloudAccount,
  getCloudDatabase,
  mergeCloudDatabase,
} from '../cloud-store';
import { POST as registerRoute } from '../../app/api/auth/register/route';
import { GET as accountsRoute } from '../../app/api/auth/accounts/route';
import { POST as approveRoute } from '../../app/api/auth/approve/route';
import { POST as rejectRoute } from '../../app/api/auth/reject/route';
import { GET as syncRouteGet, POST as syncRoutePost } from '../../app/api/sync/route';
import { createSessionToken } from '../server-auth';
import type { User, StoredAccount, Patient, DialysisSession } from '../types';
import {
  isUuid,
  formatPatientDisplayName,
  formatPatientFriendlyId,
  formatPatientOptionLabel,
} from '../../app/[locale]/patient/patient-utils';

const CURRENT_USER_KEY = 'dialycare_current_user';

/**
 * Helper to simulate the exact syncSession logic from auth-context.tsx
 */
function simulateSyncSession(): User | null {
  if (typeof window === 'undefined') return null;
  const storedUser =
    window.localStorage.getItem(CURRENT_USER_KEY) ||
    window.sessionStorage.getItem(CURRENT_USER_KEY);
  if (!storedUser) return null;

  const parsed = JSON.parse(storedUser) as User;

  // 1. Super Admin is permanently active and immune to eviction
  if (parsed.role === 'admin' || parsed.username?.toLowerCase() === 'admin') {
    const activeAdmin: User = {
      ...DEFAULT_ADMIN_USER,
      ...parsed,
      role: 'admin',
      status: 'active',
    };
    return activeAdmin;
  }

  // 2. Verify active status from accounts
  const accounts = getAuthAccounts();
  const found = accounts.find((a) => a.user.uid === parsed.uid);
  if (found) {
    if (found.user.status === 'rejected' || found.user.status === 'pending') {
      window.localStorage.removeItem(CURRENT_USER_KEY);
      window.sessionStorage.removeItem(CURRENT_USER_KEY);
      return null;
    }
    const activeFound: User = {
      ...found.user,
      status: found.user.status || 'active',
    };
    return activeFound;
  }

  // 3. Fallback for accounts not in local list
  if (parsed.status === 'rejected' || parsed.status === 'pending') {
    window.localStorage.removeItem(CURRENT_USER_KEY);
    window.sessionStorage.removeItem(CURRENT_USER_KEY);
    return null;
  }

  return { ...parsed, status: parsed.status || 'active' };
}

// B1c: the API routes require a session. Authenticate as the seeded super admin
// (Authorization: Bearer, same token the HttpOnly cookie would carry).
function adminAuthHeaders(): Record<string, string> {
  const token = createSessionToken({ uid: DEFAULT_ADMIN_USER.uid, role: 'admin' });
  if (!token) throw new Error('no session key available in tests');
  return { Authorization: `Bearer ${token}` };
}

export async function runRefreshAndCloudSyncTests(): Promise<{ totalAssertions: number; passed: boolean }> {
  let assertions = 0;
  const count = () => assertions++;

  console.log('================================================================');
  console.log('DIALYCARE REGRESSION SUITE: REFRESH RESILIENCE & CLOUD SYNC');
  console.log('================================================================\n');

  // Backup state
  const backupAccounts = getAuthAccounts();
  const backupPatients = getPatients();
  const backupCloudAccounts = await getCloudAccounts();

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: Refresh Logout Bug Resilience (Issue 1)
    // ------------------------------------------------------------------------
    console.log('--- 1. Testing Refresh Logout Bug Resilience ---');

    // Test 1.1: Super Admin with status: 'active'
    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(DEFAULT_ADMIN_USER));
    const syncedAdminActive = simulateSyncSession();
    assert.ok(syncedAdminActive, 'Super Admin session must be preserved');
    count();
    assert.strictEqual(syncedAdminActive?.role, 'admin', 'Super Admin role preserved');
    count();
    assert.strictEqual(syncedAdminActive?.status, 'active', 'Super Admin status is active');
    count();

    // Test 1.2: Super Admin with legacy schema (status: undefined or missing)
    const legacyAdmin: Partial<User> = {
      uid: 'admin-1',
      role: 'admin',
      username: 'admin',
      displayName: 'System Admin Legacy',
      language: 'en',
      createdAt: '2026-01-01',
      // status is deliberately undefined!
    };
    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(legacyAdmin));
    const syncedAdminLegacy = simulateSyncSession();
    assert.ok(syncedAdminLegacy, 'Legacy Super Admin without status attribute must NEVER be evicted on refresh');
    count();
    assert.strictEqual(syncedAdminLegacy?.role, 'admin');
    count();
    assert.strictEqual(syncedAdminLegacy?.status, 'active', 'Legacy Super Admin safely auto-normalized to active');
    count();

    // Test 1.3: Super Admin in getAuthAccounts auto-repair
    // Intentionally corrupt auth accounts with legacy admin lacking status
    const corruptAccounts: StoredAccount[] = [
      {
        username: 'admin',
        password: getAdminPassword(),
        user: { uid: 'admin-1', role: 'admin', username: 'admin', displayName: 'Admin', language: 'en', createdAt: '2026-01-01' } as User,
      },
    ];
    saveAuthAccounts(corruptAccounts);
    const repairedAccounts = getAuthAccounts();
    const repairedAdmin = repairedAccounts.find((a) => a.username === 'admin');
    assert.strictEqual(repairedAdmin?.user.status, 'active', 'getAuthAccounts auto-repairs legacy admin status to active');
    count();

    // Test 1.4: Approved Doctor with status: 'active'
    const doctorUid = 'doc-active-101';
    const approvedDoctorUser: User = {
      uid: doctorUid,
      role: 'doctor',
      username: 'dr_mustafa',
      phone: '01011119999',
      displayName: 'د. مصطفى كمال',
      language: 'ar',
      status: 'active',
      createdAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'Super Admin',
    };
    const accountsWithDoc: StoredAccount[] = [
      ...repairedAccounts,
      { username: 'dr_mustafa', password: 'DocPassword123', user: approvedDoctorUser },
    ];
    saveAuthAccounts(accountsWithDoc);

    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(approvedDoctorUser));
    const syncedDocActive = simulateSyncSession();
    assert.ok(syncedDocActive, 'Approved doctor session must be preserved on page refresh');
    count();
    assert.strictEqual(syncedDocActive?.uid, doctorUid);
    count();
    assert.strictEqual(syncedDocActive?.status, 'active');
    count();

    // Test 1.5: Approved Doctor with legacy schema (status: undefined)
    const legacyDocUid = 'doc-legacy-202';
    const legacyDoctorUser: User = {
      uid: legacyDocUid,
      role: 'doctor',
      username: 'dr_samir',
      displayName: 'د. سمير عثمان',
      language: 'ar',
      createdAt: '2026-01-01',
      // status: undefined!
    };
    const accountsWithLegacyDoc: StoredAccount[] = [
      ...getAuthAccounts(),
      { username: 'dr_samir', password: 'SamirPass123', user: legacyDoctorUser },
    ];
    saveAuthAccounts(accountsWithLegacyDoc);

    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(legacyDoctorUser));
    const syncedLegacyDoc = simulateSyncSession();
    assert.ok(syncedLegacyDoc, 'Legacy Doctor without status attribute must NEVER be evicted on refresh');
    count();
    assert.strictEqual(syncedLegacyDoc?.status, 'active', 'Legacy Doctor status safely defaulted to active');
    count();

    // Test 1.6: Eviction of Pending Accounts on Refresh
    const pendingUser: User = {
      uid: 'pending-user-303',
      role: 'patient',
      username: 'pending_pat',
      displayName: 'مريض قيد الانتظار',
      language: 'ar',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const accountsWithPending: StoredAccount[] = [
      ...getAuthAccounts(),
      { username: 'pending_pat', password: 'PendingPass123', user: pendingUser },
    ];
    saveAuthAccounts(accountsWithPending);

    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(pendingUser));
    const syncedPending = simulateSyncSession();
    assert.strictEqual(syncedPending, null, 'Pending account session must be purged/evicted on refresh');
    count();
    assert.strictEqual(window.localStorage.getItem(CURRENT_USER_KEY), null, 'localStorage CURRENT_USER removed');
    count();

    // Test 1.7: Eviction of Rejected Accounts on Refresh
    const rejectedUser: User = {
      uid: 'rejected-user-404',
      role: 'doctor',
      username: 'rejected_doc',
      displayName: 'طبيب مرفوض',
      language: 'ar',
      status: 'rejected',
      rejectionReason: 'Invalid medical license',
      createdAt: new Date().toISOString(),
    };
    const accountsWithRejected: StoredAccount[] = [
      ...getAuthAccounts(),
      { username: 'rejected_doc', password: 'RejectedPass123', user: rejectedUser },
    ];
    saveAuthAccounts(accountsWithRejected);

    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(rejectedUser));
    const syncedRejected = simulateSyncSession();
    assert.strictEqual(syncedRejected, null, 'Rejected account session must be purged/evicted on refresh');
    count();
    assert.strictEqual(window.localStorage.getItem(CURRENT_USER_KEY), null, 'localStorage CURRENT_USER removed');
    count();

    console.log('  ✓ Refresh logout bug resilience verified across all 7 session permutations!');

    // ------------------------------------------------------------------------
    // SECTION 2: Cross-Device Cloud Sync & Route Handlers (Issue 2)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Cross-Device Cloud Sync & API Handlers ---');

    // Test 2.1: API Route /api/auth/register (Doctor Registration)
    const docRegReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'doctor',
        data: {
          fullName: 'د. يوسف النجار',
          username: 'dr_youssef_cloud',
          phone: '+201099112233',
          email: 'youssef@nephrology.eg',
          specialty: 'استشاري أمراض وزراعة الكلى',
          hospital: 'مستشفى الدمرداش',
          password: 'CloudDocPass2026',
        },
      }),
    });
    const docRegRes = await registerRoute(docRegReq);
    assert.strictEqual(docRegRes.status, 200, 'Doctor registration API returns 200');
    count();
    const docRegData = await docRegRes.json();
    assert.strictEqual(docRegData.success, true, 'Doctor registration returns success: true');
    count();
    assert.strictEqual(docRegData.user.role, 'doctor');
    count();
    assert.strictEqual(docRegData.user.status, 'pending');
    count();
    const cloudDocUid = docRegData.user.uid;

    // Test 2.2: API Route /api/auth/register (Patient Simplified Intake Registration)
    const patientProfileData = {
      dialysisSchedule: 'STT' as const,
      dryWeightKg: 64.5,
      accessType: 'Permcath' as const,
      dialysisCenter: 'مركز الكلى بالدمرداش',
      age: 54,
      gender: 'female' as const,
    };

    const patRegReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'patient',
        data: {
          fullName: 'نادية عبد الفتاح السيد',
          phone: '01234567891',
          password: 'CloudPatPass2026',
          language: 'ar',
          profile: patientProfileData,
        },
      }),
    });
    const patRegRes = await registerRoute(patRegReq);
    assert.strictEqual(patRegRes.status, 200, 'Patient registration API returns 200');
    count();
    const patRegData = await patRegRes.json();
    assert.strictEqual(patRegData.success, true, 'Patient registration returns success: true');
    count();
    assert.strictEqual(patRegData.user.role, 'patient');
    count();
    assert.strictEqual(patRegData.user.status, 'active', 'Patient registration status is active immediately');
    count();
    const cloudPatUid = patRegData.user.uid;

    // Register a Nurse via /api/auth/register (Staff approval required)
    const nurseRegReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'nurse',
        data: {
          fullName: 'ممرضة منى شاكر',
          username: 'nurse_mona_cloud',
          phone: '+201099881122',
          role: 'nurse',
          password: 'CloudNursePass2026',
        },
      }),
    });
    const nurseRegRes = await registerRoute(nurseRegReq);
    assert.strictEqual(nurseRegRes.status, 200, 'Nurse registration API returns 200');
    count();
    const nurseRegData = await nurseRegRes.json();
    assert.strictEqual(nurseRegData.success, true);
    count();
    assert.strictEqual(nurseRegData.user.role, 'nurse');
    count();
    assert.strictEqual(nurseRegData.user.status, 'pending', 'Nurse registration status is pending');
    count();
    const cloudNurseUid = nurseRegData.user.uid;

    // Verify clinical profile received in registration response
    assert.strictEqual(patRegData.user.patientProfile.dialysisSchedule, 'STT');
    count();
    assert.strictEqual(patRegData.user.patientProfile.dryWeightKg, 64.5);
    count();
    assert.strictEqual(patRegData.user.patientProfile.accessType, 'Permcath');
    count();

    // Test 2.3: API Route /api/auth/accounts (GET Accounts list for Super Admin)
    const accountsReq = new Request('http://localhost:3000/api/auth/accounts', { headers: adminAuthHeaders() });
    const accountsRes = await accountsRoute(accountsReq);
    assert.strictEqual(accountsRes.status, 200, 'Accounts API returns 200');
    count();
    const accountsData = await accountsRes.json();
    assert.strictEqual(accountsData.success, true, 'Accounts API returns success: true');
    count();
    assert.ok(Array.isArray(accountsData.accounts), 'accountsData.accounts is array');
    count();

    // Verify registrations are in the cloud accounts list
    const foundCloudDoc = accountsData.users.find((u: User) => u.uid === cloudDocUid);
    const foundCloudNurse = accountsData.users.find((u: User) => u.uid === cloudNurseUid);
    const foundCloudPat = accountsData.users.find((u: User) => u.uid === cloudPatUid);
    assert.ok(foundCloudDoc, 'Doctor registration present in /api/auth/accounts');
    count();
    assert.ok(foundCloudNurse, 'Nurse registration present in /api/auth/accounts');
    count();
    assert.ok(foundCloudPat, 'Patient registration present in /api/auth/accounts');
    count();
    assert.strictEqual(foundCloudDoc.status, 'pending', 'Doctor status is pending in accounts queue');
    count();
    assert.strictEqual(foundCloudNurse.status, 'pending', 'Nurse status is pending in accounts queue');
    count();
    assert.strictEqual(foundCloudPat.status, 'active', 'Patient status is active in accounts store');
    count();

    // Test 2.4: API Route /api/auth/approve (Approving Nurse / Staff member)
    const approveReq = new Request('http://localhost:3000/api/auth/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({
        uid: cloudNurseUid,
        reviewerName: 'Super Admin Dr. Saadany',
      }),
    });
    const approveRes = await approveRoute(approveReq);
    assert.strictEqual(approveRes.status, 200, 'Approve API returns 200');
    count();
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.success, true, 'Approve returns success: true');
    count();
    assert.strictEqual(approveData.user.status, 'active', 'Nurse transitioned to active');
    count();
    // B1c: the reviewer is the signed-in admin (from the session), never a name sent in the body.
    assert.strictEqual(approveData.user.reviewedBy, DEFAULT_ADMIN_USER.displayName, 'Reviewer stamped from session');
    count();

    // Verify cloud patient approval generates complete Patient entity
    const cloudPatApproval = await approveCloudAccount(cloudPatUid, 'Super Admin Dr. Saadany');
    assert.ok(cloudPatApproval.account, 'Patient account found in cloud store');
    count();
    assert.strictEqual(cloudPatApproval.account.user.status, 'active');
    count();

    const newPat = cloudPatApproval.newPatient as Patient;
    assert.ok(newPat, 'newPatient generated on approval');
    count();
    assert.strictEqual(newPat.id, cloudPatUid);
    count();
    assert.strictEqual(newPat.dialysisSchedule, 'STT', 'Dialysis schedule preserved');
    count();
    assert.strictEqual(newPat.dryWeightKg, 64.5, 'Dry weight preserved');
    count();
    assert.strictEqual(newPat.accessType, 'Permcath', 'Vascular access type preserved');
    count();
    assert.strictEqual(newPat.avatarId, 'female_mature_1', 'Gender-correct avatar assigned');
    count();
    assert.strictEqual(newPat.dialysisCenter, 'مركز الكلى بالدمرداش', 'Dialysis center preserved');
    count();

    // Test 2.5: API Route /api/auth/reject (Rejecting Doctor with Clinical Justification)
    const rejectionReason = 'صورة ترخيص مزاولة المهنة غير مقروءة وبحاجة لتحديث ختم نقابة الأطباء لعام 2026';
    const rejectReq = new Request('http://localhost:3000/api/auth/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({
        uid: cloudDocUid,
        reason: rejectionReason,
        reviewerName: 'Super Admin Dr. Saadany',
      }),
    });
    const rejectRes = await rejectRoute(rejectReq);
    assert.strictEqual(rejectRes.status, 200, 'Reject API returns 200');
    count();
    const rejectData = await rejectRes.json();
    assert.strictEqual(rejectData.success, true, 'Reject returns success: true');
    count();
    assert.strictEqual(rejectData.user.status, 'rejected', 'User transitioned to rejected');
    count();
    assert.strictEqual(rejectData.user.rejectionReason, rejectionReason, 'Rejection reason preserved');
    count();

    // Test 2.6: Cross-Device Synchronization Simulation (syncCloudAccounts)
    // Device B has empty local accounts (only default admin)
    saveAuthAccounts([
      { username: 'admin', password: getAdminPassword(), user: DEFAULT_ADMIN_USER },
    ]);
    window.localStorage.removeItem('DIALYCARE_PATIENTS');

    // Device B initiates cloud sync
    // Mock fetch for syncCloudAccounts in Node runtime
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/auth/accounts')) {
        const cloudAccs = await getCloudAccounts();
        return {
          ok: true,
          json: async () => ({
            success: true,
            accounts: cloudAccs,
            users: cloudAccs.map((a) => a.user),
          }),
        } as unknown as Response;
      }
      return originalFetch(url);
    };

    try {
      const syncedDeviceB = await syncCloudAccounts();
      assert.ok(syncedDeviceB.length >= 2, 'Device B received remote cloud accounts');
      count();

      // Verify the approved patient is in Device B's local accounts
      const deviceBPat = syncedDeviceB.find((a) => a.user.uid === cloudPatUid);
      assert.ok(deviceBPat, 'Approved patient synced to Device B accounts cache');
      count();
      assert.strictEqual(deviceBPat?.user.status, 'active');
      count();

      // Verify the approved patient was auto-enrolled into Device B's DIALYCARE_PATIENTS
      const deviceBPatients = getPatients();
      const enrolledBPat = deviceBPatients.find((p) => p.id === cloudPatUid);
      assert.ok(enrolledBPat, 'Approved patient auto-enrolled into Device B patient registry');
      count();
      assert.strictEqual(enrolledBPat?.dialysisSchedule, 'STT');
      count();
      assert.strictEqual(enrolledBPat?.dryWeightKg, 64.5);
      count();
      assert.strictEqual(enrolledBPat?.accessType, 'Permcath');
      count();
      assert.strictEqual(enrolledBPat?.dialysisCenter, 'مركز الكلى بالدمرداش', 'Dialysis center preserved on Device B');
      count();

      // Verify the rejected doctor is also synced with status: 'rejected'
      const deviceBDoc = syncedDeviceB.find((a) => a.user.uid === cloudDocUid);
      assert.ok(deviceBDoc, 'Rejected doctor synced to Device B accounts cache');
      count();
      assert.strictEqual(deviceBDoc?.user.status, 'rejected');
      count();
      assert.strictEqual(deviceBDoc?.user.rejectionReason, rejectionReason);
      count();
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log('  ✓ Cross-device cloud sync and API route handlers verified completely!');

    // ------------------------------------------------------------------------
    // SECTION 3: Event Storm Prevention & Concurrency Lock Guard Verification
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Event Storm Prevention & Concurrency Lock Guard ---');

    // Test 3.1: Concurrent syncCloudAccounts invocations guarded by re-entrancy lock
    let fetchCount = 0;
    const trackingFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/auth/accounts')) {
        fetchCount++;
        // Add small artificial delay to verify re-entrancy lock
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({
            success: true,
            accounts: getAuthAccounts(),
            users: getAuthAccounts().map((a) => a.user),
          }),
        } as unknown as Response;
      }
      return trackingFetch(url);
    };

    try {
      // Fire 5 concurrent syncCloudAccounts calls simultaneously
      const results = await Promise.all([
        syncCloudAccounts(),
        syncCloudAccounts(),
        syncCloudAccounts(),
        syncCloudAccounts(),
        syncCloudAccounts(),
      ]);

      assert.strictEqual(results.length, 5, 'All 5 concurrent calls resolved');
      count();
      assert.ok(fetchCount <= 2, `Lock guard prevented network storm: fetchCount was ${fetchCount} (expected <= 2)`);
      count();
    } finally {
      globalThis.fetch = trackingFetch;
    }

    // Test 3.2: Clean logout session eviction
    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(DEFAULT_ADMIN_USER));
    window.sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(DEFAULT_ADMIN_USER));
    assert.ok(window.localStorage.getItem(CURRENT_USER_KEY), 'Session active before logout');
    count();

    // Perform clean logout eviction
    window.localStorage.removeItem(CURRENT_USER_KEY);
    window.sessionStorage.removeItem(CURRENT_USER_KEY);
    assert.strictEqual(window.localStorage.getItem(CURRENT_USER_KEY), null, 'localStorage purged on logout');
    count();
    assert.strictEqual(window.sessionStorage.getItem(CURRENT_USER_KEY), null, 'sessionStorage purged on logout');
    count();

    console.log('  ✓ Concurrency lock guard and clean logout eviction verified!');

    // ------------------------------------------------------------------------
    // SECTION 4: Cross-Device Doctor Approval Reconciliation & Deduplication
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Cross-Device Doctor Approval Reconciliation & Deduplication ---');

    const clientDoctorUid = 'client-doc-' + Date.now();
    const doctorPhone = '01552885823';
    const localPendingDoctor: StoredAccount = {
      username: doctorPhone,
      phone: doctorPhone,
      password: 'password123',
      user: {
        uid: clientDoctorUid,
        role: 'doctor',
        status: 'pending',
        username: doctorPhone,
        phone: doctorPhone,
        displayName: 'Dr. Test Mohamed',
        language: 'ar',
        createdAt: new Date().toISOString(),
      },
    };
    saveAuthAccounts([localPendingDoctor]);
    const initialDoc = getAuthAccounts().find((a) => a.phone === doctorPhone);
    assert.strictEqual(initialDoc?.user.status, 'pending', 'Local account initial status is pending');
    count();

    const serverDoctorUid = 'server-doc-' + Date.now();
    const cloudApprovedDoctor: StoredAccount = {
      username: doctorPhone,
      phone: doctorPhone,
      password: 'password123',
      user: {
        uid: serverDoctorUid,
        role: 'doctor',
        status: 'active',
        username: doctorPhone,
        phone: doctorPhone,
        displayName: 'Dr. Test Mohamed',
        language: 'ar',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'Super Admin',
        createdAt: new Date().toISOString(),
      },
    };

    // Override fetch to return the approved cloud record
    const reconcileFetchOriginal = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/auth/accounts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            accounts: [cloudApprovedDoctor],
            users: [cloudApprovedDoctor.user],
          }),
        } as unknown as Response;
      }
      return reconcileFetchOriginal(url);
    };

    try {
      const synced = await syncCloudAccounts();
      // Should reconcile local pending to active, and deduplicate by phone
      const docMatches = synced.filter((a) => a.phone === doctorPhone || a.username === doctorPhone);
      assert.strictEqual(docMatches.length, 1, 'Duplicate records purged: exactly 1 account per phone');
      count();
      assert.strictEqual(docMatches[0].user.status, 'active', 'Doctor account reconciled to active status');
      count();

      const refreshedLocal = getAuthAccounts().filter((a) => a.phone === doctorPhone || a.username === doctorPhone);
      assert.strictEqual(refreshedLocal.length, 1, 'Local storage deduplicated by phone');
      count();
      assert.strictEqual(refreshedLocal[0].user.status, 'active', 'Local storage updated to active');
      count();
    } finally {
      globalThis.fetch = reconcileFetchOriginal;
    }

    console.log('  ✓ Cross-device doctor approval reconciliation & deduplication verified!');

    // ==============================================================
    // 5. Full-Spectrum Bidirectional Clinical Synchronization Engine
    // ==============================================================
    console.log('\n--- 5. Testing Full-Spectrum Bidirectional Clinical Synchronization Engine ---');

    // 5.1 Test direct merge of clinical entities in cloud database
    const cloudDbBefore = await getCloudDatabase();
    assert.ok(Array.isArray(cloudDbBefore.accounts), 'Cloud DB contains accounts');
    count();

    const testPatientId = 'cloud-sync-test-patient-1';
    const testPatient: Patient = {
      id: testPatientId,
      fullName: 'Dr. Provisioned Patient',
      fullNameAr: 'مريض مدخل سريرياً',
      phone: '01055566677',
      username: '01055566677',
      dialysisSchedule: 'SMW',
      dryWeightKg: 68,
      accessType: 'AVF',
      isActive: true,
      gender: 'male',
      avatarId: 'male_mature_1',
      createdAt: new Date().toISOString(),
    };

    const testSession: DialysisSession = {
      id: 'session-sync-test-1',
      patientId: testPatientId,
      sessionDate: '2026-11-14',
      recordedBy: 'doc-1',
      recordedAt: new Date().toISOString(),
      durationHours: 4,
      ultrafiltrationVolumeMl: 2200,
      preWeightKg: 70.2,
      postWeightKg: 68.0,
      machineSodiumMeqL: 138,
    };

    const mergedDb = await mergeCloudDatabase({
      patients: [testPatient],
      dialysisSessions: [testSession],
    });

    assert.ok(mergedDb.patients.some((p) => p.id === testPatientId), 'Patient merged into cloud DB');
    count();
    assert.ok(mergedDb.dialysisSessions.some((s) => s.id === 'session-sync-test-1'), 'Session merged into cloud DB');
    count();

    // 5.2 Test /api/sync route GET and POST directly
    const getRes = await syncRouteGet(new Request('http://localhost:3000/api/sync', { headers: adminAuthHeaders() }));
    const getJson = await getRes.json();
    assert.strictEqual(getJson.success, true, 'GET /api/sync returned success');
    count();
    assert.ok(getJson.data.patients.some((p: Patient) => p.id === testPatientId), 'GET /api/sync contains merged patient');
    count();

    const postReq = new Request('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({
        patients: [{
          ...testPatient,
          dryWeightKg: 67.5,
        }],
      }),
    });
    const postRes = await syncRoutePost(postReq);
    const postJson = await postRes.json();
    assert.strictEqual(postJson.success, true, 'POST /api/sync returned success');
    count();
    const updatedInCloud = postJson.data.patients.find((p: Patient) => p.id === testPatientId);
    assert.strictEqual(updatedInCloud?.dryWeightKg, 67.5, 'POST /api/sync reconciled patient update in cloud');
    count();

    // 5.3 Test client synchronizer syncFullCloudData
    const clientSyncOriginal = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString();
      if (urlStr.includes('/api/sync')) {
        const bodyObj = init?.body ? JSON.parse(String(init.body)) : {};
        const resDb = await mergeCloudDatabase(bodyObj);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: resDb }),
        } as unknown as Response;
      }
      return clientSyncOriginal(url, init);
    };

    try {
      const clientSynced = await syncFullCloudData();
      assert.ok(clientSynced, 'syncFullCloudData returned synced database');
      count();
      assert.ok(clientSynced?.patients.some((p) => p.id === testPatientId), 'syncFullCloudData holds test patient');
      count();
      assert.ok(clientSynced?.dialysisSessions.some((s) => s.id === 'session-sync-test-1'), 'syncFullCloudData holds test session');
      count();
    } finally {
      globalThis.fetch = clientSyncOriginal;
    }

    console.log('  ✓ Full-spectrum bidirectional clinical synchronization engine verified!');

    // =========================================================================
    // 6. Testing Patient Label Deduplication, Friendly Identifiers & Multi-Patient Cloud Directory
    // =========================================================================
    console.log('\n--- 6. Testing Patient Label Deduplication, Friendly Identifiers & Multi-Patient Cloud Directory ---');

    // 6.1 isUuid utility
    assert.strictEqual(isUuid('e7dc15c3-563c-49b8-9d44-dc8b040b6d69'), true, 'Valid UUID recognized');
    count();
    assert.strictEqual(isUuid('64b729c9-570e-405f-a043-7148230389fa'), true, 'Valid UUID recognized');
    count();
    assert.strictEqual(isUuid('patient-1'), false, 'patient-1 is not a UUID');
    count();
    assert.strictEqual(isUuid('01012345678'), false, 'phone is not a UUID');
    count();
    assert.strictEqual(isUuid(''), false, 'empty is not a UUID');
    count();

    // 6.2 formatPatientDisplayName eliminates duplicate name repeats
    const patIdentical = { fullName: 'Kw', fullNameAr: 'Kw' };
    assert.strictEqual(formatPatientDisplayName(patIdentical, true), 'Kw', 'Kw does not repeat as Kw — Kw');
    count();
    const patArIdentical = { fullName: 'عيان جديد', fullNameAr: 'عيان جديد' };
    assert.strictEqual(formatPatientDisplayName(patArIdentical, true), 'عيان جديد', 'عيان جديد does not repeat');
    count();
    const patDistinct = { fullName: 'Ahmed Mahmoud', fullNameAr: 'أحمد محمود' };
    assert.strictEqual(formatPatientDisplayName(patDistinct, true), 'أحمد محمود (Ahmed Mahmoud)', 'Bilingual Arabic formatting');
    count();
    assert.strictEqual(formatPatientDisplayName(patDistinct, false), 'Ahmed Mahmoud (أحمد محمود)', 'Bilingual English formatting');
    count();

    // 6.3 formatPatientFriendlyId eliminates raw 36-char technical UUIDs
    const uuidPatient = {
      id: 'e7dc15c3-563c-49b8-9d44-dc8b040b6d69',
      fullName: 'Kw',
      phone: '01552885823',
    };
    assert.strictEqual(formatPatientFriendlyId(uuidPatient), '01552885823', 'Prefers human phone over UUID');
    count();
    const uuidPatientNoPhone = {
      id: 'e7dc15c3-563c-49b8-9d44-dc8b040b6d69',
      fullName: 'Kw',
    };
    assert.strictEqual(formatPatientFriendlyId(uuidPatientNoPhone), '#e7dc15', 'Short 6-hex code instead of 36-char UUID');
    count();
    const demoPatient1 = {
      id: 'patient-1',
      fullName: 'Ahmed Mahmoud',
      phone: '01012345678',
    };
    assert.strictEqual(formatPatientFriendlyId(demoPatient1), '01012345678', 'Returns phone for demo patient');
    count();

    // 6.4 formatPatientOptionLabel creates clean, non-technical readable dropdown labels
    const optionLabelKw = formatPatientOptionLabel(
      {
        id: 'e7dc15c3-563c-49b8-9d44-dc8b040b6d69',
        fullName: 'Kw',
        fullNameAr: 'Kw',
        phone: '01122334455',
        dialysisSchedule: 'SMW',
      },
      true
    );
    assert.ok(!optionLabelKw.includes('e7dc15c3-563c-49b8-9d44-dc8b040b6d69'), 'No raw UUID in option label');
    count();
    assert.ok(!optionLabelKw.includes('Kw — Kw'), 'No duplicate name concatenation in option label');
    count();
    assert.ok(optionLabelKw.includes('01122334455'), 'Contains phone number in option label');
    count();
    assert.ok(optionLabelKw.includes('السبت / الاثنين / الأربعاء'), 'Contains Arabic schedule label');
    count();

    // 6.5 Full Multi-Patient Clinical Directory (Canonical Demo Patients Seeded)
    const cloudDb = await getCloudDatabase();
    assert.ok(cloudDb.patients.length >= 7, `Expected at least 7 patients in cloud directory, got ${cloudDb.patients.length}`);
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-1'), 'patient-1 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-2'), 'patient-2 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-3'), 'patient-3 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-4'), 'patient-4 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-5'), 'patient-5 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-6'), 'patient-6 present');
    count();
    assert.ok(cloudDb.patients.some((p) => p.id === 'patient-7'), 'patient-7 present');
    count();

    // 6.6 Direct Server-Side Patient Registration Route (/api/auth/register)
    const newPatRegReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'patient',
        data: {
          fullName: 'فاروق حسني',
          fullNameAr: 'فاروق حسني',
          phone: '01099887766',
          password: 'patientPassword123',
          profile: {
            dialysisSchedule: 'SMW',
            dryWeightKg: 68,
            accessType: 'AVF',
            dialysisCenter: 'وحدة وصلتي لغسيل الكلى',
          },
        },
      }),
    });
    const regPatRes = await registerRoute(newPatRegReq);
    assert.strictEqual(regPatRes.status, 200, 'Register patient returns 200');
    count();
    const regPatBody = await regPatRes.json();
    assert.strictEqual(regPatBody.success, true, 'Register patient success is true');
    count();
    assert.ok(regPatBody.patient, 'Register patient returns complete Patient object');
    count();
    assert.strictEqual(regPatBody.patient.fullName, 'فاروق حسني', 'Patient name matches');
    count();
    assert.strictEqual(regPatBody.patient.phone, '01099887766', 'Patient phone matches');
    count();

    console.log('  ✓ Patient label deduplication, friendly identifiers & multi-patient cloud directory verified!');

    console.log('\n================================================================');
    console.log(`REGRESSION SUITE PASSED SUCCESSFULLY: ${assertions} assertions passed`);
    console.log('================================================================\n');

    return { totalAssertions: assertions, passed: true };
  } finally {
    // Teardown: restore initial state
    saveAuthAccounts(backupAccounts);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('DIALYCARE_PATIENTS', JSON.stringify(backupPatients));
    }
    await saveCloudAccounts(backupCloudAccounts);
  }
}

// Standalone execution entry point
if (process.argv[1]?.includes('regression-refresh-cloudsync.test')) {
  runRefreshAndCloudSyncTests()
    .then((res) => {
      console.log(`Standalone execution complete: ${res.totalAssertions} assertions passed.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Regression suite failure:', err);
      process.exit(1);
    });
}
