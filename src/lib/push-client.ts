/** Browser side of Web Push: subscribe this device and register it with the server. */
import { requestNotificationPermission } from './notifications';

export type PushEnableResult = 'enabled' | 'denied' | 'unsupported' | 'failed';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

/** iPhone/iPad Safari only delivers push to an app opened from the home screen. */
export function isIosNotInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg && (await reg.pushManager.getSubscription()));
  } catch {
    return false;
  }
}

/**
 * Ask permission (only when prompt=true), subscribe, and register with the server.
 * With prompt=false it never shows a permission dialog: it only refreshes an
 * existing grant.
 */
export async function enablePushNotifications(language: 'ar' | 'en', prompt = true): Promise<PushEnableResult> {
  if (!isPushSupported()) return 'unsupported';
  try {
    let permission = Notification.permission;
    if (permission !== 'granted') {
      if (!prompt) return 'denied';
      permission = await requestNotificationPermission();
    }
    if (permission !== 'granted') return 'denied';

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
      });
    }
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ subscription: sub.toJSON(), language }),
    });
    return res.ok ? 'enabled' : 'failed';
  } catch (error) {
    console.warn('[push] enable failed:', error);
    return 'failed';
  }
}
