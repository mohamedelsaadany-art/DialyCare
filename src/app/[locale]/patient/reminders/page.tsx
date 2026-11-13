'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getReminders,
  getReminderTemplates,
  getAdherenceLogs,
  getFluidLogs,
  getDietLogs,
  getPatients,
} from '@/lib/data-store';
import { getReminderStatus, recordReminderAdherence } from '../patient-utils';
import type {
  PatientReminder,
  ReminderTemplate,
  AdherenceLog,
  FluidLog,
  DietLog,
  ReminderType,
  Patient,
} from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DialysisDayCard } from '@/components/DialysisDayCard';
import { PatientNotificationPermissionBanner } from '@/components/patient/PatientNotificationPermissionBanner';
import { scheduleLocalReminder, cancelScheduledReminder } from '@/lib/notifications';

interface FormattedReminder {
  id: string;
  templateId?: string;
  type: ReminderType;
  time: string;
  title: string;
  message: string;
  status: 'pending' | 'done' | 'skipped' | 'missed';
  timeSlot: 'morning' | 'afternoon' | 'evening';
  minutes: number;
  logId?: string;
}

export default function PatientRemindersPage() {
  const { user } = useAuth();
  const locale = useLocale();
  const isAr = locale === 'ar';

  const tReminders = useTranslations('reminders');
  const tCommon = useTranslations('common');

  const [patientRecord, setPatientRecord] = useState<Patient | null>(null);
  const [reminders, setReminders] = useState<PatientReminder[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);
  const [fluidLogs, setFluidLogs] = useState<FluidLog[]>([]);
  const [dietLogs, setDietLogs] = useState<DietLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedReminder, setSelectedReminder] = useState<FormattedReminder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const patientId = user?.uid || 'patient-1';

  const fetchData = React.useCallback(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const allPatients = getPatients();
    const currentPatient =
      allPatients.find((p) => p.id === patientId) ||
      allPatients.find((p) => p.fullName.toLowerCase().includes('ahmed')) ||
      allPatients[0] ||
      null;
    setPatientRecord(currentPatient);

    const activeId = currentPatient?.id || patientId;

    const r = getReminders(activeId);
    const tmpl = getReminderTemplates();
    const logs = getAdherenceLogs(activeId, undefined, {
      start: startOfToday.toISOString(),
      end: endOfToday.toISOString(),
    });
    const fl = getFluidLogs(activeId, todayStr);
    const dl = getDietLogs(activeId, todayStr);

    const fallbackReminders =
      r.length > 0
        ? r
        : tmpl.map((t) => ({
            id: `rem_${activeId}_${t.id}`,
            patientId: activeId,
            templateId: t.id,
            type: t.type,
            time: t.defaultTime,
            isActive: true,
            useCustomSchedule: false,
          }));
    setReminders(fallbackReminders);
    setTemplates(tmpl);
    setAdherenceLogs(logs);
    setFluidLogs(fl);
    setDietLogs(dl);
  }, [patientId]);

  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  // Schedule today's pending reminders via browser notifications
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;

    const timerIds: number[] = [];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    reminders.filter((r) => r.isActive).forEach((r) => {
      const parts = r.time.split(':');
      const remMinutes = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);

      if (remMinutes > currentMinutes) {
        const diffMs = (remMinutes - currentMinutes) * 60 * 1000;
        const title = isAr
          ? (r.type === 'ttt' ? '💊 موعد تناول الدواء — وَصْلِتي' : r.type === 'fluid' ? '💧 متابعة السوائل — وَصْلِتي' : '🍽️ موعد الوجبة ورابط الفوسفات — وَصْلِتي')
          : (r.type === 'ttt' ? '💊 Medication Reminder — Waslity' : r.type === 'fluid' ? '💧 Fluid Check Reminder — Waslity' : '🍽️ Meal & Phosphate Binder — Waslity');
        const body = isAr
          ? `حان موعد تذكير الساعة ${r.time}. يرجى فتحه وتسجيله في تطبيقك.`
          : `Reminder scheduled for ${r.time}. Please record your adherence in Waslity.`;

        const id = scheduleLocalReminder(title, body, diffMs);
        if (id >= 0) timerIds.push(id);
      }
    });

    return () => {
      timerIds.forEach((id) => cancelScheduledReminder(id));
    };
  }, [reminders, isAr]);

  // Group and determine individual status for all reminders today
  const processedReminders = useMemo(() => {
    return reminders
      .filter((r) => r.isActive)
      .map((r) => {
        const tpl = templates.find((t) => t.id === r.templateId);
        const [hoursStr, minutesStr] = r.time.split(':');
        const hours = parseInt(hoursStr, 10) || 0;
        const minutesNum = parseInt(minutesStr, 10) || 0;
        const totalMinutes = hours * 60 + minutesNum;

        // Determine Time of Day group
        let timeSlot: 'morning' | 'afternoon' | 'evening' = 'morning';
        if (hours >= 12 && hours < 17) {
          timeSlot = 'afternoon';
        } else if (hours >= 17) {
          timeSlot = 'evening';
        }

        // Title and message
        const title = isAr
          ? tpl?.titleAr ||
            (r.type === 'ttt'
              ? 'تناول الدواء المقرر'
              : r.type === 'fluid'
              ? 'متابعة شرب السوائل'
              : 'تسجيل الوجبة الغذائية')
          : tpl?.titleEn ||
            (r.type === 'ttt'
              ? 'Take Medication'
              : r.type === 'fluid'
              ? 'Track Fluid Intake'
              : 'Log Meal Diet');

        const message = isAr
          ? tpl?.messageAr || 'تنبيه صحي مجدول لمساعدتك في الحفاظ على صحة الكلى.'
          : tpl?.messageEn || 'Scheduled health reminder for optimal hemodialysis adherence.';

        // Accurately determine status
        const statusResult = getReminderStatus(r, adherenceLogs, fluidLogs, dietLogs, templates);

        return {
          id: r.id,
          templateId: r.templateId,
          type: r.type,
          time: r.time,
          title,
          message,
          status: statusResult.status,
          timeSlot,
          minutes: totalMinutes,
          logId: statusResult.logId,
        };
      })
      .sort((a, b) => a.minutes - b.minutes);
  }, [reminders, templates, adherenceLogs, fluidLogs, dietLogs, isAr]);

  // Grouped by slot
  const morningReminders = useMemo(
    () => processedReminders.filter((r) => r.timeSlot === 'morning'),
    [processedReminders]
  );
  const afternoonReminders = useMemo(
    () => processedReminders.filter((r) => r.timeSlot === 'afternoon'),
    [processedReminders]
  );
  const eveningReminders = useMemo(
    () => processedReminders.filter((r) => r.timeSlot === 'evening'),
    [processedReminders]
  );

  const openActionDialog = (rem: FormattedReminder) => {
    setSelectedReminder(rem);
    setIsModalOpen(true);
  };

  const handleUpdateStatus = (newStatus: 'done' | 'skipped') => {
    if (!selectedReminder) return;

    const activeId = patientRecord?.id || patientId;

    startTransition(() => {
      recordReminderAdherence({
        patientId: activeId,
        reminderId: selectedReminder.id,
        type: selectedReminder.type,
        status: newStatus,
        title: selectedReminder.title,
      });

      fetchData();
      setIsModalOpen(false);
      setSelectedReminder(null);
    });
  };

  const getTypeIcon = (type: ReminderType) => {
    switch (type) {
      case 'ttt':
        return '💊';
      case 'fluid':
        return '💧';
      case 'diet':
        return '🥗';
      default:
        return '🔔';
    }
  };

  const renderStatusBadge = (status: FormattedReminder['status']) => {
    switch (status) {
      case 'done':
        return (
          <Badge variant="success" size="sm" className="font-extrabold">
            {isAr ? 'تم الإنجاز ✅' : 'Completed ✅'}
          </Badge>
        );
      case 'skipped':
        return (
          <Badge variant="warning" size="sm" className="font-extrabold">
            {isAr ? 'تم التخطي ⏭️' : 'Skipped ⏭️'}
          </Badge>
        );
      case 'missed':
        return (
          <Badge variant="danger" size="sm" className="font-extrabold">
            {isAr ? 'فائت ❌' : 'Missed ❌'}
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="neutral" size="sm" className="font-bold text-slate-700">
            {isAr ? 'قيد الانتظار ⏳' : 'Pending ⏳'}
          </Badge>
        );
    }
  };

  const getCardStyle = (status: FormattedReminder['status']) => {
    switch (status) {
      case 'done':
        return 'bg-emerald-50/70 border-emerald-200 text-slate-900';
      case 'skipped':
        return 'bg-amber-50/70 border-amber-200 text-slate-900';
      case 'missed':
        return 'bg-red-50/70 border-red-200 text-slate-900';
      case 'pending':
      default:
        return 'bg-white border-slate-200/90 hover:border-[#1e6bb8] text-slate-900';
    }
  };

  const renderReminderList = (list: FormattedReminder[], sectionTitle: string, icon: string) => {
    if (list.length === 0) return null;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <span className="text-lg">{icon}</span>
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
            {sectionTitle} ({list.length})
          </h2>
        </div>

        <div className="space-y-2">
          {list.map((rem) => (
            <div
              key={rem.id}
              role="button"
              tabIndex={0}
              onClick={() => openActionDialog(rem)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openActionDialog(rem);
                }
              }}
              className={`
                p-4 rounded-2xl border transition-all duration-150 cursor-pointer shadow-xs select-none
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e6bb8] min-h-[58px]
                ${getCardStyle(rem.status)}
              `}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/95 border border-slate-100 flex items-center justify-center text-2xl shrink-0 shadow-xs">
                    {getTypeIcon(rem.type)}
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold tracking-tight text-slate-900 leading-snug">
                      {rem.title}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono">🕒 {rem.time}</span>
                      <span>•</span>
                      <span className="capitalize">{rem.type}</span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {renderStatusBadge(rem.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header with Title and Pull-to-refresh Button */}
      <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            {tReminders('title') || (isAr ? 'تنبيهات اليوم' : "Today's Reminders")}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isAr
              ? 'اضغط على أي تنبيه لتسجيل إنجازه أو تخطيه'
              : 'Tap any reminder to confirm or skip'}
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="min-h-[48px] gap-1.5 shrink-0 px-3.5"
          aria-label={isAr ? 'تحديث' : 'Refresh'}
        >
          <svg
            className={`w-4 h-4 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-xs font-bold">{tCommon('refresh') || (isAr ? 'تحديث' : 'Refresh')}</span>
        </Button>
      </div>

      {/* Device Notification Status / Request Banner */}
      <PatientNotificationPermissionBanner compact onPermissionGranted={() => fetchData()} />

      {/* Dialysis Day vs Non-Dialysis Day Smart Awareness Card */}
      <DialysisDayCard dialysisSchedule={patientRecord?.dialysisSchedule} />

      {/* Reminders List by Time Slot */}
      {processedReminders.length === 0 ? (
        <Card className="p-8 text-center bg-white rounded-3xl border border-slate-200">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-base font-bold text-slate-900">
            {tReminders('noReminders') || (isAr ? 'لا توجد تنبيهات مجدولة' : 'No reminders scheduled')}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isAr ? 'جميع المهام مكتملة لهذا اليوم' : 'You are all caught up for today!'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {renderReminderList(
            morningReminders,
            isAr ? 'تنبيهات الصباح' : 'Morning Reminders',
            '🌅'
          )}
          {renderReminderList(
            afternoonReminders,
            isAr ? 'تنبيهات الظهيرة' : 'Afternoon Reminders',
            '☀️'
          )}
          {renderReminderList(
            eveningReminders,
            isAr ? 'تنبيهات المساء' : 'Evening Reminders',
            '🌙'
          )}
        </div>
      )}

      {/* Reminder Action Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          selectedReminder ? (
            <div className="flex items-center gap-2">
              <span>{getTypeIcon(selectedReminder.type)}</span>
              <span>{selectedReminder.title}</span>
            </div>
          ) : undefined
        }
      >
        {selectedReminder && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm">
              <p className="text-slate-700 leading-relaxed font-medium">
                {selectedReminder.message}
              </p>
              <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>🕒 {isAr ? 'الموعد المحدد:' : 'Scheduled Time:'} {selectedReminder.time}</span>
                <span>{renderStatusBadge(selectedReminder.status)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 text-center font-bold">
              {isAr
                ? 'هل أتممت هذا التنبيه الطبي بنجاح؟'
                : 'Did you successfully complete this health task?'}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="success"
                size="lg"
                onClick={() => handleUpdateStatus('done')}
                disabled={isPending}
                className="font-extrabold min-h-[52px]"
              >
                {isAr ? 'أنجزته ✅' : 'I did it ✅'}
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => handleUpdateStatus('skipped')}
                disabled={isPending}
                className="font-extrabold min-h-[52px] text-amber-700 hover:bg-amber-50 border-amber-200"
              >
                {isAr ? 'تخطيته ⏭️' : 'I skipped ⏭️'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
