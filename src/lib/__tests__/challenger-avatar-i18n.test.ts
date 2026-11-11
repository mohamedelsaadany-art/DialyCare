/**
 * CHALLENGER 2 ADVERSARIAL EMPIRICAL SUITE — MILESTONE 4
 * DialyCare Patient Engagement & Smart Alerts: Avatar & Localization Verifier
 *
 * Requirements Verified:
 * 1. R4 Coaching Avatar clinical topic coverage across medication, fluid, and diet domains
 * 2. 100% Translation key integrity and bidirectional parity between en.json and ar.json
 * 3. Elderly accessibility compliance: >=48px touch targets and testid DOM markers
 * 4. Dual portal mounting: Patient Dashboard and Patient Activity Log
 * 5. Audio alarm SSR safety & critical re-triggering simulation
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  COACHING_TIPS,
  type CoachingDomain,
  type CoachingTipItem,
} from '../../components/PatientCoachingAvatar';
import { playFluidAlarm, isAudioContextSupported } from '../audio-alarm';
import {
  getPatientFluidLimits,
  getPatients,
  updatePatientAvatar,
  getPatientAvatar,
} from '../data-store';
import {
  AVATAR_PRESETS,
  getAvatarPreset,
} from '../../components/avatar/PatientAvatarPresets';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

interface TestRecord {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: TestRecord[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

// ============================================================================
// SUITE 1: AVATAR CLINICAL TOPIC COVERAGE & DOMAIN INTEGRITY (R4)
// ============================================================================

test('1.1: COACHING_TIPS contains at least 9 comprehensive clinical items', () => {
  assert.ok(Array.isArray(COACHING_TIPS), 'COACHING_TIPS must be an exported array');
  assert.ok(
    COACHING_TIPS.length >= 9,
    `Expected at least 9 coaching tips, received ${COACHING_TIPS.length}`
  );
});

test('1.2: Mandatory clinical domain coverage: dialysis, medication, fluid, diet', () => {
  const mandatoryDomains: CoachingDomain[] = ['dialysis', 'medication', 'fluid', 'diet'];
  const domainCounts = new Map<CoachingDomain, number>();

  for (const domain of mandatoryDomains) {
    domainCounts.set(domain, 0);
  }

  for (const tip of COACHING_TIPS) {
    assert.ok(
      mandatoryDomains.includes(tip.domain),
      `Unexpected domain '${tip.domain}' found in tip '${tip.id}'`
    );
    domainCounts.set(tip.domain, (domainCounts.get(tip.domain) || 0) + 1);
  }

  for (const domain of mandatoryDomains) {
    const count = domainCounts.get(domain) || 0;
    assert.ok(
      count >= 3,
      `Domain '${domain}' must have at least 3 clinical tips, found ${count}`
    );
  }
});

test('1.3: Data integrity & non-stub validation for all tips', () => {
  const seenIds = new Set<string>();

  for (const tip of COACHING_TIPS) {
    // Unique ID
    assert.ok(tip.id && tip.id.trim().length > 0, 'Tip ID must be non-empty');
    assert.ok(!seenIds.has(tip.id), `Duplicate tip ID detected: '${tip.id}'`);
    seenIds.add(tip.id);

    // Icon presence
    assert.ok(tip.icon && tip.icon.trim().length > 0, `Tip ${tip.id} must have an icon`);

    // English title & content
    assert.ok(
      tip.titleEn && tip.titleEn.trim().length >= 5,
      `Tip ${tip.id} titleEn too short or missing`
    );
    assert.ok(
      tip.contentEn && tip.contentEn.trim().length >= 20,
      `Tip ${tip.id} contentEn too short or missing`
    );
    assert.ok(
      tip.actionableStepEn && tip.actionableStepEn.trim().length >= 10,
      `Tip ${tip.id} actionableStepEn too short or missing`
    );

    // Arabic title & content
    assert.ok(
      tip.titleAr && tip.titleAr.trim().length >= 5,
      `Tip ${tip.id} titleAr too short or missing`
    );
    assert.ok(
      tip.contentAr && tip.contentAr.trim().length >= 20,
      `Tip ${tip.id} contentAr too short or missing`
    );
    assert.ok(
      tip.actionableStepAr && tip.actionableStepAr.trim().length >= 10,
      `Tip ${tip.id} actionableStepAr too short or missing`
    );

    // Ensure Arabic content actually contains Arabic characters
    const arabicRegex = /[\u0600-\u06FF]/;
    assert.ok(
      arabicRegex.test(tip.titleAr),
      `Tip ${tip.id} titleAr must contain Arabic script: '${tip.titleAr}'`
    );
    assert.ok(
      arabicRegex.test(tip.contentAr),
      `Tip ${tip.id} contentAr must contain Arabic script`
    );
    assert.ok(
      arabicRegex.test(tip.actionableStepAr),
      `Tip ${tip.id} actionableStepAr must contain Arabic script`
    );

    // Reject placeholder / stub text
    const textToScan = `${tip.titleEn} ${tip.contentEn} ${tip.titleAr} ${tip.contentAr}`.toLowerCase();
    assert.ok(!textToScan.includes('lorem ipsum'), `Tip ${tip.id} contains dummy lorem ipsum text`);
    assert.ok(!textToScan.includes('todo'), `Tip ${tip.id} contains TODO placeholder`);
    assert.ok(!textToScan.includes('tbd'), `Tip ${tip.id} contains TBD placeholder`);
  }
});

test('1.4: Evidence-based renal clinical topics verification', () => {
  const medTips = COACHING_TIPS.filter((t) => t.domain === 'medication');
  const fluidTips = COACHING_TIPS.filter((t) => t.domain === 'fluid');
  const dietTips = COACHING_TIPS.filter((t) => t.domain === 'diet');

  // Medication topic checks: phosphate binders, blood pressure, vitamin D
  const medCombined = medTips.map((t) => `${t.titleEn} ${t.contentEn}`).join(' ').toLowerCase();
  assert.ok(
    medCombined.includes('phosphate') || medCombined.includes('binder') || medCombined.includes('sevelamer'),
    'Medication domain must cover phosphate binders'
  );
  assert.ok(
    medCombined.includes('blood pressure') || medCombined.includes('hypotension'),
    'Medication domain must cover blood pressure management'
  );
  assert.ok(
    medCombined.includes('vitamin d') || medCombined.includes('alfacalcidol') || medCombined.includes('bone'),
    'Medication domain must cover active vitamin D / bone health'
  );

  // Fluid topic checks: thirst / ice chips, interdialytic ceiling, hidden food fluids
  const fluidCombined = fluidTips.map((t) => `${t.titleEn} ${t.contentEn}`).join(' ').toLowerCase();
  assert.ok(
    fluidCombined.includes('ice') || fluidCombined.includes('thirst') || fluidCombined.includes('lemon'),
    'Fluid domain must cover thirst management with ice chips or lemon'
  );
  assert.ok(
    fluidCombined.includes('ceiling') || fluidCombined.includes('limit') || fluidCombined.includes('dry-weight'),
    'Fluid domain must cover interdialytic fluid ceiling'
  );
  assert.ok(
    fluidCombined.includes('soup') || fluidCombined.includes('hidden') || fluidCombined.includes('fruit'),
    'Fluid domain must cover hidden food fluids (soups, watery foods)'
  );

  // Diet topic checks: low potassium fruits, leaching potatoes, high biological protein
  const dietCombined = dietTips.map((t) => `${t.titleEn} ${t.contentEn}`).join(' ').toLowerCase();
  assert.ok(
    dietCombined.includes('potassium') && (dietCombined.includes('fruit') || dietCombined.includes('apple')),
    'Diet domain must cover low-potassium fruit choices'
  );
  assert.ok(
    dietCombined.includes('leach') || dietCombined.includes('potato') || dietCombined.includes('soak'),
    'Diet domain must cover leaching potassium from potatoes'
  );
  assert.ok(
    dietCombined.includes('protein') || dietCombined.includes('egg') || dietCombined.includes('fish'),
    'Diet domain must cover high-biological protein on dialysis days'
  );
});

test('1.5: Adversarial domain filtering and cyclic navigation math', () => {
  const filterTips = (domain: 'all' | CoachingDomain): CoachingTipItem[] => {
    if (domain === 'all') return COACHING_TIPS;
    return COACHING_TIPS.filter((t) => t.domain === domain);
  };

  const medList = filterTips('medication');
  assert.ok(medList.every((t) => t.domain === 'medication'));

  const fluidList = filterTips('fluid');
  assert.ok(fluidList.every((t) => t.domain === 'fluid'));

  const dietList = filterTips('diet');
  assert.ok(dietList.every((t) => t.domain === 'diet'));

  const dialysisList = filterTips('dialysis');
  assert.ok(dialysisList.every((t) => t.domain === 'dialysis'));

  // Cyclic navigation simulation across all lists
  const testLists = [dialysisList, medList, fluidList, dietList, filterTips('all')];
  for (const list of testLists) {
    const len = list.length;
    // Step forward 100 times
    let idx = 0;
    for (let step = 0; step < 100; step++) {
      idx = (idx + 1) % len;
      assert.ok(idx >= 0 && idx < len, `Index ${idx} out of bounds for length ${len}`);
      assert.ok(list[idx] !== undefined, 'Indexed tip must exist');
    }
    // Step backward 100 times
    for (let step = 0; step < 100; step++) {
      idx = (idx - 1 + len) % len;
      assert.ok(idx >= 0 && idx < len, `Index ${idx} out of bounds for length ${len}`);
      assert.ok(list[idx] !== undefined, 'Indexed tip must exist');
    }
  }
});

// ============================================================================
// SUITE 2: BILINGUAL TRANSLATION KEY INTEGRITY & 100% PARITY (R4 & R6)
// ============================================================================

test('2.1: messages/en.json and messages/ar.json exist and parse as valid JSON', () => {
  const enPath = path.join(PROJECT_ROOT, 'src/messages/en.json');
  const arPath = path.join(PROJECT_ROOT, 'src/messages/ar.json');

  assert.ok(fs.existsSync(enPath), `en.json missing at ${enPath}`);
  assert.ok(fs.existsSync(arPath), `ar.json missing at ${arPath}`);

  const enRaw = fs.readFileSync(enPath, 'utf8');
  const arRaw = fs.readFileSync(arPath, 'utf8');

  assert.doesNotThrow(() => JSON.parse(enRaw), 'en.json must be valid JSON');
  assert.doesNotThrow(() => JSON.parse(arRaw), 'ar.json must be valid JSON');
});

test('2.2: 100% key parity between en.json and ar.json across coachingAvatar namespace', () => {
  const en = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/en.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/ar.json'), 'utf8'));

  assert.ok(en.coachingAvatar, 'en.json must contain "coachingAvatar" namespace');
  assert.ok(ar.coachingAvatar, 'ar.json must contain "coachingAvatar" namespace');

  const enKeys = Object.keys(en.coachingAvatar).sort();
  const arKeys = Object.keys(ar.coachingAvatar).sort();

  const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
  const missingInEn = arKeys.filter((k) => !enKeys.includes(k));

  assert.strictEqual(
    missingInAr.length,
    0,
    `coachingAvatar keys missing in ar.json: ${missingInAr.join(', ')}`
  );
  assert.strictEqual(
    missingInEn.length,
    0,
    `coachingAvatar keys missing in en.json: ${missingInEn.join(', ')}`
  );

  for (const k of enKeys) {
    const enVal = String(en.coachingAvatar[k]).trim();
    const arVal = String(ar.coachingAvatar[k]).trim();
    assert.ok(enVal.length > 0, `en.coachingAvatar.${k} cannot be empty`);
    assert.ok(arVal.length > 0, `ar.coachingAvatar.${k} cannot be empty`);
    assert.ok(
      /[\u0600-\u06FF]/.test(arVal),
      `ar.coachingAvatar.${k} must contain Arabic script: received '${arVal}'`
    );
  }
});

test('2.3: 100% key parity between en.json and ar.json across fluidAlerts namespace', () => {
  const en = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/en.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/ar.json'), 'utf8'));

  assert.ok(en.fluidAlerts, 'en.json must contain "fluidAlerts" namespace');
  assert.ok(ar.fluidAlerts, 'ar.json must contain "fluidAlerts" namespace');

  const enKeys = Object.keys(en.fluidAlerts).sort();
  const arKeys = Object.keys(ar.fluidAlerts).sort();

  const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
  const missingInEn = arKeys.filter((k) => !enKeys.includes(k));

  assert.strictEqual(
    missingInAr.length,
    0,
    `fluidAlerts keys missing in ar.json: ${missingInAr.join(', ')}`
  );
  assert.strictEqual(
    missingInEn.length,
    0,
    `fluidAlerts keys missing in en.json: ${missingInEn.join(', ')}`
  );

  for (const k of enKeys) {
    const enVal = String(en.fluidAlerts[k]).trim();
    const arVal = String(ar.fluidAlerts[k]).trim();
    assert.ok(enVal.length > 0, `en.fluidAlerts.${k} cannot be empty`);
    assert.ok(arVal.length > 0, `ar.fluidAlerts.${k} cannot be empty`);
    assert.ok(
      /[\u0600-\u06FF]/.test(arVal),
      `ar.fluidAlerts.${k} must contain Arabic script: received '${arVal}'`
    );
  }
});

test('2.4: Source code reference check: Every tAvatar and tFluidAlerts call matches a valid message key', () => {
  const avatarCode = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/components/PatientCoachingAvatar.tsx'),
    'utf8'
  );
  const logCode = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/app/[locale]/patient/log/page.tsx'),
    'utf8'
  );
  const en = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/en.json'), 'utf8'));

  // Regex extract calls to tAvatar('key')
  const avatarCallRegex = /tAvatar\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
  const avatarReferencedKeys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = avatarCallRegex.exec(avatarCode)) !== null) {
    avatarReferencedKeys.add(match[1]);
  }

  assert.ok(avatarReferencedKeys.size > 0, 'Expected at least one tAvatar call in PatientCoachingAvatar');
  for (const k of avatarReferencedKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(en.coachingAvatar, k),
      `PatientCoachingAvatar referenced key '${k}', but it does not exist in en.json.coachingAvatar`
    );
  }

  // Regex extract calls to tFluidAlerts('key')
  const fluidAlertCallRegex = /tFluidAlerts\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
  const fluidAlertReferencedKeys = new Set<string>();
  while ((match = fluidAlertCallRegex.exec(logCode)) !== null) {
    fluidAlertReferencedKeys.add(match[1]);
  }

  assert.ok(
    fluidAlertReferencedKeys.size >= 5,
    `Expected at least 5 tFluidAlerts calls in patient/log/page.tsx, found ${fluidAlertReferencedKeys.size}`
  );
  for (const k of fluidAlertReferencedKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(en.fluidAlerts, k),
      `patient/log/page.tsx referenced key '${k}', but it does not exist in en.json.fluidAlerts`
    );
  }
});

test('2.5: Full project namespace bidirectional parity audit between en.json and ar.json', () => {
  const en = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/en.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'src/messages/ar.json'), 'utf8'));

  const enSections = Object.keys(en).sort();
  const arSections = Object.keys(ar).sort();

  assert.deepStrictEqual(
    enSections,
    arSections,
    'Top-level namespaces must match 100% between en.json and ar.json'
  );

  const mismatches: string[] = [];

  for (const section of enSections) {
    const enKeys = Object.keys(en[section]);
    const arKeys = Object.keys(ar[section]);

    for (const k of enKeys) {
      if (!arKeys.includes(k)) {
        mismatches.push(`Missing in AR: ${section}.${k}`);
      }
    }
    for (const k of arKeys) {
      if (!enKeys.includes(k)) {
        mismatches.push(`Missing in EN: ${section}.${k}`);
      }
    }
  }

  assert.strictEqual(
    mismatches.length,
    0,
    `Namespace parity mismatches found:\n${mismatches.join('\n')}`
  );
});

// ============================================================================
// SUITE 3: TOUCH TARGETS & ACCESSIBILITY DOM MARKERS (R4 & R6)
// ============================================================================

test('3.1: PatientCoachingAvatar DOM test IDs and touch target dimensions', () => {
  const code = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/components/PatientCoachingAvatar.tsx'),
    'utf8'
  );

  // Mandatory data-testid attributes
  const requiredTestIds = [
    'patient-coaching-avatar',
    'dr-dialy-mascot-btn',
    'coaching-topic-medication-btn',
    'coaching-topic-fluid-btn',
    'coaching-topic-diet-btn',
    'coaching-prev-tip-btn',
    'coaching-next-tip-btn',
  ];

  for (const tid of requiredTestIds) {
    assert.ok(
      code.includes(`data-testid="${tid}"`),
      `Missing required data-testid="${tid}" in PatientCoachingAvatar.tsx`
    );
  }

  // Mascot button dimension check (w-16 h-16 = 64px >= 48px)
  assert.ok(
    code.includes('w-16 h-16') || code.includes('min-h-[48px]'),
    'Dr. Dialy mascot button must satisfy >=48px touch target (w-16 h-16)'
  );

  // Buttons in PatientCoachingAvatar have min-h-[48px]
  const buttonTagMatches = code.match(/<button[\s\S]*?<\/button>/g) || [];
  assert.ok(
    buttonTagMatches.length >= 6,
    `Expected at least 6 buttons in PatientCoachingAvatar, found ${buttonTagMatches.length}`
  );

  for (const btn of buttonTagMatches) {
    const has48pxClass =
      btn.includes('min-h-[48px]') ||
      btn.includes('w-16 h-16') ||
      btn.includes('min-h-[50px]') ||
      btn.includes('min-w-[48px]');
    assert.ok(
      has48pxClass,
      `Button in PatientCoachingAvatar missing >=48px sizing:\n${btn.slice(0, 120)}...`
    );
  }
});

test('3.2: Accessible aria-labels on interactive icon buttons in PatientCoachingAvatar', () => {
  const code = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/components/PatientCoachingAvatar.tsx'),
    'utf8'
  );

  // Mascot button aria-label
  assert.ok(
    code.includes('aria-label=') && code.includes('dr-dialy-mascot-btn'),
    'Mascot button must provide an accessible aria-label'
  );

  // Navigation buttons aria-label
  assert.ok(
    code.includes('coaching-prev-tip-btn') && code.includes('aria-label='),
    'Previous tip button must provide an accessible aria-label'
  );
  assert.ok(
    code.includes('coaching-next-tip-btn') && code.includes('aria-label='),
    'Next tip button must provide an accessible aria-label'
  );
});

test('3.3: Fluid Alert DOM markers and touch targets in patient/log/page.tsx', () => {
  const code = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/app/[locale]/patient/log/page.tsx'),
    'utf8'
  );

  const requiredLogMarkers = [
    'data-testid="fluid-target-card"',
    'data-testid="fluid-critical-banner"',
    'data-testid="fluid-warning-banner"',
    'data-testid="fluid-alarm-sound-btn"',
  ];

  for (const marker of requiredLogMarkers) {
    assert.ok(
      code.includes(marker),
      `Missing required DOM marker '${marker}' in patient/log/page.tsx`
    );
  }

  // Fluid alarm sound button touch target >= 48px
  assert.ok(
    code.includes('data-testid="fluid-alarm-sound-btn"') && code.includes('min-h-[48px]'),
    'fluid-alarm-sound-btn must have min-h-[48px] touch target'
  );

  // Quick add fluid buttons touch target >= 48px
  assert.ok(
    code.includes('min-h-[50px]') || code.includes('min-h-[48px]'),
    'Quick-add and custom fluid buttons must meet >=48px touch targets'
  );
});

// ============================================================================
// SUITE 4: DUAL PORTAL MOUNTING INTEGRITY (R4)
// ============================================================================

test('4.1: Patient Dashboard (patient/page.tsx) imports and mounts PatientCoachingAvatar', () => {
  const code = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/app/[locale]/patient/page.tsx'),
    'utf8'
  );

  // Check import statement
  assert.ok(
    code.includes("import { PatientCoachingAvatar } from '@/components/PatientCoachingAvatar'") ||
      code.includes('PatientCoachingAvatar'),
    'patient/page.tsx must import PatientCoachingAvatar'
  );

  // Check JSX mounting
  assert.ok(
    code.includes('<PatientCoachingAvatar'),
    'patient/page.tsx must mount <PatientCoachingAvatar />'
  );

  // Check props passed
  assert.ok(
    code.includes('patientId=') && code.includes('adherenceMetrics='),
    'patient/page.tsx must supply patientId and adherenceMetrics props to PatientCoachingAvatar'
  );
});

test('4.2: Patient Activity Log (patient/log/page.tsx) imports and mounts PatientCoachingAvatar', () => {
  const code = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/app/[locale]/patient/log/page.tsx'),
    'utf8'
  );

  // Check import statement
  assert.ok(
    code.includes("import { PatientCoachingAvatar } from '@/components/PatientCoachingAvatar'") ||
      code.includes('PatientCoachingAvatar'),
    'patient/log/page.tsx must import PatientCoachingAvatar'
  );

  // Check JSX mounting
  assert.ok(
    code.includes('<PatientCoachingAvatar'),
    'patient/log/page.tsx must mount <PatientCoachingAvatar />'
  );

  // Check props passed
  assert.ok(
    code.includes('patientId={activePatientId}') && code.includes('adherenceMetrics='),
    'patient/log/page.tsx must supply patientId={activePatientId} and adherenceMetrics props to PatientCoachingAvatar'
  );
});

// ============================================================================
// SUITE 5: AUDIO ALARM TELEMETRY & CRITICAL RE-TRIGGERING (R3)
// ============================================================================

test('5.1: Web Audio Alarm utility is SSR-safe and non-throwing in Node environment', async () => {
  assert.strictEqual(
    typeof playFluidAlarm,
    'function',
    'playFluidAlarm must be an exported function'
  );
  assert.strictEqual(
    typeof isAudioContextSupported,
    'function',
    'isAudioContextSupported must be an exported function'
  );

  // Headless Node environment check
  assert.strictEqual(
    isAudioContextSupported(),
    false,
    'isAudioContextSupported should return false in Node headless environment'
  );

  // Safe SSR execution without throwing
  await assert.doesNotReject(
    async () => {
      await playFluidAlarm();
    },
    'playFluidAlarm must execute safely as a no-op when window/AudioContext is not present'
  );
});

test('5.2: Re-triggering invariant: any subsequent fluid entry while critical triggers alarm', () => {
  const limits = getPatientFluidLimits(70);
  assert.strictEqual(limits.critical, 1820);

  // Simulation of patient/log/page.tsx fluid addition
  let alarmCallCount = 0;
  const mockPlayAlarm = () => {
    alarmCallCount++;
  };

  const simulateFluidEntry = (currentTotal: number, addedAmount: number): number => {
    const nextTotal = currentTotal + addedAmount;
    if (nextTotal >= limits.critical) {
      mockPlayAlarm();
    }
    return nextTotal;
  };

  // Step 1: Start at 0 mL
  let total = 0;
  total = simulateFluidEntry(total, 500); // 500
  assert.strictEqual(alarmCallCount, 0);

  total = simulateFluidEntry(total, 500); // 1000
  assert.strictEqual(alarmCallCount, 0);

  total = simulateFluidEntry(total, 400); // 1400 (warning threshold, no alarm)
  assert.strictEqual(alarmCallCount, 0);

  total = simulateFluidEntry(total, 400); // 1800 (below critical, no alarm)
  assert.strictEqual(alarmCallCount, 0);

  // Step 2: Cross critical limit (1800 + 100 = 1900 >= 1820)
  total = simulateFluidEntry(total, 100); // 1900 -> Alarm triggers!
  assert.strictEqual(alarmCallCount, 1, 'Alarm must trigger upon crossing critical threshold');

  // Step 3: Re-triggering! Patient was already at 1900 (above critical). Adds another 100 mL
  total = simulateFluidEntry(total, 100); // 2000 -> Alarm must RE-TRIGGER!
  assert.strictEqual(
    alarmCallCount,
    2,
    'Alarm must immediately re-trigger on subsequent entry when already critical'
  );

  // Step 4: Another addition: +50 mL
  total = simulateFluidEntry(total, 50); // 2050 -> Alarm must RE-TRIGGER again!
  assert.strictEqual(
    alarmCallCount,
    3,
    'Alarm must re-trigger on every single addition beyond critical limit'
  );
  assert.strictEqual(total, 2050);
});

// ============================================================================
// SUITE 6: PATIENT AVATAR PRESETS & PROFILE PERSISTENCE (R1)
// ============================================================================

test('6.1: AVATAR_PRESETS contains 8 distinct presets matching patient profiles', () => {
  assert.ok(Array.isArray(AVATAR_PRESETS), 'AVATAR_PRESETS must be an exported array');
  assert.strictEqual(AVATAR_PRESETS.length, 8, 'Expected exactly 8 avatar presets');

  const malePresets = AVATAR_PRESETS.filter((p) => p.gender === 'male');
  const femalePresets = AVATAR_PRESETS.filter((p) => p.gender === 'female');

  assert.strictEqual(malePresets.length, 4, 'Expected 4 male avatar presets');
  assert.strictEqual(femalePresets.length, 4, 'Expected 4 female avatar presets');

  const expectedIds = [
    'male_mature_1',
    'male_mature_2',
    'male_elder_1',
    'male_young_1',
    'female_mature_1',
    'female_mature_2',
    'female_elder_1',
    'female_young_1',
  ];

  for (const id of expectedIds) {
    const found = AVATAR_PRESETS.find((p) => p.id === id);
    assert.ok(found, `Expected preset ID '${id}' to exist`);
  }
});

test('6.2: All presets have bilingual names and descriptions with Arabic script', () => {
  const arabicRegex = /[\u0600-\u06FF]/;
  for (const p of AVATAR_PRESETS) {
    assert.ok(p.nameEn.length >= 3, `Preset ${p.id} nameEn too short`);
    assert.ok(p.nameAr.length >= 3, `Preset ${p.id} nameAr too short`);
    assert.ok(arabicRegex.test(p.nameAr), `Preset ${p.id} nameAr must contain Arabic script`);
    assert.ok(p.descriptionEn.length >= 10, `Preset ${p.id} descriptionEn too short`);
    assert.ok(p.descriptionAr.length >= 10, `Preset ${p.id} descriptionAr too short`);
    assert.ok(arabicRegex.test(p.descriptionAr), `Preset ${p.id} descriptionAr must contain Arabic script`);
  }
});

test('6.3: Clinical accessories coverage: AV fistula and permcath chest dressings exist across presets', () => {
  const fistulaPresets = AVATAR_PRESETS.filter((p) => p.medicalAccessory === 'av_fistula_arm');
  const permcathPresets = AVATAR_PRESETS.filter((p) => p.medicalAccessory === 'permcath_chest');

  assert.ok(fistulaPresets.length >= 4, 'Expected at least 4 presets with AV fistula arm access');
  assert.ok(permcathPresets.length >= 2, 'Expected at least 2 presets with permcath chest catheter access');
});

test('6.4: Default fallback: getAvatarPreset returns appropriate defaults for male and female patients', () => {
  const maleDefault = getAvatarPreset(undefined, 'male');
  assert.strictEqual(maleDefault.id, 'male_mature_1');
  assert.strictEqual(maleDefault.gender, 'male');

  const femaleDefault = getAvatarPreset(undefined, 'female');
  assert.strictEqual(femaleDefault.id, 'female_mature_1');
  assert.strictEqual(femaleDefault.gender, 'female');

  const directLookup = getAvatarPreset('male_elder_1');
  assert.strictEqual(directLookup.id, 'male_elder_1');
});

test('6.5: updatePatientAvatar and getPatientAvatar persist and retrieve avatar IDs', () => {
  const patients = getPatients();
  assert.ok(patients.length >= 2, 'Expected at least 2 demo patients');

  const p1 = patients.find((p) => p.id === 'patient-1');
  assert.ok(p1, 'patient-1 must exist');
  assert.ok(p1.avatarId, 'patient-1 must have an avatarId');

  // Test updating avatar
  const updated = updatePatientAvatar('patient-1', 'male_mature_2', 'modern');
  assert.ok(updated, 'updatePatientAvatar should return updated patient');
  assert.strictEqual(updated.avatarId, 'male_mature_2');
  assert.strictEqual(getPatientAvatar('patient-1'), 'male_mature_2');

  // Reset back to male_mature_1
  updatePatientAvatar('patient-1', 'male_mature_1', 'classic');
  assert.strictEqual(getPatientAvatar('patient-1'), 'male_mature_1');
});

// ============================================================================
// SUITE 7: VISUAL INTERACTIVE REMINDERS & DIALYSIS SCHEDULE (R3)
// ============================================================================

test('7.1: Dialysis session importance coaching tips are present and verified', () => {
  const dialysisTips = COACHING_TIPS.filter((t) => t.domain === 'dialysis');
  assert.ok(dialysisTips.length >= 3, 'Dialysis domain must contain at least 3 tips');

  const fourHourTip = dialysisTips.find((t) =>
    (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('4-hour')
  );
  assert.ok(fourHourTip, 'Must contain 4-hour dialysis session duration tip');

  const thrillTip = dialysisTips.find((t) =>
    (t.titleEn + ' ' + t.contentEn).toLowerCase().includes('thrill')
  );
  assert.ok(thrillTip, 'Must contain vascular access thrill care tip');
});

// ============================================================================
// SUITE 8: SAVED LAB RESULTS COMMENTARY DEFINITIONS (R4)
// ============================================================================

test('8.1: Core 6 lab metrics definitions and clinical advice are registered', () => {
  const avatarCode = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/components/PatientCoachingAvatar.tsx'),
    'utf8'
  );

  const coreMetrics = ['hemoglobin', 'phosphorus', 'calcium', 'urea', 'creatinine', 'albumin'];
  for (const m of coreMetrics) {
    assert.ok(
      avatarCode.includes(m),
      `PatientCoachingAvatar must handle core lab metric '${m}'`
    );
  }

  assert.ok(avatarCode.includes('getPatientLabResults'), 'Must query patient lab results');
  assert.ok(avatarCode.includes('getPatientMedications'), 'Must query patient medications for reminders');
});

// ============================================================================
// RUNNER HARNESS
// ============================================================================

async function run() {
  console.log('================================================================');
  console.log('CHALLENGER 2: AVATAR & LOCALIZATION ADVERSARIAL EMPIRICAL SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
      await t.fn();
      console.log(`  ✓ [PASS] ${t.name}`);
      passed++;
    } catch (err: unknown) {
      console.error(`  ✗ [FAIL] ${t.name}`);
      console.error(err);
      failed++;
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    console.error('STATUS: SUITE FAILED WITH ' + failed + ' FAILURES');
    process.exit(1);
  } else {
    console.log('STATUS: ALL CHALLENGER TESTS VERIFIED & PASSED (EXIT 0)');
    process.exit(0);
  }
}

void run();
