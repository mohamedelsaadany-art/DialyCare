/**
 * Challenger 1 Empirical Test Suite: Milestone 2
 * Clinical Records Module: R1 Per-Patient Named Medications & Activity Log Verification
 */

import assert from 'node:assert';
import {
  getPatientMedications,
  addPatientMedication,
  updatePatientMedication,
  addAdherenceLog,
  getAdherenceLogs,
  initDataStore,
} from '../data-store';
import type { AdherenceLog, AdherenceStatus } from '../types';

// Mock browser environment for headless Node execution
const mockStorage: Record<string, string> = {};
const dispatchedEvents: string[] = [];

if (typeof window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
    },
    dispatchEvent: (ev: { type: string }) => {
      dispatchedEvents.push(ev.type);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  (globalThis as unknown as { Event: unknown }).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

function resetEnvironment() {
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  dispatchedEvents.length = 0;
  initDataStore();
}

/**
 * Replicates PatientMedicationSection slot computation and status resolution
 */
function computePatientMedicationDoseSlots(
  patientId: string,
  now: Date = new Date()
) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const activeMeds = getPatientMedications(patientId).filter((m) => m.isActive !== false);
  const logs = getAdherenceLogs(patientId, 'ttt', {
    start: startOfToday.toISOString(),
    end: endOfToday.toISOString(),
  });

  const statuses: Record<string, AdherenceStatus | 'pending'> = {};
  activeMeds.forEach((med) => {
    const times =
      med.scheduleTimes && med.scheduleTimes.length > 0
        ? med.scheduleTimes
        : med.scheduleTime
          ? [med.scheduleTime]
          : [''];
    times.forEach((t) => {
      const slotKey = `${med.id}_${t}`;
      const matchingLog = logs.find((l) => {
        if (l.data && typeof l.data === 'object') {
          if (l.data.medicationId === med.id) {
            return !l.data.scheduleTime || l.data.scheduleTime === t;
          }
        }
        return false;
      });

      if (matchingLog) {
        statuses[slotKey] = matchingLog.status;
      } else {
        statuses[slotKey] = 'pending';
      }
    });
  });

  const list: Array<{
    medicationId: string;
    medicationName: string;
    medicationNameAr?: string;
    dose: string;
    time: string;
    instructions?: string;
    instructionsAr?: string;
    status: AdherenceStatus | 'pending';
  }> = [];

  activeMeds.forEach((med) => {
    const times =
      med.scheduleTimes && med.scheduleTimes.length > 0
        ? med.scheduleTimes
        : med.scheduleTime
          ? [med.scheduleTime]
          : [''];
    times.forEach((t) => {
      const slotKey = `${med.id}_${t}`;
      list.push({
        medicationId: med.id,
        medicationName: med.name,
        medicationNameAr: med.nameAr,
        dose: med.dose,
        time: t,
        instructions: med.instructions,
        instructionsAr: med.instructionsAr,
        status: statuses[slotKey] || 'pending',
      });
    });
  });

  // Sort chronologically by time as in PatientMedicationSection
  return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

/**
 * Replicates dose recording action in PatientMedicationSection
 */
function recordDoseInComponent(
  patientId: string,
  slot: { medicationId: string; medicationName: string; dose: string; time: string },
  newStatus: AdherenceStatus
): AdherenceLog {
  return addAdherenceLog({
    patientId,
    type: 'ttt',
    status: newStatus,
    loggedAt: new Date().toISOString(),
    data: {
      medicationId: slot.medicationId,
      medicationName: slot.medicationName,
      dose: slot.dose,
      scheduleTime: slot.time,
    },
  });
}

/**
 * Replicates patient/log/page.tsx display title logic for today's logged doses
 */
function resolveLogTitle(log: AdherenceLog, isAr: boolean = false): string {
  return log.data && typeof log.data === 'object' && 'title' in log.data
    ? String(log.data.title)
    : isAr
    ? 'دواء مقرر'
    : 'Scheduled Medication';
}

console.log('========================================================================');
console.log('CHALLENGER 1 EMPIRICAL VERIFICATION HARNESS (R1 MEDICATIONS)');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err: unknown) {
    console.error(`  ✗ FAIL: ${name}`);
    if (err instanceof Error) {
      console.error(`    Error: ${err.message}`);
      if (err.stack) console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// SUITE 1: Named Medication Assignment & Persistence
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Named Medication Assignment & Persistence ---');

runTest('1.1 Should assign medication with drug name, dose, and schedule times', () => {
  resetEnvironment();
  const med = addPatientMedication({
    patientId: 'patient-c1-1',
    name: 'Calcium Acetate 667mg',
    nameAr: 'أسيتات الكالسيوم',
    dose: '667 mg (2 capsules)',
    scheduleTime: '08:00',
    scheduleTimes: ['08:00', '13:00', '19:00'],
    instructions: 'Take with food to control serum phosphorus',
    instructionsAr: 'يؤخذ مع الأكل لضبط مستوى الفوسفور في الدم',
    isActive: true,
  });

  assert.ok(med.id, 'Must generate medication id');
  assert.strictEqual(med.name, 'Calcium Acetate 667mg');
  assert.strictEqual(med.nameAr, 'أسيتات الكالسيوم');
  assert.strictEqual(med.dose, '667 mg (2 capsules)');
  assert.strictEqual(med.scheduleTime, '08:00');
  assert.deepStrictEqual(med.scheduleTimes, ['08:00', '13:00', '19:00']);
  assert.ok(dispatchedEvents.includes('dialycare_medications_updated'));
});

runTest('1.2 Should update existing medication and dispatch reactive event', () => {
  const meds = getPatientMedications('patient-c1-1');
  assert.strictEqual(meds.length, 1);
  const medId = meds[0].id;

  dispatchedEvents.length = 0;
  const updated = updatePatientMedication(medId, {
    dose: '1334 mg (2 tablets)',
    scheduleTimes: ['08:00', '19:00'],
  });

  assert.ok(updated);
  assert.strictEqual(updated?.dose, '1334 mg (2 tablets)');
  assert.deepStrictEqual(updated?.scheduleTimes, ['08:00', '19:00']);
  assert.ok(dispatchedEvents.includes('dialycare_medications_updated'));
});

// -----------------------------------------------------------------------------
// SUITE 2: Patient Activity Log Immediate Rendering & Dose Slots
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Patient Activity Log Immediate Rendering ---');

runTest('2.1 Should immediately generate exact dose slots from assigned medications', () => {
  resetEnvironment();
  addPatientMedication({
    patientId: 'patient-c1-2',
    name: 'Sevelamer Carbonate',
    nameAr: 'سيفيلامير كربونات',
    dose: '800 mg',
    scheduleTime: '08:30',
    scheduleTimes: ['08:30', '14:30', '20:30'],
  });

  const slots = computePatientMedicationDoseSlots('patient-c1-2');
  assert.strictEqual(slots.length, 3, 'Must expand 3 schedule times into 3 distinct daily dose slots');

  // Verify exact drug name, dose, and schedule times
  assert.strictEqual(slots[0].medicationName, 'Sevelamer Carbonate');
  assert.strictEqual(slots[0].dose, '800 mg');
  assert.strictEqual(slots[0].time, '08:30');
  assert.strictEqual(slots[0].status, 'pending');

  assert.strictEqual(slots[1].medicationName, 'Sevelamer Carbonate');
  assert.strictEqual(slots[1].dose, '800 mg');
  assert.strictEqual(slots[1].time, '14:30');
  assert.strictEqual(slots[1].status, 'pending');

  assert.strictEqual(slots[2].medicationName, 'Sevelamer Carbonate');
  assert.strictEqual(slots[2].dose, '800 mg');
  assert.strictEqual(slots[2].time, '20:30');
  assert.strictEqual(slots[2].status, 'pending');
});

// -----------------------------------------------------------------------------
// SUITE 3: Multiple Medications & Multi-Dose Schedules
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Multiple Medications & Multi-Dose Schedules ---');

runTest('3.1 Should sort and aggregate multiple medications chronologically', () => {
  resetEnvironment();
  // Med A: Morning & Night
  addPatientMedication({
    patientId: 'patient-c1-3',
    name: 'Carvedilol',
    dose: '6.25 mg',
    scheduleTime: '09:00',
    scheduleTimes: ['09:00', '21:00'],
  });
  // Med B: Afternoon
  addPatientMedication({
    patientId: 'patient-c1-3',
    name: 'Calcitriol',
    dose: '0.25 mcg',
    scheduleTime: '13:00',
    scheduleTimes: ['13:00'],
  });
  // Med C: Morning
  addPatientMedication({
    patientId: 'patient-c1-3',
    name: 'Erythropoietin (EPO)',
    dose: '4000 IU',
    scheduleTime: '07:00',
    scheduleTimes: ['07:00'],
  });

  const slots = computePatientMedicationDoseSlots('patient-c1-3');
  assert.strictEqual(slots.length, 4, 'Total slots must be 2 + 1 + 1 = 4');

  // Chronological verification: 07:00 -> 09:00 -> 13:00 -> 21:00
  assert.strictEqual(slots[0].time, '07:00');
  assert.strictEqual(slots[0].medicationName, 'Erythropoietin (EPO)');

  assert.strictEqual(slots[1].time, '09:00');
  assert.strictEqual(slots[1].medicationName, 'Carvedilol');

  assert.strictEqual(slots[2].time, '13:00');
  assert.strictEqual(slots[2].medicationName, 'Calcitriol');

  assert.strictEqual(slots[3].time, '21:00');
  assert.strictEqual(slots[3].medicationName, 'Carvedilol');
});

// -----------------------------------------------------------------------------
// SUITE 4: Dose Tracking (Done/Skip) & Slot Isolation
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Dose Tracking (Done/Skip) & Slot Isolation ---');

runTest('4.1 Should mark specific dose slot as Done without affecting other slots of same drug', () => {
  resetEnvironment();
  addPatientMedication({
    patientId: 'patient-c1-4',
    name: 'Cinacalcet',
    dose: '30 mg',
    scheduleTime: '08:00',
    scheduleTimes: ['08:00', '20:00'],
  });

  let slots = computePatientMedicationDoseSlots('patient-c1-4');
  assert.strictEqual(slots[0].status, 'pending');
  assert.strictEqual(slots[1].status, 'pending');

  // Mark 08:00 dose as DONE
  recordDoseInComponent('patient-c1-4', slots[0], 'done');

  slots = computePatientMedicationDoseSlots('patient-c1-4');
  assert.strictEqual(slots[0].status, 'done', '08:00 slot must be done');
  assert.strictEqual(slots[1].status, 'pending', '20:00 slot must remain pending!');
});

runTest('4.2 Should mark specific dose slot as Skipped', () => {
  let slots = computePatientMedicationDoseSlots('patient-c1-4');
  // Mark 20:00 dose as SKIPPED
  recordDoseInComponent('patient-c1-4', slots[1], 'skipped');

  slots = computePatientMedicationDoseSlots('patient-c1-4');
  assert.strictEqual(slots[0].status, 'done');
  assert.strictEqual(slots[1].status, 'skipped', '20:00 slot must be skipped');
});

runTest('4.3 Should update status when user changes decision (Skip -> Done)', () => {
  let slots = computePatientMedicationDoseSlots('patient-c1-4');
  assert.strictEqual(slots[1].status, 'skipped');

  // Patient later took the medication -> change to Done
  recordDoseInComponent('patient-c1-4', slots[1], 'done');

  slots = computePatientMedicationDoseSlots('patient-c1-4');
  assert.strictEqual(slots[1].status, 'done', 'Status must update to done from latest adherence log');
});

// -----------------------------------------------------------------------------
// SUITE 5: Patient Isolation
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Patient Isolation ---');

runTest('5.1 Medications of Patient A must never appear in Patient B slots', () => {
  resetEnvironment();
  addPatientMedication({
    patientId: 'patient-alpha',
    name: 'Alpha Secret Med 100mg',
    dose: '100 mg',
    scheduleTime: '08:00',
  });
  addPatientMedication({
    patientId: 'patient-beta',
    name: 'Beta Secret Med 200mg',
    dose: '200 mg',
    scheduleTime: '08:00',
  });

  const alphaSlots = computePatientMedicationDoseSlots('patient-alpha');
  const betaSlots = computePatientMedicationDoseSlots('patient-beta');

  assert.strictEqual(alphaSlots.length, 1);
  assert.strictEqual(alphaSlots[0].medicationName, 'Alpha Secret Med 100mg');

  assert.strictEqual(betaSlots.length, 1);
  assert.strictEqual(betaSlots[0].medicationName, 'Beta Secret Med 200mg');
});

runTest('5.2 Adherence logs of Patient A must not mark doses for Patient B', () => {
  const alphaSlots = computePatientMedicationDoseSlots('patient-alpha');
  recordDoseInComponent('patient-alpha', alphaSlots[0], 'done');

  const refreshedAlpha = computePatientMedicationDoseSlots('patient-alpha');
  const refreshedBeta = computePatientMedicationDoseSlots('patient-beta');

  assert.strictEqual(refreshedAlpha[0].status, 'done');
  assert.strictEqual(refreshedBeta[0].status, 'pending', 'Patient Beta must not be affected by Patient Alpha dose log');
});

// -----------------------------------------------------------------------------
// SUITE 6: Stress Test & Edge Cases
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: Stress Test & Edge Cases ---');

runTest('6.1 Inactive medications must be excluded from patient daily dose slots', () => {
  resetEnvironment();
  addPatientMedication({
    patientId: 'patient-edge-1',
    name: 'Discontinued Med',
    dose: '10 mg',
    scheduleTime: '08:00',
    isActive: false,
  });
  addPatientMedication({
    patientId: 'patient-edge-1',
    name: 'Active Med',
    dose: '20 mg',
    scheduleTime: '08:00',
    isActive: true,
  });

  const slots = computePatientMedicationDoseSlots('patient-edge-1');
  assert.strictEqual(slots.length, 1, 'Only active med must appear in daily dose slots');
  assert.strictEqual(slots[0].medicationName, 'Active Med');

  // Verify all meds (including inactive) are still retrievable for admin view
  const allMeds = getPatientMedications('patient-edge-1');
  assert.strictEqual(allMeds.length, 2);
  const inactiveMed = allMeds.find((m) => m.name === 'Discontinued Med');
  assert.strictEqual(inactiveMed?.isActive, false);
});

runTest('6.2 Arabic and English mixed characters and special symbols', () => {
  resetEnvironment();
  const mixedName = 'دواء رينفيلا (Renvela) 800mg - سيفيلامير كربونات & Ca+';
  const mixedDose = 'حبتين (2 tablets) 1600 mg / يوم';
  const mixedInstr = 'يؤخذ وسط الطعام مع أول لقمة 🥗💊 Avoid grapefruit juice!';

  const med = addPatientMedication({
    patientId: 'patient-edge-2',
    name: mixedName,
    nameAr: 'رينفيلا 800 مجم',
    dose: mixedDose,
    scheduleTime: '12:00',
    instructions: mixedInstr,
  });
  assert.ok(med.id);

  const slots = computePatientMedicationDoseSlots('patient-edge-2');
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].medicationName, mixedName);
  assert.strictEqual(slots[0].dose, mixedDose);
  assert.strictEqual(slots[0].instructions, mixedInstr);
});

runTest('6.3 Long drug names (10,000 characters) and HTML/XSS resilience', () => {
  resetEnvironment();
  const longName = 'Sevelamer-'.repeat(1000) + '<script>alert("xss")</script>';
  const longDose = '1000 mg '.repeat(100);

  const med = addPatientMedication({
    patientId: 'patient-edge-3',
    name: longName,
    dose: longDose,
    scheduleTime: '08:00',
  });

  assert.ok(med.id);
  const slots = computePatientMedicationDoseSlots('patient-edge-3');
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].medicationName.length, longName.length);
});

runTest('6.4 Resilient handling when scheduleTime or scheduleTimes is empty string or empty array', () => {
  resetEnvironment();
  // Drug with empty scheduleTimes array and empty string scheduleTime
  addPatientMedication({
    patientId: 'patient-edge-4',
    name: 'Unscheduled Vitamin D',
    dose: '1 mcg',
    scheduleTime: '',
    scheduleTimes: [],
  });

  // Must not throw or crash
  const slots = computePatientMedicationDoseSlots('patient-edge-4');
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].medicationName, 'Unscheduled Vitamin D');
  assert.strictEqual(slots[0].time, '');
});

// -----------------------------------------------------------------------------
// SUITE 7: EMPIRICAL DISCREPANCY ANALYSIS: "Today's Logged Doses" on patient/log/page.tsx
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 7: Activity Log "Today\'s Logged Doses" History Inspection ---');

runTest('7.1 EMPIRICAL VERIFICATION: Check whether logged doses display exact drug name vs generic fallback', () => {
  resetEnvironment();
  const med = addPatientMedication({
    patientId: 'patient-c1-7',
    name: 'Sevelamer Carbonate 800mg',
    dose: '800 mg',
    scheduleTime: '08:00',
  });

  // Log dose through PatientMedicationSection
  const log = recordDoseInComponent('patient-c1-7', {
    medicationId: med.id,
    medicationName: med.name,
    dose: med.dose,
    time: '08:00',
  }, 'done');

  // Inspect the created adherence log
  assert.strictEqual(log.data.medicationName, 'Sevelamer Carbonate 800mg');
  assert.strictEqual(log.data.dose, '800 mg');
  assert.strictEqual(log.data.scheduleTime, '08:00');

  // Now inspect what patient/log/page.tsx displays for this log
  const renderedTitleEn = resolveLogTitle(log, false);
  const renderedTitleAr = resolveLogTitle(log, true);

  console.log(`    [OBSERVATION] log.data contains: medicationName="${log.data.medicationName}"`);
  console.log(`    [OBSERVATION] log.data contains: 'title' in log.data => ${'title' in log.data}`);
  console.log(`    [OBSERVATION] patient/log/page.tsx renders: "${renderedTitleEn}" (EN) / "${renderedTitleAr}" (AR)`);

  // Notice that 'title' in log.data is FALSE!
  // Therefore patient/log/page.tsx falls back to "Scheduled Medication" / "دواء مقرر"
  // rather than "Sevelamer Carbonate 800mg"!
  assert.strictEqual(renderedTitleEn, 'Scheduled Medication', 'Reveals that patient/log/page.tsx falls back to generic Scheduled Medication because log.data has medicationName instead of title');
});

console.log('\n========================================================================');
console.log(`ALL ${passedTests} / ${totalTests} TESTS EXECUTED SUCCESSFULLY!`);
console.log('========================================================================\n');
