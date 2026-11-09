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

export type DialysisScheduleType = 'MWF' | 'TTS' | string;

export interface Patient {
  id: string;
  fullName: string;
  fullNameAr: string;
  phone?: string;
  dialysisSchedule: DialysisScheduleType;
  reminderSchedule?: string | Record<string, unknown>;
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
