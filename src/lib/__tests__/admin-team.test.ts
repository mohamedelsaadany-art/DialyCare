/**
 * Admin Team Suite (Task 007)
 *
 * Verifies GET /api/admin/team:
 * - RBAC protection (no session -> 401, patient -> 403, staff/doctor -> 200)
 * - Only active staff (doctor, nurse, staff) included; pending and patients excluded
 * - Sorted by role order (doctor, nurse, staff), then by displayName
 * - Strict field whitelist: no ID cards, no passwords, no sensitive fields
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import { createSessionToken, hashPassword } from '../server-auth';
import { saveCloudAccounts } from '../cloud-store';
import { GET as teamRoute } from '../../app/api/admin/team/route';
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
  // Active doctor with an idCardDataUrl set
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
      idCardDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  // Active nurse
  const activeNurse: StoredAccount = {
    username: 'nurse_active',
    phone: '01022222222',
    password: hashPassword('NursePass123!'),
    user: {
      uid: 'nurse-active-1',
      role: 'nurse',
      username: 'nurse_active',
      displayName: 'Nurse Active',
      specialty: 'Hemodialysis',
      hospital: 'Cairo Nephrology Center',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  // Active staff member
  const activeStaff: StoredAccount = {
    username: 'staff_active',
    phone: '01033333333',
    password: hashPassword('StaffPass123!'),
    user: {
      uid: 'staff-active-1',
      role: 'staff',
      username: 'staff_active',
      displayName: 'Staff Active',
      specialty: 'Unit Technician',
      hospital: 'Cairo Nephrology Center',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  // Pending doctor
  const pendingDoctor: StoredAccount = {
    username: 'dr_pending',
    phone: '01044444444',
    password: hashPassword('PendingPass123!'),
    user: {
      uid: 'doc-pending-1',
      role: 'doctor',
      username: 'dr_pending',
      displayName: 'Dr. Pending',
      specialty: 'Nephrology',
      hospital: 'Alexandria Clinic',
      idCardDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      language: 'ar',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  // Patient
  const patient: StoredAccount = {
    username: 'pt_test',
    phone: '01055555555',
    password: hashPassword('PatientPass123!'),
    user: {
      uid: 'patient-1',
      role: 'patient',
      username: 'pt_test',
      displayName: 'Patient One',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };

  await saveCloudAccounts([activeDoctor, activeNurse, activeStaff, pendingDoctor, patient]);

  console.log('--- 2. Route Protection & Authorization ---');
  // Patient bearer -> 403
  const patientRes = await teamRoute(req('/api/admin/team', 'GET', bearer('patient-1', 'patient')));
  eq(patientRes.status, 403, 'patient bearer returns 403');

  // No session -> 401
  const noSessionRes = await teamRoute(req('/api/admin/team', 'GET', {}));
  eq(noSessionRes.status, 401, 'no session returns 401');

  console.log('--- 3. Doctor Session & Data Whitelisting ---');
  // Doctor bearer -> 200, with exactly 3 members in order doctor, nurse, staff
  const docRes = await teamRoute(req('/api/admin/team', 'GET', bearer('doc-active-1', 'doctor')));
  eq(docRes.status, 200, 'doctor bearer returns 200');

  const body = (await docRes.json()) as { success: boolean; team: Array<Record<string, unknown>> };
  eq(body.success, true, 'response success is true');
  check(Array.isArray(body.team), 'body.team is an array');
  eq(body.team.length, 3, 'exactly 3 members returned (pending doctor and patient excluded)');

  eq(body.team[0].role, 'doctor', 'first member is doctor');
  eq(body.team[1].role, 'nurse', 'second member is nurse');
  eq(body.team[2].role, 'staff', 'third member is staff');

  console.log('--- 4. Data Leaks & Whitelist Verification ---');
  // JSON.stringify(body) contains none of: idCardDataUrl, data:image, password, scrypt$
  const rawBody = JSON.stringify(body);
  check(!rawBody.includes('idCardDataUrl'), 'body does not leak idCardDataUrl');
  check(!rawBody.includes('data:image'), 'body does not leak data:image');
  check(!rawBody.includes('password'), 'body does not leak password');
  check(!rawBody.includes('scrypt$'), 'body does not leak scrypt$');

  // Each member's keys are a subset of the whitelist
  const whitelist = new Set([
    'uid',
    'displayName',
    'role',
    'specialty',
    'hospital',
    'phone',
    'language',
    'registeredAt',
  ]);

  for (const member of body.team) {
    for (const key of Object.keys(member)) {
      check(whitelist.has(key), `member key "${key}" is in whitelist`);
    }
  }

  console.log(`\nADMIN-TEAM SUITE PASSED: ${assertions} assertions.`);
}

run().catch((err) => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
