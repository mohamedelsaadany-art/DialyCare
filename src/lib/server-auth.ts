/**
 * Server-side session + credential helpers (B1).
 *
 * SERVER ONLY. Never import this file from a client component: it reads
 * server secrets from process.env and uses node:crypto.
 *
 * Session token format:  v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>
 *   payload = { uid, role, iat, exp }   (seconds since epoch)
 * The token travels in an HttpOnly cookie (SESSION_COOKIE) or, for tests and
 * non-browser callers, in an `Authorization: Bearer` header. It is never
 * returned in a JSON body.
 *
 * Authorization never trusts the role inside the token: getSession() re-loads
 * the account by uid on every request and uses the CURRENT server-side role and
 * status, so rejecting/deleting an account revokes its sessions immediately.
 *
 * Signing key (see getSessionKey):
 *   1. SESSION_SECRET (>= 32 chars) if set
 *   2. else HMAC-SHA256(key = BLOB_READ_WRITE_TOKEN, msg = "waslity-session-v1")
 *      (that token already exists in production and is server-only; anyone
 *      holding it can already read/write the whole database, so deriving the
 *      key from it grants no new power and needs no new env var)
 *   3. else, ONLY outside production: a fixed dev secret + loud warning
 *   4. production with neither: null -> login refuses (503), every token fails.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { StoredAccount, User, UserRole } from './types';
import { isPhoneMatch } from './data-store';
import { getCloudAccounts } from './cloud-store';

export const SESSION_COOKIE = 'waslity_session';
export const SESSION_TTL_REMEMBER_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_TTL_SHORT_SECONDS = 12 * 60 * 60; // 12 hours

export const STAFF_ROLES: readonly UserRole[] = ['admin', 'doctor', 'nurse', 'staff'];
const ALL_ROLES: readonly UserRole[] = ['admin', 'doctor', 'nurse', 'staff', 'patient'];

const TOKEN_VERSION = 'v1';
const KEY_DERIVATION_LABEL = 'waslity-session-v1';
const DEV_ONLY_SECRET = 'waslity-dev-only-session-secret--never-used-in-production';
const MAX_TOKEN_LENGTH = 4096;
const CLOCK_SKEW_SECONDS = 60;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Signing key
// ---------------------------------------------------------------------------

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

const warned = new Set<string>();
function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

/**
 * Returns the 32-byte HMAC key, or null when no safe key exists (production
 * without SESSION_SECRET and without BLOB_READ_WRITE_TOKEN). Never logs the key.
 */
export function getSessionKey(): Buffer | null {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 32) {
    return createHash('sha256').update(explicit, 'utf8').digest();
  }
  if (explicit) {
    warnOnce('short-secret', '[server-auth] SESSION_SECRET is shorter than 32 characters and is ignored.');
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    return createHmac('sha256', blobToken).update(KEY_DERIVATION_LABEL, 'utf8').digest();
  }

  if (isProductionRuntime()) {
    warnOnce(
      'no-key-prod',
      '[server-auth] No SESSION_SECRET and no BLOB_READ_WRITE_TOKEN in production: refusing to issue or accept sessions.'
    );
    return null;
  }

  warnOnce(
    'dev-key',
    '\n[server-auth] ************************************************************\n' +
      '[server-auth] WARNING: using the FIXED DEV-ONLY session secret.\n' +
      '[server-auth] Sessions are forgeable. This must never happen in production.\n' +
      '[server-auth] ************************************************************\n'
  );
  return createHash('sha256').update(DEV_ONLY_SECRET, 'utf8').digest();
}

// ---------------------------------------------------------------------------
// Token create / verify
// ---------------------------------------------------------------------------

export interface SessionPayload {
  uid: string;
  role: UserRole;
  iat: number;
  exp: number;
}

function sign(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export function createSessionToken(
  subject: { uid: string; role: UserRole },
  options: { ttlSeconds?: number; nowMs?: number } = {}
): string | null {
  const key = getSessionKey();
  if (!key) return null;
  if (!subject || typeof subject.uid !== 'string' || !subject.uid) return null;
  const iat = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const ttl = options.ttlSeconds ?? SESSION_TTL_SHORT_SECONDS;
  const payload: SessionPayload = { uid: subject.uid, role: subject.role, iat, exp: iat + ttl };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${TOKEN_VERSION}.${body}`;
  return `${signingInput}.${sign(key, signingInput).toString('base64url')}`;
}

export function verifySessionToken(token: unknown, nowMs: number = Date.now()): SessionPayload | null {
  try {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [version, body, sig] = parts;
    if (version !== TOKEN_VERSION) return null;
    if (!B64URL_RE.test(body) || !B64URL_RE.test(sig)) return null;

    const key = getSessionKey();
    if (!key) return null;

    const expected = sign(key, `${version}.${body}`);
    const given = Buffer.from(sig, 'base64url');
    // Reject non-canonical encodings (trailing bits) and wrong lengths before comparing.
    if (given.length !== expected.length || given.toString('base64url') !== sig) return null;
    if (!timingSafeEqual(given, expected)) return null;

    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.uid !== 'string' || p.uid.length === 0 || p.uid.length > 200) return null;
    if (typeof p.role !== 'string' || !ALL_ROLES.includes(p.role as UserRole)) return null;
    if (typeof p.iat !== 'number' || !Number.isFinite(p.iat)) return null;
    if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) return null;

    const nowS = Math.floor(nowMs / 1000);
    if (p.exp <= nowS) return null;
    if (p.iat > nowS + CLOCK_SKEW_SECONDS) return null;
    if (p.exp <= p.iat) return null;

    return { uid: p.uid, role: p.role as UserRole, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie / header transport
// ---------------------------------------------------------------------------

export function readSessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim();
      return value || null;
    }
  }
  return null;
}

/** Set-Cookie value. maxAgeSeconds undefined -> browser-session cookie. */
export function buildSessionCookie(token: string, maxAgeSeconds?: number): string {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAgeSeconds === 'number') attrs.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  if (isProductionRuntime()) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearedSessionCookie(): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProductionRuntime()) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * True when the request carries an Origin header whose host differs from the
 * host the request was sent to (the request's own Host header, so every Vercel
 * alias works). Requests without an Origin header (same-origin GETs, curl,
 * tests, older browsers) are NOT treated as cross-origin.
 */
export function isCrossOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return origin === 'null';
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  const hosts = new Set<string>();
  const host = request.headers.get('host');
  if (host) hosts.add(host.trim().toLowerCase());
  const fwd = request.headers.get('x-forwarded-host');
  if (fwd) for (const h of fwd.split(',')) hosts.add(h.trim().toLowerCase());
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // ignore
  }
  return !hosts.has(originHost);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Constant-time password comparison (B1: stored passwords are still plaintext;
 * B2 replaces this with scrypt). Both sides are hashed first so the comparison
 * is over equal-length buffers regardless of input length.
 */
export function passwordMatches(stored: unknown, given: unknown): boolean {
  const a = createHash('sha256').update(typeof stored === 'string' ? stored : '', 'utf8').digest();
  const b = createHash('sha256').update(typeof given === 'string' ? given : '', 'utf8').digest();
  const equal = timingSafeEqual(a, b);
  return equal && typeof stored === 'string' && stored.length > 0 && typeof given === 'string';
}

export type PublicAccount = Omit<StoredAccount, 'password'>;

/** Strip the password. Use for EVERY account that leaves the server. */
export function toPublicAccount(acc: StoredAccount): PublicAccount {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = acc as StoredAccount & Record<string, unknown>;
  return { ...rest, user: { ...acc.user } } as PublicAccount;
}

function accountMatchesIdentifier(acc: StoredAccount, identifier: string): boolean {
  if (!acc || !acc.user) return false;
  const id = identifier.trim();
  if (!id) return false;
  const idLower = id.toLowerCase();
  if (acc.username && acc.username.trim().toLowerCase() === idLower) return true;
  if (acc.user.email && acc.user.email.trim().toLowerCase() === idLower) return true;
  const cleanId = id.replace(/[\s\-()+]/g, '');
  if (!/^\d{6,}$/.test(cleanId)) return false; // phone matching only for phone-like identifiers
  return (
    isPhoneMatch(acc.phone, id) ||
    isPhoneMatch(acc.user.phone, id) ||
    isPhoneMatch(acc.username, id)
  );
}

export type AuthenticateResult =
  | { kind: 'ok'; account: StoredAccount }
  | { kind: 'pending'; account: StoredAccount }
  | { kind: 'rejected'; account: StoredAccount }
  | { kind: 'invalid' };

/**
 * Pure credential check against a list of stored accounts.
 * Unknown identifier and wrong password both return { kind: 'invalid' }.
 * Pending / rejected status is only revealed after a correct password.
 */
export function authenticate(accounts: StoredAccount[], identifier: unknown, password: unknown): AuthenticateResult {
  if (typeof identifier !== 'string' || typeof password !== 'string') return { kind: 'invalid' };
  const candidates = accounts.filter((a) => accountMatchesIdentifier(a, identifier));
  if (candidates.length === 0) {
    passwordMatches('dummy-password-for-timing', password);
    return { kind: 'invalid' };
  }
  // Check every candidate (no early exit) so timing does not depend on position.
  const verified = candidates.filter((a) => passwordMatches(a.password, password));
  if (verified.length === 0) return { kind: 'invalid' };

  const active = verified.find((a) => (a.user.status || 'active') === 'active');
  const chosen = active || verified[0];
  const status = chosen.user.status || 'active';
  if (status === 'pending') return { kind: 'pending', account: chosen };
  if (status === 'rejected') return { kind: 'rejected', account: chosen };
  return { kind: 'ok', account: chosen };
}

// ---------------------------------------------------------------------------
// Request session resolution
// ---------------------------------------------------------------------------

export type SessionResult =
  | { ok: true; account: StoredAccount; user: User; payload: SessionPayload }
  | { ok: false; status: 401 | 403; error: string; hadToken: boolean };

/**
 * Resolve the caller's session. Reads the request headers FIRST (synchronously,
 * before any await) so GET handlers become dynamic before touching storage.
 */
export async function getSession(
  request: Request,
  options: { roles?: readonly UserRole[]; loadAccounts?: () => Promise<StoredAccount[]> } = {}
): Promise<SessionResult> {
  const token = readSessionToken(request);
  if (!token) return { ok: false, status: 401, error: 'unauthorized', hadToken: false };
  const payload = verifySessionToken(token);
  if (!payload) return { ok: false, status: 401, error: 'unauthorized', hadToken: true };

  const accounts = await (options.loadAccounts ?? getCloudAccounts)();
  const account = accounts.find((a) => a.user && a.user.uid === payload.uid);
  if (!account) return { ok: false, status: 401, error: 'unauthorized', hadToken: true };
  const status = account.user.status || 'active';
  if (status !== 'active') return { ok: false, status: 401, error: 'unauthorized', hadToken: true };

  if (options.roles && !options.roles.includes(account.user.role)) {
    return { ok: false, status: 403, error: 'forbidden', hadToken: true };
  }
  return { ok: true, account, user: { ...account.user }, payload };
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/** JSON error response for a failed SessionResult; clears a bad cookie. */
export function sessionErrorResponse(result: Extract<SessionResult, { ok: false }>): NextResponse {
  const res = NextResponse.json(
    { success: false, error: result.error },
    { status: result.status, headers: NO_STORE_HEADERS }
  );
  if (result.status === 401 && result.hadToken) {
    res.headers.append('Set-Cookie', buildClearedSessionCookie());
  }
  return res;
}
