/**
 * Super Admin Patient Archive & 14-Day Deletion Feature Unit Test Suite
 *
 * Verifies:
 * 1. Archive creation & isolation of archived patients
 * 2. Clinical relational integrity (sessions, labs, meds, surveys, logs, reminders archived together)
 * 3. 14-day TTL arithmetic (exact 1,209,600,000 ms interval)
 * 4. Automatic purge of expired records (>14 days) while keeping active records (<14 days)
 * 5. Full restoration back to active database (patient, account with active status, all clinical records)
 * 6. Deduplication, idempotency, and reconciliation protection in mergeCloudDatabase
 *
 * Run: npx tsx src/lib/__tests__/super-admin-archive.test.ts
 */

import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.CLOUDFLARE_R2_BUCKET_NAME;

import {
  getCloudDatabase,
  saveCloudDatabase,
  archivePatients,
  restoreArchivedPatient,
  purgeExpiredArchivedPatients,
  getArchivedPatients,
  mergeCloudDatabase,
} from '../cloud-store';
import {
  archivePatients as archivePatientsLocal,
  restorePatient as restorePatientLocal,
  getArchivedPatients as getArchivedPatientsLocal,
  getArchivedPatientRecordsLocal,
  getPatients,
} from '../data-store';
import type {
  Patient,
  StoredAccount,
  DialysisSession,
  PatientLabRecord,
  PatientMedication,
  AdherenceSurveySubmission,
  FluidLog,
  DietLog,
  AdherenceLog,
  PatientReminder,
  UnifiedCloudDatabase,
} from '../types';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

console.warn = () => {};

async function resetDb(): Promise<UnifiedCloudDatabase> {
  const current = await getCloudDatabase();
  const cleanDb: UnifiedCloudDatabase = {
    accounts: [...current.accounts],
    patients: [...current.patients.filter((p) => !p.id.startsWith('pat-arch-'))],
    dialysisSessions: [...current.dialysisSessions.filter((s) => !s.patientId.startsWith('pat-arch-'))],
    labResults: [...current.labResults.filter((l) => !l.patientId.startsWith('pat-arch-'))],
    medications: [...current.medications.filter((m) => !m.patientId.startsWith('pat-arch-'))],
    notifications: [...current.notifications],
    adherenceLogs: [...current.adherenceLogs.filter((a) => !a.patientId.startsWith('pat-arch-'))],
    fluidLogs: [...current.fluidLogs.filter((f) => !f.patientId.startsWith('pat-arch-'))],
    dietLogs: [...current.dietLogs.filter((d) => !d.patientId.startsWith('pat-arch-'))],
    adherenceSurveys: [...current.adherenceSurveys.filter((s) => !s.patientId.startsWith('pat-arch-'))],
    reminders: [...current.reminders.filter((r) => !r.patientId.startsWith('pat-arch-'))],
    coachingTips: [...current.coachingTips],
    archivedPatients: [...(current.archivedPatients || []).filter((a) => !a.patient.id.startsWith('pat-arch-'))],
    lastUpdated: new Date().toISOString(),
  };
  await saveCloudDatabase(cleanDb);
  return cleanDb;
}

async function run(): Promise<void> {
  console.log('\n================================================================');
  console.log('SUPER ADMIN PATIENT ARCHIVE & 14-DAY RETENTION TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Setup sample patient, account, and clinical history
  // --------------------------------------------------------------------------
  console.log('--- 1. Archive Creation & Clinical Relational Integrity ---');
  await resetDb();

  const testPatient1: Patient = {
    id: 'pat-arch-1',
    fullName: 'Test Patient One',
    fullNameAr: 'مريض تجريبي أول',
    phone: '01011112222',
    username: 'testpatient1',
    dialysisSchedule: 'SMW',
    dryWeightKg: 72,
    accessType: 'AVF',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const testPatient2: Patient = {
    id: 'pat-arch-2',
    fullName: 'Test Patient Two',
    fullNameAr: 'مريض تجريبي ثان',
    phone: '01033334444',
    username: 'testpatient2',
    dialysisSchedule: 'STT',
    dryWeightKg: 68,
    accessType: 'AVG',
    isActive: true,
    createdAt: '2026-01-02T00:00:00.000Z',
  };

  const testAccount1: StoredAccount = {
    username: 'testpatient1',
    phone: '01011112222',
    password: 'securePassword123!',
    user: {
      uid: 'pat-arch-1',
      role: 'patient',
      username: 'testpatient1',
      displayName: 'Test Patient One',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const testSession1: DialysisSession = {
    id: 'sess-1',
    patientId: 'pat-arch-1',
    sessionDate: '2026-11-10',
    recordedBy: 'doc-1',
    preWeightKg: 74,
    postWeightKg: 72,
    ultrafiltrationVolumeMl: 2000,
  };

  const testSessionOther: DialysisSession = {
    id: 'sess-other',
    patientId: 'pat-arch-2',
    sessionDate: '2026-11-11',
    recordedBy: 'doc-1',
  };

  const testLab1: PatientLabRecord = {
    id: 'lab-1',
    patientId: 'pat-arch-1',
    testDate: '2026-11-01',
    recordedBy: 'doc-1',
    values: { creatinine: 8.5, hemoglobin: 11.2 },
  };

  const testMed1: PatientMedication = {
    id: 'med-1',
    patientId: 'pat-arch-1',
    name: 'Sevelamer Carbonate',
    dose: '800mg',
  };

  const testSurvey1: AdherenceSurveySubmission = {
    id: 'surv-1',
    patientId: 'pat-arch-1',
    submittedAt: '2026-11-05T10:00:00Z',
    cycleNumber: 1,
    cycleLabelAr: 'الأساس',
    cycleLabelEn: 'Baseline',
    answers: { 1: 5, 2: 5 },
    overallScorePercent: 90,
    sectionScores: { dialysisPercent: 90, medicationsPercent: 90, dietPercent: 90, fluidsPercent: 90 },
  };

  const testFluid1: FluidLog = {
    id: 'fluid-1',
    patientId: 'pat-arch-1',
    amountMl: 250,
    unit: 'ml',
    loggedAt: '2026-11-10T12:00:00Z',
  };

  const testDiet1: DietLog = {
    id: 'diet-1',
    patientId: 'pat-arch-1',
    checklist: ['low-potassium'],
    mealType: 'lunch',
    loggedAt: '2026-11-10T13:00:00Z',
  };

  const testAdherence1: AdherenceLog = {
    id: 'adh-1',
    patientId: 'pat-arch-1',
    type: 'ttt',
    status: 'done',
    loggedAt: '2026-11-10T14:00:00Z',
  };

  const testReminder1: PatientReminder = {
    id: 'rem-1',
    patientId: 'pat-arch-1',
    type: 'ttt',
    time: '08:00',
    isActive: true,
  };

  // Seed into database
  await mergeCloudDatabase({
    patients: [testPatient1, testPatient2],
    accounts: [testAccount1],
    dialysisSessions: [testSession1, testSessionOther],
    labResults: [testLab1],
    medications: [testMed1],
    adherenceSurveys: [testSurvey1],
    fluidLogs: [testFluid1],
    dietLogs: [testDiet1],
    adherenceLogs: [testAdherence1],
    reminders: [testReminder1],
  });

  const beforeArchive = await getCloudDatabase();
  check(beforeArchive.patients.some((p) => p.id === 'pat-arch-1'), 'Precondition: Patient 1 is in active patients');
  check(beforeArchive.accounts.some((a) => a.user.uid === 'pat-arch-1'), 'Precondition: Account 1 is in active accounts');
  check(beforeArchive.dialysisSessions.some((s) => s.id === 'sess-1'), 'Precondition: Session 1 is in active sessions');

  // --------------------------------------------------------------------------
  // 2. Perform Archive on Patient 1
  // --------------------------------------------------------------------------
  const archiveResult = await archivePatients(['pat-arch-1'], 'Dr. SuperAdmin');
  eq(archiveResult.archivedCount, 1, 'Successfully archived 1 patient');

  const afterArchive = await getCloudDatabase();

  // Verification: Patient 1 is isolated from active collections
  check(!afterArchive.patients.some((p) => p.id === 'pat-arch-1'), 'Patient 1 removed from active patients');
  check(!afterArchive.accounts.some((a) => a.user.uid === 'pat-arch-1'), 'Account 1 removed from active accounts');
  check(!afterArchive.dialysisSessions.some((s) => s.id === 'sess-1'), 'Session 1 removed from active dialysisSessions');
  check(!afterArchive.labResults.some((l) => l.id === 'lab-1'), 'Lab 1 removed from active labResults');
  check(!afterArchive.medications.some((m) => m.id === 'med-1'), 'Medication 1 removed from active medications');
  check(!afterArchive.adherenceSurveys.some((s) => s.id === 'surv-1'), 'Survey 1 removed from active adherenceSurveys');
  check(!afterArchive.fluidLogs.some((f) => f.id === 'fluid-1'), 'Fluid 1 removed from active fluidLogs');
  check(!afterArchive.dietLogs.some((d) => d.id === 'diet-1'), 'Diet 1 removed from active dietLogs');
  check(!afterArchive.adherenceLogs.some((a) => a.id === 'adh-1'), 'Adherence 1 removed from active adherenceLogs');
  check(!afterArchive.reminders.some((r) => r.id === 'rem-1'), 'Reminder 1 removed from active reminders');

  // Verification: Patient 2 is completely unharmed
  check(afterArchive.patients.some((p) => p.id === 'pat-arch-2'), 'Patient 2 remains active and unharmed');
  check(afterArchive.dialysisSessions.some((s) => s.id === 'sess-other'), 'Patient 2 session remains active');

  // Verification: Archived record stores complete relational bundle
  const record1 = afterArchive.archivedPatients?.find((r) => r.patient.id === 'pat-arch-1');
  check(Boolean(record1), 'Archived record for pat-arch-1 exists in db.archivedPatients');
  eq(record1!.patient.id, 'pat-arch-1', 'Archived record stores patient');
  eq(record1!.patient.isActive, false, 'Archived patient is marked isActive: false');
  check(Boolean(record1!.account), 'Archived record stores matching account');
  eq(record1!.account!.username, 'testpatient1', 'Stored account username preserved');
  eq(record1!.account!.password, 'securePassword123!', 'Stored account password preserved for restoration');
  eq(record1!.sessions.length, 1, 'Archived record bundled dialysis sessions');
  eq(record1!.sessions[0].id, 'sess-1', 'Session ID preserved in archive');
  eq(record1!.labResults.length, 1, 'Archived record bundled lab results');
  eq(record1!.medications.length, 1, 'Archived record bundled medications');
  eq(record1!.adherenceSurveys.length, 1, 'Archived record bundled adherence surveys');
  eq(record1!.fluidLogs.length, 1, 'Archived record bundled fluid logs');
  eq(record1!.dietLogs.length, 1, 'Archived record bundled diet logs');
  eq(record1!.adherenceLogs.length, 1, 'Archived record bundled adherence logs');
  eq(record1!.reminders.length, 1, 'Archived record bundled reminders');
  eq(record1!.archivedBy, 'Dr. SuperAdmin', 'Reviewer name captured');
  eq(record1!.reactivationStatus, 'none', 'Initial reactivationStatus is none');

  // --------------------------------------------------------------------------
  // 3. 14-Day TTL Arithmetic Verification
  // --------------------------------------------------------------------------
  console.log('--- 2. 14-Day TTL Arithmetic Verification ---');
  const archivedAtMs = new Date(record1!.archivedAt).getTime();
  const purgeAtMs = new Date(record1!.purgeAt).getTime();
  const ttlDiffMs = purgeAtMs - archivedAtMs;
  const EXPECTED_14_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  eq(ttlDiffMs, EXPECTED_14_DAYS_MS, 'purgeAt is mathematically exactly 14 days after archivedAt');

  // --------------------------------------------------------------------------
  // 4. Archive Idempotency & Edge Cases
  // --------------------------------------------------------------------------
  console.log('--- 3. Archive Idempotency & Edge Cases ---');
  const countBeforeReArchive = afterArchive.archivedPatients!.length;
  // Archiving again should not duplicate
  const reArchive = await archivePatients(['pat-arch-1']);
  eq(reArchive.archivedCount, 0, 'Re-archiving already archived patient returns count 0');
  const dbAfterReArchive = await getCloudDatabase();
  eq(dbAfterReArchive.archivedPatients!.length, countBeforeReArchive, 'Archive records count did not increase');

  // Archiving non-existent ID
  const nonExistent = await archivePatients(['non-existent-id']);
  eq(nonExistent.archivedCount, 0, 'Archiving non-existent ID returns count 0');

  // Empty array
  const emptyArchive = await archivePatients([]);
  eq(emptyArchive.archivedCount, 0, 'Empty patientIds array returns count 0');

  // --------------------------------------------------------------------------
  // 5. Active Resurrections Guard (ensurePatientsFromAccounts never re-creates)
  // --------------------------------------------------------------------------
  console.log('--- 4. Active Resurrections Guard ---');
  const refreshedDb = await getCloudDatabase();
  check(!refreshedDb.patients.some((p) => p.id === 'pat-arch-1'), 'ensurePatientsFromAccounts does not resurrect archived patient');

  // --------------------------------------------------------------------------
  // 6. Purge of Expired Records (>14 days) while keeping active records (<14 days)
  // --------------------------------------------------------------------------
  console.log('--- 5. Purge of Expired Records (>14 Days TTL) ---');
  // Insert an expired archived patient (15 days ago)
  const expiredNow = new Date();
  const expiredArchivedAt = new Date(expiredNow.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const expiredPurgeAt = new Date(expiredNow.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // Expired 1 day ago

  const expiredRecord = {
    archiveId: 'arch-expired-1',
    patient: {
      id: 'pat-expired-1',
      fullName: 'Expired Patient',
      fullNameAr: 'مريض منتهي الصلاحية',
      dialysisSchedule: 'SMW' as const,
      isActive: false,
      createdAt: '2025-01-01',
    },
    sessions: [],
    labResults: [],
    medications: [],
    adherenceSurveys: [],
    fluidLogs: [],
    dietLogs: [],
    adherenceLogs: [],
    reminders: [],
    archivedAt: expiredArchivedAt,
    purgeAt: expiredPurgeAt,
    archivedBy: 'System Auto',
    reactivationStatus: 'none' as const,
  };

  const currentDb = await getCloudDatabase({ forWrite: true });
  const preExpiredCount = currentDb.archivedPatients!.length;
  currentDb.archivedPatients!.push(expiredRecord);
  await saveCloudDatabase(currentDb);

  const dbWithExpired = await getCloudDatabase();
  eq(dbWithExpired.archivedPatients!.length, preExpiredCount + 1, 'Precondition: Expired record was added');

  // Run purge
  const purgedCount = await purgeExpiredArchivedPatients(new Date());
  eq(purgedCount, 1, 'Exactly 1 expired record permanently purged');

  const unexpiredList = await getArchivedPatients();
  eq(unexpiredList.length, preExpiredCount, 'getArchivedPatients() returns only unexpired records');
  check(unexpiredList.some((r) => r.patient.id === 'pat-arch-1'), 'Active unexpired record pat-arch-1 was kept');
  check(!unexpiredList.some((r) => r.patient.id === 'pat-expired-1'), 'Expired record pat-expired-1 was permanently deleted');

  // --------------------------------------------------------------------------
  // 7. Full Restoration Back to Active Database
  // --------------------------------------------------------------------------
  console.log('--- 6. Full Restoration Back to Active Database ---');
  const restoreResult = await restoreArchivedPatient('pat-arch-1', 'Super Admin Restorer');
  eq(restoreResult.success, true, 'Restore operation returned success: true');
  check(Boolean(restoreResult.patient), 'Restored patient returned in result');
  eq(restoreResult.patient!.id, 'pat-arch-1', 'Restored patient ID matches');
  eq(restoreResult.patient!.isActive, true, 'Restored patient isActive is true');

  const restoredDb = await getCloudDatabase();
  // Verification: Record removed from archivedPatients
  check(!restoredDb.archivedPatients?.some((r) => r.patient.id === 'pat-arch-1'), 'Record pat-arch-1 removed from archivedPatients');

  // Verification: Patient restored to active patients
  const restoredPatient = restoredDb.patients.find((p) => p.id === 'pat-arch-1');
  check(Boolean(restoredPatient), 'Patient restored into active patients collection');
  eq(restoredPatient!.isActive, true, 'Restored patient isActive is true in database');

  // Verification: Account restored to active accounts with reviewed metadata
  const restoredAccount = restoredDb.accounts.find((a) => a.user.uid === 'pat-arch-1');
  check(Boolean(restoredAccount), 'Account restored into active accounts collection');
  eq(restoredAccount!.user.status, 'active', 'Restored account status is active');
  eq(restoredAccount!.user.reviewedBy, 'Super Admin Restorer', 'Restored account reviewer matches');
  check(Boolean(restoredAccount!.user.reviewedAt), 'Restored account has reviewedAt timestamp');
  eq(restoredAccount!.password, 'securePassword123!', 'Restored account retained credentials');

  // Verification: Relational clinical history completely restored
  check(restoredDb.dialysisSessions.some((s) => s.id === 'sess-1'), 'Dialysis session sess-1 restored to active sessions');
  check(restoredDb.labResults.some((l) => l.id === 'lab-1'), 'Lab result lab-1 restored to active labResults');
  check(restoredDb.medications.some((m) => m.id === 'med-1'), 'Medication med-1 restored to active medications');
  check(restoredDb.adherenceSurveys.some((s) => s.id === 'surv-1'), 'Adherence survey surv-1 restored to active adherenceSurveys');
  check(restoredDb.fluidLogs.some((f) => f.id === 'fluid-1'), 'Fluid log fluid-1 restored to active fluidLogs');
  check(restoredDb.dietLogs.some((d) => d.id === 'diet-1'), 'Diet log diet-1 restored to active dietLogs');
  check(restoredDb.adherenceLogs.some((a) => a.id === 'adh-1'), 'Adherence log adh-1 restored to active adherenceLogs');
  check(restoredDb.reminders.some((r) => r.id === 'rem-1'), 'Reminder rem-1 restored to active reminders');

  // Restoring again should return false (already restored)
  const restoreAgain = await restoreArchivedPatient('pat-arch-1');
  eq(restoreAgain.success, false, 'Restoring already-restored patient returns success: false');

  // --------------------------------------------------------------------------
  // 8. Reconciliation & mergeCloudDatabase Safety
  // --------------------------------------------------------------------------
  console.log('--- 7. mergeCloudDatabase Reconciliation & Sync Safety ---');
  // Re-archive patient 1
  await archivePatients(['pat-arch-1']);
  const dbBeforeSync = await getCloudDatabase();
  check(dbBeforeSync.archivedPatients!.some((r) => r.patient.id === 'pat-arch-1'), 'Patient 1 re-archived');

  // Incoming sync attempts to push patient 1 as active
  await mergeCloudDatabase({
    patients: [testPatient1],
    accounts: [testAccount1],
  });

  const dbAfterSync = await getCloudDatabase();
  check(!dbAfterSync.patients.some((p) => p.id === 'pat-arch-1'), 'Incoming active patient is suppressed because patient is archived');
  check(dbAfterSync.archivedPatients!.some((r) => r.patient.id === 'pat-arch-1'), 'Archived record preserved during sync merge');

  // --------------------------------------------------------------------------
  // 8. Late-Arriving Offline Clinical Sync Absorption
  // --------------------------------------------------------------------------
  console.log('--- 8. Late-Arriving Offline Clinical Sync Absorption ---');
  // A doctor recorded a session and lab while offline, now sync arrives
  const lateSession: DialysisSession = {
    id: 'sess-late-1',
    patientId: 'pat-arch-1',
    sessionDate: '2026-11-12',
    recordedBy: 'doc-late',
    ultrafiltrationVolumeMl: 2500,
  };
  const lateLab: PatientLabRecord = {
    id: 'lab-late-1',
    patientId: 'pat-arch-1',
    testDate: '2026-11-12',
    recordedBy: 'doc-late',
    values: { phosphorus: 4.8 },
  };

  await mergeCloudDatabase({
    dialysisSessions: [lateSession],
    labResults: [lateLab],
  });

  const dbAfterLateSync = await getCloudDatabase();
  check(!dbAfterLateSync.dialysisSessions.some((s) => s.id === 'sess-late-1'), 'Late session did NOT leak into active dialysisSessions');
  check(!dbAfterLateSync.labResults.some((l) => l.id === 'lab-late-1'), 'Late lab did NOT leak into active labResults');

  const archRecWithLate = dbAfterLateSync.archivedPatients?.find((r) => r.patient.id === 'pat-arch-1');
  check(Boolean(archRecWithLate), 'Archived record exists');
  check(archRecWithLate!.sessions.some((s) => s.id === 'sess-late-1'), 'Late session absorbed into archived record history');
  check(archRecWithLate!.labResults.some((l) => l.id === 'lab-late-1'), 'Late lab absorbed into archived record history');

  // --------------------------------------------------------------------------
  // 9. Multi-Patient Archive Transaction
  // --------------------------------------------------------------------------
  console.log('--- 9. Multi-Patient Archive Transaction ---');
  const multiPatientA: Patient = {
    id: 'pat-multi-a',
    fullName: 'Multi Patient A',
    fullNameAr: 'مريض متعدد أ',
    dialysisSchedule: 'SMW',
    dryWeightKg: 65,
    isActive: true,
    createdAt: '2026-01-01',
  };
  const multiPatientB: Patient = {
    id: 'pat-multi-b',
    fullName: 'Multi Patient B',
    fullNameAr: 'مريض متعدد ب',
    dialysisSchedule: 'STT',
    dryWeightKg: 75,
    isActive: true,
    createdAt: '2026-01-01',
  };
  await mergeCloudDatabase({
    patients: [multiPatientA, multiPatientB],
  });

  const multiRes = await archivePatients(['pat-multi-a', 'pat-multi-b'], 'Super Admin Multi');
  eq(multiRes.archivedCount, 2, 'Archived 2 patients in a single atomic transaction');
  const dbAfterMulti = await getCloudDatabase();
  check(!dbAfterMulti.patients.some((p) => p.id === 'pat-multi-a'), 'pat-multi-a removed from active');
  check(!dbAfterMulti.patients.some((p) => p.id === 'pat-multi-b'), 'pat-multi-b removed from active');
  check(dbAfterMulti.archivedPatients!.some((a) => a.patient.id === 'pat-multi-a'), 'pat-multi-a in archive');
  check(dbAfterMulti.archivedPatients!.some((a) => a.patient.id === 'pat-multi-b'), 'pat-multi-b in archive');

  // --------------------------------------------------------------------------
  // 10. Exact TTL Boundary Assertion (<= now.getTime())
  // --------------------------------------------------------------------------
  console.log('--- 10. Exact TTL Boundary Assertion ---');
  const boundaryTime = new Date('2026-11-14T12:00:00.000Z');
  const exactPurgeRec = {
    archiveId: 'arch-boundary-exact',
    patient: { id: 'pat-boundary-exact', fullName: 'Exact Boundary', fullNameAr: 'حد دقيق', dialysisSchedule: 'SMW' as const, isActive: false, createdAt: '2025-01-01' },
    sessions: [], labResults: [], medications: [], adherenceSurveys: [], fluidLogs: [], dietLogs: [], adherenceLogs: [], reminders: [],
    archivedAt: '2026-10-31T12:00:00.000Z',
    purgeAt: '2026-11-14T12:00:00.000Z', // Exactly boundaryTime
    archivedBy: 'Admin',
    reactivationStatus: 'none' as const,
  };
  const futurePurgeRec = {
    archiveId: 'arch-boundary-future',
    patient: { id: 'pat-boundary-future', fullName: 'Future Boundary', fullNameAr: 'حد مستقبلي', dialysisSchedule: 'SMW' as const, isActive: false, createdAt: '2025-01-01' },
    sessions: [], labResults: [], medications: [], adherenceSurveys: [], fluidLogs: [], dietLogs: [], adherenceLogs: [], reminders: [],
    archivedAt: '2026-10-31T12:00:01.000Z',
    purgeAt: '2026-11-14T12:00:01.000Z', // 1 second after boundaryTime
    archivedBy: 'Admin',
    reactivationStatus: 'none' as const,
  };
  const pastPurgeRec = {
    archiveId: 'arch-boundary-past',
    patient: { id: 'pat-boundary-past', fullName: 'Past Boundary', fullNameAr: 'حد سابق', dialysisSchedule: 'SMW' as const, isActive: false, createdAt: '2025-01-01' },
    sessions: [], labResults: [], medications: [], adherenceSurveys: [], fluidLogs: [], dietLogs: [], adherenceLogs: [], reminders: [],
    archivedAt: '2026-10-31T11:59:59.000Z',
    purgeAt: '2026-11-14T11:59:59.000Z', // 1 second before boundaryTime
    archivedBy: 'Admin',
    reactivationStatus: 'none' as const,
  };

  const dbBoundary = await getCloudDatabase({ forWrite: true });
  dbBoundary.archivedPatients!.push(exactPurgeRec, futurePurgeRec, pastPurgeRec);
  await saveCloudDatabase(dbBoundary);

  const boundaryPurgedCount = await purgeExpiredArchivedPatients(boundaryTime);
  // exactPurgeRec (purgeAt === boundaryTime) and pastPurgeRec (purgeAt < boundaryTime) must be purged
  // futurePurgeRec (purgeAt > boundaryTime) must be kept!
  eq(boundaryPurgedCount, 2, 'Purged exactly records with purgeAt <= now');

  const dbAfterBoundary = await getCloudDatabase();
  check(!dbAfterBoundary.archivedPatients!.some((a) => a.archiveId === 'arch-boundary-exact'), 'Exact boundary record purged');
  check(!dbAfterBoundary.archivedPatients!.some((a) => a.archiveId === 'arch-boundary-past'), 'Past record purged');
  check(dbAfterBoundary.archivedPatients!.some((a) => a.archiveId === 'arch-boundary-future'), 'Future record kept');

  // --------------------------------------------------------------------------
  // 11. Client Local Data-Store Archive & Isolation Round-Trip
  // --------------------------------------------------------------------------
  console.log('--- 11. Client Local Data-Store Archive & Isolation Round-Trip ---');
  const allInitial = getPatients();
  check(allInitial.length > 0, 'Initial patients available in local store');
  const targetPatient = allInitial[0];

  const localArchOk = archivePatientsLocal([targetPatient.id], 'Super Admin Local');
  eq(localArchOk, true, 'Local archivePatients returned true');

  const afterLocalArchPatients = getPatients();
  check(!afterLocalArchPatients.some((p) => p.id === targetPatient.id), 'Archived patient removed from active local patients');

  const localArchivedList = getArchivedPatientsLocal();
  check(localArchivedList.some((p) => p.id === targetPatient.id), 'Archived patient present in getArchivedPatientsLocal');

  const localRecords = getArchivedPatientRecordsLocal();
  const targetRec = localRecords.find((r) => r.patient?.id === targetPatient.id || r.id === targetPatient.id);
  check(Boolean(targetRec), 'Full ArchivedPatientRecord present in local records store');
  eq(targetRec!.archivedBy, 'Super Admin Local', 'Local reviewer captured');

  // Restore locally
  const restoreLocalOk = restorePatientLocal(targetPatient.id);
  eq(restoreLocalOk, true, 'Local restorePatient returned true');

  const afterRestorePatients = getPatients();
  check(afterRestorePatients.some((p) => p.id === targetPatient.id), 'Patient restored to active local patients');

  const afterRestoreArchived = getArchivedPatientsLocal();
  check(!afterRestoreArchived.some((p) => p.id === targetPatient.id), 'Patient removed from local archived patients');

  console.log('\n================================================================');
  console.log(`SUPER ADMIN ARCHIVE SUITE PASSED: ${assertions} assertions passed`);
  console.log('================================================================\n');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nSUPER ADMIN ARCHIVE SUITE FAILED:\n', err);
    process.exit(1);
  });
