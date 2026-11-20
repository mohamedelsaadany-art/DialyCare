import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';
import { recordAppOpen } from '@/lib/alert-store';
import { cairoClock } from '@/lib/patient-alerts';

/**
 * POST /api/activity  { fromPush?: boolean }
 * A patient opened the app. Counts opens per day for the admin usage numbers
 * and for sending fewer alerts to patients who stopped opening the app.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['patient'] });
  if (!session.ok) return sessionErrorResponse(session);

  const body = (await request.json().catch(() => null)) as { fromPush?: unknown } | null;
  const now = new Date();
  try {
    await recordAppOpen(cairoClock(now).ymd, session.user.uid, session.user.role, body?.fromPush === true, now);
  } catch (error) {
    console.warn('[activity] not recorded:', error instanceof Error ? error.message : error);
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
}
