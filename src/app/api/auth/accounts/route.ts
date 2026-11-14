import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import { isStaffRole, publicAccounts } from '@/lib/api-scope';
import { getSession, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/**
 * GET/POST /api/auth/accounts — READ ONLY (B1c).
 * staff: every account without passwords; patient: only their own account.
 * POST is accepted for old clients but merges nothing: accounts change only
 * through /api/auth/register, /approve and /reject. No session -> 401.
 */
async function respond(request: Request): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  try {
    const all = await getCloudAccounts();
    const visible = isStaffRole(session.user.role)
      ? publicAccounts(all)
      : publicAccounts(all.filter((a) => a.user?.uid === session.user.uid));
    return NextResponse.json(
      { success: true, accounts: visible, users: visible.map((a) => a.user) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/auth/accounts] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'accountsFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function GET(request: Request) {
  return respond(request);
}

export async function POST(request: Request) {
  return respond(request);
}
