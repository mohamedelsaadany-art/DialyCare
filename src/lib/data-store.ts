import { v4 as uuidv4 } from 'uuid';
import type {
  Patient,
  AdherenceLog,
  FluidLog,
  DietLog,
  CoachingTip,
  Notification,
  PatientReminder,
  ReminderTemplate,
  DietChecklistItem,
  ReminderType,
} from './types';

import defaultCoachingTips from '@/data/coaching-tips.json';
import defaultReminderTemplates from '@/data/reminder-templates.json';
import defaultDietChecklist from '@/data/diet-checklist.json';

// LocalStorage Keys prefixed with DIALYCARE_
export const STORAGE_KEYS = {
  PATIENTS: 'DIALYCARE_PATIENTS',
  ADHERENCE_LOGS: 'DIALYCARE_ADHERENCE_LOGS',
  FLUID_LOGS: 'DIALYCARE_FLUID_LOGS',
  DIET_LOGS: 'DIALYCARE_DIET_LOGS',
  COACHING_TIPS: 'DIALYCARE_COACHING_TIPS',
  NOTIFICATIONS: 'DIALYCARE_NOTIFICATIONS',
  REMINDERS: 'DIALYCARE_REMINDERS',
  REMINDER_TEMPLATES: 'DIALYCARE_REMINDER_TEMPLATES',
  DIET_CHECKLIST: 'DIALYCARE_DIET_CHECKLIST',
} as const;

// Safe LocalStorage helpers with deep copy to prevent in-memory mutation
function cloneValue<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return cloneValue(defaultValue);
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return cloneValue(defaultValue);
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return cloneValue(defaultValue);
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing ${key} to localStorage:`, error);
  }
}

// Default initial demo patients (deterministic timestamp to prevent hydration mismatch)
const INITIAL_DEMO_PATIENTS: Patient[] = [
  {
    id: 'patient-1',
    fullName: 'Ahmed Mahmoud',
    fullNameAr: 'أحمد محمود',
    phone: '+201012345678',
    dialysisSchedule: 'MWF', // Monday, Wednesday, Friday
    reminderSchedule: 'standard',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'patient-2',
    fullName: 'Fatima El-Sayed',
    fullNameAr: 'فاطمة السيد',
    phone: '+201098765432',
    dialysisSchedule: 'TTS', // Tuesday, Thursday, Saturday
    reminderSchedule: 'standard',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// Default initial demo notifications (deterministic timestamps to avoid hydration mismatch)
export const INITIAL_DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif_welcome_broadcast',
    senderId: 'admin-1',
    type: 'broadcast',
    recipientIds: ['patient-1', 'patient-2'],
    titleEn: 'Welcome to DialyCare! 🌟',
    titleAr: 'مرحباً بكم في دايلي كير! 🌟',
    messageEn: 'Welcome to DialyCare! Keep tracking your daily fluid, diet, and medications to achieve optimal hemodialysis health.',
    messageAr: 'أهلاً بكم في دايلي كير! احرصوا على تسجيل السوائل والغذاء والأدوية يومياً لتحقيق أفضل نتائج علاجية.',
    sentAt: '2026-01-01T00:00:00.000Z',
    status: 'sent',
  },
  {
    id: 'notif_welcome_patient1',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-1'],
    titleEn: 'Welcome to DialyCare - Clinical Care Team',
    titleAr: 'مرحباً بك في دايلي كير - الفريق الطبي',
    messageEn: 'Hello Ahmed, welcome to DialyCare. Your nephrology care team will send you direct alerts, session reminders, and guidance here.',
    messageAr: 'أهلاً بك يا أحمد في دايلي كير. سيرسل لك فريق الكلى المعالج تنبيهات الجلسات والإرشادات الطبية المباشرة هنا.',
    sentAt: '2026-01-01T01:00:00.000Z',
    status: 'sent',
  },
  {
    id: 'notif_welcome_patient2',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-2'],
    titleEn: 'Welcome to DialyCare - Clinical Care Team',
    titleAr: 'مرحباً بك في دايلي كير - الفريق الطبي',
    messageEn: 'Hello Fatima, welcome to DialyCare. Your care team is here to support your dialysis treatment plan.',
    messageAr: 'أهلاً بك يا فاطمة في دايلي كير. فريقك الطبي هنا لدعم خطة علاجك وجلسات الغسيل الكلوي.',
    sentAt: '2026-01-01T01:00:00.000Z',
    status: 'sent',
  },
  {
    id: 'notif_session_patient1',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-1'],
    titleEn: 'Dialysis Session Reminder',
    titleAr: 'تذكير بموعد جلسة الغسيل الكلوي',
    messageEn: 'Your upcoming dialysis session is scheduled tomorrow. Please arrive 15 minutes before your time slot.',
    messageAr: 'جلستك القادمة للغسيل الكلوي مقررة غداً. يرجى الحضور قبل الموعد بـ 15 دقيقة.',
    sentAt: '2026-01-01T02:00:00.000Z',
    status: 'sent',
  },
];

// Initialize data store on first load
export function initDataStore(): void {
  if (typeof window === 'undefined') return;

  // Coaching tips
  if (!window.localStorage.getItem(STORAGE_KEYS.COACHING_TIPS)) {
    writeStorage(STORAGE_KEYS.COACHING_TIPS, defaultCoachingTips);
  }

  // Reminder templates
  if (!window.localStorage.getItem(STORAGE_KEYS.REMINDER_TEMPLATES)) {
    writeStorage(STORAGE_KEYS.REMINDER_TEMPLATES, defaultReminderTemplates);
  }

  // Diet checklist
  if (!window.localStorage.getItem(STORAGE_KEYS.DIET_CHECKLIST)) {
    writeStorage(STORAGE_KEYS.DIET_CHECKLIST, defaultDietChecklist);
  }

  // Patients
  if (!window.localStorage.getItem(STORAGE_KEYS.PATIENTS)) {
    writeStorage(STORAGE_KEYS.PATIENTS, INITIAL_DEMO_PATIENTS);
  }

  // Default patient reminders for demo patient
  if (!window.localStorage.getItem(STORAGE_KEYS.REMINDERS)) {
    const defaultReminders: PatientReminder[] = (defaultReminderTemplates as ReminderTemplate[]).map((tpl) => ({
      id: uuidv4(),
      patientId: 'patient-1',
      templateId: tpl.id,
      type: tpl.type,
      time: tpl.defaultTime,
      isActive: true,
      useCustomSchedule: false,
    }));
    writeStorage(STORAGE_KEYS.REMINDERS, defaultReminders);
  }

  // Default seed adherence logs
  if (!window.localStorage.getItem(STORAGE_KEYS.ADHERENCE_LOGS)) {
    const today = new Date().toISOString();
    const demoLogs: AdherenceLog[] = [
      {
        id: uuidv4(),
        patientId: 'patient-1',
        type: 'ttt',
        status: 'done',
        loggedAt: today,
        data: { title: 'Morning Medication' },
      },
      {
        id: uuidv4(),
        patientId: 'patient-1',
        type: 'fluid',
        status: 'done',
        loggedAt: today,
        data: { amountMl: 250 },
      },
      {
        id: uuidv4(),
        patientId: 'patient-1',
        type: 'diet',
        status: 'done',
        loggedAt: today,
        data: { mealType: 'breakfast' },
      },
    ];
    writeStorage(STORAGE_KEYS.ADHERENCE_LOGS, demoLogs);
  }

  // Default fluid logs
  if (!window.localStorage.getItem(STORAGE_KEYS.FLUID_LOGS)) {
    const today = new Date().toISOString();
    const demoFluid: FluidLog[] = [
      {
        id: uuidv4(),
        patientId: 'patient-1',
        amountMl: 250,
        unit: 'ml',
        loggedAt: today,
      },
    ];
    writeStorage(STORAGE_KEYS.FLUID_LOGS, demoFluid);
  }

  // Default diet logs
  if (!window.localStorage.getItem(STORAGE_KEYS.DIET_LOGS)) {
    const today = new Date().toISOString();
    const demoDiet: DietLog[] = [
      {
        id: uuidv4(),
        patientId: 'patient-1',
        checklist: ['diet_1', 'diet_2', 'diet_6'],
        mealType: 'breakfast',
        loggedAt: today,
      },
    ];
    writeStorage(STORAGE_KEYS.DIET_LOGS, demoDiet);
  }

  // Default notifications: seed if missing, empty, or missing welcome notification
  const rawNotifs = window.localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  let existingNotifs: Notification[] = [];
  try {
    existingNotifs = rawNotifs ? JSON.parse(rawNotifs) : [];
  } catch {
    existingNotifs = [];
  }

  if (!rawNotifs || !Array.isArray(existingNotifs) || existingNotifs.length === 0) {
    writeStorage(STORAGE_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
  } else {
    // If storage has notifications but none is a welcome notification, seed initial welcome notifications
    const hasWelcome = existingNotifs.some(
      (n) => n.id.includes('welcome') || n.titleEn.toLowerCase().includes('welcome')
    );
    if (!hasWelcome) {
      existingNotifs.unshift(...INITIAL_DEMO_NOTIFICATIONS);
      writeStorage(STORAGE_KEYS.NOTIFICATIONS, existingNotifs);
    }
  }
}

// ==========================================
// PATIENTS
// ==========================================
export function getPatients(): Patient[] {
  initDataStore();
  return readStorage<Patient[]>(STORAGE_KEYS.PATIENTS, INITIAL_DEMO_PATIENTS);
}

export function addPatient(patient: Patient): Patient {
  initDataStore();
  const patients = getPatients();
  const newPatient: Patient = {
    ...patient,
    id: patient.id || uuidv4(),
    createdAt: patient.createdAt || new Date().toISOString(),
  };
  patients.push(newPatient);
  writeStorage(STORAGE_KEYS.PATIENTS, patients);
  return newPatient;
}

export function updatePatient(id: string, data: Partial<Patient>): Patient | null {
  initDataStore();
  const patients = getPatients();
  const index = patients.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: Patient = { ...patients[index], ...data };
  patients[index] = updated;
  writeStorage(STORAGE_KEYS.PATIENTS, patients);
  return updated;
}

export function deletePatient(id: string): boolean {
  initDataStore();
  const patients = getPatients();
  const filtered = patients.filter((p) => p.id !== id);
  if (filtered.length === patients.length) return false;
  writeStorage(STORAGE_KEYS.PATIENTS, filtered);
  return true;
}

// ==========================================
// ADHERENCE LOGS
// ==========================================
export function getAdherenceLogs(
  patientId?: string,
  type?: ReminderType,
  dateRange?: { start?: Date | string; end?: Date | string }
): AdherenceLog[] {
  initDataStore();
  let logs = readStorage<AdherenceLog[]>(STORAGE_KEYS.ADHERENCE_LOGS, []);

  if (patientId) {
    logs = logs.filter((log) => log.patientId === patientId);
  }
  if (type) {
    logs = logs.filter((log) => log.type === type);
  }
  if (dateRange) {
    if (dateRange.start) {
      const startTime = new Date(dateRange.start).getTime();
      logs = logs.filter((log) => new Date(log.loggedAt).getTime() >= startTime);
    }
    if (dateRange.end) {
      const endTime = new Date(dateRange.end).getTime();
      logs = logs.filter((log) => new Date(log.loggedAt).getTime() <= endTime);
    }
  }

  return logs;
}

export function addAdherenceLog(log: Omit<AdherenceLog, 'id'> | AdherenceLog): AdherenceLog {
  initDataStore();
  const logs = getAdherenceLogs();
  const newLog: AdherenceLog = {
    ...log,
    id: 'id' in log && log.id ? log.id : uuidv4(),
    loggedAt: log.loggedAt || new Date().toISOString(),
  };
  logs.unshift(newLog);
  writeStorage(STORAGE_KEYS.ADHERENCE_LOGS, logs);
  return newLog;
}

// ==========================================
// FLUID LOGS
// ==========================================
function toDateStr(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }
  try {
    return new Date(date).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function getFluidLogs(patientId: string, date?: Date | string): FluidLog[] {
  initDataStore();
  let logs = readStorage<FluidLog[]>(STORAGE_KEYS.FLUID_LOGS, []);
  logs = logs.filter((l) => l.patientId === patientId);

  if (date) {
    const targetDateStr = toDateStr(date);
    logs = logs.filter((l) => toDateStr(l.loggedAt) === targetDateStr);
  }

  return logs;
}

export function addFluidLog(log: Omit<FluidLog, 'id'> | FluidLog): FluidLog {
  initDataStore();
  const logs = readStorage<FluidLog[]>(STORAGE_KEYS.FLUID_LOGS, []);
  const newLog: FluidLog = {
    ...log,
    id: 'id' in log && log.id ? log.id : uuidv4(),
    loggedAt: log.loggedAt || new Date().toISOString(),
  };
  logs.unshift(newLog);
  writeStorage(STORAGE_KEYS.FLUID_LOGS, logs);
  return newLog;
}

// ==========================================
// DIET LOGS
// ==========================================
export function getDietLogs(patientId: string, date?: Date | string): DietLog[] {
  initDataStore();
  let logs = readStorage<DietLog[]>(STORAGE_KEYS.DIET_LOGS, []);
  logs = logs.filter((l) => l.patientId === patientId);

  if (date) {
    const targetDateStr = toDateStr(date);
    logs = logs.filter((l) => toDateStr(l.loggedAt) === targetDateStr);
  }

  return logs;
}

export function addDietLog(log: Omit<DietLog, 'id'> | DietLog): DietLog {
  initDataStore();
  const logs = readStorage<DietLog[]>(STORAGE_KEYS.DIET_LOGS, []);
  const newLog: DietLog = {
    ...log,
    id: 'id' in log && log.id ? log.id : uuidv4(),
    loggedAt: log.loggedAt || new Date().toISOString(),
  };
  logs.unshift(newLog);
  writeStorage(STORAGE_KEYS.DIET_LOGS, logs);
  return newLog;
}

// ==========================================
// COACHING TIPS
// ==========================================
export function getCoachingTips(): CoachingTip[] {
  initDataStore();
  return readStorage<CoachingTip[]>(
    STORAGE_KEYS.COACHING_TIPS,
    defaultCoachingTips as CoachingTip[]
  );
}

export function addCoachingTip(tip: CoachingTip): CoachingTip {
  initDataStore();
  const tips = getCoachingTips();
  const newTip: CoachingTip = {
    ...tip,
    id: tip.id || uuidv4(),
  };
  tips.push(newTip);
  writeStorage(STORAGE_KEYS.COACHING_TIPS, tips);
  return newTip;
}

export function updateCoachingTip(id: string, data: Partial<CoachingTip>): CoachingTip | null {
  initDataStore();
  const tips = getCoachingTips();
  const index = tips.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const updated = { ...tips[index], ...data };
  tips[index] = updated;
  writeStorage(STORAGE_KEYS.COACHING_TIPS, tips);
  return updated;
}

export function deleteCoachingTip(id: string): boolean {
  initDataStore();
  const tips = getCoachingTips();
  const filtered = tips.filter((t) => t.id !== id);
  if (filtered.length === tips.length) return false;
  writeStorage(STORAGE_KEYS.COACHING_TIPS, filtered);
  return true;
}

// ==========================================
// NOTIFICATIONS
// ==========================================
export function getNotifications(): Notification[] {
  initDataStore();
  return readStorage<Notification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
}

export function addNotification(notification: Notification): Notification {
  initDataStore();
  const notifications = getNotifications();
  const newNotification: Notification = {
    ...notification,
    id: notification.id || uuidv4(),
    sentAt: notification.sentAt || new Date().toISOString(),
  };
  notifications.unshift(newNotification);
  writeStorage(STORAGE_KEYS.NOTIFICATIONS, notifications);
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event('dialycare_notifications_updated'));
    } catch {
      // ignore
    }
  }
  return newNotification;
}

export function getPatientNotifications(patientId: string, schedule?: string): Notification[] {
  initDataStore();
  const notifications = getNotifications();
  let patientSchedule = schedule;
  if (!patientSchedule) {
    const patients = getPatients();
    const p = patients.find((pt) => pt.id === patientId);
    if (p) patientSchedule = p.dialysisSchedule;
  }
  const schedUpper = (patientSchedule || '').toUpperCase();
  return notifications.filter((n) => {
    if (n.type === 'broadcast') return true;
    if (Array.isArray(n.recipientIds)) {
      if (n.recipientIds.includes(patientId)) return true;
      if (n.type === 'group' && schedUpper && n.recipientIds.some((s) => s.toUpperCase() === schedUpper)) {
        return true;
      }
    }
    return false;
  });
}

// ==========================================
// REMINDERS
// ==========================================
export function getReminders(patientId?: string): PatientReminder[] {
  initDataStore();
  let reminders = readStorage<PatientReminder[]>(STORAGE_KEYS.REMINDERS, []);
  if (patientId) {
    reminders = reminders.filter((r) => r.patientId === patientId);
  }
  return reminders;
}

export function addReminder(reminder: PatientReminder): PatientReminder {
  initDataStore();
  const reminders = getReminders();
  const newReminder: PatientReminder = {
    ...reminder,
    id: reminder.id || uuidv4(),
  };
  reminders.push(newReminder);
  writeStorage(STORAGE_KEYS.REMINDERS, reminders);
  return newReminder;
}

export function updateReminder(id: string, data: Partial<PatientReminder>): PatientReminder | null {
  initDataStore();
  const reminders = getReminders();
  const index = reminders.findIndex((r) => r.id === id);
  if (index === -1) return null;
  const updated = { ...reminders[index], ...data };
  reminders[index] = updated;
  writeStorage(STORAGE_KEYS.REMINDERS, reminders);
  return updated;
}

export function deleteReminder(id: string): boolean {
  initDataStore();
  const reminders = getReminders();
  const filtered = reminders.filter((r) => r.id !== id);
  if (filtered.length === reminders.length) return false;
  writeStorage(STORAGE_KEYS.REMINDERS, filtered);
  return true;
}

// ==========================================
// TEMPLATES & CHECKLIST
// ==========================================
export function getReminderTemplates(): ReminderTemplate[] {
  initDataStore();
  return readStorage<ReminderTemplate[]>(
    STORAGE_KEYS.REMINDER_TEMPLATES,
    defaultReminderTemplates as ReminderTemplate[]
  );
}

export function updateReminderTemplate(
  id: string,
  data: Partial<ReminderTemplate>
): ReminderTemplate | null {
  initDataStore();
  const templates = getReminderTemplates();
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const updated = { ...templates[index], ...data };
  templates[index] = updated;
  writeStorage(STORAGE_KEYS.REMINDER_TEMPLATES, templates);
  return updated;
}

export function getDietChecklist(): DietChecklistItem[] {
  initDataStore();
  return readStorage<DietChecklistItem[]>(
    STORAGE_KEYS.DIET_CHECKLIST,
    defaultDietChecklist as DietChecklistItem[]
  );
}
