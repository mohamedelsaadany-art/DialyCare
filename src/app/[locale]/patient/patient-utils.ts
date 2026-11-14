import type {
  PatientReminder,
  AdherenceLog,
  FluidLog,
  DietLog,
  ReminderTemplate,
  ReminderType,
  MealType,
  AdherenceStatus,
  Notification,
} from '@/lib/types';
import { addAdherenceLog } from '@/lib/data-store';
import { showLocalNotification } from '@/lib/notifications';

export interface ReminderStatusResult {
  status: 'done' | 'skipped' | 'missed' | 'pending';
  logId?: string;
}

/**
 * Accurately determines the adherence status of an individual reminder
 * by checking direct reminderId logs, type-specific meal/fluid records,
 * and current time passage.
 */
export function getReminderStatus(
  reminder: PatientReminder,
  adherenceLogs: AdherenceLog[],
  fluidLogs: FluidLog[],
  dietLogs: DietLog[],
  reminderTemplates?: ReminderTemplate[]
): ReminderStatusResult {
  // 1. Direct match by reminderId (authoritative)
  const directLog = adherenceLogs.find((l) => {
    return (
      l.data &&
      typeof l.data === 'object' &&
      'reminderId' in l.data &&
      l.data.reminderId === reminder.id
    );
  });

  if (directLog) {
    return {
      status: directLog.status === 'done' ? 'done' : directLog.status === 'skipped' ? 'skipped' : 'missed',
      logId: directLog.id,
    };
  }

  // 2. Medication ('ttt'): check for title-matched logs (e.g. from demo seed data)
  if (reminder.type === 'ttt') {
    const template = reminderTemplates?.find((t) => t.id === reminder.templateId);
    const remHours = parseInt(reminder.time.split(':')[0], 10) || 0;

    const titleLog = adherenceLogs.find((l) => {
      if (l.type !== 'ttt' || !l.data || typeof l.data !== 'object') return false;
      const title = 'title' in l.data ? String(l.data.title).toLowerCase() : '';
      if (!title) return false;

      if (template) {
        if (
          title === template.titleEn.toLowerCase() ||
          title === template.titleAr.toLowerCase()
        ) {
          return true;
        }
      }

      if (remHours < 12 && title.includes('morning')) return true;
      if (remHours >= 12 && remHours < 17 && title.includes('afternoon')) return true;
      if (remHours >= 17 && title.includes('evening')) return true;
      return false;
    });

    if (titleLog) {
      return {
        status: titleLog.status === 'done' ? 'done' : titleLog.status === 'skipped' ? 'skipped' : 'missed',
        logId: titleLog.id,
      };
    }
  }

  // 3. Diet ('diet'): check mealType match
  if (reminder.type === 'diet') {
    let targetMeal: MealType = 'breakfast';
    const remHours = parseInt(reminder.time.split(':')[0], 10) || 0;

    if (reminder.templateId?.includes('breakfast') || remHours < 11) {
      targetMeal = 'breakfast';
    } else if (reminder.templateId?.includes('lunch') || (remHours >= 11 && remHours < 16)) {
      targetMeal = 'lunch';
    } else {
      targetMeal = 'dinner';
    }

    // Check if meal was logged in diet logs
    const matchingDietLog = dietLogs.find((dl) => dl.mealType === targetMeal);
    if (matchingDietLog) {
      return { status: 'done', logId: matchingDietLog.id };
    }

    // Check adherence log for mealType
    const matchingDietAdh = adherenceLogs.find((l) => {
      return (
        l.type === 'diet' &&
        l.data &&
        typeof l.data === 'object' &&
        'mealType' in l.data &&
        l.data.mealType === targetMeal
      );
    });
    if (matchingDietAdh) {
      return {
        status: matchingDietAdh.status === 'done' ? 'done' : 'skipped',
        logId: matchingDietAdh.id,
      };
    }
  }

  // 4. Fluid ('fluid'): check time-of-day intake
  if (reminder.type === 'fluid') {
    const remHours = parseInt(reminder.time.split(':')[0], 10) || 0;
    const matchingFluid = fluidLogs.find((fl) => {
      const logHour = new Date(fl.loggedAt).getHours();
      if (remHours < 12) return logHour < 12;
      if (remHours >= 12 && remHours < 17) return logHour >= 12 && logHour < 17;
      return logHour >= 17;
    });

    if (matchingFluid) {
      return { status: 'done', logId: matchingFluid.id };
    }
  }

  // 5. If no log recorded: check if scheduled time has passed
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [hStr, mStr] = reminder.time.split(':');
  const remMinutes = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);

  if (remMinutes < currentMinutes) {
    return { status: 'missed' };
  }

  return { status: 'pending' };
}

/**
 * Record an adherence log for a reminder with deduplication for today
 */
export function recordReminderAdherence(params: {
  patientId: string;
  reminderId: string;
  type: ReminderType;
  status: AdherenceStatus;
  title: string;
}): AdherenceLog {
  return addAdherenceLog({
    patientId: params.patientId,
    type: params.type,
    status: params.status,
    loggedAt: new Date().toISOString(),
    data: {
      reminderId: params.reminderId,
      title: params.title,
    },
  });
}

/**
 * Normalizes any schedule string to one of the two strict options: 'SMW' or 'STT'.
 * - 'SMW': Saturday / Monday / Wednesday (السبت / الاثنين / الأربعاء) -> [6, 1, 3]
 * - 'STT': Sunday / Tuesday / Thursday (الأحد / الثلاثاء / الخميس) -> [0, 2, 4]
 * Backwards compatibility: normalizes legacy 'MWF' -> 'SMW', 'TTS' -> 'STT', and 'Custom' -> 'SMW'.
 */
export function normalizeDialysisSchedule(schedule?: string): 'SMW' | 'STT' {
  if (!schedule) return 'SMW';
  const s = schedule.trim().toUpperCase();
  if (
    s.includes('STT') ||
    s.includes('TTS') ||
    s.includes('SUN') ||
    s.includes('أحد') ||
    s.includes('TUE') ||
    s.includes('THU')
  ) {
    return 'STT';
  }
  return 'SMW';
}

/**
 * Returns the short localized schedule label:
 * - 'SMW': 'السبت / الاثنين / الأربعاء' (ar) or 'Sat / Mon / Wed' (en)
 * - 'STT': 'الأحد / الثلاثاء / الخميس' (ar) or 'Sun / Tue / Thu' (en)
 */
export function getDialysisScheduleLabel(schedule?: string, isAr: boolean = false): string {
  const norm = normalizeDialysisSchedule(schedule);
  if (norm === 'STT') {
    return isAr ? 'الأحد / الثلاثاء / الخميس' : 'Sun / Tue / Thu';
  }
  return isAr ? 'السبت / الاثنين / الأربعاء' : 'Sat / Mon / Wed';
}

/**
 * Returns the full bilingual schedule label for forms, modals, and badges:
 * - 'SMW': 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)' (ar) or 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)' (en)
 * - 'STT': 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)' (ar) or 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)' (en)
 */
export function getDialysisScheduleFullLabel(schedule?: string, isAr: boolean = false): string {
  const norm = normalizeDialysisSchedule(schedule);
  if (norm === 'STT') {
    return isAr
      ? 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)'
      : 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)';
  }
  return isAr
    ? 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)'
    : 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)';
}

/**
 * Smart detection of whether a given date is a Dialysis Treatment Day.
 * Strict 2-Option Schedule (R6):
 * - Option 1 (SMW): Saturday (6), Monday (1), Wednesday (3) [and legacy MWF]
 * - Option 2 (STT): Sunday (0), Tuesday (2), Thursday (4) [and legacy TTS]
 * Note: Friday (5) is always an off-dialysis day across both schedules.
 */
export function isDialysisDay(dialysisSchedule?: string, date: Date = new Date()): boolean {
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const day = validDate.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const normalized = normalizeDialysisSchedule(dialysisSchedule);

  if (normalized === 'STT') {
    // Sunday (0), Tuesday (2), Thursday (4)
    return day === 0 || day === 2 || day === 4;
  }

  // Default: SMW — Saturday (6), Monday (1), Wednesday (3)
  return day === 6 || day === 1 || day === 3;
}

/**
 * Filter doctor notifications relevant to a specific patient:
 * - n.type === 'broadcast'
 * - OR n.recipientIds && (n.recipientIds.includes(patientId) || n.recipientIds.includes(userUid))
 * - OR n.type === 'group' matching patient's schedule (SMW or STT, with legacy MWF/TTS support)
 */
export function filterPatientNotifications(
  notifications: Notification[],
  patientId: string,
  schedule?: string,
  userUid?: string
): Notification[] {
  if (!Array.isArray(notifications)) return [];

  const rawSchedule = (schedule || 'SMW').trim().toUpperCase();
  const normalizedPatientSchedule = normalizeDialysisSchedule(rawSchedule);
  const validIds = new Set<string>();
  if (patientId) validIds.add(patientId);
  if (userUid) validIds.add(userUid);

  return notifications.filter((n) => {
    if (!n) return false;

    // 1. Broadcast to all patients
    if (n.type === 'broadcast') return true;

    // 2. Direct recipient match
    if (n.recipientIds && Array.isArray(n.recipientIds)) {
      if (n.recipientIds.some((id) => validIds.has(id))) return true;

      // Group matching schedule inside recipientIds
      if (n.type === 'group') {
        const matchesGroup = n.recipientIds.some((id) => {
          const upper = id.trim().toUpperCase();
          if (upper === rawSchedule || upper === normalizedPatientSchedule) return true;
          // Support backwards compatibility for group matching
          if (normalizedPatientSchedule === 'SMW' && (upper === 'MWF' || upper === 'SMW')) return true;
          if (normalizedPatientSchedule === 'STT' && (upper === 'TTS' || upper === 'STT')) return true;
          return false;
        });
        if (matchesGroup) return true;
      }
    }

    // 3. Fallback for group matching schedule via properties (e.g. targetGroup, group, or schedule)
    if (n.type === 'group') {
      const extra = n as unknown as Record<string, unknown>;
      const groupProp =
        typeof extra.group === 'string'
          ? extra.group.trim().toUpperCase()
          : typeof extra.targetGroup === 'string'
          ? (extra.targetGroup as string).trim().toUpperCase()
          : typeof extra.schedule === 'string'
          ? (extra.schedule as string).trim().toUpperCase()
          : '';

      if (groupProp) {
        if (groupProp === rawSchedule || groupProp === normalizedPatientSchedule) return true;
        if (normalizedPatientSchedule === 'SMW' && (groupProp === 'MWF' || groupProp === 'SMW')) return true;
        if (normalizedPatientSchedule === 'STT' && (groupProp === 'TTS' || groupProp === 'STT')) return true;
      }
    }

    return false;
  });
}

/**
 * Read tracked notification IDs from localStorage
 */
export function getReadNotificationIds(patientId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`DIALYCARE_READ_NOTIFICATIONS_${patientId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mark a specific notification as read in localStorage
 */
export function markNotificationAsRead(patientId: string, notificationId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getReadNotificationIds(patientId);
    if (!current.includes(notificationId)) {
      const updated = [...current, notificationId];
      window.localStorage.setItem(`DIALYCARE_READ_NOTIFICATIONS_${patientId}`, JSON.stringify(updated));
      try {
        window.dispatchEvent(new Event('dialycare_notifications_updated'));
      } catch {
        // ignore
      }
      return updated;
    }
    return current;
  } catch {
    return [];
  }
}

/**
 * Mark all given notifications as read in localStorage
 */
export function markAllNotificationsAsRead(patientId: string, notificationIds: string[]): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = new Set(getReadNotificationIds(patientId));
    if (Array.isArray(notificationIds)) {
      notificationIds.forEach((id) => {
        if (id) current.add(id);
      });
    }
    const updated = Array.from(current);
    window.localStorage.setItem(`DIALYCARE_READ_NOTIFICATIONS_${patientId}`, JSON.stringify(updated));
    try {
      window.dispatchEvent(new Event('dialycare_notifications_updated'));
    } catch {
      // ignore
    }
    return updated;
  } catch {
    return [];
  }
}

/**
 * Trigger local browser notification for any new, unalerted unread notifications
 * Only triggers if Notification API is supported and permission is 'granted'
 */
export function checkAndTriggerLocalNotifications(
  patientId: string,
  notifications: Notification[],
  isAr: boolean
): void {
  if (typeof window === 'undefined') return;
  // Guard: if browser doesn't support notifications or permission is not granted,
  // do not proceed so alerts are not prematurely marked as shown without user seeing them.
  if (!('Notification' in window) || window.Notification.permission !== 'granted') {
    return;
  }

  try {
    const readIds = new Set(getReadNotificationIds(patientId));
    const alertedKey = `DIALYCARE_ALERTED_NOTIFICATIONS_${patientId}`;
    const rawAlerted = window.localStorage.getItem(alertedKey);
    let parsedAlerted: string[] = [];
    try {
      parsedAlerted = rawAlerted ? JSON.parse(rawAlerted) : [];
      if (!Array.isArray(parsedAlerted)) parsedAlerted = [];
    } catch {
      parsedAlerted = [];
    }
    const alertedIds = new Set<string>(parsedAlerted);

    const unreadUnnotified = notifications.filter(
      (n) => n && !readIds.has(n.id) && !alertedIds.has(n.id)
    );

    if (unreadUnnotified.length > 0) {
      unreadUnnotified.forEach((n) => {
        const title = isAr ? n.titleAr || n.titleEn : n.titleEn || n.titleAr;
        const message = isAr ? n.messageAr || n.messageEn : n.messageEn || n.messageAr;
        showLocalNotification(title, message);
        alertedIds.add(n.id);
      });
      window.localStorage.setItem(alertedKey, JSON.stringify(Array.from(alertedIds)));
    }
  } catch (error) {
    console.error('Failed to trigger local notifications:', error);
  }
}

/**
 * Checks if a string conforms to a raw 36-character hexadecimal UUID format
 */
export function isUuid(str?: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Returns a clean, deduplicated patient display name.
 * If Arabic and English names are identical or one is missing, returns only that name.
 * If both exist and differ, returns `الاسم بالعربي (Name in English)` in RTL, or `Name (الاسم)` in LTR.
 */
export function formatPatientDisplayName(
  patient: { fullName?: string; fullNameAr?: string },
  isAr: boolean = true
): string {
  const en = (patient.fullName || '').trim();
  const ar = (patient.fullNameAr || '').trim();

  if (ar && en && ar.toLowerCase() !== en.toLowerCase()) {
    return isAr ? `${ar} (${en})` : `${en} (${ar})`;
  }

  return ar || en || (isAr ? 'مريض غير محدد' : 'Unnamed Patient');
}

/**
 * Returns a human-friendly clinical identifier (Phone, Medical Record #, or Short Badge)
 * eliminating long, incomprehensible technical UUIDs from the UI.
 */
export function formatPatientFriendlyId(patient: {
  id: string;
  phone?: string;
  username?: string;
}): string {
  // If clean phone number exists, display phone
  if (patient.phone && !isUuid(patient.phone)) {
    return patient.phone;
  }
  // If clean readable username exists, display username
  if (patient.username && !isUuid(patient.username)) {
    return patient.username;
  }
  // If legacy demo pattern patient-X, display clean file number (#1, #2)
  if (patient.id.startsWith('patient-')) {
    return `#${patient.id.replace('patient-', '')}`;
  }
  // If raw technical UUID, display a short clean 6-hex file code instead of 36 chars
  if (isUuid(patient.id)) {
    return `#${patient.id.slice(0, 6)}`;
  }
  return patient.id;
}

/**
 * Formats a clean, readable label for patient selector dropdowns and cards
 * e.g. "أحمد محمود (Ahmed Mahmoud) • هاتف: 01012345678 • السبت / الاثنين / الأربعاء"
 */
export function formatPatientOptionLabel(
  patient: {
    id: string;
    fullName: string;
    fullNameAr?: string;
    phone?: string;
    username?: string;
    dialysisSchedule?: string;
  },
  isAr: boolean = true
): string {
  const name = formatPatientDisplayName(patient, isAr);
  const friendlyId = formatPatientFriendlyId(patient);
  const schedule = getDialysisScheduleLabel(patient.dialysisSchedule, isAr);

  const idBadge = patient.phone && patient.phone === friendlyId
    ? (isAr ? `هاتف: ${friendlyId}` : `Tel: ${friendlyId}`)
    : (isAr ? `ملف: ${friendlyId}` : `File: ${friendlyId}`);

  return `${name} • ${idBadge} • ${schedule}`;
}


