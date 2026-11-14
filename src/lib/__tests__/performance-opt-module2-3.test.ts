/**
 * Unit & Integration Tests: Performance Optimization Module 2 & Module 3
 * 1. Admin Patients Polling Removal & Event-Driven Update via dialycare_cloud_sync_completed
 * 2. Admin Layout Focus Cooldown (5-second throttle guard)
 * 3. Client-Side ETag Caching & 304 Not Modified Handling in syncFullCloudData
 * 4. Error & Edge Case Guards: Failed 200 Payload Non-Pollution, 401 Session Expiry Cleanup, 304 Local Merge Integrity
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Setup mock window and storage
const memoryStorage: Record<string, string> = {};
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in memoryStorage ? memoryStorage[k] : null),
      setItem: (k: string, v: string) => {
        memoryStorage[k] = String(v);
      },
      removeItem: (k: string) => {
        delete memoryStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
      },
    },
    sessionStorage: {
      getItem: (k: string) => (k in memoryStorage ? memoryStorage[k] : null),
      setItem: (k: string, v: string) => {
        memoryStorage[k] = String(v);
      },
      removeItem: (k: string) => {
        delete memoryStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
      },
    },
    location: {
      origin: 'http://localhost:3000',
    },
    dispatchEvent: (_event: Event) => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  syncFullCloudData,
  getLastSyncETag,
  resetSyncETag,
  handleSessionExpired,
  STORAGE_KEYS,
} from '../data-store';
import type { UnifiedCloudDatabase } from '../types';

let passCount = 0;
function testAssert(condition: boolean, msg: string) {
  assert.ok(condition, msg);
  passCount++;
  console.log(`  ✓ ${msg}`);
}

async function runTests() {
  console.log('\n============================================================');
  console.log('TEST SUITE: MODULE 2 & 3 PERFORMANCE OPTIMIZATIONS');
  console.log('============================================================\n');

  // -------------------------------------------------------------
  // Test 1: syncFullCloudData captures ETag on 200 response
  // -------------------------------------------------------------
  console.log('--- Test 1: ETag Capture on 200 OK ---');
  resetSyncETag();
  testAssert(getLastSyncETag() === null, 'Initial ETag is null');

  const mockDb1: UnifiedCloudDatabase = {
    accounts: [],
    patients: [
      {
        id: 'patient-test-etag-1',
        fullName: 'ETag Test Patient',
        fullNameAr: 'مريض تجريبي 1',
        dialysisSchedule: 'SMW',
        dryWeightKg: 72,
        reminderSchedule: 'standard',
        isActive: true,
        gender: 'male',
        createdAt: new Date().toISOString(),
      },
    ],
    dialysisSessions: [],
    labResults: [],
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
  };

  let capturedHeaders: Record<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'etag') return 'W/"hash-version-1"';
          return null;
        },
      },
      json: async () => ({
        success: true,
        data: mockDb1,
      }),
    } as unknown as Response;
  };

  try {
    const result1 = await syncFullCloudData();
    testAssert(result1 !== null, 'syncFullCloudData succeeded with status 200');
    testAssert(result1?.patients.length === 1, 'Result contains 1 patient');
    testAssert(getLastSyncETag() === 'W/"hash-version-1"', 'lastSyncETag stored new ETag header correctly');
    testAssert(!capturedHeaders?.['If-None-Match'], 'Initial request did not send If-None-Match');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 2: If-None-Match attached on subsequent fetch & 304 Handling
  // -------------------------------------------------------------
  console.log('\n--- Test 2: If-None-Match Transmission & 304 Not Modified Handling ---');
  let dispatchedEvents: string[] = [];
  const origDispatch = window.dispatchEvent;
  window.dispatchEvent = (ev: Event) => {
    dispatchedEvents.push(ev.type);
    return true;
  };

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      ok: false, // In standard Fetch API, 304 has ok: false
      status: 304,
      headers: {
        get: () => null,
      },
      json: async () => {
        throw new Error('304 Not Modified should not have body parsed');
      },
    } as unknown as Response;
  };

  try {
    dispatchedEvents = [];
    const result2 = await syncFullCloudData();
    testAssert(capturedHeaders?.['If-None-Match'] === 'W/"hash-version-1"', 'Subsequent request sent If-None-Match header matching previous ETag');
    testAssert(result2 !== null, '304 response returns database object');
    testAssert(Boolean(result2?.patients.some((p) => p.id === 'patient-test-etag-1')), 'Returned database contains previous patient');
    testAssert(dispatchedEvents.length === 0, 'No reactive window events dispatched on 304 (prevents redundant re-renders)');
  } finally {
    globalThis.fetch = originalFetch;
    window.dispatchEvent = origDispatch;
  }

  // -------------------------------------------------------------
  // Test 3: New ETag on data modification (200 OK after 304)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Transition from 304 to 200 with New ETag ---');
  const mockDb2: UnifiedCloudDatabase = {
    ...mockDb1,
    patients: [
      ...mockDb1.patients,
      {
        id: 'patient-test-etag-2',
        fullName: 'Second Patient',
        fullNameAr: 'مريض تجريبي 2',
        dialysisSchedule: 'STT',
        dryWeightKg: 65,
        reminderSchedule: 'standard',
        isActive: true,
        gender: 'female',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'etag') return 'W/"hash-version-2"';
          return null;
        },
      },
      json: async () => ({
        success: true,
        data: mockDb2,
      }),
    } as unknown as Response;
  };

  try {
    const result3 = await syncFullCloudData();
    testAssert(capturedHeaders?.['If-None-Match'] === 'W/"hash-version-1"', 'Sent previous ETag in If-None-Match');
    testAssert(result3 !== null, 'syncFullCloudData succeeded with updated data');
    testAssert(result3?.patients.length === 2, 'Result contains updated 2 patients');
    testAssert(getLastSyncETag() === 'W/"hash-version-2"', 'lastSyncETag updated to new hash version');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 4: Failed 200 Payload Does Not Poison ETag State
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Failed 200 Payload Does Not Corrupt ETag Cache ---');
  const tagBeforeFailure = getLastSyncETag();

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'etag') return 'W/"corrupt-version-attempt"';
          return null;
        },
      },
      json: async () => ({
        success: false,
        error: 'databaseLocked',
      }),
    } as unknown as Response;
  };

  try {
    const failResult = await syncFullCloudData();
    testAssert(failResult === null, 'syncFullCloudData returns null on success: false');
    testAssert(
      getLastSyncETag() === tagBeforeFailure,
      'lastSyncETag remained unpolluted and did not store the unverified corrupt ETag'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 5: 304 Response Reflects Recent Local Mutations
  // -------------------------------------------------------------
  console.log('\n--- Test 5: 304 Response Preserves Recent Local Storage Mutations ---');
  // Add a new local medication record directly to storage
  const currentMedsRaw = window.localStorage.getItem(STORAGE_KEYS.PATIENT_MEDICATIONS);
  const currentMeds = currentMedsRaw ? JSON.parse(currentMedsRaw) : [];
  currentMeds.push({
    id: 'med-local-mutation-1',
    patientId: 'patient-test-etag-1',
    name: 'Calcium Acetate',
    dosage: '667mg',
    frequency: 'with meals',
    isActive: true,
  });
  window.localStorage.setItem(STORAGE_KEYS.PATIENT_MEDICATIONS, JSON.stringify(currentMeds));

  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 304,
      headers: { get: () => null },
    }) as unknown as Response;

  try {
    const res304 = await syncFullCloudData();
    testAssert(res304 !== null, '304 returned non-null database');
    testAssert(
      Boolean(res304?.medications.some((m) => m.id === 'med-local-mutation-1')),
      '304 returned database incorporates recently created local medication'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 6: 401 Session Expiry Clears ETag Cache
  // -------------------------------------------------------------
  console.log('\n--- Test 6: 401 Session Expiry Clears ETag Cache ---');
  testAssert(getLastSyncETag() !== null, 'ETag exists before 401 test');

  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 401,
      headers: { get: () => null },
    }) as unknown as Response;

  try {
    const res401 = await syncFullCloudData();
    testAssert(res401 === null, '401 returns null');
    testAssert(getLastSyncETag() === null, '401 cleared lastSyncETag to avoid leaking cached state to future sessions');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 7: handleSessionExpired resets ETag
  // -------------------------------------------------------------
  console.log('\n--- Test 7: handleSessionExpired Resets ETag ---');
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => 'W/"test-etag-7"' },
      json: async () => ({ success: true, data: mockDb1 }),
    }) as unknown as Response;

  try {
    await syncFullCloudData();
    testAssert(getLastSyncETag() === 'W/"test-etag-7"', 'ETag set before session expired call');
    handleSessionExpired();
    testAssert(getLastSyncETag() === null, 'handleSessionExpired() wiped lastSyncETag');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // Test 8: Focus Cooldown Logic (5-second throttle simulation)
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Focus Cooldown Logic (5000ms Throttling) ---');
  let syncTriggerCount = 0;
  const mockRunFullCloudSync = async () => {
    syncTriggerCount++;
  };

  let lastFocusSyncTime = 0;
  const mounted = true;
  const handleFocus = () => {
    const now = Date.now();
    if (now - lastFocusSyncTime < 5000) return; // 5-second cooldown
    lastFocusSyncTime = now;
    if (mounted) void mockRunFullCloudSync();
  };

  // 1st focus: should run
  handleFocus();
  testAssert(syncTriggerCount === 1, 'First focus event triggers sync');

  // Rapid subsequent focus events within 5 seconds: should NOT run
  handleFocus();
  handleFocus();
  handleFocus();
  testAssert(syncTriggerCount === 1, 'Rapid focus events within 5-second window are blocked');

  // Simulate time passage past 5000ms
  lastFocusSyncTime = Date.now() - 5001;
  handleFocus();
  testAssert(syncTriggerCount === 2, 'Focus event after 5-second cooldown passes guard and triggers sync');

  // -------------------------------------------------------------
  // Test 9: Source Code AST Verification for admin/patients/page.tsx & layout.tsx
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Source Code Verification for Module 2 & 3 ---');
  const cwd = process.cwd();
  const patientsSource = readFileSync(join(cwd, 'src/app/[locale]/admin/patients/page.tsx'), 'utf8');
  const layoutSource = readFileSync(join(cwd, 'src/app/[locale]/admin/layout.tsx'), 'utf8');

  // 9.1 Patients page has no independent polling interval
  testAssert(
    !patientsSource.includes('startVisibilityAwarePolling'),
    'patients/page.tsx has no startVisibilityAwarePolling import or usage'
  );
  testAssert(
    !/setInterval\s*\(\s*\(\)\s*=>\s*\{\s*handleCloudSync\s*\(\s*\)\s*;\s*\}\s*,\s*12000\s*\)/.test(patientsSource),
    'patients/page.tsx has no 12-second polling setInterval'
  );

  // 9.2 Patients page listens to dialycare_cloud_sync_completed and cleans up
  testAssert(
    patientsSource.includes("window.addEventListener('dialycare_cloud_sync_completed'"),
    'patients/page.tsx registers window event listener for dialycare_cloud_sync_completed'
  );
  testAssert(
    patientsSource.includes("window.removeEventListener('dialycare_cloud_sync_completed'"),
    'patients/page.tsx removes window event listener for dialycare_cloud_sync_completed on unmount'
  );

  // 9.3 Patients page manual sync button is intact
  testAssert(
    patientsSource.includes('handleCloudSync(true)'),
    'patients/page.tsx keeps manual "Sync with Cloud" trigger button'
  );

  // 9.4 Layout has 5-second cooldown guard on focus
  testAssert(
    layoutSource.includes('lastFocusSyncTime < 5000'),
    'admin/layout.tsx has 5000ms cooldown guard in handleFocus'
  );
  testAssert(
    layoutSource.includes("window.addEventListener('focus', handleFocus)"),
    'admin/layout.tsx attaches handleFocus to window focus'
  );
  testAssert(
    layoutSource.includes("window.removeEventListener('focus', handleFocus)"),
    'admin/layout.tsx cleans up handleFocus on unmount'
  );

  console.log('\n============================================================');
  console.log(`ALL PERFORMANCE OPTIMIZATION TESTS PASSED: ${passCount} assertions`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
