/**
 * B1c / B3 / B4 — API route protection, per-role scoping, write filtering and
 * hardened public registration. Mirrors the debugger's repro_b1/repro_b4 steps.
 *
 * Fully offline against the in-memory cloud store (Blob env vars deleted).
 * Run: npx tsx src/lib/__tests__/route-protection.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import { authenticate, createSessionToken } from '../server-auth';
import { getCloudAccounts, getCloudDatabase, mergeCloudDatabase, saveCloudAccounts } from '../cloud-store';
import { filterIncomingForAccount, scopeDatabaseForAccount } from '../api-scope';
import { GET as syncGet, POST as syncPost } from '../../app/api/sync/route';
import { GET as accountsGet, POST as accountsPost } from '../../app/api/auth/accounts/route';
import { POST as approveRoute } from '../../app/api/auth/approve/route';
import { POST as rejectRoute } from '../../app/api/auth/reject/route';
import { POST as registerRoute } from '../../app/api/auth/register/route';
import type {
  DialysisSession,
  FluidLog,
  Notification,
  PatientLabRecord,
  StoredAccount,
  UnifiedCloudDatabase,
  User,
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

const originalWarn = console.warn;
console.warn = () => {};

const BASE = 'http://localhost:3000';
function bearer(uid: string, role: User['role']): Record<string, string> {
  const t = createSessionToken({ uid, role });
  if (!t) throw new Error('no key');
  return { Authorization: `Bearer ${t}` };
}
const ADMIN = () => bearer('admin-1', 'admin');
const P1 = () => bearer('patient-1', 'patient');
function req(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const hasPasswordKey = (v: unknown) => JSON.stringify(v).includes('"password"');

async function run(): Promise<void> {
  // A doctor account to act as non-admin staff
  const doctor: StoredAccount = {
    username: 'dr_rp',
    phone: '01011110000',
    password: 'DrRp2026!',
    user: { uid: 'doc-rp-1', role: 'doctor', username: 'dr_rp', displayName: 'Dr RP', language: 'ar', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), doctor]);
  const DOC = () => bearer('doc-rp-1', 'doctor');

  // Seed rows for two patients
  const now = new Date().toISOString();
  const p2Session: DialysisSession = {
    id: 'sess-p2-1',
    patientId: 'patient-2',
    sessionDate: '2026-11-01',
    recordedAt: '2026-11-01T10:00:00.000Z',
    recordedBy: 'doc-rp-1',
    preWeightKg: 72,
  } as unknown as DialysisSession;
  const p1Lab = { id: 'lab-p1-1', patientId: 'patient-1', testDate: '2026-11-01', recordedBy: 'doc-rp-1', values: {} } as unknown as PatientLabRecord;
  const p2Lab = { id: 'lab-p2-1', patientId: 'patient-2', testDate: '2026-11-01', recordedBy: 'doc-rp-1', values: {} } as unknown as PatientLabRecord;
  const notifs: Notification[] = [
    { id: 'n-bc', senderId: 'admin-1', type: 'broadcast', recipientIds: [], titleEn: 'b', titleAr: 'b', messageEn: 'b', messageAr: 'b', sentAt: now, status: 'sent' },
    { id: 'n-p1', senderId: 'admin-1', type: 'individual', recipientIds: ['patient-1'], titleEn: 'x', titleAr: 'x', messageEn: 'x', messageAr: 'x', sentAt: now, status: 'sent' },
    { id: 'n-p2', senderId: 'admin-1', type: 'individual', recipientIds: ['patient-2'], titleEn: 'y', titleAr: 'y', messageEn: 'y', messageAr: 'y', sentAt: now, status: 'sent' },
  ];
  await mergeCloudDatabase({
    dialysisSessions: [p2Session],
    labResults: [p1Lab, p2Lab],
    notifications: notifs,
    fluidLogs: [{ id: 'fl-p2-1', patientId: 'patient-2', amountMl: 200, loggedAt: now } as unknown as FluidLog],
  });

  // ------------------------------------------------ 1. unauthenticated
  console.log('--- 1. no session -> 401 everywhere (repro_b1 steps 1,2,4,5,6)');
  eq((await syncGet(req('/api/sync', 'GET'))).status, 401, 'GET /api/sync 401');
  eq((await syncPost(req('/api/sync', 'POST', {}, { labResults: [{ id: 'forged', patientId: 'patient-1' }] }))).status, 401, 'POST /api/sync 401');
  eq((await accountsGet(req('/api/auth/accounts', 'GET'))).status, 401, 'GET /api/auth/accounts 401');
  eq((await accountsPost(req('/api/auth/accounts', 'POST', {}, { accounts: [] }))).status, 401, 'POST /api/auth/accounts 401');
  eq((await approveRoute(req('/api/auth/approve', 'POST', {}, { uid: 'x' }))).status, 401, 'approve 401');
  eq((await rejectRoute(req('/api/auth/reject', 'POST', {}, { uid: 'x' }))).status, 401, 'reject 401');
  eq((await syncGet(req('/api/sync', 'GET', { Authorization: 'Bearer v1.garbage.sig' }))).status, 401, 'garbage token 401');
  const dbAfter = await getCloudDatabase();
  check(!dbAfter.labResults.some((l) => l.id === 'forged'), 'unauthenticated forged lab NOT stored');

  // ------------------------------------------------ 2. roles on admin routes
  console.log('--- 2. approve/reject are admin-only');
  eq((await approveRoute(req('/api/auth/approve', 'POST', P1(), { uid: 'x' }))).status, 403, 'patient approve 403');
  eq((await approveRoute(req('/api/auth/approve', 'POST', DOC(), { uid: 'x' }))).status, 403, 'doctor approve 403');
  eq((await rejectRoute(req('/api/auth/reject', 'POST', DOC(), { uid: 'x' }))).status, 403, 'doctor reject 403');
  eq((await rejectRoute(req('/api/auth/reject', 'POST', ADMIN(), { uid: 'admin-1' }))).status, 400, 'super admin cannot be rejected');
  eq((await approveRoute(req('/api/auth/approve', 'POST', ADMIN(), { uid: 'nope' }))).status, 404, 'admin approve unknown uid 404');
  // forged admin claim on a patient token -> role from server account
  eq((await approveRoute(req('/api/auth/approve', 'POST', bearer('patient-1', 'admin'), { uid: 'x' }))).status, 403, 'patient token claiming admin -> 403');
  eq((await approveRoute(req('/api/auth/approve', 'POST', { ...ADMIN(), origin: 'https://evil.example', host: 'localhost:3000' }, { uid: 'x' }))).status, 403, 'cross-origin approve 403');

  // ------------------------------------------------ 3. no passwords anywhere
  console.log('--- 3. passwords never leave the server');
  const adminSync = await (await syncGet(req('/api/sync', 'GET', ADMIN()))).json();
  eq(adminSync.success, true, 'admin GET /api/sync ok');
  check(adminSync.data.accounts.length >= 9, 'staff sees all accounts');
  check(!hasPasswordKey(adminSync), 'admin /api/sync has no password field');
  check(adminSync.data.patients.some((p: { id: string }) => p.id === 'patient-2'), 'staff sees every patient');
  const docAccounts = await (await accountsGet(req('/api/auth/accounts', 'GET', DOC()))).json();
  check(docAccounts.accounts.length >= 9 && !hasPasswordKey(docAccounts), 'doctor /api/auth/accounts: all accounts, no passwords');
  const p1Accounts = await (await accountsPost(req('/api/auth/accounts', 'POST', P1(), { accounts: [] }))).json();
  eq(p1Accounts.accounts.length, 1, 'patient sees only own account');
  eq(p1Accounts.accounts[0].user.uid, 'patient-1', 'own account');
  check(!hasPasswordKey(p1Accounts), 'patient accounts response has no password');

  // ------------------------------------------------ 4. patient read scope
  console.log('--- 4. patient GET /api/sync is scoped to their own records');
  const p1Sync = (await (await syncGet(req('/api/sync', 'GET', P1()))).json()).data as UnifiedCloudDatabase;
  eq(p1Sync.accounts.length, 1, 'one account');
  check(!hasPasswordKey(p1Sync), 'no password');
  eq(JSON.stringify(p1Sync.patients.map((p) => p.id)), JSON.stringify(['patient-1']), 'only own patient record');
  check(p1Sync.labResults.some((l) => l.id === 'lab-p1-1'), 'own lab visible');
  check(!p1Sync.labResults.some((l) => l.patientId !== 'patient-1'), 'no other patient labs');
  check(!p1Sync.dialysisSessions.some((s) => s.patientId !== 'patient-1'), 'no other patient sessions');
  check(!p1Sync.fluidLogs.some((f) => f.patientId !== 'patient-1'), 'no other patient fluid logs');
  const nIds = p1Sync.notifications.map((n) => n.id);
  check(nIds.includes('n-bc') && nIds.includes('n-p1') && !nIds.includes('n-p2'), 'notifications: broadcast + own only');
  check(Array.isArray(p1Sync.coachingTips), 'coaching tips present');
  const lyingSync = (await (await syncGet(req('/api/sync', 'GET', bearer('patient-1', 'admin')))).json()).data;
  eq(lyingSync.accounts.length, 1, 'forged admin claim on patient token still gets the patient scope');

  // ------------------------------------------------ 5. accounts cannot be written (repro step 4)
  console.log('--- 5. POST /api/auth/accounts and sync `accounts` never write');
  const forgedP1: StoredAccount = {
    username: 'patient1',
    phone: '01012345678',
    password: 'hacked-123',
    user: { uid: 'patient-1', role: 'admin', username: 'patient1', displayName: 'x', language: 'ar', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', reviewedAt: '2099-01-01T00:00:00.000Z' },
  };
  await accountsPost(req('/api/auth/accounts', 'POST', ADMIN(), { accounts: [forgedP1] }));
  await syncPost(req('/api/sync', 'POST', ADMIN(), { accounts: [forgedP1] }));
  await syncPost(req('/api/sync', 'POST', P1(), { accounts: [forgedP1] }));
  const accs = await getCloudAccounts();
  eq(authenticate(accs, 'patient1', 'patient123').kind, 'ok', 'patient1 password unchanged');
  eq(authenticate(accs, 'patient1', 'hacked-123').kind, 'invalid', 'forged password not accepted');
  eq(accs.find((a) => a.user.uid === 'patient-1')!.user.role, 'patient', 'patient1 role unchanged');

  // ------------------------------------------------ 6. patient writes
  console.log('--- 6. patient POST /api/sync: own new rows only, no hijack');
  const p1PostBody = {
    labResults: [{ id: 'lab-forged-p1', patientId: 'patient-1', testDate: '2026-11-02', recordedBy: 'patient-1', values: {} }],
    medications: [{ id: 'med-forged', patientId: 'patient-1' }],
    notifications: [{ ...notifs[2], id: 'n-forged', recipientIds: ['patient-2'] }],
    coachingTips: [{ id: 'tip-forged', category: 'general', titleEn: 'x', titleAr: 'x', contentEn: 'x', contentAr: 'x', order: 1, isActive: true }],
    fluidLogs: [
      { id: 'fl-p1-new', patientId: 'patient-1', amountMl: 250, loggedAt: now },
      { id: 'fl-p2-forged', patientId: 'patient-2', amountMl: 9999, loggedAt: now },
      { id: 'fl-p2-1', patientId: 'patient-1', amountMl: 1, loggedAt: now }, // steal an existing id
    ],
    dialysisSessions: [
      // Hijack attempt: existing id of patient-2, own patientId, later recordedAt
      { ...p2Session, patientId: 'patient-1', recordedAt: '2099-01-01T00:00:00.000Z', preWeightKg: 1 },
      { id: 'sess-p1-new', patientId: 'patient-1', sessionDate: '2026-11-03', recordedAt: now, recordedBy: 'doc-rp-1', preWeightKg: 70 },
    ],
    patients: [
      { id: 'patient-1', fullName: 'Renamed', dryWeightKg: 1, dialysisSchedule: 'STT', fluidLimit: 1200, avatarId: 'female_mature_1', phone: '01098765432', username: 'patient2' },
      { id: 'patient-2', fullName: 'Hacked P2', fluidLimit: 1 },
    ],
  };
  const beforeP1 = (await getCloudDatabase()).patients.find((p) => p.id === 'patient-1')!;
  const p1Post = await syncPost(req('/api/sync', 'POST', P1(), p1PostBody));
  eq(p1Post.status, 200, 'patient POST ok');
  const p1PostJson = await p1Post.json();
  check(!hasPasswordKey(p1PostJson), 'patient POST response has no password');
  check(!p1PostJson.data.patients.some((p: { id: string }) => p.id !== 'patient-1'), 'patient POST response is scoped');
  const db = await getCloudDatabase();
  check(!db.labResults.some((l) => l.id === 'lab-forged-p1'), 'patient cannot write labs');
  check(!db.medications.some((m) => m.id === 'med-forged'), 'patient cannot write medications');
  check(!db.notifications.some((n) => n.id === 'n-forged'), 'patient cannot write notifications');
  check(!db.coachingTips.some((t) => t.id === 'tip-forged'), 'patient cannot write coaching tips');
  check(db.fluidLogs.some((f) => f.id === 'fl-p1-new'), 'own new fluid log stored');
  check(!db.fluidLogs.some((f) => f.id === 'fl-p2-forged'), "fluid log for another patient dropped");
  eq(db.fluidLogs.find((f) => f.id === 'fl-p2-1')!.patientId, 'patient-2', 'existing fluid log id cannot be stolen');
  const s2 = db.dialysisSessions.find((s) => s.id === 'sess-p2-1')!;
  eq(s2.patientId, 'patient-2', "hijack: other patient's session keeps its owner");
  eq((s2 as unknown as { preWeightKg: number }).preWeightKg, 72, "hijack: other patient's session data unchanged");
  const s1 = db.dialysisSessions.find((s) => s.id === 'sess-p1-new')!;
  check(s1, 'own new session stored');
  eq(s1.recordedBy, 'patient-1', 'recordedBy forced to the caller');
  const afterP1 = db.patients.find((p) => p.id === 'patient-1')!;
  eq(afterP1.fluidLimit, 1200, 'whitelisted fluidLimit applied');
  eq(afterP1.avatarId, 'female_mature_1', 'whitelisted avatarId applied');
  eq(afterP1.dryWeightKg, beforeP1.dryWeightKg, 'dryWeightKg NOT changeable by patient');
  eq(afterP1.dialysisSchedule, beforeP1.dialysisSchedule, 'dialysisSchedule NOT changeable by patient');
  eq(afterP1.fullName, beforeP1.fullName, 'name NOT changeable by patient');
  eq(afterP1.phone, beforeP1.phone, 'phone forced to server value');
  eq(afterP1.username, beforeP1.username, 'username forced to server value');
  const p2 = db.patients.find((p) => p.id === 'patient-2')!;
  check(p2.fullName !== 'Hacked P2' && p2.fluidLimit !== 1, "other patient's record untouched");
  // A second post of the same own row is a harmless no-op
  await syncPost(req('/api/sync', 'POST', P1(), { fluidLogs: [{ id: 'fl-p1-new', patientId: 'patient-1', amountMl: 9, loggedAt: now }] }));
  eq((await getCloudDatabase()).fluidLogs.filter((f) => f.id === 'fl-p1-new').length, 1, 're-post of own row: no duplicate');

  // ------------------------------------------------ 7. staff writes
  console.log('--- 7. staff POST /api/sync writes clinical data for any patient');
  const docPost = await syncPost(
    req('/api/sync', 'POST', DOC(), {
      labResults: [{ id: 'lab-doc-p2', patientId: 'patient-2', testDate: '2026-11-04', recordedBy: 'doc-rp-1', values: {} }],
    })
  );
  eq(docPost.status, 200, 'doctor POST ok');
  check((await getCloudDatabase()).labResults.some((l) => l.id === 'lab-doc-p2'), 'doctor lab for patient-2 stored');
  eq((await syncPost(new Request(`${BASE}/api/sync`, { method: 'POST', headers: DOC(), body: '{bad' }))).status, 400, 'bad JSON 400');

  // pure helper sanity
  const cur = await getCloudDatabase();
  const p1Acc = cur.accounts.find((a) => a.user.uid === 'patient-1')!;
  eq(Object.keys(filterIncomingForAccount({ accounts: [forgedP1] }, p1Acc, cur).patch).length, 0, 'accounts never in the patch');
  // A normal patient re-sync (everything the server already sent back) is silent and writes nothing
  const scoped = scopeDatabaseForAccount(cur, p1Acc);
  const resync = filterIncomingForAccount(JSON.parse(JSON.stringify(scoped)), p1Acc, cur);
  eq(resync.dropped, 0, 'benign patient re-sync: nothing counted as dropped');
  eq(Object.keys(resync.patch).length, 0, 'benign patient re-sync: empty patch (no blob write)');
  eq(filterIncomingForAccount({ labResults: [{ id: 'new-forged', patientId: 'patient-1' }], fluidLogs: [{ id: 'fl-p2-1', patientId: 'patient-1' }] }, p1Acc, cur).dropped, 2, 'forged new lab + stolen id are counted');
  eq(Object.keys(filterIncomingForAccount(null, p1Acc, cur).patch).length, 0, 'null body -> empty patch');
  eq(scopeDatabaseForAccount(cur, p1Acc).patients.length, 1, 'scope helper: one patient');

  // ------------------------------------------------ 8. register (B3/B4)
  console.log('--- 8. public /api/auth/register hardening (repro_b4)');
  const reg = (body: unknown, headers: Record<string, string> = {}) => registerRoute(req('/api/auth/register', 'POST', headers, body));
  eq((await reg({ type: 'doctor', data: { role: 'admin', username: 'evil1', phone: '01200000001', password: 'Passw0rd!' } })).status, 400, 'B3: role admin via data.role -> 400');
  eq((await reg({ type: 'admin', data: { username: 'evil2', phone: '01200000002', password: 'Passw0rd!' } })).status, 400, 'B3: type admin -> 400');
  eq((await reg({ type: 'doctor', data: { username: 'admin', phone: '01200000003', password: 'Passw0rd!' } })).status, 409, 'B4: username admin reserved -> 409');
  eq((await reg({ type: 'patient', data: { phone: '01012345678', fullName: 'Hijack', password: 'Passw0rd!' } })).status, 409, 'B4: existing patient1 phone -> 409');
  eq((await reg({ type: 'patient', data: { phone: '+20 101 234 5678', fullName: 'Hijack', password: 'Passw0rd!' } })).status, 409, 'B4: same phone in +20 form -> 409');
  eq((await reg({ type: 'nurse', data: { username: 'dr_rp', phone: '01299999999', password: 'Passw0rd!' } })).status, 409, 'B4: existing username -> 409');
  eq((await reg({ type: 'doctor', data: { uid: 'admin-1', username: 'newdoc9', phone: '01299990009', password: 'Passw0rd!' } })).status, 409, 'B4: existing uid admin-1 -> 409');
  eq((await reg({ type: 'patient', data: { uid: 'patient-2', phone: '01299990010', fullName: 'X', password: 'Passw0rd!' } })).status, 409, 'B4: existing uid patient-2 -> 409');
  eq((await reg({ type: 'patient', data: { phone: '01299990011', fullName: 'X', password: '123' } })).status, 400, 'short password -> 400');
  eq((await reg({ type: 'patient' })).status, 400, 'missing data -> 400');
  eq((await reg({ type: 'patient', data: { phone: '01299990012', password: 'Passw0rd!' } }, { origin: 'https://evil.example', host: 'localhost:3000' })).status, 403, 'cross-origin register 403');
  const accs2 = await getCloudAccounts();
  eq(authenticate(accs2, 'admin', 'admin123').kind, 'ok', 'admin password unchanged after attacks');
  eq(authenticate(accs2, 'patient1', 'patient123').kind, 'ok', 'patient1 password unchanged after attacks');
  eq(accs2.filter((a) => a.user.role === 'admin').length, 1, 'still exactly one admin account');
  check(!accs2.some((a) => a.username === 'evil1' || a.username === 'evil2'), 'no attacker accounts created');

  // happy paths + replay
  const myUid = '9b2f6a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const patBody = { type: 'patient', data: { uid: myUid, phone: '01277776666', fullName: 'New Pat', password: 'NewPat2026', profile: { dialysisSchedule: 'STT', dryWeightKg: 66, accessType: 'AVF', dialysisCenter: 'U' } } };
  const r1 = await reg(patBody);
  eq(r1.status, 200, 'new patient registers');
  const r1b = await r1.json();
  eq(r1b.user.uid, myUid, 'free client v4 uid accepted');
  eq(r1b.patient.id, myUid, 'patient record id == account uid');
  check(!hasPasswordKey(r1b), 'register response has no password');
  const r2 = await reg(patBody);
  eq(r2.status, 200, 'exact replay -> 200');
  eq((await r2.json()).user.uid, myUid, 'replay returns the same user');
  eq((await getCloudAccounts()).filter((a) => a.user.uid === myUid).length, 1, 'replay wrote no duplicate');
  eq((await reg({ ...patBody, data: { ...patBody.data, password: 'Different1' } })).status, 409, 'replay with a different password -> 409');
  eq(authenticate(await getCloudAccounts(), '01277776666', 'NewPat2026').kind, 'ok', 'new patient can log in');
  const r3 = await reg({ type: 'patient', data: { uid: 'not-a-uuid', phone: '01277775555', fullName: 'P', password: 'Passw0rd!' } });
  eq(r3.status, 200, 'non-uuid client uid: registration still works');
  check((await r3.json()).user.uid !== 'not-a-uuid', 'non-uuid client uid replaced by a server uuid');
  const rd = await reg({ type: 'doctor', data: { role: 'doctor', username: 'dr_new_rp', phone: '+201055554444', password: 'DocPass2026', fullName: 'Dr New' } });
  eq(rd.status, 200, 'doctor registers');
  const rdb = await rd.json();
  eq(rdb.user.status, 'pending', 'doctor pending');
  eq(authenticate(await getCloudAccounts(), 'dr_new_rp', 'DocPass2026').kind, 'pending', 'doctor login shows pending');
  const ap = await approveRoute(req('/api/auth/approve', 'POST', ADMIN(), { uid: rdb.user.uid, reviewerName: 'Spoofed Name' }));
  eq(ap.status, 200, 'admin approves');
  eq((await ap.json()).user.reviewedBy, 'Dr. System Administrator', 'reviewer name from session, not body');
  eq(authenticate(await getCloudAccounts(), 'dr_new_rp', 'DocPass2026').kind, 'ok', 'approved doctor can log in');

  // Clinic flow race: staff sync lands the patient RECORD before the register POST.
  const clinicUid = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
  const clinicSync = await syncPost(
    req('/api/sync', 'POST', DOC(), {
      patients: [{ id: clinicUid, fullName: 'Clinic Pat', fullNameAr: 'Clinic Pat', phone: '01233334444', username: '01233334444', dialysisSchedule: 'STT', dryWeightKg: 81, isActive: true, createdAt: now }],
    })
  );
  eq(clinicSync.status, 200, 'staff sync stores the clinic patient record first');
  eq((await reg({ type: 'patient', data: { uid: '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b', phone: '01233334444', fullName: 'Squatter', password: 'Squat2026' } })).status, 409, 'different uid with that phone -> 409');
  const linkRes = await reg({ type: 'patient', data: { uid: clinicUid, phone: '01233334444', fullName: 'Clinic Pat', password: 'Clinic2026', profile: { dialysisSchedule: 'SMW', dryWeightKg: 70, accessType: 'AVF', dialysisCenter: 'U' } } });
  eq(linkRes.status, 200, 'register with the record uid links the account (no permanent 409)');
  eq((await linkRes.json()).user.uid, clinicUid, 'account uid == record id');
  eq(authenticate(await getCloudAccounts(), '01233334444', 'Clinic2026').kind, 'ok', 'clinic patient can log in');
  const clinicRecs = (await getCloudDatabase()).patients.filter((p) => p.id === clinicUid || p.phone === '01233334444');
  eq(clinicRecs.length, 1, 'still exactly one patient record');
  eq(clinicRecs[0].dryWeightKg, 81, 'clinic-entered record not overwritten by registration defaults');
  eq(clinicRecs[0].dialysisSchedule, 'STT', 'clinic-entered schedule kept');
  const replayLink = await reg({ type: 'patient', data: { uid: clinicUid, phone: '01233334444', fullName: 'Clinic Pat', password: 'Clinic2026' } });
  eq(replayLink.status, 200, 'replay after linking -> 200 (no write)');
  eq((await reg({ type: 'patient', data: { uid: clinicUid, phone: '01233334444', fullName: 'X', password: 'Other2026' } })).status, 409, 'same uid, wrong password after linking -> 409');

  // ------------------------------------------------ 9. sanitizeAccount no longer promotes
  console.log('--- 9. sanitizeAccount does not activate client-written admin roles');
  const sneaky: StoredAccount = {
    username: 'sneaky',
    password: 'Sneaky2026',
    user: { uid: 'sneaky-1', role: 'admin', username: 'sneaky', displayName: 's', language: 'ar', status: 'pending', createdAt: now },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), sneaky]);
  const sn = (await getCloudAccounts()).find((a) => a.user.uid === 'sneaky-1')!;
  eq(sn.user.status, 'pending', 'role admin on another uid stays pending');
  eq(authenticate(await getCloudAccounts(), 'sneaky', 'Sneaky2026').kind, 'pending', 'and cannot log in');
  const adm = (await getCloudAccounts()).find((a) => a.user.uid === 'admin-1')!;
  eq(adm.user.role === 'admin' && adm.user.status, 'active', 'seeded super admin still active admin');
}

run()
  .then(() => {
    console.warn = originalWarn;
    console.log(`\nROUTE-PROTECTION SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.warn = originalWarn;
    console.error('ROUTE-PROTECTION SUITE FAILED:', err);
    process.exit(1);
  });
