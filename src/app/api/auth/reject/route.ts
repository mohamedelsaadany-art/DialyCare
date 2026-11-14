import { NextResponse } from 'next/server';
import { rejectCloudAccount } from '@/lib/cloud-store';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/**
 * POST /api/auth/reject { uid, reason } — ADMIN ONLY. The reviewer name comes
 * from the session, not the body. The seeded super admin (and the caller
 * themself) can never be rejected.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const uid = body && typeof body.uid === 'string' ? body.uid.trim() : '';
    const reason = body && typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Missing uid' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (uid === 'admin-1' || uid === session.user.uid) {
      return NextResponse.json(
        { success: false, error: 'Cannot reject this account' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const account = await rejectCloudAccount(
      uid,
      reason || 'لم يستوفِ متطلبات الاعتماد',
      session.user.displayName || session.user.username || 'Super Admin'
    );

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ success: true, user: account.user }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    console.error('[API /api/auth/reject] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'rejectFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
