import { NextResponse } from 'next/server';
import { getArchivedPatients, archivePatients, getCloudDatabase } from '@/lib/cloud-store';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse, toPublicAccount } from '@/lib/server-auth';

function computeDaysRemaining(archivedAt?: string, archiveExpiresAt?: string): number {
  if (archiveExpiresAt) {
    const diff = new Date(archiveExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  if (archivedAt) {
    const elapsed = Date.now() - new Date(archivedAt).getTime();
    const remainingMs = 14 * 24 * 60 * 60 * 1000 - elapsed;
    return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  }
  return 14;
}

/**
 * GET /api/admin/archive — ADMIN ONLY.
 * List all currently archived patients (calls getArchivedPatients()).
 * Returns 401 if unauthenticated, 403 if not admin.
 */
export async function GET(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const archivedPatients = await getArchivedPatients();
    const db = await getCloudDatabase();
    const combinedList = [...archivedPatients];

    // Also include any patients flagged in db.patients
    if (Array.isArray(db.patients)) {
      for (const p of db.patients) {
        if (p.isArchived && !combinedList.some((a) => a.patient?.id === p.id || a.id === p.id)) {
          combinedList.push({
            archiveId: `arch-${p.id}`,
            id: p.id,
            patientId: p.id,
            fullName: p.fullName,
            fullNameAr: p.fullNameAr,
            phone: p.phone,
            username: p.username,
            patient: p,
            sessions: [],
            labResults: [],
            medications: [],
            adherenceSurveys: [],
            fluidLogs: [],
            dietLogs: [],
            adherenceLogs: [],
            reminders: [],
            archivedAt: p.archivedAt || new Date().toISOString(),
            purgeAt: p.archiveExpiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            archivedBy: p.archivedBy || 'Super Admin',
            reactivationStatus: p.reactivationStatus || 'none',
            reactivationRequestedAt: p.reactivationRequestedAt,
          });
        }
      }
    }

    const formattedList = combinedList.map((rec) => {
      const innerPatient = (rec as any).patient || {};
      const archivedAt = rec.archivedAt || innerPatient.archivedAt || new Date().toISOString();
      const purgeAt = rec.purgeAt || innerPatient.archiveExpiresAt || (rec as any).archiveExpiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const daysRemaining = computeDaysRemaining(archivedAt, purgeAt);
      const reactivationStatus = rec.reactivationStatus || innerPatient.reactivationStatus || 'none';
      const reactivationRequestedAt = rec.reactivationRequestedAt || innerPatient.reactivationRequestedAt;
      const pid = rec.id || innerPatient.id || rec.patientId || rec.archiveId;
      const safeAccount = rec.account ? toPublicAccount(rec.account) : undefined;

      return {
        ...innerPatient,
        ...rec,
        id: pid,
        patientId: pid,
        fullName: rec.fullName || innerPatient.fullName || 'Patient',
        fullNameAr: rec.fullNameAr || innerPatient.fullNameAr || innerPatient.fullName || 'مريض',
        phone: rec.phone || innerPatient.phone || '',
        username: rec.username || innerPatient.username || '',
        dialysisSchedule: innerPatient.dialysisSchedule || (rec as any).dialysisSchedule || 'SMW',
        account: safeAccount,
        archivedAt,
        purgeAt,
        archiveExpiresAt: purgeAt,
        reactivationStatus,
        reactivationRequestedAt,
        daysRemaining,
      };
    });

    const reactivationRequests = formattedList.filter((p) => p.reactivationStatus === 'pending');

    return NextResponse.json(
      {
        success: true,
        archivedPatients: formattedList,
        patients: formattedList,
        reactivationRequests,
        totalArchived: formattedList.length,
        total: formattedList.length,
        totalReactivations: reactivationRequests.length,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/archive GET] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'archiveFetchFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

/**
 * POST /api/admin/archive — ADMIN ONLY.
 * Archive one or multiple patients ({ patientIds: string[] } or { patientId: string }).
 * Requires Super Admin session (role === 'admin'). Returns 401 if unauthenticated, 403 if not admin.
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
    if (Array.isArray(body?.patientIds)) {
      body.patientIds.forEach((id) => {
        if (typeof id === 'string' && id.trim()) {
          targetIds.push(id.trim());
        }
      });
    }
    targetIds = Array.from(new Set(targetIds.filter(Boolean)));

    if (targetIds.length === 0) {
      return NextResponse.json({ success: false, error: 'missingPatientIds' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const adminName = session.user.displayName || session.user.username || 'Super Admin';
    const result = await archivePatients(targetIds, adminName);

    const scrubbedPatients = result.archivedPatients?.map((rec) => ({
      ...rec,
      account: rec.account ? toPublicAccount(rec.account) : undefined,
    }));

    return NextResponse.json(
      {
        success: true,
        archivedCount: result.archivedCount,
        archivedIds: targetIds,
        archivedPatients: scrubbedPatients,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    console.error('[API /api/admin/archive POST] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'archiveFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
