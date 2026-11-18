/**
 * Admin Approvals & Lazy ID Card Suite (Task 008)
 *
 * Verifies:
 * - GET /api/admin/approvals:
 *   - RBAC protection (no session -> 401, doctor/patient -> 403, admin -> 200)
 *   - Only pending non-patient accounts are listed
 *   - Strict field whitelist: no idCardDataUrl, passwords, or hashes
 *   - hasIdCard is true when card is present, false otherwise
 * - GET /api/admin/approvals/id-card:
 *   - RBAC protection (no session -> 401, doctor/patient -> 403)
 *   - 404 for unknown uid, patient uid, or staff without card
 *   - 200 with idCardDataUrl for pending or active staff with an uploaded card
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import { createSessionToken, hashPassword } from '../server-auth';
import { saveCloudAccounts } from '../cloud-store';
import { GET as approvalsRoute } from '../../app/api/admin/approvals/route';
import { GET as idCardRoute } from '../../app/api/admin/approvals/id-card/route';
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

function req(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const SAMPLE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function run(): Promise<void> {
  console.log('--- 1. Seed Accounts ---');

  const adminAccount: StoredAccount = {
    username: 'admin_user',
    phone: '01000000000',
    password: hashPassword('AdminPass123!'),
    user: {
      uid: 'admin-1',
      role: 'admin',
      username: 'admin_user',
      displayName: 'System Admin',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const activeDoctor: StoredAccount = {
    username: 'dr_active',
    phone: '01011111111',
    password: hashPassword('DocPass123!'),
    user: {
      uid: 'doc-active-1',
      role: 'doctor',
      username: 'dr_active',
      displayName: 'Dr. Active',
      specialty: 'Nephrology',
      hospital: 'Cairo Nephrology Center',
      idCardDataUrl: SAMPLE_PNG,
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const pendingDoctorWithCard: StoredAccount = {
    username: 'dr_pending',
    phone: '01022222222',
    password: hashPassword('PendingPass123!'),
    user: {
      uid: 'doc-pending-1',
      role: 'doctor',
      username: 'dr_pending',
      displayName: 'Dr. Pending',
      specialty: 'Nephrology',
      hospital: 'Alexandria Clinic',
      idCardDataUrl: SAMPLE_PNG,
      language: 'ar',
      status: 'pending',
      createdAt: '2026-01-02T00:00:00.000Z',
      registeredAt: '2026-01-02T00:00:00.000Z',
    },
  };

  const pendingNurseWithoutCard: StoredAccount = {
    username: 'nurse_pending',
    phone: '01033333333',
    password: hashPassword('NursePass123!'),
    user: {
      uid: 'nurse-pending-1',
      role: 'nurse',
      username: 'nurse_pending',
      displayName: 'Nurse Pending',
      specialty: 'Dialysis Unit',
      hospital: 'Mansoura Center',
      language: 'ar',
      status: 'pending',
      createdAt: '2026-01-03T00:00:00.000Z',
      registeredAt: '2026-01-03T00:00:00.000Z',
    },
  };

  const pendingPatient: StoredAccount = {
    username: 'patient_pending',
    phone: '01044444444',
    password: hashPassword('PatientPass123!'),
    user: {
      uid: 'pt-pending-1',
      role: 'patient',
      username: 'patient_pending',
      displayName: 'Patient Pending',
      language: 'ar',
      status: 'pending',
      createdAt: '2026-01-04T00:00:00.000Z',
    },
  };

  const activePatient: StoredAccount = {
    username: 'patient_active',
    phone: '01055555555',
    password: hashPassword('PatientPass123!'),
    user: {
      uid: 'pt-active-1',
      role: 'patient',
      username: 'patient_active',
      displayName: 'Patient Active',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-05T00:00:00.000Z',
    },
  };

  await saveCloudAccounts([
    adminAccount,
    activeDoctor,
    pendingDoctorWithCard,
    pendingNurseWithoutCard,
    pendingPatient,
    activePatient,
  ]);

  console.log('--- 2. Route Protection & Authorization for Approvals List ---');
  // No session -> 401
  const noSessionRes = await approvalsRoute(req('/api/admin/approvals', 'GET', {}));
  eq(noSessionRes.status, 401, 'approvals list returns 401 when no session provided');

  // Doctor bearer -> 403
  const doctorRes = await approvalsRoute(req('/api/admin/approvals', 'GET', bearer('doc-active-1', 'doctor')));
  eq(doctorRes.status, 403, 'approvals list returns 403 for doctor');

  // Patient bearer -> 403
  const patientRes = await approvalsRoute(req('/api/admin/approvals', 'GET', bearer('pt-active-1', 'patient')));
  eq(patientRes.status, 403, 'approvals list returns 403 for patient');

  console.log('--- 3. Admin Session & Pending Staff Whitelist Verification ---');
  const adminRes = await approvalsRoute(req('/api/admin/approvals', 'GET', bearer('admin-1', 'admin')));
  eq(adminRes.status, 200, 'approvals list returns 200 for admin');

  const body = (await adminRes.json()) as { success: boolean; pending: Array<Record<string, unknown>> };
  eq(body.success, true, 'response success is true');
  check(Array.isArray(body.pending), 'pending is an array');

  // Only pending non-patient accounts are listed
  eq(body.pending.length, 2, 'exactly 2 pending staff members returned');

  const uids = body.pending.map((p) => p.uid);
  check(uids.includes('doc-pending-1'), 'pending doctor is included');
  check(uids.includes('nurse-pending-1'), 'pending nurse is included');
  check(!uids.includes('doc-active-1'), 'active doctor is excluded');
  check(!uids.includes('pt-pending-1'), 'pending patient is excluded');
  check(!uids.includes('pt-active-1'), 'active patient is excluded');
  check(!uids.includes('admin-1'), 'admin is excluded');

  console.log('--- 4. Data Leaks & Whitelist Verification ---');
  const rawBody = JSON.stringify(body);
  check(!rawBody.includes('idCardDataUrl'), 'body does not leak idCardDataUrl');
  check(!rawBody.includes('data:image'), 'body does not leak data:image');
  check(!rawBody.includes('password'), 'body does not leak password');
  check(!rawBody.includes('scrypt$'), 'body does not leak scrypt$');

  const whitelist = new Set([
    'uid',
    'displayName',
    'role',
    'specialty',
    'hospital',
    'phone',
    'language',
    'registeredAt',
    'hasIdCard',
  ]);

  for (const item of body.pending) {
    for (const key of Object.keys(item)) {
      check(whitelist.has(key), `field "${key}" is in whitelist`);
    }
  }

  console.log('--- 5. hasIdCard Correctness ---');
  const docPending = body.pending.find((p) => p.uid === 'doc-pending-1');
  const nursePending = body.pending.find((p) => p.uid === 'nurse-pending-1');

  eq(docPending?.hasIdCard, true, 'doc-pending-1 hasIdCard is true');
  eq(nursePending?.hasIdCard, false, 'nurse-pending-1 hasIdCard is false');

  console.log('--- 6. ID-Card Endpoint Authorization & Fetching ---');
  // No session -> 401
  const idNoSession = await idCardRoute(req('/api/admin/approvals/id-card?uid=doc-pending-1', 'GET', {}));
  eq(idNoSession.status, 401, 'id-card returns 401 when no session provided');

  // Doctor bearer -> 403
  const idDoctor = await idCardRoute(req('/api/admin/approvals/id-card?uid=doc-pending-1', 'GET', bearer('doc-active-1', 'doctor')));
  eq(idDoctor.status, 403, 'id-card returns 403 for doctor session');

  // Patient bearer -> 403
  const idPatient = await idCardRoute(req('/api/admin/approvals/id-card?uid=doc-pending-1', 'GET', bearer('pt-active-1', 'patient')));
  eq(idPatient.status, 403, 'id-card returns 403 for patient session');

  // Unknown uid -> 404
  const idUnknown = await idCardRoute(req('/api/admin/approvals/id-card?uid=unknown-uid-999', 'GET', bearer('admin-1', 'admin')));
  eq(idUnknown.status, 404, 'id-card returns 404 for unknown uid');

  // Patient uid -> 404
  const idPt = await idCardRoute(req('/api/admin/approvals/id-card?uid=pt-pending-1', 'GET', bearer('admin-1', 'admin')));
  eq(idPt.status, 404, 'id-card returns 404 for patient uid');

  // Pending staff without card -> 404
  const idNurse = await idCardRoute(req('/api/admin/approvals/id-card?uid=nurse-pending-1', 'GET', bearer('admin-1', 'admin')));
  eq(idNurse.status, 404, 'id-card returns 404 when staff has no uploaded card');

  // Pending staff with card -> 200 and returns image
  const idDoc = await idCardRoute(req('/api/admin/approvals/id-card?uid=doc-pending-1', 'GET', bearer('admin-1', 'admin')));
  eq(idDoc.status, 200, 'id-card returns 200 for pending doctor with card');
  const idDocBody = (await idDoc.json()) as { success: boolean; idCardDataUrl: string };
  eq(idDocBody.success, true, 'id-card response success is true');
  eq(idDocBody.idCardDataUrl, SAMPLE_PNG, 'id-card response matches uploaded sample PNG');

  // Active staff with card -> 200 and returns image
  const idActiveDoc = await idCardRoute(req('/api/admin/approvals/id-card?uid=doc-active-1', 'GET', bearer('admin-1', 'admin')));
  eq(idActiveDoc.status, 200, 'id-card returns 200 for active doctor with card');
  const idActiveDocBody = (await idActiveDoc.json()) as { success: boolean; idCardDataUrl: string };
  eq(idActiveDocBody.success, true, 'active staff id-card response success is true');
  eq(idActiveDocBody.idCardDataUrl, SAMPLE_PNG, 'active staff id-card matches uploaded sample PNG');

  console.log(`\nADMIN-APPROVALS SUITE PASSED: ${assertions} assertions.`);
}

run().catch((err) => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
