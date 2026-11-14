/**
 * Plausibility ranges for clinical values typed into forms.
 *
 * These bounds exist to catch typing mistakes (e.g. 7000 kg instead of 70.00),
 * not to judge clinical edge cases, so they are deliberately wide: small and
 * paediatric patients, very large patients and unusual sessions still pass.
 *
 * Checks apply at entry only. When an existing record is edited, a stored value
 * the user did not change is always accepted, even if it is outside the range,
 * so old records keep loading and saving.
 */

export interface NumericRange {
  min: number;
  max: number;
}

export const CLINICAL_RANGES = {
  /** Body weight in kilograms (pre/post dialysis weight, dry weight). */
  weightKg: { min: 10, max: 300 },
  /** Ultrafiltration volume removed in one session, mL. */
  ultrafiltrationMl: { min: 0, max: 6000 },
  /** Blood pump flow rate, mL/min. */
  bloodFlowMlMin: { min: 50, max: 600 },
  /** Daily fluid allowance, mL (same bounds as the patient profile input). */
  fluidLimitMl: { min: 200, max: 5000 },
  /** One fluid intake entry logged by a patient, mL (12 cups x 240 mL fits). */
  fluidEntryMl: { min: 1, max: 3000 },
} as const satisfies Record<string, NumericRange>;

/** True when value is a finite number inside [range.min, range.max]. */
export function isInRange(value: number, range: NumericRange): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

/**
 * True when a newly entered value must be rejected.
 * - An empty field (undefined) is never rejected here.
 * - A non-finite value (NaN, Infinity) is always rejected.
 * - A value equal to the stored value of the record being edited is accepted.
 * - Otherwise the value must be inside the range.
 */
export function isOutOfRangeEntry(
  value: number | undefined,
  range: NumericRange,
  storedValue?: number
): boolean {
  if (value === undefined) return false;
  if (!Number.isFinite(value)) return true;
  if (storedValue !== undefined && value === storedValue) return false;
  return !isInRange(value, range);
}

/**
 * Systolic must be greater than diastolic when both are entered.
 * A pair identical to the stored pair of the record being edited is accepted.
 */
export function isBloodPressurePairValid(
  systolic: number | undefined,
  diastolic: number | undefined,
  storedSystolic?: number,
  storedDiastolic?: number
): boolean {
  if (systolic === undefined || diastolic === undefined) return true;
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return false;
  if (systolic === storedSystolic && diastolic === storedDiastolic) return true;
  return systolic > diastolic;
}
