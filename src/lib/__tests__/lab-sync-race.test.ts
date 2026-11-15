/**
 * A lab result saved WHILE a cloud sync is in flight must survive that sync's
 * answer (which predates it) and be pushed by a follow-up sync. Also: the old
 * demo lab panel is purged locally and in the cloud merge.
 * Run: npx tsx src/lib/__tests__/lab-sync-race.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.VERCEL;

const store: Record<string, string> = {};
const mk = (m: Record<string, string>) => ({
  getItem: (k: string) => (k in m ? m[k] : null),
  setItem: (k: string, v: string) => {
    m[k] = String(v);
  },
  removeItem: (k: string) => {
    delete m[k];
  },
  clear: () => {
    for (const k of Object.keys(m)) delete m[k];
  },
});
(globalThis as unknown as { window: unknown }).window = {
  localStorage: mk(store),
  sessionStorage: mk({}),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { origin: 'http://localhost:3000' },
};

import {
  getPatientLabResults,
  initDataStore,
  mergeInFlightLocalChanges,
  savePatientLabResults,
  STORAGE_KEYS,
  syncFullCloudData,
} from '../data-store';
import { getCloudDatabase, mergeCloudDatabase } from '../cloud-store';
import type { PatientLabRecord } from '../types';

let n = 0;
const ok = (cond: unknown, m: string) => {
  assert.ok(cond, m);
  n++;
};
const eq = <T>(a: T, b: T, m: string) => {
  assert.deepStrictEqual(a, b, m);
  n++;
};
console.warn = () => {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lab = (id: string, patientId = 'p-real', extra: Partial<PatientLabRecord> = {}): PatientLabRecord => ({
  id,
  patientId,
  testDate: '2026-11-15',
  recordedBy: 'resident',
  recordedAt: '2026-11-15T09:00:00.000Z',
  values: { hemoglobin: 10.5 },
  ...extra,
});

function serverAnswer(labResults: PatientLabRecord[]): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        accounts: [],
        patients: [],
        dialysisSessions: [],
        labResults,
        medications: [],
        notifications: [],
        adherenceLogs: [],
        fluidLogs: [],
        dietLogs: [],
        adherenceSurveys: [],
        reminders: [],
        coachingTips: [],
        archivedPatients: [],
        lastUpdated: new Date().toISOString(),
      },
    }),
    { status: 200 }
  );
}

async function run(): Promise<void> {
  console.log('--- 1. mergeInFlightLocalChanges ---');
  const a = lab('a');
  const b = lab('b');
  const c = lab('c');
  let r = mergeInFlightLocalChanges([a, b], [a, b], [a, b, c]);
  eq(r.changed, false, 'no local change -> cloud wins untouched');
  eq(r.rows.map((x) => x.id), ['a', 'b', 'c'], 'cloud rows returned');
  r = mergeInFlightLocalChanges([a], [a, b], [a]);
  eq(r.changed, true, 'row added in flight -> changed');
  eq(r.rows.map((x) => x.id).sort(), ['a', 'b'], 'added row kept');
  const a2 = { ...a, notes: 'edited' };
  r = mergeInFlightLocalChanges([a], [a2], [a]);
  eq(r.rows.find((x) => x.id === 'a')?.notes, 'edited', 'edit made in flight wins');
  r = mergeInFlightLocalChanges([a, b], [a], [a, b]);
  eq(r.rows.map((x) => x.id), ['a'], 'delete made in flight respected');

  console.log('--- 2. Lab saved while a sync is in flight survives ---');
  initDataStore();
  store[STORAGE_KEYS.LAB_RESULTS] = JSON.stringify([]);
  const posted: PatientLabRecord[][] = [];
  let release: (res: Response) => void = () => {};
  (globalThis as unknown as { fetch: unknown }).fetch = (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    posted.push(body.labResults || []);
    if (posted.length === 1) {
      return new Promise<Response>((res) => {
        release = res;
      });
    }
    return Promise.resolve(serverAnswer(body.labResults || []));
  };

  const inFlight = syncFullCloudData(); // poll starts: snapshot has no labs
  await wait(5);
  eq(posted.length, 1, 'first sync posted');
  eq(posted[0].length, 0, 'first sync snapshot had no labs');
  const saved = savePatientLabResults({
    patientId: 'p-real',
    testDate: '2026-11-15',
    recordedBy: 'resident',
    values: { hemoglobin: 10.5 },
  });
  release(serverAnswer([])); // server answers with its (older) truth: no labs
  await inFlight;
  ok(
    getPatientLabResults('p-real').some((l) => l.id === saved.id),
    'lab saved during the sync is still there after the sync answer'
  );

  await wait(1300); // follow-up sync is debounced by 1s
  ok(posted.length >= 2, 'a follow-up sync ran');
  ok(posted[posted.length - 1].some((l) => l.id === saved.id), 'follow-up sync pushed the new lab');
  ok(getPatientLabResults('p-real').some((l) => l.id === saved.id), 'lab still present after the follow-up');

  console.log('--- 3. Sync with no local change still takes the cloud answer ---');
  (globalThis as unknown as { fetch: unknown }).fetch = () => Promise.resolve(serverAnswer([lab('from-other-device')]));
  await syncFullCloudData();
  eq(getPatientLabResults().map((l) => l.id), ['from-other-device'], 'cloud labs replace local when nothing changed');

  console.log('--- 4. Demo lab panel purged ---');
  store[STORAGE_KEYS.LAB_RESULTS] = JSON.stringify([lab('demo-lab-1', 'patient-1'), lab('real-1')]);
  initDataStore();
  eq(getPatientLabResults().map((l) => l.id), ['real-1'], 'local demo lab removed on init');

  await mergeCloudDatabase({ labResults: [lab('demo-lab-1', 'patient-1'), lab('real-2')] });
  const db = await getCloudDatabase({ forWrite: true });
  ok(!db.labResults.some((l) => l.id === 'demo-lab-1'), 'cloud merge drops the demo lab');
  ok(db.labResults.some((l) => l.id === 'real-2'), 'cloud merge keeps real labs');

  console.log(`\nLAB-SYNC-RACE SUITE PASSED: ${n} assertions.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
