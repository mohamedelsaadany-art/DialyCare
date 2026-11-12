import type { QuestionnaireOptionValue } from './types';

export type QuestionnaireCategory = 'dialysis' | 'medications' | 'diet' | 'fluids';

export interface QuestionnaireSection {
  id: QuestionnaireCategory;
  numberPrefixAr: string;
  numberPrefixEn: string;
  titleAr: string;
  titleEn: string;
  icon: string;
  questionIds: number[];
}

export interface QuestionnaireQuestion {
  id: number;
  category: QuestionnaireCategory;
  textAr: string;
  textEn: string;
}

export interface QuestionnaireOption {
  id: QuestionnaireOptionValue;
  textAr: string;
  textEn: string;
  scoreWeight: number | null; // null for 'Not applicable'
}

export const QUESTIONNAIRE_OPTIONS: readonly QuestionnaireOption[] = [
  { id: 1, textAr: 'دائمًا', textEn: 'Always', scoreWeight: 5 },
  { id: 2, textAr: 'غالبًا', textEn: 'Often', scoreWeight: 4 },
  { id: 3, textAr: 'أحيانًا', textEn: 'Sometimes', scoreWeight: 3 },
  { id: 4, textAr: 'نادرًا', textEn: 'Rarely', scoreWeight: 2 },
  { id: 5, textAr: 'أبدًا', textEn: 'Never', scoreWeight: 1 },
  { id: 6, textAr: 'لا ينطبق', textEn: 'Not applicable', scoreWeight: null },
] as const;

export const QUESTIONNAIRE_SECTIONS: readonly QuestionnaireSection[] = [
  {
    id: 'dialysis',
    numberPrefixAr: 'أولاً',
    numberPrefixEn: 'Section 1',
    titleAr: 'أولاً: حضور جلسات الغسيل',
    titleEn: 'Dialysis Attendance',
    icon: '🩺',
    questionIds: [1, 2, 3, 4, 5],
  },
  {
    id: 'medications',
    numberPrefixAr: 'ثانياً',
    numberPrefixEn: 'Section 2',
    titleAr: 'ثانياً: الأدوية',
    titleEn: 'Medications',
    icon: '💊',
    questionIds: [6, 7, 8, 9, 10],
  },
  {
    id: 'diet',
    numberPrefixAr: 'ثالثاً',
    numberPrefixEn: 'Section 3',
    titleAr: 'ثالثاً: الطعام',
    titleEn: 'Diet',
    icon: '🥗',
    questionIds: [11, 12, 13, 14, 15],
  },
  {
    id: 'fluids',
    numberPrefixAr: 'رابعاً',
    numberPrefixEn: 'Section 4',
    titleAr: 'رابعاً: السوائل',
    titleEn: 'Fluids',
    icon: '💧',
    questionIds: [16, 17, 18, 19, 20],
  },
] as const;

export const ADHERENCE_CATEGORIES = QUESTIONNAIRE_SECTIONS;

export const ADHERENCE_QUESTIONS: readonly QuestionnaireQuestion[] = [
  // Category 1: Dialysis Attendance (أولاً: حضور جلسات الغسيل) - Q1..Q5
  {
    id: 1,
    category: 'dialysis',
    textAr: 'حضرت جلسات الغسيل في الأيام المحددة لي.',
    textEn: 'I attended dialysis sessions on my scheduled days.',
  },
  {
    id: 2,
    category: 'dialysis',
    textAr: 'حضرت جميع جلسات الغسيل المقررة لي.',
    textEn: 'I attended all dialysis sessions scheduled for me.',
  },
  {
    id: 3,
    category: 'dialysis',
    textAr: 'بقيت في جلسة الغسيل حتى انتهاء مدتها كاملة.',
    textEn: 'I stayed for the entire duration of the dialysis session until completion.',
  },
  {
    id: 4,
    category: 'dialysis',
    textAr: 'وصلت إلى جلسة الغسيل في الوقت المحدد.',
    textEn: 'I arrived at the dialysis session on time.',
  },
  {
    id: 5,
    category: 'dialysis',
    textAr: 'حضرت جلسة الغسيل حتى عندما شعرت بالتعب.',
    textEn: 'I attended the dialysis session even when I felt tired.',
  },

  // Category 2: Medications (ثانياً: الأدوية) - Q6..Q10
  {
    id: 6,
    category: 'medications',
    textAr: 'أخذت أدويتي بالجرعات التي وصفها الطبيب.',
    textEn: 'I took my medications in the doses prescribed by my doctor.',
  },
  {
    id: 7,
    category: 'medications',
    textAr: 'أخذت أدويتي في المواعيد المحددة.',
    textEn: 'I took my medications at the scheduled times.',
  },
  {
    id: 8,
    category: 'medications',
    textAr: 'أخذت دواء الفوسفور مع الوجبات كما أوصى الطبيب.',
    textEn: 'I took my phosphate binder medication with meals as recommended by my doctor.',
  },
  {
    id: 9,
    category: 'medications',
    textAr: 'أخذت أدويتي حتى عندما شعرت أن حالتي جيدة.',
    textEn: 'I took my medications even when I felt well.',
  },
  {
    id: 10,
    category: 'medications',
    textAr: 'تناولت جميع جرعات أدويتي دون نسيان.',
    textEn: 'I took all my medication doses without forgetting.',
  },

  // Category 3: Diet (ثالثاً: الطعام) - Q11..Q15
  {
    id: 11,
    category: 'diet',
    textAr: 'التزمت بالنظام الغذائي الذي حدده لي الطبيب أو أخصائي التغذية.',
    textEn: 'I followed the dietary plan prescribed by my doctor or dietitian.',
  },
  {
    id: 12,
    category: 'diet',
    textAr: 'قللت من تناول الأطعمة الغنية بالبوتاسيوم كما أوصى الطبيب.',
    textEn: 'I reduced intake of potassium-rich foods as recommended by my doctor.',
  },
  {
    id: 13,
    category: 'diet',
    textAr: 'قللت من تناول الأطعمة الغنية بالفوسفور كما أوصى الطبيب.',
    textEn: 'I reduced intake of phosphorus-rich foods as recommended by my doctor.',
  },
  {
    id: 14,
    category: 'diet',
    textAr: 'قللت من كمية الملح في طعامي كما أوصى الطبيب.',
    textEn: 'I reduced the amount of salt in my food as recommended by my doctor.',
  },
  {
    id: 15,
    category: 'diet',
    textAr: 'اخترت الأطعمة المسموح لي بتناولها حتى عند الأكل خارج المنزل.',
    textEn: 'I chose allowed foods even when eating outside the home.',
  },

  // Category 4: Fluids (رابعاً: السوائل) - Q16..Q20
  {
    id: 16,
    category: 'fluids',
    textAr: 'التزمت بكمية السوائل اليومية التي حددها لي الطبيب.',
    textEn: 'I adhered to the daily fluid limit prescribed by my doctor.',
  },
  {
    id: 17,
    category: 'fluids',
    textAr: 'قست أو حسبت كمية السوائل التي أشربها خلال اليوم.',
    textEn: 'I measured or calculated the amount of fluids I drank during the day.',
  },
  {
    id: 18,
    category: 'fluids',
    textAr: 'تحكمت في كمية الماء التي أشربها عندما شعرت بالعطش.',
    textEn: 'I controlled the amount of water I drank when I felt thirsty.',
  },
  {
    id: 19,
    category: 'fluids',
    textAr: 'احتسبت الشاي والعصائر والشوربة ضمن كمية السوائل المسموح بها.',
    textEn: 'I counted tea, juices, and soup within my allowed fluid intake.',
  },
  {
    id: 20,
    category: 'fluids',
    textAr: 'كانت زيادة وزني بين جلستي الغسيل ضمن الحد الذي حدده لي الطبيب.',
    textEn: 'My interdialytic weight gain between sessions was within the limit set by my doctor.',
  },
] as const;

export interface SurveyScoreResult {
  overallPercent: number;
  overallScorePercent: number;
  sectionScores: {
    dialysisPercent: number;
    medicationsPercent: number;
    dietPercent: number;
    fluidsPercent: number;
  };
  totalPointsEarned: number;
  totalPossiblePoints: number;
  applicableCount: number;
}

/**
 * Calculates overall adherence percentage and 4 domain section percentages.
 * - Score weights: 1=5, 2=4, 3=3, 4=2, 5=1, 6=null (Not applicable)
 * - Questions with option 6 (N/A) are safely excluded from the denominator.
 * - Returns 100% if all answers are N/A.
 */
export function calculateSurveyScore(answers: Record<number, number>): SurveyScoreResult {
  const optionWeightMap: Record<number, number | null> = {
    1: 5,
    2: 4,
    3: 3,
    4: 2,
    5: 1,
    6: null,
  };

  const computeSectionPercent = (qIds: number[]): { percent: number; earned: number; max: number; count: number } => {
    let earned = 0;
    let max = 0;
    let count = 0;

    for (const qId of qIds) {
      const ans = answers[qId];
      if (ans !== undefined && ans in optionWeightMap) {
        const weight = optionWeightMap[ans];
        if (weight !== null) {
          earned += weight;
          max += 5;
          count += 1;
        }
      }
    }

    const percent = max > 0 ? Math.round((earned / max) * 100) : 100;
    return { percent, earned, max, count };
  };

  const dialysis = computeSectionPercent([1, 2, 3, 4, 5]);
  const medications = computeSectionPercent([6, 7, 8, 9, 10]);
  const diet = computeSectionPercent([11, 12, 13, 14, 15]);
  const fluids = computeSectionPercent([16, 17, 18, 19, 20]);

  const totalEarned = dialysis.earned + medications.earned + diet.earned + fluids.earned;
  const totalMax = dialysis.max + medications.max + diet.max + fluids.max;
  const applicableCount = dialysis.count + medications.count + diet.count + fluids.count;

  const overall = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 100;

  return {
    overallPercent: overall,
    overallScorePercent: overall,
    sectionScores: {
      dialysisPercent: dialysis.percent,
      medicationsPercent: medications.percent,
      dietPercent: diet.percent,
      fluidsPercent: fluids.percent,
    },
    totalPointsEarned: totalEarned,
    totalPossiblePoints: totalMax,
    applicableCount,
  };
}

/** Alias function for tests expecting calculateAdherenceScore */
export const calculateAdherenceScore = calculateSurveyScore;

/**
 * Returns localized cycle label and metadata.
 * Cycle 1: Baseline / Initial
 * Cycle 2+: Month 1, Month 2, Month 3, etc.
 */
export function getCycleInfo(cycleNumber: number): {
  cycleNumber: number;
  cycleLabelAr: string;
  cycleLabelEn: string;
  monthIndex: number;
} {
  const safeCycle = Math.max(1, Math.floor(cycleNumber || 1));

  if (safeCycle === 1) {
    return {
      cycleNumber: 1,
      cycleLabelAr: 'الاستبيان الأولي - بداية الاستخدام',
      cycleLabelEn: 'Initial Baseline',
      monthIndex: 0,
    };
  }

  const monthNumber = safeCycle - 1;
  const monthNamesAr: Record<number, string> = {
    1: 'الأول',
    2: 'الثاني',
    3: 'الثالث',
    4: 'الرابع',
    5: 'الخامس',
    6: 'السادس',
    7: 'السابع',
    8: 'الثامن',
    9: 'التاسع',
    10: 'العاشر',
    11: 'الحادي عشر',
    12: 'الثاني عشر',
  };

  const arSuffix = monthNamesAr[monthNumber] || `${monthNumber}`;

  return {
    cycleNumber: safeCycle,
    cycleLabelAr: `استبيان المتابعة - الشهر ${arSuffix}`,
    cycleLabelEn: `Follow-up - Month ${monthNumber}`,
    monthIndex: monthNumber,
  };
}
