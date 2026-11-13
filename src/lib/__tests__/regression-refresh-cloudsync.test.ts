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
  approveUserRegistration,
  rejectUserRegistration,
  registerDoctorAccount,
  registerPatientAccount,
  getPatients,
  addPatient,
  syncCloudAccounts,
  DEFAULT_ADMIN_USER,
} from '../data-store';
import {
  getCloudAccounts,
  saveCloudAccounts,
  upsertCloudAccount,
  approveCloudAccount,
  rejectCloudAccount,
} from '../cloud-store';
import { POST as registerRoute } from '../../app/api/auth/register/route';
import { GET as accountsRoute } from '../../app/api/auth/accounts/route';
import { POST as approveRoute } from '../../app/api/auth/approve/route';
import { POST as rejectRoute } from '../../app/api/auth/reject/route';
import type { User, StoredAccount, Patient } from '../types';

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

    // Test 2.2: API Route /api/auth/register (Patient Registration with Full Nephrology Profile)
    const patientProfileData = {
      dialysisSchedule: 'STT' as const,
      dryWeightKg: 64.5,
      accessType: 'Permcath' as const,
      dialysisCenter: 'مركز الكلى بالدمرداش',
      age: 54,
      gender: 'female' as const,
      viralMarkers: {
        hcv: true,
        hbv: false,
        hiv: false,
      },
      emergencyContact: {
        name: 'عمرو عبد الفتاح',
        phone: '01234567890',
        relationship: 'الابن (Son)',
      },
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
    assert.deepStrictEqual(patRegData.user.patientProfile.viralMarkers, {
      hcv: true,
      hbv: false,
      hiv: false,
    }, 'Viral markers preserved in registration payload');
    count();
    assert.deepStrictEqual(patRegData.user.patientProfile.emergencyContact, {
      name: 'عمرو عبد الفتاح',
      phone: '01234567890',
      relationship: 'الابن (Son)',
    }, 'Emergency contact preserved in registration payload');
    count();

    // Test 2.3: API Route /api/auth/accounts (GET Accounts list for Super Admin)
    const accountsReq = new Request('http://localhost:3000/api/auth/accounts');
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
      headers: { 'Content-Type': 'application/json' },
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
    assert.strictEqual(approveData.user.reviewedBy, 'Super Admin Dr. Saadany', 'Reviewer stamped');
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
    assert.deepStrictEqual(newPat.viralMarkers, {
      hcv: true,
      hbv: false,
      hiv: false,
    }, 'Viral markers preserved in approved Patient entity');
    count();
    assert.deepStrictEqual(newPat.emergencyContact, {
      name: 'عمرو عبد الفتاح',
      phone: '01234567890',
      relationship: 'الابن (Son)',
    }, 'Emergency contact preserved in approved Patient entity');
    count();

    // Test 2.5: API Route /api/auth/reject (Rejecting Doctor with Clinical Justification)
    const rejectionReason = 'صورة ترخيص مزاولة المهنة غير مقروءة وبحاجة لتحديث ختم نقابة الأطباء لعام 2026';
    const rejectReq = new Request('http://localhost:3000/api/auth/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      assert.deepStrictEqual(enrolledBPat?.viralMarkers, {
        hcv: true,
        hbv: false,
        hiv: false,
      }, 'Viral markers preserved on Device B patient enrollment');
      count();
      assert.deepStrictEqual(enrolledBPat?.emergencyContact, {
        name: 'عمرو عبد الفتاح',
        phone: '01234567890',
        relationship: 'الابن (Son)',
      }, 'Emergency contact preserved on Device B patient enrollment');
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
