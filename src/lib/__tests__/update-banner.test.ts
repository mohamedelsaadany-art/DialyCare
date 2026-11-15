/**
 * The "update available" banner is only for users who signed up before the
 * update was announced, and only until they dismiss or apply it once.
 * Run: npx tsx src/lib/__tests__/update-banner.test.ts
 */
import assert from 'node:assert';
import { shouldShowUpdateNotice } from '../../components/WaslityUpdateBanner';
import type { User } from '../types';

let n = 0;
const eq = (a: boolean, b: boolean, m: string) => {
  assert.strictEqual(a, b, m);
  n++;
};
const notif = { id: 'waslity-update-broadcast-2026-11-14', sentAt: '2026-11-14T12:00:00.000Z' };
const user = (joined?: string): User =>
  ({ uid: 'u1', role: 'patient', username: 'u', displayName: 'U', language: 'ar', createdAt: joined, registeredAt: joined }) as unknown as User;

eq(shouldShowUpdateNotice(null, notif, false), false, 'first-time visitor (not signed in) -> hidden');
eq(shouldShowUpdateNotice(user('2026-10-01T00:00:00.000Z'), notif, false), true, 'existing user who joined before the update -> shown');
eq(shouldShowUpdateNotice(user('2026-10-01T00:00:00.000Z'), notif, true), false, 'already dismissed/applied once -> hidden for good');
eq(shouldShowUpdateNotice(user('2026-11-15T08:00:00.000Z'), notif, false), false, 'new user who joined after the update -> hidden');
eq(shouldShowUpdateNotice(user(undefined), notif, false), true, 'signed-in user with unknown join date -> shown once');

console.log(`\nUPDATE-BANNER SUITE PASSED: ${n} assertions.`);
