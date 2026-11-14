/**
 * B2 — scrypt password hashing, transparent upgrade on login, bulk migration on
 * admin login, and the server-side password change (with session invalidation).
 *
 * Fully offline against the in-memory cloud store (Blob env vars deleted).
 * Run: npx tsx src/lib/__tests__/password-hashing.test.ts
 */
import assert from 'node:assert';
import { randomBytes, scryptSync } from 'node:crypto';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

import {
  hashPassword,
  isPasswordHash,
  migratePlaintextPasswords,
  passwordMatches,
  SCRYPT_PARAMS,
  SESSION_COOKIE,
  verifyPassword,
} from '../server-auth';
import { getCloudAccounts, getCloudDatabase } from '../cloud-store';
import { changePasswordErrorText, changePasswordOnServer } from '../password-client';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { GET as sessionRoute } from '../../app/api/auth/session/route';
import { POST as changeRoute } from '../../app/api/auth/change-password/route';
import { GET as accountsGet } from '../../app/api/auth/accounts/route';
import { GET as syncGet } from '../../app/api/sync/route';
import { POST as registerRoute } from '../../app/api/auth/register/route';

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
const b64 = (b: Buffer) => b.toString('base64url');
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function cookieOf(res: Response): string {
  const m = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(res.headers.get('set-cookie') || '');
  return m ? m[1] : '';
}
const withCookie = (t: string) => ({ cookie: `${SESSION_COOKIE}=${t}` });
async function login(identifier: string, password: string): Promise<{ status: number; token: string }> {
  const res = await loginRoute(post('/api/auth/login', { identifier, password }));
  return { status: res.status, token: cookieOf(res) };
}
async function sessionStatus(token: string): Promise<number> {
  return (await sessionRoute(new Request(`${BASE}/api/auth/session`, { headers: withCookie(token) }))).status;
}
const stored = async (username: string) => (await getCloudAccounts()).find((a) => a.username === username)!.password;

async function run(): Promise<void> {
  // ------------------------------------------------ 1. format + verify
  console.log('--- 1. hash format and verification');
  const h1 = hashPassword('patient123');
  const h2 = hashPassword('patient123');
  check(/^scrypt\$1\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(h1), 'format scrypt$1$N$r$p$salt$key');
  check(h1 !== h2, 'random salt: same password -> different hashes');
  eq(SCRYPT_PARAMS.N, 16384, 'N = 2^14');
  check(isPasswordHash(h1) && !isPasswordHash('patient123'), 'isPasswordHash');
  const v = verifyPassword(h1, 'patient123');
  check(v.ok && !v.needsUpgrade, 'correct password verifies, no upgrade needed');
  eq(verifyPassword(h1, 'patient124').ok, false, 'wrong password fails');
  eq(verifyPassword(h1, '').ok, false, 'empty password fails');
  eq(verifyPassword(h1, undefined).ok, false, 'non-string password fails');
  eq(verifyPassword(h1, 'x'.repeat(1001)).ok, false, 'oversized input fails');
  check(passwordMatches(h1, 'patient123'), 'passwordMatches accepts hashes');

  // ------------------------------------------------ 2. garbled / hostile hashes fail closed
  console.log('--- 2. malformed or out-of-bounds hashes never match');
  const [, , , , , salt, key] = h1.split('$');
  const bad = [
    `scrypt$2$16384$8$1$${salt}$${key}`,
    `scrypt$1$16384$8$1$${salt}`,
    `scrypt$1$16000$8$1$${salt}$${key}`,
    `scrypt$1$8192$8$1$${salt}$${key}`,
    `scrypt$1$2097152$8$1$${salt}$${key}`,
    `scrypt$1$16384$17$1$${salt}$${key}`,
    `scrypt$1$16384$8$5$${salt}$${key}`,
    `scrypt$1$16384$8$1$${b64(randomBytes(8))}$${key}`,
    `scrypt$1$16384$8$1$${salt}$${b64(randomBytes(16))}`,
    `scrypt$1$16384$8$1$${salt}=$${key}`,
    `scrypt$1$16384$8$1$${salt}$${key}$extra`,
    'scrypt$',
  ];
  for (const b of bad) eq(verifyPassword(b, 'patient123').ok, false, `fails closed: ${b.slice(0, 28)}...`);
  // A hash made with the same params by hand verifies (proves the parser is not just rejecting everything)
  const s2 = randomBytes(16);
  const k2 = scryptSync('handmade', s2, 32, { N: 16384, r: 8, p: 1 });
  check(verifyPassword(`scrypt$1$16384$8$1$${b64(s2)}$${b64(k2)}`, 'handmade').ok, 'hand-built valid hash verifies');

  // ------------------------------------------------ 3. legacy plaintext
  console.log('--- 3. legacy plaintext accepted and flagged for upgrade');
  const lv = verifyPassword('patient123', 'patient123');
  check(lv.ok && lv.needsUpgrade, 'plaintext match -> ok + needsUpgrade');
  eq(verifyPassword('patient123', 'nope').needsUpgrade, false, 'plaintext mismatch -> no upgrade');
  eq(verifyPassword('', '').ok, false, 'empty stored never matches');
  eq(verifyPassword(undefined, 'x').ok, false, 'missing stored never matches');

  // ------------------------------------------------ 4. transparent upgrade on login
  console.log('--- 4. login re-hashes a plaintext password');
  eq(isPasswordHash(await stored('patient2')), false, 'patient2 starts as legacy plaintext');
  const l2 = await login('patient2', 'patient123');
  eq(l2.status, 200, 'patient2 logs in with plaintext');
  check(isPasswordHash(await stored('patient2')), 'patient2 now stored as scrypt hash');
  check(isPasswordHash((await getCloudDatabase()).accounts.find((a) => a.username === 'patient2')!.password), 'getCloudDatabase() after the upgrade holds the hash');
  eq((await login('patient2', 'patient123')).status, 200, 'patient2 logs in again with the hash');
  eq((await login('patient2', 'wrong')).status, 401, 'wrong password still 401');
  eq(isPasswordHash(await stored('patient3')), false, 'non-admin login does not migrate others');

  // ------------------------------------------------ 4b. migration bounds
  console.log('--- 4b. bulk migration respects the time budget and the count cap');
  const plainCount = async () => (await getCloudAccounts()).filter((a) => a.password && !isPasswordHash(a.password)).length;
  const before = await plainCount();
  check(before >= 3, 'several plaintext passwords remain before migration');
  let calls = 0;
  const clock = () => (calls++ < 2 ? 0 : 5000); // time jumps past the budget after the first hash
  eq(await migratePlaintextPasswords({ budgetMs: 2000, now: clock }), 1, 'budget exhausted after one hash');
  eq(await plainCount(), before - 1, 'only one account hashed in that pass');
  eq(await migratePlaintextPasswords({ cap: 1 }), 1, 'count cap honoured');
  eq(await plainCount(), before - 2, 'remainder left for the next pass');

  // ------------------------------------------------ 5. bulk migration on admin login
  console.log('--- 5. first admin login hashes every remaining plaintext');
  eq((await login('admin', 'admin123')).status, 200, 'admin logs in');
  const all = await getCloudAccounts();
  check(all.every((a) => !a.password || isPasswordHash(a.password)), 'no plaintext passwords left');
  for (const [id, pw] of [['admin', 'admin123'], ...[1, 2, 3, 4, 5, 6, 7].map((i) => [`patient${i}`, 'patient123'])]) {
    eq((await login(id, pw)).status, 200, `seeded ${id} still logs in after migration`);
  }
  eq((await login('01012345678', 'patient123')).status, 200, 'phone login still works');
  eq((await login('٠١٠١٢٣٤٥٦٧٨', 'patient123')).status, 200, 'B5: phone typed in Arabic-Indic digits logs in');
  eq((await login('+٢٠ ١٠١ ٢٣٤ ٥٦٧٨', 'patient123')).status, 200, 'B5: +20 form in Arabic-Indic digits logs in');
  eq((await login('۰۱۰۱۲۳۴۵۶۷۸', 'patient123')).status, 200, 'B5: Extended Arabic-Indic digits log in');

  // ------------------------------------------------ 6. hashes never leave the server
  console.log('--- 6. no hash or password metadata in responses');
  const adminTok = (await login('admin', 'admin123')).token;
  const accRes = await (await accountsGet(new Request(`${BASE}/api/auth/accounts`, { headers: withCookie(adminTok) }))).json();
  const syncRes = await (await syncGet(new Request(`${BASE}/api/sync`, { headers: withCookie(adminTok) }))).json();
  for (const [name, body] of [['accounts', accRes], ['sync', syncRes]] as const) {
    const txt = JSON.stringify(body);
    check(!txt.includes('scrypt$') && !txt.includes('"password"') && !txt.includes('passwordUpdatedAt'), `${name}: no hash/password/passwordUpdatedAt`);
  }

  // ------------------------------------------------ 7. change password
  console.log('--- 7. POST /api/auth/change-password');
  const devA = (await login('patient4', 'patient123')).token;
  const devB = (await login('patient4', 'patient123')).token;
  eq((await changeRoute(post('/api/auth/change-password', { currentPassword: 'patient123', newPassword: 'NewPass2026' }))).status, 401, 'no session -> 401');
  const wrong = await changeRoute(post('/api/auth/change-password', { currentPassword: 'bad', newPassword: 'NewPass2026' }, withCookie(devA)));
  eq(wrong.status, 401, 'wrong current password -> 401');
  eq((await wrong.json()).error, 'wrongPassword', 'error wrongPassword');
  eq(await sessionStatus(devA), 200, 'a wrong-current attempt does not end the session');
  eq((await changeRoute(post('/api/auth/change-password', { currentPassword: 'patient123', newPassword: '123' }, withCookie(devA)))).status, 400, 'too short -> 400');
  eq((await changeRoute(post('/api/auth/change-password', { currentPassword: 'patient123', newPassword: 'patient123' }, withCookie(devA)))).status, 400, 'same as current -> 400');
  eq(
    (await changeRoute(post('/api/auth/change-password', { currentPassword: 'patient123', newPassword: 'NewPass2026' }, { ...withCookie(devA), origin: 'https://evil.example', host: 'localhost:3000' }))).status,
    403,
    'cross-origin -> 403'
  );
  // ensure the change lands in a later second than devA/devB were issued
  await new Promise((r) => setTimeout(r, 1100));
  const ok = await changeRoute(post('/api/auth/change-password', { currentPassword: 'patient123', newPassword: 'NewPass2026' }, withCookie(devA)));
  eq(ok.status, 200, 'change succeeds');
  const devC = cookieOf(ok);
  check(devC.length > 0, 'fresh cookie issued to the changing device');
  check(!JSON.stringify(await ok.json()).includes('scrypt$'), 'no hash in change response');
  eq(await sessionStatus(devA), 401, 'old session on this device ended');
  eq(await sessionStatus(devB), 401, 'session on the other device ended');
  eq(await sessionStatus(devC), 200, 'fresh session works');
  eq((await login('patient4', 'patient123')).status, 401, 'old password no longer works');
  const newLogin = await login('patient4', 'NewPass2026');
  eq(newLogin.status, 200, 'new password works');
  eq(await sessionStatus(newLogin.token), 200, 'session from a login after the change is valid');
  check(isPasswordHash(await stored('patient4')), 'new password stored as hash');
  check((await getCloudAccounts()).find((a) => a.username === 'patient4')!.passwordUpdatedAt, 'passwordUpdatedAt recorded');
  eq((await login('patient5', 'patient123')).status, 200, "other users' passwords unaffected");

  // admin can change their own password the same way (Settings form)
  const at = (await login('admin', 'admin123')).token;
  await new Promise((r) => setTimeout(r, 1100));
  const ac = await changeRoute(post('/api/auth/change-password', { currentPassword: 'admin123', newPassword: 'AdminNew2026' }, withCookie(at)));
  eq(ac.status, 200, 'admin password change');
  eq((await login('admin', 'admin123')).status, 401, 'old admin password rejected');
  eq((await login('admin', 'AdminNew2026')).status, 200, 'new admin password accepted');

  // ------------------------------------------------ 7b. register stores hashes (B2) + Arabic digits (B5)
  console.log('--- 7b. registration stores a scrypt hash; Arabic-Indic digits normalised');
  const reg = (body: unknown) => registerRoute(post('/api/auth/register', body));
  const rr = await reg({ type: 'patient', data: { phone: '٠١٢٤٤٤٤٥٥٥٥', fullName: 'Arabic Digits', password: 'ArDigits2026' } });
  eq(rr.status, 200, 'patient registers with an Arabic-Indic phone');
  const rrb = await rr.json();
  eq(rrb.user.phone, '01244445555', 'phone stored in ASCII digits');
  check(!JSON.stringify(rrb).includes('scrypt$') && !JSON.stringify(rrb).includes('ArDigits2026'), 'no hash or password in the register response');
  check(isPasswordHash(await stored('01244445555')), 'registered password stored as scrypt hash');
  eq((await login('01244445555', 'ArDigits2026')).status, 200, 'login with ASCII digits');
  eq((await login('٠١٢٤٤٤٤٥٥٥٥', 'ArDigits2026')).status, 200, 'login with Arabic-Indic digits');
  eq((await reg({ type: 'patient', data: { phone: '٠١٠١٢٣٤٥٦٧٨', fullName: 'Dup', password: 'Dup2026xx' } })).status, 409, "patient1's phone in Arabic-Indic digits -> 409");
  const ruid = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
  const rdoc = { type: 'doctor', data: { uid: ruid, username: 'dr_b2', phone: '01255556666', password: 'DrB2pass!' } };
  eq((await reg(rdoc)).status, 200, 'doctor registers');
  eq((await reg(rdoc)).status, 200, 'exact replay still recognised against the stored hash');
  eq((await reg({ ...rdoc, data: { ...rdoc.data, password: 'Other123!' } })).status, 409, 'replay with a different password -> 409');

  // ------------------------------------------------ 8. client helper mapping
  console.log('--- 8. changePasswordOnServer mapping');
  const fake = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
  eq((await changePasswordOnServer('a', 'b', fake(200, { success: true }))).ok, true, '200 -> ok');
  const m = async (status: number, body: unknown) => {
    const r = await changePasswordOnServer('a', 'b', fake(status, body));
    return r.ok ? 'ok' : r.error;
  };
  eq(await m(401, { error: 'wrongPassword' }), 'wrongPassword', '401 wrongPassword');
  eq(await m(401, { error: 'unauthorized' }), 'signedOut', '401 unauthorized -> signedOut');
  eq(await m(400, { error: 'invalidPassword' }), 'invalid', '400 -> invalid');
  eq(await m(500, {}), 'server', '500 -> server');
  const net = await changePasswordOnServer('a', 'b', async () => {
    throw new TypeError('fetch failed');
  });
  eq(net.ok ? 'ok' : net.error, 'network', 'offline -> network');
  check(/غير صحيحة/.test(changePasswordErrorText('wrongPassword', true)), 'Arabic wrong-password text');
  check(/incorrect/.test(changePasswordErrorText('wrongPassword', false)), 'English wrong-password text');
}

run()
  .then(() => {
    console.warn = originalWarn;
    console.log(`\nPASSWORD-HASHING SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.warn = originalWarn;
    console.error('PASSWORD-HASHING SUITE FAILED:', err);
    process.exit(1);
  });
