/** Web Push sending. SERVER ONLY. */
import * as webpush from 'web-push';
import { removeSubscription, type PushSubscriptionRecord } from './push-store';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
  disabled?: boolean;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

let senderOverride: Sender | null = null;
/** test hook */
export function setPushSenderForTests(fn: Sender | null): void {
  senderOverride = fn;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function sendPushToSubscriptions(
  subs: PushSubscriptionRecord[],
  payloadFor: (lang: 'ar' | 'en') => PushPayload,
  options: { ttlSeconds?: number } = {}
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, failed: 0, removed: 0 };
  if (!senderOverride && !isPushConfigured()) return { ...result, disabled: true };

  let send: Sender;
  if (senderOverride) {
    send = senderOverride;
  } else {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    send = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: options.ttlSeconds ?? 6 * 60 * 60 });
  }

  await Promise.all(
    subs.map(async (s) => {
      const lang = s.language === 'en' ? 'en' : 'ar';
      try {
        await send({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payloadFor(lang)));
        result.sent++;
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await removeSubscription(s.endpoint).catch(() => false);
          result.removed++;
        } else {
          result.failed++;
          console.warn('[push] send failed:', code ?? (error instanceof Error ? error.message : error));
        }
      }
    })
  );
  return result;
}
