/**
 * Scheduled patient alerts route, app-open tracking and admin usage numbers.
 * Run: npx tsx src/lib/__tests__/patient-alerts-routes.test.ts
 */
import assert from 'node:assert';

for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL_OIDC_TOKEN', 'BLOB_STORE_ID', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SESSION_SECRET', 'VERCEL', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete process.env[k];
process.env.CRON_SECRET = 'test-cron-secret';

import { getCloudDatabase, saveCloudDatabase, saveCloudAccounts } from '../cloud-store';
import { createSessionToken, hashPassword } from '../server-auth';
import { upsertSubscription, resetMemoryPushSubscriptions } from '../push-store';
import { setPushSenderForTests } from '../push-send';
import { resetMemoryAlertStore, loadAlertState } from '../alert-store';
import { cairoClock } from '../patient-alerts';
import { GET as cronRoute } from '../../app/api/cron/patient-alerts/route';
import { POST as activityRoute } from '../../app/api/activity/route';
import { GET as usageRoute } from '../../app/api/admin/usage/route';
import type { StoredAccount, User } from '../types';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };
console.warn = () => {};
console.error = () => {};

const BASE = 'http://localhost:3000';
const bearer = (uid: string, role: User['role']) => `Bearer ${createSessionToken({ uid, role })}`;
const acct = (uid: string, role: User['role']): StoredAccount => ({
  username: uid,
  phone: `010${uid.length}${uid.charCodeAt(0)}`,
  password: hashPassword('x-Pass-123'),
  user: { uid, role, username: uid, displayName: uid, language: 'ar', status: 'active', createdAt: '2026-01-01' },
});

async function run(): Promise<void> {
  resetMemoryPushSubscriptions();
  resetMemoryAlertStore();
  await saveCloudAccounts([acct('pa', 'patient'), acct('pb', 'patient'), acct('doc', 'doctor')]);
  const db = await getCloudDatabase({ forWrite: true });
  const hhmm = (() => {
    const m = cairoClock(new Date()).minutes;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  })();
  await saveCloudDatabase({
    ...db,
    patients: [
      { id: 'pa', fullName: 'Pa', fullNameAr: 'أ', dialysisSchedule: 'SMW', isActive: true, createdAt: '2026-01-01' },
      { id: 'pb', fullName: 'Pb', fullNameAr: 'ب', dialysisSchedule: 'STT', isActive: true, createdAt: '2026-01-01' },
    ],
    // a dose due right now, so the run has something to send during waking hours
    medications: [{ id: 'm1', patientId: 'pa', name: 'Med', nameAr: 'دواء', dose: '1 tablet', scheduleTime: hhmm }],
    adherenceLogs: [],
    fluidLogs: [],
    labResults: [],
  });

  // --- cron auth ---
  eq((await cronRoute(new Request(`${BASE}/api/cron/patient-alerts`))).status, 401, 'cron needs the secret');
  eq((await cronRoute(new Request(`${BASE}/api/cron/patient-alerts`, { headers: { Authorization: 'Bearer nope' } }))).status, 401, 'wrong secret');

  // --- cron sends only to phones of the right patient ---
  await upsertSubscription({ endpoint: 'https://push.example/pa', keys: { p256dh: 'k', auth: 'a' }, uid: 'pa', patientId: 'pa', role: 'patient', language: 'ar', createdAt: '2026-01-01' });
  const delivered: { endpoint: string; payload: { title: string; url: string } }[] = [];
  setPushSenderForTests(async (sub, payload) => {
    delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });
  const cronReq = () => new Request(`${BASE}/api/cron/patient-alerts`, { headers: { Authorization: 'Bearer test-cron-secret' } });
  const res = await cronRoute(cronReq());
  eq(res.status, 200, 'cron ok');
  const body = await res.json();
  const hour = cairoClock(new Date()).minutes / 60;
  if (hour >= 7 && hour < 23) {
    eq(body.sent, 1, 'one medicine alert sent');
    ok(delivered.every((d) => d.endpoint === 'https://push.example/pa'), 'only to that patient');
    ok(delivered[0].payload.url.startsWith('/ar/patient?src=push&kind=med'), 'opens the patient home, marked as from an alert');
    await cronRoute(cronReq());
    eq(delivered.filter((d) => d.payload.url.includes('kind=med&') || d.payload.url.endsWith('kind=med')).length, 1, 'a second run does not repeat the medicine alert');
  } else {
    eq(body.sent, 0, 'quiet hours: nothing sent');
  }
  setPushSenderForTests(null);

  // --- app opens ---
  const actReq = (auth: string | undefined, b: unknown, origin?: string) =>
    new Request(`${BASE}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(b),
    });
  eq((await activityRoute(actReq(undefined, {}))).status, 401, 'opens need a session');
  eq((await activityRoute(actReq(bearer('doc', 'doctor'), {}))).status, 403, 'staff opens are not counted');
  eq((await activityRoute(actReq(bearer('pa', 'patient'), {}, 'https://evil.example'))).status, 403, 'cross-site blocked');
  eq((await activityRoute(actReq(bearer('pa', 'patient'), {}))).status, 200, 'patient open counted');
  await activityRoute(actReq(bearer('pa', 'patient'), { fromPush: true }));

  // --- admin numbers ---
  const usageReq = (auth?: string) => new Request(`${BASE}/api/admin/usage`, { headers: auth ? { Authorization: auth } : {} });
  eq((await usageRoute(usageReq())).status, 401, 'usage needs a session');
  eq((await usageRoute(usageReq(bearer('pa', 'patient')))).status, 403, 'patients cannot see usage');
  const u = await (await usageRoute(usageReq(bearer('doc', 'doctor')))).json();
  ok(u.totalPatients >= 2, 'all patients counted');
  eq([u.activeToday, u.opensToday, u.opensFromAlertsToday, u.patientsWithAlerts], [1, 2, 1, 1], 'usage numbers');
  eq(u.patients.find((p: { id: string }) => p.id === 'pb').lastSeen, null, 'patient who never opened is listed');
  eq(u.days.length, 7, 'seven days');
  ok((await loadAlertState(cairoClock(new Date()).ymd)).trackingSince, 'tracking start remembered');

  console.log(`PATIENT-ALERTS-ROUTES SUITE PASSED: ${n} assertions.`);
}

run().catch((e) => {
  console.log(e);
  process.exit(1);
});
