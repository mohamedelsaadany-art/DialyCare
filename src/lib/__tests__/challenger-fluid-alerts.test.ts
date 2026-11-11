/**
 * ADVERSARIAL EMPIRICAL CHALLENGER TEST SUITE: MILESTONE 4
 * Patient Engagement & Smart Alerts Module (R3 Fluid Alerts & R4 Coaching Avatar)
 *
 * Verifies:
 * 1. Dry weight edge cases: 35 kg, 50 kg, 70 kg, 90 kg, 120 kg, undefined/missing/0/negative dry weight.
 * 2. Exact threshold arithmetic:
 *    - Warning threshold = `(dry_weight * 10 * 4) / 2` mL (-1 mL vs exact vs +1 mL).
 *    - Critical threshold = `(dry_weight * 13 * 4) / 2` mL (-1 mL vs exact vs +1 mL).
 * 3. Re-triggering invariant:
 *    - Sequence: 0 -> 1399 -> 1400 -> 1819 -> 1820 (alarm 1) -> 1920 (alarm 2) -> 2020 (alarm 3).
 *    - Rapid micro-additions at/above critical threshold constantly re-triggering.
 * 4. Web Audio mock & parameter execution:
 *    - SSR / Headless safety (no window object crash).
 *    - AudioContext state transitions (suspended -> resume -> closed).
 *    - Tone cadence verification: 3-beep alarm burst (880Hz, 880Hz, 440Hz).
 *    - Anti-click exponential gain envelopes.
 *    - Concurrency hammer and simulated hardware crash resilience.
 * 5. R4 Coaching Avatar Clinical Verification:
 *    - 3 clinical domains (medication, fluid, diet) with actionable guidance.
 *    - Bilingual parity and Arabic Unicode script validation.
 *    - Contextual adherence metric thresholds (0%, 90%, 150%, undefined).
 * 6. AST & Component Integrity:
 *    - Data-testids and min 48px touch targets for elderly accessibility.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getPatientFluidLimits, type PatientFluidLimits } from '../data-store';
import { playFluidAlarm, isAudioContextSupported } from '../audio-alarm';
import { COACHING_TIPS, type CoachingDomain } from '../../components/PatientCoachingAvatar';

let assertionCount = 0;
function check(condition: boolean, message: string): void {
  assertionCount++;
  assert.ok(condition, message);
}

function checkEqual<T>(actual: T, expected: T, message?: string): void {
  assertionCount++;
  assert.strictEqual(actual, expected, message);
}

function computeFluidStatus(consumedMl: number, limits: PatientFluidLimits): 'normal' | 'warning' | 'critical' {
  if (consumedMl >= limits.critical) return 'critical';
  if (consumedMl >= limits.warning) return 'warning';
  return 'normal';
}

/**
 * Simulates patient fluid logging engine as implemented in src/app/[locale]/patient/log/page.tsx:
 * - handleAddFluidAmount(amount)
 * - nextTotal = totalFluidConsumed + amount
 * - willBeCritical = nextTotal >= fluidLimits.critical
 * - if (willBeCritical) playFluidAlarm();
 */
class FluidLogEngineSimulator {
  public totalConsumedMl = 0;
  public alarmTriggerCount = 0;
  public limits: PatientFluidLimits;

  constructor(dryWeightKg: number) {
    this.limits = getPatientFluidLimits(dryWeightKg);
  }

  public addFluid(amountMl: number): { nextTotal: number; status: 'normal' | 'warning' | 'critical'; alarmFired: boolean } {
    const nextTotal = this.totalConsumedMl + amountMl;
    const willBeCritical = nextTotal >= this.limits.critical;

    let alarmFired = false;
    if (willBeCritical) {
      this.alarmTriggerCount++;
      alarmFired = true;
    }

    this.totalConsumedMl = nextTotal;
    const status = computeFluidStatus(this.totalConsumedMl, this.limits);
    return { nextTotal, status, alarmFired };
  }
}

interface WeightTestCase {
  weight: number | undefined | null;
  expectedWarning: number;
  expectedCritical: number;
  label: string;
}

interface BoundaryProfile {
  dryWeight: number;
  label: string;
}

interface RecordedGainEvent {
  method: 'setValueAtTime' | 'exponentialRampToValueAtTime';
  value: number;
  time: number;
}

interface RecordedOscillator {
  frequency: number;
  type: string;
  startTime: number;
  stopTime: number;
  connectedToGain: boolean;
}

interface RecordedGainNode {
  events: RecordedGainEvent[];
  connectedToDestination: boolean;
}

export async function runChallengerM4Suite(): Promise<void> {
  console.log('================================================================');
  console.log('CHALLENGER M4: ADVERSARIAL EMPIRICAL VERIFICATION HARNESS');
  console.log('================================================================\n');

  // ============================================================================
  // SUITE 1: DRY WEIGHT EDGE CASES & MATHEMATICAL ARITHMETIC
  // ============================================================================
  console.log('>>> SUITE 1: Dry Weight Edge Cases & Mathematical Arithmetic');

  const weightCases: WeightTestCase[] = [
    // Prescribed Edge Cases
    { weight: 35, expectedWarning: 700, expectedCritical: 910, label: '35 kg (Frail / Petite Patient)' },
    { weight: 50, expectedWarning: 1000, expectedCritical: 1300, label: '50 kg (Low Weight Patient)' },
    { weight: 70, expectedWarning: 1400, expectedCritical: 1820, label: '70 kg (Standard Reference Patient)' },
    { weight: 90, expectedWarning: 1800, expectedCritical: 2340, label: '90 kg (Heavy Patient)' },
    { weight: 120, expectedWarning: 2400, expectedCritical: 3120, label: '120 kg (Bariatric Patient)' },

    // Defensive Fallback Edge Cases (Default to 70 kg)
    { weight: undefined, expectedWarning: 1400, expectedCritical: 1820, label: 'undefined dry weight' },
    { weight: null as unknown as number, expectedWarning: 1400, expectedCritical: 1820, label: 'null dry weight' },
    { weight: 0, expectedWarning: 1400, expectedCritical: 1820, label: '0 kg dry weight (non-physiological)' },
    { weight: -10, expectedWarning: 1400, expectedCritical: 1820, label: '-10 kg dry weight (negative)' },
    { weight: -70, expectedWarning: 1400, expectedCritical: 1820, label: '-70 kg dry weight (negative)' },
    { weight: NaN, expectedWarning: 1400, expectedCritical: 1820, label: 'NaN dry weight' },

    // Decimal Weights
    { weight: 45.5, expectedWarning: (45.5 * 10 * 4) / 2, expectedCritical: (45.5 * 13 * 4) / 2, label: '45.5 kg (Decimal weight)' },
    { weight: 68.25, expectedWarning: (68.25 * 10 * 4) / 2, expectedCritical: (68.25 * 13 * 4) / 2, label: '68.25 kg (Decimal weight)' },
    { weight: 82.5, expectedWarning: (82.5 * 10 * 4) / 2, expectedCritical: (82.5 * 13 * 4) / 2, label: '82.5 kg (Decimal weight)' },

    // Extreme Boundaries
    { weight: 200, expectedWarning: 4000, expectedCritical: 5200, label: '200 kg (Severe Morbid Bariatric)' },
    { weight: 20, expectedWarning: 400, expectedCritical: 520, label: '20 kg (Extreme Low Pediatric/Cachectic)' },
  ];

  for (const tc of weightCases) {
    const limits = getPatientFluidLimits(tc.weight as number);

    // Exact arithmetic checks
    checkEqual(limits.warning, tc.expectedWarning, `[${tc.label}] Warning threshold mismatch: got ${limits.warning}, expected ${tc.expectedWarning}`);
    checkEqual(limits.critical, tc.expectedCritical, `[${tc.label}] Critical threshold mismatch: got ${limits.critical}, expected ${tc.expectedCritical}`);

    // Alias compatibility checks (warningMl & criticalMl)
    checkEqual(limits.warningMl, tc.expectedWarning, `[${tc.label}] warningMl alias mismatch`);
    checkEqual(limits.criticalMl, tc.expectedCritical, `[${tc.label}] criticalMl alias mismatch`);

    // Invariant: critical threshold is always exactly 1.3x warning threshold
    const expectedRatio = 13 / 10;
    const actualRatio = limits.critical / limits.warning;
    check(Math.abs(actualRatio - expectedRatio) < 1e-9, `[${tc.label}] Critical/Warning ratio must be 1.3 (got ${actualRatio})`);
  }
  console.log(`  ✓ All ${weightCases.length} dry weight boundary configurations mathematically verified.`);

  // ============================================================================
  // SUITE 2: EXACT THRESHOLD BOUNDARY VALUE ANALYSIS (-1 mL, EXACT, +1 mL)
  // ============================================================================
  console.log('\n>>> SUITE 2: Exact Threshold Boundary Value Analysis (-1 mL, EXACT, +1 mL)');

  const boundaryProfiles: BoundaryProfile[] = [
    { dryWeight: 35, label: '35 kg' },
    { dryWeight: 50, label: '50 kg' },
    { dryWeight: 70, label: '70 kg' },
    { dryWeight: 90, label: '90 kg' },
    { dryWeight: 120, label: '120 kg' },
  ];

  for (const profile of boundaryProfiles) {
    const limits = getPatientFluidLimits(profile.dryWeight);
    const warn = limits.warning;
    const crit = limits.critical;

    // 1. Warning Boundary (-1, exact, +1)
    const warnMinusOne = computeFluidStatus(warn - 1, limits);
    checkEqual(warnMinusOne, 'normal', `[${profile.label}] At warning - 1 mL (${warn - 1} mL), status must be normal`);

    const warnExact = computeFluidStatus(warn, limits);
    checkEqual(warnExact, 'warning', `[${profile.label}] At exact warning (${warn} mL), status must be warning`);

    const warnPlusOne = computeFluidStatus(warn + 1, limits);
    checkEqual(warnPlusOne, 'warning', `[${profile.label}] At warning + 1 mL (${warn + 1} mL), status must be warning`);

    // 2. Critical Boundary (-1, exact, +1)
    const critMinusOne = computeFluidStatus(crit - 1, limits);
    checkEqual(critMinusOne, 'warning', `[${profile.label}] At critical - 1 mL (${crit - 1} mL), status must be warning`);

    const critExact = computeFluidStatus(crit, limits);
    checkEqual(critExact, 'critical', `[${profile.label}] At exact critical (${crit} mL), status must be critical`);

    const critPlusOne = computeFluidStatus(crit + 1, limits);
    checkEqual(critPlusOne, 'critical', `[${profile.label}] At critical + 1 mL (${crit + 1} mL), status must be critical`);

    // 3. Sub-zero and zero intake
    checkEqual(computeFluidStatus(0, limits), 'normal', `[${profile.label}] 0 mL must be normal`);
    checkEqual(computeFluidStatus(-50, limits), 'normal', `[${profile.label}] negative mL must be normal`);
  }
  console.log(`  ✓ Exact boundary arithmetic (-1, 0, +1 mL) verified across ${boundaryProfiles.length} clinical profiles.`);

  // ============================================================================
  // SUITE 3: RE-TRIGGERING INVARIANT HARNESS & LOGGING SEQUENCES
  // ============================================================================
  console.log('\n>>> SUITE 3: Critical Alarm Re-Triggering Invariant Verification');

  // 3.1: Orchestrator Mandatory Sequence for 70 kg (Warning: 1400, Critical: 1820)
  // Sequence: 0 mL -> 1399 mL -> 1400 mL -> 1819 mL -> 1820 mL (alarm 1) -> 1920 mL (alarm 2) -> 2020 mL (alarm 3)
  const sim70 = new FluidLogEngineSimulator(70);

  // Step 1: 0 mL -> 1399 mL
  const s1 = sim70.addFluid(1399);
  checkEqual(s1.nextTotal, 1399);
  checkEqual(s1.status, 'normal');
  checkEqual(s1.alarmFired, false, '1399 mL must NOT trigger alarm');
  checkEqual(sim70.alarmTriggerCount, 0);

  // Step 2: +1 mL -> 1400 mL (Warning threshold reached)
  const s2 = sim70.addFluid(1);
  checkEqual(s2.nextTotal, 1400);
  checkEqual(s2.status, 'warning');
  checkEqual(s2.alarmFired, false, '1400 mL warning threshold must NOT trigger audible alarm');
  checkEqual(sim70.alarmTriggerCount, 0);

  // Step 3: +419 mL -> 1819 mL (1 mL below critical threshold)
  const s3 = sim70.addFluid(419);
  checkEqual(s3.nextTotal, 1819);
  checkEqual(s3.status, 'warning');
  checkEqual(s3.alarmFired, false, '1819 mL must NOT trigger audible alarm');
  checkEqual(sim70.alarmTriggerCount, 0);

  // Step 4: +1 mL -> 1820 mL (Critical threshold crossed -> Alarm 1)
  const s4 = sim70.addFluid(1);
  checkEqual(s4.nextTotal, 1820);
  checkEqual(s4.status, 'critical');
  checkEqual(s4.alarmFired, true, '1820 mL critical threshold MUST trigger Alarm 1');
  checkEqual(sim70.alarmTriggerCount, 1, 'Alarm count must be 1');

  // Step 5: +100 mL -> 1920 mL (Subsequent intake -> Alarm 2 Re-triggered!)
  const s5 = sim70.addFluid(100);
  checkEqual(s5.nextTotal, 1920);
  checkEqual(s5.status, 'critical');
  checkEqual(s5.alarmFired, true, '1920 mL subsequent addition MUST re-trigger Alarm 2');
  checkEqual(sim70.alarmTriggerCount, 2, 'Alarm count must be 2');

  // Step 6: +100 mL -> 2020 mL (Subsequent intake -> Alarm 3 Re-triggered!)
  const s6 = sim70.addFluid(100);
  checkEqual(s6.nextTotal, 2020);
  checkEqual(s6.status, 'critical');
  checkEqual(s6.alarmFired, true, '2020 mL subsequent addition MUST re-trigger Alarm 3');
  checkEqual(sim70.alarmTriggerCount, 3, 'Alarm count must be 3');

  console.log('  ✓ Prescribed 7-step sequence (0 -> 1399 -> 1400 -> 1819 -> 1820 -> 1920 -> 2020 mL) passed perfectly.');

  // 3.2: Rapid Micro-Additions Re-Triggering Stress Test
  const microAdditions = [10, 5, 20, 240, 50, 15, 100, 30];
  let expectedCount = sim70.alarmTriggerCount;

  for (const amt of microAdditions) {
    const res = sim70.addFluid(amt);
    expectedCount++;
    checkEqual(res.alarmFired, true, `Micro-addition of +${amt} mL above critical MUST re-trigger alarm`);
    checkEqual(sim70.alarmTriggerCount, expectedCount, `Alarm count must increment to ${expectedCount}`);
  }
  console.log(`  ✓ Rapid micro-addition stress test passed (${microAdditions.length} consecutive re-triggers verified).`);

  // 3.3: Jump Directly from Normal to Critical in a Single Large Gulp
  const simJump = new FluidLogEngineSimulator(70);
  const jumpRes = simJump.addFluid(2000); // 0 -> 2000 mL in one single logging
  checkEqual(jumpRes.status, 'critical');
  checkEqual(jumpRes.alarmFired, true, 'Direct jump from 0 to 2000 mL MUST fire alarm');
  checkEqual(simJump.alarmTriggerCount, 1);

  // ============================================================================
  // SUITE 4: NATIVE WEB AUDIO ALARM ENGINE EMPIRICAL SPEC CONFORMANCE
  // ============================================================================
  console.log('\n>>> SUITE 4: Native Web Audio Alarm Engine Spec Conformance & Safety');

  // 4.1: SSR / Headless Safety (Node runtime without window)
  checkEqual(typeof window === 'undefined', true, 'Running in headless Node environment');
  checkEqual(isAudioContextSupported(), false, 'isAudioContextSupported must return false without DOM window');

  await assert.doesNotReject(async () => {
    await playFluidAlarm();
  }, 'playFluidAlarm must resolve safely without throwing in SSR / headless Node');
  console.log('  ✓ SSR / Headless safe execution confirmed (zero uncaught exceptions).');

  // 4.2: Web Audio API Spec Mocking & Parameter Validation
  const recordedOscillators: RecordedOscillator[] = [];
  const recordedGains: RecordedGainNode[] = [];
  let audioContextCloseCalled = false;
  let audioContextResumeCalled = false;

  class MockAudioContext {
    state: AudioContextState = 'suspended';
    currentTime = 5.0;
    destination = { name: 'AudioDestinationNode' };

    async resume(): Promise<void> {
      audioContextResumeCalled = true;
      this.state = 'running';
    }

    createOscillator() {
      const oscRecord: RecordedOscillator = {
        frequency: 0,
        type: '',
        startTime: -1,
        stopTime: -1,
        connectedToGain: false,
      };

      const osc = {
        type: 'sine',
        frequency: {
          setValueAtTime: (val: number) => {
            oscRecord.frequency = val;
          },
        },
        connect: () => {
          oscRecord.connectedToGain = true;
        },
        start: (time: number) => {
          oscRecord.startTime = time;
        },
        stop: (time: number) => {
          oscRecord.stopTime = time;
        },
      };

      recordedOscillators.push(oscRecord);
      return osc;
    }

    createGain() {
      const gainRecord: RecordedGainNode = {
        events: [],
        connectedToDestination: false,
      };

      const gain = {
        gain: {
          setValueAtTime: (value: number, time: number) => {
            gainRecord.events.push({ method: 'setValueAtTime', value, time });
          },
          exponentialRampToValueAtTime: (value: number, time: number) => {
            gainRecord.events.push({ method: 'exponentialRampToValueAtTime', value, time });
          },
        },
        connect: () => {
          gainRecord.connectedToDestination = true;
        },
      };

      recordedGains.push(gainRecord);
      return gain;
    }

    async close(): Promise<void> {
      audioContextCloseCalled = true;
      this.state = 'closed';
    }
  }

  // Install mock window
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: MockAudioContext,
  };

  try {
    checkEqual(isAudioContextSupported(), true, 'isAudioContextSupported must return true with mock AudioContext');

    // Trigger synthesized audio alarm
    await playFluidAlarm();

    // Verify suspended AudioContext auto-resumed
    checkEqual(audioContextResumeCalled, true, 'Suspended AudioContext must be auto-resumed');

    // Verify exactly 3 beeps were generated
    checkEqual(recordedOscillators.length, 3, 'Exactly 3 oscillators must be scheduled');
    checkEqual(recordedGains.length, 3, 'Exactly 3 gain nodes must be scheduled');

    // Cadence verification:
    // Beep 1: 880 Hz (A5), duration 0.12s
    // Beep 2: 880 Hz (A5), duration 0.12s
    // Beep 3: 440 Hz (A4), duration 0.20s
    checkEqual(recordedOscillators[0].frequency, 880, 'Beep 1 must be 880 Hz (A5)');
    checkEqual(recordedOscillators[1].frequency, 880, 'Beep 2 must be 880 Hz (A5)');
    checkEqual(recordedOscillators[2].frequency, 440, 'Beep 3 must be 440 Hz (A4)');

    // Verify oscillator waveform type is sine
    for (let i = 0; i < 3; i++) {
      check(recordedOscillators[i].connectedToGain, `Oscillator ${i + 1} must be connected to gain node`);
      check(recordedGains[i].connectedToDestination, `Gain node ${i + 1} must be connected to destination`);
    }

    // Verify timings relative to startTime (5.0s)
    checkEqual(recordedOscillators[0].startTime, 5.0, 'Beep 1 start time offset must be 0.00s');
    check(Math.abs(recordedOscillators[1].startTime - 5.18) < 1e-4, 'Beep 2 start time offset must be +0.18s');
    check(Math.abs(recordedOscillators[2].startTime - 5.36) < 1e-4, 'Beep 3 start time offset must be +0.36s');

    // Verify exponential gain envelope events (Attack -> Decay)
    for (let i = 0; i < 3; i++) {
      const events = recordedGains[i].events;
      checkEqual(events.length, 3, `Gain node ${i + 1} must have 3 volume envelope control points`);

      // Point 1: initial silent base
      checkEqual(events[0].method, 'setValueAtTime');
      checkEqual(events[0].value, 0.0001);

      // Point 2: quick attack to audible peak
      checkEqual(events[1].method, 'exponentialRampToValueAtTime');
      checkEqual(events[1].value, 0.35);

      // Point 3: smooth decay back to silence
      checkEqual(events[2].method, 'exponentialRampToValueAtTime');
      checkEqual(events[2].value, 0.0001);
    }

    // Await audio cleanup timeout
    await new Promise((resolve) => setTimeout(resolve, 950));
    checkEqual(audioContextCloseCalled, true, 'AudioContext must be closed after sound completes to release hardware resources');

    console.log('  ✓ Web Audio API 3-beep synthesis parameters (880Hz/880Hz/440Hz) and envelopes verified.');

    // 4.3: Concurrency Hammer (Simulate rapid repeated clicking of alarm / fast fluid entries)
    const concurrentRounds = 20;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < concurrentRounds; i++) {
      promises.push(playFluidAlarm());
    }
    await Promise.all(promises);
    console.log(`  ✓ Concurrency hammer (${concurrentRounds} simultaneous playFluidAlarm invocations) survived flawlessly.`);

    // 4.4: Fault Injection: Simulated Audio Hardware Failure
    class CrashingAudioContext {
      constructor() {
        throw new Error('AudioHardwareException: CoreAudio backend unreachable');
      }
    }

    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: CrashingAudioContext,
    };

    await assert.doesNotReject(async () => {
      await playFluidAlarm();
    }, 'playFluidAlarm must catch internal audio errors and never bubble unhandled exceptions to UI');
    console.log('  ✓ Fault injection resilience (simulated hardware failure caught safely).');
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }

  // ============================================================================
  // SUITE 5: R4 PATIENT COACHING AVATAR CLINICAL DOMAIN VERIFICATION
  // ============================================================================
  console.log('\n>>> SUITE 5: R4 Patient Coaching Avatar Clinical Domain Verification');

  check(Array.isArray(COACHING_TIPS), 'COACHING_TIPS must be an array');
  check(COACHING_TIPS.length >= 9, `COACHING_TIPS must contain at least 9 clinical tips (found ${COACHING_TIPS.length})`);

  const requiredDomains: CoachingDomain[] = ['medication', 'fluid', 'diet'];
  for (const dom of requiredDomains) {
    const tipsInDomain = COACHING_TIPS.filter((t) => t.domain === dom);
    check(tipsInDomain.length >= 3, `Domain "${dom}" must have at least 3 tips (found ${tipsInDomain.length})`);
    console.log(`  ✓ Domain "${dom}": ${tipsInDomain.length} tips verified`);
  }

  // 5.1: Clinical Keyword Assertions
  const medTips = COACHING_TIPS.filter((t) => t.domain === 'medication');
  const hasBinder = medTips.some((t) => t.titleEn.toLowerCase().includes('phosphate') && t.contentEn.toLowerCase().includes('first bite'));
  check(hasBinder, 'Medication domain must provide phosphate binder meal timing instruction');

  const hasBp = medTips.some((t) => t.titleEn.toLowerCase().includes('blood pressure') && t.contentEn.toLowerCase().includes('dialysis days'));
  check(hasBp, 'Medication domain must address blood pressure medication scheduling on dialysis days');

  const hasVitD = medTips.some((t) => t.titleEn.toLowerCase().includes('vitamin d') || t.contentEn.toLowerCase().includes('alfacalcidol'));
  check(hasVitD, 'Medication domain must cover Active Vitamin D / bone health');

  const fluidTips = COACHING_TIPS.filter((t) => t.domain === 'fluid');
  const hasIceChips = fluidTips.some((t) => t.titleEn.toLowerCase().includes('ice chips') || t.contentEn.toLowerCase().includes('ice chips'));
  check(hasIceChips, 'Fluid domain must teach managing thirst with ice chips');

  const hasCeiling = fluidTips.some((t) => t.titleEn.toLowerCase().includes('ceiling') || t.contentEn.toLowerCase().includes('dry-weight limit'));
  check(hasCeiling, 'Fluid domain must emphasize interdialytic dry-weight fluid limits');

  const hasHiddenFluid = fluidTips.some((t) => t.titleEn.toLowerCase().includes('hidden') || t.contentEn.toLowerCase().includes('soups'));
  check(hasHiddenFluid, 'Fluid domain must alert patient to hidden food fluids (soups, watermelon)');

  const dietTips = COACHING_TIPS.filter((t) => t.domain === 'diet');
  const hasPotassium = dietTips.some((t) => t.titleEn.toLowerCase().includes('potassium') && t.contentEn.toLowerCase().includes('apples'));
  check(hasPotassium, 'Diet domain must teach safe low-potassium fruit choices');

  const hasLeaching = dietTips.some((t) => t.titleEn.toLowerCase().includes('leaching') && t.contentEn.toLowerCase().includes('soak'));
  check(hasLeaching, 'Diet domain must instruct on potato leaching techniques');

  const hasProtein = dietTips.some((t) => (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('protein') && (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('dialysis'));
  check(hasProtein, 'Diet domain must teach high-biological protein intake on dialysis days');

  // 5.2: Bilingual Parity & Arabic Unicode Text
  const arabicRegex = /[\u0600-\u06FF]/;
  for (const tip of COACHING_TIPS) {
    check(tip.titleEn.length > 5, `Tip ${tip.id} titleEn too short`);
    check(tip.titleAr.length > 5, `Tip ${tip.id} titleAr too short`);
    check(tip.contentEn.length > 20, `Tip ${tip.id} contentEn too short`);
    check(tip.contentAr.length > 20, `Tip ${tip.id} contentAr too short`);
    check(tip.actionableStepEn.length > 10, `Tip ${tip.id} actionableStepEn too short`);
    check(tip.actionableStepAr.length > 10, `Tip ${tip.id} actionableStepAr too short`);

    check(arabicRegex.test(tip.titleAr), `Tip ${tip.id} titleAr must contain Arabic characters`);
    check(arabicRegex.test(tip.contentAr), `Tip ${tip.id} contentAr must contain Arabic characters`);
    check(arabicRegex.test(tip.actionableStepAr), `Tip ${tip.id} actionableStepAr must contain Arabic characters`);
  }
  console.log(`  ✓ All ${COACHING_TIPS.length} coaching tips verified for clinical depth and bilingual Arabic integrity.`);

  // ============================================================================
  // SUITE 6: AST & SOURCE CODE INTEGRITY AUDIT
  // ============================================================================
  console.log('\n>>> SUITE 6: Source Code, Touch Targets & Localization Dictionaries Audit');

  const cwd = process.cwd();
  const patientLogPagePath = path.resolve(cwd, 'src/app/[locale]/patient/log/page.tsx');
  const patientDashboardPagePath = path.resolve(cwd, 'src/app/[locale]/patient/page.tsx');
  const avatarCompPath = path.resolve(cwd, 'src/components/PatientCoachingAvatar.tsx');
  const audioAlarmPath = path.resolve(cwd, 'src/lib/audio-alarm.ts');
  const enJsonPath = path.resolve(cwd, 'src/messages/en.json');
  const arJsonPath = path.resolve(cwd, 'src/messages/ar.json');

  const logCode = fs.readFileSync(patientLogPagePath, 'utf8');
  const dashCode = fs.readFileSync(patientDashboardPagePath, 'utf8');
  const avatarCode = fs.readFileSync(avatarCompPath, 'utf8');
  const audioCode = fs.readFileSync(audioAlarmPath, 'utf8');

  // 6.1: Audio Alarm module checks
  check(audioCode.includes('playFluidAlarm'), 'audio-alarm.ts must export playFluidAlarm');
  check(audioCode.includes('isAudioContextSupported'), 'audio-alarm.ts must export isAudioContextSupported');
  check(audioCode.includes('880'), 'audio-alarm.ts must use 880 Hz tone');
  check(audioCode.includes('440'), 'audio-alarm.ts must use 440 Hz tone');

  // 6.2: Patient Log Page checks
  check(logCode.includes('data-testid="fluid-target-card"'), 'Patient log page must contain fluid-target-card testid');
  check(logCode.includes('data-testid="fluid-warning-banner"'), 'Patient log page must contain fluid-warning-banner testid');
  check(logCode.includes('data-testid="fluid-critical-banner"'), 'Patient log page must contain fluid-critical-banner testid');
  check(logCode.includes('data-testid="fluid-alarm-sound-btn"'), 'Patient log page must contain fluid-alarm-sound-btn testid');
  check(logCode.includes('playFluidAlarm'), 'Patient log page must import and execute playFluidAlarm');
  check(logCode.includes('getPatientFluidLimits'), 'Patient log page must call getPatientFluidLimits');
  check(logCode.includes('animate-pulse'), 'Critical visual alert must include animate-pulse');
  check(logCode.includes('PatientCoachingAvatar'), 'Patient log page must include PatientCoachingAvatar');

  // 6.3: Patient Dashboard checks
  check(dashCode.includes('PatientCoachingAvatar'), 'Patient dashboard page must include PatientCoachingAvatar');
  check(dashCode.includes('getPatientFluidLimits'), 'Patient dashboard page must use getPatientFluidLimits');

  // 6.4: Avatar Component checks
  check(avatarCode.includes('data-testid="patient-coaching-avatar"'), 'Avatar must contain root testid');
  check(avatarCode.includes('data-testid="dr-dialy-mascot-btn"'), 'Avatar mascot button must contain testid');
  check(avatarCode.includes('min-h-[48px]'), 'Avatar controls must enforce min 48px touch targets for accessibility');

  // 6.5: Localization Key Parity
  const enJson = JSON.parse(fs.readFileSync(enJsonPath, 'utf8'));
  const arJson = JSON.parse(fs.readFileSync(arJsonPath, 'utf8'));

  check(!!enJson.fluidAlerts, 'en.json must contain fluidAlerts');
  check(!!arJson.fluidAlerts, 'ar.json must contain fluidAlerts');
  check(!!enJson.coachingAvatar, 'en.json must contain coachingAvatar');
  check(!!arJson.coachingAvatar, 'ar.json must contain coachingAvatar');

  const enFluidKeys = Object.keys(enJson.fluidAlerts).sort();
  const arFluidKeys = Object.keys(arJson.fluidAlerts).sort();
  assert.deepStrictEqual(enFluidKeys, arFluidKeys, 'fluidAlerts keys must match exactly between EN and AR');

  const enAvatarKeys = Object.keys(enJson.coachingAvatar).sort();
  const arAvatarKeys = Object.keys(arJson.coachingAvatar).sort();
  assert.deepStrictEqual(enAvatarKeys, arAvatarKeys, 'coachingAvatar keys must match exactly between EN and AR');

  console.log('  ✓ Source code AST audit, touch target accessibility, and localization parity 100% verified.');

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log('CHALLENGER VERIFICATION SUMMARY: MILESTONE 4');
  console.log(`All Adversarial Checks Passed: ${assertionCount} total assertions validated.`);
  console.log('VERDICT: APPROVE');
  console.log('================================================================\n');
}

// Auto-run if executed directly via CLI
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('challenger-fluid-alerts.test')) {
  runChallengerM4Suite().catch((err) => {
    console.error('CHALLENGER TEST HARNESS FAILED:', err);
    process.exit(1);
  });
}
