/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comprehensive verification for:
 * 1. GET & POST /api/admin/archive
 * 2. POST /api/admin/restore
 * 3. POST /api/auth/register (unexpired archived patient reactivation flow)
 * 4. POST /api/auth/login (archived account on hold flow)
 * 5. Translations & CTA checks
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import { createSessionToken, verifyPassword } from '../server-auth';
import {
  getArchivedPatients,
  getCloudAccounts,
  getCloudDatabase,
  saveCloudAccounts,
  saveCloudDatabase,
} from '../cloud-store';
import { GET as archiveGet, POST as archivePost } from '../../app/api/admin/archive/route';
import { POST as restoreRoute } from '../../app/api/admin/restore/route';
import { POST as registerRoute } from '../../app/api/auth/register/route';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import type { Patient, StoredAccount, User } from '../types';

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

const BASE = 'http://localhost:3000';
function bearer(uid: string, role: User['role']): Record<string, string> {
  const t = createSessionToken({ uid, role });
  if (!t) throw new Error('no key');
  return { Authorization: `Bearer ${t}` };
}
const ADMIN = () => bearer('admin-1', 'admin');
const P1 = () => bearer('patient-1', 'patient');
const NURSE = () => bearer('nurse-1', 'nurse');

function req(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function run(): Promise<void> {
  // Seed a nurse account to test non-admin staff role
  const nurse: StoredAccount = {
    username: 'nurse_test',
    phone: '01022220000',
    password: 'Nurse2026!',
    user: {
      uid: 'nurse-1',
      role: 'nurse',
      username: 'nurse_test',
      displayName: 'Nurse Test',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), nurse]);

  console.log('--- 1. Route Protection for /api/admin/archive ---');
  // Unauthenticated GET -> 401
  const unauthGet = await archiveGet(req('/api/admin/archive', 'GET'));
  eq(unauthGet.status, 401, 'unauthenticated GET /api/admin/archive -> 401');

  // Patient GET -> 403
  const patientGet = await archiveGet(req('/api/admin/archive', 'GET', P1()));
  eq(patientGet.status, 403, 'patient role GET /api/admin/archive -> 403');

  // Nurse GET -> 403
  const nurseGet = await archiveGet(req('/api/admin/archive', 'GET', NURSE()));
  eq(nurseGet.status, 403, 'nurse role GET /api/admin/archive -> 403');

  // Admin GET -> 200
  const adminGet = await archiveGet(req('/api/admin/archive', 'GET', ADMIN()));
  eq(adminGet.status, 200, 'admin role GET /api/admin/archive -> 200');
  const getBody = (await adminGet.json()) as any;
  check(getBody.success === true, 'admin GET returns success: true');
  check(Array.isArray(getBody.archivedPatients), 'admin GET returns archivedPatients array');

  // Unauthenticated POST -> 401
  const unauthPost = await archivePost(req('/api/admin/archive', 'POST', {}, { patientIds: ['patient-1'] }));
  eq(unauthPost.status, 401, 'unauthenticated POST /api/admin/archive -> 401');

  // Patient POST -> 403
  const patientPost = await archivePost(req('/api/admin/archive', 'POST', P1(), { patientIds: ['patient-1'] }));
  eq(patientPost.status, 403, 'patient role POST /api/admin/archive -> 403');

  // Admin POST with empty patientIds -> 400
  const emptyPost = await archivePost(req('/api/admin/archive', 'POST', ADMIN(), { patientIds: [] }));
  eq(emptyPost.status, 400, 'admin POST empty patientIds -> 400');

  console.log('--- 2. Route Protection for /api/admin/restore ---');
  // Unauthenticated POST -> 401
  const unauthRestore = await restoreRoute(req('/api/admin/restore', 'POST', {}, { patientId: 'patient-1' }));
  eq(unauthRestore.status, 401, 'unauthenticated POST /api/admin/restore -> 401');

  // Patient POST -> 403
  const patientRestore = await restoreRoute(req('/api/admin/restore', 'POST', P1(), { patientId: 'patient-1' }));
  eq(patientRestore.status, 403, 'patient role POST /api/admin/restore -> 403');

  // Admin POST with empty patientId -> 400
  const emptyRestore = await restoreRoute(req('/api/admin/restore', 'POST', ADMIN(), { patientId: '' }));
  eq(emptyRestore.status, 400, 'admin POST empty patientId -> 400');

  console.log('--- 3. Super Admin Archive & Restore Operations ---');
  const dbBefore = await getCloudDatabase();
  const testPatientId = 'patient-test-archive-1';
  const testPhone = '01088776655';

  const testPatient: Patient = {
    id: testPatientId,
    fullName: 'Archived Test Patient',
    fullNameAr: 'مريض أرشيف تجريبي',
    phone: testPhone,
    username: testPhone,
    dialysisSchedule: 'SMW',
    dryWeightKg: 70,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const testAccount: StoredAccount = {
    username: testPhone,
    phone: testPhone,
    password: 'scrypt$1$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA$a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2U',
    user: {
      uid: testPatientId,
      role: 'patient',
      username: testPhone,
      displayName: 'Archived Test Patient',
      language: 'ar',
      status: 'active',
      phone: testPhone,
      createdAt: new Date().toISOString(),
    },
  };

  dbBefore.patients.push(testPatient);
  dbBefore.accounts.push(testAccount);
  await saveCloudDatabase(dbBefore);

  // Archive via POST /api/admin/archive
  const archiveRes = await archivePost(
    req('/api/admin/archive', 'POST', ADMIN(), { patientIds: [testPatientId] })
  );
  eq(archiveRes.status, 200, 'admin POST /api/admin/archive -> 200');
  const archiveBody = (await archiveRes.json()) as any;
  check(archiveBody.success === true, 'archive returns success');

  const archivedList = await getArchivedPatients();
  check(
    archivedList.some((a) => a.patient.id === testPatientId || a.id === testPatientId),
    'patient now present in archivedPatients'
  );

  // Active patients list does not contain archived patient
  const dbAfterArchive = await getCloudDatabase();
  check(
    !dbAfterArchive.patients.some((p) => p.id === testPatientId && p.isActive),
    'patient not active in db.patients'
  );

  console.log('--- 4. Patient Registration with Archived Phone (Pending Reactivation) ---');
  // Before register call, save current archived account password string
  const archivedBeforeReg = await getArchivedPatients();
  const targetArchivedBefore = archivedBeforeReg.find((a) => a.patient.id === testPatientId || a.id === testPatientId);
  const savedPasswordString = targetArchivedBefore?.account?.password;
  check(Boolean(savedPasswordString), 'archived account has saved password before registration');

  // Attempt registration with the same phone and a new password
  const newPassword = 'newPassword456';
  const regRes = await registerRoute(
    req('/api/auth/register', 'POST', {}, {
      type: 'patient',
      data: {
        fullName: 'Archived Test Patient Reactivated',
        phone: testPhone,
        password: newPassword,
        language: 'ar',
      },
    })
  );

  eq(regRes.status, 200, 'registration returns 200');
  const regBody = (await regRes.json()) as any;
  eq(regBody.success, true, 'registration returns success: true');
  eq(regBody.status, 'pending_reactivation', 'registration returns status: pending_reactivation');
  check(Boolean(regBody.adminWhatsApp), 'registration returns adminWhatsApp');

  // Check that the archived record is updated
  const updatedArchived = await getArchivedPatients();
  const targetArchived = updatedArchived.find((a) => a.patient.id === testPatientId || a.id === testPatientId);
  check(Boolean(targetArchived), 'target archived record found');
  eq(targetArchived?.reactivationStatus, 'pending', 'reactivationStatus is pending');
  check(Boolean(targetArchived?.reactivationRequestedAt), 'reactivationRequestedAt timestamp set');

  // Verify that the archived account password was NOT updated (remains exact saved string)
  eq(targetArchived?.account?.password, savedPasswordString, 'archived account password is unchanged');
  const pwVerified = verifyPassword(targetArchived!.account!.password, newPassword);
  eq(pwVerified.ok, false, 'verifyPassword with newPassword returns false');

  console.log('--- 5. Login Flow for Archived Account ---');
  // Login with new password for archived account -> 401 invalidCredentials because password was never changed
  const loginRes = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: testPhone,
      password: newPassword,
    })
  );
  eq(loginRes.status, 401, 'login with new password returns 401');
  const loginBody = (await loginRes.json()) as any;
  eq(loginBody.success, false, 'login returns success: false');
  eq(loginBody.error, 'invalidCredentials', 'login returns error: invalidCredentials');

  // Login with wrong password for archived account -> 401 invalidCredentials
  const wrongPwRes = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: testPhone,
      password: 'wrongPasswordXYZ',
    })
  );
  eq(wrongPwRes.status, 401, 'wrong password for archived account returns 401');
  const wrongPwBody = (await wrongPwRes.json()) as any;
  eq(wrongPwBody.success, false, 'wrong password returns success: false');
  eq(wrongPwBody.error, 'invalidCredentials', 'wrong password returns error: invalidCredentials');

  console.log('--- 6. Translation Keys Verification ---');
  const arJson = JSON.parse(readFileSync(join(process.cwd(), 'src/messages/ar.json'), 'utf8'));
  const enJson = JSON.parse(readFileSync(join(process.cwd(), 'src/messages/en.json'), 'utf8'));

  const requiredKeys = [
    'accountArchivedOnHold',
    'archiveReactivationNotice',
    'contactAdminWhatsApp',
    'reactivationRequested',
  ];

  for (const key of requiredKeys) {
    check(Boolean(arJson.auth[key]), `ar.json auth.${key} exists`);
    check(Boolean(enJson.auth[key]), `en.json auth.${key} exists`);
  }

  // Exact strings required by task
  eq(
    arJson.auth.archiveReactivationNotice,
    'ملفك الطبي معلّق حالياً في الأرشيف. راسل الإدارة عبر واتساب، وبعد الموافقة سترسل لك الإدارة كلمة مرور مؤقتة لتسجيل الدخول.',
    'ar.json archiveReactivationNotice matches exact text'
  );
  eq(
    enJson.auth.archiveReactivationNotice,
    'Your medical record is currently on hold in the archive. Message the Admin on WhatsApp. After approval, the Admin will send you a temporary password to sign in.',
    'en.json archiveReactivationNotice matches exact text'
  );

  console.log('--- 8. UI Banner & WhatsApp CTA Verification in login/page.tsx ---');
  const loginPageSource = readFileSync(join(process.cwd(), 'src/app/[locale]/login/page.tsx'), 'utf8');

  check(loginPageSource.includes('accountArchivedOnHold'), 'login/page.tsx uses accountArchivedOnHold');
  check(
    loginPageSource.includes('تم العثور على ملفك الطبي السابق وهو معلق في الأرشيف المؤقت'),
    'login/page.tsx includes Arabic archive message'
  );
  check(
    loginPageSource.includes('Your medical record is currently on hold in the archive'),
    'login/page.tsx includes English archive message'
  );
  check(loginPageSource.includes('https://wa.me/'), 'login/page.tsx includes https://wa.me/ link');
  check(loginPageSource.includes('bg-[#25D366]'), 'login/page.tsx includes prominent green button styling');
  check(loginPageSource.includes('pending_reactivation'), 'login/page.tsx handles pending_reactivation');

  console.log('--- 9. Adversarial Edge Cases: Secret Scrubbing, Missing Account & 404 Guard ---');
  // 9.1: Zero secret leakage in GET & POST /api/admin/archive
  const checkSecretGet = await archiveGet(req('/api/admin/archive', 'GET', ADMIN()));
  const checkSecretBody = (await checkSecretGet.json()) as any;
  check(
    checkSecretBody.archivedPatients.every((p: any) => !p.account || p.account.password === undefined),
    'GET /api/admin/archive strips account passwords from responses'
  );

  // 9.2: Non-existent patient restore returns 404
  const notFoundRestore = await restoreRoute(
    req('/api/admin/restore', 'POST', ADMIN(), { patientId: 'non-existent-pat-999' })
  );
  eq(notFoundRestore.status, 404, 'admin restore non-existent patient returns 404');

  // 9.3: Archived patient with NO initial online account registers & can subsequently login
  const noAccountPatientId = 'pat-clinic-no-acc-1';
  const noAccountPhone = '01033445566';
  const clinicPatient: Patient = {
    id: noAccountPatientId,
    fullName: 'Clinic Patient No Account',
    fullNameAr: 'مريض عيادة بدون حساب',
    phone: noAccountPhone,
    username: noAccountPhone,
    dialysisSchedule: 'STT',
    dryWeightKg: 65,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  const currentDb = await getCloudDatabase();
  currentDb.patients.push(clinicPatient);
  await saveCloudDatabase(currentDb);

  // Archive this patient (they have NO account)
  await archivePost(req('/api/admin/archive', 'POST', ADMIN(), { patientIds: [noAccountPatientId] }));

  // Patient now registers with their phone
  const freshPassword = 'freshPassword789!';
  const freshReg = await registerRoute(
    req('/api/auth/register', 'POST', {}, {
      type: 'patient',
      data: {
        fullName: 'Clinic Patient No Account',
        phone: noAccountPhone,
        password: freshPassword,
        language: 'ar',
      },
    })
  );
  eq(freshReg.status, 200, 'registration for account-less archived patient returns 200');
  const freshRegBody = (await freshReg.json()) as any;
  eq(freshRegBody.status, 'pending_reactivation', 'fresh registration status is pending_reactivation');

  // Verify that no account was created for archived record or live accounts
  const verifyDb = await getArchivedPatients();
  const createdRecord = verifyDb.find((a) => a.patient.id === noAccountPatientId || a.id === noAccountPatientId);
  eq(createdRecord?.account, undefined, 'createdRecord.account is undefined');
  const liveAccounts = await getCloudAccounts();
  check(!liveAccounts.some((a) => a.user?.uid === noAccountPatientId), 'no live account has user.uid === noAccountPatientId');

  // Attempt login with fresh password -> 401 invalidCredentials
  const freshLogin = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: noAccountPhone,
      password: freshPassword,
    })
  );
  eq(freshLogin.status, 401, 'login returns 401 invalidCredentials');
  const freshLoginBody = (await freshLogin.json()) as any;
  eq(freshLoginBody.success, false, 'login success is false');
  eq(freshLoginBody.error, 'invalidCredentials', 'login error is invalidCredentials');

  console.log('--- 10. Restore Issues a Temporary Password ---');
  // Restore account-less patient through the restore route as admin
  const restoreAccountlessRes = await restoreRoute(
    req('/api/admin/restore', 'POST', ADMIN(), { patientId: noAccountPatientId })
  );
  eq(restoreAccountlessRes.status, 200, 'admin restore account-less returns 200');
  const restoreAccountlessBody = (await restoreAccountlessRes.json()) as any;
  check(restoreAccountlessBody.success === true, 'restore returns success: true');
  const accountlessTemp = restoreAccountlessBody.temporaryPassword;
  check(
    typeof accountlessTemp === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(accountlessTemp),
    'temporaryPassword is a 10-character string matching allowed alphabet'
  );
  eq(
    restoreAccountlessBody.temporaryPasswords?.[noAccountPatientId],
    accountlessTemp,
    'temporaryPasswords[noAccountPatientId] equals temporaryPassword'
  );

  // Logging in with noAccountPhone and temporary password returns 200
  const loginWithTempPw = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: noAccountPhone,
      password: accountlessTemp,
    })
  );
  eq(loginWithTempPw.status, 200, 'login with temporary password returns 200');
  const loginWithTempBody = (await loginWithTempPw.json()) as any;
  eq(loginWithTempBody.success, true, 'login with temporary password returns success: true');

  // Logging in with freshPassword returns 401
  const loginWithFreshPw = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: noAccountPhone,
      password: freshPassword,
    })
  );
  eq(loginWithFreshPw.status, 401, 'login with freshPassword returns 401');
  const loginWithFreshBody = (await loginWithFreshPw.json()) as any;
  eq(loginWithFreshBody.success, false, 'login with freshPassword returns success: false');
  eq(loginWithFreshBody.error, 'invalidCredentials', 'login with freshPassword returns error: invalidCredentials');

  // Restore section-4 patient too
  const restoreSection4Res = await restoreRoute(
    req('/api/admin/restore', 'POST', ADMIN(), { patientId: testPatientId })
  );
  eq(restoreSection4Res.status, 200, 'admin restore section-4 patient returns 200');
  const restoreSection4Body = (await restoreSection4Res.json()) as any;
  check(restoreSection4Body.success === true, 'restore section-4 patient returns success: true');
  const section4Temp = restoreSection4Body.temporaryPassword;
  check(
    typeof section4Temp === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(section4Temp),
    'section-4 temporaryPassword is a 10-character string matching allowed alphabet'
  );

  // Logging in with section 4 temporary password returns 200
  const loginSection4Temp = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: testPhone,
      password: section4Temp,
    })
  );
  eq(loginSection4Temp.status, 200, 'login with section-4 temporary password returns 200');
  const loginSection4TempBody = (await loginSection4Temp.json()) as any;
  eq(loginSection4TempBody.success, true, 'login section 4 temp returns success: true');

  // Logging in with newPassword returns 401
  const loginSection4NewPw = await loginRoute(
    req('/api/auth/login', 'POST', {}, {
      identifier: testPhone,
      password: newPassword,
    })
  );
  eq(loginSection4NewPw.status, 401, 'login section-4 with newPassword returns 401');
  const loginSection4NewBody = (await loginSection4NewPw.json()) as any;
  eq(loginSection4NewBody.success, false, 'login section 4 with newPassword returns success: false');
  eq(loginSection4NewBody.error, 'invalidCredentials', 'login section 4 with newPassword returns error: invalidCredentials');

  console.log(`\nALL ARCHIVE & REACTIVATION TESTS PASSED: ${assertions} assertions.\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
