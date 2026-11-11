'use client';

import React, { useState, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

export type CoachingDomain = 'medication' | 'fluid' | 'diet';

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

// Actionable coaching tips across all 3 clinical domains
export const COACHING_TIPS: CoachingTipItem[] = [
  // 1. Medication Compliance Domain
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

  // 2. Fluid Restriction Domain
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

  // 3. Diet Schedule Adherence Domain
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

export function PatientCoachingAvatar({
  patientId,
  adherenceMetrics,
  onTipClick,
  className = '',
}: PatientCoachingAvatarProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tAvatar = useTranslations('coachingAvatar');

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

  // Active filter tab: 'all' | 'medication' | 'fluid' | 'diet'
  const [activeFilter, setActiveFilter] = useState<'all' | CoachingDomain>('all');
  const [currentTipIndex, setCurrentTipIndex] = useState<number>(0);
  const [isWaving, setIsWaving] = useState<boolean>(false);

  // Filtered tips
  const filteredTips = useMemo(() => {
    if (activeFilter === 'all') return COACHING_TIPS;
    return COACHING_TIPS.filter((t) => t.domain === activeFilter);
  }, [activeFilter]);

  // Current active tip
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

  // Domain styling helper
  const getDomainBadge = (domain: CoachingDomain) => {
    switch (domain) {
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

      {/* Header with Mascot & Introduction */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3.5">
          {/* Dr. Dialy Interactive Mascot Button */}
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
              relative w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-blue-500 to-[#1e6bb8] text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer
              transition-transform duration-300 active:scale-95 focus:outline-hidden focus:ring-4 focus:ring-blue-300
              ${isWaving ? 'animate-bounce' : 'hover:scale-105'}
            `}
            title={tAvatar('tapForTip') || (isAr ? 'اضغط للحصول على نصيحة جديدة!' : 'Tap for a new tip!')}
          >
            {/* Friendly SVG Doctor Mascot "Dr. Dialy" */}
            <svg
              className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-sm"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Doctor Coat & Shoulders */}
              <path
                d="M12 56C12 45 20 40 32 40C44 40 52 45 52 56"
                fill="#FFFFFF"
                stroke="#0f172a"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Shirt Tie / Stethoscope line */}
              <path d="M32 40V54" stroke="#1e6bb8" strokeWidth="2.5" strokeLinecap="round" />
              {/* Stethoscope tubing */}
              <path
                d="M22 41C22 48 26 50 32 50C38 50 42 48 42 41"
                stroke="#0284c7"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Stethoscope bell */}
              <circle cx="32" cy="51" r="2.5" fill="#facc15" stroke="#0f172a" strokeWidth="1.5" />

              {/* Head - Friendly Kidney Contour */}
              <ellipse
                cx="32"
                cy="25"
                rx="16"
                ry="17"
                fill="#fed7aa"
                stroke="#ea580c"
                strokeWidth="2"
              />

              {/* Doctor Head Mirror / Medical Cap */}
              <ellipse cx="32" cy="11" rx="9" ry="3.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
              <circle cx="32" cy="11" r="2.5" fill="#f8fafc" stroke="#0284c7" strokeWidth="1.2" />

              {/* Friendly Big Eyes with Reflection */}
              <circle cx="26" cy="23" r="3.2" fill="#0f172a" />
              <circle cx="27" cy="22" r="1" fill="#ffffff" />
              <circle cx="38" cy="23" r="3.2" fill="#0f172a" />
              <circle cx="39" cy="22" r="1" fill="#ffffff" />

              {/* Cheerful Smile */}
              <path
                d="M27 30C29 33 35 33 37 30"
                stroke="#b91c1c"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Rosy Cheeks */}
              <circle cx="23" cy="28" r="2" fill="#f43f5e" opacity="0.4" />
              <circle cx="41" cy="28" r="2" fill="#f43f5e" opacity="0.4" />
            </svg>

            {/* Tap indicator pulse badge */}
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-300 animate-pulse" />
          </button>

          {/* Character Identity & Status */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {tAvatar('name') || (isAr ? 'د. دايلي' : 'Dr. Dialy')}
              </h2>
              <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#1e6bb8] border border-blue-200">
                {isAr ? 'مساعد الالتزام الطبي' : 'Adherence Mascot'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {tAvatar('title') || (isAr ? 'رفيقك لصحة الكلى والالتزام اليومي' : 'Renal Adherence Companion')}
            </p>
          </div>
        </div>

        {/* Clinical Domain Filter Tabs (Min 48px touch targets) */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
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
            onClick={() => handleFilterChange('medication')}
            data-testid="coaching-topic-medication-btn"
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
            className={`min-h-[48px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeFilter === 'diet'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {isAr ? 'التغذية 🥗' : 'Diet 🥗'}
          </button>
        </div>
      </div>

      {/* Interactive Speech Dialogue Bubble */}
      <div className="mt-4 relative">
        {/* Dialogue Bubble Triangle pointer towards Dr. Dialy */}
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

          {/* Interactive Navigation Controls (Min 48px touch targets) */}
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

            {/* Quick helper tip hint */}
            <p className="hidden md:block text-[11px] font-semibold text-slate-400">
              {isAr
                ? 'اضغط على د. دايلي في أي وقت لتحديث النصيحة'
                : 'Click Dr. Dialy anytime for a fresh tip'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
