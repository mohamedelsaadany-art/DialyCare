/**
 * B1a — server-side session tokens + login/logout/session routes.
 *
 * Runs fully offline against the in-memory cloud store: the Blob env vars are
 * removed at the top of this file so nothing can ever reach Vercel Blob.
 *
 * Run: npx tsx src/lib/__tests__/server-auth.test.ts
 */
import assert from 'node:assert';
import { createHmac } from 'node:crypto';

// Safety: force the in-memory store and a clean key environment.
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;
delete env.NODE_ENV;

import {
  authenticate,
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSession,
  getSessionKey,
  isCrossOriginRequest,
  passwordMatches,
  readSessionToken,
  SESSION_COOKIE,
  STAFF_ROLES,
  toPublicAccount,
  verifySessionToken,
} from '../server-auth';
import { getCloudAccounts, saveCloudAccounts } from '../cloud-store';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { POST as logoutRoute } from '../../app/api/auth/logout/route';
import { GET as sessionRoute } from '../../app/api/auth/session/route';
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

// Silence the expected dev-key / production warnings during the run.
const originalWarn = console.warn;
console.warn = () => {};

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = env[k];
    if (vars[k] === undefined) delete env[k];
    else env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  }
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}
/** Sign an arbitrary payload with the CURRENT key (to test payload validation). */
function signRaw(payload: unknown): string {
  const key = getSessionKey();
  if (!key) throw new Error('no key');
  const body = b64urlJson(payload);
  const sig = createHmac('sha256', key).update(`v1.${body}`, 'utf8').digest('base64url');
  return `v1.${body}.${sig}`;
}

function loginRequest(body: unknown, raw?: string): Request {
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}
function sessionRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/auth/session', { headers });
}
function cookieFrom(res: Response): string {
  const sc = res.headers.get('set-cookie') || '';
  const m = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(sc);
  return m ? m[1] : '';
}

async function run(): Promise<void> {
  const nowMs = Date.now();

  // ------------------------------------------------------------------ 1. key
  console.log('--- 1. signing key resolution');
  const devKey = getSessionKey();
  check(devKey && devKey.length === 32, 'dev fallback key exists outside production');

  withEnv({ SESSION_SECRET: 'x'.repeat(40) }, () => {
    const k = getSessionKey();
    check(k && !k.equals(devKey!), 'SESSION_SECRET overrides the dev key');
    const t = createSessionToken({ uid: 'admin-1', role: 'admin' });
    check(verifySessionToken(t), 'token verifies under the key that signed it');
    withEnv({ SESSION_SECRET: 'y'.repeat(40) }, () => {
      eq(verifySessionToken(t), null, 'token signed with another SESSION_SECRET is rejected');
    });
  });
  withEnv({ SESSION_SECRET: 'short' }, () => {
    check(getSessionKey()!.equals(devKey!), 'SESSION_SECRET shorter than 32 chars is ignored');
  });
  withEnv({ BLOB_READ_WRITE_TOKEN: 'fake-token-for-key-derivation-only' }, () => {
    const k = getSessionKey();
    const expected = createHmac('sha256', 'fake-token-for-key-derivation-only').update('waslity-session-v1').digest();
    check(k && k.equals(expected), 'key derived as HMAC-SHA256(BLOB_READ_WRITE_TOKEN, "waslity-session-v1")');
    check(!k!.equals(devKey!), 'derived key differs from the dev key');
  });
  withEnv({ SESSION_SECRET: 'z'.repeat(40), BLOB_READ_WRITE_TOKEN: 'fake-token-for-key-derivation-only' }, () => {
    const viaSecret = getSessionKey();
    withEnv({ BLOB_READ_WRITE_TOKEN: undefined }, () => {
      check(getSessionKey()!.equals(viaSecret!), 'SESSION_SECRET takes precedence over the blob-derived key');
    });
  });
  withEnv({ NODE_ENV: 'production' }, () => {
    eq(getSessionKey(), null, 'production without any secret: no key (fail closed)');
    eq(createSessionToken({ uid: 'admin-1', role: 'admin' }), null, 'production without key: no token issued');
  });
  withEnv({ VERCEL: '1' }, () => {
    eq(getSessionKey(), null, 'VERCEL without any secret: no key (fail closed)');
  });
  withEnv({ VERCEL: '1', VERCEL_OIDC_TOKEN: 'oidc-only' }, () => {
    eq(getSessionKey(), null, 'VERCEL with only an OIDC token: no key (fail closed, never the dev secret)');
  });
  {
    const derived = createHmac('sha256', 'fake-blob').update('waslity-session-v1').digest();
    withEnv({ VERCEL: '1', BLOB_READ_WRITE_TOKEN: 'fake-blob' }, () => {
      check(getSessionKey()!.equals(derived), 'VERCEL + blob token -> derived key, not the dev secret');
    });
    withEnv({ NODE_ENV: 'production', BLOB_READ_WRITE_TOKEN: 'fake-blob' }, () => {
      check(getSessionKey()!.equals(derived), 'production + blob token -> derived key, not the dev secret');
    });
    withEnv({ NODE_ENV: 'production', SESSION_SECRET: 'q'.repeat(40) }, () => {
      const k = getSessionKey();
      check(k && !k.equals(devKey!) && !k.equals(derived), 'production + SESSION_SECRET -> that secret');
    });
  }
  {
    // The loud dev-key warning is printed once per process, not per call.
    const seen: unknown[] = [];
    const prev = console.warn;
    console.warn = (...a: unknown[]) => seen.push(a);
    for (let i = 0; i < 5; i++) getSessionKey();
    console.warn = prev;
    eq(seen.length, 0, 'dev-key warning already printed once; repeated calls do not re-print');
  }
  const devToken = createSessionToken({ uid: 'admin-1', role: 'admin' });
  withEnv({ NODE_ENV: 'production' }, () => {
    eq(verifySessionToken(devToken), null, 'a dev-signed token is never accepted in production');
  });

  // ---------------------------------------------------------------- 2. token
  console.log('--- 2. token create / verify / tampering');
  const tok = createSessionToken({ uid: 'patient-1', role: 'patient' }, { ttlSeconds: 3600, nowMs })!;
  const p = verifySessionToken(tok, nowMs);
  check(p, 'fresh token verifies');
  eq(p!.uid, 'patient-1', 'uid round-trips');
  eq(p!.role, 'patient', 'role round-trips');
  eq(p!.exp - p!.iat, 3600, 'ttl applied');

  const [v, body, sig] = tok.split('.');
  const forgedBody = b64urlJson({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), role: 'admin' });
  eq(verifySessionToken(`${v}.${forgedBody}.${sig}`, nowMs), null, 'payload changed to admin with old signature is rejected');
  const flipped = sig.slice(0, -2) + (sig.slice(-2) === 'AA' ? 'AB' : 'AA');
  eq(verifySessionToken(`${v}.${body}.${flipped}`, nowMs), null, 'modified signature rejected');
  eq(verifySessionToken(`v2.${body}.${sig}`, nowMs), null, 'unknown version rejected');
  eq(verifySessionToken(`${body}.${sig}`, nowMs), null, 'two-part token rejected');
  eq(verifySessionToken(`${v}.${body}.${sig}.x`, nowMs), null, 'four-part token rejected');
  eq(verifySessionToken(`${v}.${body}.`, nowMs), null, 'empty signature ("alg none" style) rejected');
  eq(verifySessionToken(`${v}.${body}.${sig}=`, nowMs), null, 'padded base64 rejected');
  eq(verifySessionToken(`${v}.${body}.${sig.slice(0, -1)}`, nowMs), null, 'truncated signature rejected');
  eq(verifySessionToken(`${v}.${body}.${sig}AAAA`, nowMs), null, 'extended signature rejected');
  eq(verifySessionToken(`${v}.${body}!.${sig}`, nowMs), null, 'non-base64url characters rejected');
  eq(verifySessionToken('', nowMs), null, 'empty string rejected');
  eq(verifySessionToken(undefined, nowMs), null, 'undefined rejected');
  eq(verifySessionToken(12345, nowMs), null, 'number rejected');
  eq(verifySessionToken('v1.' + 'A'.repeat(5000) + '.' + sig, nowMs), null, 'oversized token rejected');
  eq(verifySessionToken(tok, nowMs + 3601 * 1000), null, 'expired token rejected');
  check(verifySessionToken(tok, nowMs + 3599 * 1000), 'token still valid just before expiry');
  const future = createSessionToken({ uid: 'patient-1', role: 'patient' }, { nowMs: nowMs + 10 * 60 * 1000 });
  eq(verifySessionToken(future, nowMs), null, 'token issued in the future (beyond skew) rejected');

  const nowS = Math.floor(nowMs / 1000);
  eq(verifySessionToken(signRaw({ uid: 'x', role: 'superuser', iat: nowS, exp: nowS + 60 }), nowMs), null, 'unknown role rejected even if signed');
  eq(verifySessionToken(signRaw({ uid: '', role: 'admin', iat: nowS, exp: nowS + 60 }), nowMs), null, 'empty uid rejected');
  eq(verifySessionToken(signRaw({ uid: 'x', role: 'admin', iat: nowS }), nowMs), null, 'missing exp rejected');
  eq(verifySessionToken(signRaw({ uid: 'x', role: 'admin', iat: nowS, exp: String(nowS + 60) }), nowMs), null, 'string exp rejected');
  eq(verifySessionToken(signRaw({ uid: 'x', role: 'admin', iat: nowS, exp: nowS }), nowMs), null, 'exp == now rejected');
  eq(verifySessionToken(signRaw(['admin']), nowMs), null, 'array payload rejected');
  {
    const key = getSessionKey()!;
    const badBody = Buffer.from('not json', 'utf8').toString('base64url');
    const s = createHmac('sha256', key).update(`v1.${badBody}`).digest('base64url');
    eq(verifySessionToken(`v1.${badBody}.${s}`, nowMs), null, 'signed non-JSON payload rejected without throwing');
  }
  check(verifySessionToken(signRaw({ uid: 'x', role: 'doctor', iat: nowS, exp: nowS + 60 }), nowMs), 'well-formed signed payload accepted');

  // ------------------------------------------------------------ 3. transport
  console.log('--- 3. cookie / header transport');
  eq(readSessionToken(sessionRequest({ authorization: `Bearer ${tok}` })), tok, 'Bearer header read');
  eq(readSessionToken(sessionRequest({ cookie: `a=1; ${SESSION_COOKIE}=${tok}; b=2` })), tok, 'cookie read among other cookies');
  eq(readSessionToken(sessionRequest({ cookie: `x${SESSION_COOKIE}=${tok}` })), null, 'similarly named cookie ignored');
  eq(readSessionToken(sessionRequest({})), null, 'no token -> null');
  eq(readSessionToken(sessionRequest({ authorization: 'Basic abc' })), null, 'non-Bearer authorization ignored');
  const sc = buildSessionCookie('T', 100);
  check(/HttpOnly/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc) && /Max-Age=100/.test(sc), 'session cookie attributes');
  check(!/Secure/.test(sc), 'no Secure flag outside production (http://localhost dev)');
  withEnv({ NODE_ENV: 'production' }, () => {
    check(/Secure/.test(buildSessionCookie('T', 100)), 'Secure flag in production');
  });
  check(!/Max-Age/.test(buildSessionCookie('T')), 'no Max-Age -> browser-session cookie');
  check(/Max-Age=0/.test(buildClearedSessionCookie()), 'cleared cookie has Max-Age=0');

  const req = (headers: Record<string, string>) =>
    new Request('https://waslity.vercel.app/api/auth/login', { method: 'POST', headers });
  eq(isCrossOriginRequest(req({})), false, 'no Origin header -> allowed');
  eq(isCrossOriginRequest(req({ origin: 'https://waslity.vercel.app', host: 'waslity.vercel.app' })), false, 'same origin allowed');
  eq(isCrossOriginRequest(req({ origin: 'https://dialycare.vercel.app', host: 'dialycare.vercel.app' })), false, 'other Vercel alias allowed when it is the request Host');
  eq(isCrossOriginRequest(req({ origin: 'http://localhost:3001', host: 'localhost:3001' })), false, 'local dev port allowed');
  eq(isCrossOriginRequest(req({ origin: 'https://evil.example', host: 'waslity.vercel.app' })), true, 'foreign Origin rejected');
  eq(isCrossOriginRequest(req({ origin: 'https://waslity.vercel.app.evil.example', host: 'waslity.vercel.app' })), true, 'suffix-trick Origin rejected');
  eq(isCrossOriginRequest(req({ origin: 'null', host: 'waslity.vercel.app' })), true, 'Origin: null rejected');
  eq(isCrossOriginRequest(req({ origin: 'not a url', host: 'waslity.vercel.app' })), true, 'malformed Origin rejected');

  // ---------------------------------------------------------- 4. credentials
  console.log('--- 4. credential checks');
  check(passwordMatches('patient123', 'patient123'), 'equal passwords match');
  check(!passwordMatches('patient123', 'patient124'), 'different passwords do not match');
  check(!passwordMatches('', ''), 'empty stored password never matches');
  check(!passwordMatches(undefined, ''), 'missing stored password never matches');
  check(!passwordMatches('abc', undefined), 'non-string input never matches');

  const mkUser = (uid: string, extra: Partial<User> = {}): User => ({
    uid,
    role: 'doctor',
    username: uid,
    displayName: uid,
    language: 'ar',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...extra,
  });
  const list: StoredAccount[] = [
    { username: 'DrSara', phone: '01011112222', password: 'saraPass1', user: mkUser('d1', { email: 'sara@x.eg' }) },
    { username: 'pend', password: 'pendPass1', user: mkUser('d2', { status: 'pending' }) },
    { username: 'rej', password: 'rejPass1', user: mkUser('d3', { status: 'rejected', rejectionReason: 'no license' }) },
    { username: '01033334444', phone: '01033334444', password: 'dupPass1', user: mkUser('d4', { status: 'rejected' }) },
    { username: 'dup-active', phone: '01033334444', password: 'dupPass1', user: mkUser('d5') },
  ];
  eq(authenticate(list, 'drsara', 'saraPass1').kind, 'ok', 'username is case-insensitive');
  eq(authenticate(list, '  DrSara ', 'saraPass1').kind, 'ok', 'identifier trimmed');
  eq(authenticate(list, '+201011112222', 'saraPass1').kind, 'ok', 'phone with +20 country code');
  eq(authenticate(list, '010 1111 2222', 'saraPass1').kind, 'ok', 'phone with spaces');
  eq(authenticate(list, 'SARA@x.eg', 'saraPass1').kind, 'ok', 'email login');
  eq(authenticate(list, 'drsara', 'wrong').kind, 'invalid', 'wrong password -> invalid');
  eq(authenticate(list, 'nobody', 'saraPass1').kind, 'invalid', 'unknown user -> invalid (same as wrong password)');
  eq(authenticate(list, 'pend', 'wrong').kind, 'invalid', 'pending status NOT revealed without the right password');
  eq(authenticate(list, 'pend', 'pendPass1').kind, 'pending', 'pending revealed after correct password');
  const r = authenticate(list, 'rej', 'rejPass1');
  eq(r.kind, 'rejected', 'rejected revealed after correct password');
  const dup = authenticate(list, '01033334444', 'dupPass1');
  eq(dup.kind === 'ok' && dup.account.user.uid, 'd5', 'active account preferred over rejected duplicate');
  eq(authenticate(list, 'drsara', 123 as unknown as string).kind, 'invalid', 'non-string password -> invalid');
  const pub = toPublicAccount(list[0]);
  check(!('password' in pub), 'toPublicAccount strips password');
  eq(pub.user.uid, 'd1', 'toPublicAccount keeps user');

  // --------------------------------------------------------- 5. login route
  console.log('--- 5. POST /api/auth/login');
  const adminRes = await loginRoute(loginRequest({ identifier: 'admin', password: 'admin123' }));
  eq(adminRes.status, 200, 'demo admin logs in');
  const adminBody = await adminRes.json();
  eq(adminBody.success, true, 'admin success');
  eq(adminBody.user.role, 'admin', 'admin role from server account');
  check(!JSON.stringify(adminBody).includes('"password"'), 'login response has no password field');
  check(!JSON.stringify(adminBody).includes(cookieFrom(adminRes)), 'token not in JSON body');
  const setCookie = adminRes.headers.get('set-cookie') || '';
  check(/HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie), 'login sets HttpOnly SameSite cookie');
  check(/Max-Age=2592000/.test(setCookie), 'rememberMe default -> 30 day cookie');
  const adminToken = cookieFrom(adminRes);
  const adminPayload = verifySessionToken(adminToken);
  check(adminPayload && adminPayload.uid === 'admin-1' && adminPayload.role === 'admin', 'cookie holds a valid admin token');
  eq(adminRes.headers.get('cache-control')?.includes('no-store'), true, 'login response is no-store');

  for (let i = 1; i <= 7; i++) {
    const res = await loginRoute(loginRequest({ identifier: `patient${i}`, password: 'patient123' }));
    eq(res.status, 200, `demo patient${i} logs in`);
    const b = await res.json();
    eq(b.user.uid, `patient-${i}`, `patient${i} uid`);
  }
  const phoneRes = await loginRoute(loginRequest({ identifier: '01012345678', password: 'patient123' }));
  eq(phoneRes.status, 200, 'patient1 logs in with phone');
  const intlRes = await loginRoute(loginRequest({ identifier: '+20 101 234 5678', password: 'patient123' }));
  eq(intlRes.status, 200, 'patient1 logs in with +20 phone');

  const shortRes = await loginRoute(loginRequest({ identifier: 'patient1', password: 'patient123', rememberMe: false }));
  const shortCookie = shortRes.headers.get('set-cookie') || '';
  check(!/Max-Age/.test(shortCookie), 'rememberMe:false -> session cookie');
  const shortPayload = verifySessionToken(cookieFrom(shortRes))!;
  eq(shortPayload.exp - shortPayload.iat, 12 * 3600, 'rememberMe:false -> 12h token');

  const wrongRes = await loginRoute(loginRequest({ identifier: 'admin', password: 'nope' }));
  const unknownRes = await loginRoute(loginRequest({ identifier: 'ghost', password: 'nope' }));
  eq(wrongRes.status, 401, 'wrong password 401');
  eq(unknownRes.status, 401, 'unknown user 401');
  eq(JSON.stringify(await wrongRes.json()), JSON.stringify(await unknownRes.json()), 'wrong password and unknown user give identical bodies');
  eq(wrongRes.headers.get('set-cookie'), null, 'no cookie on failed login');
  eq((await loginRoute(loginRequest({ identifier: 'admin', password: '' }))).status, 401, 'empty password 401');
  eq((await loginRoute(loginRequest({ identifier: '', password: 'admin123' }))).status, 401, 'empty identifier 401');
  eq((await loginRoute(loginRequest({ identifier: ['admin'], password: 'admin123' }))).status, 401, 'non-string identifier 401');
  eq((await loginRoute(loginRequest(null, '{not json'))).status, 400, 'malformed JSON 400');
  eq((await loginRoute(loginRequest({ identifier: 'admin', password: 'a'.repeat(600) }))).status, 401, 'oversized password 401');
  {
    const crossReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.example', host: 'localhost:3000' },
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const crossRes = await loginRoute(crossReq);
    eq(crossRes.status, 403, 'cross-origin login POST rejected');
    eq(crossRes.headers.get('set-cookie'), null, 'no cookie for cross-origin login');
  }

  // pending / rejected accounts via the in-memory cloud store
  const backup = await getCloudAccounts();
  try {
    await saveCloudAccounts([
      ...backup,
      { username: 'pending_doc', password: 'PendDoc2026', user: mkUser('pd-1', { username: 'pending_doc', status: 'pending' }) },
      { username: 'rejected_doc', password: 'RejDoc2026', user: mkUser('rd-1', { username: 'rejected_doc', status: 'rejected', rejectionReason: 'license unreadable' }) },
      { username: 'active_doc', password: 'ActDoc2026', user: mkUser('ad-1', { username: 'active_doc' }) },
    ]);
    const pendRes = await loginRoute(loginRequest({ identifier: 'pending_doc', password: 'PendDoc2026' }));
    eq(pendRes.status, 403, 'pending account 403');
    const pendBody = await pendRes.json();
    eq(pendBody.status, 'pending', 'pending status returned');
    eq(pendRes.headers.get('set-cookie'), null, 'no cookie for pending');
    check(!JSON.stringify(pendBody).includes('"password"'), 'pending response has no password');
    const pendWrong = await loginRoute(loginRequest({ identifier: 'pending_doc', password: 'x' }));
    eq(pendWrong.status, 401, 'pending account with wrong password is plain 401');
    const rejRes = await loginRoute(loginRequest({ identifier: 'rejected_doc', password: 'RejDoc2026' }));
    eq(rejRes.status, 403, 'rejected account 403');
    const rejBody = await rejRes.json();
    eq(rejBody.status, 'rejected', 'rejected status returned');
    eq(rejBody.rejectionReason, 'license unreadable', 'rejection reason returned');
    eq(rejRes.headers.get('set-cookie'), null, 'no cookie for rejected');

    // ------------------------------------------------------- 6. session route
    console.log('--- 6. GET /api/auth/session + getSession');
    const okRes = await sessionRoute(sessionRequest({ cookie: `${SESSION_COOKIE}=${adminToken}` }));
    eq(okRes.status, 200, 'session with admin cookie 200');
    const okBody = await okRes.json();
    eq(okBody.user.uid, 'admin-1', 'session returns the admin user');
    check(!JSON.stringify(okBody).includes('"password"'), 'session response has no password');
    eq((await sessionRoute(sessionRequest({ authorization: `Bearer ${adminToken}` }))).status, 200, 'Bearer works too');

    const noRes = await sessionRoute(sessionRequest());
    eq(noRes.status, 401, 'no token 401');
    eq(noRes.headers.get('set-cookie'), null, 'nothing to clear when there was no token');
    const badRes = await sessionRoute(sessionRequest({ cookie: `${SESSION_COOKIE}=${adminToken}x` }));
    eq(badRes.status, 401, 'tampered cookie 401');
    check(/Max-Age=0/.test(badRes.headers.get('set-cookie') || ''), 'tampered cookie gets cleared');

    const ghost = createSessionToken({ uid: 'no-such-uid', role: 'admin' })!;
    eq((await sessionRoute(sessionRequest({ authorization: `Bearer ${ghost}` }))).status, 401, 'valid token for unknown uid 401');

    // Role comes from the server account, not from the token.
    const lying = createSessionToken({ uid: 'patient-1', role: 'admin' })!;
    const lyingRes = await sessionRoute(sessionRequest({ authorization: `Bearer ${lying}` }));
    eq(lyingRes.status, 200, 'token with wrong role claim still identifies patient-1');
    eq((await lyingRes.json()).user.role, 'patient', 'role is taken from the server account (patient), not the token (admin)');
    const lyingStaff = await getSession(sessionRequest({ authorization: `Bearer ${lying}` }), { roles: STAFF_ROLES });
    eq(lyingStaff.ok === false && lyingStaff.status, 403, 'patient with forged admin claim is 403 for staff-only routes');

    const activeTok = createSessionToken({ uid: 'ad-1', role: 'doctor' })!;
    eq((await sessionRoute(sessionRequest({ authorization: `Bearer ${activeTok}` }))).status, 200, 'active doctor session 200');
    const staffOk = await getSession(sessionRequest({ authorization: `Bearer ${activeTok}` }), { roles: STAFF_ROLES });
    eq(staffOk.ok, true, 'doctor allowed on staff routes');
    const adminOnly = await getSession(sessionRequest({ authorization: `Bearer ${activeTok}` }), { roles: ['admin'] });
    eq(adminOnly.ok === false && adminOnly.status, 403, 'doctor forbidden on admin-only routes');

    const pendTok = createSessionToken({ uid: 'pd-1', role: 'doctor' })!;
    eq((await sessionRoute(sessionRequest({ authorization: `Bearer ${pendTok}` }))).status, 401, 'pending account token 401');

    // Revocation: rejecting an account invalidates its existing session at once.
    const current = await getCloudAccounts();
    await saveCloudAccounts(
      current.map((a) => (a.user.uid === 'ad-1' ? { ...a, user: { ...a.user, status: 'rejected' as const } } : a))
    );
    eq((await sessionRoute(sessionRequest({ authorization: `Bearer ${activeTok}` }))).status, 401, 'session revoked after account is rejected');
  } finally {
    await saveCloudAccounts(backup);
  }

  // ------------------------------------------------------- 7. logout route
  console.log('--- 7. POST /api/auth/logout');
  const outRes = await logoutRoute();
  eq(outRes.status, 200, 'logout 200');
  check(/Max-Age=0/.test(outRes.headers.get('set-cookie') || ''), 'logout clears cookie');

  // ---------------------------------------------- 8. production fail-closed
  console.log('--- 8. production without a signing key');
  env.NODE_ENV = 'production';
  try {
    const prodRes = await loginRoute(loginRequest({ identifier: 'admin', password: 'admin123' }));
    eq(prodRes.status, 503, 'login refuses (503) in production without a key');
    eq(prodRes.headers.get('set-cookie'), null, 'no cookie issued');
    const noKeyRes = await sessionRoute(sessionRequest({ authorization: `Bearer ${adminToken}` }));
    eq(noKeyRes.status, 503, 'session route 503 in production without a key (even with a token)');
    const noKeyBody = await noKeyRes.json();
    eq(noKeyBody.error, 'authNotConfigured', 'generic authNotConfigured error');
    check(!/SESSION_SECRET|BLOB|VERCEL|token/i.test(JSON.stringify(noKeyBody)), '503 body names no env var');
    eq((await sessionRoute(sessionRequest())).status, 503, 'session route 503 without token when no key');
    eq(verifySessionToken(adminToken), null, 'dev token rejected in production');
  } finally {
    delete env.NODE_ENV;
  }
}

run()
  .then(() => {
    console.warn = originalWarn;
    if (ORIGINAL_NODE_ENV !== undefined) env.NODE_ENV = ORIGINAL_NODE_ENV;
    console.log(`\nSERVER-AUTH SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.warn = originalWarn;
    console.error('SERVER-AUTH SUITE FAILED:', err);
    process.exit(1);
  });
