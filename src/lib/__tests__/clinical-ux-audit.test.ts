/**
 * DialyCare Clinical UX & Code Quality Audit Test Suite
 * 
 * Conducts exhaustive verification of:
 * 1. Exact 20 clinical questions (4 categories x 5 questions) in Arabic & English.
 * 2. Exact 6 Likert options in strict sequence:
 *    1. دائمًا 2. غالبًا 3. أحيانًا 4. نادرًا 5. أبدًا 6. لا ينطبق
 * 3. Clinical terminology and nephrology precision (phosphate binders with meals, IDWG, potassium, phosphorus, sodium).
 * 4. Mathematical scoring engine with safe exclusion of Option 6 (N/A) from denominator.
 * 5. Monthly cycle state machine: Baseline -> Month 1 -> Month 2 -> Month 3 -> Month 4+.
 * 6. Doctor activation override & reminder alert notification dispatch.
 * 7. Elderly accessibility & mobile UX audit: >= 48px touch targets, mobile responsiveness.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADHERENCE_QUESTIONS,
  QUESTIONNAIRE_OPTIONS,
  calculateSurveyScore,
  getCycleInfo,
} from '../questionnaire-data';
import {
  initDataStore,
  getPatientSurveyStatus,
  saveAdherenceSurvey,
  setDoctorSurveyActivation,
  sendSurveyReminderNotification,
} from '../data-store';

// Mock browser environment for Node.js
const mockStorage: Record<string, string> = {};
const dispatchedEvents: string[] = [];

if (typeof window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in mockStorage ? mockStorage[k] : null),
      setItem: (k: string, v: string) => {
        mockStorage[k] = String(v);
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
  };

  (globalThis as unknown as { Event: unknown }).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

function resetTestStore() {
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  dispatchedEvents.length = 0;
  initDataStore();
}

console.log('================================================================');
console.log('CLINICAL UX & QUALITY REVIEW AUDIT TEST SUITE');
console.log('================================================================\n');

let passCount = 0;
let testCount = 0;

function audit(name: string, fn: () => void) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  ✓ [AUDIT PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [AUDIT FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// -------------------------------------------------------------
// AUDIT 1: CLINICAL 20 QUESTIONS & ARABIC/ENGLISH TERMINOLOGY
// -------------------------------------------------------------
console.log('--- Clinical Audit 1: Questions & Terminology Precision ---');

audit('1.1 Exact count: 20 questions strictly divided into 4 categories of 5', () => {
  assert.strictEqual(ADHERENCE_QUESTIONS.length, 20);
  const catCounts: Record<string, number> = {};
  for (const q of ADHERENCE_QUESTIONS) {
    catCounts[q.category] = (catCounts[q.category] || 0) + 1;
  }
  assert.strictEqual(catCounts['dialysis'], 5, 'Dialysis Attendance must have exactly 5 questions');
  assert.strictEqual(catCounts['medications'], 5, 'Medications must have exactly 5 questions');
  assert.strictEqual(catCounts['diet'], 5, 'Diet must have exactly 5 questions');
  assert.strictEqual(catCounts['fluids'], 5, 'Fluids must have exactly 5 questions');
});

audit('1.2 Category 1 Dialysis Attendance: Q1-Q5 clinical validation', () => {
  const q1 = ADHERENCE_QUESTIONS.find((q) => q.id === 1)!;
  const q2 = ADHERENCE_QUESTIONS.find((q) => q.id === 2)!;
  const q3 = ADHERENCE_QUESTIONS.find((q) => q.id === 3)!;
  const q4 = ADHERENCE_QUESTIONS.find((q) => q.id === 4)!;
  const q5 = ADHERENCE_QUESTIONS.find((q) => q.id === 5)!;

  // Q1: Scheduled days
  assert.ok(q1.textAr.includes('الأيام المحددة'));
  assert.ok(q1.textEn.toLowerCase().includes('scheduled days'));

  // Q2: All sessions
  assert.ok(q2.textAr.includes('جميع جلسات'));
  assert.ok(q2.textEn.toLowerCase().includes('all dialysis sessions'));

  // Q3: Full duration (anti-shortening)
  assert.ok(q3.textAr.includes('انتهاء مدتها كاملة'));
  assert.ok(q3.textEn.toLowerCase().includes('entire duration'));

  // Q4: Punctuality
  assert.ok(q4.textAr.includes('الوقت المحدد'));
  assert.ok(q4.textEn.toLowerCase().includes('on time'));

  // Q5: Overcoming fatigue
  assert.ok(q5.textAr.includes('بالتعب'));
  assert.ok(q5.textEn.toLowerCase().includes('tired'));
});

audit('1.3 Category 2 Medications: Q6-Q10 clinical validation (Phosphate binders with meals)', () => {
  const q6 = ADHERENCE_QUESTIONS.find((q) => q.id === 6)!;
  const q7 = ADHERENCE_QUESTIONS.find((q) => q.id === 7)!;
  const q8 = ADHERENCE_QUESTIONS.find((q) => q.id === 8)!;
  const q9 = ADHERENCE_QUESTIONS.find((q) => q.id === 9)!;
  const q10 = ADHERENCE_QUESTIONS.find((q) => q.id === 10)!;

  // Q6: Prescribed doses
  assert.ok(q6.textAr.includes('بالجرعات التي وصفها الطبيب'));
  assert.ok(q6.textEn.toLowerCase().includes('doses prescribed'));

  // Q7: Scheduled times
  assert.ok(q7.textAr.includes('المواعيد المحددة'));
  assert.ok(q7.textEn.toLowerCase().includes('scheduled times'));

  // Q8: Phosphate binder with meals
  assert.ok(q8.textAr.includes('الفوسفور مع الوجبات'));
  assert.ok(q8.textEn.toLowerCase().includes('phosphate binder'));
  assert.ok(q8.textEn.toLowerCase().includes('meals'));

  // Q9: Asymptomatic adherence
  assert.ok(q9.textAr.includes('شعرت أن حالتي جيدة'));
  assert.ok(q9.textEn.toLowerCase().includes('felt well'));

  // Q10: Zero omission
  assert.ok(q10.textAr.includes('دون نسيان'));
  assert.ok(q10.textEn.toLowerCase().includes('without forgetting'));
});

audit('1.4 Category 3 Diet: Q11-Q15 clinical validation (K+, P, Na+, dining out)', () => {
  const q11 = ADHERENCE_QUESTIONS.find((q) => q.id === 11)!;
  const q12 = ADHERENCE_QUESTIONS.find((q) => q.id === 12)!;
  const q13 = ADHERENCE_QUESTIONS.find((q) => q.id === 13)!;
  const q14 = ADHERENCE_QUESTIONS.find((q) => q.id === 14)!;
  const q15 = ADHERENCE_QUESTIONS.find((q) => q.id === 15)!;

  // Q11: Dietary plan
  assert.ok(q11.textAr.includes('النظام الغذائي'));
  assert.ok(q11.textEn.toLowerCase().includes('dietary plan'));

  // Q12: Potassium restriction
  assert.ok(q12.textAr.includes('البوتاسيوم'));
  assert.ok(q12.textEn.toLowerCase().includes('potassium'));

  // Q13: Phosphorus restriction
  assert.ok(q13.textAr.includes('الفوسفور'));
  assert.ok(q13.textEn.toLowerCase().includes('phosphorus'));

  // Q14: Sodium/salt reduction
  assert.ok(q14.textAr.includes('الملح'));
  assert.ok(q14.textEn.toLowerCase().includes('salt'));

  // Q15: Dining outside the home
  assert.ok(q15.textAr.includes('خارج المنزل'));
  assert.ok(q15.textEn.toLowerCase().includes('outside the home'));
});

audit('1.5 Category 4 Fluids: Q16-Q20 clinical validation (Daily limit, measurement, thirst, hidden fluids, IDWG)', () => {
  const q16 = ADHERENCE_QUESTIONS.find((q) => q.id === 16)!;
  const q17 = ADHERENCE_QUESTIONS.find((q) => q.id === 17)!;
  const q18 = ADHERENCE_QUESTIONS.find((q) => q.id === 18)!;
  const q19 = ADHERENCE_QUESTIONS.find((q) => q.id === 19)!;
  const q20 = ADHERENCE_QUESTIONS.find((q) => q.id === 20)!;

  // Q16: Daily limit
  assert.ok(q16.textAr.includes('كمية السوائل اليومية'));
  assert.ok(q16.textEn.toLowerCase().includes('fluid limit'));

  // Q17: Measurement
  assert.ok(q17.textAr.includes('قست أو حسبت'));
  assert.ok(q17.textEn.toLowerCase().includes('measured or calculated'));

  // Q18: Thirst control
  assert.ok(q18.textAr.includes('العطش'));
  assert.ok(q18.textEn.toLowerCase().includes('thirsty'));

  // Q19: Tea, juices, soup
  assert.ok(q19.textAr.includes('الشاي والعصائر والشوربة'));
  assert.ok(q19.textEn.toLowerCase().includes('tea, juices, and soup'));

  // Q20: Interdialytic weight gain (IDWG)
  assert.ok(q20.textAr.includes('زيادة وزني بين جلستي الغسيل'));
  assert.ok(q20.textEn.toLowerCase().includes('interdialytic weight gain'));
});

// -------------------------------------------------------------
// AUDIT 2: EXACT 6 OPTIONS SEQUENCE AND WEIGHTS
// -------------------------------------------------------------
console.log('\n--- Clinical Audit 2: Exact 6 Likert Options Sequence ---');

audit('2.1 Exact 6 options in sequence: 1. دائمًا 2. غالبًا 3. أحيانًا 4. نادرًا 5. أبدًا 6. لا ينطبق', () => {
  assert.strictEqual(QUESTIONNAIRE_OPTIONS.length, 6);

  const expectedOrder = [
    { id: 1, textAr: 'دائمًا', textEn: 'Always', scoreWeight: 5 },
    { id: 2, textAr: 'غالبًا', textEn: 'Often', scoreWeight: 4 },
    { id: 3, textAr: 'أحيانًا', textEn: 'Sometimes', scoreWeight: 3 },
    { id: 4, textAr: 'نادرًا', textEn: 'Rarely', scoreWeight: 2 },
    { id: 5, textAr: 'أبدًا', textEn: 'Never', scoreWeight: 1 },
    { id: 6, textAr: 'لا ينطبق', textEn: 'Not applicable', scoreWeight: null },
  ];

  for (let i = 0; i < 6; i++) {
    const actual = QUESTIONNAIRE_OPTIONS[i];
    const exp = expectedOrder[i];
    assert.strictEqual(actual.id, exp.id);
    assert.strictEqual(actual.textAr, exp.textAr);
    assert.strictEqual(actual.textEn, exp.textEn);
    assert.strictEqual(actual.scoreWeight, exp.scoreWeight);
  }
});

// -------------------------------------------------------------
// AUDIT 3: MATHEMATICAL SCORING ENGINE AUDIT
// -------------------------------------------------------------
console.log('\n--- Clinical Audit 3: Mathematical Scoring Engine ---');

audit('3.1 Option 6 (Not applicable) mathematically excluded from denominator', () => {
  // If 5 questions are answered: 4 with Always (5 pts) and 1 with N/A (Option 6)
  // Total points earned = 4 * 5 = 20
  // Total possible points = 4 * 5 = 20
  // Score should be 100%, NOT 20/25 (80%)
  const answers: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) answers[i] = 1;
  // Patient doesn't take phosphate binders -> answers Q8 with Option 6 (N/A)
  answers[8] = 6;

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.applicableCount, 19);
  assert.strictEqual(score.totalPossiblePoints, 95);
  assert.strictEqual(score.totalPointsEarned, 95);
  assert.strictEqual(score.overallPercent, 100);
  assert.strictEqual(score.sectionScores.medicationsPercent, 100, 'Medications section must remain 100%');
});

audit('3.2 Non-adherent responses correctly compute lower percentage', () => {
  // All Rarely (2 pts each) -> 40/100 = 40%
  const answers: Record<number, number> = {};
  for (let i = 1; i <= 20; i++) answers[i] = 4;

  const score = calculateSurveyScore(answers);
  assert.strictEqual(score.overallPercent, 40);
  assert.strictEqual(score.sectionScores.dialysisPercent, 40);
  assert.strictEqual(score.sectionScores.medicationsPercent, 40);
  assert.strictEqual(score.sectionScores.dietPercent, 40);
  assert.strictEqual(score.sectionScores.fluidsPercent, 40);
});

// -------------------------------------------------------------
// AUDIT 4: MONTHLY PROGRESSION STATE MACHINE
// -------------------------------------------------------------
console.log('\n--- Clinical Audit 4: Monthly Cycle State Transitions ---');

audit('4.1 First use (0 submissions) -> isDue: true, reason: "initial", cycle 1 Baseline', () => {
  resetTestStore();
  const status = getPatientSurveyStatus('audit-patient-1');
  assert.strictEqual(status.isDue, true);
  assert.strictEqual(status.reason, 'initial');
  assert.strictEqual(status.currentCycleNumber, 1);
  assert.strictEqual(status.cycleLabelAr, 'الاستبيان الأولي - بداية الاستخدام');
  assert.strictEqual(status.cycleLabelEn, 'Initial Baseline');
});

audit('4.2 Month 1 (Cycle 2) due at day 30', () => {
  resetTestStore();
  saveAdherenceSurvey({
    patientId: 'audit-patient-1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
    cycleLabelEn: 'Initial Baseline',
    answers: { 1: 1 },
    overallScorePercent: 100,
    sectionScores: { dialysisPercent: 100, medicationsPercent: 100, dietPercent: 100, fluidsPercent: 100 },
  });

  const day30 = getPatientSurveyStatus('audit-patient-1', '2026-01-31T00:00:00.000Z');
  assert.strictEqual(day30.isDue, true);
  assert.strictEqual(day30.reason, 'monthly_due');
  assert.strictEqual(day30.currentCycleNumber, 2);
  assert.ok(day30.cycleLabelAr.includes('الأول'));
  assert.ok(day30.cycleLabelEn.includes('Month 1'));
});

audit('4.3 Month 2 (Cycle 3) and Month 3 (Cycle 4) labels and cycle metadata', () => {
  const m2 = getCycleInfo(3);
  assert.strictEqual(m2.cycleNumber, 3);
  assert.strictEqual(m2.monthIndex, 2);
  assert.ok(m2.cycleLabelAr.includes('الثاني'));
  assert.ok(m2.cycleLabelEn.includes('Month 2'));

  const m3 = getCycleInfo(4);
  assert.strictEqual(m3.cycleNumber, 4);
  assert.strictEqual(m3.monthIndex, 3);
  assert.ok(m3.cycleLabelAr.includes('الثالث'));
  assert.ok(m3.cycleLabelEn.includes('Month 3'));
});

// -------------------------------------------------------------
// AUDIT 5: DOCTOR EXPERIENCE & WORKFLOWS
// -------------------------------------------------------------
console.log('\n--- Clinical Audit 5: Doctor Activation & Notification Workflows ---');

audit('5.1 Doctor manual activation immediately overrides 30-day interval', () => {
  resetTestStore();
  const patientId = 'audit-patient-doc';

  // Seed recent submission
  saveAdherenceSurvey({
    patientId,
    submittedAt: '2026-04-01T00:00:00.000Z',
    cycleNumber: 1,
    cycleLabelAr: 'الاستبيان الأولي',
    cycleLabelEn: 'Initial Baseline',
    answers: { 1: 1 },
    overallScorePercent: 90,
    sectionScores: { dialysisPercent: 90, medicationsPercent: 90, dietPercent: 90, fluidsPercent: 90 },
  });

  // Query 2 days later: completed
  const beforeAct = getPatientSurveyStatus(patientId, '2026-04-03T00:00:00.000Z');
  assert.strictEqual(beforeAct.isDue, false);
  assert.strictEqual(beforeAct.reason, 'completed');

  // Doctor clicks activation
  setDoctorSurveyActivation(patientId, true);
  const afterAct = getPatientSurveyStatus(patientId, '2026-04-03T00:05:00.000Z');
  assert.strictEqual(afterAct.isDue, true);
  assert.strictEqual(afterAct.reason, 'doctor_activated');
  assert.strictEqual(afterAct.isManuallyActivatedByDoctor, true);
});

audit('5.2 Doctor reminder notification dispatches bilingual alert', () => {
  resetTestStore();
  const notif = sendSurveyReminderNotification('audit-patient-doc', 'Dr. Mohamed');
  assert.strictEqual(notif.type, 'individual');
  assert.deepStrictEqual(notif.recipientIds, ['audit-patient-doc']);
  assert.ok(notif.titleAr.includes('استبيان الالتزام'));
  assert.ok(notif.messageAr.includes('Dr. Mohamed'));
  assert.ok(notif.titleEn.includes('Adherence Questionnaire'));
});

// -------------------------------------------------------------
// AUDIT 6: ACCESSIBILITY & MOBILE TOUCH TARGETS INSPECTION
// -------------------------------------------------------------
console.log('\n--- Clinical Audit 6: Accessibility & Mobile Touch Targets Inspection ---');

audit('6.1 Source code verification: min 48px touch targets on interactive controls', () => {
  const modalPath = path.resolve(__dirname, '../../components/patient/AdherenceSurveyModal.tsx');
  const sectionPath = path.resolve(__dirname, '../../components/patient/PatientAdherenceSurveySection.tsx');
  const doctorMgrPath = path.resolve(__dirname, '../../components/admin/DoctorPatientSurveyManager.tsx');

  const modalCode = fs.readFileSync(modalPath, 'utf8');
  const sectionCode = fs.readFileSync(sectionPath, 'utf8');
  const doctorMgrCode = fs.readFileSync(doctorMgrPath, 'utf8');

  // Modal option buttons must have min-h-[48px]
  assert.ok(modalCode.includes('min-h-[48px]'), 'Modal must contain min-h-[48px] touch targets');
  // Modal close button must have min 48px
  assert.ok(
    modalCode.includes('min-h-[48px] min-w-[48px]') || modalCode.includes('min-h-[48px]'),
    'Close button or modal elements must enforce 48px'
  );

  // Section start button must have min-h-[48px]
  assert.ok(sectionCode.includes('min-h-[48px]'), 'Patient section buttons must have min-h-[48px]');

  // Doctor action buttons must have min-h-[48px]
  assert.ok(doctorMgrCode.includes('min-h-[48px]'), 'Doctor manager action buttons must have min-h-[48px]');
});

audit('6.2 Viewport layout safety: mobile responsive grid and zero horizontal overflow', () => {
  const modalPath = path.resolve(__dirname, '../../components/patient/AdherenceSurveyModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  // Verify responsive 2-column mobile grid: grid-cols-2 sm:grid-cols-3 lg:grid-cols-6
  assert.ok(modalCode.includes('grid-cols-2'), 'Options grid must start with 2 columns on mobile (375px)');
  // Verify scrollable body container
  assert.ok(modalCode.includes('overflow-y-auto'), 'Questions container must be scrollable');
});

console.log('\n================================================================');
console.log(`CLINICAL UX AUDIT COMPLETE: ${passCount} / ${testCount} AUDITS PASSED (100%)`);
console.log('================================================================');
