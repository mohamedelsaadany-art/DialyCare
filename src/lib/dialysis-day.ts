import type { Notification, Patient } from './types';

export interface CairoDate {
  ymd: string;
  weekday: number;
  hour: number;
}

export function getCairoDate(now: Date): CairoDate {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  let year = '';
  let month = '';
  let day = '';
  let hour = 0;
  let weekdayStr = '';

  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'hour') hour = parseInt(part.value, 10);
    else if (part.type === 'weekday') weekdayStr = part.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayStr] ?? 0;
  const ymd = `${year}-${month}-${day}`;

  return { ymd, weekday, hour };
}

// The unit runs two shifts only (see types.ts). Legacy codes normalize like the
// rest of the app: MWF/Custom -> SMW, TTS -> STT.
const SCHEDULE_WEEKDAYS: Record<string, number[]> = {
  SMW: [6, 1, 3], // Sat, Mon, Wed
  STT: [0, 2, 4], // Sun, Tue, Thu
  MWF: [6, 1, 3],
  CUSTOM: [6, 1, 3],
  TTS: [0, 2, 4],
};

export function scheduleIncludesWeekday(schedule: string | undefined | null, weekday: number): boolean {
  if (!schedule || typeof schedule !== 'string') return false;
  const days = SCHEDULE_WEEKDAYS[schedule.trim().toUpperCase()];
  if (!days) return false;
  return days.includes(weekday);
}

export function buildDialysisDayNotification(
  patients: Patient[],
  now: Date
): Notification | null {
  const cairo = getCairoDate(now);

  const recipientIds = patients
    .filter((p) => {
      if (!p || !p.id) return false;
      if (p.isArchived) return false;
      if (p.isActive === false) return false;
      return scheduleIncludesWeekday(p.dialysisSchedule, cairo.weekday);
    })
    .map((p) => p.id);

  if (recipientIds.length === 0) {
    return null;
  }

  return {
    id: `dialysis-day-${cairo.ymd}`,
    type: 'group',
    senderId: 'system',
    status: 'sent',
    sentAt: now.toISOString(),
    recipientIds,
    titleEn: 'Dialysis day',
    titleAr: 'يوم الغسيل الكلوي',
    messageEn: 'You have a dialysis session today. Please arrive on time.',
    messageAr: 'لديك جلسة غسيل كلوي اليوم. برجاء الحضور في الموعد.',
  };
}
