import { NextResponse } from 'next/server';
import { getCloudAccounts, changePasswordInCloud } from '@/lib/cloud-store';
import {
  getSession,
  isCrossOriginRequest,
  NO_STORE_HEADERS,
  sessionErrorResponse,
  generateTemporaryPassword,
  hashPassword,
} from '@/lib/server-auth';

/**
 * POST /api/admin/reset-password { uid } — ADMIN ONLY.
 * Resets a patient's password to a one-time temporary password.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const uid = body && typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'missingUid' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (uid === session.user.uid) {
      return NextResponse.json(
        { success: false, error: 'cannotResetThisAccount' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const accounts = await getCloudAccounts({ forWrite: true });
    const target = accounts.find((a) => a.user && a.user.uid === uid);
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'accountNotFound' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (target.user.role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'cannotResetThisAccount' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const status = target.user.status || 'active';
    if (status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'accountNotActive' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const temp = generateTemporaryPassword();
    const updated = await changePasswordInCloud(uid, hashPassword(temp), true);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'accountNotFound' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, temporaryPassword: temp },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/reset-password] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'resetFailed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
