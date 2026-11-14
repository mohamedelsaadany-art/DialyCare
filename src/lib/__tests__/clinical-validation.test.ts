/**
 * Clinical entry validation (U3).
 *
 * Verifies the typo-catching plausibility ranges used by the dialysis session form
 * and the new-patient form, including the entry-only rule: a stored value that the
 * user did not change is accepted even when it is outside the range.
 */

import assert from 'node:assert';
import {
  CLINICAL_RANGES,
  isInRange,
  isOutOfRangeEntry,
  isBloodPressurePairValid,
} from '../clinical-validation';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('================================================================');
console.log('RUNNING U3: CLINICAL ENTRY VALIDATION SUITE');
console.log('================================================================\n');

const { weightKg, ultrafiltrationMl, bloodFlowMlMin, fluidLimitMl, fluidEntryMl } = CLINICAL_RANGES;

check('ranges match the agreed bounds', () => {
  assert.deepStrictEqual(weightKg, { min: 10, max: 300 });
  assert.deepStrictEqual(ultrafiltrationMl, { min: 0, max: 6000 });
  assert.deepStrictEqual(bloodFlowMlMin, { min: 50, max: 600 });
  assert.deepStrictEqual(fluidLimitMl, { min: 200, max: 5000 });
  assert.deepStrictEqual(fluidEntryMl, { min: 1, max: 3000 });
});

check('isInRange accepts bounds inclusively and rejects outside / non-finite', () => {
  assert.strictEqual(isInRange(10, weightKg), true);
  assert.strictEqual(isInRange(300, weightKg), true);
  assert.strictEqual(isInRange(72.5, weightKg), true);
  assert.strictEqual(isInRange(9.9, weightKg), false);
  assert.strictEqual(isInRange(300.1, weightKg), false);
  assert.strictEqual(isInRange(NaN, weightKg), false);
  assert.strictEqual(isInRange(Infinity, weightKg), false);
});

check('weight typos are rejected, realistic weights (incl. paediatric and bariatric) accepted', () => {
  assert.strictEqual(isOutOfRangeEntry(7000, weightKg), true);
  assert.strictEqual(isOutOfRangeEntry(0.7, weightKg), true);
  assert.strictEqual(isOutOfRangeEntry(12, weightKg), false);
  assert.strictEqual(isOutOfRangeEntry(30, weightKg), false);
  assert.strictEqual(isOutOfRangeEntry(180, weightKg), false);
});

check('empty field is never rejected; NaN always is', () => {
  assert.strictEqual(isOutOfRangeEntry(undefined, weightKg), false);
  assert.strictEqual(isOutOfRangeEntry(NaN, weightKg), true);
  assert.strictEqual(isOutOfRangeEntry(NaN, weightKg, NaN), true);
});

check('entry-only rule: unchanged stored value outside the range is accepted', () => {
  assert.strictEqual(isOutOfRangeEntry(450, weightKg, 450), false);
  assert.strictEqual(isOutOfRangeEntry(9000, ultrafiltrationMl, 9000), false);
  // ...but changing it to another out-of-range value is rejected
  assert.strictEqual(isOutOfRangeEntry(460, weightKg, 450), true);
  // ...and changing it to an in-range value is accepted
  assert.strictEqual(isOutOfRangeEntry(75, weightKg, 450), false);
});

check('ultrafiltration volume: 0..6000 mL', () => {
  assert.strictEqual(isOutOfRangeEntry(0, ultrafiltrationMl), false);
  assert.strictEqual(isOutOfRangeEntry(2500, ultrafiltrationMl), false);
  assert.strictEqual(isOutOfRangeEntry(6000, ultrafiltrationMl), false);
  assert.strictEqual(isOutOfRangeEntry(25000, ultrafiltrationMl), true);
  assert.strictEqual(isOutOfRangeEntry(-1, ultrafiltrationMl), true);
});

check('blood flow rate: 50..600 mL/min', () => {
  assert.strictEqual(isOutOfRangeEntry(300, bloodFlowMlMin), false);
  assert.strictEqual(isOutOfRangeEntry(50, bloodFlowMlMin), false);
  assert.strictEqual(isOutOfRangeEntry(600, bloodFlowMlMin), false);
  assert.strictEqual(isOutOfRangeEntry(3000, bloodFlowMlMin), true);
  assert.strictEqual(isOutOfRangeEntry(5, bloodFlowMlMin), true);
});

check('fluid limit: 200..5000 mL', () => {
  assert.strictEqual(isOutOfRangeEntry(1000, fluidLimitMl), false);
  assert.strictEqual(isOutOfRangeEntry(150, fluidLimitMl), true);
  assert.strictEqual(isOutOfRangeEntry(15000, fluidLimitMl), true);
});

check('single fluid entry: 1..3000 mL (12 cups = 2880 mL fits)', () => {
  assert.strictEqual(isInRange(150, fluidEntryMl), true);
  assert.strictEqual(isInRange(12 * 240, fluidEntryMl), true);
  assert.strictEqual(isInRange(15000, fluidEntryMl), false);
  assert.strictEqual(isInRange(0, fluidEntryMl), false);
});

check('blood pressure pair: systolic must exceed diastolic when both entered', () => {
  assert.strictEqual(isBloodPressurePairValid(120, 80), true);
  assert.strictEqual(isBloodPressurePairValid(80, 120), false);
  assert.strictEqual(isBloodPressurePairValid(90, 90), false);
  assert.strictEqual(isBloodPressurePairValid(120, undefined), true);
  assert.strictEqual(isBloodPressurePairValid(undefined, 80), true);
  assert.strictEqual(isBloodPressurePairValid(undefined, undefined), true);
  assert.strictEqual(isBloodPressurePairValid(NaN, 80), false);
});

check('blood pressure pair: unchanged stored inverted pair is accepted, edited one is not', () => {
  assert.strictEqual(isBloodPressurePairValid(70, 90, 70, 90), true);
  assert.strictEqual(isBloodPressurePairValid(75, 90, 70, 90), false);
});

console.log(`\nALL ${passed} CLINICAL VALIDATION CHECKS PASSED (EXIT 0)`);
