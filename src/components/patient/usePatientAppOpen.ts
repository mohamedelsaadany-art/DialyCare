'use client';

import { useEffect } from 'react';

const LAST_PING_KEY = 'WASLITY_LAST_OPEN_PING';
export const OPEN_GAP_MS = 5 * 60 * 1000;

/** An open counts again only after the app was away for 5 minutes. */
export function shouldCountOpen(lastPingMs: number | null, nowMs: number, fromPush: boolean): boolean {
  if (fromPush) return true;
  return lastPingMs === null || nowMs - lastPingMs >= OPEN_GAP_MS;
}

function readLast(): number | null {
  try {
    const v = Number(window.sessionStorage.getItem(LAST_PING_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Tells the server the patient opened the app (for the admin usage numbers and
 * to send fewer alerts to patients who stopped opening it). Opening from a
 * phone alert is counted separately.
 */
export function usePatientAppOpen(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let lastHiddenAt = 0;
    const ping = (fromPush: boolean) => {
      const now = Date.now();
      if (!shouldCountOpen(readLast(), now, fromPush)) return;
      try {
        window.sessionStorage.setItem(LAST_PING_KEY, String(now));
      } catch {
        // ignore
      }
      fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPush }),
        keepalive: true,
      }).catch(() => {});
    };

    const url = new URL(window.location.href);
    const fromPush = url.searchParams.get('src') === 'push';
    if (fromPush) {
      url.searchParams.delete('src');
      url.searchParams.delete('kind');
      window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash);
    }
    ping(fromPush);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
      } else if (lastHiddenAt && Date.now() - lastHiddenAt >= OPEN_GAP_MS) {
        ping(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);
}
