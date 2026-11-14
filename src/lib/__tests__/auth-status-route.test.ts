/**
 * B1b — client session helpers (session-client.ts), the status-only
 * /api/auth/status route, and the register-first data-store hooks.
 *
 * Fully offline: Blob env vars are deleted, fetch is faked per test.
 * Run: npx tsx src/lib/__tests__/auth-status-route.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

// Minimal browser mock (data-store reads window.localStorage when window exists)
const mockStore: Record<string, string> = {};
const storage = {
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
};
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: 'http://localhost:3000' },
  };
}

import {
  checkServerSession,
  fetchRegistrationStatus,
  loginWithServer,
  reauthNoticeText,
  RegistrationError,
  registerOnServer,
  stripLocalPasswords,
} from '../session-client';
import { POST as statusRoute } from '../../app/api/auth/status/route';
import { getCloudAccounts, reconcileAccounts, saveCloudAccounts } from '../cloud-store';
import { getAuthAccounts, registerPatientAccount, registerStaffAccount } from '../data-store';
import type { User } from '../types';

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

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const calls: { url: string; init?: RequestInit }[] = [];
function fakeFetch(status: number, body: unknown): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
const throwingFetch: FetchLike = async () => {
  throw new TypeError('fetch failed');
};
const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

const user: User = {
  uid: 'patient-1',
  role: 'patient',
  username: 'patient1',
  displayName: 'P1',
  language: 'ar',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
};

async function run(): Promise<void> {
  // ------------------------------------------------ 1. checkServerSession
  console.log('--- 1. checkServerSession (only 401 signs out)');
  const ok = await checkServerSession(fakeFetch(200, { success: true, user }));
  eq(ok.action, 'update', '200 with user -> update');
  eq(ok.action === 'update' && ok.user.uid, 'patient-1', 'server user returned');
  eq(calls[calls.length - 1].url, '/api/auth/session', 'calls /api/auth/session');
  eq(calls[calls.length - 1].init?.credentials, 'same-origin', 'sends cookies (same-origin)');
  eq((await checkServerSession(fakeFetch(401, { success: false, error: 'unauthorized' }))).action, 'clear', '401 -> clear');
  eq((await checkServerSession(fakeFetch(503, { success: false, error: 'authNotConfigured' }))).action, 'keep', '503 -> keep cached session');
  eq((await checkServerSession(fakeFetch(500, { success: false }))).action, 'keep', '500 -> keep');
  eq((await checkServerSession(fakeFetch(502, '<html>bad gateway</html>'))).action, 'keep', '502 HTML -> keep');
  eq((await checkServerSession(fakeFetch(403, { success: false }))).action, 'keep', '403 -> keep (not a sign-out)');
  eq((await checkServerSession(throwingFetch)).action, 'keep', 'network error (offline) -> keep');
  eq((await checkServerSession(hangingFetch, 50)).action, 'keep', 'timeout -> keep');
  eq((await checkServerSession(fakeFetch(200, 'not json'))).action, 'keep', '200 malformed body -> keep');
  eq((await checkServerSession(fakeFetch(200, { success: true, user: { name: 'x' } }))).action, 'keep', '200 without a valid user -> keep');

  // ------------------------------------------------ 2. loginWithServer
  console.log('--- 2. loginWithServer result mapping');
  const li = await loginWithServer('patient1', 'patient123', true, fakeFetch(200, { success: true, status: 'active', user }));
  eq(li.success, true, '200 -> success');
  eq(li.user?.uid, 'patient-1', 'user from server');
  const sent = JSON.parse(String(calls[calls.length - 1].init?.body));
  eq(sent.identifier, 'patient1', 'identifier sent');
  eq(sent.rememberMe, true, 'rememberMe sent');
  eq(calls[calls.length - 1].url, '/api/auth/login', 'calls /api/auth/login');
  const pend = await loginWithServer('d', 'p', true, fakeFetch(403, { success: false, status: 'pending', user: { ...user, status: 'pending' } }));
  eq(pend.success, false, 'pending -> not success');
  eq(pend.status, 'pending', 'pending status kept');
  eq(pend.user?.uid, 'patient-1', 'pending user kept for the WhatsApp CTA');
  const rej = await loginWithServer('d', 'p', true, fakeFetch(403, { success: false, status: 'rejected', user, rejectionReason: 'why' }));
  eq(rej.status, 'rejected', 'rejected status kept');
  eq(rej.rejectionReason, 'why', 'rejection reason kept');
  eq((await loginWithServer('a', 'b', true, fakeFetch(401, { success: false, error: 'invalidCredentials' }))).error, 'invalidCredentials', '401 -> invalidCredentials');
  eq((await loginWithServer('a', 'b', true, fakeFetch(503, { success: false }))).error, 'loginError', '503 -> loginError');
  eq((await loginWithServer('a', 'b', true, fakeFetch(500, 'oops'))).error, 'loginError', '500 -> loginError');
  eq((await loginWithServer('a', 'b', true, throwingFetch)).error, 'loginError', 'offline -> loginError');
  eq((await loginWithServer('a', 'b', true, fakeFetch(403, { success: false, error: 'forbidden' }))).error, 'loginError', '403 without status -> loginError');

  // ------------------------------------------------ 3. registerOnServer
  console.log('--- 3. registerOnServer');
  const reg = await registerOnServer('patient', { fullName: 'x', language: 'ar' }, fakeFetch(200, { success: true, user }));
  eq(reg.uid, 'patient-1', 'server user returned');
  eq(JSON.parse(String(calls[calls.length - 1].init?.body)).type, 'patient', 'type sent');
  const expectCode = async (f: FetchLike, code: string, lang: string, msg: string) => {
    try {
      await registerOnServer('doctor', { language: lang }, f);
      assert.fail('should throw');
    } catch (e) {
      check(e instanceof RegistrationError && e.code === code, msg);
      return (e as Error).message;
    }
    return '';
  };
  const m409 = await expectCode(fakeFetch(409, { success: false }), 'alreadyRegistered', 'ar', '409 -> alreadyRegistered');
  check(/مسجّل بالفعل/.test(m409), '409 message is Arabic for ar');
  const m409en = await expectCode(fakeFetch(409, { success: false }), 'alreadyRegistered', 'en', '409 en');
  check(/already registered/.test(m409en), '409 message is English for en');
  await expectCode(fakeFetch(400, { success: false }), 'invalid', 'ar', '400 -> invalid');
  await expectCode(fakeFetch(500, { success: false }), 'server', 'ar', '500 -> server');
  await expectCode(throwingFetch, 'network', 'ar', 'offline -> network');
  await expectCode(fakeFetch(200, { success: false }), 'server', 'ar', '200 without success -> server');

  // ------------------------------------------------ 4. fetchRegistrationStatus
  console.log('--- 4. fetchRegistrationStatus');
  const st = await fetchRegistrationStatus('u', fakeFetch(200, { success: true, status: 'active' }));
  eq(st?.status, 'active', 'status parsed');
  eq(calls[calls.length - 1].url, '/api/auth/status', 'calls /api/auth/status');
  eq(await fetchRegistrationStatus('u', fakeFetch(404, { success: false })), null, '404 -> null');
  eq(await fetchRegistrationStatus('u', throwingFetch), null, 'offline -> null');
  eq(await fetchRegistrationStatus('u', fakeFetch(200, { success: true, status: 'weird' })), null, 'unknown status -> null');
  eq(reauthNoticeText('ar'), 'تم تحديث نظام الأمان، يرجى تسجيل الدخول مرة أخرى', 'Arabic re-login notice');
  check(/sign in again/.test(reauthNoticeText('en')), 'English re-login notice');

  // ------------------------------------------------ 5. /api/auth/status route
  console.log('--- 5. POST /api/auth/status');
  const pendingUid = '3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f';
  const rejectedUid = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
  const backup = await getCloudAccounts();
  const statusReq = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://localhost:3000/api/auth/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  try {
    await saveCloudAccounts([
      ...backup,
      {
        username: 'pend_doc',
        phone: '01055550000',
        password: 'SecretPend1',
        user: { ...user, uid: pendingUid, role: 'doctor', username: 'pend_doc', status: 'pending', idCardDataUrl: 'data:image/png;base64,AAAA' },
      },
      {
        username: 'rej_doc',
        password: 'SecretRej1',
        user: { ...user, uid: rejectedUid, role: 'doctor', username: 'rej_doc', status: 'rejected', rejectionReason: 'blurry license' },
      },
    ]);
    const r1 = await statusRoute(statusReq({ uid: pendingUid }));
    eq(r1.status, 200, 'pending uid -> 200');
    const b1 = await r1.json();
    eq(b1.status, 'pending', 'pending status');
    eq(JSON.stringify(Object.keys(b1).sort()), JSON.stringify(['status', 'success']), 'ONLY success + status returned');
    check(!/SecretPend1|pend_doc|01055550000|base64/.test(JSON.stringify(b1)), 'no password/username/phone/id card');

    const r2 = await statusRoute(statusReq({ uid: rejectedUid }));
    const b2 = await r2.json();
    eq(b2.status, 'rejected', 'rejected status');
    eq(b2.rejectionReason, 'blurry license', 'rejection reason included for rejected');
    eq(JSON.stringify(Object.keys(b2).sort()), JSON.stringify(['rejectionReason', 'status', 'success']), 'only status fields for rejected');

    const unknown = await statusRoute(statusReq({ uid: '00000000-0000-4000-8000-000000000000' }));
    const seeded = await statusRoute(statusReq({ uid: 'patient-1' }));
    const adminR = await statusRoute(statusReq({ uid: 'admin-1' }));
    eq(unknown.status, 404, 'unknown uuid -> 404');
    eq(seeded.status, 404, 'seeded non-UUID uid (patient-1) -> 404 (no enumeration)');
    eq(adminR.status, 404, 'admin-1 -> 404');
    const ub = JSON.stringify(await unknown.json());
    eq(ub, JSON.stringify(await seeded.json()), 'identical 404 body for unknown and seeded uids');
    eq((await statusRoute(statusReq({ uid: pendingUid.toUpperCase() + 'x' }))).status, 404, 'malformed uid -> 404');
    eq((await statusRoute(statusReq({}))).status, 404, 'missing uid -> 404');
    eq((await statusRoute(statusReq({ uid: 42 }))).status, 404, 'non-string uid -> 404');
    eq((await statusRoute(statusReq('{bad'))).status, 400, 'bad JSON -> 400');
    eq(
      (await statusRoute(statusReq({ uid: pendingUid }, { origin: 'https://evil.example', host: 'localhost:3000' }))).status,
      403,
      'cross-origin -> 403'
    );
  } finally {
    await saveCloudAccounts(backup);
  }

  // ------------------------------------------------ 6. data-store register hooks
  console.log('--- 6. registerStaffAccount / registerPatientAccount with server uid');
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    const serverUid = 'c0ffee00-1111-4222-8333-444455556666';
    const doc = registerStaffAccount(
      { fullName: 'Dr X', phone: '01077778888', username: 'drx_b1b', password: 'pw123456', role: 'nurse' },
      { skipCloudPush: true }
    );
    check(doc.uid && doc.uid !== serverUid, 'without uid a local uid is generated');
    const doc2 = registerStaffAccount(
      { fullName: 'Dr Y', phone: '01077779999', username: 'dry_b1b', password: 'pw123456', role: 'doctor', uid: serverUid },
      { skipCloudPush: true }
    );
    eq(doc2.uid, serverUid, 'server uid used for the local staff account');
    eq(doc2.status, 'pending', 'staff still pending locally');
    const pat = registerPatientAccount(
      {
        fullName: 'Pat Z',
        phone: '01066667777',
        password: 'pw123456',
        uid: 'c0ffee00-2222-4222-8333-444455556666',
        profile: { dialysisSchedule: 'SMW', dryWeightKg: 70, accessType: 'AVF', dialysisCenter: 'Unit A' },
      },
      { skipCloudPush: true }
    );
    eq(pat.uid, 'c0ffee00-2222-4222-8333-444455556666', 'server uid used for the local patient account');
    check(getAuthAccounts().some((a) => a.user.uid === pat.uid), 'patient cached locally');
    eq(fetchCalls.filter((u) => u.includes('/api/auth/register')).length, 0, 'skipCloudPush -> no second register POST');
    registerPatientAccount({
      fullName: 'Pat Legacy',
      phone: '01066660000',
      password: 'pw123456',
      profile: { dialysisSchedule: 'SMW', dryWeightKg: 70, accessType: 'AVF', dialysisCenter: 'Unit A' },
    });
    eq(fetchCalls.filter((u) => u.includes('/api/auth/register')).length, 1, 'default behaviour unchanged: background register POST still sent');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ------------------------------------------------ 7. password purge safety
  console.log('--- 7. stripLocalPasswords never lets a legacy merge blank server passwords');
  const later = '2099-01-01T00:00:00.000Z';
  const server = [
    { username: 'admin', password: 'admin123', user: { ...user, uid: 'admin-1', role: 'admin' as const, username: 'admin' } },
    { username: 'patient1', password: 'patient123', user: { ...user } },
    { username: 'doc', password: 'docPass1', user: { ...user, uid: 'doc-1', role: 'doctor' as const, username: 'doc', status: 'pending' as const } },
  ];
  // Local cache: same accounts, NEWER timestamps / active-vs-pending / profile (all the reconcile overwrite triggers)
  const local = [
    { username: 'admin', password: 'admin123', user: { ...server[0].user } },
    { username: 'patient1', password: 'stale-local', user: { ...user, reviewedAt: later, patientProfile: { dialysisSchedule: 'SMW', dryWeightKg: 70, accessType: 'AVF' as const, dialysisCenter: 'U' } } },
    { username: 'doc', password: 'stale-local', user: { ...server[2].user, status: 'active' as const, reviewedAt: later } },
  ];
  const stripped = stripLocalPasswords(local)!;
  check(stripped, 'something to strip');
  check(!('password' in stripped[1]) && !('password' in stripped[2]), 'password KEY removed (not set to empty string)');
  eq(stripped[0].password, 'admin123', 'admin entry untouched (rewritten by getAuthAccounts anyway)');
  eq(stripLocalPasswords(stripped), null, 'second purge is a no-op (no save, no event storm)');
  const wire = JSON.parse(JSON.stringify(stripped));
  const { merged, hasChanges } = reconcileAccounts(server as never, wire);
  check(hasChanges, 'reconcile did apply the newer local user data');
  eq(merged.find((a) => a.username === 'patient1')!.password, 'patient123', 'server password kept for patient1 after legacy merge');
  eq(merged.find((a) => a.username === 'doc')!.password, 'docPass1', 'server password kept for doc after legacy merge');
  eq(merged.find((a) => a.username === 'patient1')!.user.reviewedAt, later, 'non-password fields still merge as before');
  // Before B2.1 the blanking variant destroyed the credential; reconcile now never takes credentials from the other copy.
  const blanked = local.map((a) => (a.user.role === 'admin' ? a : { ...a, password: '' }));
  eq(reconcileAccounts(server as never, blanked as never).merged.find((a) => a.username === 'patient1')!.password, 'patient123', "(B2.1) even a blanked '' copy can no longer overwrite the server password");
}

run()
  .then(() => {
    console.warn = originalWarn;
    console.log(`\nAUTH-STATUS / SESSION-CLIENT SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.warn = originalWarn;
    console.error('AUTH-STATUS / SESSION-CLIENT SUITE FAILED:', err);
    process.exit(1);
  });
