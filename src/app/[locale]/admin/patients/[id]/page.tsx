'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ProgressBar from '@/components/ui/ProgressBar';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import type { Patient, PatientReminder, Notification, PatientLabRecord } from '@/lib/types';
import { getDialysisScheduleLabel, getDialysisScheduleFullLabel } from '@/app/[locale]/patient/patient-utils';
import { PatientMedicationManager } from '@/components/admin/PatientMedicationManager';
import { PatientLabResultsView } from '@/components/patient/PatientLabResultsView';
import { PatientLabResultsModal } from '@/components/admin/PatientLabResultsModal';
import { DialysisSessionModal } from '@/components/DialysisSessionModal';
import { DialysisSessionHistory } from '@/components/DialysisSessionHistory';
import { addNotification, getPatientNotifications, getPatientLabResults, STORAGE_KEYS } from '@/lib/data-store';
import {
  getPatients,
  updatePatient,
  getPatientMetrics,
  getPatientUsername,
  getReminders,
  addReminder,
  updateReminder,
  deleteReminder,
  getReminderTemplates,
  getAdherenceLogs,
  getFluidLogs,
  getDietLogs,
  getPatientHistoryTrend,
  type PatientMetrics,
} from '../../admin-store';
import {
  ArrowLeftIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  RemindersIcon,
  MailIcon,
} from '../../admin-icons';

interface TimelineEntry {
  id: string;
  type: string;
  status: string;
  time: string;
  timestamp: number;
  details: string;
}

interface MessageTemplate {
  key: string;
  labelEn: string;
  labelAr: string;
  titleEn: string;
  titleAr: string;
  msgEn: string;
  msgAr: string;
}

const DIRECT_PATIENT_TEMPLATES: MessageTemplate[] = [
  {
    key: 'dialysis_reminder',
    labelEn: 'Dialysis session reminder',
    labelAr: 'تذكير بموعد جلسة الغسيل',
    titleEn: 'Dialysis Session Reminder',
    titleAr: 'تذكير بموعد جلسة الغسيل الكلوي',
    msgEn: 'Please remember to attend your scheduled hemodialysis session on time. Arrive 15 minutes before your slot and check your vascular access thrill.',
    msgAr: 'نذكركم بالحضور في الموعد المحدد لجلسة الغسيل الكلوي القادمة قبل الموعد بـ 15 دقيقة والتحقق من نبض واهتزاز وصلة الغسيل الشريانية.',
  },
  {
    key: 'fluid_restriction',
    labelEn: 'Fluid restriction advisory',
    labelAr: 'تنبيه بشأن تقييد السوائل',
    titleEn: 'Fluid Restriction Advisory',
    titleAr: 'تنبيه طبي: الالتزام بحصة السوائل اليومية',
    msgEn: 'Your clinical team noticed excess interdialytic fluid gain. Please limit daily fluids strictly to your prescribed allowance and avoid high-sodium foods.',
    msgAr: 'لوحظ ارتفاع السوائل المكتسبة بين الجلسات. يرجى الالتزام الصارم بالحد اليومي المسموح به من السوائل وتجنب الأطعمة الغنية بالصوديوم.',
  },
  {
    key: 'medication_review',
    labelEn: 'Medication review required',
    labelAr: 'مراجعة خطة الأدوية ومثبتات الفوسفات',
    titleEn: 'Medication Review Required',
    titleAr: 'مراجعة ضرورية لجرعات الأدوية ومثبتات الفوسفات',
    msgEn: 'Please review your prescribed medication regimen with the unit clinician during your next visit. Ensure phosphate binders are taken with meals.',
    msgAr: 'يرجى مراجعة خطة أدويتك مع طبيب الوحدة في زيارتك القادمة، مع الحرص على تناول مثبتات الفوسفات أثناء وجبات الطعام مباشرة.',
  },
  {
    key: 'lab_work',
    labelEn: 'Monthly routine blood tests',
    labelAr: 'موعد التحاليل الدورية الشهرية',
    titleEn: 'Monthly Routine Blood Tests Due',
    titleAr: 'موعد سحب التحاليل الدورية الشهرية',
    msgEn: 'Your routine monthly lab work is due during your upcoming dialysis run. Please follow fasting instructions provided by nursing staff.',
    msgAr: 'موعد سحب عينات تحاليلك الدورية الشهرية في جلستك القادمة. يرجى اتباع تعليمات الصيام المعتمدة من التمريض.',
  },
  {
    key: 'diet_caution',
    labelEn: 'Potassium & phosphorus dietary warning',
    labelAr: 'إرشادات غذائية: ضبط البوتاسيوم والفوسفور',
    titleEn: 'Renal Diet Advisory',
    titleAr: 'إرشادات غذائية: خفض البوتاسيوم والفوسفور',
    msgEn: 'Remember to follow low-potassium and low-phosphorus dietary guidance today to maintain electrolyte balance.',
    msgAr: 'احرص على اتباع الخيارات الغذائية قليلة البوتاسيوم والفوسفور اليوم للحفاظ على توازن الأملاح في الدم.',
  },
];

export default function PatientDetailPage() {
  const locale = useLocale();
  const params = useParams();
  const { user } = useAuth();
  const patientId = params?.id as string;
  const isRtl = locale === 'ar';

  const tCommon = useTranslations('common');
  const tAdmin = useTranslations('admin');
  const tReminders = useTranslations('reminders');

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientUsername, setPatientUsername] = useState('');
  const [metrics, setMetrics] = useState<PatientMetrics | null>(null);
  const [historyData, setHistoryData] = useState<Array<{ date: string; ttt: number; fluid: number; diet: number }>>([]);
  const [reminders, setReminders] = useState<PatientReminder[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [communications, setCommunications] = useState<Notification[]>([]);
  const [useCustomSchedule, setUseCustomSchedule] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (notifCloseTimerRef.current) {
        clearTimeout(notifCloseTimerRef.current);
      }
    };
  }, []);

  // Edit patient modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    fullNameAr: '',
    phone: '',
    dialysisSchedule: 'SMW',
    isActive: true,
  });

  // Notification modal
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [notifTitleEn, setNotifTitleEn] = useState('');
  const [notifTitleAr, setNotifTitleAr] = useState('');
  const [notifMsgEn, setNotifMsgEn] = useState('');
  const [notifMsgAr, setNotifMsgAr] = useState('');
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Add reminder modal
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [newReminder, setNewReminder] = useState<{
    type: 'ttt' | 'fluid' | 'diet';
    time: string;
    isActive: boolean;
  }>({
    type: 'ttt',
    time: '08:00',
    isActive: true,
  });

  // Lab Results modal
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [selectedLabRecord, setSelectedLabRecord] = useState<PatientLabRecord | null>(null);
  const [latestLabRecord, setLatestLabRecord] = useState<PatientLabRecord | null>(null);

  // Dialysis Session modal
  const [dialysisModalOpen, setDialysisModalOpen] = useState(false);

  const loadPatientData = useCallback(() => {
    if (!patientId) return;

    const allPatients = getPatients();
    const found = allPatients.find((p) => p.id === patientId);

    if (!found) {
      setLoading(false);
      return;
    }

    setPatient(found);
    const uname =
      (found as unknown as { username?: string }).username ||
      getPatientUsername(found.id);
    setPatientUsername(uname);
    setEditForm({
      fullName: found.fullName,
      fullNameAr: found.fullNameAr || '',
      phone: found.phone || '',
      dialysisSchedule: (found.dialysisSchedule === 'TTS' || found.dialysisSchedule === 'STT') ? 'STT' : 'SMW',
      isActive: found.isActive,
    });

    // Latest Lab Record for quick update access
    const labs = getPatientLabResults(found.id);
    setLatestLabRecord(labs[0] || null);

    // Metrics & History
    const calculatedMetrics = getPatientMetrics(found.id);
    setMetrics(calculatedMetrics);
    setHistoryData(getPatientHistoryTrend(found.id, 30));

    // Reminders
    let patientReminders = getReminders(found.id);
    if (patientReminders.length === 0) {
      // Seed from templates for demo convenience
      const templates = getReminderTemplates();
      patientReminders = templates.map((tpl) => ({
        id: `rem_${found.id}_${tpl.id}`,
        patientId: found.id,
        templateId: tpl.id,
        type: tpl.type,
        time: tpl.defaultTime,
        isActive: true,
        useCustomSchedule: false,
      }));
      patientReminders.forEach((r) => addReminder(r));
    }
    setReminders(patientReminders);
    setUseCustomSchedule(patientReminders.some((r) => r.useCustomSchedule));

    // Compile Recent Timeline (Adherence, Fluid, Diet, and Communications)
    const adhLogs = getAdherenceLogs(found.id);
    const fluidLogs = getFluidLogs(found.id);
    const dietLogs = getDietLogs(found.id);
    const patientNotifs = getPatientNotifications(found.id, found.dialysisSchedule);
    patientNotifs.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    setCommunications(patientNotifs);

    const entries: TimelineEntry[] = [];

    adhLogs.forEach((log) => {
      const ts = new Date(log.loggedAt).getTime();
      entries.push({
        id: log.id,
        type: log.type.toUpperCase(),
        status: log.status,
        timestamp: isNaN(ts) ? Date.now() : ts,
        time: new Date(log.loggedAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
        details: log.data && typeof log.data === 'object' && 'title' in log.data
          ? String((log.data as Record<string, unknown>).title)
          : `${log.type.toUpperCase()} adherence marked as ${log.status}`,
      });
    });

    fluidLogs.forEach((f) => {
      const ts = new Date(f.loggedAt).getTime();
      entries.push({
        id: f.id,
        type: 'FLUID',
        status: 'done',
        timestamp: isNaN(ts) ? Date.now() : ts,
        time: new Date(f.loggedAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
        details: isRtl
          ? `تسجيل السوائل: ${f.amountMl} ${f.unit === 'ml' ? 'مل' : f.unit}`
          : `Fluid consumption: ${f.amountMl} ${f.unit}`,
      });
    });

    dietLogs.forEach((d) => {
      const ts = new Date(d.loggedAt).getTime();
      entries.push({
        id: d.id,
        type: 'DIET',
        status: 'done',
        timestamp: isNaN(ts) ? Date.now() : ts,
        time: new Date(d.loggedAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
        details: isRtl
          ? `قائمة وجبة ${d.mealType === 'breakfast' ? 'الإفطار' : d.mealType === 'lunch' ? 'الغداء' : 'العشاء'}: تم تسجيل ${d.checklist.length} عناصر`
          : `${d.mealType.toUpperCase()} checklist: ${d.checklist.length} items logged`,
      });
    });

    patientNotifs.forEach((n) => {
      const ts = new Date(n.sentAt).getTime();
      entries.push({
        id: n.id,
        type: 'COMMUNICATION',
        status: n.status || 'sent',
        timestamp: isNaN(ts) ? Date.now() : ts,
        time: new Date(n.sentAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
        details: isRtl
          ? `${n.titleAr || n.titleEn}: ${n.messageAr || n.messageEn}`
          : `${n.titleEn || n.titleAr}: ${n.messageEn || n.messageAr}`,
      });
    });

    // If no logs, generate demo items so the timeline is helpful
    if (entries.length === 0) {
      const now = new Date();
      entries.push(
        {
          id: 'demo_1',
          type: 'TTT',
          status: 'done',
          timestamp: now.getTime() - 2 * 3600000,
          time: new Date(now.getTime() - 2 * 3600000).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
          details: isRtl ? 'تناول أدوية ومثبتات الفوسفات الصباحية' : 'Morning Phosphate Binder taken with water',
        },
        {
          id: 'demo_2',
          type: 'FLUID',
          status: 'done',
          timestamp: now.getTime() - 4 * 3600000,
          time: new Date(now.getTime() - 4 * 3600000).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
          details: isRtl ? 'تسجيل سوائل منتصف اليوم: 200 مل' : 'Midday Fluid Log: 200 mL',
        },
        {
          id: 'demo_3',
          type: 'DIET',
          status: 'done',
          timestamp: now.getTime() - 8 * 3600000,
          time: new Date(now.getTime() - 8 * 3600000).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
          details: isRtl ? 'اكتمال قائمة وجبة الإفطار الغذائية' : 'Breakfast Renal Diet Checklist completed',
        },
        {
          id: 'demo_4',
          type: 'TTT',
          status: 'done',
          timestamp: now.getTime() - 24 * 3600000,
          time: new Date(now.getTime() - 24 * 3600000).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
          details: isRtl ? 'تسجيل جرعة دواء ضغط الدم المسائية' : 'Evening blood pressure medication logged',
        }
      );
    }

    // Sort newest first using numerical timestamp (safe across all locales)
    entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    setTimeline(entries.slice(0, 25));

    setLoading(false);
  }, [patientId, isRtl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatientData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPatientData]);

  // Reactive synchronization across tabs and local events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === STORAGE_KEYS.NOTIFICATIONS ||
        e.key === STORAGE_KEYS.LAB_RESULTS ||
        e.key === STORAGE_KEYS.DIALYSIS_SESSIONS ||
        e.key === STORAGE_KEYS.PATIENT_MEDICATIONS ||
        e.key === STORAGE_KEYS.PATIENTS ||
        e.key === STORAGE_KEYS.ADHERENCE_LOGS
      ) {
        loadPatientData();
      }
    };
    const handleCustomUpdate = () => {
      loadPatientData();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dialycare_notifications_updated', handleCustomUpdate);
    window.addEventListener('dialycare_labs_updated', handleCustomUpdate);
    window.addEventListener('dialycare_sessions_updated', handleCustomUpdate);
    window.addEventListener('dialycare_medications_updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dialycare_notifications_updated', handleCustomUpdate);
      window.removeEventListener('dialycare_labs_updated', handleCustomUpdate);
      window.removeEventListener('dialycare_sessions_updated', handleCustomUpdate);
      window.removeEventListener('dialycare_medications_updated', handleCustomUpdate);
    };
  }, [loadPatientData]);

  // Toggle patient active status
  const handleToggleActiveStatus = () => {
    if (!patient) return;
    const newStatus = !patient.isActive;
    updatePatient(patient.id, { isActive: newStatus });
    setPatient({ ...patient, isActive: newStatus });
  };

  // Toggle custom schedule
  const handleToggleScheduleType = (useCustom: boolean) => {
    setUseCustomSchedule(useCustom);
    reminders.forEach((r) => {
      updateReminder(r.id, { useCustomSchedule: useCustom });
    });
    setReminders(reminders.map((r) => ({ ...r, useCustomSchedule: useCustom })));
  };

  // Toggle individual reminder
  const handleToggleReminder = (reminder: PatientReminder) => {
    const updated = updateReminder(reminder.id, { isActive: !reminder.isActive });
    if (updated) {
      setReminders(reminders.map((r) => (r.id === reminder.id ? updated : r)));
    }
  };

  // Update reminder time
  const handleUpdateReminderTime = (reminder: PatientReminder, newTime: string) => {
    const updated = updateReminder(reminder.id, { time: newTime });
    if (updated) {
      setReminders(reminders.map((r) => (r.id === reminder.id ? updated : r)));
    }
  };

  // Delete reminder
  const handleDeleteReminder = (id: string) => {
    if (confirm(isRtl ? 'هل أنت متأكد من حذف هذا التذكير؟' : 'Delete this reminder?')) {
      deleteReminder(id);
      setReminders(reminders.filter((r) => r.id !== id));
    }
  };

  // Add new reminder
  const handleAddReminderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;

    const created = addReminder({
      id: `rem_custom_${Date.now()}`,
      patientId: patient.id,
      type: newReminder.type,
      time: newReminder.time,
      isActive: newReminder.isActive,
      useCustomSchedule: true,
    });

    setReminders([...reminders, created]);
    setAddReminderOpen(false);
  };

  // Save profile changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;

    const updated = updatePatient(patient.id, {
      fullName: editForm.fullName.trim(),
      fullNameAr: editForm.fullNameAr.trim(),
      phone: editForm.phone.trim(),
      dialysisSchedule: editForm.dialysisSchedule,
      isActive: editForm.isActive,
    });

    if (updated) {
      setPatient(updated);
      setEditModalOpen(false);
    }
  };

  // Handle template selection
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    setSelectedTemplateKey(key);
    if (!key) return;

    const tpl = DIRECT_PATIENT_TEMPLATES.find((t) => t.key === key);
    if (tpl) {
      setNotifTitleEn(tpl.titleEn);
      setNotifTitleAr(tpl.titleAr);
      setNotifMsgEn(tpl.msgEn);
      setNotifMsgAr(tpl.msgAr);
    }
  };

  // Send single direct notification to this patient
  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;

    const finalTitleEn = notifTitleEn.trim() || notifTitleAr.trim();
    const finalTitleAr = notifTitleAr.trim() || notifTitleEn.trim();
    const finalMsgEn = notifMsgEn.trim() || notifMsgAr.trim();
    const finalMsgAr = notifMsgAr.trim() || notifMsgEn.trim();

    if (!finalTitleEn || !finalMsgEn) return;

    const notif: Notification = {
      id: `notif_${Date.now()}`,
      senderId: 'admin-1',
      type: 'individual',
      recipientIds: [patient.id],
      titleEn: finalTitleEn,
      titleAr: finalTitleAr,
      messageEn: finalMsgEn,
      messageAr: finalMsgAr,
      sentAt: new Date().toISOString(),
      status: 'sent',
    };

    addNotification(notif);
    setNotifSuccess(true);
    setToastMessage(
      isRtl
        ? `تم إرسال الرسالة إلى ${patient.fullNameAr || patient.fullName} بنجاح!`
        : `Message dispatched to ${patient.fullName} successfully!`
    );

    // Refresh clinical records and timeline immediately
    loadPatientData();

    if (notifCloseTimerRef.current) {
      clearTimeout(notifCloseTimerRef.current);
    }
    notifCloseTimerRef.current = setTimeout(() => {
      setNotifModalOpen(false);
      setNotifSuccess(false);
      setSelectedTemplateKey('');
      setNotifTitleEn('');
      setNotifTitleAr('');
      setNotifMsgEn('');
      setNotifMsgAr('');
      notifCloseTimerRef.current = null;
    }, 1200);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 4500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading patient records...'}
        </p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="py-16 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ?
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {isRtl ? 'المريض غير موجود' : 'Patient Record Not Found'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {isRtl
            ? 'تعذر العثور على ملف المريض المطلوب في النظام'
            : 'The requested patient profile could not be located.'}
        </p>
        <Link href={`/${locale}/admin/patients`}>
          <Button variant="primary" leftIcon={<ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />}>
            {isRtl ? 'العودة لقائمة المرضى' : 'Back to Patient List'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Toast Notification Confirmation */}
      {toastMessage && (
        <div className="fixed top-6 right-6 rtl:right-auto rtl:left-6 z-50 flex items-center gap-2.5 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircleIcon className="w-5 h-5 shrink-0" />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${locale}/admin/patients`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#1e6bb8] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5 rtl:rotate-180" />
          <span>{isRtl ? 'المرضى' : 'Patients'}</span>
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-xs font-semibold text-slate-800">{patient.fullName}</span>
      </div>

      {/* Profile Header Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Avatar & Patient Info */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e6bb8] to-[#0284c7] text-white flex items-center justify-center font-bold text-2xl shadow-sm shrink-0">
              {patient.fullName.charAt(0)}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                  {patient.fullName}
                </h1>
                {patient.fullNameAr && (
                  <span className="text-sm font-semibold text-slate-500">
                    ({patient.fullNameAr})
                  </span>
                )}
                <Badge variant={patient.isActive ? 'success' : 'neutral'} size="sm" dot>
                  {patient.isActive ? (isRtl ? 'نشط' : 'Active') : isRtl ? 'غير نشط' : 'Inactive'}
                </Badge>
                <Badge variant="info" size="sm">
                  {getDialysisScheduleLabel(patient.dialysisSchedule, isRtl)}
                </Badge>
                {/* Active Status Header Toggle Switch */}
                <div className="inline-flex items-center gap-1.5 ms-2 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">
                    {patient.isActive
                      ? isRtl ? 'مفعّل' : 'Active'
                      : isRtl ? 'معطّل' : 'Inactive'}
                  </span>
                  <button
                    type="button"
                    data-compact-control="true"
                    onClick={handleToggleActiveStatus}
                    aria-label={isRtl ? 'تبديل حالة تفعيل المريض' : 'Toggle patient active status'}
                    className={`w-7 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 ${
                      patient.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-3 h-3 rounded-full shadow-xs transform transition-transform duration-200 ${
                        patient.isActive ? 'translate-x-3 rtl:-translate-x-3' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  <strong>{isRtl ? 'اسم المستخدم:' : 'Username:'}</strong>{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    @{patientUsername || patient.id}
                  </span>
                </span>
                <span>
                  <strong>ID:</strong> {patient.id}
                </span>
                <span>
                  <strong>{isRtl ? 'الهاتف:' : 'Phone:'}</strong> {patient.phone || 'N/A'}
                </span>
                <span>
                  <strong>{isRtl ? 'جدول الغسيل:' : 'Schedule:'}</strong> {getDialysisScheduleFullLabel(patient.dialysisSchedule, isRtl)}
                </span>
                <span>
                  <strong>{isRtl ? 'تاريخ التسجيل:' : 'Enrolled:'}</strong>{' '}
                  {new Date(patient.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              size="md"
              onClick={() => setDialysisModalOpen(true)}
              data-testid="patient-detail-record-dialysis-btn"
              title={isRtl ? 'تسجيل جلسة غسيل كلوي (14 معيار)' : 'Record Dialysis Session (14 Fields)'}
              aria-label={isRtl ? 'تسجيل جلسة غسيل كلوي' : 'Record Dialysis Session'}
              className="min-h-[48px] bg-[#1e6bb8] hover:bg-blue-700 font-bold"
            >
              🩺 {isRtl ? 'تسجيل جلسة غسيل' : 'Record Dialysis Session'}
            </Button>

            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setSelectedLabRecord(null);
                setLabModalOpen(true);
              }}
              data-testid="patient-detail-enter-labs-btn"
              title={isRtl ? 'إدخال تحاليل مخبرية جديدة (12 تحليل)' : 'Enter New Lab Results (12 Tests)'}
              className="min-h-[48px] border-teal-300 bg-teal-50/70 text-teal-900 hover:bg-teal-100 font-bold"
            >
              🔬 {latestLabRecord ? (isRtl ? 'تحاليل جديدة' : 'New Lab Panel') : (isRtl ? 'إدخال التحاليل المخبرية' : 'Enter Lab Results')}
            </Button>

            {latestLabRecord && (
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setSelectedLabRecord(latestLabRecord);
                  setLabModalOpen(true);
                }}
                data-testid="patient-detail-update-latest-labs-btn"
                title={isRtl ? `تحديث آخر تحاليل (${latestLabRecord.testDate})` : `Update Latest Lab Results (${latestLabRecord.testDate})`}
                className="min-h-[48px] border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-bold"
              >
                ✏️ {isRtl ? `تحديث آخر تحاليل (${latestLabRecord.testDate})` : `Update Latest Labs (${latestLabRecord.testDate})`}
              </Button>
            )}

            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setSelectedTemplateKey('');
                setNotifTitleEn('');
                setNotifTitleAr('');
                setNotifMsgEn('');
                setNotifMsgAr('');
                setNotifSuccess(false);
                setNotifModalOpen(true);
              }}
              leftIcon={<MailIcon className="w-4 h-4" />}
              aria-label={isRtl ? 'إرسال تنبيه للمريض / Send Message' : 'Send Message / إرسال تنبيه للمريض'}
              title={isRtl ? 'إرسال تنبيه للمريض' : 'Send Message'}
              data-testid="send-patient-message-btn"
              className="min-h-[48px]"
            >
              {isRtl ? 'إرسال تنبيه للمريض' : 'Send Message'}
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={() => setEditModalOpen(true)}
              leftIcon={<EditIcon className="w-4 h-4" />}
              className="min-h-[48px]"
            >
              {tAdmin('editPatient') || (isRtl ? 'تعديل الملف' : 'Edit Profile')}
            </Button>

            <Button
              variant={patient.isActive ? 'danger' : 'success'}
              size="md"
              onClick={handleToggleActiveStatus}
              className="min-h-[48px]"
            >
              {patient.isActive
                ? isRtl ? 'تعطيل الحساب' : 'Deactivate'
                : isRtl ? 'تفعيل الحساب' : 'Activate'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Adherence Summary Cards (3 cards) - this week */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* TTT Medication Adherence */}
        <Card
          title={isRtl ? 'التزام الأدوية (TTT)' : 'TTT Medication Adherence'}
          subtitle={isRtl ? 'هذا الأسبوع' : 'This week'}
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-[#1e6bb8]">
                {metrics?.tttAdherence}%
              </span>
              <Badge variant={metrics && metrics.tttAdherence >= 70 ? 'success' : 'warning'} size="sm">
                {metrics && metrics.tttAdherence >= 70
                  ? isRtl ? 'ممتاز' : 'Target Met'
                  : isRtl ? 'منخفض' : 'Needs Attention'}
              </Badge>
            </div>
            <ProgressBar value={metrics?.tttAdherence || 0} variant="primary" />
            <p className="text-xs text-slate-500">
              {isRtl ? 'نسبة تناول الأدوية ومثبتات الفوسفات المقررة' : 'Phosphate binders & cardiovascular meds tracked'}
            </p>
          </div>
        </Card>

        {/* Fluid Intake Adherence */}
        <Card
          title={isRtl ? 'الالتزام بحصة السوائل' : 'Fluid Quota Compliance'}
          subtitle={isRtl ? 'هذا الأسبوع' : 'This week'}
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-[#0284c7]">
                {metrics?.fluidAdherence}%
              </span>
              <Badge variant={metrics && metrics.fluidAdherence >= 70 ? 'success' : 'warning'} size="sm">
                {metrics && metrics.fluidAdherence >= 70
                  ? isRtl ? 'ضمن الحد الآمن' : 'Within Limit'
                  : isRtl ? 'تجاوز محتمل' : 'Exceeding Quota'}
              </Badge>
            </div>
            <ProgressBar value={metrics?.fluidAdherence || 0} variant="primary" />
            <p className="text-xs text-slate-500">
              {isRtl ? 'السيطرة على الوزن المكتسب بين الجلسات' : 'Interdialytic weight gain prevention control'}
            </p>
          </div>
        </Card>

        {/* Diet Checklist Adherence */}
        <Card
          title={isRtl ? 'التزام قائمة الغذاء' : 'Diet Checklist Compliance'}
          subtitle={isRtl ? 'هذا الأسبوع' : 'This week'}
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-[#4caf50]">
                {metrics?.dietAdherence}%
              </span>
              <Badge variant={metrics && metrics.dietAdherence >= 70 ? 'success' : 'warning'} size="sm">
                {metrics && metrics.dietAdherence >= 70
                  ? isRtl ? 'ممتاز' : 'Target Met'
                  : isRtl ? 'بحاجة لتحسين' : 'Needs Attention'}
              </Badge>
            </div>
            <ProgressBar value={metrics?.dietAdherence || 0} variant="primary" />
            <p className="text-xs text-slate-500">
              {isRtl ? 'الالتزام بوجبات قليلة البوتاسيوم والصوديوم' : 'Adherence to low-sodium and low-potassium renal meals'}
            </p>
          </div>
        </Card>
      </div>

      {/* Adherence History Chart (30 Days) */}
      <Card
        title={isRtl ? 'سجل الالتزام خلال 30 يوماً' : '30-Day Adherence History Trend'}
        subtitle={isRtl ? 'تتبع تطور التزام المريض على مدار الشهر الماضي' : 'Longitudinal view of TTT, fluid intake, and meal logs'}
      >
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '0.75rem',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '13px' }} />
              <Line
                type="monotone"
                dataKey="ttt"
                name={isRtl ? 'الأدوية (TTT)' : 'TTT Medication'}
                stroke="#1e6bb8"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="fluid"
                name={isRtl ? 'السوائل' : 'Fluid Quota'}
                stroke="#0284c7"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="diet"
                name={isRtl ? 'الغذاء' : 'Diet Checklist'}
                stroke="#4caf50"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Prescribed Named Medications Section (R1) */}
      <PatientMedicationManager
        patientId={patient.id}
        onMedicationAdded={() => loadPatientData()}
        onMedicationUpdated={() => loadPatientData()}
        onMedicationDeleted={() => loadPatientData()}
      />

      {/* Dialysis Treatment Session History & 14-Field Recording (R2) */}
      <DialysisSessionHistory
        patientId={patient.id}
        patientName={isRtl ? patient.fullNameAr || patient.fullName : patient.fullName}
        canRecord={true}
        canManage={true}
        onRecordClick={() => setDialysisModalOpen(true)}
      />

      {/* Bilingual Clinical Laboratory Results Section (R5) */}
      <PatientLabResultsView
        patientId={patient.id}
        canEdit={true}
        onEditClick={(rec) => {
          setSelectedLabRecord(rec || null);
          setLabModalOpen(true);
        }}
      />

      {/* Reminder Schedule Section */}
      <Card
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <RemindersIcon className="w-5 h-5 text-[#1e6bb8]" />
              <span>{tReminders('title') || (isRtl ? 'جدول تذكيرات المريض' : 'Patient Reminder Schedule')}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddReminderOpen(true)}
              leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
            >
              {tReminders('addReminder') || (isRtl ? 'إضافة تذكير خاص' : 'Add Custom Reminder')}
            </Button>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scheduleType"
                checked={!useCustomSchedule}
                onChange={() => handleToggleScheduleType(false)}
                className="text-[#1e6bb8]"
              />
              <span>{isRtl ? 'استخدام النموذج الافتراضي' : 'Use Default Templates'}</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scheduleType"
                checked={useCustomSchedule}
                onChange={() => handleToggleScheduleType(true)}
                className="text-[#1e6bb8]"
              />
              <span>{isRtl ? 'جدول مخصص لهذا المريض' : 'Custom Schedule Active'}</span>
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-4 text-start">{isRtl ? 'الفئة' : 'Category'}</th>
                <th className="py-2.5 px-4 text-start">{isRtl ? 'وقت التنبيه' : 'Scheduled Time'}</th>
                <th className="py-2.5 px-4 text-center">{isRtl ? 'التفعيل' : 'Active'}</th>
                <th className="py-2.5 px-4 text-end">{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reminders.map((rem) => (
                <tr key={rem.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    <Badge
                      variant={
                        rem.type === 'ttt'
                          ? 'info'
                          : rem.type === 'fluid'
                          ? 'warning'
                          : 'success'
                      }
                      size="sm"
                    >
                      {rem.type.toUpperCase()}
                    </Badge>
                  </td>

                  <td className="py-3 px-4">
                    <input
                      type="time"
                      value={rem.time}
                      onChange={(e) => handleUpdateReminderTime(rem, e.target.value)}
                      className="px-2.5 py-1 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#1e6bb8]"
                    />
                  </td>

                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      data-compact-control="true"
                      onClick={() => handleToggleReminder(rem)}
                      aria-label={isRtl ? 'تبديل تفعيل التذكير' : 'Toggle reminder active status'}
                      className={`
                        w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200
                        ${rem.isActive ? 'bg-emerald-500' : 'bg-slate-300'}
                      `}
                    >
                      <div
                        className={`
                          bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200
                          ${rem.isActive ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}
                        `}
                      />
                    </button>
                  </td>

                  <td className="py-3 px-4 text-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteReminder(rem.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Delete Reminder"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Clinical Communications & Direct Alerts Log Card */}
      <Card
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <MailIcon className="w-5 h-5 text-[#1e6bb8]" />
              <span>
                {isRtl
                  ? 'سجل المراسلات والتنبيهات المباشرة للمريض'
                  : 'Clinical Communications & Direct Alerts'}
              </span>
              <Badge variant="info" size="sm">
                {communications.length}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTemplateKey('');
                setNotifTitleEn('');
                setNotifTitleAr('');
                setNotifMsgEn('');
                setNotifMsgAr('');
                setNotifSuccess(false);
                setNotifModalOpen(true);
              }}
              leftIcon={<MailIcon className="w-3.5 h-3.5" />}
              aria-label={isRtl ? 'إرسال تنبيه للمريض / Send Message' : 'Send Message / إرسال تنبيه للمريض'}
              title={isRtl ? 'إرسال تنبيه للمريض' : 'Send Message'}
            >
              {isRtl ? 'إرسال تنبيه للمريض' : 'Send Message'}
            </Button>
          </div>
        }
        subtitle={
          isRtl
            ? 'سجل التنبيهات المباشرة والرسائل الفردية والجماعية المرسلة لهذا المريض من قبل الفريق الطبي'
            : 'Audit trail of clinical communications and direct alerts dispatched to this patient'
        }
      >
        {communications.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-[#1e6bb8] flex items-center justify-center mx-auto mb-2">
              <MailIcon className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-700">
              {isRtl ? 'لا توجد مراسلات مسجلة لهذا المريض حتى الآن' : 'No clinical communications sent yet'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {isRtl
                ? 'استخدم زر "إرسال تنبيه للمريض" بالأعلى لإرسال تنبيه فوري أو تذكير مخصص للجلسات'
                : 'Use the "Send Message" button above to compose and send an on-demand clinical notice to this patient.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {communications.map((notif) => (
              <div key={notif.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-900">
                      {isRtl ? notif.titleAr || notif.titleEn : notif.titleEn || notif.titleAr}
                    </h4>
                    {isRtl && notif.titleEn && notif.titleAr !== notif.titleEn && (
                      <p className="text-xs text-slate-400 font-medium">({notif.titleEn})</p>
                    )}
                    {!isRtl && notif.titleAr && notif.titleEn !== notif.titleAr && (
                      <p className="text-xs text-slate-400 font-medium">({notif.titleAr})</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={notif.type === 'individual' ? 'info' : 'neutral'} size="sm">
                      {notif.type === 'individual'
                        ? isRtl ? 'رسالة فردية' : 'Direct Message'
                        : isRtl ? 'رسالة جماعية' : 'Broadcast'}
                    </Badge>
                    <Badge variant="success" size="sm">
                      {isRtl ? 'تم الإرسال' : 'Sent'}
                    </Badge>
                  </div>
                </div>

                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                  {isRtl ? notif.messageAr || notif.messageEn : notif.messageEn || notif.messageAr}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>
                    <strong>{isRtl ? 'المرسل:' : 'Sender:'}</strong> {notif.senderId || 'admin-1'}
                  </span>
                  <span>{new Date(notif.sentAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent Activity Timeline (Last 25 entries) */}
      <Card
        title={isRtl ? 'سجل النشاط الأخير للمريض' : 'Recent Patient Activity Timeline'}
        subtitle={isRtl ? 'آخر 20 عملية تسجيل للأدوية والسوائل والوجبات' : 'Chronological stream of adherence logs, fluid intakes, and meal reports'}
      >
        <div className="flow-root">
          <ul className="-mb-8">
            {timeline.map((event, eventIdx) => (
              <li key={event.id}>
                <div className="relative pb-8">
                  {eventIdx !== timeline.length - 1 ? (
                    <span
                      className="absolute top-4 left-4 -ml-px rtl:left-auto rtl:right-4 rtl:-mr-px h-full w-0.5 bg-slate-200"
                      aria-hidden="true"
                    />
                  ) : null}

                  <div className="relative flex space-x-3 rtl:space-x-reverse">
                    <div>
                      <span
                        className={`
                          h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white font-bold text-xs text-white
                          ${
                            event.type === 'TTT'
                              ? 'bg-[#1e6bb8]'
                              : event.type === 'FLUID'
                              ? 'bg-[#0284c7]'
                              : event.type === 'DIET'
                              ? 'bg-[#4caf50]'
                              : 'bg-purple-600'
                          }
                        `}
                      >
                        {event.type === 'COMMUNICATION' ? '✉' : event.type.charAt(0)}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-1 justify-between space-x-4 rtl:space-x-reverse pt-1.5">
                      <div>
                        <p className="text-sm text-slate-800 font-medium">{event.details}</p>
                        <Badge
                          variant={event.status === 'done' || event.status === 'sent' ? 'success' : 'warning'}
                          size="sm"
                          className="mt-1"
                        >
                          {event.status === 'sent' ? (isRtl ? 'تم الإرسال' : 'Sent') : event.status}
                        </Badge>
                      </div>
                      <div className="whitespace-nowrap text-end text-xs text-slate-400">
                        {event.time}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={isRtl ? 'تعديل الملف الطبي للمريض' : 'Edit Patient Profile'}
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            label={isRtl ? 'الاسم بالكامل (إنجليزي)' : 'Full Name (English)'}
            value={editForm.fullName}
            onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
            required
          />

          <Input
            label={isRtl ? 'الاسم بالكامل (عربي)' : 'Full Name (Arabic)'}
            value={editForm.fullNameAr}
            onChange={(e) => setEditForm({ ...editForm, fullNameAr: e.target.value })}
            required
          />

          <Input
            label={isRtl ? 'رقم الهاتف' : 'Phone Number'}
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">
              {isRtl ? 'جدول جلسات الغسيل' : 'Dialysis Days'}
            </label>
            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              {[
                {
                  code: 'SMW',
                  labelAr: 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)',
                  labelEn: 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)',
                },
                {
                  code: 'STT',
                  labelAr: 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)',
                  labelEn: 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)',
                },
              ].map((sch) => (
                <label key={sch.code} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="editPatientSchedule"
                    value={sch.code}
                    checked={
                      editForm.dialysisSchedule === sch.code ||
                      (sch.code === 'SMW' && (editForm.dialysisSchedule === 'MWF' || editForm.dialysisSchedule === 'Custom')) ||
                      (sch.code === 'STT' && editForm.dialysisSchedule === 'TTS')
                    }
                    onChange={() => setEditForm({ ...editForm, dialysisSchedule: sch.code })}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>{isRtl ? sch.labelAr : sch.labelEn}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {tCommon('save') || 'Save Profile'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Custom Reminder Modal */}
      <Modal
        isOpen={addReminderOpen}
        onClose={() => setAddReminderOpen(false)}
        title={isRtl ? 'إضافة تذكير خاص للمريض' : 'Add Custom Reminder'}
      >
        <form onSubmit={handleAddReminderSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">
              {isRtl ? 'نوع التذكير' : 'Reminder Category'}
            </label>
            <select
              value={newReminder.type}
              onChange={(e) =>
                setNewReminder({ ...newReminder, type: e.target.value as 'ttt' | 'fluid' | 'diet' })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-[#1e6bb8]"
            >
              <option value="ttt">{isRtl ? 'أدوية ومثبتات (TTT)' : 'Medication (TTT)'}</option>
              <option value="fluid">{isRtl ? 'متابعة السوائل' : 'Fluid Intake Check'}</option>
              <option value="diet">{isRtl ? 'قائمة الغذاء' : 'Diet Meal Log'}</option>
            </select>
          </div>

          <Input
            label={isRtl ? 'الوقت المجدول' : 'Scheduled Time (HH:MM)'}
            type="time"
            value={newReminder.time}
            onChange={(e) => setNewReminder({ ...newReminder, time: e.target.value })}
            required
          />

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="newReminderActive"
              checked={newReminder.isActive}
              onChange={(e) => setNewReminder({ ...newReminder, isActive: e.target.checked })}
              className="w-4 h-4 text-[#1e6bb8]"
            />
            <label htmlFor="newReminderActive" className="text-sm font-medium text-slate-700 cursor-pointer">
              {isRtl ? 'التذكير مفعّل فوراً' : 'Activate reminder immediately'}
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setAddReminderOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {isRtl ? 'إضافة التذكير' : 'Add Reminder'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Send Direct Message to Patient Modal */}
      <Modal
        isOpen={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        title={isRtl ? `إرسال رسالة مباشرة لـ ${patient.fullName}` : `Direct Message to ${patient.fullName}`}
      >
        {notifSuccess ? (
          <div className="py-6 text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {isRtl ? 'تم إرسال الرسالة للمريض بنجاح!' : 'Message Dispatched to Patient!'}
            </h4>
            <p className="text-xs text-slate-500">
              {isRtl
                ? 'تم تسجيل هذه الرسالة في السجل السريري للمريض ومركز الإشعارات'
                : 'This message has been logged in the patient record and notification center.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendNotification} className="space-y-4">
            {/* Quick Template Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">
                {isRtl ? 'اختيار قالب رسالة سريع' : 'Quick Template Select'}
              </label>
              <select
                value={selectedTemplateKey}
                onChange={handleTemplateChange}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-[#1e6bb8]"
              >
                <option value="">
                  {isRtl ? '-- اختيار قالب رسالة سريع --' : '-- Choose a quick template --'}
                </option>
                {DIRECT_PATIENT_TEMPLATES.map((tpl) => (
                  <option key={tpl.key} value={tpl.key}>
                    {isRtl ? tpl.labelAr : tpl.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient Details Pill */}
            <div className="px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-center justify-between">
              <span>
                <strong>{isRtl ? 'المريض المستهدف:' : 'Target Patient:'}</strong> {patient.fullName}{' '}
                {patient.fullNameAr ? `(${patient.fullNameAr})` : ''}
              </span>
              <span className="font-mono text-[11px] text-blue-700 font-bold">ID: {patient.id}</span>
            </div>

            <Input
              label={isRtl ? 'العنوان (إنجليزي)' : 'Title (EN)'}
              value={notifTitleEn}
              onChange={(e) => setNotifTitleEn(e.target.value)}
              placeholder="e.g. Dialysis session reminder"
              required={!notifTitleAr.trim()}
            />

            <Input
              label={isRtl ? 'العنوان (عربي)' : 'Title (AR)'}
              value={notifTitleAr}
              onChange={(e) => setNotifTitleAr(e.target.value)}
              placeholder="مثال: تذكير بموعد جلسة الغسيل الكلوي"
              required={!notifTitleEn.trim()}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'الرسالة (إنجليزي)' : 'Message (EN)'}
              </label>
              <textarea
                value={notifMsgEn}
                onChange={(e) => setNotifMsgEn(e.target.value)}
                rows={3}
                required={!notifMsgAr.trim()}
                placeholder="Compose clinical message in English..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'الرسالة (عربي)' : 'Message (AR)'}
              </label>
              <textarea
                value={notifMsgAr}
                onChange={(e) => setNotifMsgAr(e.target.value)}
                rows={3}
                required={!notifMsgEn.trim()}
                placeholder="اكتب التنبيه الطبي بالعربية..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={() => setNotifModalOpen(false)}>
                {tCommon('cancel') || 'Cancel'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                leftIcon={<MailIcon className="w-4 h-4" />}
                aria-label={isRtl ? 'إرسال للمريض / Send to Patient' : 'Send to Patient / إرسال للمريض'}
              >
                {isRtl ? 'إرسال للمريض' : 'Send to Patient'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Bilingual Lab Results Modal (R5) */}
      <PatientLabResultsModal
        isOpen={labModalOpen}
        onClose={() => setLabModalOpen(false)}
        patientId={patient.id}
        patientName={isRtl ? patient.fullNameAr || patient.fullName : patient.fullName}
        recordedBy={user?.displayName || user?.username || 'doctor'}
        existingRecord={selectedLabRecord}
        onSaved={() => {
          loadPatientData();
          setToastMessage(isRtl ? 'تم حفظ وتحديث نتائج التحاليل بنجاح ✅' : 'Lab results updated successfully ✅');
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
          }
          toastTimerRef.current = setTimeout(() => {
            setToastMessage(null);
            toastTimerRef.current = null;
          }, 3500);
        }}
      />

      {/* Dialysis Session Recording Modal (R2 - 14 Clinical Fields) */}
      <DialysisSessionModal
        isOpen={dialysisModalOpen}
        onClose={() => setDialysisModalOpen(false)}
        patientId={patient.id}
        patientName={isRtl ? patient.fullNameAr || patient.fullName : patient.fullName}
        recordedBy={user?.displayName || user?.username || 'doctor'}
        onSessionRecorded={(savedSession) => {
          loadPatientData();
          setToastMessage(
            isRtl
              ? `تم تسجيل جلسة الغسيل الكلوي (${savedSession.sessionDate}) بنجاح ✅`
              : `Dialysis session for ${savedSession.sessionDate} recorded successfully ✅`
          );
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
          }
          toastTimerRef.current = setTimeout(() => {
            setToastMessage(null);
            toastTimerRef.current = null;
          }, 3500);
        }}
      />
    </div>
  );
}
