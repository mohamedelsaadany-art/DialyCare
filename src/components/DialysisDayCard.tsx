'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { isDialysisDay, getDialysisScheduleLabel } from '@/app/[locale]/patient/patient-utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface DialysisDayCardProps {
  dialysisSchedule?: string;
  className?: string;
}

export function DialysisDayCard({ dialysisSchedule, className = '' }: DialysisDayCardProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const isTreatmentDay = isDialysisDay(dialysisSchedule);

  const scheduleLabel = React.useMemo(() => {
    const label = getDialysisScheduleLabel(dialysisSchedule, isAr);
    return isAr ? `جدول: ${label}` : `Schedule: ${label}`;
  }, [dialysisSchedule, isAr]);

  if (isTreatmentDay) {
    return (
      <Card
        className={`p-5 rounded-3xl bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white border-2 border-blue-200 shadow-sm ${className}`}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" role="img" aria-label="Hospital">
              🏥
            </span>
            <div>
              <h2 className="text-base font-black text-blue-950 tracking-tight leading-tight">
                {isAr ? 'اليوم يوم جلسة الغسيل الكلوي' : 'Today is a Dialysis Treatment Day'}
              </h2>
              <p className="text-[11px] font-bold text-blue-700 mt-0.5">{scheduleLabel}</p>
            </div>
          </div>
          <Badge variant="info" size="sm" className="font-extrabold uppercase shrink-0">
            {isAr ? 'جلسة غسيل' : 'Treatment'}
          </Badge>
        </div>

        <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3">
          {isAr
            ? 'احرص على اتباع هذه الإرشادات السريرية الأساسية لضمان سلامتك أثناء جلسة الغسيل اليوم:'
            : 'Follow these essential clinical steps to ensure a safe and effective treatment session today:'}
        </p>

        <div className="space-y-2.5">
          {/* Fistula Thrill Check */}
          <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-blue-100 shadow-2xs">
            <span className="text-lg shrink-0 mt-0.5">🩺</span>
            <div>
              <h4 className="text-xs font-black text-blue-950">
                {isAr
                  ? 'فحص اهتزاز وصلة الغسيل (Fistula Thrill)'
                  : 'AV Access Thrill Check'}
              </h4>
              <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
                {isAr
                  ? 'تحقق من وجود النبض والاهتزاز الطبيعي (Thrill) في الوصلة الشريانية قبل الخروج من المنزل.'
                  : 'Confirm a strong buzz/thrill in your fistula or graft before leaving home. Alert clinic if absent.'}
              </p>
            </div>
          </div>

          {/* Pre-dialysis Weight */}
          <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-blue-100 shadow-2xs">
            <span className="text-lg shrink-0 mt-0.5">⚖️</span>
            <div>
              <h4 className="text-xs font-black text-blue-950">
                {isAr ? 'الوزن قبل بدء الجلسة' : 'Pre-Dialysis Weight'}
              </h4>
              <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
                {isAr
                  ? 'قم بقياس وتسجيل وزنك بدقة في المركز لتحديد الحجم الآمن لسحب السوائل وتجنب هبوط الضغط.'
                  : 'Measure and record your pre-session weight accurately to calibrate target fluid removal safely.'}
              </p>
            </div>
          </div>

          {/* Phosphate Binder Reminder */}
          <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-blue-100 shadow-2xs">
            <span className="text-lg shrink-0 mt-0.5">💊</span>
            <div>
              <h4 className="text-xs font-black text-blue-950">
                {isAr ? 'تناول مثبتات الفوسفات' : 'Phosphate Binder Reminder'}
              </h4>
              <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
                {isAr
                  ? 'احرص على أخذ مثبتات الفوسفات الموصوفة لك مع أي وجبة خفيفة تتناولها أثناء الجلسة.'
                  : 'Take prescribed phosphate binders with any food or snacks during your dialysis run.'}
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Non-Dialysis Day Card
  return (
    <Card
      className={`p-5 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-teal-50/60 to-white border-2 border-emerald-200 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" role="img" aria-label="Home">
            🏡
          </span>
          <div>
            <h2 className="text-base font-black text-emerald-950 tracking-tight leading-tight">
              {isAr ? 'يوم راحة بين الجلسات' : 'Non-Dialysis Day'}
            </h2>
            <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
              {isAr ? 'فترة الراحة والمتابعة المنزلية' : 'Interdialytic Interval'}
            </p>
          </div>
        </div>
        <Badge variant="success" size="sm" className="font-extrabold uppercase shrink-0">
          {isAr ? 'يوم راحة' : 'Rest Day'}
        </Badge>
      </div>

      <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3">
        {isAr
          ? 'بين جلسات الغسيل، يعتبر التحكم الدقيق بالسوائل والغذاء خط الدفاع الأول لحماية قلبك ورئتيك:'
          : 'Between dialysis runs, strict fluid discipline and diet vigilance protect your heart and lungs:'}
      </p>

      <div className="space-y-2.5">
        {/* Fluid Adherence Emphasis */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-emerald-100 shadow-2xs">
          <span className="text-lg shrink-0 mt-0.5">💧</span>
          <div>
            <h4 className="text-xs font-black text-emerald-950">
              {isAr ? 'الالتزام الصارم بحصة السوائل' : 'Strict Interdialytic Fluid Adherence'}
            </h4>
            <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
              {isAr
                ? 'التزم بحد السوائل اليومي لتجنب زيادة الوزن بين الجلسات واحتباس الماء وضيق التنفس الليلي.'
                : 'Stay strictly within your daily fluid allowance to prevent interdialytic fluid overload and shortness of breath.'}
            </p>
          </div>
        </div>

        {/* Thirst Management */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-emerald-100 shadow-2xs">
          <span className="text-lg shrink-0 mt-0.5">🧊</span>
          <div>
            <h4 className="text-xs font-black text-emerald-950">
              {isAr ? 'السيطرة على العطش بذكاء' : 'Smart Thirst Management'}
            </h4>
            <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
              {isAr
                ? 'استخدم مكعبات ثلج صغيرة تمصها ببطء، أو مضمضة الفم بالماء البارد دون بلعه، لتخفيف جفاف الفم.'
                : 'Suck on small ice chips or rinse with cold mouthwash without swallowing to safely soothe dry mouth.'}
            </p>
          </div>
        </div>

        {/* Low Salt / Low Potassium */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/80 border border-emerald-100 shadow-2xs">
          <span className="text-lg shrink-0 mt-0.5">🥗</span>
          <div>
            <h4 className="text-xs font-black text-emerald-950">
              {isAr ? 'الحد من الصوديوم والبوتاسيوم' : 'Limit Salt & High-Potassium Foods'}
            </h4>
            <p className="text-[11px] text-slate-600 font-medium leading-snug mt-0.5">
              {isAr
                ? 'قلل الملح لتجنب العطش الشديد، وتجنب الفواكه الغنية بالبوتاسيوم لحماية انتظام ضربات القلب.'
                : 'Reduce salt to curb intense thirst, and avoid high-potassium foods to protect your heart rhythm.'}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DialysisDayCard;
