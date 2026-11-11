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
  PatientMedication,
  DialysisSession,
  PatientLabRecord,
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
  PATIENT_MEDICATIONS: 'DIALYCARE_PATIENT_MEDICATIONS',
  DIALYSIS_SESSIONS: 'DIALYCARE_DIALYSIS_SESSIONS',
  LAB_RESULTS: 'DIALYCARE_LAB_RESULTS',
} as const;

// Safe LocalStorage helpers with deep copy to prevent in-memory mutation
function cloneValue<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

const memoryStorage = new Map<string, string>();

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    const mem = memoryStorage.get(key);
    if (!mem) return cloneValue(defaultValue);
    try {
      return JSON.parse(mem) as T;
    } catch {
      return cloneValue(defaultValue);
    }
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
  if (typeof window === 'undefined') {
    memoryStorage.set(key, JSON.stringify(value));
    return;
  }
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
    dialysisSchedule: 'SMW', // Saturday, Monday, Wednesday (السبت / الاثنين / الأربعاء)
    reminderSchedule: 'standard',
    dryWeightKg: 70,
    gender: 'male',
    avatarId: 'male_mature_1',
    avatarStyle: 'classic',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'patient-2',
    fullName: 'Fatima El-Sayed',
    fullNameAr: 'فاطمة السيد',
    phone: '+201098765432',
    dialysisSchedule: 'STT', // Sunday, Tuesday, Thursday (الأحد / الثلاثاء / الخميس)
    reminderSchedule: 'standard',
    dryWeightKg: 65,
    gender: 'female',
    avatarId: 'female_mature_1',
    avatarStyle: 'classic',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// Initial demo medications for patient-1
export const INITIAL_DEMO_MEDICATIONS: PatientMedication[] = [
  {
    id: 'demo-med-1',
    patientId: 'patient-1',
    name: 'Sevelamer Carbonate (Renvela)',
    nameAr: 'سيفيلامير كربونات (رينفيلا)',
    dose: '800 mg (1 tablet)',
    scheduleTime: '08:00',
    scheduleTimes: ['08:00', '14:00', '20:00'],
    instructions: 'Take with meals to bind dietary phosphorus',
    instructionsAr: 'يؤخذ مع الوجبة لربط الفوسفات في الطعام',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-med-2',
    patientId: 'patient-1',
    name: 'Amlodipine (Norvasc)',
    nameAr: 'أملوديبين (نورفاسك)',
    dose: '5 mg',
    scheduleTime: '08:00',
    scheduleTimes: ['08:00'],
    instructions: 'Antihypertensive medication - take every morning',
    instructionsAr: 'دواء خافض لضغط الدم - يؤخذ صباحاً',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-med-3',
    patientId: 'patient-1',
    name: 'Alfacalcidol (One-Alpha)',
    nameAr: 'ألفاكالسيدول (وان-ألفا)',
    dose: '0.5 mcg',
    scheduleTime: '20:00',
    scheduleTimes: ['20:00'],
    instructions: 'Active Vitamin D analog for renal bone management',
    instructionsAr: 'فيتامين د النشط للحفاظ على توازن الكالسيوم والعظام',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// Initial demo dialysis sessions for patient-1 with all 14 clinical fields
export const INITIAL_DEMO_SESSIONS: DialysisSession[] = [
  {
    id: 'demo-session-1',
    patientId: 'patient-1',
    sessionDate: '2026-03-02',
    recordedBy: 'admin-1',
    recordedAt: '2026-03-02T13:30:00.000Z',
    complianceRating: 5,
    preWeightKg: 72,
    preWeightGrams: 500,
    postWeightKg: 70,
    postWeightGrams: 200,
    vitals: {
      preSession: { systolic: 140, diastolic: 85, heartRate: 74 },
      after1hr: { systolic: 135, diastolic: 82, heartRate: 72 },
      after2hr: { systolic: 130, diastolic: 80, heartRate: 75 },
      after3hr: { systolic: 125, diastolic: 78, heartRate: 76 },
      endSession: { systolic: 128, diastolic: 79, heartRate: 72 },
    },
    temperatureC: 36.6,
    fluidStatus: {
      legEdema: 'mild',
      lungCrackles: 'none',
      dyspnea: 'none',
    },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2300,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
    notes: 'Smooth 4-hour hemodialysis treatment. Target dry weight achieved without intradialytic hypotension.',
  },
  {
    id: 'demo-session-2',
    patientId: 'patient-1',
    sessionDate: '2026-03-04',
    recordedBy: 'admin-1',
    recordedAt: '2026-03-04T13:45:00.000Z',
    complianceRating: 4,
    preWeightKg: 72,
    preWeightGrams: 100,
    postWeightKg: 70,
    postWeightGrams: 0,
    vitals: {
      preSession: { systolic: 142, diastolic: 88, heartRate: 76 },
      after1hr: { systolic: 138, diastolic: 84, heartRate: 74 },
      after2hr: { systolic: 132, diastolic: 80, heartRate: 72 },
      after3hr: { systolic: 126, diastolic: 78, heartRate: 78 },
      endSession: { systolic: 130, diastolic: 80, heartRate: 74 },
    },
    temperatureC: 36.7,
    fluidStatus: {
      legEdema: 'none',
      lungCrackles: 'none',
      dyspnea: 'none',
    },
    accessInfectionSigns: false,
    durationHours: 4,
    ultrafiltrationVolumeMl: 2100,
    bloodFlowRateMlMin: 350,
    dialysateFlowRateMlMin: 500,
    accessType: 'AVF',
    machineSodiumMeqL: 138,
    notes: 'Good dialysis session. Left radiocephalic AVF with strong thrill and good hemostasis post needle removal.',
  },
];

// Initial demo lab results for patient-1 covering all 12 tests
export const INITIAL_DEMO_LAB_RESULTS: PatientLabRecord[] = [
  {
    id: 'demo-lab-1',
    patientId: 'patient-1',
    testDate: '2026-02-28',
    recordedBy: 'admin-1',
    recordedAt: '2026-02-28T09:00:00.000Z',
    values: {
      hemoglobin: 11.2,
      wbc: 6.8,
      platelets: 245,
      calcium: 9.1,
      phosphorus: 4.8,
      pth: 210,
      creatinine: 8.9,
      urea: 78,
      serumIron: 85,
      tibc: 290,
      ferritin: 320,
      albumin: 4.1,
    },
    notes: 'Monthly routine renal panel. Hemoglobin and bone mineral markers within target range.',
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

export function initDataStore(): void {
  if (typeof window === 'undefined') {
    if (!memoryStorage.has(STORAGE_KEYS.PATIENTS)) {
      writeStorage(STORAGE_KEYS.PATIENTS, INITIAL_DEMO_PATIENTS);
    }
    return;
  }

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

  // Ensure patients in storage have dryWeightKg, gender, avatarId, and avatarStyle
  const rawStoredPatients = window.localStorage.getItem(STORAGE_KEYS.PATIENTS);
  if (rawStoredPatients) {
    try {
      const parsedPatients = JSON.parse(rawStoredPatients) as Patient[];
      let patientModified = false;
      const patchedPatients = parsedPatients.map((p) => {
        let changed = false;
        const item = { ...p };
        if (item.id === 'patient-1') {
          if (item.dryWeightKg === undefined || item.dryWeightKg === null) {
            item.dryWeightKg = 70;
            changed = true;
          }
          if (!item.gender) {
            item.gender = 'male';
            changed = true;
          }
          if (!item.avatarId) {
            item.avatarId = 'male_mature_1';
            changed = true;
          }
          if (!item.avatarStyle) {
            item.avatarStyle = 'classic';
            changed = true;
          }
          if (!item.dialysisSchedule || item.dialysisSchedule === 'MWF') {
            item.dialysisSchedule = 'SMW';
            changed = true;
          }
        } else if (item.id === 'patient-2') {
          if (item.dryWeightKg === undefined || item.dryWeightKg === null) {
            item.dryWeightKg = 65;
            changed = true;
          }
          if (!item.gender) {
            item.gender = 'female';
            changed = true;
          }
          if (!item.avatarId) {
            item.avatarId = 'female_mature_1';
            changed = true;
          }
          if (!item.avatarStyle) {
            item.avatarStyle = 'classic';
            changed = true;
          }
          if (!item.dialysisSchedule || item.dialysisSchedule === 'TTS') {
            item.dialysisSchedule = 'STT';
            changed = true;
          }
        } else {
          if (!item.avatarId) {
            item.avatarId = item.gender === 'female' ? 'female_mature_1' : 'male_mature_1';
            changed = true;
          }
          if (item.dialysisSchedule === 'MWF' || item.dialysisSchedule === 'Custom') {
            item.dialysisSchedule = 'SMW';
            changed = true;
          } else if (item.dialysisSchedule === 'TTS') {
            item.dialysisSchedule = 'STT';
            changed = true;
          }
        }
        if (changed) patientModified = true;
        return item;
      });
      if (patientModified) {
        writeStorage(STORAGE_KEYS.PATIENTS, patchedPatients);
      }
    } catch {
      // ignore
    }
  }

  // Demo medications
  if (!window.localStorage.getItem(STORAGE_KEYS.PATIENT_MEDICATIONS)) {
    writeStorage(STORAGE_KEYS.PATIENT_MEDICATIONS, INITIAL_DEMO_MEDICATIONS);
  }

  // Demo dialysis sessions
  if (!window.localStorage.getItem(STORAGE_KEYS.DIALYSIS_SESSIONS)) {
    writeStorage(STORAGE_KEYS.DIALYSIS_SESSIONS, INITIAL_DEMO_SESSIONS);
  }

  // Demo lab results
  if (!window.localStorage.getItem(STORAGE_KEYS.LAB_RESULTS)) {
    writeStorage(STORAGE_KEYS.LAB_RESULTS, INITIAL_DEMO_LAB_RESULTS);
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
  dispatchStorageEvent('dialycare_patient_updated');
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
  dispatchStorageEvent('dialycare_patient_updated');
  if (data.avatarId || data.avatarStyle) {
    dispatchStorageEvent('dialycare_avatar_updated');
  }
  return updated;
}

export function updatePatientAvatar(
  patientId: string,
  avatarId: string,
  avatarStyle?: string
): Patient | null {
  initDataStore();
  const patients = getPatients();
  const index = patients.findIndex((p) => p.id === patientId);
  if (index === -1) return null;

  const updated: Patient = {
    ...patients[index],
    avatarId,
    avatarStyle: avatarStyle || patients[index].avatarStyle || 'classic',
  };
  patients[index] = updated;
  writeStorage(STORAGE_KEYS.PATIENTS, patients);
  dispatchStorageEvent('dialycare_avatar_updated');
  dispatchStorageEvent('dialycare_patient_updated');
  return cloneValue(updated);
}

export function getPatientAvatar(patientId: string): string {
  initDataStore();
  const patients = getPatients();
  const patient = patients.find((p) => p.id === patientId);
  if (patient?.avatarId) {
    return patient.avatarId;
  }
  return patient?.gender === 'female' ? 'female_mature_1' : 'male_mature_1';
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
  const schedUpper = (patientSchedule || 'SMW').trim().toUpperCase();
  const isSTT = schedUpper === 'STT' || schedUpper === 'TTS' || schedUpper.includes('SUN') || schedUpper.includes('أحد');
  const isSMW = !isSTT;

  return notifications.filter((n) => {
    if (n.type === 'broadcast') return true;
    if (Array.isArray(n.recipientIds)) {
      if (n.recipientIds.includes(patientId)) return true;
      if (n.type === 'group') {
        const matches = n.recipientIds.some((s) => {
          const sUp = s.trim().toUpperCase();
          if (isSMW && (sUp === 'SMW' || sUp === 'MWF')) return true;
          if (isSTT && (sUp === 'STT' || sUp === 'TTS')) return true;
          return sUp === schedUpper;
        });
        if (matches) return true;
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

// ==========================================
// REACTIVE STORAGE EVENT DISPATCHER
// ==========================================
function dispatchStorageEvent(eventName: string): void {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event(eventName));
    } catch {
      // ignore in environments without DOM event dispatch
    }
  }
}

// ==========================================
// R1: PATIENT MEDICATIONS CRUD
// ==========================================
export type NewPatientMedication = Omit<PatientMedication, 'id' | 'createdAt' | 'isActive'> & {
  id?: string;
  createdAt?: Date | string;
  isActive?: boolean;
};

export function getPatientMedications(patientId?: string): PatientMedication[] {
  if (patientId === '') return [];
  initDataStore();
  let meds = readStorage<PatientMedication[]>(STORAGE_KEYS.PATIENT_MEDICATIONS, INITIAL_DEMO_MEDICATIONS);
  if (patientId) {
    meds = meds.filter((m) => m.patientId === patientId);
  }
  return cloneValue(meds);
}

export function addPatientMedication(
  med: NewPatientMedication | PatientMedication
): PatientMedication {
  initDataStore();
  const allMeds = readStorage<PatientMedication[]>(STORAGE_KEYS.PATIENT_MEDICATIONS, INITIAL_DEMO_MEDICATIONS);
  const newMed: PatientMedication = {
    ...med,
    id: ('id' in med && med.id) ? med.id : uuidv4(),
    createdAt: ('createdAt' in med && med.createdAt) ? med.createdAt : new Date().toISOString(),
    isActive: med.isActive !== undefined ? med.isActive : true,
  };
  allMeds.push(newMed);
  writeStorage(STORAGE_KEYS.PATIENT_MEDICATIONS, allMeds);
  dispatchStorageEvent('dialycare_medications_updated');
  return cloneValue(newMed);
}

export function updatePatientMedication(
  id: string,
  data: Partial<PatientMedication>
): PatientMedication | null {
  initDataStore();
  const allMeds = readStorage<PatientMedication[]>(STORAGE_KEYS.PATIENT_MEDICATIONS, INITIAL_DEMO_MEDICATIONS);
  const index = allMeds.findIndex((m) => m.id === id);
  if (index === -1) return null;
  const updated: PatientMedication = { ...allMeds[index], ...data };
  allMeds[index] = updated;
  writeStorage(STORAGE_KEYS.PATIENT_MEDICATIONS, allMeds);
  dispatchStorageEvent('dialycare_medications_updated');
  return cloneValue(updated);
}

export function deletePatientMedication(id: string): boolean {
  initDataStore();
  const allMeds = readStorage<PatientMedication[]>(STORAGE_KEYS.PATIENT_MEDICATIONS, INITIAL_DEMO_MEDICATIONS);
  const filtered = allMeds.filter((m) => m.id !== id);
  if (filtered.length === allMeds.length) return false;
  writeStorage(STORAGE_KEYS.PATIENT_MEDICATIONS, filtered);
  dispatchStorageEvent('dialycare_medications_updated');
  return true;
}

// ==========================================
// R2: DIALYSIS SESSIONS CRUD (14 CLINICAL FIELDS)
// ==========================================
export type NewDialysisSession = Omit<DialysisSession, 'id' | 'recordedAt'> & {
  id?: string;
  recordedAt?: string;
};

export function getDialysisSessions(patientId?: string): DialysisSession[] {
  if (patientId === '') return [];
  initDataStore();
  let sessions = readStorage<DialysisSession[]>(STORAGE_KEYS.DIALYSIS_SESSIONS, INITIAL_DEMO_SESSIONS);
  if (patientId) {
    sessions = sessions.filter((s) => s.patientId === patientId);
  }
  const sorted = [...sessions].sort((a, b) => {
    const dateA = new Date(a.sessionDate).getTime();
    const dateB = new Date(b.sessionDate).getTime();
    if (!isNaN(dateA) && !isNaN(dateB) && dateB !== dateA) {
      return dateB - dateA;
    }
    const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
    const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
    return timeB - timeA;
  });
  return cloneValue(sorted);
}

export function addDialysisSession(
  session: NewDialysisSession | DialysisSession
): DialysisSession {
  initDataStore();
  const allSessions = readStorage<DialysisSession[]>(STORAGE_KEYS.DIALYSIS_SESSIONS, INITIAL_DEMO_SESSIONS);
  const newSession: DialysisSession = {
    ...session,
    id: ('id' in session && session.id) ? session.id : uuidv4(),
    recordedAt: ('recordedAt' in session && session.recordedAt) ? session.recordedAt : new Date().toISOString(),
  };
  allSessions.unshift(newSession);
  writeStorage(STORAGE_KEYS.DIALYSIS_SESSIONS, allSessions);
  dispatchStorageEvent('dialycare_sessions_updated');
  return cloneValue(newSession);
}

export function updateDialysisSession(
  id: string,
  data: Partial<DialysisSession>
): DialysisSession | null {
  initDataStore();
  const allSessions = readStorage<DialysisSession[]>(STORAGE_KEYS.DIALYSIS_SESSIONS, INITIAL_DEMO_SESSIONS);
  const index = allSessions.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const updated: DialysisSession = { ...allSessions[index], ...data };
  allSessions[index] = updated;
  writeStorage(STORAGE_KEYS.DIALYSIS_SESSIONS, allSessions);
  dispatchStorageEvent('dialycare_sessions_updated');
  return cloneValue(updated);
}

export function deleteDialysisSession(id: string): boolean {
  initDataStore();
  const allSessions = readStorage<DialysisSession[]>(STORAGE_KEYS.DIALYSIS_SESSIONS, INITIAL_DEMO_SESSIONS);
  const filtered = allSessions.filter((s) => s.id !== id);
  if (filtered.length === allSessions.length) return false;
  writeStorage(STORAGE_KEYS.DIALYSIS_SESSIONS, filtered);
  dispatchStorageEvent('dialycare_sessions_updated');
  return true;
}

// ==========================================
// R5: PATIENT LAB RESULTS CRUD (12 TESTS)
// ==========================================
export type NewPatientLabRecord = Omit<PatientLabRecord, 'id' | 'recordedAt'> & {
  id?: string;
  recordedAt?: string;
};

export function getPatientLabResults(patientId?: string): PatientLabRecord[] {
  if (patientId === '') return [];
  initDataStore();
  let results = readStorage<PatientLabRecord[]>(STORAGE_KEYS.LAB_RESULTS, INITIAL_DEMO_LAB_RESULTS);
  if (patientId) {
    results = results.filter((r) => r.patientId === patientId);
  }
  const sorted = [...results].sort((a, b) => {
    const timeA = new Date(a.recordedAt || a.testDate).getTime();
    const timeB = new Date(b.recordedAt || b.testDate).getTime();
    return timeB - timeA;
  });
  return cloneValue(sorted);
}

export function addPatientLabResult(
  record: NewPatientLabRecord | PatientLabRecord
): PatientLabRecord {
  initDataStore();
  const allResults = readStorage<PatientLabRecord[]>(STORAGE_KEYS.LAB_RESULTS, INITIAL_DEMO_LAB_RESULTS);
  const newRecord: PatientLabRecord = {
    ...record,
    id: ('id' in record && record.id) ? record.id : uuidv4(),
    recordedAt: ('recordedAt' in record && record.recordedAt) ? record.recordedAt : new Date().toISOString(),
  };
  allResults.unshift(newRecord);
  writeStorage(STORAGE_KEYS.LAB_RESULTS, allResults);
  dispatchStorageEvent('dialycare_labs_updated');
  return cloneValue(newRecord);
}

export function updatePatientLabResult(
  id: string,
  data: Partial<PatientLabRecord>
): PatientLabRecord | null {
  initDataStore();
  const allResults = readStorage<PatientLabRecord[]>(STORAGE_KEYS.LAB_RESULTS, INITIAL_DEMO_LAB_RESULTS);
  const index = allResults.findIndex((r) => r.id === id);
  if (index === -1) return null;
  const updated: PatientLabRecord = { ...allResults[index], ...data };
  allResults[index] = updated;
  writeStorage(STORAGE_KEYS.LAB_RESULTS, allResults);
  dispatchStorageEvent('dialycare_labs_updated');
  return cloneValue(updated);
}

export function deletePatientLabResult(id: string): boolean {
  initDataStore();
  const allResults = readStorage<PatientLabRecord[]>(STORAGE_KEYS.LAB_RESULTS, INITIAL_DEMO_LAB_RESULTS);
  const filtered = allResults.filter((r) => r.id !== id);
  if (filtered.length === allResults.length) return false;
  writeStorage(STORAGE_KEYS.LAB_RESULTS, filtered);
  dispatchStorageEvent('dialycare_labs_updated');
  return true;
}

export function savePatientLabResults(
  record: NewPatientLabRecord | PatientLabRecord
): PatientLabRecord {
  if ('id' in record && record.id) {
    const updated = updatePatientLabResult(record.id, record);
    if (updated) return updated;
  }
  return addPatientLabResult(record);
}

// ==========================================
// R3: SMART FLUID LIMITS FROM DRY WEIGHT
// ==========================================
export interface PatientFluidLimits {
  warningMl: number;
  criticalMl: number;
  warning: number;
  critical: number;
}

export function getPatientFluidLimits(dryWeightKg: number): PatientFluidLimits {
  const safeWeight = typeof dryWeightKg === 'number' && dryWeightKg > 0 ? dryWeightKg : 70;
  // Warning: dry_weight * 10 * 4 / 2
  const warning = (safeWeight * 10 * 4) / 2;
  // Critical: dry_weight * 13 * 4 / 2
  const critical = (safeWeight * 13 * 4) / 2;
  return {
    warningMl: warning,
    criticalMl: critical,
    warning,
    critical,
  };
}
