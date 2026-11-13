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
  AdherenceSurveySubmission,
  PatientSurveyStatus,
  User,
  UserRole,
  GeneratedPatientCredentials,
  PatientRegistrationProfile,
  Language,
} from './types';
import { getCycleInfo } from './questionnaire-data';

import defaultCoachingTips from '@/data/coaching-tips.json';
import defaultReminderTemplates from '@/data/reminder-templates.json';
import defaultDietChecklist from '@/data/diet-checklist.json';

// Administrator contacts
export const ADMIN_CONFIG = {
  primaryPhone: '+201080641670', // Senior Resident contact (Primary Administrator)
  seniorResidentPhone: '+201080641670', // Senior Resident contact
  technicalAdminPhone: '+201552885823', // Technical administrator
};

/**
 * Resilient phone normalizer for Egyptian (+20) and canonical phone numbers.
 * Strips whitespace, hyphens, parentheses, and converts international prefix to national '01...'.
 */
export function normalizePhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0020') && digits.length === 14) {
    return '0' + digits.slice(4);
  }
  if (digits.startsWith('20') && digits.length === 12) {
    return '0' + digits.slice(2);
  }
  return digits;
}

/**
 * Checks whether two phone numbers match, handling country code variations and punctuation.
 */
export function isPhoneMatch(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  const n1 = normalizePhone(p1);
  const n2 = normalizePhone(p2);
  if (n1 && n2 && n1 === n2) return true;
  const d1 = p1.replace(/\D/g, '');
  const d2 = p2.replace(/\D/g, '');
  return Boolean(d1 && d2 && d1 === d2);
}

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
  ADHERENCE_SURVEYS: 'DIALYCARE_ADHERENCE_SURVEYS',
  AUTH_ACCOUNTS: 'DIALYCARE_AUTH_ACCOUNTS',
  ADMIN_CREDENTIALS: 'DIALYCARE_ADMIN_CREDENTIALS',
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
    titleEn: 'Welcome to Waslity! 🌟',
    titleAr: 'مرحباً بكم في وَصْلِتي! 🌟',
    messageEn: 'Welcome to Waslity! Keep tracking your daily fluid, diet, and medications to achieve optimal hemodialysis health.',
    messageAr: 'أهلاً بكم في وَصْلِتي! احرصوا على تسجيل السوائل والغذاء والأدوية يومياً لتحقيق أفضل نتائج علاجية.',
    sentAt: '2026-01-01T00:00:00.000Z',
    status: 'sent',
  },
  {
    id: 'notif_welcome_patient1',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-1'],
    titleEn: 'Welcome to Waslity - Clinical Care Team',
    titleAr: 'مرحباً بك في وَصْلِتي - الفريق الطبي',
    messageEn: 'Hello Ahmed, welcome to Waslity. Your nephrology care team will send you direct alerts, session reminders, and guidance here.',
    messageAr: 'أهلاً بك يا أحمد في وَصْلِتي. سيرسل لك فريق الكلى المعالج تنبيهات الجلسات والإرشادات الطبية المباشرة هنا.',
    sentAt: '2026-01-01T01:00:00.000Z',
    status: 'sent',
  },
  {
    id: 'notif_welcome_patient2',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-2'],
    titleEn: 'Welcome to Waslity - Clinical Care Team',
    titleAr: 'مرحباً بك في وَصْلِتي - الفريق الطبي',
    messageEn: 'Hello Fatima, welcome to Waslity. Your care team is here to support your dialysis treatment plan.',
    messageAr: 'أهلاً بك يا فاطمة في وَصْلِتي. فريقك الطبي هنا لدعم خطة علاجك وجلسات الغسيل الكلوي.',
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

  // Treatment Adherence Surveys
  if (!window.localStorage.getItem(STORAGE_KEYS.ADHERENCE_SURVEYS)) {
    writeStorage(STORAGE_KEYS.ADHERENCE_SURVEYS, []);
  }

  // Dynamic Admin credentials
  if (!window.localStorage.getItem(STORAGE_KEYS.ADMIN_CREDENTIALS)) {
    writeStorage(STORAGE_KEYS.ADMIN_CREDENTIALS, 'admin123');
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

// ==========================================
// R7: DIALYSIS TREATMENT ADHERENCE SURVEY STORE
// ==========================================

export function getDoctorSurveyActivationKey(patientId: string): string {
  return `DIALYCARE_SURVEY_ACTIVATION_${patientId}`;
}

export function isDoctorSurveyActivated(patientId: string): boolean {
  const key = getDoctorSurveyActivationKey(patientId);
  if (typeof window === 'undefined') {
    return memoryStorage.get(key) === 'true';
  }
  return window.localStorage.getItem(key) === 'true';
}

export function setDoctorSurveyActivation(patientId: string, activate: boolean): void {
  const key = getDoctorSurveyActivationKey(patientId);
  if (activate) {
    if (typeof window === 'undefined') {
      memoryStorage.set(key, 'true');
    } else {
      window.localStorage.setItem(key, 'true');
    }
  } else {
    if (typeof window === 'undefined') {
      memoryStorage.delete(key);
    } else {
      window.localStorage.removeItem(key);
    }
  }
  dispatchStorageEvent('dialycare_questionnaires_updated');
  dispatchStorageEvent('dialycare_survey_updated');
  dispatchStorageEvent('storage');
}

export function getAdherenceSurveys(patientId?: string): AdherenceSurveySubmission[] {
  initDataStore();
  let surveys = readStorage<AdherenceSurveySubmission[]>(STORAGE_KEYS.ADHERENCE_SURVEYS, []);
  if (patientId) {
    surveys = surveys.filter((s) => s.patientId === patientId);
  }
  const sorted = [...surveys].sort((a, b) => {
    const timeA = new Date(a.submittedAt).getTime();
    const timeB = new Date(b.submittedAt).getTime();
    return timeB - timeA;
  });
  return cloneValue(sorted);
}

export type NewAdherenceSurveySubmission = Omit<AdherenceSurveySubmission, 'id' | 'submittedAt'> & {
  id?: string;
  submittedAt?: string;
};

export function saveAdherenceSurvey(
  submission: NewAdherenceSurveySubmission
): AdherenceSurveySubmission {
  initDataStore();
  const allSurveys = readStorage<AdherenceSurveySubmission[]>(STORAGE_KEYS.ADHERENCE_SURVEYS, []);

  const newSubmission: AdherenceSurveySubmission = {
    ...submission,
    id: ('id' in submission && submission.id) ? submission.id : uuidv4(),
    submittedAt: ('submittedAt' in submission && submission.submittedAt) ? submission.submittedAt : new Date().toISOString(),
  };

  allSurveys.unshift(newSubmission);
  writeStorage(STORAGE_KEYS.ADHERENCE_SURVEYS, allSurveys);

  // Clear manual doctor activation for this patient
  setDoctorSurveyActivation(submission.patientId, false);

  dispatchStorageEvent('dialycare_questionnaires_updated');
  dispatchStorageEvent('dialycare_survey_updated');
  dispatchStorageEvent('storage');

  return cloneValue(newSubmission);
}

export function getPatientSurveyStatus(
  patientId: string,
  customNow?: Date | string
): PatientSurveyStatus {
  initDataStore();
  const doctorActivated = isDoctorSurveyActivated(patientId);
  const patientSubmissions = getAdherenceSurveys(patientId);
  const totalSubmissions = patientSubmissions.length;
  const lastSub = patientSubmissions[0];
  const lastSubmissionDate = lastSub ? lastSub.submittedAt : undefined;

  const nowDate = customNow ? new Date(customNow) : new Date();

  // 1. Check if doctor manually activated survey
  if (doctorActivated) {
    const nextCycleNum = totalSubmissions + 1;
    const cycleInfo = getCycleInfo(nextCycleNum);
    return {
      isDue: true,
      reason: 'doctor_activated',
      currentCycleNumber: nextCycleNum,
      cycleLabelAr: cycleInfo.cycleLabelAr,
      cycleLabelEn: cycleInfo.cycleLabelEn,
      lastSubmissionDate,
      nextDueDate: nowDate.toISOString().slice(0, 10),
      daysUntilDue: 0,
      isManuallyActivatedByDoctor: true,
      totalSubmissions,
    };
  }

  // 2. Check if initial baseline (0 submissions)
  if (totalSubmissions === 0) {
    const cycleInfo = getCycleInfo(1);
    return {
      isDue: true,
      reason: 'initial',
      currentCycleNumber: 1,
      cycleLabelAr: cycleInfo.cycleLabelAr,
      cycleLabelEn: cycleInfo.cycleLabelEn,
      lastSubmissionDate: undefined,
      nextDueDate: nowDate.toISOString().slice(0, 10),
      daysUntilDue: 0,
      isManuallyActivatedByDoctor: false,
      totalSubmissions: 0,
    };
  }

  // 3. Has existing submissions -> check 30-day interval
  const lastDate = new Date(lastSub.submittedAt);
  const nextDueMs = lastDate.getTime() + 30 * 24 * 60 * 60 * 1000;
  const nextDueDateObj = new Date(nextDueMs);
  const nextDueDate = nextDueDateObj.toISOString();

  const diffMs = nextDueMs - nowDate.getTime();
  const daysUntilDueRaw = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (daysUntilDueRaw <= 0) {
    // >= 30 days elapsed -> monthly cycle is due
    const nextCycleNum = totalSubmissions + 1;
    const cycleInfo = getCycleInfo(nextCycleNum);
    return {
      isDue: true,
      reason: 'monthly_due',
      currentCycleNumber: nextCycleNum,
      cycleLabelAr: cycleInfo.cycleLabelAr,
      cycleLabelEn: cycleInfo.cycleLabelEn,
      lastSubmissionDate,
      nextDueDate,
      daysUntilDue: 0,
      isManuallyActivatedByDoctor: false,
      totalSubmissions,
    };
  } else {
    // Within 30 days -> survey completed
    const cycleInfo = getCycleInfo(lastSub.cycleNumber || totalSubmissions);
    return {
      isDue: false,
      reason: 'completed',
      currentCycleNumber: lastSub.cycleNumber || totalSubmissions,
      cycleLabelAr: lastSub.cycleLabelAr || cycleInfo.cycleLabelAr,
      cycleLabelEn: lastSub.cycleLabelEn || cycleInfo.cycleLabelEn,
      lastSubmissionDate,
      nextDueDate,
      daysUntilDue: daysUntilDueRaw,
      isManuallyActivatedByDoctor: false,
      totalSubmissions,
    };
  }
}

export function sendSurveyReminderNotification(
  patientId: string,
  doctorName?: string
): Notification {
  initDataStore();
  const notif: Notification = {
    id: uuidv4(),
    senderId: 'doctor',
    type: 'individual',
    recipientIds: [patientId],
    titleAr: 'تذكير: استبيان الالتزام بالعلاج لمرضى الغسيل الكلوي 📋',
    titleEn: 'Reminder: Dialysis Treatment Adherence Questionnaire 📋',
    messageAr: `يرجى التكرم بملء استبيان الالتزام بالعلاج المتاح الآن في صفحة ملفك الشخصي لدعم خطتك العلاجية.${doctorName ? ` (مرسل من: ${doctorName})` : ''}`,
    messageEn: `Please complete your treatment adherence questionnaire available in your patient profile to support your dialysis care plan.${doctorName ? ` (Sent by: ${doctorName})` : ''}`,
    sentAt: new Date().toISOString(),
    status: 'sent',
  };

  return addNotification(notif);
}

// ==========================================
// R8: AUTHENTICATION, APPROVALS & CREDENTIAL GENERATOR
// ==========================================

export interface StoredAccount {
  username: string;
  phone?: string;
  password: string;
  user: User;
}

export const DEFAULT_ADMIN_USER: User = {
  uid: 'admin-1',
  role: 'admin',
  username: 'admin',
  displayName: 'Dr. System Administrator',
  language: 'en',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_PATIENT_USER: User = {
  uid: 'patient-1',
  role: 'patient',
  username: 'patient1',
  displayName: 'Ahmed Mahmoud (أحمد محمود)',
  phone: '01012345678',
  language: 'ar',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_PATIENT2_USER: User = {
  uid: 'patient-2',
  role: 'patient',
  username: 'patient2',
  displayName: 'Fatima El-Sayed (فاطمة السيد)',
  phone: '01098765432',
  language: 'ar',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Auto-generates patient credentials:
 * - Username: Patient phone number
 * - Password: Phone number + 3 distinct random letters without overlap (safe alphabet)
 */
export function generatePatientCredentials(phone: string): GeneratedPatientCredentials {
  const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '').trim() || '01000000000';
  
  // Safe character set excluding visually confusing glyphs (0, O, 1, l, I)
  const safeLetters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const pickedLetters: string[] = [];
  
  while (pickedLetters.length < 3) {
    const randomIndex = Math.floor(Math.random() * safeLetters.length);
    const char = safeLetters[randomIndex];
    if (!pickedLetters.includes(char)) {
      pickedLetters.push(char);
    }
  }
  
  const suffix = pickedLetters.join('');
  const password = `${cleanPhone}${suffix}`;
  
  return {
    username: cleanPhone,
    password,
    phone: cleanPhone,
    randomSuffix: suffix,
  };
}

export function getAdminPassword(): string {
  initDataStore();
  return readStorage<string>(STORAGE_KEYS.ADMIN_CREDENTIALS, 'admin123');
}

export function setAdminPassword(newPassword: string): boolean {
  initDataStore();
  const trimmed = newPassword.trim();
  if (trimmed.length < 6) return false;
  writeStorage(STORAGE_KEYS.ADMIN_CREDENTIALS, trimmed);
  dispatchStorageEvent('storage');
  return true;
}

export function getAuthAccounts(): StoredAccount[] {
  initDataStore();
  const stored = readStorage<StoredAccount[]>(STORAGE_KEYS.AUTH_ACCOUNTS, []);
  if (!stored || stored.length === 0) {
    const initialAccounts: StoredAccount[] = [
      { username: 'admin', password: getAdminPassword(), user: DEFAULT_ADMIN_USER },
      { username: 'patient1', phone: '01012345678', password: 'patient123', user: DEFAULT_PATIENT_USER },
      { username: 'patient2', phone: '01098765432', password: 'patient123', user: DEFAULT_PATIENT2_USER },
    ];
    writeStorage(STORAGE_KEYS.AUTH_ACCOUNTS, initialAccounts);
    return initialAccounts;
  }

  // Ensure Admin password and status are always up to date and active!
  const currentAdminPass = getAdminPassword();
  let mutated = false;
  for (const acc of stored) {
    if (acc.username.toLowerCase() === 'admin' || acc.user.role === 'admin') {
      if (acc.password !== currentAdminPass) {
        acc.password = currentAdminPass;
        mutated = true;
      }
      if (acc.user.status !== 'active') {
        acc.user.status = 'active';
        mutated = true;
      }
      if (acc.user.role !== 'admin') {
        acc.user.role = 'admin';
        mutated = true;
      }
    } else if (acc.user.status === undefined) {
      acc.user.status = 'active';
      mutated = true;
    }
  }

  // Ensure DEFAULT_ADMIN_USER is in the list if somehow missing
  const hasAdmin = stored.some((a) => a.username.toLowerCase() === 'admin' || a.user.role === 'admin');
  if (!hasAdmin) {
    stored.unshift({ username: 'admin', password: currentAdminPass, user: DEFAULT_ADMIN_USER });
    mutated = true;
  }

  if (mutated) {
    writeStorage(STORAGE_KEYS.AUTH_ACCOUNTS, stored);
  }

  return stored;
}

export function saveAuthAccounts(accounts: StoredAccount[]): void {
  initDataStore();
  writeStorage(STORAGE_KEYS.AUTH_ACCOUNTS, accounts);
  dispatchStorageEvent('dialycare_users_updated');
  dispatchStorageEvent('dialycare_approvals_updated');
  dispatchStorageEvent('storage');
}

let isSyncingCloud = false;

/**
 * Synchronize accounts from the cloud API (Vercel Blob / Next.js backend)
 * Merges cloud registrations into local cache so they are visible across devices.
 * Uses a re-entrancy lock and silent write to prevent recursive event storms.
 */
export async function syncCloudAccounts(): Promise<StoredAccount[]> {
  if (typeof window === 'undefined') return getAuthAccounts();
  if (isSyncingCloud) return getAuthAccounts();
  isSyncingCloud = true;

  try {
    const localAccounts = getAuthAccounts();

    // Bidirectional sync: Push local accounts to cloud store so in-clinic created patients
    // on doctors' devices are automatically merged with the server database.
    let res: Response;
    try {
      res = await fetch(`/api/auth/accounts?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: localAccounts }),
        cache: 'no-store',
      });
    } catch {
      // Fallback to GET if POST is blocked or fails
      res = await fetch(`/api/auth/accounts?t=${Date.now()}`, { cache: 'no-store' });
    }

    if (!res.ok) return getAuthAccounts();
    const data = await res.json();
    if (!data.success || !Array.isArray(data.accounts)) return getAuthAccounts();

    const remoteAccounts: StoredAccount[] = data.accounts;

    const isMatch = (a: StoredAccount, b: StoredAccount) => {
      if (a.user.uid && b.user.uid && a.user.uid === b.user.uid) return true;
      if (a.username && b.username && a.username.trim().toLowerCase() === b.username.trim().toLowerCase()) return true;
      const cleanPhoneA = (a.phone || a.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
      const cleanPhoneB = (b.phone || b.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
      if (cleanPhoneA && cleanPhoneB && cleanPhoneA === cleanPhoneB) return true;
      return false;
    };

    const result = [...localAccounts];
    let hasChanges = false;

    for (const rem of remoteAccounts) {
      const idx = result.findIndex((loc) => isMatch(loc, rem));
      if (idx === -1) {
        result.push(rem);
        hasChanges = true;
      } else {
        const loc = result[idx];
        const remTime = new Date(rem.user.reviewedAt || rem.user.registeredAt || 0).getTime();
        const locTime = new Date(loc.user.reviewedAt || loc.user.registeredAt || 0).getTime();
        // If status differs (especially pending -> active), or cloud has review or newer timestamp:
        if (
          rem.user.status !== loc.user.status ||
          remTime > locTime ||
          (rem.user.status === 'active' && loc.user.status === 'pending') ||
          (!loc.user.patientProfile && rem.user.patientProfile)
        ) {
          result[idx] = {
            ...loc,
            ...rem,
            user: {
              ...loc.user,
              ...rem.user,
              patientProfile: rem.user.patientProfile || loc.user.patientProfile,
            },
          };
          hasChanges = true;
        }
      }
    }

    // Deduplicate array so multiple accounts for the same phone/username never coexist:
    const deduplicated: StoredAccount[] = [];
    for (const item of result) {
      const existingIdx = deduplicated.findIndex((d) => isMatch(d, item));
      if (existingIdx === -1) {
        deduplicated.push(item);
      } else {
        // If current item is active and existing is not, replace it with the active one!
        if (item.user.status === 'active' && deduplicated[existingIdx].user.status !== 'active') {
          deduplicated[existingIdx] = item;
          hasChanges = true;
        }
      }
    }

    if (hasChanges || deduplicated.length !== localAccounts.length) {
      initDataStore();
      writeStorage(STORAGE_KEYS.AUTH_ACCOUNTS, deduplicated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dialycare_users_updated'));
      }
    }

    // Synchronize all active patient accounts into the official DIALYCARE_PATIENTS registry
    const currentPatients = getPatients();
    let patientsAdded = false;

    for (const acc of deduplicated) {
      if (acc.user.role === 'patient' && (acc.user.status === 'active' || !acc.user.status)) {
        const cleanAccPhone = (acc.phone || acc.user.phone || '').replace(/[\s\-\(\)\+]/g, '');
        const exists = currentPatients.some((p) => {
          if (p.id === acc.user.uid) return true;
          if (acc.username && p.username && p.username.toLowerCase() === acc.username.toLowerCase()) return true;
          const cleanPPhone = (p.phone || '').replace(/[\s\-\(\)\+]/g, '');
          if (cleanAccPhone && cleanPPhone && cleanAccPhone === cleanPPhone) return true;
          return false;
        });

        if (!exists) {
          const profile = acc.user.patientProfile;
          const newPat: Patient = {
            id: acc.user.uid,
            fullName: acc.user.displayName,
            fullNameAr: acc.user.displayName,
            phone: acc.phone || acc.user.phone || acc.username,
            username: acc.username,
            dialysisSchedule: profile?.dialysisSchedule || 'SMW',
            dryWeightKg: profile?.dryWeightKg || 70,
            accessType: profile?.accessType || 'AVF',
            dialysisCenter: profile?.dialysisCenter,
            centerName: profile?.dialysisCenter,
            age: profile?.age,
            reminderSchedule: 'standard',
            isActive: true,
            gender: profile?.gender || 'male',
            avatarId: profile?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
            viralMarkers: profile?.viralMarkers,
            emergencyContact: profile?.emergencyContact,
            createdAt: acc.user.registeredAt || acc.user.createdAt || new Date().toISOString(),
          };
          currentPatients.push(newPat);
          patientsAdded = true;
        }
      }
    }

    if (patientsAdded) {
      writeStorage(STORAGE_KEYS.PATIENTS, currentPatients);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dialycare_patient_updated'));
      }
    }

    return deduplicated;
  } catch (err) {
    console.warn('[DataStore] Failed to sync accounts from cloud:', err);
    return getAuthAccounts();
  } finally {
    isSyncingCloud = false;
  }
}

export function getPendingApprovals(): User[] {
  const accounts = getAuthAccounts();
  const pendingUsers = accounts
    .map((acc) => acc.user)
    .filter((u) => u.status === 'pending' && u.role !== 'patient');

  return [...pendingUsers].sort((a, b) => {
    const timeA = new Date(a.registeredAt || a.createdAt).getTime();
    const timeB = new Date(b.registeredAt || b.createdAt).getTime();
    return timeB - timeA;
  });
}

export function approveUserRegistration(uid: string, reviewerName: string = 'Super Admin'): User | null {
  const accounts = getAuthAccounts();
  const targetAcc = accounts.find((a) => a.user.uid === uid);
  if (!targetAcc) return null;

  targetAcc.user.status = 'active';
  targetAcc.user.reviewedAt = new Date().toISOString();
  targetAcc.user.reviewedBy = reviewerName;

  // If patient, auto-enroll into official Patient registry
  if (targetAcc.user.role === 'patient') {
    const profile = targetAcc.user.patientProfile;
    const existingPatient = getPatients().find((p) => p.id === uid);
    if (!existingPatient) {
      const newPatient: Patient = {
        id: uid,
        fullName: targetAcc.user.displayName,
        fullNameAr: targetAcc.user.displayName,
        phone: targetAcc.user.phone || targetAcc.username,
        username: targetAcc.username,
        dialysisSchedule: profile?.dialysisSchedule || 'SMW',
        dryWeightKg: profile?.dryWeightKg || 70,
        accessType: profile?.accessType || 'AVF',
        dialysisCenter: profile?.dialysisCenter,
        centerName: profile?.dialysisCenter,
        age: profile?.age,
        reminderSchedule: 'standard',
        isActive: true,
        gender: profile?.gender || 'male',
        avatarId: profile?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
        viralMarkers: profile?.viralMarkers,
        emergencyContact: profile?.emergencyContact,
        createdAt: targetAcc.user.registeredAt || new Date().toISOString(),
      };
      addPatient(newPatient);
    }
  }

  saveAuthAccounts(accounts);

  // Background push to cloud store
  if (typeof window !== 'undefined') {
    fetch('/api/auth/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, reviewerName }),
    }).catch((err) => console.warn('[DataStore] Background cloud approve push failed:', err));
  }

  return cloneValue(targetAcc.user);
}

export function rejectUserRegistration(uid: string, reason: string, reviewerName: string = 'Super Admin'): User | null {
  const accounts = getAuthAccounts();
  const targetAcc = accounts.find((a) => a.user.uid === uid);
  if (!targetAcc) return null;

  targetAcc.user.status = 'rejected';
  targetAcc.user.rejectionReason = reason;
  targetAcc.user.reviewedAt = new Date().toISOString();
  targetAcc.user.reviewedBy = reviewerName;

  saveAuthAccounts(accounts);

  // Background push to cloud store
  if (typeof window !== 'undefined') {
    fetch('/api/auth/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, reason, reviewerName }),
    }).catch((err) => console.warn('[DataStore] Background cloud reject push failed:', err));
  }

  return cloneValue(targetAcc.user);
}

export function registerStaffAccount(data: {
  fullName: string;
  phone: string;
  email?: string;
  username: string;
  password: string;
  role?: 'doctor' | 'nurse' | 'staff';
  specialty?: string;
  hospital?: string;
  idCardDataUrl?: string;
  language?: Language;
}): User {
  const accounts = getAuthAccounts();
  const cleanUsername = data.username.trim();
  const cleanPhone = data.phone.trim();
  const uid = uuidv4();
  const now = new Date().toISOString();
  const role: UserRole = data.role || 'doctor';

  const defaultSpecialty =
    role === 'nurse'
      ? (data.language === 'en' ? 'Hemodialysis Registered Nurse' : 'تمريض غسيل كلوي متخصص')
      : role === 'staff'
      ? (data.language === 'en' ? 'Hemodialysis Unit Administrator' : 'إدارة وحدة الغسيل الكلوي')
      : (data.language === 'en' ? 'Nephrologist / Dialysis Physician' : 'طبيب أمراض كلى وغسيل كلوي');

  const newUser: User = {
    uid,
    role,
    status: 'pending',
    username: cleanUsername,
    phone: cleanPhone,
    email: data.email?.trim(),
    displayName: data.fullName.trim(),
    specialty: data.specialty?.trim() || defaultSpecialty,
    hospital: data.hospital?.trim() || 'وحدة الغسيل الكلوي',
    idCardDataUrl: data.idCardDataUrl,
    language: data.language || 'ar',
    registeredAt: now,
    createdAt: now,
  };

  const filtered = accounts.filter(
    (a) => a.username.toLowerCase() !== cleanUsername.toLowerCase() && a.phone !== cleanPhone
  );

  filtered.push({
    username: cleanUsername,
    phone: cleanPhone,
    password: data.password,
    user: newUser,
  });

  saveAuthAccounts(filtered);

  // Background push to cloud store so it immediately syncs across all devices!
  if (typeof window !== 'undefined') {
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: role, role, data: { ...data, uid, role } }),
    }).catch((err) => console.warn('[DataStore] Background cloud registration push failed:', err));
  }

  return cloneValue(newUser);
}

export function registerDoctorAccount(data: Parameters<typeof registerStaffAccount>[0]): User {
  return registerStaffAccount({ ...data, role: data.role || 'doctor' });
}

export function registerPatientAccount(data: {
  fullName: string;
  phone: string;
  password: string;
  profile: PatientRegistrationProfile;
  language?: Language;
}): User {
  const accounts = getAuthAccounts();
  const cleanPhone = data.phone.replace(/[\s\-\(\)\+]/g, '').trim();
  const uid = uuidv4();
  const now = new Date().toISOString();

  const newUser: User = {
    uid,
    role: 'patient',
    status: 'active', // Patients are immediately active and pre-approved!
    username: cleanPhone,
    phone: cleanPhone,
    displayName: data.fullName.trim(),
    language: data.language || 'ar',
    patientProfile: data.profile,
    registeredAt: now,
    createdAt: now,
  };

  // Auto-enroll directly into official Patient registry (DIALYCARE_PATIENTS)
  const existingPatients = getPatients();
  if (!existingPatients.some((p) => p.id === uid)) {
    const newPatient: Patient = {
      id: uid,
      fullName: data.fullName.trim(),
      fullNameAr: data.fullName.trim(),
      phone: cleanPhone,
      username: cleanPhone,
      dialysisSchedule: data.profile.dialysisSchedule || 'SMW',
      dryWeightKg: data.profile.dryWeightKg || 70,
      accessType: data.profile.accessType || 'AVF',
      reminderSchedule: 'standard',
      isActive: true,
      gender: data.profile.gender || 'male',
      avatarId: data.profile.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
      viralMarkers: data.profile.viralMarkers,
      emergencyContact: data.profile.emergencyContact,
      createdAt: now,
    };
    addPatient(newPatient);
  }

  const filtered = accounts.filter(
    (a) => a.username.toLowerCase() !== cleanPhone.toLowerCase() && a.phone !== cleanPhone
  );

  filtered.push({
    username: cleanPhone,
    phone: cleanPhone,
    password: data.password,
    user: newUser,
  });

  saveAuthAccounts(filtered);

  // Background push to cloud store so it immediately syncs across all devices!
  if (typeof window !== 'undefined') {
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'patient', data: { ...data, uid } }),
    }).catch((err) => console.warn('[DataStore] Background cloud registration push failed:', err));
  }

  return cloneValue(newUser);
}


