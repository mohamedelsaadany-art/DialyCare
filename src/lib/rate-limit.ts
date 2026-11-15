import { NextResponse } from 'next/server';
import { isProductionRuntime, NO_STORE_HEADERS } from './server-auth';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10000;

function pruneStore(now: number): void {
  if (store.size <= MAX_ENTRIES) return;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
  if (store.size > MAX_ENTRIES) {
    const toDelete = store.size - MAX_ENTRIES;
    let count = 0;
    for (const key of store.keys()) {
      store.delete(key);
      count++;
      if (count >= toDelete) break;
    }
  }
}

export function isRateLimitEnabled(): boolean {
  return isProductionRuntime() || process.env.RATE_LIMIT_FORCE === '1';
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): { ok: boolean; retryAfterSeconds: number } {
  if (!isRateLimitEnabled()) {
    return { ok: true, retryAfterSeconds: 0 };
  }
  pruneStore(now);
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  entry.count++;
  return { ok: true, retryAfterSeconds: 0 };
}

export function peekRateLimit(key: string, limit: number, now = Date.now()): boolean {
  if (!isRateLimitEnabled()) return false;
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= limit;
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return 'unknown';
}

export function tooManyResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { success: false, error: 'tooManyAttempts' },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}

export function __resetAllRateLimitsForTests(): void {
  store.clear();
}
