/**
 * Web Push subscriptions. SERVER ONLY.
 * Kept in their own blob, never in the unified database, so they are never
 * returned by /api/sync or any list endpoint.
 */
import { put, getObjectJson, isCloudStorageConfigured } from './r2-client';
import type { UserRole } from './types';

const PUSH_BLOB_PATH = 'dialycare_push_subscriptions.json';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  uid: string;
  patientId?: string;
  role: UserRole;
  language: 'ar' | 'en';
  createdAt: string;
}

let memorySubs: PushSubscriptionRecord[] = [];

function isNotFound(error: unknown): boolean {
  const e = error as { $metadata?: { httpStatusCode?: number }; name?: string; code?: string };
  const msg = error instanceof Error ? error.message : String(error);
  return (
    e?.$metadata?.httpStatusCode === 404 ||
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.code === 'NoSuchKey' ||
    msg.includes('NoSuchKey')
  );
}

async function readAll(): Promise<PushSubscriptionRecord[]> {
  if (!isCloudStorageConfigured()) return [...memorySubs];
  try {
    const data = await getObjectJson<unknown>(PUSH_BLOB_PATH);
    return Array.isArray(data) ? (data as PushSubscriptionRecord[]) : [];
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function writeAll(subs: PushSubscriptionRecord[]): Promise<void> {
  if (!isCloudStorageConfigured()) {
    memorySubs = [...subs];
    return;
  }
  await put(PUSH_BLOB_PATH, JSON.stringify(subs), {
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function upsertSubscription(rec: PushSubscriptionRecord): Promise<void> {
  const all = await readAll();
  const next = all.filter((s) => s.endpoint !== rec.endpoint);
  next.push(rec);
  await writeAll(next);
}

/** Removes a subscription; with ownerUid only if it belongs to that user. */
export async function removeSubscription(endpoint: string, ownerUid?: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((s) => !(s.endpoint === endpoint && (ownerUid === undefined || s.uid === ownerUid)));
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}

export async function getSubscriptionsForPatientIds(ids: string[]): Promise<PushSubscriptionRecord[]> {
  const set = new Set(ids);
  return (await readAll()).filter((s) => s.patientId && set.has(s.patientId));
}

export async function getSubscriptionsForUids(uids: string[]): Promise<PushSubscriptionRecord[]> {
  const set = new Set(uids);
  return (await readAll()).filter((s) => set.has(s.uid));
}

/** test helper */
export function resetMemoryPushSubscriptions(): void {
  memorySubs = [];
}
