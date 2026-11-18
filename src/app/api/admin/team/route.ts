import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';
import { getSession, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

const ROLE_PRIORITY: Record<string, number> = {
  doctor: 1,
  nurse: 2,
  staff: 3,
};

export async function GET(request: Request) {
  const session = await getSession(request, { roles: ['admin', 'doctor', 'nurse', 'staff'] });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const accounts = await getCloudAccounts();
    const team = accounts
      .filter((acc) => {
        if (!acc.user) return false;
        const role = acc.user.role;
        const status = acc.user.status || 'active';
        return (role === 'doctor' || role === 'nurse' || role === 'staff') && status === 'active';
      })
      .map((acc) => {
        const u = acc.user;
        return {
          uid: u.uid,
          displayName: u.displayName || '',
          role: u.role,
          specialty: u.specialty || '',
          hospital: u.hospital || '',
          phone: acc.phone || u.phone || '',
          language: u.language || 'ar',
          registeredAt: u.registeredAt || u.createdAt || '',
        };
      });

    team.sort((a, b) => {
      const rA = ROLE_PRIORITY[a.role] ?? 99;
      const rB = ROLE_PRIORITY[b.role] ?? 99;
      if (rA !== rB) return rA - rB;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

    return NextResponse.json(
      { success: true, team },
      { headers: { ...NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/team] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'teamLoadFailed' },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }
}
