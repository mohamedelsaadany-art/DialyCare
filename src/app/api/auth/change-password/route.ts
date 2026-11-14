import { NextResponse } from 'next/server';
import {
  buildSessionCookie,
  createSessionToken,
  getSession,
  hashPassword,
  isCrossOriginRequest,
  NO_STORE_HEADERS,
  SESSION_TTL_REMEMBER_SECONDS,
  sessionErrorResponse,
  storeAccountPassword,
  verifyPassword,
} from '@/lib/server-auth';

const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * POST /api/auth/change-password { currentPassword, newPassword }  (B2)
 * Any signed-in ACTIVE user changes their OWN password.
 * - 401 no/invalid session; 401 { error: 'wrongPassword' } if currentPassword is wrong
 * - 400 { error: 'invalidPassword' } new password not 6..200 chars or equal to the current one
 * - 200 { success: true } — stores a scrypt hash + passwordUpdatedAt, which ends every
 *   OTHER session issued before now; this device gets a fresh session cookie.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) return json({ success: false, error: 'forbidden' }, 403);
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown> | null;
  } catch {
    return json({ success: false, error: 'invalidRequest' }, 400);
  }
  const currentPassword = body && typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!verifyPassword(session.account.password, currentPassword).ok) {
    return json({ success: false, error: 'wrongPassword' }, 401);
  }
  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD || newPassword === currentPassword) {
    return json({ success: false, error: 'invalidPassword' }, 400);
  }

  try {
    const saved = await storeAccountPassword(session.user.uid, hashPassword(newPassword), true);
    if (!saved) return json({ success: false, error: 'unauthorized' }, 401);

    // Issued after passwordUpdatedAt was stamped, so its iat passes the check in getSession.
    const token = createSessionToken(
      { uid: session.user.uid, role: session.user.role },
      { ttlSeconds: SESSION_TTL_REMEMBER_SECONDS }
    );
    const res = json({ success: true }, 200);
    if (token) res.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL_REMEMBER_SECONDS));
    return res;
  } catch (error: unknown) {
    console.error('[API /api/auth/change-password] Error:', error instanceof Error ? error.message : error);
    return json({ success: false, error: 'changeFailed' }, 500);
  }
}
