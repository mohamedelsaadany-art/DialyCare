import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import { isCrossOriginRequest, NO_STORE_HEADERS } from '@/lib/server-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * POST /api/auth/status { uid } -> { success, status, rejectionReason? }
 *
 * Unauthenticated on purpose: the login page polls it while a freshly
 * registered account waits for admin approval (the registrant has no session
 * yet). It reveals ONLY the review status of a self-registered account, keyed
 * by its random v4 uid (known only to the registrant). Seeded / non-UUID uids
 * are never answered, so the endpoint cannot be used to enumerate accounts.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }
  let uid = '';
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    uid = body && typeof body.uid === 'string' ? body.uid.trim() : '';
  } catch {
    return json({ success: false, error: 'invalidRequest' }, 400);
  }
  if (!UUID_RE.test(uid)) {
    return json({ success: false, error: 'notFound' }, 404);
  }
  try {
    const accounts = await getCloudAccounts();
    const account = accounts.find((a) => a.user && a.user.uid === uid);
    if (!account) return json({ success: false, error: 'notFound' }, 404);
    const status = account.user.status || 'active';
    return json(
      {
        success: true,
        status,
        ...(status === 'rejected' && account.user.rejectionReason
          ? { rejectionReason: account.user.rejectionReason }
          : {}),
      },
      200
    );
  } catch (error: unknown) {
    console.error('[API /api/auth/status] Error:', error instanceof Error ? error.message : error);
    return json({ success: false, error: 'statusFailed' }, 500);
  }
}
