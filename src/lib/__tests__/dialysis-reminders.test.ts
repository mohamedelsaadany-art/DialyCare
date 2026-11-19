/**
 * Daily 6 AM Cairo "dialysis day" job + Web Push.
 * Run: npx tsx src/lib/__tests__/dialysis-reminders.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_SUBJECT;
process.env.CRON_SECRET = 'test-cron-secret';

import { buildDialysisDayNotification, getCairoDate, scheduleIncludesWeekday } from '../dialysis-day';
import { getCloudDatabase, saveCloudDatabase, saveCloudAccounts } from '../cloud-store';
import { createSessionToken, hashPassword } from '../server-auth';
import { getSubscriptionsForPatientIds, upsertSubscription, resetMemoryPushSubscriptions } from '../push-store';
import { sendPushToSubscriptions, setPushSenderForTests } from '../push-send';
import { scopeDatabaseForAccount } from '../api-scope';
import { GET as cronRoute } from '../../app/api/cron/dialysis-reminders/route';
import { POST as subscribeRoute, DELETE as unsubscribeRoute } from '../../app/api/push/subscribe/route';
import type { Patient, StoredAccount, User } from '../types';

let n = 0;
const ok = (c: unknown, m: string) => {
  assert.ok(c, m);
  n++;
};
const eq = <T>(a: T, b: T, m: string) => {
  assert.deepStrictEqual(a, b, m);
  n++;
};
console.warn = () => {};
console.error = () => {};

const BASE = 'http://localhost:3000';
const patient = (id: string, schedule: string, extra: Partial<Patient> = {}): Patient => ({
  id,
  fullName: id,
  fullNameAr: id,
  dialysisSchedule: schedule,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const bearer = (uid: string, role: User['role']) => {
  const t = createSessionToken({ uid, role });
  if (!t) throw new Error('no session key');
  return `Bearer ${t}`;
};
const cronReq = (auth?: string, force = false) =>
  new Request(`${BASE}/api/cron/dialysis-reminders${force ? '?force=1' : ''}`, {
    headers: auth ? { Authorization: auth } : {},
  });
const jsonReq = (method: 'POST' | 'DELETE', auth: string | undefined, body: unknown) =>
  new Request(`${BASE}/api/push/subscribe`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
const subBody = (endpoint: string, language = 'ar') => ({
  subscription: { endpoint, keys: { p256dh: 'p-key', auth: 'a-key' } },
  language,
});

async function run(): Promise<void> {
  console.log('--- 1. Schedules and Cairo date ---');
  for (const d of [6, 1, 3]) ok(scheduleIncludesWeekday('SMW', d), `SMW includes ${d}`);
  for (const d of [0, 2, 4, 5]) ok(!scheduleIncludesWeekday('SMW', d), `SMW excludes ${d}`);
  for (const d of [0, 2, 4]) ok(scheduleIncludesWeekday('STT', d), `STT includes ${d}`);
  ok(scheduleIncludesWeekday('MWF', 6) && !scheduleIncludesWeekday('MWF', 5), 'legacy MWF normalizes to SMW');
  ok(scheduleIncludesWeekday('TTS', 0) && !scheduleIncludesWeekday('TTS', 6), 'legacy TTS normalizes to STT');
  ok(!scheduleIncludesWeekday('XYZ', 1) && !scheduleIncludesWeekday(undefined, 1), 'unknown schedule -> false');

  eq(getCairoDate(new Date('2026-11-18T23:30:00Z')).ymd, '2026-11-19', 'late UTC is next day in Cairo');
  eq(getCairoDate(new Date('2026-11-18T23:30:00Z')).weekday, 4, '2026-11-19 is a Thursday');
  eq(getCairoDate(new Date('2026-11-19T04:10:00Z')).hour, 6, 'winter: 04:10 UTC is 6 AM Cairo');
  eq(getCairoDate(new Date('2026-07-01T03:10:00Z')).hour, 6, 'summer: 03:10 UTC is 6 AM Cairo');

  const thursday = new Date('2026-11-19T04:05:00Z');
  const built = buildDialysisDayNotification(
    [
      patient('p-stt', 'STT'),
      patient('p-smw', 'SMW'),
      patient('p-arch', 'STT', { isArchived: true }),
      patient('p-off', 'STT', { isActive: false }),
    ],
    thursday
  );
  eq(built?.id, 'dialysis-day-2026-11-19', 'deterministic id');
  eq(built?.recipientIds, ['p-stt'], 'only active, non-archived STT patients on Thursday');
  eq(buildDialysisDayNotification([patient('p-smw', 'SMW')], thursday), null, 'nobody today -> null');

  console.log('--- 2. Push subscribe route ---');
  resetMemoryPushSubscriptions();
  const accounts: StoredAccount[] = [
    {
      username: 'pt-a',
      phone: '01000000001',
      password: hashPassword('x-Pass-123'),
      user: { uid: 'p-stt', role: 'patient', username: 'pt-a', displayName: 'A', language: 'ar', status: 'active', createdAt: '2026-01-01' },
    },
    {
      username: 'pt-b',
      phone: '01000000002',
      password: hashPassword('x-Pass-123'),
      user: { uid: 'p-stt-en', role: 'patient', username: 'pt-b', displayName: 'B', language: 'en', status: 'active', createdAt: '2026-01-01' },
    },
  ];
  await saveCloudAccounts(accounts);
  const authA = bearer('p-stt', 'patient');
  const authB = bearer('p-stt-en', 'patient');

  eq((await subscribeRoute(jsonReq('POST', undefined, subBody('https://push.example/a')))).status, 401, 'subscribe needs a session');
  eq((await subscribeRoute(jsonReq('POST', authA, subBody('http://push.example/a')))).status, 400, 'non-https endpoint rejected');
  eq((await subscribeRoute(jsonReq('POST', authA, { subscription: { endpoint: 'https://push.example/a' } }))).status, 400, 'missing keys rejected');
  eq((await subscribeRoute(jsonReq('POST', authA, { ...subBody('https://push.example/a'), patientId: 'p-other' }))).status, 200, 'subscribe ok');
  eq((await subscribeRoute(jsonReq('POST', authA, subBody('https://push.example/a')))).status, 200, 're-subscribe ok');
  let subsA = await getSubscriptionsForPatientIds(['p-stt']);
  eq(subsA.length, 1, 'upsert dedupes by endpoint');
  eq(subsA[0].patientId, 'p-stt', 'patientId comes from the session, not the body');
  eq((await getSubscriptionsForPatientIds(['p-other'])).length, 0, 'body patientId ignored');
  await subscribeRoute(jsonReq('POST', authB, subBody('https://push.example/b', 'en')));

  const del = await unsubscribeRoute(jsonReq('DELETE', authB, { endpoint: 'https://push.example/a' }));
  eq((await del.json()).removed, false, "cannot remove another user's device");
  eq((await getSubscriptionsForPatientIds(['p-stt'])).length, 1, 'device A still there');

  console.log('--- 3. Push sending ---');
  const res0 = await sendPushToSubscriptions(subsA, () => ({ title: 't', body: 'b', url: '/' }));
  eq(res0.disabled, true, 'no VAPID keys -> disabled, no throw');

  const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
  setPushSenderForTests(async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });

  console.log('--- 4. Cron route ---');
  // The route uses the real clock: schedule the two test patients for today.
  const wd = getCairoDate(new Date()).weekday;
  const todayCode = scheduleIncludesWeekday('STT', wd) ? 'STT' : scheduleIncludesWeekday('SMW', wd) ? 'SMW' : null;
  const otherCode = todayCode === 'STT' ? 'SMW' : 'STT';
  const db = await getCloudDatabase({ forWrite: true });
  await saveCloudDatabase({
    ...db,
    patients: [patient('p-stt', todayCode || 'STT'), patient('p-stt-en', todayCode || 'STT'), patient('p-smw', otherCode)],
    notifications: [],
  });

  eq((await cronRoute(cronReq())).status, 401, 'no secret -> 401');
  eq((await cronRoute(cronReq('Bearer wrong'))).status, 401, 'wrong secret -> 401');
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  eq((await cronRoute(cronReq('Bearer undefined', true))).status, 401, 'unset CRON_SECRET -> 401');
  process.env.CRON_SECRET = saved;

  const auth = 'Bearer test-cron-secret';
  if (getCairoDate(new Date()).hour !== 6) {
    eq((await (await cronRoute(cronReq(auth))).json()).skipped, 'not-6am', 'skips outside 6 AM');
  }

  const todayScheduled = todayCode !== null;
  const first = await (await cronRoute(cronReq(auth, true))).json();
  if (todayScheduled) {
    eq(first.success, true, 'force=1 creates the notification');
    const stored = (await getCloudDatabase({ forWrite: true })).notifications.find((x) => x.id === first.id);
    ok(stored?.recipientIds.includes('p-stt') && stored?.recipientIds.includes('p-stt-en'), "today's patients are recipients");
    ok(!stored?.recipientIds.includes('p-smw'), 'patients not scheduled today are not');
    eq(first.push.sent, 2, 'pushed to both devices');
    const toA = sent.find((s) => s.endpoint === 'https://push.example/a');
    const toB = sent.find((s) => s.endpoint === 'https://push.example/b');
    eq(toA?.payload.title, 'يوم الغسيل الكلوي', 'Arabic user gets Arabic');
    eq(toA?.payload.url, '/ar/patient', 'Arabic url');
    eq(toB?.payload.title, 'Dialysis day', 'English user gets English');

    const second = await (await cronRoute(cronReq(auth, true))).json();
    eq(second.skipped, 'already-sent', 'second call is a no-op');
    eq(sent.length, 2, 'no second push');
    const after = await getCloudDatabase({ forWrite: true });
    eq(after.notifications.filter((x) => x.id === first.id).length, 1, 'exactly one notification stored');
  } else {
    eq(first.skipped, 'no-recipients', 'Friday: no dialysis, nothing sent');
  }

  console.log('--- 5. Stale devices and isolation ---');
  setPushSenderForTests(async () => {
    throw Object.assign(new Error('gone'), { statusCode: 410 });
  });
  subsA = await getSubscriptionsForPatientIds(['p-stt']);
  const gone = await sendPushToSubscriptions(subsA, () => ({ title: 't', body: 'b', url: '/' }));
  eq(gone.removed, 1, '410 counted as removed');
  eq((await getSubscriptionsForPatientIds(['p-stt'])).length, 0, '410 deletes the subscription');
  setPushSenderForTests(null);

  await upsertSubscription({
    endpoint: 'https://push.example/c',
    keys: { p256dh: 'p', auth: 'a' },
    uid: 'p-stt',
    patientId: 'p-stt',
    role: 'patient',
    language: 'ar',
    createdAt: new Date().toISOString(),
  });
  const full = JSON.stringify(await getCloudDatabase());
  ok(!full.includes('push.example'), 'subscriptions never in the unified database');

  console.log('--- 6. Bulk account lists carry no ID-card images ---');
  const withCard = {
    ...accounts[0],
    user: { ...accounts[0].user, uid: 'doc-x', role: 'doctor' as const, idCardDataUrl: 'data:image/png;base64,AAAA' },
  };
  const scoped = scopeDatabaseForAccount({ ...(await getCloudDatabase()), accounts: [withCard] }, withCard);
  ok(!JSON.stringify(scoped).includes('data:image/png;base64,AAAA'), 'sync view strips idCardDataUrl');

  console.log(`\nDIALYSIS-REMINDERS SUITE PASSED: ${n} assertions.`);
}

run().catch((err) => {
  console.error = (...a: unknown[]) => process.stderr.write(a.join(' ') + '\n');
  console.error(err);
  process.exit(1);
});
