import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import { getSession, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

export async function GET(request: Request) {
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const accounts = await getCloudAccounts();
    const pending = accounts
      .filter((acc) => {
        if (!acc.user) return false;
        const role = acc.user.role;
        const status = acc.user.status || 'active';
        return status === 'pending' && role !== 'patient';
      })
      .map((acc) => {
        const u = acc.user;
        const raw = acc as unknown as Record<string, unknown>;
        const rawUser = u as unknown as Record<string, unknown>;
        const hasIdCard = Boolean(
          (typeof u.idCardDataUrl === 'string' && u.idCardDataUrl.length > 0) ||
          (typeof rawUser.idCardDataUrl === 'string' && (rawUser.idCardDataUrl as string).length > 0) ||
          (typeof raw.idCardDataUrl === 'string' && (raw.idCardDataUrl as string).length > 0)
        );

        return {
          uid: u.uid,
          displayName: u.displayName || '',
          role: u.role,
          specialty: u.specialty || '',
          hospital: u.hospital || '',
          phone: acc.phone || u.phone || '',
          language: u.language || 'ar',
          registeredAt: u.registeredAt || u.createdAt || '',
          hasIdCard,
        };
      });

    return NextResponse.json(
      { success: true, pending },
      { headers: { ...NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/approvals] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'approvalsLoadFailed' },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }
}
