import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';
import { removeSubscription, upsertSubscription } from '@/lib/push-store';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status, headers: NO_STORE_HEADERS });
}

function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

type SubscribeBody = {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  language?: unknown;
};

/** POST { subscription, language }: register this device for push alerts. */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) return fail('forbidden', 403);
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return fail('invalidRequest');
  }
  const sub = body?.subscription;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!sub || !validEndpoint(sub.endpoint) || typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) {
    return fail('invalidSubscription');
  }
  const language: 'ar' | 'en' =
    body.language === 'en' || body.language === 'ar'
      ? body.language
      : session.user.language === 'en'
        ? 'en'
        : 'ar';
  try {
    await upsertSubscription({
      endpoint: sub.endpoint,
      keys: { p256dh, auth },
      uid: session.user.uid,
      // Patient.id === account.user.uid (see api-scope.ts); never taken from the body.
      patientId: session.user.role === 'patient' ? session.user.uid : undefined,
      role: session.user.role,
      language,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[API /api/push/subscribe] Error:', error instanceof Error ? error.message : error);
    return fail('subscribeFailed', 500);
  }
}

/** DELETE { endpoint }: remove one of the caller's own devices. */
export async function DELETE(request: Request) {
  if (isCrossOriginRequest(request)) return fail('forbidden', 403);
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as { endpoint?: unknown };
  } catch {
    return fail('invalidRequest');
  }
  if (typeof body?.endpoint !== 'string') return fail('invalidRequest');
  try {
    const removed = await removeSubscription(body.endpoint, session.user.uid);
    return NextResponse.json({ success: true, removed }, { headers: NO_STORE_HEADERS });
  } catch {
    return fail('unsubscribeFailed', 500);
  }
}
