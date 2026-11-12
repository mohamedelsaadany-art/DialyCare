/**
 * DialyCare Master Test Suite Runner
 * Sequentially executes all project test suites:
 * 1. pwa-verification.test.ts
 * 2. patient-features.test.ts
 * 3. patient-messaging.test.ts
 * 4. clinical-features-e2e.test.ts
 *
 * Intercepts node:assert to track assertion volume across all suites.
 * Exits with process.exit(0) on success, process.exit(1) on failure.
 */

import assert from 'node:assert';

// Global assertion interception & counter
let globalAssertionCount = 0;

const assertionMethods = [
  'ok',
  'strictEqual',
  'deepStrictEqual',
  'notStrictEqual',
  'notDeepStrictEqual',
  'throws',
  'doesNotThrow',
  'match',
  'rejects',
] as const;

for (const method of assertionMethods) {
  const original = assert[method] as unknown;
  if (typeof original === 'function') {
    (assert as unknown as Record<string, unknown>)[method] = function (...args: unknown[]) {
      globalAssertionCount++;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

interface TestSuiteDefinition {
  id: string;
  name: string;
  importPath: string;
}

const TEST_SUITES: TestSuiteDefinition[] = [
  {
    id: 'pwa',
    name: '1. PWA & Service Worker Verification Suite',
    importPath: './pwa-verification.test',
  },
  {
    id: 'patient-features',
    name: '2. Dialysis Schedule & Patient Notification Filtering Suite',
    importPath: './patient-features.test',
  },
  {
    id: 'patient-messaging',
    name: '3. Patient Messaging & Notification Persistence Store Suite',
    importPath: './patient-messaging.test',
  },
  {
    id: 'clinical-features-e2e',
    name: '4. Clinical Features Dual-Track E2E Suite (Tiers 1 - 4)',
    importPath: './clinical-features-e2e.test',
  },
  {
    id: 'milestone4-alerts-avatar',
    name: '5. Milestone 4: Smart Fluid Alerts & Coaching Avatar Suite (R3 & R4)',
    importPath: './milestone4-alerts-avatar.test',
  },
  {
    id: 'tier5-adversarial-coverage',
    name: '6. Tier 5: White-Box Adversarial Coverage Hardening Suite',
    importPath: './tier5-adversarial-coverage.test',
  },
  {
    id: 'dialysis-schedule-r6',
    name: '7. Dialysis Schedule Options (R6) Strict Verification Suite',
    importPath: './dialysis-schedule-r6.test',
  },
  {
    id: 'challenger-adherence-survey',
    name: '8. Dialysis Treatment Adherence Questionnaire (R7) Comprehensive Suite',
    importPath: './challenger-adherence-survey.test',
  },
  {
    id: 'clinical-ux-audit',
    name: '9. Clinical UX & Quality Review Audit Suite',
    importPath: './clinical-ux-audit.test',
  },
];

async function runMasterTestSuite(): Promise<void> {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('DIALYCARE MASTER AUTOMATED TEST RUNNER');
  console.log(`Executing ${TEST_SUITES.length} test suites sequentially...`);
  console.log('================================================================\n');

  const suiteResults: Array<{ name: string; assertions: number; passed: boolean; error?: unknown }> = [];

  for (const suite of TEST_SUITES) {
    const priorCount = globalAssertionCount;
    console.log(`\n================================================================`);
    console.log(`RUNNING SUITE: ${suite.name}`);
    console.log(`================================================================`);

    try {
      const mod = await import(suite.importPath);
      if (typeof mod.runAllMilestone4Tests === 'function') {
        await mod.runAllMilestone4Tests();
      }
      if (typeof mod.runAllTier5AdversarialTests === 'function') {
        await mod.runAllTier5AdversarialTests();
      }
      const assertionsRun = globalAssertionCount - priorCount;
      suiteResults.push({
        name: suite.name,
        assertions: assertionsRun,
        passed: true,
      });
      console.log(`\n>>> RESULT: ${suite.name} -> PASSED (${assertionsRun} assertions)`);
    } catch (err) {
      const assertionsRun = globalAssertionCount - priorCount;
      suiteResults.push({
        name: suite.name,
        assertions: assertionsRun,
        passed: false,
        error: err,
      });
      console.error(`\n>>> RESULT: ${suite.name} -> FAILED`);
      console.error(err);
      console.error('\n================================================================');
      console.error('TEST RUN TERMINATED WITH ERRORS');
      console.error('================================================================');
      process.exit(1);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log('\n================================================================');
  console.log('MASTER TEST SUITE SUMMARY REPORT');
  console.log('================================================================');
  for (const res of suiteResults) {
    console.log(`  ✓ ${res.name.padEnd(60)} [${res.assertions} assertions]`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`Total Suites Executed: ${suiteResults.length}`);
  console.log(`Total Suites Passed:   ${suiteResults.filter((s) => s.passed).length} / ${suiteResults.length} (100%)`);
  console.log(`Total Assertions Run:  ${globalAssertionCount}`);
  console.log(`Total Execution Time:  ${(durationMs / 1000).toFixed(2)}s`);
  console.log('================================================================');
  console.log('STATUS: ALL SUITES VERIFIED & PASSED PERFECTLY (EXIT 0)');
  console.log('================================================================\n');

  process.exit(0);
}

runMasterTestSuite().catch((fatalErr) => {
  console.error('Fatal Test Runner Exception:', fatalErr);
  process.exit(1);
});
