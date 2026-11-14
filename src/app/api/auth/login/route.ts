import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import {
  authenticate,
  buildSessionCookie,
  createSessionToken,
  getSessionKey,
  hashPassword,
  isCrossOriginRequest,
  migratePlaintextPasswords,
  storeAccountPassword,
  NO_STORE_HEADERS,
  SESSION_TTL_REMEMBER_SECONDS,
  SESSION_TTL_SHORT_SECONDS,
} from '@/lib/server-auth';

const MAX_IDENTIFIER_LENGTH = 200;
const MAX_PASSWORD_LENGTH = 500;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * POST /api/auth/login  { identifier, password, rememberMe? }
 * - 200 { success: true, status: 'active', user }  + HttpOnly session cookie
 * - 403 { success: false, status: 'pending' | 'rejected', user, rejectionReason? }  (no cookie)
 * - 401 { success: false, error: 'invalidCredentials' }  (unknown user and wrong password look the same)
 * - 503 { success: false, error: 'sessionUnavailable' }  (production without a signing key)
 * The response never contains a password or the token itself.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'invalidRequest' }, 400);
  }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const identifier = typeof b.identifier === 'string' ? b.identifier.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const rememberMe = b.rememberMe !== false;

  if (!identifier || !password) {
    return json({ success: false, error: 'invalidCredentials' }, 401);
  }
  if (identifier.length > MAX_IDENTIFIER_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return json({ success: false, error: 'invalidCredentials' }, 401);
  }
  if (!getSessionKey()) {
    return json({ success: false, error: 'sessionUnavailable' }, 503);
  }

  try {
    const accounts = await getCloudAccounts();
    const result = authenticate(accounts, identifier, password);

    if (result.kind === 'invalid') {
      return json({ success: false, error: 'invalidCredentials' }, 401);
    }
    const user = { ...result.account.user };
    if (result.kind === 'pending') {
      return json({ success: false, status: 'pending', user }, 403);
    }
    if (result.kind === 'rejected') {
      return json(
        { success: false, status: 'rejected', user, rejectionReason: user.rejectionReason },
        403
      );
    }

    // B2: transparently re-hash a legacy plaintext password, and on an admin
    // login hash every remaining plaintext password (one accounts-blob write).
    // Failures are logged and never block the login.
    if (result.needsUpgrade) {
      try {
        await storeAccountPassword(user.uid, hashPassword(password), false);
      } catch (err) {
        console.warn('[API /api/auth/login] password upgrade failed:', err instanceof Error ? err.message : err);
      }
    }
    if (user.role === 'admin') {
      try {
        const n = await migratePlaintextPasswords();
        if (n > 0) console.warn(`[API /api/auth/login] hashed ${n} legacy plaintext password(s)`);
      } catch (err) {
        console.warn('[API /api/auth/login] bulk password migration failed:', err instanceof Error ? err.message : err);
      }
    }

    const ttl = rememberMe ? SESSION_TTL_REMEMBER_SECONDS : SESSION_TTL_SHORT_SECONDS;
    const token = createSessionToken({ uid: user.uid, role: user.role }, { ttlSeconds: ttl });
    if (!token) {
      return json({ success: false, error: 'sessionUnavailable' }, 503);
    }
    const res = json({ success: true, status: 'active', user: { ...user, status: user.status || 'active' } }, 200);
    res.headers.append('Set-Cookie', buildSessionCookie(token, rememberMe ? ttl : undefined));
    return res;
  } catch (error: unknown) {
    console.error('[API /api/auth/login] Error:', error instanceof Error ? error.message : error);
    return json({ success: false, error: 'loginFailed' }, 500);
  }
}
