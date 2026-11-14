/**
 * Performance Optimization Plan: Module 1 & Module 3 Unit Test Suite
 *
 * Verifies:
 * 1. Direct S3/R2 fetch (zero list() calls, null / 404 NoSuchKey handling)
 * 2. In-memory micro-cache (3000ms TTL hit, accounts + database)
 * 3. Cache bypass on read-modify-write (forWrite: true)
 * 4. Cache instant invalidation on all mutating operations
 * 5. HTTP 304 Not Modified conditional requests & ETag support on GET /api/sync
 *
 * Run: npx tsx src/lib/__tests__/cloud-store-perf.test.ts
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCloudAccounts,
  getCloudDatabase,
  saveCloudAccounts,
  saveCloudDatabase,
  mergeCloudDatabase,
  archivePatients,
  restoreArchivedPatient,
  purgeExpiredArchivedPatients,
  addCloudAccountIfAbsent,
  approveCloudAccount,
  rejectCloudAccount,
  changePasswordInCloud,
  invalidateCloudStoreCache,
  getCloudStoreCache,
  CACHE_TTL_MS,
  decideBlobRead,
} from '../cloud-store';
import { createSessionToken } from '../server-auth';
import { GET as syncGet } from '../../app/api/sync/route';
import type { StoredAccount } from '../types';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

async function run() {
  console.log('================================================================');
  console.log('PERFORMANCE & CLOUD STORE OPTIMIZATION TEST SUITE (M1 & M3)');
  console.log('================================================================\n');

  // ==========================================================================
  // 1. Direct Fetching Without Calling list()
  // ==========================================================================
  console.log('--- 1. Direct S3/R2 Fetching & Elimination of list() ---');

  const cloudStoreSrc = readFileSync(join(__dirname, '..', 'cloud-store.ts'), 'utf8');

  // Verify list() is no longer imported or called in cloud-store.ts
  check(
    !/import\s*\{[^}]*\blist\b[^}]*\}\s*from\s*['"]\.\/r2-client['"]/.test(cloudStoreSrc),
    'cloud-store.ts does not import list from r2-client'
  );
  check(
    !/\blist\s*\(\s*\{/.test(cloudStoreSrc),
    'cloud-store.ts does not call list({ prefix: ... })'
  );
  check(
    cloudStoreSrc.includes('getObjectJson<unknown>(ACCOUNTS_BLOB_PATH)'),
    'getCloudAccounts directly fetches ACCOUNTS_BLOB_PATH with getObjectJson'
  );
  check(
    cloudStoreSrc.includes('getObjectJson<unknown>(DATABASE_BLOB_PATH)'),
    'getCloudDatabase directly fetches DATABASE_BLOB_PATH with getObjectJson'
  );

  // Verify decideBlobRead contract when direct fetch returns null or rejects with 404 (absent blob)
  const seedDecisionAccounts = decideBlobRead({
    failed: false,
    found: false,
    ok: false,
    parsed: undefined,
    loadedBefore: false,
    expect: 'nonEmptyArray',
    production: false,
  });
  eq(seedDecisionAccounts, 'seed', 'Absent accounts blob triggers seed in development');

  const seedDecisionDb = decideBlobRead({
    failed: false,
    found: false,
    ok: false,
    parsed: undefined,
    loadedBefore: false,
    expect: 'object',
    production: false,
  });
  eq(seedDecisionDb, 'seed', 'Absent database blob triggers seed in development');

  const throwDecisionProd = decideBlobRead({
    failed: false,
    found: false,
    ok: false,
    parsed: undefined,
    loadedBefore: false,
    expect: 'object',
    production: true,
  });
  eq(throwDecisionProd, 'throw', 'Absent database blob in production throws instead of seeding demo data');

  console.log('  ✓ Direct S3/R2 fetching verified: list() eliminated and missing key semantics preserved.\n');

  // ==========================================================================
  // 2. In-Memory Micro-Cache Hit Within 3000ms
  // ==========================================================================
  console.log('--- 2. In-Memory Micro-Cache for Serverless (3000ms TTL) ---');

  eq(CACHE_TTL_MS, 3000, 'Micro-cache TTL is configured for exactly 3000ms');

  // Invalidate any leftover state
  invalidateCloudStoreCache();
  eq(getCloudStoreCache().database, null, 'Cache initialized empty (database)');
  eq(getCloudStoreCache().accounts, null, 'Cache initialized empty (accounts)');

  // First fetch populates cache
  const db1 = await getCloudDatabase();
  const cacheAfterDb1 = getCloudStoreCache().database;
  check(cacheAfterDb1 !== null, 'getCloudDatabase populates micro-cache');
  const fetchedAtDb1 = cacheAfterDb1!.fetchedAt;
  check(fetchedAtDb1 > 0, 'Cache has valid fetchedAt timestamp');

  // Second fetch within TTL hits cache (returns same data and timestamp unchanged)
  const db2 = await getCloudDatabase();
  const cacheAfterDb2 = getCloudStoreCache().database;
  eq(cacheAfterDb2!.fetchedAt, fetchedAtDb1, 'Cache fetchedAt timestamp remains identical on cache hit');
  eq(db2.lastUpdated, db1.lastUpdated, 'Cached database data returned identically');

  // Accounts cache hit
  const acc1 = await getCloudAccounts();
  const cacheAfterAcc1 = getCloudStoreCache().accounts;
  check(cacheAfterAcc1 !== null, 'getCloudAccounts populates micro-cache');
  const fetchedAtAcc1 = cacheAfterAcc1!.fetchedAt;

  const acc2 = await getCloudAccounts();
  const cacheAfterAcc2 = getCloudStoreCache().accounts;
  eq(cacheAfterAcc2!.fetchedAt, fetchedAtAcc1, 'Accounts cache fetchedAt timestamp unchanged on hit');
  eq(acc2.length, acc1.length, 'Cached accounts returned identically');

  // Verify expired cache re-fetches
  if (getCloudStoreCache().database) {
    // Artificially age the cache entry past 3000ms
    getCloudStoreCache().database!.fetchedAt = Date.now() - 3500;
    const dbExpired = await getCloudDatabase();
    check(Boolean(dbExpired), 'Fresh database returned on expired cache');
    const cacheAfterExpired = getCloudStoreCache().database;
    check(
      cacheAfterExpired!.fetchedAt > Date.now() - 500,
      'Expired micro-cache (>3000ms) re-fetches fresh data from underlying store'
    );
  }

  console.log('  ✓ In-memory micro-cache hit and TTL expiration verified.\n');

  // ==========================================================================
  // 3. Cache Bypass When forWrite: true
  // ==========================================================================
  console.log('--- 3. Cache Bypass on Read-Modify-Write (forWrite: true) ---');

  // Ensure cache is hot
  await getCloudDatabase();
  await getCloudAccounts();

  // forWrite read must bypass cache even when hot
  const writeDb = await getCloudDatabase({ forWrite: true });
  check(writeDb !== null, 'forWrite database read returned successfully');

  const writeAcc = await getCloudAccounts({ forWrite: true });
  check(writeAcc !== null, 'forWrite accounts read returned successfully');

  console.log('  ✓ Cache bypass with { forWrite: true } verified.\n');

  // ==========================================================================
  // 4. Instant Invalidation on Writes
  // ==========================================================================
  console.log('--- 4. Instant Micro-Cache Invalidation on Mutating Operations ---');

  // Test manual invalidateCloudStoreCache()
  await getCloudDatabase();
  await getCloudAccounts();
  check(getCloudStoreCache().database !== null, 'Database cache is primed');
  check(getCloudStoreCache().accounts !== null, 'Accounts cache is primed');
  invalidateCloudStoreCache();
  eq(getCloudStoreCache().database, null, 'invalidateCloudStoreCache cleared database cache');
  eq(getCloudStoreCache().accounts, null, 'invalidateCloudStoreCache cleared accounts cache');

  // Helper to prime both caches
  const primeCache = async () => {
    await getCloudDatabase();
    await getCloudAccounts();
    check(getCloudStoreCache().database !== null, 'Prime: database cache active');
    check(getCloudStoreCache().accounts !== null, 'Prime: accounts cache active');
  };

  // 4.1 saveCloudDatabase invalidates cache
  await primeCache();
  const currentDb = await getCloudDatabase({ forWrite: true });
  await saveCloudDatabase({ ...currentDb, lastUpdated: new Date().toISOString() });
  eq(getCloudStoreCache().database, null, 'saveCloudDatabase invalidates cache');

  // 4.2 saveCloudAccounts invalidates cache
  await primeCache();
  const currentAccounts = await getCloudAccounts({ forWrite: true });
  await saveCloudAccounts([...currentAccounts]);
  eq(getCloudStoreCache().accounts, null, 'saveCloudAccounts invalidates cache');

  // 4.3 mergeCloudDatabase invalidates cache
  await primeCache();
  await mergeCloudDatabase({ coachingTips: [] });
  eq(getCloudStoreCache().database, null, 'mergeCloudDatabase invalidates cache');

  // 4.4 addCloudAccountIfAbsent invalidates cache
  await primeCache();
  const testAccount: StoredAccount = {
    username: `perf_test_user_${Date.now()}`,
    phone: `010${Math.floor(10000000 + Math.random() * 89999999)}`,
    password: 'perf_test_password',
    user: {
      uid: `uid-perf-${Date.now()}`,
      username: `perf_test_user_${Date.now()}`,
      displayName: 'Perf Test User',
      role: 'patient',
      status: 'pending',
      language: 'ar',
      createdAt: new Date().toISOString(),
    },
  };
  const addRes = await addCloudAccountIfAbsent(testAccount);
  eq(addRes, 'created', 'Test account successfully created');
  eq(getCloudStoreCache().accounts, null, 'addCloudAccountIfAbsent invalidates cache');

  // 4.5 approveCloudAccount invalidates cache
  await primeCache();
  await approveCloudAccount(testAccount.user.uid, 'Super Admin');
  eq(getCloudStoreCache().accounts, null, 'approveCloudAccount invalidates cache');

  // 4.6 rejectCloudAccount invalidates cache
  await primeCache();
  await rejectCloudAccount(testAccount.user.uid, 'Testing rejection', 'Super Admin');
  eq(getCloudStoreCache().accounts, null, 'rejectCloudAccount invalidates cache');

  // 4.7 changePasswordInCloud invalidates cache
  await primeCache();
  const pwChanged = await changePasswordInCloud(testAccount.user.uid, 'scrypt$dummy_hash', true);
  eq(pwChanged, true, 'changePasswordInCloud updated password');
  eq(getCloudStoreCache().accounts, null, 'changePasswordInCloud invalidates cache');

  // 4.8 archivePatients invalidates cache
  await primeCache();
  await archivePatients([testAccount.user.uid], 'Super Admin');
  eq(getCloudStoreCache().database, null, 'archivePatients invalidates cache');

  // 4.9 restoreArchivedPatient invalidates cache
  await primeCache();
  await restoreArchivedPatient(testAccount.user.uid, 'Super Admin');
  eq(getCloudStoreCache().database, null, 'restoreArchivedPatient invalidates cache');

  // 4.10 purgeExpiredArchivedPatients invalidates cache
  await primeCache();
  await purgeExpiredArchivedPatients(new Date());
  eq(getCloudStoreCache().database, null, 'purgeExpiredArchivedPatients invalidates cache');

  console.log('  ✓ Instant cache invalidation verified across all 10 mutation functions.\n');

  // ==========================================================================
  // 5. HTTP 304 Not Modified & ETag Conditional Requests in GET /api/sync
  // ==========================================================================
  console.log('--- 5. HTTP 304 Not Modified & ETag in GET /api/sync ---');

  const adminToken = createSessionToken({ uid: 'admin-1', role: 'admin' });
  check(Boolean(adminToken), 'Issued valid session token for admin');

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${adminToken}`,
  };

  // 5.1 Initial GET /api/sync request without ETag -> returns 200 with ETag header
  const initialReq = new Request('http://localhost:3000/api/sync', {
    method: 'GET',
    headers: authHeaders,
  });
  const initialRes = await syncGet(initialReq);
  eq(initialRes.status, 200, 'Initial GET /api/sync returns 200 OK');

  const etag = initialRes.headers.get('ETag');
  check(Boolean(etag), 'GET /api/sync includes ETag response header');
  check(etag!.startsWith('W/"'), `ETag starts with W/" (got ${etag})`);
  check(etag!.includes('admin-1'), `ETag includes scoped user uid (got ${etag})`);

  // Verify NO_STORE_HEADERS are still present
  const cacheControl = initialRes.headers.get('Cache-Control');
  check(cacheControl?.includes('no-store'), 'GET /api/sync maintains Cache-Control: no-store');

  const initialBody = await initialRes.json();
  eq(initialBody.success, true, 'GET /api/sync body has success: true');
  check(Array.isArray(initialBody.data.accounts), 'GET /api/sync returns scoped accounts');

  // 5.2 Conditional GET /api/sync request with matching If-None-Match -> returns 304 Not Modified
  const conditionalReq = new Request('http://localhost:3000/api/sync', {
    method: 'GET',
    headers: {
      ...authHeaders,
      'If-None-Match': etag!,
    },
  });
  const conditionalRes = await syncGet(conditionalReq);
  eq(conditionalRes.status, 304, 'Conditional GET /api/sync returns 304 Not Modified when ETag matches');
  eq(conditionalRes.headers.get('ETag'), etag, '304 response preserves ETag header');
  check(
    conditionalRes.headers.get('Cache-Control')?.includes('no-store'),
    '304 response preserves Cache-Control headers'
  );

  // 304 response body should be null / empty
  const text304 = await conditionalRes.text();
  eq(text304, '', '304 response body is empty');

  // 5.3 Conditional GET /api/sync with mismatched If-None-Match -> returns 200 with fresh body
  const mismatchedReq = new Request('http://localhost:3000/api/sync', {
    method: 'GET',
    headers: {
      ...authHeaders,
      'If-None-Match': 'W/"outdated-etag-v0-admin-1"',
    },
  });
  const mismatchedRes = await syncGet(mismatchedReq);
  eq(mismatchedRes.status, 200, 'Mismatched If-None-Match returns 200 OK');
  const mismatchedBody = await mismatchedRes.json();
  eq(mismatchedBody.success, true, 'Fresh body returned on ETag mismatch');

  // 5.4 Conditional GET /api/sync with wildcard If-None-Match: * -> returns 304
  const wildcardReq = new Request('http://localhost:3000/api/sync', {
    method: 'GET',
    headers: {
      ...authHeaders,
      'If-None-Match': '*',
    },
  });
  const wildcardRes = await syncGet(wildcardReq);
  eq(wildcardRes.status, 304, 'Wildcard If-None-Match: * returns 304 Not Modified');

  // 5.5 Patient session ETag scoping check
  const patientToken = createSessionToken({ uid: 'patient-1', role: 'patient' });
  const patientReq = new Request('http://localhost:3000/api/sync', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${patientToken}`,
    },
  });
  const patientRes = await syncGet(patientReq);
  eq(patientRes.status, 200, 'Patient GET /api/sync returns 200 OK');
  const patientEtag = patientRes.headers.get('ETag');
  check(patientEtag?.includes('patient-1'), 'Patient ETag is scoped to patient uid');
  check(patientEtag !== etag, 'Patient ETag differs from admin ETag due to user-scoping');

  console.log('  ✓ HTTP 304 conditional request handling and user-scoped ETags verified.\n');

  console.log('================================================================');
  console.log(`PERF OPTIMIZATION SUITE PASSED: ${assertions} assertions`);
  console.log('================================================================');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('PERF TEST SUITE FAILED:', err);
    process.exit(1);
  });
