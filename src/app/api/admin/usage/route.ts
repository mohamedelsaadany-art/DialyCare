import { NextResponse } from 'next/server';
import { getSession, NO_STORE_HEADERS, sessionErrorResponse, STAFF_ROLES } from '@/lib/server-auth';
import { getCloudDatabase } from '@/lib/cloud-store';
import { getSubscriptionsForPatientIds } from '@/lib/push-store';
import { getDayActivity, listActiveUids, lastDays, loadAlertState } from '@/lib/alert-store';
import { cairoClock } from '@/lib/patient-alerts';

/**
 * GET /api/admin/usage — how many patients use the app, staff only.
 * Patients only: staff opens are not counted here.
 */
export async function GET(request: Request) {
  const session = await getSession(request, { roles: STAFF_ROLES });
  if (!session.ok) return sessionErrorResponse(session);

  try {
    const clock = cairoClock(new Date());
    const days = lastDays(clock.ymd, 7);
    const [db, today, state, ...perDay] = await Promise.all([
      getCloudDatabase(),
      getDayActivity(clock.ymd),
      loadAlertState(clock.ymd),
      ...days.map((d) => listActiveUids(d)),
    ]);

    const patients = (db.patients || []).filter((p) => p && p.id);
    const patientIds = new Set(patients.map((p) => p.id));
    const subs = await getSubscriptionsForPatientIds([...patientIds]);
    const withAlerts = new Set(subs.map((s) => s.patientId || s.uid));

    const todayPatients = today.filter((a) => patientIds.has(a.uid));
    const lastSeen = new Map<string, string>();
    days.forEach((d, i) => {
      for (const uid of perDay[i]) if (patientIds.has(uid) && !lastSeen.has(uid)) lastSeen.set(uid, d);
    });

    return NextResponse.json(
      {
        success: true,
        today: clock.ymd,
        totalPatients: patients.length,
        patientsWithAlerts: patients.filter((p) => withAlerts.has(p.id)).length,
        activeToday: todayPatients.length,
        opensToday: todayPatients.reduce((s, a) => s + a.opens, 0),
        opensFromAlertsToday: todayPatients.reduce((s, a) => s + a.pushOpens, 0),
        alertsSentToday: state.ymd === clock.ymd ? state.sentByDay?.[clock.ymd] || 0 : 0,
        trackingSince: state.trackingSince || null,
        days: days.map((d, i) => ({
          ymd: d,
          activePatients: perDay[i].filter((u) => patientIds.has(u)).length,
          alertsSent: state.sentByDay?.[d] || 0,
        })),
        patients: patients
          .map((p) => {
            const t = todayPatients.find((a) => a.uid === p.id);
            return {
              id: p.id,
              nameAr: p.fullNameAr || p.fullName,
              name: p.fullName || p.fullNameAr,
              opensToday: t?.opens || 0,
              lastSeen: lastSeen.get(p.id) || null,
              alertsOn: withAlerts.has(p.id),
            };
          })
          .sort((a, b) => (b.opensToday - a.opensToday) || String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[admin usage] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'failed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
