/**
 * Admin Reset Password Suite (Task 006)
 *
 * Verifies POST /api/admin/reset-password:
 * - Admin authentication and RBAC checks
 * - Parameter validation (empty, self-reset, unknown uid)
 * - Temporary password generation (10 uppercase chars / digits)
 * - Password invalidation: old password rejected, temporary password accepted
 * - Session revocation: sessions issued before reset revoked on /api/sync
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import { createSessionToken, hashPassword } from '../server-auth';
import { saveCloudAccounts } from '../cloud-store';
import { POST as resetRoute } from '../../app/api/admin/reset-password/route';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { GET as syncGet } from '../../app/api/sync/route';
import type { StoredAccount, User } from '../types';

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

function req(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function run(): Promise<void> {
  console.log('--- 1. Seed Accounts ---');
  const admin: StoredAccount = {
    username: 'admin_test',
    phone: '01000000001',
    password: hashPassword('AdminPass123!'),
    user: {
      uid: 'admin-1',
      role: 'admin',
      username: 'admin_test',
      displayName: 'Admin User',
      language: 'en',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const doctor: StoredAccount = {
    username: 'dr_test',
    phone: '01011110001',
    password: hashPassword('DoctorPass123!'),
    user: {
      uid: 'doc-1',
      role: 'doctor',
      username: 'dr_test',
      displayName: 'Dr Test',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const patient: StoredAccount = {
    username: 'pt_test',
    phone: '01022220002',
    password: hashPassword('OldPass123'),
    user: {
      uid: 'patient-test-1',
      role: 'patient',
      username: 'pt_test',
      displayName: 'Patient Test',
      phone: '01022220002',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  await saveCloudAccounts([admin, doctor, patient]);

  console.log('--- 2. Route Protection & Authorization Matrix ---');
  // Caller: no session
  const noSessionRes = await resetRoute(req('/api/admin/reset-password', 'POST', {}, { uid: 'patient-test-1' }));
  eq(noSessionRes.status, 401, 'no session returns 401');

  // Caller: doctor
  const docRes = await resetRoute(
    req('/api/admin/reset-password', 'POST', bearer('doc-1', 'doctor'), { uid: 'patient-test-1' })
  );
  eq(docRes.status, 403, 'doctor session returns 403');

  // Caller: admin, empty body
  const emptyBodyRes = await resetRoute(req('/api/admin/reset-password', 'POST', bearer('admin-1', 'admin'), {}));
  eq(emptyBodyRes.status, 400, 'empty body returns 400');
  const emptyBodyData = await emptyBodyRes.json();
  eq(emptyBodyData.error, 'missingUid', 'empty body error is missingUid');

  // Caller: admin, self-reset (caller's own uid)
  const selfResetRes = await resetRoute(
    req('/api/admin/reset-password', 'POST', bearer('admin-1', 'admin'), { uid: 'admin-1' })
  );
  eq(selfResetRes.status, 400, 'admin self-reset returns 400');
  const selfResetData = await selfResetRes.json();
  eq(selfResetData.error, 'cannotResetThisAccount', 'self reset error is cannotResetThisAccount');

  // Caller: admin, unknown uid
  const notFoundRes = await resetRoute(
    req('/api/admin/reset-password', 'POST', bearer('admin-1', 'admin'), { uid: 'no-such-uid' })
  );
  eq(notFoundRes.status, 404, 'unknown uid returns 404');
  const notFoundData = await notFoundRes.json();
  eq(notFoundData.error, 'accountNotFound', 'not found error is accountNotFound');

  console.log('--- 3. Pre-reset Session Token Setup & Wait ---');
  // Create patient session token before the reset
  const oldPatientToken = createSessionToken({ uid: 'patient-test-1', role: 'patient' });
  check(oldPatientToken, 'old patient session token generated');

  const preSyncRes = await syncGet(
    req('/api/sync', 'GET', { Authorization: `Bearer ${oldPatientToken}` })
  );
  eq(preSyncRes.status, 200, 'old token works on /api/sync before reset');

  // Wait 1.1 seconds so token iat is strictly earlier than passwordUpdatedAt
  await new Promise((r) => setTimeout(r, 1100));

  console.log('--- 4. Valid Admin Reset for Patient ---');
  const resetRes = await resetRoute(
    req('/api/admin/reset-password', 'POST', bearer('admin-1', 'admin'), { uid: 'patient-test-1' })
  );
  eq(resetRes.status, 200, 'admin reset for patient returns 200');
  const resetData = await resetRes.json();
  eq(resetData.success, true, 'reset result success is true');
  check(typeof resetData.temporaryPassword === 'string', 'temporaryPassword is a string');
  check(
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(resetData.temporaryPassword),
    'temporaryPassword matches 10-char Crockford base32 pattern'
  );

  console.log('--- 5. Session Invalidation & Password Verification ---');
  // Pre-reset session token must now get 401 from GET /api/sync
  const postSyncRes = await syncGet(
    req('/api/sync', 'GET', { Authorization: `Bearer ${oldPatientToken}` })
  );
  eq(postSyncRes.status, 401, 'pre-reset session token gets 401 on /api/sync');

  // Old password OldPass123 must now fail login (401)
  const oldLoginRes = await loginRoute(
    req('/api/auth/login', 'POST', {}, { identifier: '01022220002', password: 'OldPass123' })
  );
  eq(oldLoginRes.status, 401, 'login with old password returns 401');

  // New temporary password must succeed login (200)
  const tempLoginRes = await loginRoute(
    req('/api/auth/login', 'POST', {}, { identifier: '01022220002', password: resetData.temporaryPassword })
  );
  eq(tempLoginRes.status, 200, 'login with temporary password returns 200');
  const tempLoginData = await tempLoginRes.json();
  eq(tempLoginData.success, true, 'login with temp password succeeded');

  console.log(`\nADMIN-RESET-PASSWORD SUITE PASSED: ${assertions} assertions.`);
}

run().catch((err) => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
