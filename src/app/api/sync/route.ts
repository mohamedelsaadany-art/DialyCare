import { NextResponse } from 'next/server';
import { getCloudDatabase, mergeCloudDatabase } from '@/lib/cloud-store';
import { filterIncomingForAccount, scopeDatabaseForAccount } from '@/lib/api-scope';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/**
 * GET  /api/sync — the caller's view of the database (B1c):
 *      staff: everything (accounts without passwords); patient: only their own data.
 * POST /api/sync — merge the caller's local changes, filtered per role
 *      (see src/lib/api-scope.ts), then return the caller's scoped view.
 * No session -> 401. Accounts are never written through this route.
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  try {
    const data = await getCloudDatabase();
    return NextResponse.json(
      { success: true, data: scopeDatabaseForAccount(data, session.account) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/sync GET] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'syncFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalidRequest' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const current = await getCloudDatabase();
    const { patch, dropped } = filterIncomingForAccount(body, session.account, current);
    if (dropped > 0) {
      console.warn(`[API /api/sync POST] dropped ${dropped} row(s) not writable by role ${session.user.role}`);
    }
    const hasWrites = Object.values(patch).some((v) => Array.isArray(v) && v.length > 0);
    const merged = hasWrites ? await mergeCloudDatabase(patch) : current;
    return NextResponse.json(
      { success: true, data: scopeDatabaseForAccount(merged, session.account) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/sync POST] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'syncFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
