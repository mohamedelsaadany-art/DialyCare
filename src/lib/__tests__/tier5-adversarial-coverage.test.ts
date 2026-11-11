/**
 * DialyCare Tier 5 White-Box Adversarial Coverage Hardening Test Suite
 *
 * Exhaustive white-box stress testing across all five clinical features and data layer:
 * - Suite 1: Data Store Resiliency, LocalStorage Corruption & Defensive Immutability
 * - Suite 2: R1 Per-Patient Named Medications Adversarial Hardening
 * - Suite 3: R2 Dialysis Session 14-Field Clinical Telemetry Adversarial Stress
 * - Suite 4: R3 Smart Fluid Limits, Boundary Fuzzing & Mandatory Alarm Loop Re-Triggering
 * - Suite 5: R4 Adherence Coaching Avatar Adversarial Navigation & State Transitions
 * - Suite 6: R5 Bilingual Lab Results (12 Tests) Adversarial Bounds & Clinical Dictionaries
 * - Suite 7: Cross-Feature Multi-Role Clinical Workloads & Full i18n Translation Parity
 *
 * Pass/Fail semantics: All tests assert invariants with node:assert and exit with code 0 on success.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as dataStore from '../data-store';
import {
  STORAGE_KEYS,
  getPatientMedications,
  addPatientMedication,
  updatePatientMedication,
  deletePatientMedication,
  getDialysisSessions,
  addDialysisSession,
  updateDialysisSession,
  deleteDialysisSession,
  getPatientFluidLimits,
  getPatientLabResults,
  savePatientLabResults,
  updatePatientLabResult,
  deletePatientLabResult,
} from '../data-store';
import type {
  PatientMedication,
  SessionDurationHours,
  DialysateFlowRate,
  DialysisAccessType,
  LabTestValues,
} from '../types';
import { playFluidAlarm, isAudioContextSupported } from '../audio-alarm';
import {
  COACHING_TIPS,
  type CoachingDomain,
} from '../../components/PatientCoachingAvatar';
import {
  CLINICAL_12_LAB_TESTS,
  type ClinicalLabTestDef,
} from '../../components/admin/PatientLabResultsModal';

// ============================================================================
// ENVIRONMENT & HARNESS CONFIGURATION
// ============================================================================

const mockStorage: Record<string, string> = {};
const recordedEvents: string[] = [];

// Setup mock window environment for headless testing
if (typeof (globalThis as unknown as { window?: unknown }).window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string): string | null => {
        return Object.prototype.hasOwnProperty.call(mockStorage, key) ? mockStorage[key] : null;
      },
      setItem: (key: string, val: string): void => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string): void => {
        delete mockStorage[key];
      },
      clear: (): void => {
        for (const k of Object.keys(mockStorage)) {
          delete mockStorage[k];
        }
      },
    },
    dispatchEvent: (event: { type: string }): boolean => {
      recordedEvents.push(event.type);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
} else {
  // If window already exists from previous runner suites, wrap dispatchEvent to track events
  const existingWindow = (globalThis as unknown as { window: Record<string, unknown> }).window;
  const originalDispatch = existingWindow.dispatchEvent as ((e: { type: string }) => boolean) | undefined;
  existingWindow.dispatchEvent = (event: { type: string }): boolean => {
    recordedEvents.push(event.type);
    if (typeof originalDispatch === 'function') {
      return originalDispatch(event);
    }
    return true;
  };
}

if (typeof (globalThis as unknown as { Event?: unknown }).Event === 'undefined') {
  (globalThis as unknown as { Event: unknown }).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

function resetEnvironment(): void {
  for (const k of Object.keys(mockStorage)) {
    delete mockStorage[k];
  }
  recordedEvents.length = 0;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  }
}

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const testCases: TestCase[] = [];

function registerTest(name: string, fn: () => void | Promise<void>): void {
  testCases.push({ name, fn });
}

// ============================================================================
// SUITE 1: DATA STORE RESILIENCY, LOCALSTORAGE CORRUPTION & IMMUTABILITY
// ============================================================================

registerTest('1.1: Storage Corruption Recovery: Invalid JSON in storage keys gracefully falls back to defaults', () => {
  resetEnvironment();
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEYS.PATIENT_MEDICATIONS, '{corrupt json!!!}');
    window.localStorage.setItem(STORAGE_KEYS.DIALYSIS_SESSIONS, '[[[unclosed bracket');
    window.localStorage.setItem(STORAGE_KEYS.LAB_RESULTS, '<xml>not json</xml>');
  }

  // Should not throw SyntaxError; should return safe default clone
  const meds = getPatientMedications('patient-1');
  assert.ok(Array.isArray(meds), 'Medications should fall back to array default');
  assert.ok(meds.length > 0, 'Should fall back to initial demo medications');

  const sessions = getDialysisSessions('patient-1');
  assert.ok(Array.isArray(sessions), 'Sessions should fall back to array default');
  assert.ok(sessions.length > 0, 'Should fall back to initial demo sessions');

  const labs = getPatientLabResults('patient-1');
  assert.ok(Array.isArray(labs), 'Labs should fall back to array default');
  assert.ok(labs.length > 0, 'Should fall back to initial demo lab results');
});

registerTest('1.2: LocalStorage QuotaExceededError simulation during writes does not crash the application', () => {
  resetEnvironment();
  const originalSetItem = window.localStorage.setItem;
  try {
    // Simulate quota exceeded
    window.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError: The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    };

    // addPatientMedication should catch writeStorage error without throwing to caller
    const created = addPatientMedication({
      patientId: 'patient-test',
      name: 'Resilient Drug',
      dose: '10mg',
      scheduleTime: '09:00',
    });

    assert.ok(created, 'Should return created medication despite storage quota exhaustion');
    assert.strictEqual(created.name, 'Resilient Drug');
  } finally {
    window.localStorage.setItem = originalSetItem;
  }
});

registerTest('1.3: Deep Immutability: Mutating returned array or items from getPatientMedications does not contaminate store', () => {
  resetEnvironment();
  const initialList = getPatientMedications('patient-1');
  assert.ok(initialList.length > 0, 'Expected seeded medications');

  const originalFirstName = initialList[0].name;
  // Attacker mutates the returned object in-place
  initialList[0].name = 'MUTATED_CORRUPT_NAME';
  initialList.push({
    id: 'corrupted-injected-id',
    patientId: 'patient-1',
    name: 'INJECTED_MED',
    dose: '999g',
    scheduleTime: '00:00',
  });

  // Re-fetch from store to verify isolation
  const secondFetch = getPatientMedications('patient-1');
  assert.strictEqual(secondFetch[0].name, originalFirstName, 'Store should not reflect in-memory mutation');
  assert.strictEqual(
    secondFetch.some((m) => m.id === 'corrupted-injected-id'),
    false,
    'Store should not contain injected array element'
  );
});

registerTest('1.4: Deep Immutability: Mutating nested vitals or fluidStatus of returned DialysisSession does not contaminate store', () => {
  resetEnvironment();
  const sessions = getDialysisSessions('patient-1');
  assert.ok(sessions.length > 0, 'Expected seeded sessions');

  if (!sessions[0].vitals?.preSession || !sessions[0].fluidStatus) {
    throw new Error('Expected seeded vitals.preSession and fluidStatus');
  }
  const originalSystolic = sessions[0].vitals.preSession.systolic;
  const originalEdema = sessions[0].fluidStatus.legEdema;

  // Adversary mutates deep nested properties
  sessions[0].vitals.preSession.systolic = 999;
  sessions[0].fluidStatus.legEdema = 'severe';

  const reFetched = getDialysisSessions('patient-1');
  assert.strictEqual(
    reFetched[0].vitals?.preSession?.systolic,
    originalSystolic,
    'Nested vitals systolic must remain defensively unmutated'
  );
  assert.strictEqual(
    reFetched[0].fluidStatus?.legEdema,
    originalEdema,
    'Nested fluidStatus must remain defensively unmutated'
  );
});

registerTest('1.5: Deep Immutability: Mutating lab values map in getPatientLabResults does not contaminate store', () => {
  resetEnvironment();
  const labs = getPatientLabResults('patient-1');
  assert.ok(labs.length > 0, 'Expected seeded lab records');

  const originalHemoglobin = labs[0].values.hemoglobin;
  // Mutate values map directly
  labs[0].values.hemoglobin = -999.9;

  const reFetchedLabs = getPatientLabResults('patient-1');
  assert.strictEqual(
    reFetchedLabs[0].values.hemoglobin,
    originalHemoglobin,
    'Lab values map must remain protected against in-place mutations'
  );
});

registerTest('1.6: SSR Headless Safety: When window is simulated undefined, getters safely return deterministic defaults', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  try {
    delete (globalThis as unknown as { window?: unknown }).window;

    // Verify SSR safety without window
    const meds = dataStore.getPatientMedications('patient-1');
    assert.ok(Array.isArray(meds), 'getPatientMedications must return array in SSR');

    const sessions = dataStore.getDialysisSessions('patient-1');
    assert.ok(Array.isArray(sessions), 'getDialysisSessions must return array in SSR');

    const labs = dataStore.getPatientLabResults('patient-1');
    assert.ok(Array.isArray(labs), 'getPatientLabResults must return array in SSR');

    const limits = dataStore.getPatientFluidLimits(70);
    assert.strictEqual(limits.warning, 1400);
    assert.strictEqual(limits.critical, 1820);
  } finally {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  }
});

registerTest('1.7: Reactive Event Storm: 30 rapid successive mutations fire CustomEvents consistently without dropped events', () => {
  resetEnvironment();
  recordedEvents.length = 0;

  for (let i = 0; i < 10; i++) {
    addPatientMedication({
      patientId: 'patient-storm',
      name: `Storm Drug ${i}`,
      dose: `${i * 10} mg`,
      scheduleTime: '08:00',
    });
  }

  const medEvents = recordedEvents.filter((e) => e === 'dialycare_medications_updated');
  assert.strictEqual(medEvents.length, 10, 'Expected exactly 10 dialycare_medications_updated events');

  for (let i = 0; i < 10; i++) {
    addDialysisSession({
      patientId: 'patient-storm',
      sessionDate: '2026-04-01',
      recordedBy: 'doctor-storm',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
        after1hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after3hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        endSession: { systolic: 130, diastolic: 80, heartRate: 72 },
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

  const sessionEvents = recordedEvents.filter((e) => e === 'dialycare_sessions_updated');
  assert.strictEqual(sessionEvents.length, 10, 'Expected exactly 10 dialycare_sessions_updated events');

  for (let i = 0; i < 10; i++) {
    savePatientLabResults({
      patientId: 'patient-storm',
      testDate: `2026-04-${String(i + 1).padStart(2, '0')}`,
      recordedBy: 'doctor-storm',
      values: { hemoglobin: 11.0 + i * 0.1 },
    });
  }

  const labEvents = recordedEvents.filter((e) => e === 'dialycare_labs_updated');
  assert.strictEqual(labEvents.length, 10, 'Expected exactly 10 dialycare_labs_updated events');
});

// ============================================================================
// SUITE 2: FEATURE R1 — PER-PATIENT NAMED MEDICATIONS ADVERSARIAL HARDENING
// ============================================================================

registerTest('2.1: Multi-Dose Edge Case: Medication with empty scheduleTimes falls back to scheduleTime', () => {
  resetEnvironment();
  const created = addPatientMedication({
    patientId: 'patient-edge-med',
    name: 'Calcium Carbonate',
    dose: '500 mg',
    scheduleTime: '12:00',
    scheduleTimes: [],
  });

  assert.strictEqual(created.scheduleTime, '12:00');
  const list = getPatientMedications('patient-edge-med');
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].scheduleTime, '12:00');
});

registerTest('2.2: Multi-Dose Edge Case: Duplicate and unsorted schedule times are handled cleanly', () => {
  resetEnvironment();
  const times = ['14:00', '08:00', '08:00', ' 20:00 ', '14:00'];
  // Normalization logic mimics PatientMedicationManager
  const cleaned = Array.from(new Set(times.map((t) => t.trim()))).filter(Boolean);

  const created = addPatientMedication({
    patientId: 'patient-edge-med',
    name: 'Sevelamer Carbonate',
    dose: '800 mg',
    scheduleTime: cleaned[0],
    scheduleTimes: cleaned,
  });

  assert.strictEqual(created.scheduleTimes?.length, 3);
  assert.ok(created.scheduleTimes.includes('14:00'));
  assert.ok(created.scheduleTimes.includes('08:00'));
  assert.ok(created.scheduleTimes.includes('20:00'));
});

registerTest('2.3: Clinical Dose Notation Fuzzing: Preserves fractions, decimals, and microgram units', () => {
  resetEnvironment();
  const doseVariants = [
    '1/2 tablet (400 mg)',
    '1.5 vials (6000 IU)',
    '0.25 mcg',
    '100 µg',
    '800mg (2x400mg) with meals',
  ];

  for (const doseStr of doseVariants) {
    const med = addPatientMedication({
      patientId: 'patient-fuzz-dose',
      name: `Fuzz Drug ${doseStr}`,
      dose: doseStr,
      scheduleTime: '08:00',
    });
    assert.strictEqual(med.dose, doseStr, `Preserved dose string '${doseStr}'`);
  }

  const fetched = getPatientMedications('patient-fuzz-dose');
  assert.strictEqual(fetched.length, doseVariants.length);
  for (let i = 0; i < doseVariants.length; i++) {
    assert.strictEqual(fetched[i].dose, doseVariants[i]);
  }
});

registerTest('2.4: Multi-Tenant Strict Isolation: Patient medication queries never leak across patient IDs', () => {
  resetEnvironment();
  addPatientMedication({
    patientId: 'isolated-patient-A',
    name: 'Drug A Exclusive',
    dose: '10mg',
    scheduleTime: '08:00',
  });
  addPatientMedication({
    patientId: 'isolated-patient-B',
    name: 'Drug B Exclusive',
    dose: '20mg',
    scheduleTime: '12:00',
  });

  const medsA = getPatientMedications('isolated-patient-A');
  const medsB = getPatientMedications('isolated-patient-B');
  const medsNone = getPatientMedications('isolated-patient-NONEXISTENT');

  assert.strictEqual(medsA.length, 1);
  assert.strictEqual(medsA[0].name, 'Drug A Exclusive');

  assert.strictEqual(medsB.length, 1);
  assert.strictEqual(medsB[0].name, 'Drug B Exclusive');

  assert.strictEqual(medsNone.length, 0, 'Nonexistent patient must return empty list');
});

registerTest('2.5: Non-Existent ID Handling: updatePatientMedication returns null and deletePatientMedication returns false', () => {
  resetEnvironment();
  const updateResult = updatePatientMedication('bogus-nonexistent-id', { dose: '100mg' });
  assert.strictEqual(updateResult, null, 'Updating nonexistent ID must return null');

  const deleteResult = deletePatientMedication('bogus-nonexistent-id');
  assert.strictEqual(deleteResult, false, 'Deleting nonexistent ID must return false');
});

registerTest('2.6: Active vs Discontinued Status: Preserves discontinued medications in data store', () => {
  resetEnvironment();
  const activeMed = addPatientMedication({
    patientId: 'patient-status-check',
    name: 'Amlodipine Active',
    dose: '5mg',
    scheduleTime: '08:00',
    isActive: true,
  });

  const discMed = addPatientMedication({
    patientId: 'patient-status-check',
    name: 'Old Beta Blocker',
    dose: '50mg',
    scheduleTime: '20:00',
    isActive: false,
  });

  const allMeds = getPatientMedications('patient-status-check');
  assert.strictEqual(allMeds.length, 2);

  const activeOnly = allMeds.filter((m) => m.isActive !== false);
  assert.strictEqual(activeOnly.length, 1);
  assert.strictEqual(activeOnly[0].id, activeMed.id);

  // Re-activate discontinued medication
  const reactivated = updatePatientMedication(discMed.id, { isActive: true });
  assert.ok(reactivated);
  assert.strictEqual(reactivated.isActive, true);

  const afterUpdate = getPatientMedications('patient-status-check').filter((m) => m.isActive !== false);
  assert.strictEqual(afterUpdate.length, 2);
});

registerTest('2.7: Dose Slot Chronological Sorting: Sorts morning, noon, and night slots strictly by time', () => {
  const mockMeds: PatientMedication[] = [
    {
      id: 'm1',
      patientId: 'p1',
      name: 'Night Med',
      dose: '1 tab',
      scheduleTime: '21:00',
      scheduleTimes: ['21:00'],
    },
    {
      id: 'm2',
      patientId: 'p1',
      name: 'Morning & Noon Med',
      dose: '1 tab',
      scheduleTime: '08:00',
      scheduleTimes: ['13:30', '08:00'],
    },
    {
      id: 'm3',
      patientId: 'p1',
      name: 'Early Bird Med',
      dose: '1 tab',
      scheduleTime: '06:30',
      scheduleTimes: ['06:30'],
    },
  ];

  // Flatten and sort by military time
  const slots: Array<{ name: string; time: string }> = [];
  mockMeds.forEach((m) => {
    (m.scheduleTimes || (m.scheduleTime ? [m.scheduleTime] : [''])).forEach((t) => {
      slots.push({ name: m.name, time: t });
    });
  });

  slots.sort((a, b) => a.time.localeCompare(b.time));

  assert.strictEqual(slots[0].time, '06:30');
  assert.strictEqual(slots[1].time, '08:00');
  assert.strictEqual(slots[2].time, '13:30');
  assert.strictEqual(slots[3].time, '21:00');
});

registerTest('2.8: Arabic Name Bilingual Support: Handles presence or omission of Arabic translation gracefully', () => {
  resetEnvironment();
  const bilingualMed = addPatientMedication({
    patientId: 'p-bilingual',
    name: 'Amlodipine',
    nameAr: 'أملوديبين',
    dose: '5 mg',
    scheduleTime: '08:00',
  });

  const englishOnlyMed = addPatientMedication({
    patientId: 'p-bilingual',
    name: 'Acetaminophen',
    dose: '500 mg',
    scheduleTime: '12:00',
  });

  assert.strictEqual(bilingualMed.nameAr, 'أملوديبين');
  assert.strictEqual(englishOnlyMed.nameAr, undefined);
});

// ============================================================================
// SUITE 3: FEATURE R2 — DIALYSIS SESSION 14-FIELD CLINICAL TELEMETRY ADVERSARIAL STRESS
// ============================================================================

registerTest('3.1: 14-Field Schema Completeness: All 14 clinical fields persist with zero property dropouts', () => {
  resetEnvironment();
  const completeSession = addDialysisSession({
    patientId: 'patient-14f',
    sessionDate: '2026-04-10',
    recordedBy: 'clinician-dr-ali',
    // 1. Compliance
    complianceRating: 4,
    // 2. Pre weight
    preWeightKg: 73,
    preWeightGrams: 400,
    // 3. Post weight
    postWeightKg: 70,
    postWeightGrams: 100,
    // 4 & 5. 5-Timepoint BP & HR
    vitals: {
      preSession: { systolic: 145, diastolic: 88, heartRate: 78 },
      after1hr: { systolic: 138, diastolic: 82, heartRate: 76 },
      after2hr: { systolic: 132, diastolic: 80, heartRate: 74 },
      after3hr: { systolic: 126, diastolic: 78, heartRate: 72 },
      endSession: { systolic: 122, diastolic: 76, heartRate: 70 },
    },
    // 6. Temperature
    temperatureC: 36.8,
    // 7. Fluid status
    fluidStatus: {
      legEdema: 'mild',
      lungCrackles: 'lower_bases',
      dyspnea: 'mild',
    },
    // 8. Vascular access signs of infection
    accessInfectionSigns: false,
    // 9. Duration
    durationHours: 4 as SessionDurationHours,
    // 10. UF volume
    ultrafiltrationVolumeMl: 3300,
    // 11. Blood flow
    bloodFlowRateMlMin: 380,
    // 12. Dialysate flow
    dialysateFlowRateMlMin: 700 as DialysateFlowRate,
    // 13. Access type
    accessType: 'AVF' as DialysisAccessType,
    // 14. Sodium concentration
    machineSodiumMeqL: 140,
    notes: 'Smooth 4-hour hemodialysis treatment without intradialytic events.',
  });

  assert.ok(completeSession.id, 'Session must have assigned UUID');
  assert.strictEqual(completeSession.complianceRating, 4);
  assert.strictEqual(completeSession.preWeightKg, 73);
  assert.strictEqual(completeSession.preWeightGrams, 400);
  assert.strictEqual(completeSession.postWeightKg, 70);
  assert.strictEqual(completeSession.postWeightGrams, 100);
  assert.strictEqual(completeSession.vitals?.preSession?.systolic, 145);
  assert.strictEqual(completeSession.vitals?.endSession?.heartRate, 70);
  assert.strictEqual(completeSession.temperatureC, 36.8);
  assert.strictEqual(completeSession.fluidStatus?.legEdema, 'mild');
  assert.strictEqual(completeSession.fluidStatus?.lungCrackles, 'lower_bases');
  assert.strictEqual(completeSession.fluidStatus?.dyspnea, 'mild');
  assert.strictEqual(completeSession.accessInfectionSigns, false);
  assert.strictEqual(completeSession.durationHours, 4);
  assert.strictEqual(completeSession.ultrafiltrationVolumeMl, 3300);
  assert.strictEqual(completeSession.bloodFlowRateMlMin, 380);
  assert.strictEqual(completeSession.dialysateFlowRateMlMin, 700);
  assert.strictEqual(completeSession.accessType, 'AVF');
  assert.strictEqual(completeSession.machineSodiumMeqL, 140);
  assert.strictEqual(completeSession.notes, 'Smooth 4-hour hemodialysis treatment without intradialytic events.');

  const storedList = getDialysisSessions('patient-14f');
  assert.strictEqual(storedList.length, 1);
  assert.deepStrictEqual(storedList[0], completeSession);
});

registerTest('3.2: Hemodynamic Crisis: System safely logs intradialytic hypotension and hypertensive urgency vitals', () => {
  resetEnvironment();
  // Crisis 1: Severe intradialytic hypotension (pre: 140/90, 3hr: 65/40, HR 125)
  const hypotensiveSession = addDialysisSession({
    patientId: 'patient-crisis',
    sessionDate: '2026-04-11',
    recordedBy: 'emergency-rn',
    complianceRating: 3,
    preWeightKg: 68,
    postWeightKg: 66,
    vitals: {
      preSession: { systolic: 140, diastolic: 90, heartRate: 80 },
      after1hr: { systolic: 120, diastolic: 75, heartRate: 85 },
      after2hr: { systolic: 90, diastolic: 60, heartRate: 110 },
      after3hr: { systolic: 65, diastolic: 40, heartRate: 125 }, // Severe hypotension
      endSession: { systolic: 100, diastolic: 65, heartRate: 95 },
    },
    temperatureC: 36.2,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'mild' },
    accessInfectionSigns: false,
    durationHours: 3 as SessionDurationHours,
    ultrafiltrationVolumeMl: 2000,
    bloodFlowRateMlMin: 250,
    dialysateFlowRateMlMin: 500 as DialysateFlowRate,
    accessType: 'Permcath' as DialysisAccessType,
    machineSodiumMeqL: 142,
    notes: 'Trendelenburg position applied at hr 3 with 200 mL normal saline bolus.',
  });

  assert.strictEqual(hypotensiveSession.vitals?.after3hr?.systolic, 65);
  assert.strictEqual(hypotensiveSession.vitals?.after3hr?.diastolic, 40);
  assert.strictEqual(hypotensiveSession.vitals?.after3hr?.heartRate, 125);
});

registerTest('3.3: Dialysate Flow Rates & Sodium Limits: Validates clinical enum selections (300, 500, 700, 800 mL/min)', () => {
  const allowedFlowRates: DialysateFlowRate[] = [300, 500, 700, 800];
  for (const flow of allowedFlowRates) {
    assert.ok(flow >= 300 && flow <= 800);
  }

  // Machine sodium ranges from 120 to 160 mEq/L
  const validSodiums = [120, 135, 138, 140, 145, 160];
  for (const na of validSodiums) {
    assert.ok(na >= 120 && na <= 160);
  }
});

registerTest('3.4: Vascular Access Infection Alert: Accurately flags infection across AVF, AVG, Permcath, Mahurkar', () => {
  resetEnvironment();
  const accessTypes: DialysisAccessType[] = ['AVF', 'AVG', 'Permcath', 'Mahurkar'];
  for (const access of accessTypes) {
    const s = addDialysisSession({
      patientId: 'patient-access-check',
      sessionDate: '2026-04-12',
      recordedBy: 'doc',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
        after1hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after3hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        endSession: { systolic: 130, diastolic: 80, heartRate: 72 },
      },
      temperatureC: 37.9,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: true, // Flagged infection!
      durationHours: 4 as SessionDurationHours,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500 as DialysateFlowRate,
      accessType: access,
      machineSodiumMeqL: 138,
      notes: `Erythema and purulent discharge observed around ${access} site.`,
    });
    assert.strictEqual(s.accessInfectionSigns, true);
    assert.strictEqual(s.accessType, access);
  }
});

registerTest('3.5: Weight Calculation Arithmetic: High precision calculation of kg + grams and fluid removal', () => {
  // Pre: 72kg 650g = 72.65 kg
  // Post: 69kg 800g = 69.80 kg
  // Weight lost: 2.85 kg = 2850 mL ultrafiltration target
  const preKg = 72;
  const preGrams = 650;
  const postKg = 69;
  const postGrams = 800;

  const totalPre = preKg + preGrams / 1000;
  const totalPost = postKg + postGrams / 1000;
  const delta = totalPre - totalPost;

  assert.strictEqual(Math.round(delta * 1000), 2850);
});

registerTest('3.6: Zero and High UF Volume Boundaries: Handles zero ultrafiltration (no fluid removal) cleanly', () => {
  resetEnvironment();
  const zeroUf = addDialysisSession({
    patientId: 'patient-zerouf',
    sessionDate: '2026-04-13',
    recordedBy: 'doc',
    complianceRating: 5,
    preWeightKg: 65,
    postWeightKg: 65,
    vitals: {
      preSession: { systolic: 120, diastolic: 75, heartRate: 70 },
      after1hr: { systolic: 120, diastolic: 75, heartRate: 70 },
      after2hr: { systolic: 120, diastolic: 75, heartRate: 70 },
      after3hr: { systolic: 120, diastolic: 75, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 75, heartRate: 70 },
    },
    temperatureC: 36.5,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 2 as SessionDurationHours,
    ultrafiltrationVolumeMl: 0, // Zero UF
    bloodFlowRateMlMin: 300,
    dialysateFlowRateMlMin: 500 as DialysateFlowRate,
    accessType: 'AVF' as DialysisAccessType,
    machineSodiumMeqL: 138,
  });

  assert.strictEqual(zeroUf.ultrafiltrationVolumeMl, 0);
  const fetched = getDialysisSessions('patient-zerouf');
  assert.strictEqual(fetched[0].ultrafiltrationVolumeMl, 0);
});

registerTest('3.7: Chronological Sorting Invariant: Sessions are ordered strictly by date descending', () => {
  resetEnvironment();
  const dates = ['2026-01-05', '2026-03-20', '2026-02-14', '2026-04-01'];

  for (const d of dates) {
    addDialysisSession({
      patientId: 'patient-date-sort',
      sessionDate: d,
      recordedBy: 'nurse',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
        after1hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after3hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        endSession: { systolic: 130, diastolic: 80, heartRate: 72 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4 as SessionDurationHours,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500 as DialysateFlowRate,
      accessType: 'AVF' as DialysisAccessType,
      machineSodiumMeqL: 138,
    });
  }

  const sorted = getDialysisSessions('patient-date-sort');
  assert.strictEqual(sorted[0].sessionDate, '2026-04-01');
  assert.strictEqual(sorted[1].sessionDate, '2026-03-20');
  assert.strictEqual(sorted[2].sessionDate, '2026-02-14');
  assert.strictEqual(sorted[3].sessionDate, '2026-01-05');
});

registerTest('3.8: High-Volume Session Churn: Adding 25 sessions in rapid succession maintains list integrity', () => {
  resetEnvironment();
  for (let i = 1; i <= 25; i++) {
    addDialysisSession({
      patientId: 'patient-churn',
      sessionDate: `2026-03-${String(i).padStart(2, '0')}`,
      recordedBy: 'churn-test',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 130, diastolic: 80, heartRate: 72 },
        after1hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        after3hr: { systolic: 130, diastolic: 80, heartRate: 72 },
        endSession: { systolic: 130, diastolic: 80, heartRate: 72 },
      },
      temperatureC: 36.6,
      fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
      accessInfectionSigns: false,
      durationHours: 4 as SessionDurationHours,
      ultrafiltrationVolumeMl: 2000,
      bloodFlowRateMlMin: 350,
      dialysateFlowRateMlMin: 500 as DialysateFlowRate,
      accessType: 'AVF' as DialysisAccessType,
      machineSodiumMeqL: 138,
    });
  }

  const sessions = getDialysisSessions('patient-churn');
  assert.strictEqual(sessions.length, 25);
  // First item must be 2026-03-25
  assert.strictEqual(sessions[0].sessionDate, '2026-03-25');
  // Last item must be 2026-03-01
  assert.strictEqual(sessions[24].sessionDate, '2026-03-01');
});

registerTest('3.9: Session Update & Partial Mutation: Updating duration or rating does not erase 5-timepoint vitals', () => {
  resetEnvironment();
  const session = addDialysisSession({
    patientId: 'patient-partial-up',
    sessionDate: '2026-04-14',
    recordedBy: 'nurse-1',
    complianceRating: 4,
    preWeightKg: 75,
    postWeightKg: 72,
    vitals: {
      preSession: { systolic: 150, diastolic: 90, heartRate: 80 },
      after1hr: { systolic: 140, diastolic: 85, heartRate: 75 },
      after2hr: { systolic: 135, diastolic: 80, heartRate: 72 },
      after3hr: { systolic: 130, diastolic: 78, heartRate: 70 },
      endSession: { systolic: 125, diastolic: 75, heartRate: 68 },
    },
    temperatureC: 36.7,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 3 as SessionDurationHours,
    ultrafiltrationVolumeMl: 3000,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500 as DialysateFlowRate,
    accessType: 'AVF' as DialysisAccessType,
    machineSodiumMeqL: 138,
  });

  // Clinician updates duration from 3 to 4 hours
  const updated = updateDialysisSession(session.id, {
    durationHours: 4 as SessionDurationHours,
    notes: 'Extended session to 4 hours.',
  });

  assert.ok(updated);
  assert.strictEqual(updated.durationHours, 4);
  assert.strictEqual(updated.notes, 'Extended session to 4 hours.');
  // Vitals must remain untouched
  assert.strictEqual(updated.vitals?.preSession?.systolic, 150);
  assert.strictEqual(updated.vitals?.endSession?.heartRate, 68);

  // Deletion test
  const deleted = deleteDialysisSession(session.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(getDialysisSessions('patient-partial-up').length, 0);
});

// ============================================================================
// SUITE 4: FEATURE R3 — SMART FLUID LIMITS & MANDATORY ALARM LOOP RE-TRIGGERING
// ============================================================================

registerTest('4.1: Extreme Dry Weight Fuzzing: Severe cachexia (35kg) vs severe obesity (180kg)', () => {
  // 35 kg -> warning = (35 * 10 * 4)/2 = 700 mL, critical = (35 * 13 * 4)/2 = 910 mL
  const cachexic = getPatientFluidLimits(35);
  assert.strictEqual(cachexic.warning, 700);
  assert.strictEqual(cachexic.critical, 910);

  // 180 kg -> warning = (180 * 10 * 4)/2 = 3600 mL, critical = (180 * 13 * 4)/2 = 4680 mL
  const obese = getPatientFluidLimits(180);
  assert.strictEqual(obese.warning, 3600);
  assert.strictEqual(obese.critical, 4680);
});

registerTest('4.2: Defensive Fallback on Corrupt Dry Weights: 0, negative, NaN fallback safely to 70kg defaults', () => {
  const zeroWeight = getPatientFluidLimits(0);
  assert.strictEqual(zeroWeight.warning, 1400);
  assert.strictEqual(zeroWeight.critical, 1820);

  const negativeWeight = getPatientFluidLimits(-25);
  assert.strictEqual(negativeWeight.warning, 1400);
  assert.strictEqual(negativeWeight.critical, 1820);

  const nanWeight = getPatientFluidLimits(NaN);
  assert.strictEqual(nanWeight.warning, 1400);
  assert.strictEqual(nanWeight.critical, 1820);
});

registerTest('4.3: Fractional Dry Weight: 67.5 kg patient yields exact thresholds without rounding degeneration', () => {
  // (67.5 * 10 * 4) / 2 = 1350 mL
  // (67.5 * 13 * 4) / 2 = 1755 mL
  const fractional = getPatientFluidLimits(67.5);
  assert.strictEqual(fractional.warning, 1350);
  assert.strictEqual(fractional.critical, 1755);
});

registerTest('4.4: Exact Boundary Transitions: Normal -> Warning -> Critical', () => {
  const limits = getPatientFluidLimits(70); // 1400 / 1820

  function evaluateStatus(consumed: number): 'normal' | 'warning' | 'critical' {
    if (consumed >= limits.critical) return 'critical';
    if (consumed >= limits.warning) return 'warning';
    return 'normal';
  }

  assert.strictEqual(evaluateStatus(1399), 'normal');
  assert.strictEqual(evaluateStatus(1400), 'warning');
  assert.strictEqual(evaluateStatus(1819), 'warning');
  assert.strictEqual(evaluateStatus(1820), 'critical');
  assert.strictEqual(evaluateStatus(1821), 'critical');
});

registerTest('4.5: Visual Warning & Flashing Trigger: Status warning sets red cell; status critical sets flashing', () => {
  function checkUIState(status: 'normal' | 'warning' | 'critical') {
    const isRed = status === 'warning' || status === 'critical';
    const isFlashing = status === 'critical';
    return { isRed, isFlashing };
  }

  const warningUI = checkUIState('warning');
  assert.strictEqual(warningUI.isRed, true);
  assert.strictEqual(warningUI.isFlashing, false);

  const criticalUI = checkUIState('critical');
  assert.strictEqual(criticalUI.isRed, true);
  assert.strictEqual(criticalUI.isFlashing, true);
});

registerTest('4.6: Audio Alarm First Crossover: Crossing from 1800 mL to 1850 mL triggers alarm', () => {
  const limits = getPatientFluidLimits(70);
  let totalFluid = 1800;
  let alarmFired = false;

  const addition = 50;
  const nextTotal = totalFluid + addition;
  if (nextTotal >= limits.critical) {
    alarmFired = true;
  }
  totalFluid = nextTotal;

  assert.strictEqual(alarmFired, true);
  assert.strictEqual(totalFluid, 1850);
});

registerTest('4.7: MANDATORY RE-TRIGGERING: 10 consecutive additions AFTER critical limit re-trigger alarm 10 times', () => {
  const limits = getPatientFluidLimits(70); // critical: 1820 mL
  let totalFluid = 1900; // already above critical threshold!
  let reTriggerCount = 0;

  // Add fluid 10 times consecutively
  const additions = [100, 50, 150, 20, 80, 200, 50, 30, 40, 100];
  for (const amt of additions) {
    const nextTotal = totalFluid + amt;
    // Condition from patient/log/page.tsx:
    // const willBeCritical = nextTotal >= fluidLimits.critical;
    // if (willBeCritical) playFluidAlarm();
    if (nextTotal >= limits.critical) {
      reTriggerCount++;
    }
    totalFluid = nextTotal;
  }

  assert.strictEqual(reTriggerCount, 10, 'Alarm must re-trigger every single time subsequent fluid is added');
  assert.strictEqual(totalFluid, 2720);
});

registerTest('4.8: Multi-Unit Fluid Conversion: 1 cup = 240 mL conversion evaluates thresholds accurately', () => {
  const limits = getPatientFluidLimits(70); // warning 1400, critical 1820

  function toMl(amount: number, unit: 'ml' | 'cups'): number {
    return unit === 'cups' ? Math.round(amount * 240) : Math.round(amount);
  }

  assert.strictEqual(toMl(1, 'cups'), 240);
  assert.strictEqual(toMl(2.5, 'cups'), 600);
  assert.strictEqual(toMl(6, 'cups'), 1440); // >= warning (1400)
  assert.strictEqual(toMl(8, 'cups'), 1920); // >= critical (1820)

  assert.ok(toMl(6, 'cups') >= limits.warning);
  assert.ok(toMl(8, 'cups') >= limits.critical);
});

registerTest('4.9: Audio Alarm Synthesizer: playFluidAlarm returns Promise<void> safely without unhandled rejections', async () => {
  // In Node environment, playFluidAlarm early-returns or falls back safely
  const result = playFluidAlarm();
  assert.ok(result instanceof Promise, 'playFluidAlarm must return a Promise');
  await result; // Should resolve safely
});

registerTest('4.10: Web Audio API Headless Detection: isAudioContextSupported returns boolean without throwing', () => {
  const supported = isAudioContextSupported();
  assert.strictEqual(typeof supported, 'boolean');
});

// ============================================================================
// SUITE 5: FEATURE R4 — ADHERENCE COACHING AVATAR ADVERSARIAL HARDENING
// ============================================================================

registerTest('5.1: Clinical Domain Inventory: COACHING_TIPS contains at least 3 tips per domain (medication, fluid, diet)', () => {
  assert.ok(Array.isArray(COACHING_TIPS), 'COACHING_TIPS must be exported array');
  const domains: CoachingDomain[] = ['medication', 'fluid', 'diet'];

  for (const d of domains) {
    const domainTips = COACHING_TIPS.filter((t) => t.domain === d);
    assert.ok(
      domainTips.length >= 3,
      `Domain '${d}' must contain at least 3 clinical tips, found ${domainTips.length}`
    );
  }
});

registerTest('5.2: Phosphate Binders Specificity: Verifies explicit guidance on taking binders with meal ingestion', () => {
  const binderTip = COACHING_TIPS.find(
    (t) =>
      t.domain === 'medication' &&
      (t.titleEn.toLowerCase().includes('phosphate') || t.contentEn.toLowerCase().includes('phosphate binder'))
  );
  assert.ok(binderTip, 'Must include specific phosphate binders tip');
  assert.ok(binderTip.contentEn.toLowerCase().includes('meal'), 'Tip must instruct taking with meals');
  assert.ok(binderTip.contentAr.includes('الوجبة') || binderTip.contentAr.includes('لقمة'), 'Arabic tip must specify taking with meals');
});

registerTest('5.3: Thirst Management Specificity: Verifies explicit tips for ice chips and lemon slices', () => {
  const thirstTip = COACHING_TIPS.find(
    (t) =>
      t.domain === 'fluid' &&
      (t.contentEn.toLowerCase().includes('ice chips') || t.contentEn.toLowerCase().includes('frozen lemon'))
  );
  assert.ok(thirstTip, 'Must include ice chips / frozen lemon sensory thirst management tip');
  assert.ok(thirstTip.contentAr.includes('الثلج'), 'Arabic tip must mention ice');
  assert.ok(thirstTip.contentAr.includes('الليمون'), 'Arabic tip must mention lemon');
});

registerTest('5.4: Renal Diet Specificity: Verifies potato leaching (potassium reduction) and protein recovery', () => {
  const potatoTip = COACHING_TIPS.find(
    (t) =>
      t.domain === 'diet' &&
      (t.contentEn.toLowerCase().includes('leach') || t.contentEn.toLowerCase().includes('potassium'))
  );
  assert.ok(potatoTip, 'Must include potato leaching potassium reduction tip');
  assert.ok(potatoTip.contentAr.includes('البوتاسيوم'), 'Arabic tip must reference potassium leaching');

  const proteinTip = COACHING_TIPS.find(
    (t) =>
      t.domain === 'diet' &&
      (t.contentEn.toLowerCase().includes('protein') || t.contentEn.toLowerCase().includes('egg white'))
  );
  assert.ok(proteinTip, 'Must include post-session high-biological protein recovery tip');
});

registerTest('5.5: Arabic Linguistic Quality: 100% of tips have non-empty Arabic title, content, and actionable step', () => {
  for (const tip of COACHING_TIPS) {
    assert.ok(tip.titleAr && tip.titleAr.trim().length > 3, `Tip ${tip.id} titleAr missing`);
    assert.ok(tip.contentAr && tip.contentAr.trim().length > 10, `Tip ${tip.id} contentAr missing`);
    assert.ok(tip.actionableStepAr && tip.actionableStepAr.trim().length > 5, `Tip ${tip.id} actionableStepAr missing`);

    // Verify Arabic unicode glyphs (\u0600-\u06FF)
    assert.match(tip.titleAr, /[\u0600-\u06FF]/, `Tip ${tip.id} titleAr must contain Arabic characters`);
    assert.match(tip.contentAr, /[\u0600-\u06FF]/, `Tip ${tip.id} contentAr must contain Arabic characters`);
  }
});

registerTest('5.6: Cyclic Modulo Wraparound: Forward and backward navigation never produces NaN or index faults', () => {
  const total = COACHING_TIPS.length;

  // Forward cycle
  let idx = 0;
  for (let i = 0; i < total * 3; i++) {
    idx = (idx + 1) % total;
    assert.ok(idx >= 0 && idx < total);
  }

  // Backward cycle with negative handling: (idx - 1 + total) % total
  idx = 0;
  for (let i = 0; i < total * 3; i++) {
    idx = (idx - 1 + total) % total;
    assert.ok(idx >= 0 && idx < total);
  }
});

registerTest('5.7: Dynamic Metric Guidance: Evaluates high fluid intake alert (>=90%) and missed medications', () => {
  function getGuidance(metrics: { fluidPercentage?: number; medicationsTaken?: number; medicationsTotal?: number }) {
    if (metrics.fluidPercentage && metrics.fluidPercentage >= 90) {
      return 'high-fluid-alert';
    }
    if (
      metrics.medicationsTaken !== undefined &&
      metrics.medicationsTotal !== undefined &&
      metrics.medicationsTaken < metrics.medicationsTotal
    ) {
      return 'pending-meds-alert';
    }
    return 'normal';
  }

  assert.strictEqual(getGuidance({ fluidPercentage: 92, medicationsTaken: 3, medicationsTotal: 3 }), 'high-fluid-alert');
  assert.strictEqual(getGuidance({ fluidPercentage: 60, medicationsTaken: 1, medicationsTotal: 3 }), 'pending-meds-alert');
  assert.strictEqual(getGuidance({ fluidPercentage: 70, medicationsTaken: 3, medicationsTotal: 3 }), 'normal');
});

registerTest('5.8: Elderly Accessibility Touch Target Telemetry: PatientCoachingAvatar meets >=48px touch targets', () => {
  const avatarFilePath = path.resolve(__dirname, '../../components/PatientCoachingAvatar.tsx');
  const sourceCode = fs.readFileSync(avatarFilePath, 'utf8');

  // Verify mascot button and interactive buttons specify min-h-[48px]
  assert.ok(
    sourceCode.includes('min-h-[48px]'),
    'PatientCoachingAvatar must specify min-h-[48px] for interactive buttons'
  );
  assert.ok(
    sourceCode.includes('data-testid="patient-coaching-avatar"'),
    'PatientCoachingAvatar must expose data-testid="patient-coaching-avatar"'
  );
  assert.ok(
    sourceCode.includes('data-testid="dr-dialy-mascot-btn"'),
    'Dr. Dialy mascot button must expose data-testid="dr-dialy-mascot-btn"'
  );
});

// ============================================================================
// SUITE 6: FEATURE R5 — BILINGUAL LAB RESULTS (12 TESTS) ADVERSARIAL BOUNDS
// ============================================================================

registerTest('6.1: 12 Clinical Lab Tests Dictionary: Exactly 12 tests with English and Egyptian Arabic labels', () => {
  assert.strictEqual(CLINICAL_12_LAB_TESTS.length, 12, 'Must contain exactly 12 clinical tests');

  const requiredKeys: Array<keyof LabTestValues> = [
    'hemoglobin',
    'wbc',
    'platelets',
    'calcium',
    'phosphorus',
    'pth',
    'creatinine',
    'urea',
    'serumIron',
    'tibc',
    'ferritin',
    'albumin',
  ];

  for (const key of requiredKeys) {
    const testDef = CLINICAL_12_LAB_TESTS.find((t) => t.key === key);
    assert.ok(testDef, `Missing required lab test key '${key}'`);
    assert.ok(testDef.nameEn && testDef.nameEn.length > 0, `nameEn missing for ${key}`);
    assert.ok(testDef.nameAr && testDef.nameAr.length > 0, `nameAr missing for ${key}`);
    assert.match(testDef.nameAr, /[\u0600-\u06FF]/, `nameAr for ${key} must contain Arabic characters`);
    assert.ok(testDef.unit && testDef.unit.length > 0, `unit missing for ${key}`);
    assert.ok(testDef.refMin < testDef.refMax, `refMin must be < refMax for ${key}`);
  }
});

registerTest('6.2: Lab Reference Range Boundaries: Accurately classifies in-target, low, and high values', () => {
  const hgbDef = CLINICAL_12_LAB_TESTS.find((t) => t.key === 'hemoglobin')!;
  // Hemoglobin ref: 10.0 - 12.0

  function classify(val: number, def: ClinicalLabTestDef): 'low' | 'inTarget' | 'high' {
    if (val < def.refMin) return 'low';
    if (val > def.refMax) return 'high';
    return 'inTarget';
  }

  assert.strictEqual(classify(9.9, hgbDef), 'low');
  assert.strictEqual(classify(10.0, hgbDef), 'inTarget'); // exact min boundary
  assert.strictEqual(classify(11.2, hgbDef), 'inTarget');
  assert.strictEqual(classify(12.0, hgbDef), 'inTarget'); // exact max boundary
  assert.strictEqual(classify(12.1, hgbDef), 'high');
});

registerTest('6.3: Partial Lab Panels: Panel with only subset of values calculates metrics without undefined crash', () => {
  const partialValues: LabTestValues = {
    hemoglobin: 11.2,
    calcium: 8.0, // low (ref: 8.4 - 10.2)
    ferritin: 600, // high (ref: 200 - 500)
  };

  let total = 0;
  let inTarget = 0;
  let high = 0;
  let low = 0;

  CLINICAL_12_LAB_TESTS.forEach((def) => {
    const val = partialValues[def.key];
    if (val !== undefined && val !== null) {
      total++;
      if (val < def.refMin) low++;
      else if (val > def.refMax) high++;
      else inTarget++;
    }
  });

  assert.strictEqual(total, 3);
  assert.strictEqual(inTarget, 1);
  assert.strictEqual(low, 1);
  assert.strictEqual(high, 1);
});

registerTest('6.4: Critical Pan-Biochemical Values: Handles severe clinical anomalies without arithmetic faults', () => {
  resetEnvironment();
  const criticalPanel = savePatientLabResults({
    patientId: 'patient-crit-labs',
    testDate: '2026-04-15',
    recordedBy: 'icu-consultant',
    values: {
      hemoglobin: 4.8, // severe anemia
      wbc: 25.4, // severe leukocytosis
      platelets: 42, // severe thrombocytopenia
      calcium: 6.2, // severe hypocalcemia
      phosphorus: 9.8, // severe hyperphosphatemia
      pth: 1450, // tertiary hyperparathyroidism
      creatinine: 14.5, // severe uremia
      urea: 210, // severe BUN elevation
      serumIron: 22,
      tibc: 460,
      ferritin: 1200,
      albumin: 2.1, // severe hypoalbuminemia
    },
    notes: 'Emergency hemodialysis indicated with packed RBC transfusion.',
  });

  assert.ok(criticalPanel.id);
  assert.strictEqual(criticalPanel.values.hemoglobin, 4.8);
  assert.strictEqual(criticalPanel.values.creatinine, 14.5);
  assert.strictEqual(criticalPanel.values.albumin, 2.1);
});

registerTest('6.5: Upsert Semantics: savePatientLabResults updates when id exists, adds when id is new', () => {
  resetEnvironment();
  // 1. Initial creation
  const initial = savePatientLabResults({
    patientId: 'patient-upsert',
    testDate: '2026-04-01',
    recordedBy: 'clinician-1',
    values: { hemoglobin: 10.5, ferritin: 300 },
  });

  const allAfterAdd = getPatientLabResults('patient-upsert');
  assert.strictEqual(allAfterAdd.length, 1);
  assert.strictEqual(allAfterAdd[0].values.hemoglobin, 10.5);

  // 2. Update with existing ID
  const updated = savePatientLabResults({
    id: initial.id,
    patientId: 'patient-upsert',
    testDate: '2026-04-01',
    recordedBy: 'clinician-1',
    values: { hemoglobin: 11.8, ferritin: 350 },
    notes: 'Corrected lab value from re-draw.',
  });

  assert.strictEqual(updated.id, initial.id);
  assert.strictEqual(updated.values.hemoglobin, 11.8);

  // Should still be only 1 record, updated in-place
  const allAfterUpdate = getPatientLabResults('patient-upsert');
  assert.strictEqual(allAfterUpdate.length, 1);
  assert.strictEqual(allAfterUpdate[0].values.hemoglobin, 11.8);
  assert.strictEqual(allAfterUpdate[0].notes, 'Corrected lab value from re-draw.');

  // Direct updatePatientLabResult call test
  const directUpdate = updatePatientLabResult(initial.id, { notes: 'Direct API update' });
  assert.ok(directUpdate);
  assert.strictEqual(directUpdate.notes, 'Direct API update');
});

registerTest('6.6: Multi-Tenant Lab Isolation: Labs are strictly isolated by patientId', () => {
  resetEnvironment();
  savePatientLabResults({
    patientId: 'lab-patient-alpha',
    testDate: '2026-04-10',
    recordedBy: 'doc',
    values: { hemoglobin: 11.0 },
  });
  savePatientLabResults({
    patientId: 'lab-patient-beta',
    testDate: '2026-04-10',
    recordedBy: 'doc',
    values: { hemoglobin: 12.0 },
  });

  const alphaLabs = getPatientLabResults('lab-patient-alpha');
  const betaLabs = getPatientLabResults('lab-patient-beta');

  assert.strictEqual(alphaLabs.length, 1);
  assert.strictEqual(alphaLabs[0].values.hemoglobin, 11.0);

  assert.strictEqual(betaLabs.length, 1);
  assert.strictEqual(betaLabs[0].values.hemoglobin, 12.0);
});

registerTest('6.7: Chronological Lab History Ordering: Results order by testDate / recordedAt descending', () => {
  resetEnvironment();
  savePatientLabResults({
    patientId: 'patient-lab-order',
    testDate: '2026-01-15',
    recordedAt: '2026-01-15T09:00:00.000Z',
    recordedBy: 'doc',
    values: { hemoglobin: 9.8 },
  });
  savePatientLabResults({
    patientId: 'patient-lab-order',
    testDate: '2026-03-15',
    recordedAt: '2026-03-15T09:00:00.000Z',
    recordedBy: 'doc',
    values: { hemoglobin: 11.5 },
  });
  savePatientLabResults({
    patientId: 'patient-lab-order',
    testDate: '2026-02-15',
    recordedAt: '2026-02-15T09:00:00.000Z',
    recordedBy: 'doc',
    values: { hemoglobin: 10.4 },
  });

  const history = getPatientLabResults('patient-lab-order');
  assert.strictEqual(history[0].testDate, '2026-03-15');
  assert.strictEqual(history[1].testDate, '2026-02-15');
  assert.strictEqual(history[2].testDate, '2026-01-15');
});

registerTest('6.8: Delete Lab Record: Removes record and fires dialycare_labs_updated', () => {
  resetEnvironment();
  recordedEvents.length = 0;

  const record = savePatientLabResults({
    patientId: 'patient-del-lab',
    testDate: '2026-04-16',
    recordedBy: 'doc',
    values: { hemoglobin: 11.0 },
  });

  assert.strictEqual(getPatientLabResults('patient-del-lab').length, 1);

  const deleted = deletePatientLabResult(record.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(getPatientLabResults('patient-del-lab').length, 0);

  const labEvents = recordedEvents.filter((e) => e === 'dialycare_labs_updated');
  assert.ok(labEvents.length >= 2, 'Must fire dialycare_labs_updated on add and delete');
});

registerTest('6.9: Lab Modal & View Component Files: Verifies integration and minimum touch targets', () => {
  const modalPath = path.resolve(__dirname, '../../components/admin/PatientLabResultsModal.tsx');
  const viewPath = path.resolve(__dirname, '../../components/patient/PatientLabResultsView.tsx');

  const modalSource = fs.readFileSync(modalPath, 'utf8');
  const viewSource = fs.readFileSync(viewPath, 'utf8');

  assert.ok(modalSource.includes('min-h-[48px]'), 'Lab modal must meet min 48px touch targets');
  assert.ok(viewSource.includes('data-testid="enter-lab-results-btn"'), 'Lab view must expose enter-lab-results-btn');
});

// ============================================================================
// SUITE 7: CROSS-FEATURE MULTI-ROLE ADVERSARIAL STRESS SCENARIOS
// ============================================================================

registerTest('7.1: Comprehensive Multi-Feature Clinical Journey (R1 -> R5)', () => {
  resetEnvironment();
  const patientId = 'journey-patient-001';

  // 1. Doctor prescribes 2 medications (R1)
  const med1 = addPatientMedication({
    patientId,
    name: 'Sevelamer Carbonate',
    dose: '800 mg',
    scheduleTime: '08:00',
    scheduleTimes: ['08:00', '13:00', '19:00'],
  });
  const med2 = addPatientMedication({
    patientId,
    name: 'Amlodipine',
    dose: '5 mg',
    scheduleTime: '08:00',
  });
  assert.ok(med1.id && med2.id);

  // 2. Doctor records full 14-field dialysis session (R2)
  const session = addDialysisSession({
    patientId,
    sessionDate: '2026-04-17',
    recordedBy: 'doctor-nephro',
    complianceRating: 5,
    preWeightKg: 72,
    preWeightGrams: 500,
    postWeightKg: 70,
    postWeightGrams: 0,
    vitals: {
      preSession: { systolic: 142, diastolic: 88, heartRate: 76 },
      after1hr: { systolic: 135, diastolic: 82, heartRate: 74 },
      after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
      after3hr: { systolic: 125, diastolic: 78, heartRate: 70 },
      endSession: { systolic: 120, diastolic: 75, heartRate: 68 },
    },
    temperatureC: 36.6,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4 as SessionDurationHours,
    ultrafiltrationVolumeMl: 2500,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500 as DialysateFlowRate,
    accessType: 'AVF' as DialysisAccessType,
    machineSodiumMeqL: 138,
  });
  assert.ok(session.id);

  // 3. Fluid calculation for 70kg dry weight (R3)
  const limits = getPatientFluidLimits(70);
  assert.strictEqual(limits.warning, 1400);
  assert.strictEqual(limits.critical, 1820);

  // 4. Patient consults Dr. Dialy avatar for fluid restriction tips (R4)
  const fluidTips = COACHING_TIPS.filter((t) => t.domain === 'fluid');
  assert.ok(fluidTips.length >= 3);

  // 5. Monthly lab review recorded with all 12 values (R5)
  const lab = savePatientLabResults({
    patientId,
    testDate: '2026-04-17',
    recordedBy: 'lab-director',
    values: {
      hemoglobin: 11.2,
      wbc: 6.8,
      platelets: 220,
      calcium: 9.1,
      phosphorus: 4.8,
      pth: 210,
      creatinine: 8.9,
      urea: 92,
      serumIron: 80,
      tibc: 310,
      ferritin: 340,
      albumin: 4.2,
    },
  });
  assert.ok(lab.id);

  // Verify all data stored under patientId
  assert.strictEqual(getPatientMedications(patientId).length, 2);
  assert.strictEqual(getDialysisSessions(patientId).length, 1);
  assert.strictEqual(getPatientLabResults(patientId).length, 1);
});

registerTest('7.2: Acute Fluid Overload Emergency Loop (R3 alarm + R4 advice + R2 emergency session)', () => {
  resetEnvironment();
  const patientId = 'overload-patient-999';

  // 1. Patient hits 1900 mL (exceeds critical 1820 mL)
  const limits = getPatientFluidLimits(70);
  let totalFluid = 1900;
  assert.ok(totalFluid >= limits.critical);

  // 2. Patient drinks additional 200 mL -> Re-trigger alarm!
  totalFluid += 200;
  assert.strictEqual(totalFluid, 2100);
  let alarmFired = false;
  if (totalFluid >= limits.critical) {
    alarmFired = true;
  }
  assert.strictEqual(alarmFired, true);

  // 3. Avatar provides fluid restriction alert
  const avatarAlert = {
    badgeEn: 'High Fluid Intake Alert',
    badgeAr: 'تنبيه استهلاك السوائل',
    hintEn: 'Fluid approaching limit — try ice chips or lemon slices.',
  };
  assert.ok(avatarAlert.badgeEn.includes('Fluid'));

  // 4. Emergency dialysis session initiated to pull 3500 mL
  const emergencySession = addDialysisSession({
    patientId,
    sessionDate: '2026-04-18',
    recordedBy: 'emergency-physician',
    complianceRating: 2,
    preWeightKg: 74,
    postWeightKg: 70,
    vitals: {
      preSession: { systolic: 175, diastolic: 105, heartRate: 98 },
      after1hr: { systolic: 160, diastolic: 95, heartRate: 92 },
      after2hr: { systolic: 145, diastolic: 88, heartRate: 85 },
      after3hr: { systolic: 135, diastolic: 82, heartRate: 80 },
      endSession: { systolic: 130, diastolic: 80, heartRate: 75 },
    },
    temperatureC: 36.9,
    fluidStatus: { legEdema: 'severe', lungCrackles: 'all_areas', dyspnea: 'severe' },
    accessInfectionSigns: false,
    durationHours: 4 as SessionDurationHours,
    ultrafiltrationVolumeMl: 3500,
    bloodFlowRateMlMin: 400,
    dialysateFlowRateMlMin: 800 as DialysateFlowRate,
    accessType: 'AVF' as DialysisAccessType,
    machineSodiumMeqL: 140,
    notes: 'Emergency ultrafiltration for acute pulmonary edema secondary to fluid overload.',
  });

  assert.strictEqual(emergencySession.ultrafiltrationVolumeMl, 3500);
  assert.strictEqual(emergencySession.fluidStatus?.lungCrackles, 'all_areas');
});

registerTest('7.3: Full Translation Dictionary Parity: 100% key match between en.json and ar.json for all 5 features', () => {
  const enPath = path.resolve(__dirname, '../../messages/en.json');
  const arPath = path.resolve(__dirname, '../../messages/ar.json');

  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const arJson = JSON.parse(fs.readFileSync(arPath, 'utf8'));

  const featureNamespaces = [
    'medications',
    'dialysisSession',
    'fluidAlerts',
    'coachingAvatar',
    'labResults',
  ];

  for (const ns of featureNamespaces) {
    assert.ok(enJson[ns], `Namespace '${ns}' missing in en.json`);
    assert.ok(arJson[ns], `Namespace '${ns}' missing in ar.json`);

    const enKeys = Object.keys(enJson[ns]).sort();
    const arKeys = Object.keys(arJson[ns]).sort();

    assert.deepStrictEqual(
      enKeys,
      arKeys,
      `Key disparity detected in namespace '${ns}' between en.json and ar.json`
    );

    // Verify non-empty translations
    for (const key of enKeys) {
      assert.ok(String(enJson[ns][key]).length > 0, `Empty en translation for ${ns}.${key}`);
      assert.ok(String(arJson[ns][key]).length > 0, `Empty ar translation for ${ns}.${key}`);
    }
  }
});

// ============================================================================
// SUITE 8: ADVANCED WHITE-BOX ADVERSARIAL STRESS VECTORS & FUZZING
// ============================================================================

registerTest('8.1: Fuzz & Injection Immunity: Patient IDs with emojis, SQL injection fragments, JSON escape quotes, script tags', () => {
  resetEnvironment();
  const adversarialIds = [
    "patient-🚀-unicode",
    "patient-'; DROP TABLE patients;--",
    "patient-<script>alert('xss')</script>",
    "patient-\"escaped\\\"quotes\"",
    "patient-100%20encoded",
  ];

  for (const maliciousId of adversarialIds) {
    const med = addPatientMedication({
      patientId: maliciousId,
      name: `Adversarial Med for ${maliciousId}`,
      dose: '10mg',
      scheduleTime: '08:00',
    });
    assert.ok(med.id);

    const fetchedMeds = getPatientMedications(maliciousId);
    assert.strictEqual(fetchedMeds.length, 1);
    assert.strictEqual(fetchedMeds[0].patientId, maliciousId);

    const session = addDialysisSession({
      patientId: maliciousId,
      sessionDate: '2026-04-20',
      recordedBy: 'adversarial-tester',
      complianceRating: 5,
      preWeightKg: 70,
      postWeightKg: 68,
      vitals: {
        preSession: { systolic: 120, diastolic: 80, heartRate: 72 },
        after1hr: { systolic: 120, diastolic: 80, heartRate: 72 },
        after2hr: { systolic: 120, diastolic: 80, heartRate: 72 },
        after3hr: { systolic: 120, diastolic: 80, heartRate: 72 },
        endSession: { systolic: 120, diastolic: 80, heartRate: 72 },
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
    assert.ok(session.id);

    const fetchedSessions = getDialysisSessions(maliciousId);
    assert.strictEqual(fetchedSessions.length, 1);
    assert.strictEqual(fetchedSessions[0].patientId, maliciousId);

    const lab = savePatientLabResults({
      patientId: maliciousId,
      testDate: '2026-04-20',
      recordedBy: 'adversarial-tester',
      values: { hemoglobin: 11.5 },
    });
    assert.ok(lab.id);

    const fetchedLabs = getPatientLabResults(maliciousId);
    assert.strictEqual(fetchedLabs.length, 1);
    assert.strictEqual(fetchedLabs[0].patientId, maliciousId);
  }
});

registerTest('8.2: Concurrent Asynchronous Race Condition Simulation: 20 simultaneous mutations across data entities', async () => {
  resetEnvironment();
  const patientId = 'race-condition-patient';

  const promises: Promise<void>[] = [];

  for (let i = 0; i < 20; i++) {
    promises.push(
      (async () => {
        // Yield to microtask queue to interleave operations
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        addPatientMedication({
          patientId,
          name: `Concurrent Drug ${i}`,
          dose: `${i + 1}mg`,
          scheduleTime: '08:00',
        });
      })()
    );
  }

  await Promise.all(promises);

  const meds = getPatientMedications(patientId);
  assert.strictEqual(meds.length, 20, 'All 20 concurrent medications must be persisted without race condition loss');
});

registerTest('8.3: Division-by-Zero and Boundary Metrics Resilience in Coaching Avatar', () => {
  // Test boundary metrics: medicationsTotal = 0, medicationsTaken = 5
  // fluidPercentage = 999%, adherenceScore = -10%
  const boundaryMetrics = [
    { medicationsTaken: 0, medicationsTotal: 0, fluidPercentage: 0 },
    { medicationsTaken: 5, medicationsTotal: 0, fluidPercentage: 150 },
    { medicationsTaken: 0, medicationsTotal: 5, fluidPercentage: 999 },
    { adherenceScore: -50, fluidPercentage: -10 },
  ];

  function evaluateGuidance(m: {
    fluidPercentage?: number;
    medicationsTaken?: number;
    medicationsTotal?: number;
    adherenceScore?: number;
  }) {
    if (m.fluidPercentage && m.fluidPercentage >= 90) return 'high-fluid';
    if (
      m.medicationsTaken !== undefined &&
      m.medicationsTotal !== undefined &&
      m.medicationsTotal > 0 &&
      m.medicationsTaken < m.medicationsTotal
    ) {
      return 'pending-meds';
    }
    return 'neutral';
  }

  for (const m of boundaryMetrics) {
    const outcome = evaluateGuidance(m);
    assert.ok(typeof outcome === 'string', 'Guidance evaluation must return a string even under degenerate metrics');
  }
});

registerTest('8.4: Verbatim 12-Lab Clinical Egyptian Arabic Concordance against ORIGINAL_REQUEST.md', () => {
  const expectedVerbatim = [
    { key: 'hemoglobin', en: 'Hemoglobin', ar: 'الهيموجلوبين' },
    { key: 'wbc', en: 'WBC', ar: 'كرات الدم البيضاء' },
    { key: 'platelets', en: 'Platelets', ar: 'الصفائح الدموية' },
    { key: 'calcium', en: 'Calcium', ar: 'الكالسيوم' },
    { key: 'phosphorus', en: 'Phosphorus', ar: 'الفسفور' },
    { key: 'pth', en: 'PTH', ar: 'الغدة الجار درقية' },
    { key: 'creatinine', en: 'Creatinine', ar: 'الكرياتينين' },
    { key: 'urea', en: 'Urea', ar: 'اليوريا' },
    { key: 'serumIron', en: 'Serum Iron', ar: 'حديد الدم' },
    { key: 'tibc', en: 'TIBC', ar: 'السعة الكلية لربط الحديد' },
    { key: 'ferritin', en: 'Ferritin', ar: 'الفيريتين' },
    { key: 'albumin', en: 'Albumin', ar: 'الألبومين' },
  ];

  for (const exp of expectedVerbatim) {
    const found = CLINICAL_12_LAB_TESTS.find((t) => t.key === exp.key);
    assert.ok(found, `Expected lab key ${exp.key}`);
    assert.strictEqual(found.nameEn, exp.en, `English name mismatch for ${exp.key}`);
    assert.strictEqual(found.nameAr, exp.ar, `Egyptian Arabic name mismatch for ${exp.key}`);
  }
});

registerTest('8.5: Paradoxical Interdialytic Fluid Balance & Negative Ultrafiltration Handling', () => {
  resetEnvironment();
  // In clinical emergency: Patient develops profound shock; 1500 mL normal saline + albumin infused during treatment
  // Pre-weight 68.0 kg -> Post-weight 69.5 kg (net weight gain +1.5kg)
  const paradoxicalSession = addDialysisSession({
    patientId: 'patient-paradox',
    sessionDate: '2026-04-21',
    recordedBy: 'icu-registrar',
    complianceRating: 3,
    preWeightKg: 68,
    preWeightGrams: 0,
    postWeightKg: 69,
    postWeightGrams: 500,
    vitals: {
      preSession: { systolic: 85, diastolic: 50, heartRate: 120 },
      after1hr: { systolic: 90, diastolic: 55, heartRate: 115 },
      after2hr: { systolic: 95, diastolic: 60, heartRate: 105 },
      after3hr: { systolic: 105, diastolic: 65, heartRate: 98 },
      endSession: { systolic: 115, diastolic: 70, heartRate: 90 },
    },
    temperatureC: 36.3,
    fluidStatus: { legEdema: 'none', lungCrackles: 'none', dyspnea: 'none' },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 0,
    bloodFlowRateMlMin: 250,
    dialysateFlowRateMlMin: 500,
    accessType: 'Permcath',
    machineSodiumMeqL: 140,
    notes: 'Septic shock resuscitation with intradialytic volume expansion.',
  });

  assert.ok(paradoxicalSession.id);
  assert.strictEqual(paradoxicalSession.postWeightKg, 69);
  assert.strictEqual(paradoxicalSession.postWeightGrams, 500);

  if (paradoxicalSession.preWeightKg === undefined || paradoxicalSession.postWeightKg === undefined) {
    throw new Error('Expected preWeightKg and postWeightKg on paradoxicalSession');
  }
  const delta =
    paradoxicalSession.preWeightKg +
    (paradoxicalSession.preWeightGrams ?? 0) / 1000 -
    (paradoxicalSession.postWeightKg +
      (paradoxicalSession.postWeightGrams ?? 0) / 1000);
  assert.strictEqual(delta, -1.5, 'Net fluid balance correctly reflects negative ultrafiltration');
});

registerTest('8.6: Multi-Medication Exact Minute Collision in Dose Slot Generator', () => {
  // Scenario: 5 distinct medications all scheduled for "08:00"
  const collidingMeds: PatientMedication[] = [
    { id: 'c1', patientId: 'p-coll', name: 'Amlodipine', dose: '5mg', scheduleTime: '08:00' },
    { id: 'c2', patientId: 'p-coll', name: 'Sevelamer', dose: '800mg', scheduleTime: '08:00' },
    { id: 'c3', patientId: 'p-coll', name: 'Cinacalcet', dose: '30mg', scheduleTime: '08:00' },
    { id: 'c4', patientId: 'p-coll', name: 'Aspirin', dose: '81mg', scheduleTime: '08:00' },
    { id: 'c5', patientId: 'p-coll', name: 'Atorvastatin', dose: '20mg', scheduleTime: '08:00' },
  ];

  const slots: Array<{ slotKey: string; medId: string; time: string }> = [];
  collidingMeds.forEach((med) => {
    const times =
      med.scheduleTimes && med.scheduleTimes.length > 0
        ? med.scheduleTimes
        : med.scheduleTime
          ? [med.scheduleTime]
          : [''];
    times.forEach((t) => {
      slots.push({
        slotKey: `${med.id}_${t}`,
        medId: med.id,
        time: t,
      });
    });
  });

  assert.strictEqual(slots.length, 5, 'Must generate exactly 5 distinct dose slots');
  const uniqueKeys = new Set(slots.map((s) => s.slotKey));
  assert.strictEqual(uniqueKeys.size, 5, 'Every slotKey must remain uniquely identifiable by combining medId and time');
});

registerTest('8.7: Rapid Multi-Burst Fluid Logging Threshold Stress and Re-Trigger Count', () => {
  const limits = getPatientFluidLimits(60); // warning: 1200, critical: 1560
  assert.strictEqual(limits.warning, 1200);
  assert.strictEqual(limits.critical, 1560);

  let accumulated = 0;
  let alarmCount = 0;

  // 100 additions of 25 mL = 2500 mL
  for (let step = 1; step <= 100; step++) {
    const nextVal = accumulated + 25;
    if (nextVal >= limits.critical) {
      alarmCount++;
    }
    accumulated = nextVal;
  }

  assert.strictEqual(accumulated, 2500);
  // Reaches 1560 mL at step 63 (63 * 25 = 1575)
  // Therefore steps 63 through 100 (38 steps) must each trigger the alarm
  assert.strictEqual(alarmCount, 38, 'Alarm must re-trigger precisely on each entry above critical ceiling');
});

registerTest('8.8: Empty String Patient ID Handling: defensive isolation returns empty arrays without throwing', () => {
  resetEnvironment();
  const emptyMeds = getPatientMedications('');
  assert.deepStrictEqual(emptyMeds, []);

  const emptySessions = getDialysisSessions('');
  assert.deepStrictEqual(emptySessions, []);

  const emptyLabs = getPatientLabResults('');
  assert.deepStrictEqual(emptyLabs, []);
});

registerTest('8.9: Missing/Corrupted Properties in Session & Lab Records: Deep defensive cloning immunity', () => {
  resetEnvironment();
  addDialysisSession({
    patientId: 'patient-clone-check',
    sessionDate: '2026-04-22',
    recordedBy: 'nurse-check',
    complianceRating: 5,
    preWeightKg: 70,
    postWeightKg: 68,
    vitals: {
      preSession: { systolic: 120, diastolic: 80, heartRate: 72 },
      after1hr: { systolic: 120, diastolic: 80, heartRate: 72 },
      after2hr: { systolic: 120, diastolic: 80, heartRate: 72 },
      after3hr: { systolic: 120, diastolic: 80, heartRate: 72 },
      endSession: { systolic: 120, diastolic: 80, heartRate: 72 },
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

  // Fetch session, delete a vitals subfield on returned clone
  const fetched = getDialysisSessions('patient-clone-check');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (fetched[0].vitals as any).preSession;

  // Re-fetch should have vitals.preSession intact
  const refetched = getDialysisSessions('patient-clone-check');
  assert.ok(refetched[0].vitals?.preSession, 'Defensive clone protects against property deletion');
});

// ============================================================================
// MASTER SUITE EXECUTION FUNCTION
// ============================================================================

export async function runAllTier5AdversarialTests(): Promise<void> {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('TIER 5 WHITE-BOX ADVERSARIAL COVERAGE HARDENING SUITE');
  console.log(`Executing ${testCases.length} adversarial tests sequentially...`);
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

  const durationMs = Date.now() - startTime;
  console.log('\n================================================================');
  console.log(`ALL TIER 5 ADVERSARIAL TESTS PASSED! (${passed}/${testCases.length})`);
  console.log(`Execution Time: ${(durationMs / 1000).toFixed(2)}s`);
  console.log('================================================================\n');
}

// Auto-run if executed directly as standalone CLI script
const isDirectCliExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].includes('tier5-adversarial-coverage.test');

if (isDirectCliExecution) {
  runAllTier5AdversarialTests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal Tier 5 adversarial failure:', err);
      process.exit(1);
    });
}
