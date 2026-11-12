import {
  getPatients as dsGetPatients,
  addPatient as dsAddPatient,
  updatePatient as dsUpdatePatient,
  deletePatient as dsDeletePatient,
  getAdherenceLogs as dsGetAdherenceLogs,
  addAdherenceLog as dsAddAdherenceLog,
  getFluidLogs as dsGetFluidLogs,
  addFluidLog as dsAddFluidLog,
  getDietLogs as dsGetDietLogs,
  addDietLog as dsAddDietLog,
  getCoachingTips as dsGetCoachingTips,
  addCoachingTip as dsAddCoachingTip,
  updateCoachingTip as dsUpdateCoachingTip,
  deleteCoachingTip as dsDeleteCoachingTip,
  getNotifications as dsGetNotifications,
  getPatientNotifications as dsGetPatientNotifications,
  addNotification as dsAddNotification,
  getReminders as dsGetReminders,
  addReminder as dsAddReminder,
  updateReminder as dsUpdateReminder,
  deleteReminder as dsDeleteReminder,
  getReminderTemplates as dsGetReminderTemplates,
  updateReminderTemplate as dsUpdateReminderTemplate,
  getAdherenceSurveys as dsGetAdherenceSurveys,
  saveAdherenceSurvey as dsSaveAdherenceSurvey,
  getPatientSurveyStatus as dsGetPatientSurveyStatus,
  setDoctorSurveyActivation as dsSetDoctorSurveyActivation,
  sendSurveyReminderNotification as dsSendSurveyReminderNotification,
  initDataStore,
  STORAGE_KEYS,
} from '@/lib/data-store';

export const getAdherenceSurveys = dsGetAdherenceSurveys;
export const saveAdherenceSurvey = dsSaveAdherenceSurvey;
export const getPatientSurveyStatus = dsGetPatientSurveyStatus;
export const setDoctorSurveyActivation = dsSetDoctorSurveyActivation;
export const sendSurveyReminderNotification = dsSendSurveyReminderNotification;
import type {
  AdherenceLog,
} from '@/lib/types';

export interface AdminSettings {
  adherenceThreshold: number;
  defaultTimes: {
    tttMorning: string;
    tttAfternoon: string;
    tttEvening: string;
    fluidMorning: string;
    fluidAfternoon: string;
    fluidEvening: string;
    dietBreakfast: string;
    dietLunch: string;
    dietDinner: string;
  };
}

const SETTINGS_KEY = 'DIALYCARE_ADMIN_SETTINGS';

const DEFAULT_SETTINGS: AdminSettings = {
  adherenceThreshold: 70,
  defaultTimes: {
    tttMorning: '08:00',
    tttAfternoon: '14:00',
    tttEvening: '20:00',
    fluidMorning: '10:00',
    fluidAfternoon: '15:00',
    fluidEvening: '20:00',
    dietBreakfast: '09:00',
    dietLunch: '13:00',
    dietDinner: '19:00',
  },
};

export function getAdminSettings(): AdminSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Synchronize the 9 baseline reminder templates in data-store with the configured default times
 */
export function syncReminderTemplatesWithDefaultTimes(
  defaultTimes: AdminSettings['defaultTimes']
): void {
  const mapping: Record<string, string> = {
    tpl_ttt_morning: defaultTimes.tttMorning,
    tpl_ttt_afternoon: defaultTimes.tttAfternoon,
    tpl_ttt_evening: defaultTimes.tttEvening,
    tpl_fluid_morning: defaultTimes.fluidMorning,
    tpl_fluid_afternoon: defaultTimes.fluidAfternoon,
    tpl_fluid_evening: defaultTimes.fluidEvening,
    tpl_diet_breakfast: defaultTimes.dietBreakfast,
    tpl_diet_lunch: defaultTimes.dietLunch,
    tpl_diet_dinner: defaultTimes.dietDinner,
  };

  Object.entries(mapping).forEach(([id, time]) => {
    if (time) {
      dsUpdateReminderTemplate(id, { defaultTime: time });
    }
  });
}

export function saveAdminSettings(settings: AdminSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    syncReminderTemplatesWithDefaultTimes(settings.defaultTimes);
  } catch (error) {
    console.error('Failed to save admin settings:', error);
  }
}

// Re-exports from data-store
export const getPatients = dsGetPatients;
export const addPatient = dsAddPatient;
export const updatePatient = dsUpdatePatient;
export const deletePatient = dsDeletePatient;
export const getAdherenceLogs = dsGetAdherenceLogs;
export const addAdherenceLog = dsAddAdherenceLog;
export const getFluidLogs = dsGetFluidLogs;
export const addFluidLog = dsAddFluidLog;
export const getDietLogs = dsGetDietLogs;
export const addDietLog = dsAddDietLog;
export const getCoachingTips = dsGetCoachingTips;
export const addCoachingTip = dsAddCoachingTip;
export const updateCoachingTip = dsUpdateCoachingTip;
export const deleteCoachingTip = dsDeleteCoachingTip;
export const getNotifications = dsGetNotifications;
export const getPatientNotifications = dsGetPatientNotifications;
export const addNotification = dsAddNotification;
export const getReminders = dsGetReminders;
export const addReminder = dsAddReminder;
export const updateReminder = dsUpdateReminder;
export const deleteReminder = dsDeleteReminder;
export const getReminderTemplates = dsGetReminderTemplates;
export const updateReminderTemplate = dsUpdateReminderTemplate;

/**
 * Resolve username for a patient from DIALYCARE_AUTH_ACCOUNTS, patient record, or demo map
 */
export function getPatientUsername(patientId: string): string {
  if (typeof window === 'undefined') return patientId;
  try {
    if (patientId === 'patient-1') return 'patient1';
    if (patientId === 'patient-2') return 'patient2';

    const raw = window.localStorage.getItem('DIALYCARE_AUTH_ACCOUNTS');
    if (raw) {
      const accounts = JSON.parse(raw) as Array<{ username: string; user?: { uid?: string } }>;
      const matched = accounts.find((a) => a.user?.uid === patientId);
      if (matched && matched.username) return matched.username;
    }

    const patients = dsGetPatients();
    const p = patients.find((x) => x.id === patientId);
    if (p && (p as unknown as { username?: string }).username) {
      return (p as unknown as { username?: string }).username!;
    }
    return patientId;
  } catch {
    return patientId;
  }
}

/**
 * Check if a username is already occupied by admin, demo patients, or stored accounts
 */
export function isUsernameTaken(username: string): boolean {
  const clean = username.trim().toLowerCase();
  if (!clean) return false;
  if (clean === 'admin' || clean === 'patient1' || clean === 'patient2') return true;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('DIALYCARE_AUTH_ACCOUNTS');
      if (raw) {
        const accounts = JSON.parse(raw) as Array<{ username: string }>;
        if (accounts.some((a) => a.username.trim().toLowerCase() === clean)) {
          return true;
        }
      }
      const patients = dsGetPatients();
      if (
        patients.some(
          (p) =>
            (p as unknown as { username?: string }).username?.trim().toLowerCase() === clean
        )
      ) {
        return true;
      }
    } catch {
      // fallback
    }
  }
  return false;
}

export interface PatientMetrics {
  tttAdherence: number;
  fluidAdherence: number;
  dietAdherence: number;
  overallAdherence: number;
  lastActive: string;
}

// Calculate realistic adherence stats for a patient
export function getPatientMetrics(patientId: string): PatientMetrics {
  const logs = dsGetAdherenceLogs(patientId);

  if (logs.length > 0) {
    const tttLogs = logs.filter((l) => l.type === 'ttt');
    const fluidLogs = logs.filter((l) => l.type === 'fluid');
    const dietLogs = logs.filter((l) => l.type === 'diet');

    const calcRate = (arr: AdherenceLog[]) => {
      if (arr.length === 0) return 75;
      const completed = arr.filter((l) => l.status === 'done').length;
      return Math.round((completed / arr.length) * 100);
    };

    const tttRate = calcRate(tttLogs);
    const fluidRate = calcRate(fluidLogs);
    const dietRate = calcRate(dietLogs);
    const overall = Math.round((tttRate + fluidRate + dietRate) / 3);

    const latest = logs[0]?.loggedAt
      ? new Date(logs[0].loggedAt).toLocaleDateString()
      : new Date().toLocaleDateString();

    return {
      tttAdherence: tttRate,
      fluidAdherence: fluidRate,
      dietAdherence: dietRate,
      overallAdherence: overall,
      lastActive: latest,
    };
  }

  // Consistent seeded realistic rates for demo display based on patientId
  let seed = 0;
  for (let i = 0; i < patientId.length; i++) {
    seed += patientId.charCodeAt(i);
  }

  // Generate plausible metrics
  const tttAdherence = 60 + (seed % 35); // 60-95%
  const fluidAdherence = 50 + ((seed * 3) % 45); // 50-95%
  const dietAdherence = 55 + ((seed * 7) % 40); // 55-95%
  const overallAdherence = Math.round((tttAdherence + fluidAdherence + dietAdherence) / 3);

  const daysAgo = seed % 3;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);

  return {
    tttAdherence,
    fluidAdherence,
    dietAdherence,
    overallAdherence,
    lastActive: d.toLocaleDateString(),
  };
}

export function getAdherenceTrendData(days: number = 7) {
  const result = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Deterministic organic curve
    const ttt = Math.min(100, Math.max(65, 82 + Math.round(Math.sin(i * 1.3) * 12)));
    const fluid = Math.min(100, Math.max(58, 74 + Math.round(Math.cos(i * 1.5) * 14)));
    const diet = Math.min(100, Math.max(60, 80 + Math.round(Math.sin(i * 0.9 + 1) * 10)));

    result.push({
      date: dateStr,
      rawDate: d.toISOString(),
      ttt,
      fluid,
      diet,
      overall: Math.round((ttt + fluid + diet) / 3),
    });
  }

  return result;
}

export function getPatientHistoryTrend(patientId: string, days: number = 30) {
  const result = [];
  const now = new Date();
  let seed = 0;
  for (let j = 0; j < patientId.length; j++) {
    seed += patientId.charCodeAt(j);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const baseTtt = 70 + (seed % 20);
    const baseFluid = 65 + ((seed * 3) % 25);
    const baseDiet = 72 + ((seed * 5) % 20);

    const ttt = Math.min(100, Math.max(45, baseTtt + Math.round(Math.sin((i + seed) * 0.4) * 15)));
    const fluid = Math.min(100, Math.max(40, baseFluid + Math.round(Math.cos((i + seed) * 0.3) * 18)));
    const diet = Math.min(100, Math.max(45, baseDiet + Math.round(Math.sin((i + seed) * 0.5) * 12)));

    result.push({
      date: dateStr,
      ttt,
      fluid,
      diet,
    });
  }

  return result;
}

export function resetAllData(): void {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach((key) => {
    window.localStorage.removeItem(key);
  });
  window.localStorage.removeItem(SETTINGS_KEY);
  initDataStore();
}

export function exportAllDataAsJson(): string {
  if (typeof window === 'undefined') return '{}';
  const dump: Record<string, unknown> = {};
  Object.entries(STORAGE_KEYS).forEach(([key, val]) => {
    try {
      const item = window.localStorage.getItem(val);
      dump[key] = item ? JSON.parse(item) : null;
    } catch {
      dump[key] = null;
    }
  });
  dump.SETTINGS = getAdminSettings();
  dump.exportedAt = new Date().toISOString();
  return JSON.stringify(dump, null, 2);
}
