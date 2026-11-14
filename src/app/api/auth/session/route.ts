import { NextResponse } from 'next/server';
import {
  getSession,
  getSessionKey,
  NO_STORE_HEADERS,
  readSessionToken,
  sessionErrorResponse,
} from '@/lib/server-auth';

/**
 * GET /api/auth/session — who am I?
 * 200 { success: true, user } for a valid session on an ACTIVE account
 * (role/status read from the server-side account, not from the token);
 * 401 otherwise (and a bad cookie is cleared);
 * 503 { error: 'authNotConfigured' } when the server has no signing key
 * (deliberately generic: never says which env var is missing).
 * Clients must treat only 401 as "signed out"; 503/5xx/network keep the cached session.
 */
export async function GET(request: Request) {
  // Touch the request headers first so this handler is always dynamic
  // (never prerendered at build time), then check the key.
  readSessionToken(request);
  if (!getSessionKey()) {
    return NextResponse.json(
      { success: false, error: 'authNotConfigured' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  return NextResponse.json({ success: true, user: session.user }, { status: 200, headers: NO_STORE_HEADERS });
}
