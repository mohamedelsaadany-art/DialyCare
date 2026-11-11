/**
 * Milestone 3 Automated Integration Test Suite:
 * Dialysis Treatment Module: R2 14-Field Session Form & History
 */

import assert from 'node:assert';
import {
  getDialysisSessions,
  addDialysisSession,
  updateDialysisSession,
  deleteDialysisSession,
  addAdherenceLog,
  getAdherenceLogs,
  initDataStore,
} from '../data-store';
import type { DialysisSession } from '../types';

// Setup Mock environment if window is not present
const mockStore: Record<string, string> = {};
const testEvents: string[] = [];

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
      testEvents.push(ev.type);
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

function resetEnv() {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  testEvents.length = 0;
  initDataStore();
}

console.log('================================================================');
console.log('MILESTONE 3 DIALYSIS TREATMENT TEST SUITE (R2 & POLISH)');
console.log('================================================================\n');

// 1. R2: Record complete dialysis session with ALL 14 clinical fields
resetEnv();
console.log('1. Testing R2: Creation & Validation of Complete 14-Field Dialysis Session...');

const sampleSession: Omit<DialysisSession, 'id'> = {
  patientId: 'patient-m3-test',
  sessionDate: '2026-03-10',
  recordedBy: 'dr-nephrologist',
  // Field 1: Compliance rating (1-5)
  complianceRating: 5,
  // Field 2: Pre-dialysis weight (kg + grams)
  preWeightKg: 74,
  preWeightGrams: 500,
  // Field 3: Post-dialysis weight (kg + grams)
  postWeightKg: 71,
  postWeightGrams: 200,
  // Field 4 & 5: BP and HR across 5 timepoints
  vitals: {
    preSession: { systolic: 145, diastolic: 88, heartRate: 78 },
    after1hr: { systolic: 140, diastolic: 84, heartRate: 76 },
    after2hr: { systolic: 135, diastolic: 82, heartRate: 74 },
    after3hr: { systolic: 130, diastolic: 80, heartRate: 72 },
    endSession: { systolic: 128, diastolic: 78, heartRate: 70 },
  },
  // Field 6: Temperature (°C)
  temperatureC: 36.7,
  // Field 7: Fluid status assessment
  fluidStatus: {
    legEdema: 'mild',
    lungCrackles: 'none',
    dyspnea: 'none',
  },
  // Field 8: Vascular access inspection: infection signs (yes/no)
  accessInfectionSigns: false,
  // Field 9: Session duration (1, 2, 3, 4 hours)
  durationHours: 4,
  // Field 10: Ultrafiltration volume (mL)
  ultrafiltrationVolumeMl: 3300,
  // Field 11: Blood flow rate (mL/min)
  bloodFlowRateMlMin: 350,
  // Field 12: Dialysate flow rate (300, 500, 700, 800 mL/min)
  dialysateFlowRateMlMin: 500,
  // Field 13: Access type (AVF, AVG, Permcath, Mahurkar)
  accessType: 'AVF',
  // Field 14: Dialysis machine sodium concentration (mEq/L)
  machineSodiumMeqL: 138,
  notes: 'Tolerated hemodialysis very well. Target dry weight reached without cramping.',
};

const savedSession = addDialysisSession(sampleSession);

assert.ok(savedSession.id, 'Session must have generated unique ID');
assert.strictEqual(savedSession.complianceRating, 5);
assert.strictEqual(savedSession.preWeightKg, 74);
assert.strictEqual(savedSession.preWeightGrams, 500);
assert.strictEqual(savedSession.postWeightKg, 71);
assert.strictEqual(savedSession.postWeightGrams, 200);
assert.strictEqual(savedSession.vitals?.preSession?.systolic, 145);
assert.strictEqual(savedSession.vitals?.endSession?.heartRate, 70);
assert.strictEqual(savedSession.temperatureC, 36.7);
assert.strictEqual(savedSession.fluidStatus?.legEdema, 'mild');
assert.strictEqual(savedSession.accessInfectionSigns, false);
assert.strictEqual(savedSession.durationHours, 4);
assert.strictEqual(savedSession.ultrafiltrationVolumeMl, 3300);
assert.strictEqual(savedSession.bloodFlowRateMlMin, 350);
assert.strictEqual(savedSession.dialysateFlowRateMlMin, 500);
assert.strictEqual(savedSession.accessType, 'AVF');
assert.strictEqual(savedSession.machineSodiumMeqL, 138);
assert.ok(testEvents.includes('dialycare_sessions_updated'), 'Reactive event dialycare_sessions_updated must be fired');
console.log('  ✓ All 14 clinical fields persisted and reactive event dispatched');

// 2. Querying sessions with patient isolation and chronological ordering
console.log('2. Testing R2: Patient History Isolation & Chronological Sorting...');
addDialysisSession({
  ...sampleSession,
  patientId: 'patient-m3-other',
  sessionDate: '2026-03-12',
});

addDialysisSession({
  ...sampleSession,
  patientId: 'patient-m3-test',
  sessionDate: '2026-03-12',
  complianceRating: 4,
});

const m3Sessions = getDialysisSessions('patient-m3-test');
const otherSessions = getDialysisSessions('patient-m3-other');

assert.strictEqual(m3Sessions.length, 2, 'patient-m3-test must have exactly 2 sessions');
assert.strictEqual(otherSessions.length, 1, 'patient-m3-other must have exactly 1 session');
// Chronological sort: newest date (2026-03-12) comes first
assert.strictEqual(m3Sessions[0].sessionDate, '2026-03-12');
assert.strictEqual(m3Sessions[1].sessionDate, '2026-03-10');
console.log('  ✓ Patient isolation and newest-first chronological sorting verified');

// 3. Updating an existing session
console.log('3. Testing R2: Session Update Operations...');
const targetSession = m3Sessions[0];
const updated = updateDialysisSession(targetSession.id, {
  ultrafiltrationVolumeMl: 2800,
  notes: 'Updated note: UF adjusted down by 500mL.',
});

assert.ok(updated, 'Update must return updated session object');
assert.strictEqual(updated.ultrafiltrationVolumeMl, 2800);
assert.strictEqual(updated.notes, 'Updated note: UF adjusted down by 500mL.');
console.log('  ✓ Session update modified parameters correctly');

// 4. Deleting a session
console.log('4. Testing R2: Session Deletion Operations...');
const deleted = deleteDialysisSession(targetSession.id);
assert.strictEqual(deleted, true, 'deleteDialysisSession should return true on success');
const remainingSessions = getDialysisSessions('patient-m3-test');
assert.strictEqual(remainingSessions.length, 1, 'Should have 1 session remaining after deletion');
assert.strictEqual(deleteDialysisSession('non-existent-id'), false, 'Deleting non-existent session returns false');
console.log('  ✓ Session deletion verified');

// 5. Polish requirement: Adherence log title for medication slots
console.log('5. Testing Polish: Medication Adherence Log Title Formatting...');
const demoSlot = {
  medicationName: 'Sevelamer Carbonate',
  dose: '800 mg',
  time: '14:00',
};
const expectedTitle = `${demoSlot.medicationName} - ${demoSlot.dose} (${demoSlot.time})`;

const logEntry = addAdherenceLog({
  patientId: 'patient-m3-test',
  type: 'ttt',
  status: 'done',
  loggedAt: new Date().toISOString(),
  data: {
    title: expectedTitle,
    medicationId: 'med-xyz',
    medicationName: demoSlot.medicationName,
    dose: demoSlot.dose,
    scheduleTime: demoSlot.time,
  },
});

assert.ok(logEntry.id, 'Log entry must have an id');
assert.strictEqual(logEntry.data?.title, 'Sevelamer Carbonate - 800 mg (14:00)');
const queriedLogs = getAdherenceLogs('patient-m3-test', 'ttt');
assert.strictEqual(queriedLogs[0].data?.title, 'Sevelamer Carbonate - 800 mg (14:00)');
console.log('  ✓ Adherence log includes formatted title in data object: ' + logEntry.data?.title);

// 6. Boundary testing for clinical ranges
console.log('6. Testing R2: Boundary Value Validations across Clinical Extremes...');
const edgeSession = addDialysisSession({
  patientId: 'patient-m3-test',
  sessionDate: '2026-03-14',
  recordedBy: 'patient',
  complianceRating: 1, // Minimum compliance
  preWeightKg: 40,
  preWeightGrams: 0,
  postWeightKg: 39,
  postWeightGrams: 500,
  vitals: {
    preSession: { systolic: 90, diastolic: 50, heartRate: 48 }, // Hypotension boundary
    after1hr: { systolic: 95, diastolic: 55, heartRate: 52 },
    after2hr: { systolic: 100, diastolic: 60, heartRate: 55 },
    after3hr: { systolic: 105, diastolic: 65, heartRate: 60 },
    endSession: { systolic: 110, diastolic: 70, heartRate: 62 },
  },
  temperatureC: 35.8, // Mild hypothermia boundary
  fluidStatus: {
    legEdema: 'severe',
    lungCrackles: 'all_areas',
    dyspnea: 'severe',
  },
  accessInfectionSigns: true, // Infection alert boundary
  durationHours: 1, // Minimum 1 hr
  ultrafiltrationVolumeMl: 500,
  bloodFlowRateMlMin: 200,
  dialysateFlowRateMlMin: 300,
  accessType: 'Mahurkar',
  machineSodiumMeqL: 135,
});

assert.strictEqual(edgeSession.complianceRating, 1);
assert.strictEqual(edgeSession.durationHours, 1);
assert.strictEqual(edgeSession.accessInfectionSigns, true);
assert.strictEqual(edgeSession.accessType, 'Mahurkar');
assert.strictEqual(edgeSession.fluidStatus?.legEdema, 'severe');
assert.strictEqual(edgeSession.fluidStatus?.lungCrackles, 'all_areas');
assert.strictEqual(edgeSession.fluidStatus?.dyspnea, 'severe');
console.log('  ✓ Boundary clinical conditions (hypotension, infection, severe fluid overload) successfully persisted');

console.log('\n================================================================');
console.log('ALL MILESTONE 3 DIALYSIS TREATMENT TESTS PASSED! (EXIT 0)');
console.log('================================================================');
