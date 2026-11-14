/**
 * B9 — the (public) database blob must never contain account passwords,
 * hashes or password metadata. Every database-blob write uses
 * serializeDatabaseForBlob(); reconcile must still keep the real passwords
 * from the accounts blob.
 *
 * Offline: Blob env vars deleted; pure functions + the in-memory store.
 * Run: npx tsx src/lib/__tests__/db-blob-scrub.test.ts
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;

import {
  decideBlobRead,
  getCloudDatabase,
  reconcileAccounts,
  serializeDatabaseForBlob,
  stripAccountSecrets,
} from '../cloud-store';
import type { StoredAccount, UnifiedCloudDatabase } from '../types';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}
console.warn = () => {};

const user = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  role: 'patient' as const,
  username: uid,
  displayName: uid,
  language: 'ar' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

async function run(): Promise<void> {
  const accounts = [
    { username: 'p-plain', password: 'patient123', user: user('p-plain') },
    { username: 'p-hash', password: 'scrypt$1$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA$a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2U', passwordUpdatedAt: '2026-11-14T08:00:00.000Z', user: user('p-hash') },
    { username: 'p-legacyfield', password: 'x1', passwordHash: 'legacy', user: user('p-legacyfield') },
  ] as unknown as StoredAccount[];

  // ------------------------------------------------ 1. serializer
  console.log('--- 1. serializeDatabaseForBlob strips every account secret');
  const db = { ...(await getCloudDatabase()), accounts: [...(await getCloudDatabase()).accounts, ...accounts] } as UnifiedCloudDatabase;
  check(db.accounts.some((a) => a.password), 'precondition: in-memory accounts DO carry passwords');
  const json = serializeDatabaseForBlob(db);
  check(!json.includes('"password"'), 'no "password" key in the serialized blob');
  check(!json.includes('passwordHash'), 'no passwordHash key');
  check(!json.includes('passwordUpdatedAt'), 'no passwordUpdatedAt key');
  check(!json.includes('patient123') && !json.includes('admin123') && !json.includes('scrypt$'), 'no plaintext or hash values');
  const parsed = JSON.parse(json) as UnifiedCloudDatabase;
  eq(parsed.accounts.length, db.accounts.length, 'accounts kept (for status reconcile), only secrets removed');
  eq(parsed.accounts.find((a) => a.username === 'p-hash')!.user.status, 'active', 'user/status preserved');
  eq(parsed.patients.length, db.patients.length, 'clinical collections untouched');
  check(db.accounts.find((a) => a.username === 'p-plain')!.password === 'patient123', 'serializing does not mutate the in-memory accounts');
  eq(JSON.parse(serializeDatabaseForBlob({ ...db, accounts: undefined as unknown as StoredAccount[] })).accounts.length, 0, 'missing accounts -> empty array');
  const stripped = stripAccountSecrets(accounts[1]);
  check(!('password' in stripped) && !('passwordUpdatedAt' in stripped), 'stripAccountSecrets removes the keys');

  // ------------------------------------------------ 2. reconcile keeps real passwords
  console.log('--- 2. reading a scrubbed blob never loses the accounts-blob passwords');
  const blobAccounts = parsed.accounts.map((a) =>
    a.username === 'p-plain' ? { ...a, user: { ...a.user, reviewedAt: '2099-01-01T00:00:00.000Z' } } : a
  );
  const { merged } = reconcileAccounts(db.accounts, blobAccounts);
  eq(merged.find((a) => a.username === 'p-plain')!.password, 'patient123', 'newer blob status merges, password kept');
  eq(merged.find((a) => a.username === 'p-plain')!.user.reviewedAt, '2099-01-01T00:00:00.000Z', 'status/timestamps still reconcile');
  check(merged.find((a) => a.username === 'p-hash')!.password.startsWith('scrypt$'), 'hash kept');

  // ------------------------------------------------ 2b. B2.1 reconcile never reverts credentials
  console.log('--- 2b. reconcile never takes password/passwordUpdatedAt from the other copy');
  const HASH_NEW = 'scrypt$1$16384$8$1$bmV3c2FsdG5ld3NhbHRuZXc$bmV3a2V5bmV3a2V5bmV3a2V5bmV3a2V5bmV3a2V5bmU';
  const HASH_OLD = 'scrypt$1$16384$8$1$b2xkc2FsdG9sZHNhbHRvbGQ$b2xka2V5b2xka2V5b2xka2V5b2xka2V5b2xka2V5b2w';
  const base = [
    { username: 'a', password: HASH_NEW, user: user('a') },
    { username: 'b', password: HASH_NEW, passwordUpdatedAt: '2026-11-14T09:00:00.000Z', user: user('b') },
    { username: 'c', password: HASH_NEW, user: user('c', { status: 'pending' }) },
    { username: 'd', password: HASH_NEW, user: user('d') },
    { username: 'e', password: '', user: user('e') },
  ] as unknown as StoredAccount[];
  const other = [
    // newer timestamp + legacy plaintext
    { username: 'a', password: 'patient123', user: user('a', { reviewedAt: '2099-01-01T00:00:00.000Z' }) },
    // older password change + older hash, newer timestamp
    { username: 'b', password: HASH_OLD, passwordUpdatedAt: '2026-11-01T00:00:00.000Z', user: user('b', { reviewedAt: '2099-01-01T00:00:00.000Z' }) },
    // active-over-pending trigger
    { username: 'c', password: 'oldplain', user: user('c', { status: 'active' }) },
    // patientProfile trigger
    { username: 'd', password: HASH_OLD, user: user('d', { patientProfile: { dialysisSchedule: 'SMW', dryWeightKg: 70, accessType: 'AVF', dialysisCenter: 'U' } }) },
    // base has no password at all -> the other copy's is the only one available
    { username: 'e', password: 'only-copy', user: user('e', { reviewedAt: '2099-01-01T00:00:00.000Z' }) },
  ] as unknown as StoredAccount[];
  const r = reconcileAccounts(base, other).merged;
  const get = (u: string) => r.find((x) => x.username === u)!;
  eq(get('a').password, HASH_NEW, 'hash kept over newer-timestamp plaintext');
  eq(get('a').user.reviewedAt, '2099-01-01T00:00:00.000Z', 'non-credential fields still merge');
  eq(get('b').password, HASH_NEW, 'newer password change kept over an older hash');
  eq(get('b').passwordUpdatedAt, '2026-11-14T09:00:00.000Z', 'passwordUpdatedAt kept (sessions stay revoked)');
  eq(get('c').password, HASH_NEW, 'active-over-pending merge keeps the hash');
  eq(get('c').user.status, 'active', 'status still merges');
  eq(get('d').password, HASH_NEW, 'patientProfile merge keeps the hash');
  check(get('d').user.patientProfile, 'profile still merges');
  eq(get('e').password, 'only-copy', 'base without a password takes the only copy');
  check(!('passwordUpdatedAt' in get('a')), 'no passwordUpdatedAt invented');

  // ------------------------------------------------ 2c. read hardening (never seed over an existing blob)
  console.log('--- 2c. decideBlobRead: seed only when absent, never serve seeds on a failed read');
  const d = (o: Partial<Parameters<typeof decideBlobRead>[0]>) =>
    decideBlobRead({ failed: false, found: true, ok: true, parsed: [{ a: 1 }], loadedBefore: false, expect: 'nonEmptyArray', ...o });
  eq(d({}), 'use', 'found + ok + non-empty array -> use');
  eq(d({ found: false, ok: false, parsed: undefined }), 'seed', 'absent (list ok) -> seed');
  eq(d({ ok: false, parsed: undefined }), 'throw', 'found but fetch !ok, cold instance -> throw (not seed)');
  eq(d({ ok: false, parsed: undefined, loadedBefore: true }), 'cached', 'found but fetch !ok, real list cached -> cached');
  eq(d({ parsed: [] }), 'throw', 'found + empty array -> throw (never seed over it)');
  eq(d({ parsed: undefined }), 'throw', 'found + unparsable -> throw');
  eq(d({ parsed: { not: 'array' } }), 'throw', 'found + wrong shape -> throw');
  eq(d({ failed: true, found: false, ok: false, parsed: undefined }), 'throw', 'exception (even before list) -> throw, never seed');
  eq(d({ failed: true, found: false, ok: false, parsed: undefined, loadedBefore: true }), 'cached', 'exception with real list cached -> cached');
  eq(d({ expect: 'object', parsed: { patients: [] } }), 'use', 'database: object -> use');
  eq(d({ expect: 'object', parsed: [] }), 'throw', 'database: array -> throw');
  eq(d({ expect: 'object', parsed: null }), 'throw', 'database: null -> throw');
  eq(d({ expect: 'object', ok: false, parsed: undefined, loadedBefore: true }), 'cached', 'database: failed read with cache -> cached');
  eq(d({ ok: false, parsed: undefined, loadedBefore: true, forWrite: true }), 'throw', 'forWrite: failed read never served from cache, even when loaded before');
  eq(d({ failed: true, found: false, ok: false, parsed: undefined, loadedBefore: true, forWrite: true }), 'throw', 'forWrite: exception -> throw');
  eq(d({ forWrite: true }), 'use', 'forWrite: fresh valid read -> use');
  eq(d({ found: false, ok: false, parsed: undefined, production: true }), 'throw', 'production + absent blob -> throw, never seed');
  eq(d({ found: false, ok: false, parsed: undefined, production: true, expect: 'object' }), 'throw', 'production + absent database blob -> throw');
  eq(d({ production: true }), 'use', 'production + valid read -> use');
  const csrc = readFileSync(join(__dirname, '..', 'cloud-store.ts'), 'utf8');
  const ssrc = readFileSync(join(__dirname, '..', 'server-auth.ts'), 'utf8');
  const syncSrc = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'sync', 'route.ts'), 'utf8');
  // every read-modify-write path asks for a fresh read
  for (const fn of ['upsertCloudAccount', 'addCloudAccountIfAbsent', 'mergeCloudAccounts', 'approveCloudAccount', 'rejectCloudAccount', 'mergeCloudDatabase']) {
    const body = csrc.slice(csrc.indexOf(`export async function ${fn}(`), csrc.indexOf(String.fromCharCode(10)+'}'+String.fromCharCode(10), csrc.indexOf(`export async function ${fn}(`)));
    check(/getCloud(Accounts|Database)\(\{ forWrite: true \}\)/.test(body), `${fn} reads with forWrite`);
  }
  for (const fn of ['storeAccountPassword', 'migratePlaintextPasswords']) {
    const body = ssrc.slice(ssrc.indexOf(`export async function ${fn}(`), ssrc.indexOf(String.fromCharCode(10)+'}'+String.fromCharCode(10), ssrc.indexOf(`export async function ${fn}(`)));
    check(/getCloudAccounts\(\{ forWrite: true \}\)/.test(body), `${fn} reads with forWrite`);
  }
  check(/getCloudDatabase\(\{ forWrite: true \}\)/.test(syncSrc), 'POST /api/sync reads with forWrite');
  check(!/using fallback memory accounts|using memory fallback/.test(csrc), 'the old silent memory fallbacks are gone');
  eq((csrc.match(/decideBlobRead\(\{/g) || []).length, 2, 'both blob reads go through decideBlobRead');

  // ------------------------------------------------ 3. single write path
  console.log('--- 3. the database blob has exactly one write path, and it scrubs');
  const src = readFileSync(join(__dirname, '..', 'cloud-store.ts'), 'utf8');
  const puts = src.match(/put\(\s*DATABASE_BLOB_PATH\s*,\s*([^,]+),/g) || [];
  eq(puts.length, 1, 'one put(DATABASE_BLOB_PATH, ...) call');
  check(/serializeDatabaseForBlob\(db\)/.test(puts[0] || ''), 'and it uses serializeDatabaseForBlob');
}

run()
  .then(() => {
    console.log(`\nDB-BLOB-SCRUB SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('DB-BLOB-SCRUB SUITE FAILED:', err);
    process.exit(1);
  });
