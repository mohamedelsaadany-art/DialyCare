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
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { StoredAccount, User, UserRole } from './types';
import { isPhoneMatch, toAsciiDigits } from './phone';
import { getCloudAccounts, saveCloudAccounts } from './cloud-store';

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

// ---- Password hashing (B2) ------------------------------------------------
//
// Stored format:  scrypt$1$<N>$<r>$<p>$<salt b64url>$<key b64url>
// Random 16-byte salt per password, 32-byte derived key; verification re-derives
// with the STORED parameters and compares with timingSafeEqual. Anything that
// does not start with "scrypt$" is a legacy plaintext password (pre-B2 data):
// it is still accepted (constant-time compare) and flagged for upgrade.
// A value that starts with "scrypt$" but does not parse NEVER matches.
// Sync scrypt (~50 ms) on purpose: login is rare and keeps call sites simple.

const SCRYPT_PREFIX = 'scrypt$';
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32, saltLength: 16 } as const;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const MAX_PASSWORD_INPUT = 1000;

export function isPasswordHash(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

export function hashPassword(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0 || plain.length > MAX_PASSWORD_INPUT) {
    throw new Error('invalid password input');
  }
  const { N, r, p, keyLength, saltLength } = SCRYPT_PARAMS;
  const salt = randomBytes(saltLength);
  const key = scryptSync(plain, salt, keyLength, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return `scrypt$1$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseCanonicalB64url(part: string, min: number, max: number): Buffer | null {
  if (!B64URL_RE.test(part)) return null;
  const buf = Buffer.from(part, 'base64url');
  if (buf.length < min || buf.length > max || buf.toString('base64url') !== part) return null;
  return buf;
}

function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== '1') return null;
  if (!/^\d{1,8}$/.test(parts[2]) || !/^\d{1,2}$/.test(parts[3]) || !/^\d{1,2}$/.test(parts[4])) return null;
  const N = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  // N must be a power of two in [2^14, 2^20]; r/p bounded so a planted hash can't exhaust memory/CPU.
  if (N < 16384 || N > 1048576 || (N & (N - 1)) !== 0) return null;
  if (r < 1 || r > 16 || p < 1 || p > 4) return null;
  if (128 * N * r > SCRYPT_MAXMEM / 2) return null;
  const salt = parseCanonicalB64url(parts[5], 16, 64);
  const key = parseCanonicalB64url(parts[6], 32, 64);
  if (!salt || !key) return null;
  return { N, r, p, salt, key };
}

let dummyParsed: ParsedHash | null = null;
function dummyHashParsed(): ParsedHash {
  if (!dummyParsed) dummyParsed = parsePasswordHash(hashPassword(randomBytes(18).toString('base64url')));
  return dummyParsed!;
}

function derive(candidate: string, h: ParsedHash): Buffer {
  return scryptSync(candidate, h.salt, h.key.length, { N: h.N, r: h.r, p: h.p, maxmem: SCRYPT_MAXMEM });
}

function legacyPlaintextEquals(stored: string, given: string): boolean {
  const a = createHash('sha256').update(stored, 'utf8').digest();
  const b = createHash('sha256').update(given, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export interface PasswordCheck {
  ok: boolean;
  /** true when the password matched a legacy plaintext (or weaker-parameter) value and should be re-hashed */
  needsUpgrade: boolean;
}

/**
 * Verify a password against a stored value (scrypt hash or legacy plaintext).
 * Always performs exactly one scrypt derivation so timing does not reveal
 * whether an account exists or is still on a plaintext password.
 */
export function verifyPassword(stored: unknown, given: unknown): PasswordCheck {
  const fail: PasswordCheck = { ok: false, needsUpgrade: false };
  const givenOk = typeof given === 'string' && given.length > 0 && given.length <= MAX_PASSWORD_INPUT;
  const candidate = givenOk ? (given as string) : 'x';

  if (typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX)) {
    const parsed = parsePasswordHash(stored);
    if (!parsed) {
      derive(candidate, dummyHashParsed()); // keep timing uniform; garbled hashes never match
      return fail;
    }
    const derived = derive(candidate, parsed);
    const ok = givenOk && derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key);
    const weaker =
      parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.key.length < SCRYPT_PARAMS.keyLength;
    return { ok, needsUpgrade: ok && weaker };
  }

  // Legacy plaintext (or missing): one dummy derivation for uniform timing.
  derive(candidate, dummyHashParsed());
  if (typeof stored !== 'string' || stored.length === 0 || !givenOk) return fail;
  const ok = legacyPlaintextEquals(stored, candidate);
  return { ok, needsUpgrade: ok };
}

/** Boolean form of verifyPassword (accepts scrypt hashes and legacy plaintext). */
export function passwordMatches(stored: unknown, given: unknown): boolean {
  return verifyPassword(stored, given).ok;
}

/**
 * Persist a new stored password for one account. Writes the ACCOUNTS blob only:
 * rewriting the clinical database blob here could race a staff sync and drop
 * clinical rows. getCloudDatabase() reconciles database-blob accounts onto the
 * accounts blob only when their review/registration timestamps are newer, and a
 * password change does not touch those, so the hash wins; the next database
 * save (any staff sync) then carries the hash into the database blob too.
 * markChanged=true records passwordUpdatedAt, which ends sessions issued before it.
 */
export async function storeAccountPassword(uid: string, stored: string, markChanged: boolean): Promise<boolean> {
  const accounts = await getCloudAccounts();
  const idx = accounts.findIndex((a) => a.user && a.user.uid === uid);
  if (idx === -1) return false;
  const updated: StoredAccount = {
    ...accounts[idx],
    password: stored,
    ...(markChanged ? { passwordUpdatedAt: new Date().toISOString() } : {}),
  };
  await saveCloudAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  return true;
}

export const MIGRATION_CAP = 300;
export const MIGRATION_BUDGET_MS = 2000;

/**
 * Hash remaining legacy plaintext passwords in ONE accounts-blob write, bounded
 * by a count cap AND a time budget (sync scrypt is ~50 ms each, so the admin's
 * login request never stalls near the function timeout). Whatever is left is
 * finished on the next admin login. Returns how many were hashed.
 */
export async function migratePlaintextPasswords(
  options: { cap?: number; budgetMs?: number; now?: () => number } = {}
): Promise<number> {
  const cap = options.cap ?? MIGRATION_CAP;
  const budgetMs = options.budgetMs ?? MIGRATION_BUDGET_MS;
  const now = options.now ?? Date.now;
  const started = now();
  const accounts = await getCloudAccounts();
  let count = 0;
  const next = accounts.map((a) => {
    if (count >= cap || now() - started >= budgetMs) return a;
    if (typeof a.password === 'string' && a.password.length > 0 && !isPasswordHash(a.password)) {
      count++;
      return { ...a, password: hashPassword(a.password) };
    }
    return a;
  });
  if (count > 0) await saveCloudAccounts(next);
  return count;
}

export type PublicAccount = Omit<StoredAccount, 'password'>;

/** Strip the password (hash or legacy) and password metadata. Use for EVERY account that leaves the server. */
export function toPublicAccount(acc: StoredAccount): PublicAccount {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, passwordUpdatedAt, ...rest } = acc as StoredAccount & Record<string, unknown>;
  return { ...rest, user: { ...acc.user } } as PublicAccount;
}

function accountMatchesIdentifier(acc: StoredAccount, identifier: string): boolean {
  if (!acc || !acc.user) return false;
  const id = toAsciiDigits(identifier.trim()); // B5: Arabic-Indic digits typed on Arabic keyboards
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
  | { kind: 'ok'; account: StoredAccount; needsUpgrade: boolean }
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
    verifyPassword(undefined, password); // same cost as a real check
    return { kind: 'invalid' };
  }
  // Check every candidate (no early exit) so timing does not depend on position.
  const checks = candidates.map((a) => ({ account: a, check: verifyPassword(a.password, password) }));
  const verified = checks.filter((c) => c.check.ok);
  if (verified.length === 0) return { kind: 'invalid' };

  const active = verified.find((c) => (c.account.user.status || 'active') === 'active');
  const chosen = active || verified[0];
  const status = chosen.account.user.status || 'active';
  if (status === 'pending') return { kind: 'pending', account: chosen.account };
  if (status === 'rejected') return { kind: 'rejected', account: chosen.account };
  return { kind: 'ok', account: chosen.account, needsUpgrade: chosen.check.needsUpgrade };
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
  // A password change ends every session issued before it (B2).
  if (account.passwordUpdatedAt) {
    const changedMs = Date.parse(account.passwordUpdatedAt);
    if (Number.isFinite(changedMs) && payload.iat < Math.floor(changedMs / 1000)) {
      return { ok: false, status: 401, error: 'unauthorized', hadToken: true };
    }
  }

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
