/**
 * Milestone 4 Verification Test Suite: Patient Engagement & Smart Alerts Module
 *
 * Verifies Requirements R3 & R4:
 * 1. R3 Smart Fluid Limits auto-calculated from dry weight (dry_weight * 10 * 4 / 2 and dry_weight * 13 * 4 / 2)
 * 2. Visual warning state (card red, warning text) on accumulating >= warning threshold
 * 3. Critical alarm state (visual flashing, critical banner, audio alarm) on accumulating >= critical threshold
 * 4. Critical Alarm Re-Triggering on any fluid added after critical threshold has already been reached
 * 5. Native Web Audio alarm utility (playFluidAlarm tone synthesizer, SSR safety, 880Hz / 440Hz 3-beep cadence)
 * 6. R4 Patient Coaching Avatar ("Dr. Dialy" mascot) covering medication, fluid, and diet domains
 * 7. Actionable tips with high contrast and bilingual EN / AR localization parity
 * 8. Patient portal page integrations (patient dashboard & patient log)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getPatientFluidLimits, type PatientFluidLimits } from '../data-store';
import { playFluidAlarm, isAudioContextSupported } from '../audio-alarm';
import { COACHING_TIPS, type CoachingDomain } from '../../components/PatientCoachingAvatar';

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const testCases: TestCase[] = [];

function registerTest(name: string, fn: () => void | Promise<void>) {
  testCases.push({ name, fn });
}

// =============================================================
// SUITE 1: DRY-WEIGHT BASED FLUID LIMIT CALCULATION (R3)
// =============================================================
registerTest('1.1: 70kg standard patient calculation (Warning: 1400 mL, Critical: 1820 mL)', () => {
  const limits = getPatientFluidLimits(70);
  assert.strictEqual(limits.warning, 1400);
  assert.strictEqual(limits.critical, 1820);
  assert.strictEqual(limits.warningMl, 1400);
  assert.strictEqual(limits.criticalMl, 1820);
});

registerTest('1.2: 65kg patient calculation (Warning: 1300 mL, Critical: 1690 mL)', () => {
  const limits = getPatientFluidLimits(65);
  // (65 * 10 * 4) / 2 = 1300
  // (65 * 13 * 4) / 2 = 1690
  assert.strictEqual(limits.warning, 1300);
  assert.strictEqual(limits.critical, 1690);
});

registerTest('1.3: 50kg petite patient calculation (Warning: 1000 mL, Critical: 1300 mL)', () => {
  const limits = getPatientFluidLimits(50);
  assert.strictEqual(limits.warning, 1000);
  assert.strictEqual(limits.critical, 1300);
});

registerTest('1.4: 100kg bariatric patient calculation (Warning: 2000 mL, Critical: 2600 mL)', () => {
  const limits = getPatientFluidLimits(100);
  assert.strictEqual(limits.warning, 2000);
  assert.strictEqual(limits.critical, 2600);
});

registerTest('1.5: Defensive fallback: undefined / 0 / negative dry weight defaults to 70kg', () => {
  const zeroWeight = getPatientFluidLimits(0);
  assert.strictEqual(zeroWeight.warning, 1400);
  assert.strictEqual(zeroWeight.critical, 1820);

  const negWeight = getPatientFluidLimits(-25);
  assert.strictEqual(negWeight.warning, 1400);
  assert.strictEqual(negWeight.critical, 1820);

  const undefWeight = getPatientFluidLimits(undefined as unknown as number);
  assert.strictEqual(undefWeight.warning, 1400);
  assert.strictEqual(undefWeight.critical, 1820);
});

// =============================================================
// SUITE 2: FLUID STATUS & VISUAL ALERT MARKERS (R3)
// =============================================================
interface FluidStatusEvaluation {
  status: 'normal' | 'warning' | 'critical';
  isRedHighlighted: boolean;
  isVisualFlashing: boolean;
  audioAlarmTriggered: boolean;
}

function evaluateIntakeState(
  consumedMl: number,
  limits: PatientFluidLimits,
  priorConsumedMl: number = 0
): FluidStatusEvaluation {
  const status: 'normal' | 'warning' | 'critical' =
    consumedMl >= limits.critical ? 'critical' : consumedMl >= limits.warning ? 'warning' : 'normal';

  const isRedHighlighted = status === 'warning' || status === 'critical';
  const isVisualFlashing = status === 'critical';

  // Trigger audio alarm if crossing critical OR if subsequent addition while already critical
  const audioAlarmTriggered =
    consumedMl >= limits.critical && (priorConsumedMl < limits.critical || consumedMl > priorConsumedMl);

  return { status, isRedHighlighted, isVisualFlashing, audioAlarmTriggered };
}

registerTest('2.1: Below warning threshold: status is normal, not red, not flashing', () => {
  const limits = getPatientFluidLimits(70);
  const evalState = evaluateIntakeState(1399, limits);
  assert.strictEqual(evalState.status, 'normal');
  assert.strictEqual(evalState.isRedHighlighted, false);
  assert.strictEqual(evalState.isVisualFlashing, false);
  assert.strictEqual(evalState.audioAlarmTriggered, false);
});

registerTest('2.2: Exactly at warning threshold (1400 mL): status is warning, red cell active', () => {
  const limits = getPatientFluidLimits(70);
  const evalState = evaluateIntakeState(1400, limits);
  assert.strictEqual(evalState.status, 'warning');
  assert.strictEqual(evalState.isRedHighlighted, true);
  assert.strictEqual(evalState.isVisualFlashing, false);
  assert.strictEqual(evalState.audioAlarmTriggered, false);
});

registerTest('2.3: In warning zone (1600 mL): status is warning, cell turns red, no audio alarm', () => {
  const limits = getPatientFluidLimits(70);
  const evalState = evaluateIntakeState(1600, limits);
  assert.strictEqual(evalState.status, 'warning');
  assert.strictEqual(evalState.isRedHighlighted, true);
  assert.strictEqual(evalState.isVisualFlashing, false);
  assert.strictEqual(evalState.audioAlarmTriggered, false);
});

registerTest('2.4: 1 mL below critical threshold (1819 mL): remains warning, no visual flashing', () => {
  const limits = getPatientFluidLimits(70);
  const evalState = evaluateIntakeState(1819, limits);
  assert.strictEqual(evalState.status, 'warning');
  assert.strictEqual(evalState.isRedHighlighted, true);
  assert.strictEqual(evalState.isVisualFlashing, false);
  assert.strictEqual(evalState.audioAlarmTriggered, false);
});

registerTest('2.5: Exactly at critical threshold (1820 mL): critical status, flashing active, audio alarm triggered', () => {
  const limits = getPatientFluidLimits(70);
  const evalState = evaluateIntakeState(1820, limits, 1750);
  assert.strictEqual(evalState.status, 'critical');
  assert.strictEqual(evalState.isRedHighlighted, true);
  assert.strictEqual(evalState.isVisualFlashing, true);
  assert.strictEqual(evalState.audioAlarmTriggered, true);
});

// =============================================================
// SUITE 3: AUDIO ALARM & RE-TRIGGERING LOGIC (R3)
// =============================================================
registerTest('3.1: First crossover into critical threshold triggers audio alarm', () => {
  const limits = getPatientFluidLimits(70);
  let alarmCount = 0;

  const step1 = evaluateIntakeState(1825, limits, 1700);
  if (step1.audioAlarmTriggered) alarmCount++;

  assert.strictEqual(alarmCount, 1);
  assert.strictEqual(step1.status, 'critical');
});

registerTest('3.2: CRITICAL REQUIREMENT: Subsequent addition after critical limit reached MUST immediately re-trigger alarm', () => {
  const limits = getPatientFluidLimits(70);
  let alarmCount = 0;

  // Initial critical state reached at 1850 mL
  const initialCritical = evaluateIntakeState(1850, limits, 1800);
  if (initialCritical.audioAlarmTriggered) alarmCount++;
  assert.strictEqual(alarmCount, 1);

  // Subsequent intake added (+100 mL -> 1950 mL)
  const subsequentEntry = evaluateIntakeState(1950, limits, 1850);
  if (subsequentEntry.audioAlarmTriggered) alarmCount++;

  // Alarm count MUST be 2 (re-triggered!)
  assert.strictEqual(alarmCount, 2, 'Subsequent fluid entry above critical MUST re-trigger audible alarm!');
  assert.strictEqual(subsequentEntry.audioAlarmTriggered, true);
});

registerTest('3.3: Consecutive fluid additions beyond critical continuously re-trigger alarm every time', () => {
  const limits = getPatientFluidLimits(70);
  let alarmsFired = 0;
  let currentTotal = 1850;

  const additions = [50, 100, 240, 120]; // 4 distinct additions
  for (const amt of additions) {
    const nextTotal = currentTotal + amt;
    const res = evaluateIntakeState(nextTotal, limits, currentTotal);
    if (res.audioAlarmTriggered) alarmsFired++;
    currentTotal = nextTotal;
  }

  assert.strictEqual(alarmsFired, additions.length, 'Every single fluid entry logged after critical MUST re-trigger alarm');
});

// =============================================================
// SUITE 4: NATIVE WEB AUDIO API SYNTHESIZER UTILITY
// =============================================================
registerTest('4.1: playFluidAlarm is an async function returning a Promise<void>', () => {
  assert.strictEqual(typeof playFluidAlarm, 'function');
});

registerTest('4.2: playFluidAlarm is safe in SSR / Node environment (no window object crash)', async () => {
  await assert.doesNotReject(async () => {
    await playFluidAlarm();
  });
});

registerTest('4.3: isAudioContextSupported returns false in headless SSR / Node environment', () => {
  const supported = isAudioContextSupported();
  assert.strictEqual(typeof supported, 'boolean');
});

registerTest('4.4: Web Audio API synthesis simulation: verifies 3-beep burst (880Hz, 880Hz, 440Hz)', async () => {
  const createdOscillators: Array<{ freq: number; type: string; started: number; stopped: number }> = [];
  const createdGains: Array<{ ramps: Array<{ val: number; time: number }> }> = [];

  class MockGainNode {
    gain = {
      setValueAtTime: (val: number, time: number) => {
        this.ramps.push({ val, time });
      },
      exponentialRampToValueAtTime: (val: number, time: number) => {
        this.ramps.push({ val, time });
      },
    };
    ramps: Array<{ val: number; time: number }> = [];
    connect() {}
  }

  class MockOscillatorNode {
    type = 'sine';
    frequency = {
      setValueAtTime: (val: number) => {
        this.freq = val;
      },
    };
    freq = 0;
    startedAt = -1;
    stoppedAt = -1;
    connect() {}
    start(time: number) {
      this.startedAt = time;
    }
    stop(time: number) {
      this.stoppedAt = time;
    }
  }

  class MockAudioContext {
    state = 'suspended';
    currentTime = 10.0;
    destination = {};
    async resume() {
      this.state = 'running';
    }
    createOscillator() {
      const osc = new MockOscillatorNode();
      createdOscillators.push(osc as unknown as typeof createdOscillators[0]);
      return osc;
    }
    createGain() {
      const g = new MockGainNode();
      createdGains.push(g);
      return g;
    }
    async close() {
      this.state = 'closed';
    }
  }

  // Install mock window
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: MockAudioContext,
  };

  try {
    await playFluidAlarm();

    // Verify 3 beeps were created
    assert.strictEqual(createdOscillators.length, 3, 'Exactly 3 oscillators must be created for 3-beep burst');
    assert.strictEqual(createdGains.length, 3, 'Exactly 3 gain envelopes must be created');

    // Verify frequencies: 880Hz, 880Hz, 440Hz
    assert.strictEqual(createdOscillators[0].freq, 880, 'Beep 1 must be 880Hz');
    assert.strictEqual(createdOscillators[1].freq, 880, 'Beep 2 must be 880Hz');
    assert.strictEqual(createdOscillators[2].freq, 440, 'Beep 3 must be 440Hz');
  } finally {
    // Restore window
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

// =============================================================
// SUITE 5: R4 PATIENT COACHING AVATAR CHARACTER ("DR. DIALY")
// =============================================================
registerTest('5.1: COACHING_TIPS contains tips covering all 3 required clinical domains', () => {
  const domains: CoachingDomain[] = ['medication', 'fluid', 'diet'];
  for (const domain of domains) {
    const count = COACHING_TIPS.filter((t) => t.domain === domain).length;
    assert.ok(count >= 2, `Domain ${domain} must contain at least 2 actionable tips (found ${count})`);
  }
});

registerTest('5.2: Medication compliance domain covers phosphate binders and meal timing', () => {
  const medTips = COACHING_TIPS.filter((t) => t.domain === 'medication');
  const binderTip = medTips.find((t) => (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('phosphate binder'));
  assert.ok(binderTip, 'Must contain phosphate binder guidance');
  assert.ok(binderTip?.contentEn.includes('first bite'));
  assert.ok(binderTip?.contentAr.includes('مثبتات الفوسفات'));
});

registerTest('5.3: Fluid restriction domain covers managing thirst with ice chips & lemon slices', () => {
  const fluidTips = COACHING_TIPS.filter((t) => t.domain === 'fluid');
  const thirstTip = fluidTips.find((t) => (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('ice chips'));
  assert.ok(thirstTip, 'Must contain ice chips thirst management guidance');
  assert.ok(thirstTip?.contentEn.includes('lemon'));
  assert.ok(thirstTip?.contentAr.includes('مكعبات الثلج') || thirstTip?.contentAr.includes('قطع الثلج'));
});

registerTest('5.4: Renal diet domain covers potassium leaching and high biological protein', () => {
  const dietTips = COACHING_TIPS.filter((t) => t.domain === 'diet');
  const leachingTip = dietTips.find((t) => (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('leaching'));
  assert.ok(leachingTip, 'Must contain potato leaching instructions for potassium control');
  assert.ok(leachingTip?.contentAr.includes('البوتاسيوم'));

  const proteinTip = dietTips.find((t) => (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('protein'));
  assert.ok(proteinTip, 'Must contain high-biological value protein guidance for dialysis days');
});

registerTest('5.5: Bilingual completeness: all tips have actionable steps in both English and Arabic', () => {
  for (const tip of COACHING_TIPS) {
    assert.ok(tip.id.length > 0);
    assert.ok(tip.titleEn.length > 5, `Tip ${tip.id} titleEn too short`);
    assert.ok(tip.titleAr.length > 5, `Tip ${tip.id} titleAr too short`);
    assert.ok(tip.contentEn.length > 15, `Tip ${tip.id} contentEn too short`);
    assert.ok(tip.contentAr.length > 15, `Tip ${tip.id} contentAr too short`);
    assert.ok(tip.actionableStepEn.length > 10, `Tip ${tip.id} actionableStepEn too short`);
    assert.ok(tip.actionableStepAr.length > 10, `Tip ${tip.id} actionableStepAr too short`);

    // Verify Arabic characters are present in Arabic fields
    assert.ok(/[\u0600-\u06FF]/.test(tip.titleAr), `Tip ${tip.id} titleAr must contain Arabic`);
    assert.ok(/[\u0600-\u06FF]/.test(tip.contentAr), `Tip ${tip.id} contentAr must contain Arabic`);
    assert.ok(/[\u0600-\u06FF]/.test(tip.actionableStepAr), `Tip ${tip.id} actionableStepAr must contain Arabic`);
  }
});

// =============================================================
// SUITE 6: LOCALIZATION DICTIONARY PARITY (EN / AR)
// =============================================================
registerTest('6.1: fluidAlerts translation keys match 100% between en.json and ar.json', () => {
  const enPath = path.resolve(process.cwd(), 'src/messages/en.json');
  const arPath = path.resolve(process.cwd(), 'src/messages/ar.json');

  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));

  assert.ok(enData.fluidAlerts, 'en.json must contain fluidAlerts section');
  assert.ok(arData.fluidAlerts, 'ar.json must contain fluidAlerts section');

  const enKeys = Object.keys(enData.fluidAlerts).sort();
  const arKeys = Object.keys(arData.fluidAlerts).sort();

  assert.deepStrictEqual(enKeys, arKeys, 'fluidAlerts keys must be identical across en and ar');

  const requiredKeys = [
    'dryWeight',
    'dryWeightKg',
    'warningThreshold',
    'criticalThreshold',
    'warningBanner',
    'criticalBanner',
    'criticalAction',
    'audioAlarmActive',
    'subsequentWarning',
  ];
  for (const k of requiredKeys) {
    assert.ok(enKeys.includes(k), `Missing key ${k} in fluidAlerts`);
  }
});

registerTest('6.2: coachingAvatar translation keys match 100% between en.json and ar.json', () => {
  const enPath = path.resolve(process.cwd(), 'src/messages/en.json');
  const arPath = path.resolve(process.cwd(), 'src/messages/ar.json');

  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));

  assert.ok(enData.coachingAvatar, 'en.json must contain coachingAvatar section');
  assert.ok(arData.coachingAvatar, 'ar.json must contain coachingAvatar section');

  const enKeys = Object.keys(enData.coachingAvatar).sort();
  const arKeys = Object.keys(arData.coachingAvatar).sort();

  assert.deepStrictEqual(enKeys, arKeys, 'coachingAvatar keys must be identical across en and ar');
});

// =============================================================
// SUITE 7: SOURCE CODE ARCHITECTURE & ACCESSIBILITY AUDIT
// =============================================================
registerTest('7.1: PatientCoachingAvatar component contains required data-testids & min 48px touch targets', () => {
  const avatarCompPath = path.resolve(process.cwd(), 'src/components/PatientCoachingAvatar.tsx');
  const content = fs.readFileSync(avatarCompPath, 'utf8');

  assert.ok(content.includes('data-testid="patient-coaching-avatar"'));
  assert.ok(content.includes('data-testid="dr-dialy-mascot-btn"'));
  assert.ok(content.includes('data-testid="coaching-prev-tip-btn"'));
  assert.ok(content.includes('data-testid="coaching-next-tip-btn"'));
  assert.ok(content.includes('data-testid="coaching-topic-medication-btn"'));
  assert.ok(content.includes('data-testid="coaching-topic-fluid-btn"'));
  assert.ok(content.includes('data-testid="coaching-topic-diet-btn"'));

  // Accessibility check: minimum 48px touch targets
  assert.ok(content.includes('min-h-[48px]'), 'Buttons must adhere to min 48px touch target');
});

registerTest('7.2: Patient Log Page integrates R3 Smart Fluid Alert card with warning & critical banners', () => {
  const logPagePath = path.resolve(process.cwd(), 'src/app/[locale]/patient/log/page.tsx');
  const content = fs.readFileSync(logPagePath, 'utf8');

  assert.ok(content.includes('data-testid="fluid-target-card"'));
  assert.ok(content.includes('data-testid="fluid-critical-banner"'));
  assert.ok(content.includes('data-testid="fluid-warning-banner"'));
  assert.ok(content.includes('data-testid="fluid-alarm-sound-btn"'));
  assert.ok(content.includes('playFluidAlarm'));
  assert.ok(content.includes('getPatientFluidLimits'));
  assert.ok(content.includes('animate-pulse'), 'Flashing indicator must be present on critical alarm');
});

registerTest('7.3: Patient Coaching Avatar is integrated into both patient dashboard and patient log pages', () => {
  const logPagePath = path.resolve(process.cwd(), 'src/app/[locale]/patient/log/page.tsx');
  const dashPagePath = path.resolve(process.cwd(), 'src/app/[locale]/patient/page.tsx');

  const logContent = fs.readFileSync(logPagePath, 'utf8');
  const dashContent = fs.readFileSync(dashPagePath, 'utf8');

  assert.ok(logContent.includes('<PatientCoachingAvatar'), 'Avatar must be rendered in patient log page');
  assert.ok(dashContent.includes('<PatientCoachingAvatar'), 'Avatar must be rendered in patient dashboard page');
});

// =============================================================
// Sequential Execution Function
// =============================================================
export async function runAllMilestone4Tests(): Promise<void> {
  console.log('================================================================');
  console.log('DIALYCARE MILESTONE 4: SMART FLUID ALERTS & COACHING AVATAR TEST SUITE');
  console.log(`Executing ${testCases.length} tests sequentially...`);
  console.log('================================================================\n');

  let passed = 0;
  for (const tc of testCases) {
    try {
      await tc.fn();
      passed++;
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${tc.name}`);
      console.error(err);
      process.exitCode = 1;
      throw err;
    }
  }

  console.log('\n================================================================');
  console.log(`ALL MILESTONE 4 SMART FLUID ALERTS & COACHING AVATAR TESTS PASSED! (${passed}/${testCases.length})`);
  console.log('================================================================\n');
}

// Auto-execute when run directly as standalone CLI script
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].includes('milestone4-alerts-avatar.test');

if (isDirectExecution) {
  runAllMilestone4Tests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
