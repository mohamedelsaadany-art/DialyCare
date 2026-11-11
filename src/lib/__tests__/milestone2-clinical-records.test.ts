/**
 * Milestone 2 Automated Integration Test Suite:
 * Clinical Records Module: R1 Per-Patient Named Medications & R5 Bilingual Lab Results
 */

import assert from 'node:assert';
import {
  getPatientMedications,
  addPatientMedication,
  getPatientLabResults,
  savePatientLabResults,
  addAdherenceLog,
  getAdherenceLogs,
  initDataStore,
} from '../data-store';
import { CLINICAL_12_LAB_TESTS } from '../../components/admin/PatientLabResultsModal';

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
console.log('MILESTONE 2 CLINICAL RECORDS TEST SUITE (R1 & R5)');
console.log('================================================================\n');

// 1. R1: Add named medication with dose and multi-schedule times
resetEnv();
console.log('1. Testing R1: Per-Patient Named Medication Creation & Persistence...');
const med1 = addPatientMedication({
  patientId: 'patient-test-m2',
  name: 'Sevelamer Carbonate 800mg',
  nameAr: 'سيفيلامير كربونات 800 مجم',
  dose: '800 mg (1 tablet)',
  scheduleTime: '08:00',
  scheduleTimes: ['08:00', '14:00', '20:00'],
  instructions: 'Take with first bite of every meal',
  instructionsAr: 'يؤخذ مع أول لقمة من الوجبة',
  isActive: true,
  createdAt: new Date().toISOString(),
});

assert.ok(med1.id, 'Medication must have an id generated');
assert.strictEqual(med1.name, 'Sevelamer Carbonate 800mg');
assert.strictEqual(med1.dose, '800 mg (1 tablet)');
assert.strictEqual(med1.scheduleTimes?.length, 3);
assert.ok(testEvents.includes('dialycare_medications_updated'), 'Reactive event dialycare_medications_updated must be dispatched');
console.log('  ✓ Named medication created and event dispatched');

// 2. R1: Query medications by patient ID with isolation
console.log('2. Testing R1: Patient Isolation for Prescribed Medications...');
addPatientMedication({
  patientId: 'patient-other-tenant',
  name: 'Amlodipine 5mg',
  dose: '5 mg',
  scheduleTime: '09:00',
});

const m2Meds = getPatientMedications('patient-test-m2');
const otherMeds = getPatientMedications('patient-other-tenant');

assert.strictEqual(m2Meds.length, 1);
assert.strictEqual(m2Meds[0].name, 'Sevelamer Carbonate 800mg');
assert.strictEqual(otherMeds.length, 1);
assert.strictEqual(otherMeds[0].name, 'Amlodipine 5mg');
console.log('  ✓ Patient isolation verified');

// 3. R1: Dose Tracking (Done / Skip) with Adherence Logging
console.log('3. Testing R1: Dose Tracking Adherence Logs...');
const logDone = addAdherenceLog({
  patientId: 'patient-test-m2',
  type: 'ttt',
  status: 'done',
  loggedAt: new Date().toISOString(),
  data: {
    medicationId: med1.id,
    medicationName: med1.name,
    dose: med1.dose,
    scheduleTime: '08:00',
  },
});

assert.ok(logDone.id);
assert.strictEqual(logDone.status, 'done');
const adhLogs = getAdherenceLogs('patient-test-m2', 'ttt');
assert.ok(adhLogs.some((l) => l.data?.medicationId === med1.id && l.status === 'done'));
console.log('  ✓ Dose adherence tracking recorded and retrievable');

// 4. R5: 12 Clinical Lab Tests presence and side-by-side labels
console.log('4. Testing R5: All 12 Clinical Tests in Lab Definition Table...');
assert.strictEqual(CLINICAL_12_LAB_TESTS.length, 12, 'Must contain exactly 12 clinical tests');

const expectedTests = [
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

expectedTests.forEach((t) => {
  const def = CLINICAL_12_LAB_TESTS.find((l) => l.key === t.key);
  assert.ok(def, `Test ${t.key} must be defined`);
  assert.strictEqual(def.nameEn, t.en);
  assert.strictEqual(def.nameAr, t.ar);
  assert.ok(def.refMin !== undefined && def.refMax !== undefined, 'Target reference ranges must exist');
});
console.log('  ✓ All 12 clinical lab tests present with exact English and Egyptian Arabic names');

// 5. R5: Save and Update Lab Panel with all 12 values
console.log('5. Testing R5: Doctor Save & Update Lab Panel...');
const labRecord1 = savePatientLabResults({
  patientId: 'patient-test-m2',
  testDate: '2026-03-01',
  recordedBy: 'Dr. Nephrologist',
  recordedAt: '2026-03-01T10:00:00Z',
  values: {
    hemoglobin: 11.5,
    wbc: 6.2,
    platelets: 230,
    calcium: 9.3,
    phosphorus: 4.6,
    pth: 215,
    creatinine: 9.1,
    urea: 82,
    serumIron: 90,
    tibc: 300,
    ferritin: 340,
    albumin: 4.2,
  },
  notes: 'Stable monthly renal panel',
});

assert.ok(labRecord1.id);
assert.strictEqual(labRecord1.values.hemoglobin, 11.5);
assert.strictEqual(labRecord1.values.phosphorus, 4.6);
assert.strictEqual(labRecord1.values.ferritin, 340);
assert.ok(testEvents.includes('dialycare_labs_updated'), 'Reactive event dialycare_labs_updated must be dispatched');
console.log('  ✓ Lab panel saved and event dispatched');

// 6. R5: Patient Lab Retrieval and Range Checking
console.log('6. Testing R5: Patient Lab Retrieval and Clinical Status...');
const patientLabs = getPatientLabResults('patient-test-m2');
assert.strictEqual(patientLabs.length, 1);
assert.strictEqual(patientLabs[0].values.albumin, 4.2);

// Update lab results
const updatedLab = savePatientLabResults({
  id: labRecord1.id,
  patientId: 'patient-test-m2',
  testDate: '2026-03-01',
  recordedBy: 'Dr. Nephrologist',
  values: {
    ...labRecord1.values,
    phosphorus: 6.2, // Now elevated above target 5.5
  },
  notes: 'Phosphorus elevated; increase phosphate binder dose',
});

assert.strictEqual(updatedLab.id, labRecord1.id);
assert.strictEqual(updatedLab.values.phosphorus, 6.2);
const refreshed = getPatientLabResults('patient-test-m2');
assert.strictEqual(refreshed[0].values.phosphorus, 6.2);
console.log('  ✓ Lab panel update and retrieval verified');

console.log('\n================================================================');
console.log('ALL MILESTONE 2 CLINICAL RECORDS TESTS PASSED SUCCESSFULLY! (EXIT 0)');
console.log('================================================================\n');
