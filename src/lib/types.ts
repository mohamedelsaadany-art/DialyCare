export type UserRole = 'admin' | 'patient';

export type Language = 'ar' | 'en';

export interface User {
  uid: string;
  role: UserRole;
  username: string;
  displayName: string;
  language: Language;
  fcmToken?: string;
  createdAt: Date | string;
}

/**
 * Strict 2-Option Dialysis Days Schedule (R6):
 * - 'SMW': Option 1 — Saturday / Monday / Wednesday (السبت / الاثنين / الأربعاء) -> getDay() in [6, 1, 3]
 * - 'STT': Option 2 — Sunday / Tuesday / Thursday (الأحد / الثلاثاء / الخميس) -> getDay() in [0, 2, 4]
 * Backwards compatibility: legacy 'MWF' normalizes to 'SMW', and 'TTS' normalizes to 'STT'.
 */
export type DialysisScheduleType = 'SMW' | 'STT' | 'MWF' | 'TTS' | string;

export type Gender = 'male' | 'female';

export interface Patient {
  id: string;
  fullName: string;
  fullNameAr: string;
  phone?: string;
  username?: string;
  centerName?: string;
  fluidLimit?: number;
  dialysisSchedule: DialysisScheduleType;
  reminderSchedule?: string | Record<string, unknown>;
  dryWeightKg?: number;
  gender?: Gender;
  avatarId?: string;
  avatarStyle?: string;
  isActive: boolean;
  createdAt: Date | string;
}

export type ReminderType = 'ttt' | 'fluid' | 'diet';

export interface ReminderTemplate {
  id: string;
  type: ReminderType;
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  defaultTime: string;
  isActive: boolean;
}

export interface PatientReminder {
  id: string;
  patientId: string;
  templateId?: string;
  type: ReminderType;
  time: string;
  isActive: boolean;
  useCustomSchedule?: boolean;
}

export type AdherenceStatus = 'done' | 'skipped' | 'missed';

export interface AdherenceLog {
  id: string;
  patientId: string;
  type: ReminderType;
  status: AdherenceStatus;
  loggedAt: Date | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface FluidLog {
  id: string;
  patientId: string;
  amountMl: number;
  unit: 'ml' | 'cups';
  loggedAt: Date | string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DietLog {
  id: string;
  patientId: string;
  checklist: string[];
  mealType: MealType;
  loggedAt: Date | string;
}

export type CoachingCategory = 'diet' | 'fluid' | 'medication' | 'general';

export interface CoachingTip {
  id: string;
  category: CoachingCategory;
  titleEn: string;
  titleAr: string;
  contentEn: string;
  contentAr: string;
  order: number;
  isActive: boolean;
}

export type NotificationType = 'broadcast' | 'individual' | 'group';
export type NotificationStatus = 'sent' | 'failed';

export interface Notification {
  id: string;
  senderId: string;
  type: NotificationType;
  recipientIds: string[];
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  sentAt: Date | string;
  status: NotificationStatus;
}

export type AppNotification = Notification;

export interface DietChecklistItem {
  id: string;
  nameEn: string;
  nameAr: string;
  category: string;
}

// UI component helper types
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// ==========================================
// R1: PER-PATIENT NAMED MEDICATIONS
// ==========================================
export interface PatientMedication {
  id: string;
  patientId: string;
  name: string;             // Drug name (e.g. "Sevelamer Carbonate 800mg" / "سيفيلامير")
  nameAr?: string;          // Optional Arabic name
  dose: string;             // Dose (e.g. "800 mg" or "1 tablet")
  scheduleTime?: string;    // Optional primary time string "HH:mm" (e.g. "08:00")
  scheduleTimes?: string[]; // Array of times if multiple doses per day (e.g. ["08:00", "14:00", "20:00"])
  instructions?: string;    // Clinical notes (e.g. "Take with meals")
  instructionsAr?: string;  // Arabic clinical notes
  isActive?: boolean;
  createdAt?: Date | string;
}

// ==========================================
// R2: DIALYSIS SESSIONS (14 CLINICAL FIELDS)
// ==========================================
export type LegEdemaLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type LungCracklesLevel = 'none' | 'lower_bases' | 'mid_lung' | 'all_areas';
export type DyspneaLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type DialysisAccessType = 'AVF' | 'AVG' | 'Permcath' | 'Mahurkar';
export type DialysateFlowRate = 300 | 500 | 700 | 800; // mL/min
export type SessionDurationHours = 1 | 2 | 3 | 4;

export interface VitalsTimepoint {
  systolic?: number;   // mmHg (e.g. 130)
  diastolic?: number;  // mmHg (e.g. 80)
  heartRate?: number;  // bpm (e.g. 72)
}

export interface DialysisSessionVitals {
  preSession?: VitalsTimepoint;
  after1hr?: VitalsTimepoint;
  after2hr?: VitalsTimepoint;
  after3hr?: VitalsTimepoint;
  endSession?: VitalsTimepoint;
}

export interface DialysisFluidStatus {
  legEdema?: LegEdemaLevel;
  lungCrackles?: LungCracklesLevel;
  dyspnea?: DyspneaLevel;
}

export interface DialysisSession {
  id: string;
  patientId: string;
  sessionDate: string;      // YYYY-MM-DD
  recordedBy: string;       // User uid or 'doctor' / 'patient'
  recordedAt?: string;       // ISO timestamp

  // Field 1: Medical compliance rating (1-5 scale)
  complianceRating?: 1 | 2 | 3 | 4 | 5;

  // Field 2: Pre-dialysis weight (kg + grams)
  preWeightKg?: number;
  preWeightGrams?: number;

  // Field 3: Post-dialysis weight (kg + grams)
  postWeightKg?: number;
  postWeightGrams?: number;

  // Field 4 & 5: Blood pressure & Heart rate at 5 timepoints
  vitals?: DialysisSessionVitals;

  // Field 6: Temperature (°C)
  temperatureC?: number;

  // Field 7: Fluid status assessment
  fluidStatus?: DialysisFluidStatus;

  // Field 8: Vascular access inspection: signs of infection (yes / no)
  accessInfectionSigns?: boolean;

  // Field 9: Session duration (1 / 2 / 3 / 4 hours)
  durationHours?: SessionDurationHours;

  // Field 10: Ultrafiltration volume (mL)
  ultrafiltrationVolumeMl?: number;

  // Field 11: Blood flow rate (mL/min)
  bloodFlowRateMlMin?: number;

  // Field 12: Dialysate flow rate (300 / 500 / 700 / 800 mL/min)
  dialysateFlowRateMlMin?: DialysateFlowRate;

  // Field 13: Access type (AVF / AVG / Permcath / Mahurkar)
  accessType?: DialysisAccessType;

  // Field 14: Sodium concentration in dialysis machine (mEq/L)
  machineSodiumMeqL?: number;

  notes?: string;
}

// ==========================================
// R5: BILINGUAL LAB RESULTS (12 TESTS)
// ==========================================
export interface LabTestValues {
  hemoglobin?: number;  // g/dL (Normal HD target: 10-12)
  wbc?: number;         // x10³/µL (Normal: 4.0-11.0)
  platelets?: number;   // x10³/µL (Normal: 150-450)
  calcium?: number;     // mg/dL (Normal: 8.4-9.5)
  phosphorus?: number;  // mg/dL (Normal: 3.5-5.5)
  pth?: number;         // pg/mL (Normal HD target: 150-300)
  creatinine?: number;  // mg/dL (Normal HD: 6-12)
  urea?: number;        // mg/dL (Normal HD: 40-100)
  serumIron?: number;   // µg/dL (Normal: 60-170)
  tibc?: number;        // µg/dL (Normal: 250-400)
  ferritin?: number;    // ng/mL (Normal HD target: 200-500)
  albumin?: number;     // g/dL (Normal: 4.0-5.0)
}

export interface PatientLabRecord {
  id: string;
  patientId: string;
  testDate: string;     // YYYY-MM-DD
  recordedBy: string;   // uid of clinician / recorder
  recordedAt?: string;   // ISO timestamp
  values: LabTestValues;
  notes?: string;
}

// ==========================================
// R7: DIALYSIS TREATMENT ADHERENCE QUESTIONNAIRE
// ==========================================
export type QuestionnaireOptionValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdherenceSurveySubmission {
  id: string;
  patientId: string;
  submittedAt: string; // ISO timestamp
  cycleNumber: number; // 1 = baseline/initial, 2 = Month 1, 3 = Month 2, 4 = Month 3, etc.
  cycleLabelAr: string;
  cycleLabelEn: string;
  answers: Record<number, QuestionnaireOptionValue>; // 1 to 20 -> 1 to 6
  overallScorePercent: number;
  sectionScores: {
    dialysisPercent: number;
    medicationsPercent: number;
    dietPercent: number;
    fluidsPercent: number;
  };
  notes?: string;
}

export type SurveyDueReason = 'initial' | 'monthly_due' | 'doctor_activated' | 'completed';

export interface PatientSurveyStatus {
  isDue: boolean;
  reason: SurveyDueReason;
  currentCycleNumber: number;
  cycleLabelAr: string;
  cycleLabelEn: string;
  lastSubmissionDate?: string;
  nextDueDate: string;
  daysUntilDue: number;
  isManuallyActivatedByDoctor: boolean;
  totalSubmissions: number;
}


