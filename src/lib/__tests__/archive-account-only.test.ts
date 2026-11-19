/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Account-only archived patients (flag on the account, no archive record) are
 * listed and restorable; archiving one patient never removes another
 * patient's account that shares the phone; the archived-login WhatsApp
 * contact is the Senior Resident.
 */
import assert from 'node:assert';

for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL_OIDC_TOKEN', 'BLOB_STORE_ID', 'SESSION_SECRET', 'VERCEL',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) delete process.env[k];

import { createSessionToken } from '../server-auth';
import { getCloudAccounts, saveCloudAccounts, archivePatients } from '../cloud-store';
import { GET as archiveGet } from '../../app/api/admin/archive/route';
import { POST as restoreRoute } from '../../app/api/admin/restore/route';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { ADMIN_WHATSAPP } from '../admin-config';
import type { StoredAccount } from '../types';

let n = 0;
const check = (c: unknown, m: string) => { assert.ok(c, m); n++; };
console.warn = () => {};

const ADMIN = { Authorization: `Bearer ${createSessionToken({ uid: 'admin-1', role: 'admin' })}` };
const req = (path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}, body?: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

async function run() {
  check(ADMIN_WHATSAPP === '+201080641670', 'WhatsApp contact is the Senior Resident');

  const stuck: StoredAccount = {
    username: 'stucktest', phone: '01033334444', password: 'Stuck2026!',
    user: { uid: 'stuck-1', role: 'patient', username: 'stucktest', displayName: 'Test', phone: '01033334444',
      language: 'ar', status: 'active', isArchived: true, createdAt: '2026-01-01T00:00:00.000Z' },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), stuck]);

  const login1 = await loginRoute(req('/api/auth/login', 'POST', {}, { identifier: 'stucktest', password: 'Stuck2026!' }));
  const lb = (await login1.json()) as any;
  check(login1.status === 403 && lb.error === 'accountArchivedOnHold', 'flagged account is on hold at login');
  check(lb.adminWhatsApp === '+201080641670', 'login sends Senior Resident WhatsApp');

  const list = (await (await archiveGet(req('/api/admin/archive', 'GET', ADMIN))).json()) as any;
  check(list.archivedPatients.some((a: any) => a.id === 'stuck-1'), 'account-only archived patient is listed');

  const r = await restoreRoute(req('/api/admin/restore', 'POST', ADMIN, { patientId: 'stuck-1' }));
  check(r.status === 200, 'restore succeeds');
  const acc = (await getCloudAccounts()).find((a) => a.user.uid === 'stuck-1');
  check(acc && !acc.user.isArchived, 'account flag cleared');
  const list2 = (await (await archiveGet(req('/api/admin/archive', 'GET', ADMIN))).json()) as any;
  check(!list2.archivedPatients.some((a: any) => a.id === 'stuck-1'), 'no longer listed after restore');

  // Shared phone: archiving patient-1 must not remove another account on the same phone.
  const twin: StoredAccount = {
    username: 'twinphone', phone: '01012345678', password: 'Twin2026!',
    user: { uid: 'twin-1', role: 'patient', username: 'twinphone', displayName: 'Twin', phone: '01012345678',
      language: 'ar', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), twin]);
  await archivePatients(['patient-1'], 'Test');
  const after = await getCloudAccounts();
  check(after.some((a) => a.user.uid === 'twin-1'), 'other account sharing the phone is kept');
  check(!after.some((a) => a.user.uid === 'patient-1'), 'archived patient account is moved out');

  console.log(`\nACCOUNT-ONLY ARCHIVE SUITE PASSED: ${n} assertions.\n`);
}

run().catch((e) => { console.error(e); process.exit(1); });
