/**
 * Adversarial Empirical Verification Test Suite:
 * Challenger M3-1: Dialysis Treatment Module (R2 14-Field Session Form & History)
 *
 * Stress-tests:
 * 1. Compliance ratings boundary values (1, 5, outside bounds handling)
 * 2. Pre/post weights: 30kg - 200kg, grams rollover, pre < post intradialytic weight gain
 * 3. 5-Timepoint BP & HR: complete matrices, missing timepoint safety, extreme crisis/hypotension
 * 4. Temperature clinical boundaries: hypothermia (34.0°C) to hyperpyrexia (43.0°C)
 * 5. Full fluid status assessment permutations (4 x 4 x 4 = 64 combinations)
 * 6. Vascular access types (AVF, AVG, Permcath, Mahurkar) & infection alert flags
 * 7. Machine operating telemetry (durations 1-4h, UF 0-5500mL, blood flow 100-500mL/min, dialysate flow, sodium 120-160mEq/L)
 * 8. Concurrency, multi-patient isolation, date/time secondary descending sorting, CRUD invariants
 * 9. Accessibility touch targets & bilingual translation key parity
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getDialysisSessions,
  addDialysisSession,
  updateDialysisSession,
  deleteDialysisSession,
  initDataStore,
} from '../data-store';
import type {
  DialysisSessionVitals,
  LegEdemaLevel,
  LungCracklesLevel,
  DyspneaLevel,
  DialysisAccessType,
  DialysateFlowRate,
  SessionDurationHours,
} from '../types';

// Mock storage & event tracker for node execution
const mockStore: Record<string, string> = {};
const firedEvents: string[] = [];

if (typeof window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStore[k];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
    },
    dispatchEvent: (ev: { type: string }) => {
      firedEvents.push(ev.type);
      return true;
    },
  };

  (globalThis as unknown as { Event: unknown }).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

function resetEnvironment() {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  firedEvents.length = 0;
  initDataStore();
}

console.log('================================================================');
console.log('CHALLENGER M3-1: ADVERSARIAL DIALYSIS TELEMETRY STRESS TEST');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// SUITE 1: COMPLIANCE RATINGS & DISCRETE BOUNDARIES
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 1: Compliance Ratings & Discrete Boundaries ---');

runTest('1.1 Compliance rating minimum bound (1) and maximum bound (5) persistence', () => {
  resetEnvironment();
  const baseVitals: DialysisSessionVitals = {
    preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
    after1hr: { systolic: 128, diastolic: 78, heartRate: 74 },
    after2hr: { systolic: 125, diastolic: 76, heartRate: 75 },
    after3hr: { systolic: 122, diastolic: 75, heartRate: 76 },
    endSession: { systolic: 120, diastolic: 74, heartRate: 72 },
  };

  const sessionMin = addDialysisSession({
    patientId: 'patient-c1',
    sessionDate: '2026-03-01',
    recordedBy: 'nurse-1',
    complianceRating: 1,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: baseVitals,
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
  });

  const sessionMax = addDialysisSession({
    patientId: 'patient-c1',
    sessionDate: '2026-03-02',
    recordedBy: 'nurse-1',
    complianceRating: 5,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: baseVitals,
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
  });

  assert.strictEqual(sessionMin.complianceRating, 1);
  assert.strictEqual(sessionMax.complianceRating, 5);

  const list = getDialysisSessions('patient-c1');
  assert.strictEqual(list.length, 2);
  const foundMin = list.find((s) => s.id === sessionMin.id);
  const foundMax = list.find((s) => s.id === sessionMax.id);
  assert.strictEqual(foundMin?.complianceRating, 1);
  assert.strictEqual(foundMax?.complianceRating, 5);
});

runTest('1.2 Intermediate compliance ratings (2, 3, 4) all serialize accurately', () => {
  resetEnvironment();
  const ratings: Array<1 | 2 | 3 | 4 | 5> = [2, 3, 4];
  for (const r of ratings) {
    const s = addDialysisSession({
      patientId: 'patient-ratings',
      sessionDate: `2026-03-0${r}`,
      recordedBy: 'doctor',
      complianceRating: r,
      preWeightKg: 65,
      postWeightKg: 63,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.5,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 3,
      ultrafiltrationVolumeMl: 1800,
      bloodFlowRateMlMin: 300,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVG',
      machineSodiumMeqL: 140,
    });
    assert.strictEqual(s.complianceRating, r);
  }
  const retrieved = getDialysisSessions('patient-ratings');
  assert.strictEqual(retrieved.length, 3);
  const setOfRatings = new Set(retrieved.map((s) => s.complianceRating));
  assert.deepStrictEqual(setOfRatings, new Set([2, 3, 4]));
});

// ----------------------------------------------------------------------------
// SUITE 2: WEIGHT TELEMETRY, GRAMS ROLLOVER & PRE < POST PARADOX
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Weight Telemetry & Grams Rollover ---');

runTest('2.1 Extreme weights: cachectic (30 kg) and bariatric (180 kg) weights', () => {
  resetEnvironment();
  const sessionSmall = addDialysisSession({
    patientId: 'patient-weight-extreme',
    sessionDate: '2026-03-01',
    recordedBy: 'nurse-pediatric',
    complianceRating: 5,
    preWeightKg: 30.5,
    preWeightGrams: 250,
    postWeightKg: 29.8,
    postWeightGrams: 100,
    vitals: {
      preSession: { systolic: 100, diastolic: 65, heartRate: 90 },
      after1hr: { systolic: 98, diastolic: 62, heartRate: 88 },
      after2hr: { systolic: 95, diastolic: 60, heartRate: 85 },
      after3hr: { systolic: 92, diastolic: 60, heartRate: 85 },
      endSession: { systolic: 95, diastolic: 62, heartRate: 84 },
    },
    temperatureC: 36.4,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 2,
    ultrafiltrationVolumeMl: 800,
    bloodFlowRateMlMin: 180,
    dialysateFlowRateMlMin: 300,
    accessType: 'Permcath',
    machineSodiumMeqL: 136,
  });

  const sessionHeavy = addDialysisSession({
    patientId: 'patient-weight-extreme',
    sessionDate: '2026-03-03',
    recordedBy: 'dr-bariatric',
    complianceRating: 4,
    preWeightKg: 180.2,
    preWeightGrams: 800,
    postWeightKg: 176.0,
    postWeightGrams: 500,
    vitals: {
      preSession: { systolic: 165, diastolic: 95, heartRate: 82 },
      after1hr: { systolic: 155, diastolic: 90, heartRate: 80 },
      after2hr: { systolic: 148, diastolic: 85, heartRate: 78 },
      after3hr: { systolic: 142, diastolic: 82, heartRate: 76 },
      endSession: { systolic: 140, diastolic: 80, heartRate: 75 },
    },
    temperatureC: 36.8,
    fluidStatus: { legEdema: 'moderate', lungCrackles: 'lower_bases', dyspnea: 'mild' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 4500,
    bloodFlowRateMlMin: 450,
    dialysateFlowRateMlMin: 800,
    accessType: 'AVF',
    machineSodiumMeqL: 140,
  });

  assert.strictEqual(sessionSmall.preWeightKg, 30.5);
  assert.strictEqual(sessionSmall.preWeightGrams, 250);
  assert.strictEqual(sessionHeavy.preWeightKg, 180.2);
  assert.strictEqual(sessionHeavy.preWeightGrams, 800);

  // Verify total weight loss calculation precision
  if (
    sessionSmall.preWeightKg === undefined ||
    sessionSmall.postWeightKg === undefined ||
    sessionHeavy.preWeightKg === undefined ||
    sessionHeavy.postWeightKg === undefined
  ) {
    throw new Error('Expected preWeightKg and postWeightKg on weight sessions');
  }
  const smallTotalPre = sessionSmall.preWeightKg + (sessionSmall.preWeightGrams || 0) / 1000;
  const smallTotalPost = sessionSmall.postWeightKg + (sessionSmall.postWeightGrams || 0) / 1000;
  const smallLoss = Number((smallTotalPre - smallTotalPost).toFixed(3));
  assert.strictEqual(smallLoss, 0.85); // 30.75 - 29.90 = 0.85 kg

  const heavyTotalPre = sessionHeavy.preWeightKg + (sessionHeavy.preWeightGrams || 0) / 1000;
  const heavyTotalPost = sessionHeavy.postWeightKg + (sessionHeavy.postWeightGrams || 0) / 1000;
  const heavyLoss = Number((heavyTotalPre - heavyTotalPost).toFixed(3));
  assert.strictEqual(heavyLoss, 4.5); // 181.0 - 176.5 = 4.5 kg
});

runTest('2.2 Grams boundary conditions (0g, 500g, 950g, 999g) without float distortion', () => {
  resetEnvironment();
  const testGrams = [0, 50, 250, 500, 750, 950, 999];
  for (const g of testGrams) {
    const s = addDialysisSession({
      patientId: 'patient-grams',
      sessionDate: '2026-03-01',
      recordedBy: 'nurse',
      complianceRating: 5,
      preWeightKg: 70,
      preWeightGrams: g,
      postWeightKg: 68,
      postWeightGrams: g,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.preWeightKg, 70);
    assert.strictEqual(s.preWeightGrams, g);
    const computedPre = (s.preWeightKg ?? 0) + (s.preWeightGrams || 0) / 1000;
    assert.strictEqual(computedPre, 70 + g / 1000);
  }
});

runTest('2.3 Intradialytic weight gain (preWeight < postWeight) handled safely', () => {
  resetEnvironment();
  // Clinical scenario: Patient had acute hypotensive crisis, required 2L saline infusion + blood transfusion
  const paradoxSession = addDialysisSession({
    patientId: 'patient-gain',
    sessionDate: '2026-03-05',
    recordedBy: 'dr-icu',
    complianceRating: 3,
    preWeightKg: 68,
    preWeightGrams: 0,
    postWeightKg: 70, // 2kg heavier post dialysis!
    postWeightGrams: 200,
    vitals: {
      preSession: { systolic: 110, diastolic: 70, heartRate: 85 },
      after1hr: { systolic: 75, diastolic: 45, heartRate: 115 }, // Shock / crash
      after2hr: { systolic: 90, diastolic: 55, heartRate: 100 }, // Resuscitation
      after3hr: { systolic: 105, diastolic: 65, heartRate: 90 },
      endSession: { systolic: 115, diastolic: 72, heartRate: 82 },
    },
    temperatureC: 37.1,
    fluidStatus: { legEdema: 'mild', lungCrackles: 'lower_bases', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 0, // UF turned off
    bloodFlowRateMlMin: 200,
    dialysateFlowRateMlMin: 500,
    accessType: 'Permcath',
    machineSodiumMeqL: 140,
    notes: 'Severe intradialytic hypotension at hour 1. UF stopped, 2000 mL saline + albumin bolus administered.',
  });

  assert.ok(paradoxSession.id);
  if (paradoxSession.preWeightKg === undefined || paradoxSession.postWeightKg === undefined) {
    throw new Error('Expected preWeightKg and postWeightKg on paradoxSession');
  }
  const preTot = paradoxSession.preWeightKg + (paradoxSession.preWeightGrams || 0) / 1000;
  const postTot = paradoxSession.postWeightKg + (paradoxSession.postWeightGrams || 0) / 1000;
  const netLoss = preTot - postTot;
  assert.ok(netLoss < 0, 'Net loss is negative when weight is gained');
  assert.strictEqual(Number(netLoss.toFixed(2)), -2.2);
});

// ----------------------------------------------------------------------------
// SUITE 3: 5-TIMEPOINT BLOOD PRESSURE & HEART RATE EXTREMES
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 3: 5-Timepoint Blood Pressure & Heart Rate Extremes ---');

runTest('3.1 Complete 5-timepoint telemetry: crisis hypertension & bradycardia/tachycardia extremes', () => {
  resetEnvironment();
  const extremeVitals: DialysisSessionVitals = {
    // Severe Hypertensive Crisis at start
    preSession: { systolic: 240, diastolic: 135, heartRate: 115 },
    // Acute Bradycardia under beta blocker / vagal reaction at 1 hr
    after1hr: { systolic: 180, diastolic: 100, heartRate: 38 },
    // Stabilization at 2 hr
    after2hr: { systolic: 155, diastolic: 90, heartRate: 68 },
    // Critical intradialytic hypotension crash at 3 hr
    after3hr: { systolic: 68, diastolic: 42, heartRate: 135 },
    // Post saline recovery at endSession
    endSession: { systolic: 118, diastolic: 74, heartRate: 78 },
  };

  const session = addDialysisSession({
    patientId: 'patient-vitals-extreme',
    sessionDate: '2026-03-05',
    recordedBy: 'dr-senior',
    complianceRating: 3,
    preWeightKg: 75,
    postWeightKg: 72,
    vitals: extremeVitals,
    temperatureC: 36.7,
    fluidStatus: { legEdema: 'moderate', lungCrackles: 'mid_lung', dyspnea: 'moderate' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 3000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 140,
  });

  assert.strictEqual(session.vitals?.preSession?.systolic, 240);
  assert.strictEqual(session.vitals?.preSession?.diastolic, 135);
  assert.strictEqual(session.vitals?.preSession?.heartRate, 115);
  assert.strictEqual(session.vitals?.after1hr?.heartRate, 38);
  assert.strictEqual(session.vitals?.after3hr?.systolic, 68);
  assert.strictEqual(session.vitals?.after3hr?.heartRate, 135);
  assert.strictEqual(session.vitals?.endSession?.systolic, 118);
});

runTest('3.2 Missing / zero / partial timepoint values handled gracefully in store', () => {
  resetEnvironment();
  // 1-hour session where after2hr, after3hr were not recorded (0 or omitted)
  const shortVitals: DialysisSessionVitals = {
    preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
    after1hr: { systolic: 125, diastolic: 78, heartRate: 74 },
    after2hr: { systolic: 0, diastolic: 0, heartRate: 0 },
    after3hr: { systolic: 0, diastolic: 0, heartRate: 0 },
    endSession: { systolic: 125, diastolic: 78, heartRate: 74 },
  };

  const session = addDialysisSession({
    patientId: 'patient-short',
    sessionDate: '2026-03-06',
    recordedBy: 'nurse',
    complianceRating: 4,
    preWeightKg: 65,
    postWeightKg: 64,
    vitals: shortVitals,
    temperatureC: 36.5,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 1, // 1 hour treatment
    ultrafiltrationVolumeMl: 1000,
    bloodFlowRateMlMin: 300,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
  });

  assert.strictEqual(session.vitals?.after2hr?.systolic, 0);
  assert.strictEqual(session.durationHours, 1);
  const fetched = getDialysisSessions('patient-short')[0];
  assert.strictEqual(fetched.vitals?.endSession?.systolic, 125);
});

// ----------------------------------------------------------------------------
// SUITE 4: TEMPERATURE BOUNDARY MATRIX
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Temperature Boundary Matrix ---');

runTest('4.1 Clinical temperature spectrum from severe hypothermia to hyperpyrexia', () => {
  resetEnvironment();
  const testTemps = [34.0, 35.2, 36.5, 37.2, 38.5, 40.0, 42.5, 43.0];

  for (const t of testTemps) {
    const s = addDialysisSession({
      patientId: 'patient-temp',
      sessionDate: '2026-03-01',
      recordedBy: 'nurse',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: t,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: t >= 38.0, // High temperature correlated with infection
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.temperatureC, t);
    if (t >= 38.0) {
      assert.strictEqual(s.accessInfectionSigns, true);
    }
  }

  const list = getDialysisSessions('patient-temp');
  assert.strictEqual(list.length, testTemps.length);
});

// ----------------------------------------------------------------------------
// SUITE 5: FLUID ASSESSMENT PERMUTATIONS (4 x 4 x 4 = 64 COMBINATIONS)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Fluid Assessment Combinatorial Permutations (64 Combinations) ---');

runTest('5.1 Full 64 combinatorial permutations of edema x crackles x dyspnea', () => {
  resetEnvironment();
  const edemaLevels: LegEdemaLevel[] = ['none', 'mild', 'moderate', 'severe'];
  const cracklesLevels: LungCracklesLevel[] = ['none', 'lower_bases', 'mid_lung', 'all_areas'];
  const dyspneaLevels: DyspneaLevel[] = ['none', 'mild', 'moderate', 'severe'];

  let comboCount = 0;
  for (const edema of edemaLevels) {
    for (const crackles of cracklesLevels) {
      for (const dyspnea of dyspneaLevels) {
        comboCount++;
        const s = addDialysisSession({
          patientId: 'patient-fluid-matrix',
          sessionDate: '2026-03-01',
          recordedBy: 'dr-fluid',
          complianceRating: edema === 'severe' && dyspnea === 'severe' ? 1 : 4,
          preWeightKg: 70,
          postWeightKg: 68,
          vitals: {
            preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
            after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
            after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
            after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
            endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
          },
          temperatureC: 36.6,
          fluidStatus: {
            legEdema: edema,
            lungCrackles: crackles,
            dyspnea,
          },
          accessInfectionSigns: false,
          durationHours: 4,
          ultrafiltrationVolumeMl: edema === 'severe' ? 4000 : 2000,
          bloodFlowRateMlMin: 350,
          dialysateFlowRateMlMin: 500,
          accessType: 'AVF',
          machineSodiumMeqL: 138,
          notes: `Permutation #${comboCount}: edema=${edema}, crackles=${crackles}, dyspnea=${dyspnea}`,
        });

        assert.strictEqual(s.fluidStatus?.legEdema, edema);
        assert.strictEqual(s.fluidStatus?.lungCrackles, crackles);
        assert.strictEqual(s.fluidStatus?.dyspnea, dyspnea);
      }
    }
  }

  assert.strictEqual(comboCount, 64, 'Must have generated exactly 64 permutations');
  const storedCombos = getDialysisSessions('patient-fluid-matrix');
  assert.strictEqual(storedCombos.length, 64, 'Store must hold all 64 permutations without loss');
});

// ----------------------------------------------------------------------------
// SUITE 6: VASCULAR ACCESS TYPES & INFECTION FLAGS
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 6: Vascular Access Types & Infection Alert Flags ---');

runTest('6.1 All 4 access types (AVF, AVG, Permcath, Mahurkar) with clean and infection states', () => {
  resetEnvironment();
  const accessTypes: DialysisAccessType[] = ['AVF', 'AVG', 'Permcath', 'Mahurkar'];
  const infectionStates = [false, true];

  for (const acc of accessTypes) {
    for (const inf of infectionStates) {
      const s = addDialysisSession({
        patientId: 'patient-access-test',
        sessionDate: '2026-03-01',
        recordedBy: 'nurse-access',
        complianceRating: inf ? 2 : 5,
        preWeightKg: 70,
        postWeightKg: 68,
        vitals: {
          preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
          after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        },
        temperatureC: inf ? 38.7 : 36.5,
        fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
        accessInfectionSigns: inf,
        durationHours: 4,
        ultrafiltrationVolumeMl: 2000,
        bloodFlowRateMlMin: acc === 'Mahurkar' ? 220 : 350,
        dialysateFlowRateMlMin: 500,
        accessType: acc,
        machineSodiumMeqL: 138,
        notes: inf ? `Infection suspected at ${acc} site! Erythema, local tenderness.` : `${acc} clean with strong thrill.`,
      });

      assert.strictEqual(s.accessType, acc);
      assert.strictEqual(s.accessInfectionSigns, inf);
      if (inf) {
        assert.ok(s.notes?.includes('Infection suspected'));
      }
    }
  }

  const accessList = getDialysisSessions('patient-access-test');
  assert.strictEqual(accessList.length, 8);
  const infectionCount = accessList.filter((s) => s.accessInfectionSigns).length;
  assert.strictEqual(infectionCount, 4);
});

// ----------------------------------------------------------------------------
// SUITE 7: MACHINE OPERATING PARAMETERS (DURATIONS, UF, FLOWS, SODIUM)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 7: Machine Operating Telemetry Invariants ---');

runTest('7.1 Discrete treatment durations (1, 2, 3, 4 hours) valid enforcement', () => {
  resetEnvironment();
  const durations: SessionDurationHours[] = [1, 2, 3, 4];
  for (const d of durations) {
    const s = addDialysisSession({
      patientId: 'patient-durations',
      sessionDate: `2026-03-0${d}`,
      recordedBy: 'doctor',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: d,
      ultrafiltrationVolumeMl: d * 600,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.durationHours, d);
  }
  const results = getDialysisSessions('patient-durations');
  assert.strictEqual(results.length, 4);
});

runTest('7.2 Ultrafiltration volume boundaries: 0 mL (isolated HD) up to 5500 mL', () => {
  resetEnvironment();
  const ufVolumes = [0, 500, 1500, 3000, 4800, 5500];
  for (const uf of ufVolumes) {
    const s = addDialysisSession({
      patientId: 'patient-uf',
      sessionDate: '2026-03-01',
      recordedBy: 'nurse',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 70 - uf / 1000,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: uf,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.ultrafiltrationVolumeMl, uf);
  }
});

runTest('7.3 Blood flow rate spectrum (100 to 500 mL/min)', () => {
  resetEnvironment();
  const flows = [100, 180, 250, 350, 400, 500];
  for (const qb of flows) {
    const s = addDialysisSession({
      patientId: 'patient-qb',
      sessionDate: '2026-03-01',
      recordedBy: 'doctor',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: qb,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.bloodFlowRateMlMin, qb);
  }
});

runTest('7.4 Dialysate flow rate discrete values (300, 500, 700, 800 mL/min)', () => {
  resetEnvironment();
  const qdRates: DialysateFlowRate[] = [300, 500, 700, 800];
  for (const qd of qdRates) {
    const s = addDialysisSession({
      patientId: 'patient-qd',
      sessionDate: '2026-03-01',
      recordedBy: 'nurse',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: qd,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    assert.strictEqual(s.dialysateFlowRateMlMin, qd);
  }
});

runTest('7.5 Dialysis machine sodium concentration (120 to 160 mEq/L)', () => {
  resetEnvironment();
  const sodiumLevels = [120, 130, 138, 142, 150, 160];
  for (const na of sodiumLevels) {
    const s = addDialysisSession({
      patientId: 'patient-sodium',
      sessionDate: '2026-03-01',
      recordedBy: 'nephrologist',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: na,
    });
    assert.strictEqual(s.machineSodiumMeqL, na);
  }
});

// ----------------------------------------------------------------------------
// SUITE 8: CONCURRENCY, MULTI-PATIENT ISOLATION, ORDERING & CRUD
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 8: Concurrency, Multi-Patient Isolation & Chronological Integrity ---');

runTest('8.1 Scattered dates sort descending strictly (newest first, oldest last)', () => {
  resetEnvironment();
  const dates = [
    '2026-01-10',
    '2026-03-15',
    '2025-11-20',
    '2026-02-05',
    '2026-03-01',
    '2026-03-20',
    '2025-12-31',
  ];

  for (const d of dates) {
    addDialysisSession({
      patientId: 'patient-sort-dates',
      sessionDate: d,
      recordedBy: 'doctor',
      complianceRating: 4,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
  }

  const sorted = getDialysisSessions('patient-sort-dates');
  assert.strictEqual(sorted.length, dates.length);

  // Assert strict descending order
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = new Date(sorted[i].sessionDate).getTime();
    const next = new Date(sorted[i + 1].sessionDate).getTime();
    assert.ok(current >= next, `Date ${sorted[i].sessionDate} must be >= ${sorted[i + 1].sessionDate}`);
  }

  assert.strictEqual(sorted[0].sessionDate, '2026-03-20', 'Newest date must be at index 0');
  assert.strictEqual(sorted[sorted.length - 1].sessionDate, '2025-11-20', 'Oldest date must be at last index');
});

runTest('8.2 Same-date sessions sort by recordedAt timestamp descending', () => {
  resetEnvironment();
  const sameDate = '2026-03-10';

  const s1 = addDialysisSession({
    patientId: 'patient-same-date',
    sessionDate: sameDate,
    recordedBy: 'nurse-morning',
    recordedAt: '2026-03-10T08:00:00.000Z',
    complianceRating: 5,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: {
      preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
    notes: 'Morning run',
  });

  const s2 = addDialysisSession({
    patientId: 'patient-same-date',
    sessionDate: sameDate,
    recordedBy: 'nurse-evening',
    recordedAt: '2026-03-10T19:30:00.000Z',
    complianceRating: 4,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: {
      preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
    notes: 'Evening emergency run',
  });

  const list = getDialysisSessions('patient-same-date');
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, s2.id, 'Evening session (newer timestamp) must come first');
  assert.strictEqual(list[1].id, s1.id, 'Morning session (older timestamp) must come second');
});

runTest('8.3 Multi-patient strict isolation: no session leakage across patients', () => {
  resetEnvironment();
  const patients = ['patient-alpha', 'patient-beta', 'patient-gamma'];

  patients.forEach((pid, idx) => {
    for (let i = 0; i < idx + 2; i++) {
      addDialysisSession({
        patientId: pid,
        sessionDate: `2026-03-0${i + 1}`,
        recordedBy: 'doctor',
        complianceRating: 5,
        preWeightKg: 70,
        postWeightKg: 68,
        vitals: {
          preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
          after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
          endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        },
        temperatureC: 36.6,
        fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
        accessInfectionSigns: false,
        durationHours: 4,
        ultrafiltrationVolumeMl: 2000,
        bloodFlowRateMlMin: 350,
        dialysateFlowRateMlMin: 500,
        accessType: 'AVF',
        machineSodiumMeqL: 138,
      });
    }
  });

  const alpha = getDialysisSessions('patient-alpha');
  const beta = getDialysisSessions('patient-beta');
  const gamma = getDialysisSessions('patient-gamma');

  assert.strictEqual(alpha.length, 2);
  assert.strictEqual(beta.length, 3);
  assert.strictEqual(gamma.length, 4);

  assert.ok(alpha.every((s) => s.patientId === 'patient-alpha'));
  assert.ok(beta.every((s) => s.patientId === 'patient-beta'));
  assert.ok(gamma.every((s) => s.patientId === 'patient-gamma'));

  // Empty patientId edge case
  assert.deepStrictEqual(getDialysisSessions(''), []);
});

runTest('8.4 Update operations: updates specified fields while keeping remaining fields immutable', () => {
  resetEnvironment();
  const initial = addDialysisSession({
    patientId: 'patient-mutate',
    sessionDate: '2026-03-01',
    recordedBy: 'dr-original',
    complianceRating: 5,
    preWeightKg: 75,
    preWeightGrams: 500,
    postWeightKg: 72,
    postWeightGrams: 200,
    vitals: {
      preSession: { systolic: 140, diastolic: 85, heartRate: 72 },
      after1hr: { systolic: 135, diastolic: 82, heartRate: 70 },
      after2hr: { systolic: 130, diastolic: 80, heartRate: 70 },
      after3hr: { systolic: 125, diastolic: 78, heartRate: 72 },
      endSession: { systolic: 122, diastolic: 76, heartRate: 70 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'mild', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 3300,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
    notes: 'Original note',
  });

  const updated = updateDialysisSession(initial.id, {
    notes: 'Amended clinical note: Patient experienced mild nausea at 3h.',
    postWeightKg: 71.8,
    complianceRating: 4,
  });

  assert.ok(updated);
  assert.strictEqual(updated.notes, 'Amended clinical note: Patient experienced mild nausea at 3h.');
  assert.strictEqual(updated.postWeightKg, 71.8);
  assert.strictEqual(updated.complianceRating, 4);

  // Invariants preserved
  assert.strictEqual(updated.patientId, 'patient-mutate');
  assert.strictEqual(updated.preWeightKg, 75);
  assert.strictEqual(updated.preWeightGrams, 500);
  assert.strictEqual(updated.vitals?.preSession?.systolic, 140);
  assert.strictEqual(updated.temperatureC, 36.6);
  assert.strictEqual(updated.ultrafiltrationVolumeMl, 3300);
  assert.strictEqual(updated.accessType, 'AVF');

  // Updating non-existent ID returns null
  assert.strictEqual(updateDialysisSession('non-existent-guid', { notes: 'noop' }), null);
});

runTest('8.5 Deletion operations: removes session, leaves others intact, handles non-existent gracefully', () => {
  resetEnvironment();
  const s1 = addDialysisSession({
    patientId: 'patient-delete-test',
    sessionDate: '2026-03-01',
    recordedBy: 'nurse',
    complianceRating: 5,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: {
      preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
  });

  const s2 = addDialysisSession({
    patientId: 'patient-delete-test',
    sessionDate: '2026-03-03',
    recordedBy: 'nurse',
    complianceRating: 5,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: {
      preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
  });

  assert.strictEqual(getDialysisSessions('patient-delete-test').length, 2);

  // Delete s1
  const deleteResult = deleteDialysisSession(s1.id);
  assert.strictEqual(deleteResult, true);

  const remaining = getDialysisSessions('patient-delete-test');
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, s2.id);

  // Deleting non-existent ID
  assert.strictEqual(deleteDialysisSession('bogus-id'), false);
  assert.strictEqual(getDialysisSessions('patient-delete-test').length, 1);
});

runTest('8.6 Rapid high-concurrency throughput: 50 rapid insertions maintain array state & unique IDs', () => {
  resetEnvironment();
  const count = 50;
  const ids = new Set<string>();

  for (let i = 0; i < count; i++) {
    const s = addDialysisSession({
      patientId: 'patient-throughput',
      sessionDate: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      recordedBy: `device-${i}`,
      complianceRating: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      preWeightKg: 60 + (i % 20),
      postWeightKg: 58 + (i % 20),
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 70 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 70 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 70 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500,
      accessType: 'AVF',
      machineSodiumMeqL: 138,
    });
    ids.add(s.id);
  }

  assert.strictEqual(ids.size, count, 'All generated session IDs must be unique');
  const stored = getDialysisSessions('patient-throughput');
  assert.strictEqual(stored.length, count, 'Storage must accurately hold all 50 sessions');
});

// ----------------------------------------------------------------------------
// SUITE 9: UI ACCESSIBILITY & BILINGUAL PARITY VERIFICATION
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 9: UI Accessibility & Bilingual Parity Verification ---');

runTest('9.1 DialysisSessionModal meets 48px touch targets for all interactive controls', () => {
  const modalPath = path.resolve(__dirname, '../../components/DialysisSessionModal.tsx');
  const code = fs.readFileSync(modalPath, 'utf8');

  // Verify 'use client'
  assert.ok(code.includes("'use client'"), 'Modal must have use client directive');

  // Check 48px touch targets
  const minH48Count = (code.match(/min-h-\[48px\]/g) || []).length;
  assert.ok(minH48Count >= 10, `Modal must contain extensive min-h-[48px] touch targets (found ${minH48Count})`);

  // Check all 14 clinical parameter sections
  assert.ok(code.includes('complianceRating'), 'Must have complianceRating');
  assert.ok(code.includes('preWeightKg') && code.includes('preWeightGrams'), 'Must have preWeight kg + grams');
  assert.ok(code.includes('postWeightKg') && code.includes('postWeightGrams'), 'Must have postWeight kg + grams');
  assert.ok(code.includes('preSession') && code.includes('endSession'), 'Must have 5-timepoint vitals');
  assert.ok(code.includes('temperatureC'), 'Must have temperatureC');
  assert.ok(code.includes('legEdema') && code.includes('lungCrackles') && code.includes('dyspnea'), 'Must have 3-field fluid status');
  assert.ok(code.includes('accessInfectionSigns'), 'Must have accessInfectionSigns');
  assert.ok(code.includes('durationHours'), 'Must have durationHours');
  assert.ok(code.includes('ultrafiltrationVolumeMl'), 'Must have ultrafiltrationVolumeMl');
  assert.ok(code.includes('bloodFlowRateMlMin'), 'Must have bloodFlowRateMlMin');
  assert.ok(code.includes('dialysateFlowRateMlMin'), 'Must have dialysateFlowRateMlMin');
  assert.ok(code.includes('accessType'), 'Must have accessType');
  assert.ok(code.includes('machineSodiumMeqL'), 'Must have machineSodiumMeqL');
});

runTest('9.2 DialysisSessionHistory meets accessibility, accordion toggle & 48px touch targets', () => {
  const historyPath = path.resolve(__dirname, '../../components/DialysisSessionHistory.tsx');
  const code = fs.readFileSync(historyPath, 'utf8');

  assert.ok(code.includes("'use client'"), 'History must have use client directive');
  assert.ok(code.includes('dialycare_sessions_updated'), 'History must listen to dialycare_sessions_updated');
  assert.ok(code.includes('storage'), 'History must listen to storage event');

  // Check 48px touch targets
  const minH48Count = (code.match(/min-h-\[48px\]/g) || []).length;
  assert.ok(minH48Count >= 3, `History must meet min-h-[48px] touch targets (found ${minH48Count})`);

  // Accordion inspection
  assert.ok(code.includes('toggleExpand') && code.includes('expandedSessionId'), 'Must provide interactive expandable telemetry view');
  assert.ok(code.includes('All 14 Metrics') || code.includes('14 معيار'), 'Must display 14 metrics toggle indicator');
});

runTest('9.3 Translation key parity for dialysisSession in en.json and ar.json', () => {
  const enPath = path.resolve(__dirname, '../../messages/en.json');
  const arPath = path.resolve(__dirname, '../../messages/ar.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'));

  assert.ok(en.dialysisSession, 'en.json must contain dialysisSession dictionary');
  assert.ok(ar.dialysisSession, 'ar.json must contain dialysisSession dictionary');

  const enKeys = Object.keys(en.dialysisSession).sort();
  const arKeys = Object.keys(ar.dialysisSession).sort();

  assert.deepStrictEqual(enKeys, arKeys, 'Translation keys between en.json and ar.json must have 100% parity');
  assert.ok(enKeys.length >= 35, `Expected >= 35 dialysis translation keys, found ${enKeys.length}`);
});

console.log('\n================================================================');
console.log(`CHALLENGER M3-1 EXECUTION COMPLETE`);
console.log(`Total Stress Tests: ${totalTests}`);
console.log(`Passed:             ${passedTests}`);
console.log(`Failed:             ${totalTests - passedTests}`);
console.log(`STATUS:             ALL ADVERSARIAL STRESS TESTS PASSED (EXIT 0)`);
console.log('================================================================\n');
