import { NextResponse } from 'next/server';
import { buildClearedSessionCookie, NO_STORE_HEADERS } from '@/lib/server-auth';

/** POST /api/auth/logout — clears the session cookie. Always 200. */
export async function POST() {
  const res = NextResponse.json({ success: true }, { status: 200, headers: NO_STORE_HEADERS });
  res.headers.append('Set-Cookie', buildClearedSessionCookie());
  return res;
}
