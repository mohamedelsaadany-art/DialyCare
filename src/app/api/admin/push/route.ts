import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';
import { getSubscriptionsForPatientIds } from '@/lib/push-store';
import { sendPushToSubscriptions } from '@/lib/push-send';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * POST /api/admin/push  { patientIds, titleAr, titleEn, messageAr, messageEn, tag? }
 * Staff only. Sends a phone push to exactly the listed patients' devices.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin', 'doctor', 'nurse', 'staff'] });
  if (!session.ok) return sessionErrorResponse(session);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ids = Array.isArray(body?.patientIds)
    ? Array.from(new Set((body!.patientIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 200)))
    : [];
  const titleAr = str(body?.titleAr, 200);
  const titleEn = str(body?.titleEn, 200);
  const messageAr = str(body?.messageAr, 1000);
  const messageEn = str(body?.messageEn, 1000);
  if (ids.length === 0 || ids.length > 5000 || !(titleAr || titleEn) || !(messageAr || messageEn)) {
    return NextResponse.json({ success: false, error: 'invalid' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const subs = await getSubscriptionsForPatientIds(ids);
  const tag = str(body?.tag, 100) || `admin-${Date.now()}`;
  const result = await sendPushToSubscriptions(subs, (lang) => ({
    title: lang === 'en' ? titleEn || titleAr : titleAr || titleEn,
    body: lang === 'en' ? messageEn || messageAr : messageAr || messageEn,
    url: `/${lang}/patient`,
    tag,
  }));
  return NextResponse.json({ success: true, devices: subs.length, ...result }, { headers: NO_STORE_HEADERS });
}
