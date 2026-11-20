/**
 * Storage for scheduled patient alerts and app-open tracking. SERVER ONLY.
 * Kept out of the unified database so it never reaches /api/sync.
 *
 *  - dialycare_alert_state.json       what was sent today (see AlertState)
 *  - activity/<ymd>/<uid>.json        one small record per person per day
 *    (separate objects, so patients opening the app at the same moment never
 *    overwrite each other)
 */
import { put, getObjectJson, list, isCloudStorageConfigured } from './r2-client';
import { emptyAlertState, type AlertState } from './patient-alerts';

const STATE_PATH = 'dialycare_alert_state.json';
const ACTIVITY_PREFIX = 'activity/';

export interface DayActivity {
  uid: string;
  role: string;
  opens: number;
  pushOpens: number;
  firstAt: string;
  lastAt: string;
}

let memoryState: AlertState | null = null;
const memoryActivity = new Map<string, DayActivity>();

export function resetMemoryAlertStore(): void {
  memoryState = null;
  memoryActivity.clear();
}

function isNotFound(error: unknown): boolean {
  const e = error as { $metadata?: { httpStatusCode?: number }; name?: string; code?: string };
  const msg = error instanceof Error ? error.message : String(error);
  return e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.code === 'NoSuchKey' || msg.includes('NoSuchKey');
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    return await getObjectJson<T>(key);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await put(key, JSON.stringify(value), { contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
}

export async function loadAlertState(ymd: string): Promise<AlertState> {
  if (!isCloudStorageConfigured()) return memoryState ? structuredClone(memoryState) : emptyAlertState(ymd);
  return (await readJson<AlertState>(STATE_PATH)) || emptyAlertState(ymd);
}

export async function saveAlertState(state: AlertState): Promise<void> {
  if (!isCloudStorageConfigured()) {
    memoryState = structuredClone(state);
    return;
  }
  await writeJson(STATE_PATH, state);
}

const activityKey = (ymd: string, uid: string) => `${ACTIVITY_PREFIX}${ymd}/${encodeURIComponent(uid)}.json`;

/** Count one app open for this person today. */
export async function recordAppOpen(ymd: string, uid: string, role: string, fromPush: boolean, now: Date): Promise<DayActivity> {
  const key = activityKey(ymd, uid);
  const prev = isCloudStorageConfigured() ? await readJson<DayActivity>(key) : memoryActivity.get(key) || null;
  const iso = now.toISOString();
  const next: DayActivity = {
    uid,
    role,
    opens: (prev?.opens || 0) + 1,
    pushOpens: (prev?.pushOpens || 0) + (fromPush ? 1 : 0),
    firstAt: prev?.firstAt || iso,
    lastAt: iso,
  };
  if (isCloudStorageConfigured()) await writeJson(key, next);
  else memoryActivity.set(key, next);
  return next;
}

/** uids that opened the app on this day (names only, no reads). */
export async function listActiveUids(ymd: string): Promise<string[]> {
  const prefix = `${ACTIVITY_PREFIX}${ymd}/`;
  if (!isCloudStorageConfigured()) {
    return [...memoryActivity.keys()].filter((k) => k.startsWith(prefix)).map((k) => decodeURIComponent(k.slice(prefix.length, -5)));
  }
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const b of page.blobs) out.push(decodeURIComponent(b.pathname.slice(prefix.length, -5)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Full records for one day. */
export async function getDayActivity(ymd: string): Promise<DayActivity[]> {
  const uids = await listActiveUids(ymd);
  if (!isCloudStorageConfigured()) return uids.map((u) => memoryActivity.get(activityKey(ymd, u))!).filter(Boolean);
  const recs = await Promise.all(uids.map((u) => readJson<DayActivity>(activityKey(ymd, u)).catch(() => null)));
  return recs.filter((r): r is DayActivity => !!r);
}

/** The last `days` Cairo dates ending today, newest first. */
export function lastDays(todayYmd: string, days: number): string[] {
  const base = Date.parse(`${todayYmd}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(base - i * 86400000).toISOString().slice(0, 10));
}
