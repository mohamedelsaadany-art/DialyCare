import { NextResponse } from 'next/server';
import { getCloudAccounts, getCloudDatabase, mergeCloudDatabase, saveCloudAccounts, restoreArchivedPatient } from '@/lib/cloud-store';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/**
 * POST /api/admin/restore — ADMIN ONLY.
 * Restores one or more archived patients back to active patient roster.
 * Body: { patientId: string } or { patientIds: string[] } or { uid: string }
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    let targetIds: string[] = [];
    if (body?.patientId && typeof body.patientId === 'string') {
      targetIds.push(body.patientId.trim());
    }
    if (body?.uid && typeof body.uid === 'string') {
      targetIds.push(body.uid.trim());
    }
    if (Array.isArray(body?.patientIds)) {
      body.patientIds.forEach((id) => {
        if (typeof id === 'string' && id.trim()) {
          targetIds.push(id.trim());
        }
      });
    }
    targetIds = Array.from(new Set(targetIds.filter(Boolean)));

    if (targetIds.length === 0) {
      return NextResponse.json({ success: false, error: 'missingPatientId' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const adminName = session.user.displayName || session.user.username || 'Super Admin';
    let restoredPatient: any = undefined;
    let restoredUser: any = undefined;

    // Restore from archivedPatients collection
    for (const id of targetIds) {
      const res = await restoreArchivedPatient(id, adminName);
      if (res.success && res.patient) {
        restoredPatient = res.patient;
        if (res.account?.user) {
          restoredUser = res.account.user;
        }
      }
    }

    // 1. Update cloud database patients (for any flag-based archived patients)
    const db = await getCloudDatabase();
    const updatedPatients = db.patients.map((p) => {
      if (targetIds.includes(p.id)) {
        restoredPatient = {
          ...p,
          isArchived: false,
          archivedAt: undefined,
          archiveExpiresAt: undefined,
          archivedBy: undefined,
          reactivationStatus: undefined,
          reactivationRequestedAt: undefined,
          isActive: true,
        };
        return restoredPatient;
      }
      return p;
    });

    await mergeCloudDatabase({ patients: updatedPatients });

    // 2. Update cloud accounts
    const accounts = await getCloudAccounts({ forWrite: true });
    let accountsModified = false;
    const updatedAccounts = accounts.map((a) => {
      if (targetIds.includes(a.user?.uid)) {
        accountsModified = true;
        restoredUser = {
          ...a.user,
          isArchived: false,
          archivedAt: undefined,
          archiveExpiresAt: undefined,
          archivedBy: undefined,
          reactivationStatus: undefined,
          reactivationRequestedAt: undefined,
          status: 'active' as const,
        };
        return {
          ...a,
          user: restoredUser,
        };
      }
      return a;
    });

    if (accountsModified) {
      await saveCloudAccounts(updatedAccounts);
    }

    if (!restoredPatient) {
      return NextResponse.json(
        { success: false, error: 'patientNotFound' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        restoredCount: targetIds.length,
        restoredIds: targetIds,
        patient: restoredPatient,
        user: restoredUser,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/restore POST] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'restoreFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
