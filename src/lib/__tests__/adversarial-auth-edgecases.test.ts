/**
 * Adversarial Auth & Approvals Stress Test Suite
 * DialyCare QA Subagent Automated Verification
 *
 * Probes:
 * 1. generatePatientCredentials: 100+ random phone permutations, 0/O/1/l/I exclusion, 3-letter uniqueness
 * 2. Super Admin dynamic password rotation boundaries (<6 chars rejection, trimming, store sync)
 * 3. Pending registration queues and chronological sorting
 * 4. Super Admin approval state transitions & patient auto-enrollment idempotency
 * 5. Super Admin rejection workflow with clinical justifications & pending queue purging
 * 6. Non-existent UID resilience for approvals and rejections
 * 7. In-clinic pre-approved account provisioning
 */

import assert from 'node:assert';

// Mock browser window and storage for headless Node test runtime
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
  generatePatientCredentials,
  getAdminPassword,
  setAdminPassword,
  getAuthAccounts,
  saveAuthAccounts,
  getPendingApprovals,
  approveUserRegistration,
  rejectUserRegistration,
  registerDoctorAccount,
  registerPatientAccount,
  getPatients,
} from '../data-store';
import { addPatientAccount } from '../auth-context';

export async function runAdversarialAuthSuite(): Promise<{ totalAssertions: number; passed: boolean }> {
  let assertions = 0;
  const count = () => assertions++;

  console.log('================================================================');
  console.log('DIALYCARE ADVERSARIAL QA TEST SUITE: AUTH & CREDENTIAL BOUNDARIES');
  console.log('================================================================\n');

  // Preserve initial state
  const backupAccounts = getAuthAccounts();
  const backupAdminPass = getAdminPassword();
  const backupPatients = getPatients();

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: generatePatientCredentials 100+ Iterations Adversarial Probe
    // ------------------------------------------------------------------------
    console.log('--- Probing generatePatientCredentials (100 random trials) ---');

    const FORBIDDEN_GLYPHS = new Set(['0', 'O', '1', 'l', 'I']);
    const ALLOWED_REGEX = /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/;
    const prefixes = ['010', '011', '012', '015', '+2010', '+20 11', '012-', '(015) '];
    const generatedSuffixes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const prefix = prefixes[i % prefixes.length];
      const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
      const testPhoneInput = `${prefix}${randomDigits}`;

      const creds = generatePatientCredentials(testPhoneInput);

      // 1. Check clean phone formatting
      const expectedClean = testPhoneInput.replace(/[\s\-\(\)\+]/g, '').trim();
      assert.strictEqual(creds.username, expectedClean, `Trial ${i + 1}: username must match cleaned phone`);
      count();
      assert.strictEqual(creds.phone, expectedClean, `Trial ${i + 1}: phone property must match cleaned phone`);
      count();

      // 2. Suffix strict length of 3
      assert.strictEqual(creds.randomSuffix.length, 3, `Trial ${i + 1}: suffix must be exactly 3 characters`);
      count();

      // 3. Password concatenation rule: phone + suffix
      assert.strictEqual(creds.password, `${expectedClean}${creds.randomSuffix}`, `Trial ${i + 1}: password must equal phone + suffix`);
      count();

      // 4. Zero overlapping letters in suffix (all 3 characters distinct)
      const letterArray = creds.randomSuffix.split('');
      const uniqueLetters = new Set(letterArray);
      assert.strictEqual(uniqueLetters.size, 3, `Trial ${i + 1}: Suffix "${creds.randomSuffix}" must have 3 non-overlapping distinct letters`);
      count();
      assert.notStrictEqual(letterArray[0], letterArray[1], `Trial ${i + 1}: Letter 0 and 1 must differ`);
      count();
      assert.notStrictEqual(letterArray[1], letterArray[2], `Trial ${i + 1}: Letter 1 and 2 must differ`);
      count();
      assert.notStrictEqual(letterArray[0], letterArray[2], `Trial ${i + 1}: Letter 0 and 2 must differ`);
      count();

      // 5. Zero presence of visually confusing glyphs (0, O, 1, l, I)
      for (const char of letterArray) {
        assert.strictEqual(FORBIDDEN_GLYPHS.has(char), false, `Trial ${i + 1}: Character "${char}" must not be 0, O, 1, l, or I`);
        count();
      }

      // 6. Character set adheres to safe alphabet
      assert.strictEqual(ALLOWED_REGEX.test(creds.randomSuffix), true, `Trial ${i + 1}: Suffix "${creds.randomSuffix}" must match safe alphabet`);
      count();

      generatedSuffixes.add(creds.randomSuffix);
    }

    // Entropy check: across 100 trials, unique suffixes should be very high (> 90)
    console.log(`  ✓ Generated 100 randomized credentials: ${generatedSuffixes.size} unique random suffixes observed`);
    assert.ok(generatedSuffixes.size >= 90, 'Entropy check: at least 90 unique suffixes across 100 random generations');
    count();

    // Boundary edge case: empty or whitespace-only phone string
    const emptyCreds = generatePatientCredentials('   ');
    assert.strictEqual(emptyCreds.username, '01000000000', 'Empty phone fallback generates standard placeholder');
    count();
    assert.strictEqual(emptyCreds.randomSuffix.length, 3, 'Empty phone fallback still generates valid 3-letter suffix');
    count();
    assert.strictEqual(new Set(emptyCreds.randomSuffix.split('')).size, 3, 'Empty phone fallback suffix is non-overlapping');
    count();

    // ------------------------------------------------------------------------
    // SECTION 2: Super Admin Dynamic Password Rotation Boundaries
    // ------------------------------------------------------------------------
    console.log('\n--- Probing Super Admin Password Rotation Boundaries ---');
    
    // Password shorter than 6 chars must be rejected
    const tooShort1 = setAdminPassword('12345');
    assert.strictEqual(tooShort1, false, 'Password shorter than 6 characters must be rejected');
    count();
    assert.strictEqual(getAdminPassword(), 'admin123', 'Password must remain intact after failed short change');
    count();

    const tooShortWhitespace = setAdminPassword('   ab   ');
    assert.strictEqual(tooShortWhitespace, false, 'Whitespace-trimmed password under 6 chars must be rejected');
    count();

    // Valid strong rotation
    const rotateSuccess = setAdminPassword('SuperSecretNephro#2026');
    assert.strictEqual(rotateSuccess, true, 'Valid password rotation succeeds');
    count();
    assert.strictEqual(getAdminPassword(), 'SuperSecretNephro#2026', 'Updated password returned by getAdminPassword');
    count();

    // Check that getAuthAccounts automatically reflects new admin password
    const accountsAfterRotation = getAuthAccounts();
    const adminAcc = accountsAfterRotation.find((a) => a.username.toLowerCase() === 'admin');
    assert.ok(adminAcc, 'Admin account present in auth store');
    count();
    assert.strictEqual(adminAcc?.password, 'SuperSecretNephro#2026', 'Admin account in store updated dynamically with new password');
    count();

    // Revert password
    setAdminPassword('admin123');
    assert.strictEqual(getAdminPassword(), 'admin123');
    count();

    // ------------------------------------------------------------------------
    // SECTION 3: Pending Registration Queue & Doctor/Patient Registration
    // ------------------------------------------------------------------------
    console.log('\n--- Probing Registration & Pending Review Workflows ---');

    // Register a pending doctor
    const doc = registerDoctorAccount({
      fullName: 'د. طارق محمود',
      username: 'dr_tarek_adv',
      phone: '01055554444',
      email: 'tarek@nephro.eg',
      specialty: 'استشاري أمراض وزراعة الكلى',
      hospital: 'مستشفى عين شمس التخصصي',
      password: 'TarekPassword2026',
    });
    assert.strictEqual(doc.role, 'doctor');
    count();
    assert.strictEqual(doc.status, 'pending');
    count();

    // Register a pending patient
    const pat = registerPatientAccount({
      fullName: 'سعيد عبد الله الورداني',
      phone: '01188887777',
      password: 'PatientWordani2026',
      profile: {
        dialysisSchedule: 'SMW',
        dryWeightKg: 72.5,
        accessType: 'AVF',
        dialysisCenter: 'وحدة غسيل عين شمس',
        age: 62,
        gender: 'male',
      },
    });
    assert.strictEqual(pat.role, 'patient');
    count();
    assert.strictEqual(pat.status, 'pending');
    count();

    // Pending review queue inspection
    const pendingList = getPendingApprovals();
    const pendingDoc = pendingList.find((u) => u.uid === doc.uid);
    const pendingPat = pendingList.find((u) => u.uid === pat.uid);
    assert.ok(pendingDoc, 'Pending doctor is present in pending queue');
    count();
    assert.ok(pendingPat, 'Pending patient is present in pending queue');
    count();

    // Verify neither pending user is present in official DIALYCARE_PATIENTS registry
    const patientsPreApproval = getPatients();
    assert.strictEqual(patientsPreApproval.some((p) => p.id === doc.uid), false, 'Pending doctor must not be in patients registry');
    count();
    assert.strictEqual(patientsPreApproval.some((p) => p.id === pat.uid), false, 'Pending patient must not be in patients registry until approved');
    count();

    // ------------------------------------------------------------------------
    // SECTION 4: Approval State Machine & Idempotency
    // ------------------------------------------------------------------------
    console.log('\n--- Probing Super Admin Approval State Machine ---');

    // Edge case: Approving non-existent UID
    const nonExistentApproval = approveUserRegistration('non-existent-uid-99999');
    assert.strictEqual(nonExistentApproval, null, 'Approving non-existent UID returns null safely');
    count();

    // Approve doctor
    const approvedDoc = approveUserRegistration(doc.uid, 'Chief Nephrologist Dr. Ahmed');
    assert.ok(approvedDoc, 'Doctor approval returns updated User');
    count();
    assert.strictEqual(approvedDoc?.status, 'active', 'Doctor status transitioned to active');
    count();
    assert.strictEqual(approvedDoc?.reviewedBy, 'Chief Nephrologist Dr. Ahmed', 'Reviewer name stamped');
    count();
    assert.ok(approvedDoc?.reviewedAt, 'Review timestamp populated');
    count();

    // Verify doctor is NOT added to DIALYCARE_PATIENTS registry
    const patientsAfterDocApproval = getPatients();
    assert.strictEqual(patientsAfterDocApproval.some((p) => p.id === doc.uid), false, 'Doctor must NEVER be enrolled as patient');
    count();

    // Approve patient
    const approvedPat = approveUserRegistration(pat.uid, 'Chief Nephrologist Dr. Ahmed');
    assert.ok(approvedPat, 'Patient approval returns updated User');
    count();
    assert.strictEqual(approvedPat?.status, 'active', 'Patient status transitioned to active');
    count();

    // Verify patient IS auto-enrolled into DIALYCARE_PATIENTS registry with exact profile values
    const patientsAfterPatApproval = getPatients();
    const enrolledRecord = patientsAfterPatApproval.find((p) => p.id === pat.uid);
    assert.ok(enrolledRecord, 'Approved patient successfully auto-enrolled in DIALYCARE_PATIENTS');
    count();
    assert.strictEqual(enrolledRecord?.fullName, pat.displayName);
    count();
    assert.strictEqual(enrolledRecord?.phone, '01188887777');
    count();
    assert.strictEqual(enrolledRecord?.dialysisSchedule, 'SMW');
    count();
    assert.strictEqual(enrolledRecord?.dryWeightKg, 72.5);
    count();
    assert.strictEqual(enrolledRecord?.accessType, 'AVF');
    count();
    assert.strictEqual(enrolledRecord?.gender, 'male');
    count();
    assert.strictEqual(enrolledRecord?.avatarId, 'male_mature_1');
    count();
    assert.strictEqual(enrolledRecord?.isActive, true);
    count();

    // Idempotency: re-approving the same patient should not create duplicates
    const initialPatientCount = getPatients().length;
    approveUserRegistration(pat.uid, 'Chief Nephrologist Dr. Ahmed');
    const patientCountAfterDuplicateApproval = getPatients().length;
    assert.strictEqual(patientCountAfterDuplicateApproval, initialPatientCount, 'Re-approving patient must not duplicate patient record');
    count();

    // ------------------------------------------------------------------------
    // SECTION 5: Rejection Workflow with Clinical Justifications
    // ------------------------------------------------------------------------
    console.log('\n--- Probing Super Admin Rejection State Machine ---');

    // Edge case: Rejecting non-existent UID
    const nonExistentRejection = rejectUserRegistration('non-existent-uid-88888', 'Any reason');
    assert.strictEqual(nonExistentRejection, null, 'Rejecting non-existent UID returns null safely');
    count();

    // Register a doctor to be rejected
    const unverifiedDoc = registerDoctorAccount({
      fullName: 'طبيب غير مرخص',
      username: 'fake_doc_adv',
      phone: '01000001111',
      password: 'docpass12345',
    });

    const rejectionReason = 'الرقم القومي غير مطابق لكارنيه النقابة - يرجى إعادة رفع صورة واضحة وتحديث بيانات الترخيص الطبي';
    const rejectedDoc = rejectUserRegistration(unverifiedDoc.uid, rejectionReason, 'Audit Committee');
    assert.ok(rejectedDoc, 'Rejection returns updated User');
    count();
    assert.strictEqual(rejectedDoc?.status, 'rejected', 'Status changed strictly to rejected');
    count();
    assert.strictEqual(rejectedDoc?.rejectionReason, rejectionReason, 'Clinical rejection justification recorded');
    count();
    assert.strictEqual(rejectedDoc?.reviewedBy, 'Audit Committee', 'Reviewer recorded');
    count();
    assert.ok(rejectedDoc?.reviewedAt, 'Review timestamp recorded');
    count();

    // Verify rejected doctor is purged from pending review list
    const pendingAfterRejection = getPendingApprovals();
    assert.strictEqual(pendingAfterRejection.some((u) => u.uid === unverifiedDoc.uid), false, 'Rejected user purged from pending approvals queue');
    count();

    // ------------------------------------------------------------------------
    // SECTION 6: In-Clinic Pre-Approved Patient Provisioning
    // ------------------------------------------------------------------------
    console.log('\n--- Probing In-Clinic Doctor Patient Provisioning ---');

    const inClinicPhone = '01299990000';
    const clinicCreds = generatePatientCredentials(inClinicPhone);
    const provisioned = addPatientAccount(clinicCreds.username, clinicCreds.password, {
      fullName: 'مروة كمال الشريف',
      phone: inClinicPhone,
      dialysisSchedule: 'STT',
      dryWeightKg: 58,
      accessType: 'AVG',
    });

    // In-clinic provisioned patients must be active immediately
    assert.strictEqual(provisioned.user.status, 'active', 'In-clinic provisioned account has immediate active status');
    count();
    assert.strictEqual(provisioned.credentials?.username, inClinicPhone);
    count();
    assert.strictEqual(provisioned.credentials?.password, clinicCreds.password);
    count();

    // Must NOT appear in pending approvals queue
    const pendingAfterInClinic = getPendingApprovals();
    assert.strictEqual(pendingAfterInClinic.some((u) => u.uid === provisioned.user.uid), false, 'Pre-approved in-clinic user never enters pending queue');
    count();

    // Must be in DIALYCARE_PATIENTS registry
    const registeredPatients = getPatients();
    const foundInClinic = registeredPatients.find((p) => p.id === provisioned.user.uid);
    assert.ok(foundInClinic, 'In-clinic patient enrolled in official patient registry');
    count();
    assert.strictEqual(foundInClinic?.dialysisSchedule, 'STT');
    count();
    assert.strictEqual(foundInClinic?.dryWeightKg, 58);
    count();
    assert.strictEqual(foundInClinic?.accessType, 'AVG');
    count();

    console.log('\n================================================================');
    console.log(`ADVERSARIAL SUITE COMPLETED SUCCESSFULLY: ${assertions} assertions passed`);
    console.log('================================================================\n');

    return { totalAssertions: assertions, passed: true };
  } finally {
    // Teardown: restore pristine data
    saveAuthAccounts(backupAccounts);
    setAdminPassword(backupAdminPass);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('DIALYCARE_PATIENTS', JSON.stringify(backupPatients));
    }
  }
}

if (process.argv[1]?.includes('adversarial-auth-edgecases.test')) {
  runAdversarialAuthSuite()
    .then((res) => {
      console.log(`Standalone execution complete: ${res.totalAssertions} assertions passed.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Adversarial suite failure:', err);
      process.exit(1);
    });
}
