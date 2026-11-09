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
 * Smart detection of whether a given date is a Dialysis Treatment Day.
 * MWF: Monday (1), Wednesday (3), Friday (5)
 * TTS: Tuesday (2), Thursday (4), Saturday (6)
 */
export function isDialysisDay(dialysisSchedule?: string, date: Date = new Date()): boolean {
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const day = validDate.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const schedule = (dialysisSchedule || 'MWF').toUpperCase();

  if (schedule.includes('TTS')) {
    return day === 2 || day === 4 || day === 6;
  }
  // Default and standard MWF
  if (schedule.includes('MWF')) {
    return day === 1 || day === 3 || day === 5;
  }

  // Fallback for custom schedules
  return day === 1 || day === 3 || day === 5;
}

/**
 * Filter doctor notifications relevant to a specific patient:
 * - n.type === 'broadcast'
 * - OR n.recipientIds && (n.recipientIds.includes(patientId) || n.recipientIds.includes(userUid))
 * - OR n.type === 'group' matching patient's schedule (e.g. MWF or TTS)
 */
export function filterPatientNotifications(
  notifications: Notification[],
  patientId: string,
  schedule?: string,
  userUid?: string
): Notification[] {
  if (!Array.isArray(notifications)) return [];

  const patientSchedule = (schedule || 'MWF').trim().toUpperCase();
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
        if (
          n.recipientIds.some(
            (id) =>
              id.trim().toUpperCase() === patientSchedule ||
              id.trim().toUpperCase().includes(patientSchedule)
          )
        ) {
          return true;
        }
      }
    }

    // 3. Fallback for group matching schedule via properties (e.g. targetGroup, group, or schedule)
    if (n.type === 'group') {
      const extra = n as unknown as Record<string, unknown>;
      const groupProp =
        typeof extra.group === 'string'
          ? extra.group.trim().toUpperCase()
          : typeof extra.targetGroup === 'string'
          ? extra.targetGroup.trim().toUpperCase()
          : typeof extra.schedule === 'string'
          ? extra.schedule.trim().toUpperCase()
          : '';

      if (groupProp && (groupProp === patientSchedule || groupProp.includes(patientSchedule))) {
        return true;
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

