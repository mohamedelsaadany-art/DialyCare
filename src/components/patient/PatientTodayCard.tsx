'use client';

import React, { useMemo } from 'react';
import { getCairoDate, scheduleIncludesWeekday } from '@/lib/dialysis-day';

const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Is today a dialysis day, and which day is the next one? (Cairo time) */
export function dialysisDayInfo(schedule: string | undefined, now: Date = new Date()): { today: boolean; nextWeekday: number | null; inDays: number } {
  const { weekday } = getCairoDate(now);
  const today = scheduleIncludesWeekday(schedule, weekday);
  for (let i = 1; i <= 7; i++) {
    const wd = (weekday + i) % 7;
    if (scheduleIncludesWeekday(schedule, wd)) return { today, nextWeekday: wd, inDays: i };
  }
  return { today, nextWeekday: null, inDays: 0 };
}

/**
 * The first thing a patient sees: one big, plain answer to
 * "do I have dialysis today?" and when the next session is.
 */
export function PatientTodayCard({ schedule, isAr }: { schedule?: string; isAr: boolean }) {
  const info = useMemo(() => dialysisDayInfo(schedule), [schedule]);
  const nextName =
    info.nextWeekday === null ? '' : isAr ? DAY_AR[info.nextWeekday] : DAY_EN[info.nextWeekday];
  const whenAr = info.inDays === 1 ? 'غداً' : `يوم ${nextName}`;
  const whenEn = info.inDays === 1 ? 'tomorrow' : `on ${nextName}`;

  if (info.today) {
    return (
      <section
        data-testid="patient-today-card"
        className="rounded-3xl bg-[#1e6bb8] text-white p-5 shadow-md flex items-center gap-4"
      >
        <span className="text-5xl shrink-0" aria-hidden="true">🩺</span>
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-snug">
            {isAr ? 'اليوم عندك جلسة غسيل' : 'You have dialysis today'}
          </h2>
          <p className="text-base text-blue-50 mt-1 leading-snug">
            {isAr ? 'لا تنسَ موعدك في المركز.' : "Don't miss your session at the center."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="patient-today-card"
      className="rounded-3xl bg-emerald-50 border-2 border-emerald-300 p-5 flex items-center gap-4"
    >
      <span className="text-5xl shrink-0" aria-hidden="true">🏠</span>
      <div className="min-w-0">
        <h2 className="text-2xl font-black text-emerald-950 leading-snug">
          {isAr ? 'اليوم يوم راحة' : 'Rest day today'}
        </h2>
        {nextName && (
          <p className="text-base font-bold text-emerald-800 mt-1 leading-snug">
            {isAr ? `جلستك القادمة ${whenAr}` : `Next dialysis ${whenEn}`}
          </p>
        )}
      </div>
    </section>
  );
}

export default PatientTodayCard;
