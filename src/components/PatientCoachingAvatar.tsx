'use client';

import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  PatientAvatarSvg,
  getAvatarPreset,
} from './avatar/PatientAvatarPresets';
import { AvatarStyleSelectorModal } from './avatar/AvatarStyleSelectorModal';
import {
  getPatients,
  getPatientMedications,
  getPatientLabResults,
} from '@/lib/data-store';
import type { PatientMedication, PatientLabRecord } from '@/lib/types';

export type CoachingDomain = 'dialysis' | 'medication' | 'fluid' | 'diet';

export interface CoachingTipItem {
  id: string;
  domain: CoachingDomain;
  titleEn: string;
  titleAr: string;
  contentEn: string;
  contentAr: string;
  actionableStepEn: string;
  actionableStepAr: string;
  icon: string;
}

export interface PatientCoachingAvatarProps {
  patientId?: string;
  dialysisSchedule?: string;
  dryWeightKg?: number;
  adherenceMetrics?: {
    adherenceScore?: number;
    fluidPercentage?: number;
    medicationsTaken?: number;
    medicationsTotal?: number;
    mealsLogged?: number;
  };
  onTipClick?: (tip: CoachingTipItem) => void;
  className?: string;
}

// Actionable coaching tips across all 4 clinical domains (R2)
export const COACHING_TIPS: CoachingTipItem[] = [
  // 1. Dialysis Treatment Compliance Domain (R2)
  {
    id: 'tip-dialysis-1',
    domain: 'dialysis',
    icon: '🩺',
    titleEn: 'Complete Full 4-Hour Dialysis Session',
    titleAr: 'إكمال الساعات الأربعة الكاملة لجلسة الغسيل',
    contentEn:
      'Cutting a session short leaves critical uremic toxins and fluid in your blood. Every minute of the 4 hours is essential for your heart, blood pressure, and clearance.',
    contentAr:
      'إنهاء جلسة الغسيل مبكراً يبقي سموماً وسوائل خطيرة في دمك. كل دقيقة من الساعات الأربع ضرورية لحماية قلبك وضغط دمك وتصفية الدم.',
    actionableStepEn: 'Stay for your entire prescribed treatment duration every single session.',
    actionableStepAr: 'التزم بإنهاء كامل وقت الجلسة المحدد من طبيبك دون تقليص أي دقيقة.',
  },
  {
    id: 'tip-dialysis-2',
    domain: 'dialysis',
    icon: '🩺',
    titleEn: 'Vascular Access: Your Lifeline Thrill Care',
    titleAr: 'العناية بنبض واهتزاز ناسور الذراع (الفيستولا)',
    contentEn:
      'Feel the vibration ("thrill") of your AV fistula every morning and evening. Never allow blood pressure cuffs, blood draws, tight clothing, or heavy weights on your access arm.',
    contentAr:
      'تحسس اهتزاز ونبض الناسور الشرياني (الفيستولا) بيدك صباحاً ومساءً. وتجنب قياس الضغط أو سحب الدم أو حمل أشياء ثقيلة بهذا الذراع نهائياً.',
    actionableStepEn: 'Check your fistula vibration twice daily and notify nurses if it feels weak.',
    actionableStepAr: 'تحسس نبض الفيستولا مرتين يومياً وأبلغ تمريض الوحدة فوراً إن ضعف الاهتزاز.',
  },
  {
    id: 'tip-dialysis-3',
    domain: 'dialysis',
    icon: '🩺',
    titleEn: 'Pre-Session Weigh-in & Target Dry Weight',
    titleAr: 'الوزن الدقيق قبل الجلسة والوصول للوزن الجاف',
    contentEn:
      'Always weigh yourself before connecting to the dialysis machine with the same shoes or without them. Accurate pre-weight ensures safe ultrafiltration without cramps or sudden hypotension.',
    contentAr:
      'احرص على وزن نفسك بدقة قبل التوصيل بالماكينة بنفس الملابس ودون حذاء. الوزن الدقيق يحدد كمية السحب الآمنة لتجنب الهبوط والتقلصات العضلية.',
    actionableStepEn: 'Ensure the pre-dialysis scale number is verified by your technician before UF setting.',
    actionableStepAr: 'تأكد من تسجيل وزنك الدقيق مع فني الغسيل قبل ضبط سحب السوائل.',
  },

  // 2. Medication Compliance Domain
  {
    id: 'tip-med-1',
    domain: 'medication',
    icon: '💊',
    titleEn: 'Phosphate Binders Timing',
    titleAr: 'توقيت مثبتات الفوسفات',
    contentEn:
      'Always take your phosphate binders (like Renvela/Sevelamer or Calcium Acetate) with the first bite of your meal or snack, never on an empty stomach.',
    contentAr:
      'احرص دائماً على تناول مثبتات الفوسفات (مثل رينفيلا أو كبسولات الكالسيوم) مع أول لقمة من وجبتك الرئيسية أو الخفيفة، ولا تتناولها على معدة فارغة.',
    actionableStepEn: 'Keep a small pillbox near your dining table or kitchen.',
    actionableStepAr: 'ضع علبة أدويتك بجوار طاولة الطعام لتتذكرها مع الوجبة فوراً.',
  },
  {
    id: 'tip-med-2',
    domain: 'medication',
    icon: '💊',
    titleEn: 'Blood Pressure Medication Schedule',
    titleAr: 'أدوية الضغط وأيام الغسيل',
    contentEn:
      'Do not skip prescribed blood pressure medication on dialysis days unless explicitly instructed by your nephrology team to prevent intradialytic hypotension.',
    contentAr:
      'لا توقف أدوية ضغط الدم المقررة في أيام جلسة الغسيل إلا إذا طلب منك طبيب الكلى المعالج ذلك لتجنب هبوط الضغط أثناء الجلسة.',
    actionableStepEn: 'Check with your dialysis nurse about exact pre-dialysis dosing.',
    actionableStepAr: 'استشر تمريض وحدة الغسيل بشأن مواعيد الجرعة المناسبة قبل الجلسة.',
  },
  {
    id: 'tip-med-3',
    domain: 'medication',
    icon: '💊',
    titleEn: 'Active Vitamin D & Bone Health',
    titleAr: 'فيتامين د النشط وصحة العظام',
    contentEn:
      'Active Vitamin D (Alfacalcidol) regulates PTH hormone and calcium. Take it consistently at your assigned night schedule to protect bone strength.',
    contentAr:
      'فيتامين د النشط ينظم هرمون الغدة الجار درقية والكالسيوم. التزم بجرعته المسائية بانتظام لحماية عظامك من الضعف والتكلس.',
    actionableStepEn: 'Set an evening reminder to take your bedtime dose on time.',
    actionableStepAr: 'اضبط تنبيهاً مسائياً لتناول جرعتك في موعدها المحدد.',
  },

  // 3. Fluid Restriction Domain
  {
    id: 'tip-fluid-1',
    domain: 'fluid',
    icon: '💧',
    titleEn: 'Managing Thirst with Ice Chips',
    titleAr: 'التغلب على العطش بقطع الثلج',
    contentEn:
      'Suck on small ice chips or frozen lemon slices instead of drinking large gulps. Cold sensory cues satisfy thirst while using a fraction of the fluid volume.',
    contentAr:
      'مص قطع الثلج الصغيرة أو شرائح الليمون المجمدة بدلاً من تجرع أكواب ماء كاملة. البرودة تروي الإحساس بالعطش بأقل كمية ماء ممكنة.',
    actionableStepEn: 'Freeze water with a squeeze of fresh lemon in an ice cube tray.',
    actionableStepAr: 'جمّد مكعبات ماء مع قطرات ليمون طازج في الفريزر لترطيب الفم عند الحاجة.',
  },
  {
    id: 'tip-fluid-2',
    domain: 'fluid',
    icon: '💧',
    titleEn: 'Track Interdialytic Fluid Ceiling',
    titleAr: 'مراقبة سقف السوائل بين الجلسات',
    contentEn:
      'Keep your fluid intake between dialysis sessions strictly below your dry-weight limit to prevent fluid overload, high blood pressure, and lung congestion.',
    contentAr:
      'احرص على ألا يتجاوز إجمالي ما تشربه بين الجلسات الحد الأقصى المعتمد لوزنك الجاف لمنع تجمع السوائل على الرئة وارتفاع ضغط الدم.',
    actionableStepEn: 'Fill a dedicated marked bottle daily to see your remaining budget.',
    actionableStepAr: 'املأ زجاجة مرقمة بحصتك اليومية لتشاهد المتبقي بوضوح طوال اليوم.',
  },
  {
    id: 'tip-fluid-3',
    domain: 'fluid',
    icon: '💧',
    titleEn: 'Beware of Hidden Food Fluids',
    titleAr: 'احذر السوائل الخفية في الطعام',
    contentEn:
      'Remember that gelatin, soups, ice cream, watermelon, and gravies count directly towards your total fluid intake allowance.',
    contentAr:
      'تذكر أن الشوربات، الجيلي، الآيس كريم، البطيخ، والصلصات تُحسب كلها ضمن حصتك اليومية من السوائل دون استثناء.',
    actionableStepEn: 'Log watery fruits and soups into your daily fluid tracker.',
    actionableStepAr: 'سجل أي حساء أو فواكه مائية ضمن سجل السوائل اليومي.',
  },

  // 4. Diet Schedule Adherence Domain
  {
    id: 'tip-diet-1',
    domain: 'diet',
    icon: '🥗',
    titleEn: 'Low-Potassium Fruit Selection',
    titleAr: 'اختيار الفواكه قليلة البوتاسيوم',
    contentEn:
      'Enjoy crisp apples, berries, grapes, and watermelon. Strictly limit high-potassium fruits like bananas, oranges, dates, and dried apricots.',
    contentAr:
      'تناول الفواكه الآمنة مثل التفاح، التوت، العنب، والبطيخ. وتجنب الفواكه الغنية بالبوتاسيوم كالموز، البرتقال، التمر، والمشمش المجفف.',
    actionableStepEn: 'Keep fresh sliced apples ready in your fridge for healthy snacking.',
    actionableStepAr: 'احتفظ بشرائح التفاح الطازج في الثلاجة كوجبة خفيفة ومثالية للكلى.',
  },
  {
    id: 'tip-diet-2',
    domain: 'diet',
    icon: '🥗',
    titleEn: 'Leaching Potatoes to Remove Potassium',
    titleAr: 'طريقة نقع البطاطس لسحب البوتاسيوم',
    contentEn:
      'Leaching potatoes removes up to half their potassium: peel and slice them thinly, soak in warm water for at least 2 hours, discard water, and boil in fresh water.',
    contentAr:
      'نقع وسحب البوتاسيوم من البطاطس يخفض محتواها إلى النصف: قشرها وقطعها شرائح رقيقة، وانقعها في ماء دافئ لمدة ساعتين على الأقل، ثم تخلص من ماء النقع واغلها في ماء جديد.',
    actionableStepEn: 'Soaking and double-boiling leaches out up to 50% of the potassium.',
    actionableStepAr: 'النقع والغلي يسحبان ما يصل إلى 50% من البوتاسيوم الزائد.',
  },
  {
    id: 'tip-diet-3',
    domain: 'diet',
    icon: '🥗',
    titleEn: 'High-Biological Protein on Dialysis Days',
    titleAr: 'بروتين نقي عالي الجودة يوم الغسيل',
    contentEn:
      'Hemodialysis removes vital amino acids. Fuel your body with high-quality protein such as egg whites, skinless poultry, or fresh white fish.',
    contentAr:
      'تسحب جلسة الغسيل الكلوي بعض الأحماض الأمينية والبروتينات، لذا احرص على تناول بياض البيض أو الدجاج منزوع الجلد أو الأسماك لتعويض عضلاتك.',
    actionableStepEn: 'Eat a hard-boiled egg white after your session for optimal recovery.',
    actionableStepAr: 'تناول بياض بيضة مسلوقة بعد الجلسة لتعزيز استشفاء ونشاط جسمك.',
  },
];

// 6 Core Metrics Target Definitions
interface CoreLabMetricDef {
  key: keyof PatientLabRecord['values'];
  nameEn: string;
  nameAr: string;
  unit: string;
  min: number;
  max: number;
}

const CORE_LAB_METRICS: CoreLabMetricDef[] = [
  { key: 'hemoglobin', nameEn: 'Hemoglobin', nameAr: 'الهيموجلوبين', unit: 'g/dL', min: 10.0, max: 12.0 },
  { key: 'phosphorus', nameEn: 'Phosphorus', nameAr: 'الفسفور', unit: 'mg/dL', min: 3.5, max: 5.5 },
  { key: 'calcium', nameEn: 'Calcium', nameAr: 'الكالسيوم', unit: 'mg/dL', min: 8.4, max: 10.2 },
  { key: 'urea', nameEn: 'Urea (BUN)', nameAr: 'اليوريا', unit: 'mg/dL', min: 50, max: 150 },
  { key: 'creatinine', nameEn: 'Creatinine', nameAr: 'الكرياتينين', unit: 'mg/dL', min: 6.0, max: 12.0 },
  { key: 'albumin', nameEn: 'Albumin', nameAr: 'الألبومين', unit: 'g/dL', min: 3.5, max: 5.0 },
];

export function PatientCoachingAvatar({
  patientId,
  dialysisSchedule,
  adherenceMetrics,
  onTipClick,
  className = '',
}: PatientCoachingAvatarProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tAvatar = useTranslations('coachingAvatar');
  const [, startTransition] = useTransition();

  // Active view mode: 'coaching' (R2) | 'reminders' (R3) | 'labs' (R4)
  const [activeMode, setActiveMode] = useState<'coaching' | 'reminders' | 'labs'>('coaching');

  // Avatar state
  const [patientRecord, setPatientRecord] = useState(() => {
    const list = getPatients();
    return list.find((p) => p.id === patientId) || list[0] || null;
  });
  const [avatarId, setAvatarId] = useState<string>(
    patientRecord?.avatarId || (patientRecord?.gender === 'female' ? 'female_mature_1' : 'male_mature_1')
  );
  const [isStyleModalOpen, setIsStyleModalOpen] = useState<boolean>(false);

  // Reminders state (R3)
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [checkedMedSlots, setCheckedMedSlots] = useState<Record<string, boolean>>({});

  // Labs state (R4)
  const [latestLabRecord, setLatestLabRecord] = useState<PatientLabRecord | null>(null);
  const [selectedLabMetric, setSelectedLabMetric] = useState<string>('phosphorus');

  // Tip navigation & filter state (R2)
  const [activeFilter, setActiveFilter] = useState<'all' | CoachingDomain>('all');
  const [currentTipIndex, setCurrentTipIndex] = useState<number>(0);
  const [isWaving, setIsWaving] = useState<boolean>(false);

  // Load patient, medications, and labs
  const refreshData = React.useCallback(() => {
    startTransition(() => {
      const allPatients = getPatients();
      const current = allPatients.find((p) => p.id === patientId) || allPatients[0] || null;
      setPatientRecord(current);
      if (current?.avatarId) {
        setAvatarId(current.avatarId);
      }
      const activeId = current?.id || patientId || 'patient-1';
      const meds = getPatientMedications(activeId);
      setMedications(meds);
      const labs = getPatientLabResults(activeId);
      setLatestLabRecord(labs[0] || null);
    });
  }, [patientId]);

  useEffect(() => {
    refreshData();
    const handleAvatarUpdate = () => refreshData();
    const handleStorageUpdate = () => refreshData();
    window.addEventListener('dialycare_avatar_updated', handleAvatarUpdate);
    window.addEventListener('dialycare_patient_updated', handleStorageUpdate);
    window.addEventListener('dialycare_medications_updated', handleStorageUpdate);
    window.addEventListener('dialycare_labs_updated', handleStorageUpdate);
    return () => {
      window.removeEventListener('dialycare_avatar_updated', handleAvatarUpdate);
      window.removeEventListener('dialycare_patient_updated', handleStorageUpdate);
      window.removeEventListener('dialycare_medications_updated', handleStorageUpdate);
      window.removeEventListener('dialycare_labs_updated', handleStorageUpdate);
    };
  }, [refreshData]);

  // Contextual adherence evaluation based on patient metrics
  const contextualGuidance = useMemo(() => {
    if (!adherenceMetrics) return null;
    if (adherenceMetrics.fluidPercentage && adherenceMetrics.fluidPercentage >= 90) {
      return {
        badgeEn: 'High Fluid Intake Alert',
        badgeAr: 'تنبيه استهلاك السوائل',
        hintEn: 'Fluid approaching limit — try ice chips or lemon slices.',
        hintAr: 'السوائل تقترب من السقف — استعن بمكعبات الثلج أو شرائح الليمون.',
      };
    }
    if (
      adherenceMetrics.medicationsTaken !== undefined &&
      adherenceMetrics.medicationsTotal !== undefined &&
      adherenceMetrics.medicationsTaken < adherenceMetrics.medicationsTotal
    ) {
      return {
        badgeEn: 'Pending Medication Reminder',
        badgeAr: 'تذكير بالجرعات المتبقية',
        hintEn: 'Remember to take phosphate binders with your meals.',
        hintAr: 'تذكر تناول مثبتات الفوسفات مع وجبتك لضبط الفسفور.',
      };
    }
    return null;
  }, [adherenceMetrics]);

  // Dialysis schedule analysis (R3: SMW vs STT with fallback)
  const dialysisInfo = useMemo(() => {
    const rawSched = (dialysisSchedule || patientRecord?.dialysisSchedule || 'SMW').toUpperCase();
    const isStt = rawSched.includes('STT') || rawSched.includes('TTS');
    // STT: Sun=0, Tue=2, Thu=4. SMW: Sat=6, Mon=1, Wed=3.
    const targetDays = isStt ? [0, 2, 4] : [6, 1, 3];
    const now = new Date();
    const currentDay = now.getDay();
    const isToday = targetDays.includes(currentDay);

    let daysUntilNext = 1;
    while (!targetDays.includes((currentDay + daysUntilNext) % 7)) {
      daysUntilNext++;
    }
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilNext);

    const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const nextDayLabel = isAr ? dayNamesAr[nextDate.getDay()] : dayNamesEn[nextDate.getDay()];
    const schedulePattern = isStt
      ? (isAr ? 'الأحد / الثلاثاء / الخميس (STT)' : 'Sun / Tue / Thu (STT)')
      : (isAr ? 'السبت / الاثنين / الأربعاء (SMW)' : 'Sat / Mon / Wed (SMW)');

    return {
      isToday,
      daysUntilNext,
      nextDayLabel,
      schedulePattern,
      sessionTime: '08:00 AM',
    };
  }, [dialysisSchedule, patientRecord, isAr]);

  // Filtered tips (R2)
  const filteredTips = useMemo(() => {
    if (activeFilter === 'all') return COACHING_TIPS;
    return COACHING_TIPS.filter((t) => t.domain === activeFilter);
  }, [activeFilter]);

  const activeTip = useMemo(() => {
    const safeIndex = currentTipIndex % filteredTips.length;
    return filteredTips[safeIndex] || COACHING_TIPS[0];
  }, [currentTipIndex, filteredTips]);

  const handleNextTip = () => {
    setIsWaving(true);
    setCurrentTipIndex((prev) => (prev + 1) % filteredTips.length);
    setTimeout(() => setIsWaving(false), 600);
  };

  const handlePrevTip = () => {
    setIsWaving(true);
    setCurrentTipIndex((prev) => (prev - 1 + filteredTips.length) % filteredTips.length);
    setTimeout(() => setIsWaving(false), 600);
  };

  const handleFilterChange = (domain: 'all' | CoachingDomain) => {
    setActiveFilter(domain);
    setCurrentTipIndex(0);
  };

  const handleMascotClick = () => {
    handleNextTip();
    if (onTipClick) {
      onTipClick(activeTip);
    }
  };

  const getDomainBadge = (domain: CoachingDomain) => {
    switch (domain) {
      case 'dialysis':
        return {
          label: isAr ? 'جلسات الغسيل 🩺' : 'Dialysis Care 🩺',
          badgeClass: 'bg-teal-100 text-teal-900 border-teal-300',
          accentBorder: 'border-l-teal-600 rtl:border-l-0 rtl:border-r-teal-600',
        };
      case 'medication':
        return {
          label: isAr ? 'التزام الأدوية 💊' : 'Medication Compliance 💊',
          badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          accentBorder: 'border-l-indigo-600 rtl:border-l-0 rtl:border-r-indigo-600',
        };
      case 'fluid':
        return {
          label: isAr ? 'التحكم في السوائل 💧' : 'Fluid Restriction 💧',
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
          accentBorder: 'border-l-blue-600 rtl:border-l-0 rtl:border-r-blue-600',
        };
      case 'diet':
        return {
          label: isAr ? 'الحمية والتغذية 🥗' : 'Renal Diet Schedule 🥗',
          badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          accentBorder: 'border-l-emerald-600 rtl:border-l-0 rtl:border-r-emerald-600',
        };
    }
  };

  const domainInfo = getDomainBadge(activeTip.domain);
  const currentAvatarPreset = getAvatarPreset(avatarId, patientRecord?.gender);
  const patientDisplayName = isAr
    ? patientRecord?.fullNameAr || patientRecord?.fullName || 'مريض وَصْلِتي'
    : patientRecord?.fullName || 'Waslity Patient';

  // Lab commentary generator (R4)
  const labCommentary = useMemo(() => {
    if (!latestLabRecord || !latestLabRecord.values) {
      return {
        title: isAr ? 'لا توجد نتائج مخبرية مسجلة بعد' : 'No Lab Results Recorded Yet',
        advice: isAr
          ? 'يقوم طبيب الكلى بإدخال نتائج تحاليلك الدورية هنا. ستظهر لك نصائح مخصصة فور تسجيلها.'
          : 'Your nephrologist records your periodic blood tests here. Personalized coaching will appear once saved.',
        status: 'normal',
      };
    }

    const metricDef = CORE_LAB_METRICS.find((m) => m.key === selectedLabMetric);
    const unrecordedFallback = () => ({
      title: isAr
        ? `${metricDef?.nameAr || selectedLabMetric}: غير مسجل في هذا الفحص`
        : `${metricDef?.nameEn || selectedLabMetric}: Not Recorded in This Panel`,
      advice: isAr
        ? 'لم يتم إدخال قيمة هذا التحليل في أحدث سجل مخبري لك. اضغط على أي تحليل يحمل قيمة رقمية بالأعلى لقراءة توجيه الطبيب.'
        : 'This marker was not included in your latest saved panel. Tap any recorded metric above to view clinical guidance.',
      status: 'normal',
    });

    const vals = latestLabRecord.values;
    switch (selectedLabMetric) {
      case 'hemoglobin': {
        const val = vals.hemoglobin;
        if (val === undefined) return unrecordedFallback();
        if (val < 10.0) {
          return {
            title: isAr ? `الهيموجلوبين منخفض (${val} g/dL)` : `Hemoglobin is Low (${val} g/dL)`,
            advice: isAr
              ? 'مستوى الهيموجلوبين منخفض تحت 10.0، وهذا قد يسبب لك التعب وضيق التنفس. استشر طبيبك للتأكد من انتظام جرعات حقن الإيبو (EPO) والحديد أثناء جلسة الغسيل.'
              : 'Hemoglobin is below the recommended 10-12 g/dL target. This contributes to fatigue and breathlessness. Consult your doctor regarding your EPO injection and iron dose.',
            status: 'low',
          };
        }
        if (val > 12.0) {
          return {
            title: isAr ? `الهيموجلوبين أعلى من المعدل (${val} g/dL)` : `Hemoglobin is Elevated (${val} g/dL)`,
            advice: isAr
              ? 'الهيموجلوبين أعلى من 12.0. قد يوصي طبيب الكلى بتعديل جرعة الإيبو للحفاظ على تدفق دم آمن وسلس عبر الفلتر.'
              : 'Hemoglobin exceeds the 12.0 target. Your clinician may adjust your erythropoietin dose to maintain optimal blood viscosity.',
            status: 'high',
          };
        }
        return {
          title: isAr ? `الهيموجلوبين ممتاز (${val} g/dL)` : `Hemoglobin is Optimal (${val} g/dL)`,
          advice: isAr
            ? 'الهيموجلوبين ضمن المعدل المستهدف (10-12 g/dL)! الأنيميا منضبطة بشكل ممتاز مما يدعم نشاطك اليومي وصحة قلبك.'
            : 'Hemoglobin is in the ideal 10-12 g/dL dialysis range. Your anemia is well controlled, protecting your heart and vitality.',
          status: 'normal',
        };
      }
      case 'phosphorus': {
        const val = vals.phosphorus;
        if (val === undefined) return unrecordedFallback();
        if (val > 5.5) {
          return {
            title: isAr ? `الفسفور مرتفع (${val} mg/dL)` : `Phosphorus is Elevated (${val} mg/dL)`,
            advice: isAr
              ? 'الفسفور مرتفع فوق 5.5. هذا يسبب حكة وتكلسات في الشرايين وضعفاً في العظام. احرص على تناول مثبت الفوسفات (رينفيلا) مع أول لقمة من كل وجبة، وتجنب المياه الغازية الداكنة.'
              : 'Phosphorus exceeds the 3.5-5.5 target. Elevated phosphorus causes itching and vascular calcification. Take phosphate binders with every meal and strictly avoid colas.',
            status: 'high',
          };
        }
        if (val < 3.5) {
          return {
            title: isAr ? `الفسفور منخفض (${val} mg/dL)` : `Phosphorus is Low (${val} mg/dL)`,
            advice: isAr
              ? 'الفسفور أقل من 3.5. تأكد من تناول وجبات غنية بالبروتين النقي واستشر أخصائي التغذية العلاجية.'
              : 'Phosphorus is below 3.5. Ensure adequate nutrition and high-biological protein intake with your care team.',
            status: 'low',
          };
        }
        return {
          title: isAr ? `الفسفور منضبط تماماً (${val} mg/dL)` : `Phosphorus is Balanced (${val} mg/dL)`,
          advice: isAr
            ? 'ممتاز! الفسفور ضمن المعدل الآمن (3.5-5.5 mg/dL). استمر في الالتزام بمثبتات الفوسفات مع وجباتك لحماية عظامك.'
            : 'Great job! Phosphorus is in the target 3.5-5.5 range. Continue taking your binders consistently with food.',
          status: 'normal',
        };
      }
      case 'calcium': {
        const val = vals.calcium;
        if (val === undefined) return unrecordedFallback();
        if (val > 10.2) {
          return {
            title: isAr ? `الكالسيوم مرتفع (${val} mg/dL)` : `Calcium is Elevated (${val} mg/dL)`,
            advice: isAr
              ? 'الكالسيوم أعلى من 10.2. راجع طبيبك لضبط مكملات الكالسيوم أو فيتامين د النشط لتجنب التكلس الوعائي.'
              : 'Calcium is above the 10.2 limit. Review active vitamin D and calcium-based binders with your doctor.',
            status: 'high',
          };
        }
        if (val < 8.4) {
          return {
            title: isAr ? `الكالسيوم منخفض (${val} mg/dL)` : `Calcium is Low (${val} mg/dL)`,
            advice: isAr
              ? 'الكالسيوم منخفض تحت 8.4. احرص على تناول جرعة فيتامين د النشط (ألفاكالسيدول) بانتظام للمحافظة على قوة عظامك.'
              : 'Calcium is below 8.4. Consistent active vitamin D helps regulate parathyroid hormone and protect bone mineral density.',
            status: 'low',
          };
        }
        return {
          title: isAr ? `الكالسيوم متوازن (${val} mg/dL)` : `Calcium is Balanced (${val} mg/dL)`,
          advice: isAr
            ? 'الكالسيوم متوازن في النطاق المستهدف (8.4-10.2 mg/dL)، مما يضمن صحة العظام وانتظام نبض القلب.'
            : 'Calcium is within target (8.4-10.2 mg/dL), keeping bone architecture and cardiac rhythms stable.',
          status: 'normal',
        };
      }
      case 'urea': {
        const val = vals.urea;
        if (val === undefined) return unrecordedFallback();
        if (val > 150) {
          return {
            title: isAr ? `اليوريا مرتفعة (${val} mg/dL)` : `Urea is Elevated (${val} mg/dL)`,
            advice: isAr
              ? 'اليوريا مرتفعة، مما يعكس تراكم فضلات تكسير البروتين. احرص على حضور جلسات الغسيل كاملة دون تأخير أو تقصير وقت الجلسة.'
              : 'Urea is elevated above 150 mg/dL. Complete your full 4-hour dialysis session to maximize uremic waste clearance.',
            status: 'high',
          };
        }
        return {
          title: isAr ? `تصفية اليوريا جيدة (${val} mg/dL)` : `Urea Clearance Adequate (${val} mg/dL)`,
          advice: isAr
            ? 'مستوى اليوريا منضبط في نطاق الغسيل (50-150 mg/dL)، مما يدل على كفاءة الفلتر وتصفية الدم بصورة دورية سليمة.'
            : 'Urea level is within the expected hemodialysis range (50-150 mg/dL), indicating good dialysis clearance.',
          status: 'normal',
        };
      }
      case 'creatinine': {
        const val = vals.creatinine;
        if (val === undefined) return unrecordedFallback();
        return {
          title: isAr ? `الكرياتينين مستقر (${val} mg/dL)` : `Creatinine is Stable (${val} mg/dL)`,
          advice: isAr
            ? `مستوى الكرياتينين الحالي ${val} مجم/دسل يعكس توازن الكتلة العضلية مع فاعلية الغسيل الكلوي المنتظم.`
            : `Current creatinine of ${val} mg/dL reflects muscle metabolism and stable hemodialysis toxin removal.`,
          status: 'normal',
        };
      }
      case 'albumin': {
        const val = vals.albumin;
        if (val === undefined) return unrecordedFallback();
        if (val < 4.0) {
          return {
            title: isAr ? `الألبومين يحتاج تعزيزاً (${val} g/dL)` : `Albumin Needs Boost (${val} g/dL)`,
            advice: isAr
              ? 'الألبومين أقل من 4.0 g/dL. يفقد الجسم بروتينات أثناء الغسيل، لذا ركز على تناول بياض البيض المسلوق والأسماك والدواجن يوم الجلسة.'
              : 'Serum albumin is below 4.0. Hemodialysis removes amino acids; boost nutrition with boiled egg whites and poultry on treatment days.',
            status: 'low',
          };
        }
        return {
          title: isAr ? `الألبومين ممتاز (${val} g/dL)` : `Albumin is Excellent (${val} g/dL)`,
          advice: isAr
            ? 'الألبومين عند 4.0 أو أكثر! هذا يعكس تغذية بروتينية ممتازة ومناعة قوية وقوة عضلية تحميك من المضاعفات.'
            : 'Albumin meets or exceeds the 4.0 g/dL target! This indicates strong visceral protein nutrition and resilience.',
          status: 'normal',
        };
      }
      default:
        return null;
    }
  }, [latestLabRecord, selectedLabMetric, isAr]);

  return (
    <div
      data-testid="patient-coaching-avatar"
      data-patient-id={patientId || 'default'}
      className={`rounded-3xl bg-white border-2 border-slate-200/90 shadow-sm p-4 sm:p-5 transition-all ${className}`}
    >
      {/* Contextual Metrics Alert Strip (if active) */}
      {contextualGuidance && (
        <div className="mb-3 p-2.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">💡</span>
            <span>{isAr ? contextualGuidance.hintAr : contextualGuidance.hintEn}</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 text-[10px] font-black shrink-0">
            {isAr ? contextualGuidance.badgeAr : contextualGuidance.badgeEn}
          </span>
        </div>
      )}

      {/* Main Avatar Hero Row (R1: Patient-Resembling Avatar Presentation) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3.5">
          {/* Patient-Resembling Avatar Portrait (Clickable to change style) */}
          <button
            type="button"
            onClick={() => setIsStyleModalOpen(true)}
            aria-label={
              isAr
                ? `مظهر شخصية ${currentAvatarPreset.nameAr} - اضغط لتغيير المظهر`
                : `${currentAvatarPreset.nameEn} avatar portrait - Tap to personalize appearance`
            }
            className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-slate-50 border-2 border-[#1e6bb8] p-1 text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95 focus:outline-hidden focus:ring-4 focus:ring-blue-300 min-h-[48px]"
          >
            <PatientAvatarSvg presetId={currentAvatarPreset.id} />
            <span className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-[#1e6bb8] text-white text-[11px] font-black flex items-center justify-center border-2 border-white shadow-xs">
              ✎
            </span>
          </button>

          {/* Dr. Dialy Companion Mascot Button (Preserved for 100% test compatibility) */}
          <button
            type="button"
            onClick={handleMascotClick}
            data-testid="dr-dialy-mascot-btn"
            aria-label={
              isAr
                ? 'د. دايلي - انقر هنا للحصول على نصيحة طبية فورية'
                : 'Dr. Dialy mascot - Tap to get an instant coaching tip'
            }
            className={`
              relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-[#1e6bb8] text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer
              transition-transform duration-300 active:scale-95 focus:outline-hidden focus:ring-4 focus:ring-blue-300 min-h-[48px]
              ${isWaving ? 'animate-bounce' : 'hover:scale-105'}
            `}
            title={tAvatar('tapForTip') || (isAr ? 'اضغط للحصول على نصيحة جديدة!' : 'Tap for a new tip!')}
          >
            {/* Friendly Doctor Mascot SVG */}
            <svg
              className="w-12 h-12 drop-shadow-sm"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M12 56C12 45 20 40 32 40C44 40 52 45 52 56" fill="#FFFFFF" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M32 40V54" stroke="#1e6bb8" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M22 41C22 48 26 50 32 50C38 50 42 48 42 41" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="32" cy="51" r="2.5" fill="#facc15" stroke="#0f172a" strokeWidth="1.5" />
              <ellipse cx="32" cy="25" rx="16" ry="17" fill="#fed7aa" stroke="#ea580c" strokeWidth="2" />
              <ellipse cx="32" cy="11" rx="9" ry="3.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
              <circle cx="32" cy="11" r="2.5" fill="#f8fafc" stroke="#0284c7" strokeWidth="1.2" />
              <circle cx="26" cy="23" r="3.2" fill="#0f172a" />
              <circle cx="27" cy="22" r="1" fill="#ffffff" />
              <circle cx="38" cy="23" r="3.2" fill="#0f172a" />
              <circle cx="39" cy="22" r="1" fill="#ffffff" />
              <path d="M27 30C29 33 35 33 37 30" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" />
              <circle cx="23" cy="28" r="2" fill="#f43f5e" opacity="0.4" />
              <circle cx="41" cy="28" r="2" fill="#f43f5e" opacity="0.4" />
            </svg>
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-300 animate-pulse" />
          </button>

          {/* Character Identity & Status */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                {patientDisplayName}
              </h2>
              <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#1e6bb8] border border-blue-200">
                {isAr ? currentAvatarPreset.nameAr : currentAvatarPreset.nameEn}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {tAvatar('title') || (isAr ? 'رفيقك لصحة الكلى والالتزام اليومي' : 'Renal Adherence Companion')}
            </p>
          </div>
        </div>

        {/* Change Style Action Button */}
        <button
          type="button"
          onClick={() => setIsStyleModalOpen(true)}
          aria-label={isAr ? 'تغيير مظهر الشخصية' : 'Change avatar appearance style'}
          className="min-h-[48px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2 border border-slate-200 shrink-0 self-stretch sm:self-auto justify-center"
        >
          <span>🎨</span>
          <span>{isAr ? 'تغيير المظهر' : 'Change Avatar'}</span>
        </button>
      </div>

      {/* Main Mode Navigation Tabs (R2 Coaching, R3 Reminders, R4 Labs) */}
      <div className="mt-3.5 flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveMode('coaching')}
          aria-label={isAr ? 'عرض نصائح الالتزام الطبي' : 'View adherence coaching advice'}
          className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeMode === 'coaching'
              ? 'bg-white text-[#1e6bb8] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>💡</span>
          <span>{isAr ? 'نصائح الالتزام' : 'Coaching Advice'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('reminders')}
          aria-label={isAr ? 'عرض التنبيهات ومواعيد الغسيل والأدوية' : 'View interactive reminders for dialysis and meds'}
          className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeMode === 'reminders'
              ? 'bg-white text-[#1e6bb8] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>⏰</span>
          <span>{isAr ? 'المواعيد والتنبيهات' : 'Reminders'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('labs')}
          aria-label={isAr ? 'عرض نتائج التحاليل المسجلة وتفسيرها' : 'View saved lab results and clinical commentary'}
          className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeMode === 'labs'
              ? 'bg-white text-[#1e6bb8] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🔬</span>
          <span>{isAr ? 'تفسير التحاليل' : 'Lab Commentary'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: COACHING ADVICE (R2) */}
      {/* ========================================================================= */}
      {activeMode === 'coaching' && (
        <div className="mt-3.5 space-y-3">
          {/* Clinical Domain Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleFilterChange('all')}
              aria-label={isAr ? 'عرض كل النصائح' : 'All coaching tips'}
              className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-[#1e6bb8] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAr ? 'الكل 🌟' : 'All 🌟'}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('dialysis')}
              data-testid="coaching-topic-dialysis-btn"
              aria-label={isAr ? 'نصائح جلسات الغسيل' : 'Dialysis coaching tips'}
              className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeFilter === 'dialysis'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAr ? 'الغسيل 🩺' : 'Dialysis 🩺'}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('medication')}
              data-testid="coaching-topic-medication-btn"
              aria-label={isAr ? 'نصائح الأدوية' : 'Medication coaching tips'}
              className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeFilter === 'medication'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAr ? 'الأدوية 💊' : 'Medication 💊'}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('fluid')}
              data-testid="coaching-topic-fluid-btn"
              aria-label={isAr ? 'نصائح السوائل' : 'Fluid restriction tips'}
              className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeFilter === 'fluid'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAr ? 'السوائل 💧' : 'Fluid 💧'}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('diet')}
              data-testid="coaching-topic-diet-btn"
              aria-label={isAr ? 'نصائح التغذية' : 'Renal diet tips'}
              className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeFilter === 'diet'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAr ? 'التغذية 🥗' : 'Diet 🥗'}
            </button>
          </div>

          {/* Interactive Speech Dialogue Bubble */}
          <div className="relative">
            <div className="hidden sm:block absolute -top-2 start-7 w-4 h-4 bg-slate-50 rotate-45 border-t border-l border-slate-300" />

            <div
              className={`
                p-4 sm:p-5 rounded-2xl bg-slate-50/90 border-2 border-slate-200 border-l-4 rtl:border-l-2 rtl:border-r-4 ${domainInfo.accentBorder}
                shadow-xs transition-all duration-300
              `}
            >
              {/* Tip Domain Badge & Index Counter */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${domainInfo.badgeClass}`}
                >
                  <span>{activeTip.icon}</span>
                  <span>{domainInfo.label}</span>
                </span>

                <span className="text-xs font-bold text-slate-400 font-mono">
                  {currentTipIndex + 1} / {filteredTips.length}
                </span>
              </div>

              {/* Actionable Tip Title */}
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                {isAr ? activeTip.titleAr : activeTip.titleEn}
              </h3>

              {/* Tip Core Clinical Guidance */}
              <p className="text-sm font-semibold text-slate-700 mt-2 leading-relaxed">
                {isAr ? activeTip.contentAr : activeTip.contentEn}
              </p>

              {/* Actionable Step Highlight Box */}
              <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 flex items-start gap-2.5 shadow-2xs">
                <span className="text-base shrink-0" role="img" aria-label="Action step">
                  💡
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    {isAr ? 'الخطوة العملية المقترحة' : 'Actionable Advice'}
                  </p>
                  <p className="text-xs font-extrabold text-[#1e6bb8] mt-0.5">
                    {isAr ? activeTip.actionableStepAr : activeTip.actionableStepEn}
                  </p>
                </div>
              </div>

              {/* Interactive Navigation Controls */}
              <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevTip}
                    data-testid="coaching-prev-tip-btn"
                    aria-label={isAr ? 'النصيحة السابقة' : 'Previous coaching tip'}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-extrabold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{isAr ? '→' : '←'}</span>
                    <span>{isAr ? 'السابقة' : 'Previous'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextTip}
                    data-testid="coaching-next-tip-btn"
                    aria-label={isAr ? 'النصيحة التالية' : 'Next coaching tip'}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-[#1e6bb8] hover:bg-[#165696] text-white font-extrabold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <span>{isAr ? 'التالية' : 'Next'}</span>
                    <span>{isAr ? '←' : '→'}</span>
                  </button>
                </div>

                <p className="hidden md:block text-[11px] font-semibold text-slate-400">
                  {isAr
                    ? 'اضغط على د. دايلي في أي وقت لتحديث النصيحة'
                    : 'Click Dr. Dialy anytime for a fresh tip'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: VISUAL INTERACTIVE REMINDERS (R3) */}
      {/* ========================================================================= */}
      {activeMode === 'reminders' && (
        <div className="mt-3.5 space-y-3.5 animate-in fade-in duration-200">
          {/* Dialysis Session Appointment Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-200 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-xl shrink-0 shadow-sm">
                  🩺
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-teal-900 uppercase tracking-wider">
                      {isAr ? 'موعد جلسة الغسيل' : 'Dialysis Appointment'}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        dialysisInfo.isToday
                          ? 'bg-emerald-500 text-white animate-pulse'
                          : 'bg-teal-200 text-teal-950'
                      }`}
                    >
                      {dialysisInfo.isToday
                        ? isAr
                          ? 'اليوم موعد جلستك!'
                          : 'Treatment Day Today!'
                        : dialysisInfo.daysUntilNext === 1
                        ? isAr
                          ? 'غداً بإذن الله'
                          : 'Tomorrow'
                        : isAr
                        ? `بعد ${dialysisInfo.daysUntilNext} أيام`
                        : `In ${dialysisInfo.daysUntilNext} days`}
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-slate-900 mt-1">
                    {dialysisInfo.isToday
                      ? isAr
                        ? 'جلسة اليوم الساعة 08:00 صباحاً'
                        : 'Today at 08:00 AM'
                      : isAr
                      ? `الجلسة القادمة: يوم ${dialysisInfo.nextDayLabel} الساعة ${dialysisInfo.sessionTime}`
                      : `Next Session: ${dialysisInfo.nextDayLabel} at ${dialysisInfo.sessionTime}`}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">
                    {isAr ? `الجدول المسجل: ${dialysisInfo.schedulePattern}` : `Assigned Schedule: ${dialysisInfo.schedulePattern}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Preparation Guidance Checklist */}
            <div className="mt-3 pt-3 border-t border-teal-200/70 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-teal-950 font-bold bg-white/70 p-2 rounded-xl">
                <span>⚡</span>
                <span>{isAr ? 'تحسس اهتزاز الفيستولا صباحاً' : 'Check fistula thrill vibration'}</span>
              </div>
              <div className="flex items-center gap-2 text-teal-950 font-bold bg-white/70 p-2 rounded-xl">
                <span>⚖️</span>
                <span>{isAr ? 'الوزن الدقيق قبل التوصيل' : 'Measure pre-dialysis weight'}</span>
              </div>
            </div>
          </div>

          {/* Scheduled Medication Doses Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-200 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💊</span>
                <h4 className="text-sm font-black text-indigo-950">
                  {isAr ? 'جرعات الأدوية المجدولة لليوم' : 'Scheduled Medication Doses'}
                </h4>
              </div>
              <span className="text-xs font-bold text-indigo-700 font-mono">
                {medications.length} {isAr ? 'أدوية' : 'meds'}
              </span>
            </div>

            {medications.length === 0 ? (
              <p className="text-xs text-slate-500 font-medium py-3 text-center">
                {isAr ? 'لا توجد أدوية مسجلة لهذا المريض حالياً.' : 'No active medications registered.'}
              </p>
            ) : (
              <div className="space-y-2">
                {medications.map((med) => {
                  const isChecked = !!checkedMedSlots[med.id];
                  const timesList =
                    med.scheduleTimes && med.scheduleTimes.length > 0
                      ? med.scheduleTimes
                      : med.scheduleTime
                      ? [med.scheduleTime]
                      : [];

                  return (
                    <div
                      key={med.id}
                      className="p-3 bg-white rounded-xl border border-indigo-100 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-black text-slate-900 truncate">
                            {isAr ? med.nameAr || med.name : med.name}
                          </p>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                            {med.dose}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {isAr ? med.instructionsAr || med.instructions : med.instructions || 'With meal'}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {timesList.length > 0 ? (
                            timesList.map((time, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold"
                              >
                                🕒 {time}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              🕒 {isAr ? 'حسب الإرشادات' : 'As directed'}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setCheckedMedSlots((prev) => ({
                            ...prev,
                            [med.id]: !prev[med.id],
                          }))
                        }
                        aria-label={
                          isAr
                            ? `تأكيد تناول جرعة ${med.nameAr || med.name}`
                            : `Mark dose as taken: ${med.name}`
                        }
                        className={`min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900'
                        }`}
                      >
                        <span>{isChecked ? '✓' : '○'}</span>
                        <span>{isChecked ? (isAr ? 'تم أخذها' : 'Taken') : (isAr ? 'تناول الآن' : 'Take')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: SAVED LAB RESULTS PRESENTATION & COMMENTARY (R4) */}
      {/* ========================================================================= */}
      {activeMode === 'labs' && (
        <div className="mt-3.5 space-y-3.5 animate-in fade-in duration-200">
          {/* Header Strip with Date */}
          <div className="p-3 bg-teal-50 rounded-2xl border border-teal-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔬</span>
              <span className="text-xs font-black text-teal-950">
                {isAr ? 'أحدث نتائج التحاليل المسجلة' : 'Latest Recorded Clinical Labs'}
              </span>
            </div>
            {latestLabRecord?.testDate && (
              <span className="text-[11px] font-mono font-bold text-teal-800">
                📅 {latestLabRecord.testDate}
              </span>
            )}
          </div>

          {/* 6 Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {CORE_LAB_METRICS.map((metric) => {
              const val = latestLabRecord?.values ? latestLabRecord.values[metric.key] : undefined;
              const isSelected = selectedLabMetric === metric.key;

              let statusBadge = {
                label: isAr ? 'طبيعي' : 'Normal',
                bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
              };
              if (val !== undefined) {
                if (val < metric.min) {
                  statusBadge = {
                    label: isAr ? 'منخفض' : 'Low',
                    bgClass: 'bg-amber-100 text-amber-900 border-amber-300',
                  };
                } else if (val > metric.max) {
                  statusBadge = {
                    label: isAr ? 'مرتفع' : 'High',
                    bgClass: 'bg-red-100 text-red-900 border-red-300',
                  };
                }
              }

              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => setSelectedLabMetric(metric.key)}
                  aria-label={
                    isAr
                      ? `تحليل ${metric.nameAr}: ${val ?? 'غير مسجل'}`
                      : `Lab ${metric.nameEn}: ${val ?? 'not recorded'}`
                  }
                  className={`min-h-[48px] p-3 rounded-2xl border-2 text-start transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#1e6bb8] bg-blue-50/90 shadow-xs ring-2 ring-blue-300'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className="text-xs font-black text-slate-800 line-clamp-1">
                      {isAr ? metric.nameAr : metric.nameEn}
                    </span>
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${statusBadge.bgClass}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {val !== undefined ? val : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">{metric.unit}</span>
                  </div>

                  <span className="text-[10px] text-slate-400 mt-1 font-mono">
                    {isAr ? 'المستهدف:' : 'Target:'} {metric.min}-{metric.max}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Spoken Clinical Commentary Speech Bubble (R4) */}
          {labCommentary && (
            <div className="relative mt-2">
              <div className="hidden sm:block absolute -top-2 start-7 w-4 h-4 bg-blue-50 rotate-45 border-t border-l border-blue-200" />

              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-slate-50 to-blue-50/70 border-2 border-blue-200 shadow-xs">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#1e6bb8] text-white flex items-center justify-center text-sm font-black shrink-0">
                    🗣️
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-black text-slate-900">
                      {labCommentary.title}
                    </h5>
                    <p className="text-[10px] font-extrabold uppercase text-[#1e6bb8]">
                      {isAr ? 'تفسير وتوجيه الطبيب الشخصي' : 'Personalized Clinical Avatar Guidance'}
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed mt-1">
                  {labCommentary.advice}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Avatar Style Selector Modal */}
      <AvatarStyleSelectorModal
        isOpen={isStyleModalOpen}
        onClose={() => setIsStyleModalOpen(false)}
        patientId={patientId || 'patient-1'}
        currentAvatarId={avatarId}
        patientGender={patientRecord?.gender}
        onAvatarSelected={(newAvatarId) => {
          setAvatarId(newAvatarId);
          refreshData();
        }}
      />
    </div>
  );
}
