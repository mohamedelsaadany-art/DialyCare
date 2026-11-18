import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import { getSession, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

export async function GET(request: Request) {
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
    return NextResponse.json(
      { success: false, error: 'missingUid' },
      { status: 404, headers: { ...NO_STORE_HEADERS } }
    );
  }

  try {
    const accounts = await getCloudAccounts();
    const acc = accounts.find((a) => a.user?.uid === uid);

    if (!acc || !acc.user) {
      return NextResponse.json(
        { success: false, error: 'notFound' },
        { status: 404, headers: { ...NO_STORE_HEADERS } }
      );
    }

    const role = acc.user.role;
    const status = acc.user.status || 'active';

    if (role === 'patient' || (status !== 'pending' && status !== 'active')) {
      return NextResponse.json(
        { success: false, error: 'notFound' },
        { status: 404, headers: { ...NO_STORE_HEADERS } }
      );
    }

    const raw = acc as unknown as Record<string, unknown>;
    const rawUser = acc.user as unknown as Record<string, unknown>;
    const idCardDataUrl =
      (typeof acc.user.idCardDataUrl === 'string' && acc.user.idCardDataUrl) ||
      (typeof rawUser.idCardDataUrl === 'string' && rawUser.idCardDataUrl) ||
      (typeof raw.idCardDataUrl === 'string' && raw.idCardDataUrl) ||
      null;

    if (!idCardDataUrl) {
      return NextResponse.json(
        { success: false, error: 'notFound' },
        { status: 404, headers: { ...NO_STORE_HEADERS } }
      );
    }

    return NextResponse.json(
      { success: true, idCardDataUrl },
      { headers: { ...NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/approvals/id-card] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'idCardLoadFailed' },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }
}
