/**
 * Challenger Test Suite: Dialysis Treatment Adherence Questionnaire (R7)
 *
 * Verifies:
 * 1. Exact 20 adherence questions across 4 clinical sections:
 *    - Q1..Q5: Dialysis Attendance (أولاً: حضور جلسات الغسيل)
 *    - Q6..Q10: Medications (ثانياً: الأدوية)
 *    - Q11..Q15: Diet (ثالثاً: الطعام)
 *    - Q16..Q20: Fluids (رابعاً: السوائل)
 * 2. Exact 6 Likert options in strict requested order:
 *    1. دائمًا (Always)
 *    2. غالبًا (Often)
 *    3. أحيانًا (Sometimes)
 *    4. نادرًا (Rarely)
 *    5. أبدًا (Never)
 *    6. لا ينطبق (Not applicable)
 * 3. Clinical scoring engine & algorithms:
 *    - 100% adherence when all answers are 1 (Always)
 *    - Option 6 (Not applicable) safely excluded from denominator
 *    - Domain section scores (dialysis, medications, diet, fluids)
 *    - Asymmetric scores, boundary values, zero denominator safety
 * 4. Monthly cycle scheduling logic in getPatientSurveyStatus:
 *    - Month 0 / Baseline (0 submissions) -> isDue: true, reason: 'initial', cycle 1
 *    - Post-submission (< 30 days) -> isDue: false, reason: 'completed'
 *    - >= 30 days -> isDue: true, reason: 'monthly_due', cycle 2 (Month 1)
 *    - >= 60 days -> isDue: true, reason: 'monthly_due', cycle 3 (Month 2)
 *    - >= 90 days -> isDue: true, reason: 'monthly_due', cycle 4 (Month 3)
 * 5. Doctor manual activation:
 *    - Overrides 30-day interval immediately -> isDue: true, reason: 'doctor_activated'
 *    - Automatically clears flag upon patient submission
 * 6. Doctor notification dispatch:
 *    - sendSurveyReminderNotification creates targeted bilingual notification
 * 7. Survey persistence, descending history sorting, and event dispatching.
 */

import assert from 'node:assert';
import {
  ADHERENCE_QUESTIONS,
  QUESTIONNAIRE_OPTIONS,
  QUESTIONNAIRE_SECTIONS,
  calculateSurveyScore,
  calculateAdherenceScore,
  getCycleInfo,
} from '../questionnaire-data';
import {
  initDataStore,
  getAdherenceSurveys,
  saveAdherenceSurvey,
  getPatientSurveyStatus,
  setDoctorSurveyActivation,
  isDoctorSurveyActivated,
  sendSurveyReminderNotification,
  STORAGE_KEYS,
  getNotifications,
  getPatientNotifications,
} from '../data-store';
import type {
  AdherenceSurveySubmission,
  QuestionnaireOptionValue,
} from '../types';

// ========================================================
// Node.js LocalStorage & DOM Event Mocking
// ========================================================
const mockStore: Record<string, string> = {};
const firedEvents: string[] = [];

if (typeof window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in mockStore ? mockStore[k] : null),
      setItem: (k: string, v: string) => {
        mockStore[k] = String(v);
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
} else {
  // Chain existing window.dispatchEvent to also log into firedEvents
  const prevDispatch = window.dispatchEvent?.bind(window);
  window.dispatchEvent = (ev: Event) => {
    firedEvents.push(ev.type);
    if (prevDispatch) {
      try { prevDispatch(ev); } catch { /* ignore */ }
    }
    return true;
  };
}

function setStorageItem(key: string, value: unknown) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, str);
  } else {
    mockStore[key] = str;
  }
}

function resetEnvironment() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  firedEvents.length = 0;
  initDataStore();
}

console.log('================================================================');
console.log('DIALYSIS TREATMENT ADHERENCE QUESTIONNAIRE (R7) TEST SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    throw err;
  }
}

// ========================================================
// SECTION 1: 20 QUESTIONS & 4 CLINICAL DOMAINS INTEGRITY
// ========================================================
console.log('--- Test Suite 1: 20 Questions Integrity & 4 Clinical Sections ---');

runTest('1.1 Should contain exactly 20 questions', () => {
  assert.strictEqual(ADHERENCE_QUESTIONS.length, 20, 'Questionnaire must contain exactly 20 questions');
});

runTest('1.2 Should have sequential IDs 1 to 20 without duplicates or gaps', () => {
  const ids = ADHERENCE_QUESTIONS.map((q) => q.id);
  assert.strictEqual(new Set(ids).size, 20, 'All question IDs must be unique');
  for (let i = 1; i <= 20; i++) {
    assert.strictEqual(ids[i - 1], i, `Question index ${i - 1} must have id ${i}`);
  }
});

runTest('1.3 Questions Q1..Q5 must belong to Dialysis Attendance section', () => {
  for (let id = 1; id <= 5; id++) {
    const q = ADHERENCE_QUESTIONS.find((item) => item.id === id);
    assert.ok(q, `Question ${id} must exist`);
    assert.strictEqual(q.category, 'dialysis', `Question ${id} must have category 'dialysis'`);
    assert.ok(q.textAr && q.textAr.trim().length > 5, `Question ${id} must have valid Arabic text`);
    assert.ok(q.textEn && q.textEn.trim().length > 5, `Question ${id} must have valid English text`);
  }
});

runTest('1.4 Questions Q6..Q10 must belong to Medications section', () => {
  for (let id = 6; id <= 10; id++) {
    const q = ADHERENCE_QUESTIONS.find((item) => item.id === id);
    assert.ok(q, `Question ${id} must exist`);
    assert.strictEqual(q.category, 'medications', `Question ${id} must have category 'medications'`);
    assert.ok(q.textAr && q.textAr.trim().length > 5, `Question ${id} must have valid Arabic text`);
    assert.ok(q.textEn && q.textEn.trim().length > 5, `Question ${id} must have valid English text`);
  }
});

runTest('1.5 Questions Q11..Q15 must belong to Diet section', () => {
  for (let id = 11; id <= 15; id++) {
    const q = ADHERENCE_QUESTIONS.find((item) => item.id === id);
    assert.ok(q, `Question ${id} must exist`);
    assert.strictEqual(q.category, 'diet', `Question ${id} must have category 'diet'`);
    assert.ok(q.textAr && q.textAr.trim().length > 5, `Question ${id} must have valid Arabic text`);
    assert.ok(q.textEn && q.textEn.trim().length > 5, `Question ${id} must have valid English text`);
  }
});

runTest('1.6 Questions Q16..Q20 must belong to Fluids section', () => {
  for (let id = 16; id <= 20; id++) {
    const q = ADHERENCE_QUESTIONS.find((item) => item.id === id);
    assert.ok(q, `Question ${id} must exist`);
    assert.strictEqual(q.category, 'fluids', `Question ${id} must have category 'fluids'`);
    assert.ok(q.textAr && q.textAr.trim().length > 5, `Question ${id} must have valid Arabic text`);
    assert.ok(q.textEn && q.textEn.trim().length > 5, `Question ${id} must have valid English text`);
  }
});

runTest('1.7 Should have 4 structured sections with correct question mappings and icons', () => {
  assert.strictEqual(QUESTIONNAIRE_SECTIONS.length, 4, 'Must have 4 sections');

  const [dialysisSec, medsSec, dietSec, fluidsSec] = QUESTIONNAIRE_SECTIONS;

  assert.strictEqual(dialysisSec.id, 'dialysis');
  assert.deepStrictEqual(dialysisSec.questionIds, [1, 2, 3, 4, 5]);
  assert.ok(dialysisSec.titleAr.includes('الغسيل'));
  assert.ok(dialysisSec.titleEn.includes('Dialysis'));

  assert.strictEqual(medsSec.id, 'medications');
  assert.deepStrictEqual(medsSec.questionIds, [6, 7, 8, 9, 10]);
  assert.ok(medsSec.titleAr.includes('الأدوية'));
  assert.ok(medsSec.titleEn.includes('Medication'));

  assert.strictEqual(dietSec.id, 'diet');
  assert.deepStrictEqual(dietSec.questionIds, [11, 12, 13, 14, 15]);
  assert.ok(dietSec.titleAr.includes('الطعام'));
  assert.ok(dietSec.titleEn.includes('Diet'));

  assert.strictEqual(fluidsSec.id, 'fluids');
  assert.deepStrictEqual(fluidsSec.questionIds, [16, 17, 18, 19, 20]);
  assert.ok(fluidsSec.titleAr.includes('السوائل'));
  assert.ok(fluidsSec.titleEn.includes('Fluid'));
});

runTest('1.8 Key clinical concepts must be present in Arabic & English question texts', () => {
  // Q8: Phosphate binder / دواء الفوسفور
  const q8 = ADHERENCE_QUESTIONS.find((q) => q.id === 8)!;
  assert.ok(q8.textAr.includes('الفوسفور'), 'Q8 must mention phosphorus binder in Arabic');
  assert.ok(q8.textEn.toLowerCase().includes('phosphate'), 'Q8 must mention phosphate in English');

  // Q12: Potassium / البوتاسيوم
  const q12 = ADHERENCE_QUESTIONS.find((q) => q.id === 12)!;
  assert.ok(q12.textAr.includes('البوتاسيوم'), 'Q12 must mention potassium in Arabic');
  assert.ok(q12.textEn.toLowerCase().includes('potassium'), 'Q12 must mention potassium in English');

  // Q14: Salt / الملح
  const q14 = ADHERENCE_QUESTIONS.find((q) => q.id === 14)!;
  assert.ok(q14.textAr.includes('الملح'), 'Q14 must mention salt in Arabic');
  assert.ok(q14.textEn.toLowerCase().includes('salt'), 'Q14 must mention salt in English');

  // Q20: Interdialytic weight gain / زيادة وزني بين جلستي الغسيل
  const q20 = ADHERENCE_QUESTIONS.find((q) => q.id === 20)!;
  assert.ok(q20.textAr.includes('زيادة وزني'), 'Q20 must mention weight gain in Arabic');
  assert.ok(q20.textEn.toLowerCase().includes('weight gain'), 'Q20 must mention weight gain in English');
});

// ========================================================
// SECTION 2: 6 LIKERT OPTIONS EXACT ORDER & SCORING WEIGHTS
// ========================================================
console.log('\n--- Test Suite 2: 6 Likert Options Exact Order & Weights ---');

runTest('2.1 Should have exactly 6 options', () => {
  assert.strictEqual(QUESTIONNAIRE_OPTIONS.length, 6, 'Must provide exactly 6 options');
});

runTest('2.2 Options must be in exact specified order with precise Arabic and English strings', () => {
  const expected = [
    { id: 1, textAr: 'دائمًا', textEn: 'Always', scoreWeight: 5 },
    { id: 2, textAr: 'غالبًا', textEn: 'Often', scoreWeight: 4 },
    { id: 3, textAr: 'أحيانًا', textEn: 'Sometimes', scoreWeight: 3 },
    { id: 4, textAr: 'نادرًا', textEn: 'Rarely', scoreWeight: 2 },
    { id: 5, textAr: 'أبدًا', textEn: 'Never', scoreWeight: 1 },
    { id: 6, textAr: 'لا ينطبق', textEn: 'Not applicable', scoreWeight: null },
  ];

  for (let idx = 0; idx < 6; idx++) {
    const opt = QUESTIONNAIRE_OPTIONS[idx];
    const exp = expected[idx];
    assert.strictEqual(opt.id, exp.id, `Option at index ${idx} must have id ${exp.id}`);
    assert.strictEqual(opt.textAr, exp.textAr, `Option ${exp.id} Arabic text mismatch`);
    assert.strictEqual(opt.textEn, exp.textEn, `Option ${exp.id} English text mismatch`);
    assert.strictEqual(opt.scoreWeight, exp.scoreWeight, `Option ${exp.id} scoreWeight mismatch`);
  }
});

runTest('2.3 Option 6 (Not applicable) must have null score weight to exclude from denominator', () => {
  const opt6 = QUESTIONNAIRE_OPTIONS.find((o) => o.id === 6);
  assert.ok(opt6, 'Option 6 must exist');
  assert.strictEqual(opt6.scoreWeight, null, 'Option 6 scoreWeight must be null');
});

// ========================================================
// SECTION 3: SCORING ENGINE & ALGORITHM PERMUTATIONS
// ========================================================
console.log('\n--- Test Suite 3: Scoring Engine Permutations & Edge Cases ---');

runTest('3.1 All answers = 1 (Always) -> 100% adherence overall and per section', () => {
  const allAlways: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) allAlways[i] = 1;

  const score = calculateSurveyScore(allAlways);
  assert.strictEqual(score.overallPercent, 100, 'Overall adherence must be 100%');
  assert.strictEqual(score.overallScorePercent, 100, 'overallScorePercent alias must be 100%');
  assert.strictEqual(score.totalPointsEarned, 100, 'Total points earned must be 100');
  assert.strictEqual(score.totalPossiblePoints, 100, 'Total possible points must be 100');
  assert.strictEqual(score.applicableCount, 20, 'All 20 questions must be applicable');

  assert.strictEqual(score.sectionScores.dialysisPercent, 100);
  assert.strictEqual(score.sectionScores.medicationsPercent, 100);
  assert.strictEqual(score.sectionScores.dietPercent, 100);
  assert.strictEqual(score.sectionScores.fluidsPercent, 100);
});

runTest('3.2 All answers = 5 (Never) -> 20% adherence (minimum non-zero)', () => {
  const allNever: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) allNever[i] = 5;

  const score = calculateSurveyScore(allNever);
  assert.strictEqual(score.overallPercent, 20, 'Overall adherence must be 20%');
  assert.strictEqual(score.totalPointsEarned, 20, 'Total points earned must be 20');
  assert.strictEqual(score.totalPossiblePoints, 100, 'Total possible points must be 100');
  assert.strictEqual(score.sectionScores.dialysisPercent, 20);
  assert.strictEqual(score.sectionScores.medicationsPercent, 20);
  assert.strictEqual(score.sectionScores.dietPercent, 20);
  assert.strictEqual(score.sectionScores.fluidsPercent, 20);
});

runTest('3.3 All answers = 3 (Sometimes) -> 60% adherence', () => {
  const allSometimes: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) allSometimes[i] = 3;

  const score = calculateSurveyScore(allSometimes);
  assert.strictEqual(score.overallPercent, 60, 'Overall adherence must be 60%');
  assert.strictEqual(score.totalPointsEarned, 60, 'Total points earned must be 60');
  assert.strictEqual(score.totalPossiblePoints, 100, 'Total possible points must be 100');
});

runTest('3.4 Safe exclusion of Option 6 (Not applicable) from denominator', () => {
  // If Q1 is N/A (6), and Q2..Q5 are 1 (Always), and rest are 1 (Always):
  // Dialysis section max points = 4 * 5 = 20, earned = 20 -> 100%
  // Overall max points = 95, earned = 95 -> 100%
  const answers: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) answers[i] = 1;
  answers[1] = 6; // Q1 = N/A

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.applicableCount, 19, 'Applicable count must be 19');
  assert.strictEqual(score.totalPossiblePoints, 95, 'Total possible points must be 95 (excluding Q1)');
  assert.strictEqual(score.totalPointsEarned, 95, 'Total points earned must be 95');
  assert.strictEqual(score.overallPercent, 100, 'Overall must still be 100%');
  assert.strictEqual(score.sectionScores.dialysisPercent, 100, 'Dialysis section must be 100%');

  // Now make Q2 = 5 (Never: 1 pt). Dialysis earned = 1 + 5 + 5 + 5 = 16 out of 20 (80%).
  answers[2] = 5;
  const score2 = calculateSurveyScore(answers);
  assert.strictEqual(score2.sectionScores.dialysisPercent, 80, 'Dialysis section must be 16/20 = 80%');
});

runTest('3.5 Multiple N/A options across different sections', () => {
  // Q1, Q6, Q11, Q16 are all N/A (6). Each section has 4 questions left.
  // Remaining questions in Dialysis = Always (1) -> 20/20 = 100%
  // Remaining questions in Meds = Often (2) -> 16/20 = 80%
  // Remaining questions in Diet = Sometimes (3) -> 12/20 = 60%
  // Remaining questions in Fluids = Rarely (4) -> 8/20 = 40%
  const answers: Record<number, number> = {
    // Dialysis
    1: 6, 2: 1, 3: 1, 4: 1, 5: 1,
    // Meds
    6: 6, 7: 2, 8: 2, 9: 2, 10: 2,
    // Diet
    11: 6, 12: 3, 13: 3, 14: 3, 15: 3,
    // Fluids
    16: 6, 17: 4, 18: 4, 19: 4, 20: 4,
  };

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.applicableCount, 16);
  assert.strictEqual(score.totalPossiblePoints, 80);
  assert.strictEqual(score.totalPointsEarned, 20 + 16 + 12 + 8); // 56
  assert.strictEqual(score.overallPercent, 70); // 56 / 80 = 70%
  assert.strictEqual(score.sectionScores.dialysisPercent, 100);
  assert.strictEqual(score.sectionScores.medicationsPercent, 80);
  assert.strictEqual(score.sectionScores.dietPercent, 60);
  assert.strictEqual(score.sectionScores.fluidsPercent, 40);
});

runTest('3.6 Edge case: Entire section answered with Option 6 (N/A) does not divide by zero', () => {
  const answers: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) answers[i] = 1;
  // Entire fluids section (16..20) answered with N/A
  for (let i = 16; i <= 20; i++) answers[i] = 6;

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.applicableCount, 15);
  assert.strictEqual(score.totalPossiblePoints, 75);
  assert.strictEqual(score.totalPointsEarned, 75);
  assert.strictEqual(score.overallPercent, 100);
  assert.strictEqual(score.sectionScores.fluidsPercent, 100, 'Fluids section with all N/A safely returns 100%');
});

runTest('3.7 Edge case: All 20 questions answered with Option 6 (N/A)', () => {
  const answers: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) answers[i] = 6;

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.applicableCount, 0);
  assert.strictEqual(score.totalPossiblePoints, 0);
  assert.strictEqual(score.totalPointsEarned, 0);
  assert.strictEqual(score.overallPercent, 100, 'All N/A returns safe 100%');
});

runTest('3.8 Alias calculateAdherenceScore produces identical result to calculateSurveyScore', () => {
  const answers: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  assert.deepStrictEqual(calculateAdherenceScore(answers), calculateSurveyScore(answers));
});

// ========================================================
// SECTION 4: MONTHLY CYCLE SCHEDULING LOGIC
// ========================================================
console.log('\n--- Test Suite 4: Monthly Timing & Cycle Calculation ---');

runTest('4.1 First use / 0 submissions -> isDue: true, reason: "initial", cycle 1', () => {
  resetEnvironment();
  const patientId = 'patient-test-1';

  const status = getPatientSurveyStatus(patientId);
  assert.strictEqual(status.isDue, true, 'Survey must be due on first use');
  assert.strictEqual(status.reason, 'initial', 'Reason must be initial');
  assert.strictEqual(status.currentCycleNumber, 1, 'Current cycle must be 1');
  assert.strictEqual(status.cycleLabelAr, 'الاستبيان الأولي - بداية الاستخدام');
  assert.strictEqual(status.cycleLabelEn, 'Initial Baseline');
  assert.strictEqual(status.totalSubmissions, 0);
  assert.strictEqual(status.daysUntilDue, 0);
  assert.strictEqual(status.isManuallyActivatedByDoctor, false);
});

runTest('4.2 Immediately after 1 submission (< 30 days) -> isDue: false, reason: "completed"', () => {
  resetEnvironment();
  const patientId = 'patient-test-1';

  // Patient submits baseline survey on 2026-01-01
  const baselineAnswers: Record<number, QuestionnaireOptionValue> = {};
  for (let i = 1; i <= 20; i++) baselineAnswers[i] = 1;

  saveAdherenceSurvey({
    patientId,
    submittedAt: '2026-01-01T00:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
    cycleLabelEn: 'Initial Baseline',
    answers: baselineAnswers,
    overallScorePercent: 100,
    sectionScores: { dialysisPercent: 100, medicationsPercent: 100, dietPercent: 100, fluidsPercent: 100 },
  });

  // Query 1 day later (2026-01-02)
  const day1Status = getPatientSurveyStatus(patientId, new Date('2026-01-02T12:00:00.000Z'));
  assert.strictEqual(day1Status.isDue, false, 'Survey must not be due 1 day after submission');
  assert.strictEqual(day1Status.reason, 'completed', 'Reason must be completed');
  assert.strictEqual(day1Status.totalSubmissions, 1);
  assert.strictEqual(day1Status.daysUntilDue, 29, '29 days should remain');

  // Query 15 days later (2026-01-16)
  const day15Status = getPatientSurveyStatus(patientId, new Date('2026-01-16T12:00:00.000Z'));
  assert.strictEqual(day15Status.isDue, false);
  assert.strictEqual(day15Status.reason, 'completed');
  assert.strictEqual(day15Status.daysUntilDue, 15);

  // Query 29 days later (2026-01-30)
  const day29Status = getPatientSurveyStatus(patientId, new Date('2026-01-30T12:00:00.000Z'));
  assert.strictEqual(day29Status.isDue, false);
  assert.strictEqual(day29Status.daysUntilDue, 1);
});

runTest('4.3 After >= 30 days -> isDue: true, reason: "monthly_due", cycle 2 (Month 1)', () => {
  resetEnvironment();
  const patientId = 'patient-test-1';

  // Seed baseline survey manually in store with explicit timestamp: 2026-01-01T00:00:00Z
  const baselineSub: AdherenceSurveySubmission = {
    id: 'sub-baseline-1',
    patientId,
    submittedAt: '2026-01-01T00:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
    cycleLabelEn: 'Initial Baseline',
    answers: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    overallScorePercent: 100,
    sectionScores: { dialysisPercent: 100, medicationsPercent: 100, dietPercent: 100, fluidsPercent: 100 },
  };
  // Query at exactly Day 30: 2026-01-31T00:00:00Z
  setStorageItem(STORAGE_KEYS.ADHERENCE_SURVEYS, [baselineSub]);
  const day30Status = getPatientSurveyStatus(patientId, new Date('2026-01-31T00:00:00.000Z'));
  assert.strictEqual(day30Status.isDue, true, 'Survey must be due at Day 30');
  assert.strictEqual(day30Status.reason, 'monthly_due', 'Reason must be monthly_due');
  assert.strictEqual(day30Status.currentCycleNumber, 2, 'Current cycle must be 2');
  assert.ok(day30Status.cycleLabelAr.includes('الأول'), 'Arabic label must indicate Month 1');
  assert.ok(day30Status.cycleLabelEn.includes('Month 1'), 'English label must indicate Month 1');
  assert.strictEqual(day30Status.daysUntilDue, 0);

  // Query at Day 35: still due
  const day35Status = getPatientSurveyStatus(patientId, new Date('2026-02-05T00:00:00.000Z'));
  assert.strictEqual(day35Status.isDue, true);
  assert.strictEqual(day35Status.reason, 'monthly_due');
  assert.strictEqual(day35Status.currentCycleNumber, 2);
});

runTest('4.4 Cycle 3 (Month 2) progression after second survey submission', () => {
  resetEnvironment();
  const patientId = 'patient-test-1';

  // Seed two previous submissions:
  // Baseline: 2026-01-01
  // Month 1:  2026-01-31
  const sub1: AdherenceSurveySubmission = {
    id: 'sub-1',
    patientId,
    submittedAt: '2026-01-01T00:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
    cycleLabelEn: 'Initial Baseline',
    answers: { 1: 1 },
    overallScorePercent: 90,
    sectionScores: { dialysisPercent: 90, medicationsPercent: 90, dietPercent: 90, fluidsPercent: 90 },
  };
  const sub2: AdherenceSurveySubmission = {
    id: 'sub-2',
    patientId,
    submittedAt: '2026-01-31T00:00:00.000Z',
    cycleNumber: 2,
    cycleLabelAr: 'استبيان المتابعة - الشهر الأول',
    cycleLabelEn: 'Follow-up - Month 1',
    answers: { 1: 1 },
    overallScorePercent: 95,
    sectionScores: { dialysisPercent: 95, medicationsPercent: 95, dietPercent: 95, fluidsPercent: 95 },
  };
  setStorageItem(STORAGE_KEYS.ADHERENCE_SURVEYS, [sub2, sub1]);

  // Day 45 (15 days after Month 1 sub): completed
  const day45Status = getPatientSurveyStatus(patientId, new Date('2026-02-15T00:00:00.000Z'));
  assert.strictEqual(day45Status.isDue, false);
  assert.strictEqual(day45Status.reason, 'completed');
  assert.strictEqual(day45Status.totalSubmissions, 2);

  // Day 61 (31 days after Month 1 sub): Month 2 survey due
  const day61Status = getPatientSurveyStatus(patientId, new Date('2026-03-03T00:00:00.000Z'));
  assert.strictEqual(day61Status.isDue, true);
  assert.strictEqual(day61Status.reason, 'monthly_due');
  assert.strictEqual(day61Status.currentCycleNumber, 3, 'Current cycle must be 3');
  assert.ok(day61Status.cycleLabelAr.includes('الثاني'), 'Arabic label must indicate Month 2');
  assert.ok(day61Status.cycleLabelEn.includes('Month 2'), 'English label must indicate Month 2');
});

runTest('4.5 Cycle 4 (Month 3) progression and getCycleInfo utility', () => {
  const c1 = getCycleInfo(1);
  assert.strictEqual(c1.cycleNumber, 1);
  assert.strictEqual(c1.cycleLabelAr, 'الاستبيان الأولي - بداية الاستخدام');
  assert.strictEqual(c1.cycleLabelEn, 'Initial Baseline');

  const c2 = getCycleInfo(2);
  assert.strictEqual(c2.cycleNumber, 2);
  assert.ok(c2.cycleLabelAr.includes('الأول'));
  assert.ok(c2.cycleLabelEn.includes('Month 1'));

  const c3 = getCycleInfo(3);
  assert.strictEqual(c3.cycleNumber, 3);
  assert.ok(c3.cycleLabelAr.includes('الثاني'));
  assert.ok(c3.cycleLabelEn.includes('Month 2'));

  const c4 = getCycleInfo(4);
  assert.strictEqual(c4.cycleNumber, 4);
  assert.ok(c4.cycleLabelAr.includes('الثالث'));
  assert.ok(c4.cycleLabelEn.includes('Month 3'));

  const c12 = getCycleInfo(12);
  assert.strictEqual(c12.cycleNumber, 12);
  assert.ok(c12.cycleLabelEn.includes('Month 11'));
});

// ========================================================
// SECTION 5: DOCTOR MANUAL ACTIVATION OVERRIDE
// ========================================================
console.log('\n--- Test Suite 5: Doctor Manual Activation Immediate Override ---');

runTest('5.1 Doctor activation overrides 30-day interval to make survey immediately due', () => {
  resetEnvironment();
  const patientId = 'patient-test-doc-act';

  // Seed 1 recent submission (only 2 days ago)
  const sub: AdherenceSurveySubmission = {
    id: 'sub-recent',
    patientId,
    submittedAt: '2026-03-01T10:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
    cycleLabelEn: 'Initial Baseline',
    answers: { 1: 1 },
    overallScorePercent: 100,
    sectionScores: { dialysisPercent: 100, medicationsPercent: 100, dietPercent: 100, fluidsPercent: 100 },
  };
  setStorageItem(STORAGE_KEYS.ADHERENCE_SURVEYS, [sub]);

  // On 2026-03-03, survey is NOT due
  const beforeAct = getPatientSurveyStatus(patientId, new Date('2026-03-03T10:00:00.000Z'));
  assert.strictEqual(beforeAct.isDue, false, 'Survey must not be due initially');
  assert.strictEqual(beforeAct.reason, 'completed');

  // Doctor clicks "تفعيل الاستبيان الآن للمريض"
  setDoctorSurveyActivation(patientId, true);
  assert.strictEqual(isDoctorSurveyActivated(patientId), true, 'Activation flag must be true');

  // Query status immediately
  const afterAct = getPatientSurveyStatus(patientId, new Date('2026-03-03T10:05:00.000Z'));
  assert.strictEqual(afterAct.isDue, true, 'Survey must be immediately due after doctor activation');
  assert.strictEqual(afterAct.reason, 'doctor_activated', 'Reason must be doctor_activated');
  assert.strictEqual(afterAct.isManuallyActivatedByDoctor, true, 'isManuallyActivatedByDoctor must be true');
  assert.strictEqual(afterAct.currentCycleNumber, 2, 'Next cycle must be cycle 2');
});

runTest('5.2 Submitting survey automatically clears doctor manual activation flag', () => {
  const patientId = 'patient-test-doc-act';

  // Submit the survey triggered by doctor
  saveAdherenceSurvey({
    patientId,
    cycleNumber: 2,
    cycleLabelAr: 'استبيان المتابعة - الشهر الأول',
    cycleLabelEn: 'Follow-up - Month 1',
    answers: { 1: 1, 2: 1, 3: 1 },
    overallScorePercent: 88,
    sectionScores: { dialysisPercent: 88, medicationsPercent: 88, dietPercent: 88, fluidsPercent: 88 },
  });

  // Activation flag must be cleared
  assert.strictEqual(isDoctorSurveyActivated(patientId), false, 'Doctor activation flag must be cleared after submission');

  // Status must now be completed
  const statusAfterSub = getPatientSurveyStatus(patientId);
  assert.strictEqual(statusAfterSub.isDue, false, 'Survey must now be completed');
  assert.strictEqual(statusAfterSub.reason, 'completed');
  assert.strictEqual(statusAfterSub.totalSubmissions, 2);
});

runTest('5.3 Doctor can deactivate survey manually without submitting', () => {
  resetEnvironment();
  const patientId = 'patient-test-deact';

  setDoctorSurveyActivation(patientId, true);
  assert.strictEqual(isDoctorSurveyActivated(patientId), true);

  // Doctor changes mind and deactivates
  setDoctorSurveyActivation(patientId, false);
  assert.strictEqual(isDoctorSurveyActivated(patientId), false);
});

// ========================================================
// SECTION 6: DOCTOR NOTIFICATION DISPATCH
// ========================================================
console.log('\n--- Test Suite 6: Doctor Survey Reminder Notification Dispatch ---');

runTest('6.1 sendSurveyReminderNotification creates targeted bilingual notification in store', () => {
  resetEnvironment();
  const patientId = 'patient-notif-target';
  const doctorName = 'د. خالد عبد الله';

  const notif = sendSurveyReminderNotification(patientId, doctorName);
  assert.ok(notif.id, 'Notification must have a unique id');
  assert.strictEqual(notif.senderId, 'doctor');
  assert.strictEqual(notif.type, 'individual');
  assert.deepStrictEqual(notif.recipientIds, [patientId]);
  assert.ok(notif.titleAr.includes('استبيان الالتزام'), 'Arabic title must mention adherence questionnaire');
  assert.ok(notif.titleEn.includes('Adherence Questionnaire'), 'English title must mention adherence questionnaire');
  assert.ok(notif.messageAr.includes(doctorName), 'Arabic message must include doctor name');
  assert.ok(notif.messageEn.includes(doctorName), 'English message must include doctor name');
  assert.strictEqual(notif.status, 'sent');

  // Verify persistence in store
  const allNotifs = getNotifications();
  const found = allNotifs.find((n) => n.id === notif.id);
  assert.ok(found, 'Notification must be stored in notifications list');
});

runTest('6.2 Patient recipient filtering isolates notifications accurately', () => {
  resetEnvironment();
  const patient1 = 'patient-1';
  const patient2 = 'patient-2';

  sendSurveyReminderNotification(patient1, 'Dr. Smith');

  const p1Notifs = getPatientNotifications(patient1);
  const p2Notifs = getPatientNotifications(patient2);

  assert.ok(p1Notifs.some((n) => n.titleEn.includes('Adherence Questionnaire')), 'Patient 1 must have reminder');
  assert.ok(!p2Notifs.some((n) => n.titleEn.includes('Adherence Questionnaire')), 'Patient 2 must NOT have reminder');
});

// ========================================================
// SECTION 7: PERSISTENCE, HISTORY SORTING & EVENT DISPATCH
// ========================================================
console.log('\n--- Test Suite 7: Survey Persistence, History & Storage Events ---');

runTest('7.1 getAdherenceSurveys sorts submissions descending by date (newest first)', () => {
  resetEnvironment();
  const patientId = 'patient-sort-test';

  const subOld: AdherenceSurveySubmission = {
    id: 'sub-old',
    patientId,
    submittedAt: '2026-01-01T10:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي',
    cycleLabelEn: 'Initial',
    answers: { 1: 1 },
    overallScorePercent: 75,
    sectionScores: { dialysisPercent: 75, medicationsPercent: 75, dietPercent: 75, fluidsPercent: 75 },
  };

  const subNew: AdherenceSurveySubmission = {
    id: 'sub-new',
    patientId,
    submittedAt: '2026-02-01T10:00:00.000Z',
    cycleNumber: 2,
    cycleLabelAr: 'استبيان الشهر الأول',
    cycleLabelEn: 'Month 1',
    answers: { 1: 2 },
    overallScorePercent: 92,
    sectionScores: { dialysisPercent: 92, medicationsPercent: 92, dietPercent: 92, fluidsPercent: 92 },
  };

  setStorageItem(STORAGE_KEYS.ADHERENCE_SURVEYS, [subOld, subNew]);

  const history = getAdherenceSurveys(patientId);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].id, 'sub-new', 'First item in history must be the newest submission');
  assert.strictEqual(history[1].id, 'sub-old', 'Second item must be the older submission');
});

runTest('7.2 saveAdherenceSurvey dispatches storage and questionnaire updated events', () => {
  resetEnvironment();
  firedEvents.length = 0;

  saveAdherenceSurvey({
    patientId: 'patient-event-test',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي',
    cycleLabelEn: 'Initial',
    answers: { 1: 1 },
    overallScorePercent: 100,
    sectionScores: { dialysisPercent: 100, medicationsPercent: 100, dietPercent: 100, fluidsPercent: 100 },
  });

  assert.ok(
    firedEvents.includes('dialycare_questionnaires_updated') || firedEvents.includes('dialycare_survey_updated'),
    'Must dispatch questionnaire/survey updated event'
  );
  assert.ok(firedEvents.includes('storage'), 'Must dispatch window storage event');
});

runTest('7.3 setDoctorSurveyActivation dispatches storage events', () => {
  firedEvents.length = 0;
  setDoctorSurveyActivation('patient-event-test', true);

  assert.ok(
    firedEvents.includes('dialycare_questionnaires_updated') || firedEvents.includes('dialycare_survey_updated'),
    'Must dispatch questionnaire/survey updated event on doctor activation'
  );
  assert.ok(firedEvents.includes('storage'), 'Must dispatch storage event on doctor activation');
});

// ========================================================
// FINAL SUMMARY
// ========================================================
console.log('\n================================================================');
console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests} tests successful)`);
console.log('================================================================');
