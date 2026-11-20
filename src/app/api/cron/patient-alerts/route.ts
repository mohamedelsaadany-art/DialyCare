import { NextResponse } from 'next/server';
import { getCloudDatabase } from '@/lib/cloud-store';
import { NO_STORE_HEADERS } from '@/lib/server-auth';
import { getSubscriptionsForPatientIds } from '@/lib/push-store';
import { sendPushToSubscriptions } from '@/lib/push-send';
import { planPatientAlerts, markAlertSent, cairoClock, INACTIVE_AFTER_DAYS } from '@/lib/patient-alerts';
import { loadAlertState, saveAlertState, listActiveUids, lastDays } from '@/lib/alert-store';

/**
 * Scheduled patient alerts (medicine times, follow-ups, water, session,
 * evening summary, daily tip, new labs). Safe to call as often as wanted:
 * every alert goes out once and each run sends at most one per patient.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401, headers: { ...NO_STORE_HEADERS } });
  }

  try {
    const now = new Date();
    const clock = cairoClock(now);
    const [db, state] = await Promise.all([getCloudDatabase(), loadAlertState(clock.ymd)]);

    const patientIds = (db.patients || []).map((p) => p.id).filter(Boolean);
    const subs = await getSubscriptionsForPatientIds(patientIds);
    const reachable = new Set(subs.map((s) => s.patientId || s.uid));

    const active = new Set<string>();
    for (const day of lastDays(clock.ymd, INACTIVE_AFTER_DAYS)) {
      for (const uid of await listActiveUids(day)) active.add(uid);
    }

    const plan = planPatientAlerts({ db, now, state, reachablePatientIds: reachable, recentlyActiveIds: active });

    let sent = 0;
    let failed = 0;
    for (const alert of plan.alerts) {
      const mine = subs.filter((s) => (s.patientId || s.uid) === alert.patientId);
      const res = await sendPushToSubscriptions(
        mine,
        (lang) => ({
          title: lang === 'ar' ? alert.titleAr : alert.titleEn,
          body: lang === 'ar' ? alert.bodyAr : alert.bodyEn,
          url: `/${lang}/patient?src=push&kind=${alert.kind}`,
          tag: alert.tag,
        }),
        { ttlSeconds: alert.ttlSeconds }
      ).catch(() => ({ sent: 0, failed: mine.length, removed: 0 }));
      if (res.sent > 0) {
        markAlertSent(plan.state, alert, now);
        sent++;
      } else {
        failed++;
      }
    }

    await saveAlertState(plan.state);

    return NextResponse.json(
      { success: true, cairo: clock, planned: plan.alerts.length, sent, failed, reachable: reachable.size },
      { status: 200, headers: { ...NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error('[cron patient-alerts] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'cronFailed' }, { status: 500, headers: { ...NO_STORE_HEADERS } });
  }
}
