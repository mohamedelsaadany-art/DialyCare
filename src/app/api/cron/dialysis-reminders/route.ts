import { NextResponse } from 'next/server';
import { getCloudDatabase, saveCloudDatabase } from '@/lib/cloud-store';
import { NO_STORE_HEADERS } from '@/lib/server-auth';
import { buildDialysisDayNotification, getCairoDate } from '@/lib/dialysis-day';
import { getSubscriptionsForPatientIds } from '@/lib/push-store';
import { sendPushToSubscriptions, type PushSendResult } from '@/lib/push-send';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401, headers: { ...NO_STORE_HEADERS } }
    );
  }

  const now = new Date();
  const cairo = getCairoDate(now);
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  if (cairo.hour !== 6 && !force) {
    return NextResponse.json(
      { skipped: 'not-6am' },
      { status: 200, headers: { ...NO_STORE_HEADERS } }
    );
  }

  try {
    const db = await getCloudDatabase({ forWrite: true });
    const todayId = `dialysis-day-${cairo.ymd}`;

    const existingNotifs = Array.isArray(db.notifications) ? db.notifications : [];
    if (existingNotifs.some((n) => n.id === todayId)) {
      return NextResponse.json(
        { skipped: 'already-sent' },
        { status: 200, headers: { ...NO_STORE_HEADERS } }
      );
    }

    const notif = buildDialysisDayNotification(db.patients || [], now);
    if (!notif) {
      return NextResponse.json(
        { skipped: 'no-recipients' },
        { status: 200, headers: { ...NO_STORE_HEADERS } }
      );
    }

    const nextNotifications = [...existingNotifs, notif];
    await saveCloudDatabase({ ...db, notifications: nextNotifications });

    // Phone alerts. A push failure never undoes the in-app notification.
    let push: PushSendResult = { sent: 0, failed: 0, removed: 0 };
    try {
      const subs = await getSubscriptionsForPatientIds(notif.recipientIds);
      push = await sendPushToSubscriptions(subs, (lang) => ({
        title: lang === 'ar' ? notif.titleAr : notif.titleEn,
        body: lang === 'ar' ? notif.messageAr : notif.messageEn,
        url: `/${lang}/patient`,
        tag: 'dialysis-day',
      }));
    } catch (error) {
      console.error('[cron dialysis-reminders] push failed:', error instanceof Error ? error.message : error);
    }

    return NextResponse.json(
      { success: true, id: notif.id, recipients: notif.recipientIds.length, push },
      { status: 200, headers: { ...NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error('[API /api/cron/dialysis-reminders] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'cronFailed' },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }
}
