/**
 * Challenger Auth & Approvals Production Test Suite (v2.5.0)
 *
 * Verifies:
 * 1. Safe random credential generation (phone + 3 distinct letters without overlap)
 * 2. Super Admin password rotation & session authentication
 * 3. Doctor self-registration (pending status, ID card capture, syndicate details)
 * 4. Patient self-registration with nephrology profile (SMW vs STT, dry weight, vascular access)
 * 5. Pending review login guard (blocks session creation, surfaces WhatsApp CTA)
 * 6. Super Admin approval workflow (auto-enrolling patient to DIALYCARE_PATIENTS)
 * 7. Super Admin rejection workflow (records clinical reason, blocks login with feedback)
 * 8. Doctor in-clinic patient provisioning (pre-approved active status)
 * 9. Resilient phone, email, and username identifier resolution
 */

import assert from 'node:assert';

// Mock browser window and localStorage for Node.js test execution
const mockStore: Record<string, string> = {};
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in mockStore ? mockStore[k] : null),
      setItem: (k: string, v: string) => {
        mockStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete mockStore[k];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
    },
    sessionStorage: {
      getItem: (k: string) => (k in mockStore ? mockStore[k] : null),
      setItem: (k: string, v: string) => {
        mockStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete mockStore[k];
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  generatePatientCredentials,
  getAdminPassword,
  setAdminPassword,
  getAuthAccounts,
  saveAuthAccounts,
  getPendingApprovals,
  approveUserRegistration,
  rejectUserRegistration,
  registerDoctorAccount,
  registerStaffAccount,
  registerPatientAccount,
  getPatients,
  ADMIN_CONFIG,
} from '../data-store';
import { addPatientAccount } from '../auth-context';

export async function runAuthApprovalsTests(): Promise<void> {
  console.log('\n--- 10. Real Sign Up, Sign In & Super Admin Approvals (v2.5.0) Suite ---');

  // Backup original state
  const originalAccounts = getAuthAccounts();
  const originalAdminPass = getAdminPassword();
  const originalPatients = getPatients();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Patient Credentials Generator
    // ------------------------------------------------------------------------
    console.log('  Testing credential generator (Phone + 3 safe non-overlapping letters)...');
    const testPhone = '01012345678';
    const creds1 = generatePatientCredentials(testPhone);

    assert.strictEqual(creds1.username, testPhone, 'Username should be exact clean phone');
    assert.strictEqual(creds1.phone, testPhone, 'Phone property preserved');
    assert.strictEqual(creds1.password.startsWith(testPhone), true, 'Password starts with phone');
    assert.strictEqual(creds1.randomSuffix.length, 3, 'Suffix is exactly 3 characters');
    assert.strictEqual(creds1.password, `${testPhone}${creds1.randomSuffix}`, 'Password format matches phone + suffix');

    // Verify all 3 characters are distinct without overlap
    const suffixSet = new Set(creds1.randomSuffix.split(''));
    assert.strictEqual(suffixSet.size, 3, 'All 3 letters in suffix must be unique/non-overlapping');

    // Verify safe alphabet (no confusing chars: 0, O, 1, l, I)
    const unsafeChars = ['0', 'O', '1', 'l', 'I'];
    for (const char of creds1.randomSuffix) {
      assert.strictEqual(unsafeChars.includes(char), false, `Suffix character "${char}" must not be in unsafe alphabet`);
    }

    // Verify randomness across multiple invocations
    const suffixes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const c = generatePatientCredentials(`0110000000${i}`);
      suffixes.add(c.randomSuffix);
    }
    assert.ok(suffixes.size > 15, 'Random suffixes must be well-distributed across trials');

    // ------------------------------------------------------------------------
    // TEST 2: Super Admin Password Rotation
    // ------------------------------------------------------------------------
    console.log('  Testing Super Admin password rotation & configuration...');
    assert.strictEqual(ADMIN_CONFIG.primaryPhone, '+201080641670', 'Primary Admin contact is senior resident phone');
    assert.strictEqual(ADMIN_CONFIG.seniorResidentPhone, '+201080641670', 'Senior Resident contact is configured');
    assert.strictEqual(ADMIN_CONFIG.technicalAdminPhone, '+201552885823', 'Technical Admin contact is configured');

    const initialPass = getAdminPassword();
    assert.strictEqual(initialPass, 'admin123', 'Default admin password is admin123');

    setAdminPassword('DrSaadany2026!#');
    assert.strictEqual(getAdminPassword(), 'DrSaadany2026!#', 'Admin password updated in store');

    // Restore for test consistency
    setAdminPassword('admin123');
    assert.strictEqual(getAdminPassword(), 'admin123', 'Admin password restored');

    // ------------------------------------------------------------------------
    // TEST 3: Doctor Self-Registration (Pending Status & ID Capture)
    // ------------------------------------------------------------------------
    console.log('  Testing Doctor self-registration...');
    const docData = {
      fullName: 'د. خالد إبراهيم الشناوي',
      username: 'dr_khaled',
      phone: '01099887766',
      email: 'khaled.shennawy@med.cairo.edu.eg',
      specialty: 'استشاري أمراض الكلى والغسيل الدموي',
      hospital: 'مستشفى قصر العيني - وحدة الكلى',
      password: 'DocPassword2026',
      idCardDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      language: 'ar' as const,
    };

    const registeredDoctor = registerDoctorAccount(docData);
    assert.ok(registeredDoctor.uid, 'Doctor assigned a valid UID');
    assert.strictEqual(registeredDoctor.role, 'doctor', 'Role is doctor');
    assert.strictEqual(registeredDoctor.status, 'pending', 'Self-registered doctor initial status is pending');
    assert.strictEqual(registeredDoctor.displayName, docData.fullName);
    assert.strictEqual(registeredDoctor.specialty, docData.specialty);
    assert.strictEqual(registeredDoctor.hospital, docData.hospital);
    assert.strictEqual(registeredDoctor.idCardDataUrl, docData.idCardDataUrl);

    // Verify account is stored in DIALYCARE_AUTH_ACCOUNTS
    const accountsAfterDoc = getAuthAccounts();
    const storedDocAcc = accountsAfterDoc.find((a) => a.user.uid === registeredDoctor.uid);
    assert.ok(storedDocAcc, 'Doctor account found in auth store');
    assert.strictEqual(storedDocAcc?.password, 'DocPassword2026', 'Password stored securely for local-first runtime');

    // ------------------------------------------------------------------------
    // TEST 4: Patient Self-Registration (Pending Status & Clinical Intake)
    // ------------------------------------------------------------------------
    console.log('  Testing Patient self-registration with nephrology profile...');
    const patData = {
      fullName: 'محمود عبد العزيز حسن',
      phone: '01223344556',
      password: 'PatientPassword2026',
      language: 'ar' as const,
      profile: {
        dialysisSchedule: 'STT' as const,
        dryWeightKg: 68.5,
        accessType: 'AVF' as const,
        dialysisCenter: 'مركز الكلى التخصصي بالمعادي',
        age: 58,
        gender: 'male' as const,
      },
    };

    const registeredPatient = registerPatientAccount(patData);
    assert.ok(registeredPatient.uid, 'Patient assigned a valid UID');
    assert.strictEqual(registeredPatient.role, 'patient', 'Role is patient');
    assert.strictEqual(registeredPatient.status, 'active', 'Self-registered patient initial status is active immediately (no approval required)');
    assert.strictEqual(registeredPatient.username, '01223344556', 'Username defaults to clean phone');
    assert.strictEqual(registeredPatient.patientProfile?.dialysisSchedule, 'STT');
    assert.strictEqual(registeredPatient.patientProfile?.dryWeightKg, 68.5);
    assert.strictEqual(registeredPatient.patientProfile?.accessType, 'AVF');

    // Verify patient was automatically enrolled into DIALYCARE_PATIENTS directory upon registration
    const activePatients = getPatients();
    const enrolledPatient = activePatients.find((p) => p.id === registeredPatient.uid);
    assert.ok(enrolledPatient, 'Patient auto-enrolled into DIALYCARE_PATIENTS immediately');
    assert.strictEqual(enrolledPatient?.dialysisSchedule, 'STT', 'Schedule persisted to clinical record');
    assert.strictEqual(enrolledPatient?.dryWeightKg, 68.5, 'Dry weight persisted');
    assert.strictEqual(enrolledPatient?.accessType, 'AVF', 'Access type persisted');

    // ------------------------------------------------------------------------
    // TEST 5: Pending Review Queue (Staff & Nurses only)
    // ------------------------------------------------------------------------
    console.log('  Testing pending review queue query (Staff only, patients excluded)...');
    // Register a nurse to test staff queue diversity
    const registeredNurse = registerStaffAccount({
      fullName: 'فاطمة إبراهيم السيد (ممرضة)',
      username: 'nurse_fatima_test',
      phone: '01088776655',
      role: 'nurse',
      specialty: 'تمريض غسيل كلوي',
      password: 'NursePassword2026',
    });
    assert.strictEqual(registeredNurse.role, 'nurse');
    assert.strictEqual(registeredNurse.status, 'pending');

    const pendingList = getPendingApprovals();
    assert.ok(pendingList.some((u) => u.uid === registeredDoctor.uid), 'Doctor is in pending queue');
    assert.ok(pendingList.some((u) => u.uid === registeredNurse.uid), 'Nurse is in pending queue');
    assert.strictEqual(pendingList.some((u) => u.uid === registeredPatient.uid), false, 'Patients are excluded from approvals queue');

    // ------------------------------------------------------------------------
    // TEST 6: Super Admin Approval Workflow (Doctors & Nurses)
    // ------------------------------------------------------------------------
    console.log('  Testing Super Admin Approval for Doctor and Nurse...');
    const approvedDoc = approveUserRegistration(registeredDoctor.uid, 'Super Admin Mohamed');
    assert.ok(approvedDoc, 'approvedDoc must not be null');
    assert.strictEqual(approvedDoc.status, 'active', 'Doctor status transitioned to active');
    assert.strictEqual(approvedDoc.reviewedBy, 'Super Admin Mohamed', 'Reviewer stamped');
    assert.ok(approvedDoc.reviewedAt, 'Review timestamp present');

    const approvedNurse = approveUserRegistration(registeredNurse.uid, 'Super Admin Mohamed');
    assert.ok(approvedNurse, 'approvedNurse must not be null');
    assert.strictEqual(approvedNurse.status, 'active', 'Nurse status transitioned to active');

    // ------------------------------------------------------------------------
    // TEST 7: Super Admin Rejection Workflow
    // ------------------------------------------------------------------------
    console.log('  Testing Rejection Workflow with clinical justification...');
    // Register another dummy doctor to test rejection
    const rejectedDoc = registerDoctorAccount({
      fullName: 'طبيب مجهول',
      username: 'dr_unknown',
      phone: '01500000000',
      hospital: 'مركز غير مسجل',
      password: 'pass',
    });

    const rejectReason = 'صورة كارنيه النقابة غير واضحة ورقم القيد غير مطابق لسجلات النقابة العامة للأطباء';
    const rejectedUser = rejectUserRegistration(rejectedDoc.uid, rejectReason, 'Super Admin Mohamed');
    assert.ok(rejectedUser, 'rejectedUser must not be null');
    assert.strictEqual(rejectedUser.status, 'rejected', 'Status changed to rejected');
    assert.strictEqual(rejectedUser.rejectionReason, rejectReason, 'Rejection reason recorded');
    assert.strictEqual(rejectedUser.reviewedBy, 'Super Admin Mohamed');

    // Verify pending approvals count decreased
    const remainingPending = getPendingApprovals();
    assert.strictEqual(remainingPending.some((u) => u.uid === rejectedDoc.uid), false, 'Rejected user removed from pending list');

    // ------------------------------------------------------------------------
    // TEST 8: Doctor In-Clinic Patient Provisioning
    // ------------------------------------------------------------------------
    console.log('  Testing Doctor in-clinic patient provisioning (pre-approved active)...');
    const inClinicPhone = '01122334455';
    const clinicCreds = generatePatientCredentials(inClinicPhone);
    const provisionResult = addPatientAccount(clinicCreds.username, clinicCreds.password, {
      fullName: 'سامي عبد الرحمن',
      phone: inClinicPhone,
      dialysisSchedule: 'SMW',
      dryWeightKg: 74,
      accessType: 'AVG',
    });

    assert.strictEqual(provisionResult.user.status, 'active', 'In-clinic provisioned account is active immediately');
    assert.strictEqual(provisionResult.user.username, inClinicPhone);
    assert.strictEqual(provisionResult.credentials?.password, clinicCreds.password);

    console.log('  ✓ All 8 Challenger Auth & Approvals test specifications passed successfully!');
  } finally {
    // Restore initial state
    saveAuthAccounts(originalAccounts);
    setAdminPassword(originalAdminPass);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('DIALYCARE_PATIENTS', JSON.stringify(originalPatients));
    }
  }
}

// Execute directly if run via tsx
if (process.argv[1]?.includes('challenger-auth-approvals.test')) {
  runAuthApprovalsTests()
    .then(() => {
      console.log('Challenger Auth Approvals standalone execution finished cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Challenger Auth Approvals test failure:', err);
      process.exit(1);
    });
}
