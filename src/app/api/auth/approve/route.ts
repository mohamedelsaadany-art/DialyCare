import { NextResponse } from 'next/server';
import { approveCloudAccount } from '@/lib/cloud-store';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/** POST /api/auth/approve { uid } — ADMIN ONLY. The reviewer name comes from the session, not the body. */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const uid = body && typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Missing uid' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const result = await approveCloudAccount(uid, session.user.displayName || session.user.username || 'Super Admin');
    if (!result.account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { success: true, user: result.account.user, newPatient: result.newPatient },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/auth/approve] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'approveFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
