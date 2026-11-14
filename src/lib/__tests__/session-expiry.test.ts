/**
 * B13 — a 401 from a data call runs the B1b re-login flow; offline/5xx stay silent.
 * Run: npx tsx src/lib/__tests__/session-expiry.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;

const store: Record<string, string> = {};
const session: Record<string, string> = {};
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
const events: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: mk(store),
  sessionStorage: mk(session),
  dispatchEvent: (e: Event) => {
    events.push(e.type);
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { origin: 'http://localhost:3000' },
};

import { handleSessionExpired, syncFullCloudData, syncCloudAccounts } from '../data-store';
import { CURRENT_USER_KEY, REAUTH_NOTICE_KEY } from '../session-client';

let n = 0;
const eq = <T>(a: T, b: T, m: string) => {
  assert.strictEqual(a, b, m);
  n++;
};
console.warn = () => {};

const USER = JSON.stringify({ uid: 'patient-1', role: 'patient', username: 'patient1', displayName: 'P', language: 'ar', createdAt: '2026-01-01' });
function seed(): void {
  store[CURRENT_USER_KEY] = USER;
  store['DIALYCARE_FLUID_LOGS'] = JSON.stringify([{ id: 'unsynced-1', patientId: 'patient-1', amountMl: 200, loggedAt: '2026-11-14T10:00:00Z' }]);
  store['DIALYCARE_READ_NOTIFICATIONS_patient-1'] = JSON.stringify(['n1']);
  delete session[REAUTH_NOTICE_KEY];
  events.length = 0;
}
const setFetch = (impl: () => Promise<Response>) => {
  (globalThis as unknown as { fetch: unknown }).fetch = impl;
};

async function run(): Promise<void> {
  // pure helper
  seed();
  eq(handleSessionExpired(), true, 'cached user -> signed out');
  eq(store[CURRENT_USER_KEY], undefined, 'current-user key cleared');
  eq(session[REAUTH_NOTICE_KEY], '1', 're-login notice flag set');
  eq(JSON.parse(store['DIALYCARE_FLUID_LOGS'])[0].id, 'unsynced-1', 'unsynced local entries kept');
  eq(store['DIALYCARE_READ_NOTIFICATIONS_patient-1'], JSON.stringify(['n1']), 'read-notification ids kept');
  eq(events.includes('dialycare_users_updated'), true, 'auth-context notified');
  delete session[REAUTH_NOTICE_KEY];
  eq(handleSessionExpired(), false, 'no cached user (login page) -> no-op');
  eq(session[REAUTH_NOTICE_KEY], undefined, 'no spurious notice on the login page');

  // syncFullCloudData
  seed();
  setFetch(async () => new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401 }));
  eq(await syncFullCloudData(), null, '401 -> null');
  eq(store[CURRENT_USER_KEY], undefined, 'sync 401 signs out');
  eq(session[REAUTH_NOTICE_KEY], '1', 'sync 401 sets the notice');
  eq(JSON.parse(store['DIALYCARE_FLUID_LOGS'])[0].id, 'unsynced-1', 'sync 401 keeps local entries');

  for (const [label, impl] of [
    ['500', async () => new Response('{}', { status: 500 })],
    ['503', async () => new Response('{}', { status: 503 })],
    ['403', async () => new Response('{}', { status: 403 })],
    ['offline', async () => {
      throw new TypeError('fetch failed');
    }],
  ] as const) {
    seed();
    setFetch(impl as () => Promise<Response>);
    await syncFullCloudData();
    eq(store[CURRENT_USER_KEY], USER, `${label}: cached session kept (silent)`);
    eq(session[REAUTH_NOTICE_KEY], undefined, `${label}: no notice`);
  }

  // syncCloudAccounts fallback path (full sync returns null first, then the accounts call)
  seed();
  setFetch(async () => new Response('{}', { status: 401 }));
  await syncCloudAccounts();
  eq(store[CURRENT_USER_KEY], undefined, 'accounts 401 signs out too');
}

run()
  .then(() => {
    console.log(`\nSESSION-EXPIRY SUITE PASSED: ${n} assertions`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('SESSION-EXPIRY SUITE FAILED:', e);
    process.exit(1);
  });
