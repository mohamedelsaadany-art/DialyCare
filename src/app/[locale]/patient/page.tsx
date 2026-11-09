'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getReminders,
  getAdherenceLogs,
  getFluidLogs,
  getDietLogs,
  getCoachingTips,
  getReminderTemplates,
  getPatients,
  getNotifications,
} from '@/lib/data-store';
import {
  getReminderStatus,
  recordReminderAdherence,
  filterPatientNotifications,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkAndTriggerLocalNotifications,
} from './patient-utils';
import type {
  PatientReminder,
  AdherenceLog,
  FluidLog,
  DietLog,
  CoachingTip,
  ReminderTemplate,
  Patient,
  Notification,
} from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InstallPwaPrompt } from '@/components/InstallPwaPrompt';
import { DialysisDayCard } from '@/components/DialysisDayCard';
import { DoctorNotificationsInboxModal } from '@/components/DoctorNotificationsInboxModal';

function formatNotifTime(sentAt?: Date | string | null, isAr: boolean = false): string {
  if (!sentAt) return isAr ? 'اليوم' : 'Today';
  try {
    const d = new Date(sentAt);
    if (isNaN(d.getTime())) return isAr ? 'اليوم' : 'Today';
    return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(d);
  } catch {
    return isAr ? 'اليوم' : 'Today';
  }
}

export default function PatientDashboardPage() {
  const { user } = useAuth();
  const locale = useLocale();
  const isAr = locale === 'ar';

  const tPatient = useTranslations('patient');

  const [patientRecord, setPatientRecord] = useState<Patient | null>(null);
  const [reminders, setReminders] = useState<PatientReminder[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);
  const [fluidLogs, setFluidLogs] = useState<FluidLog[]>([]);
  const [dietLogs, setDietLogs] = useState<DietLog[]>([]);
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [fluidLimit, setFluidLimit] = useState<number>(1000);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [isInboxOpen, setIsInboxOpen] = useState<boolean>(false);
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patientId = user?.uid || 'patient-1';

  // Load all daily metrics
  const loadData = React.useCallback(() => {
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
    const adh = getAdherenceLogs(activeId, undefined, {
      start: startOfToday.toISOString(),
      end: endOfToday.toISOString(),
    });
    const fl = getFluidLogs(activeId, todayStr);
    const dl = getDietLogs(activeId, todayStr);
    const ct = getCoachingTips().filter((t) => t.isActive);

    setReminders(r.length > 0 ? r : getReminders('patient-1'));
    setTemplates(tmpl);
    setAdherenceLogs(adh);
    setFluidLogs(fl);
    setDietLogs(dl);
    setTips(ct);

    // Read personalized fluid limit
    if (typeof window !== 'undefined') {
      const savedLimit = window.localStorage.getItem(`DIALYCARE_FLUID_LIMIT_${activeId}`);
      if (savedLimit) {
        setFluidLimit(parseInt(savedLimit, 10) || 1000);
      }
    }

    // Load and filter doctor notifications
    const allNotifs = getNotifications();
    const relevantNotifs = filterPatientNotifications(
      allNotifs,
      activeId,
      currentPatient?.dialysisSchedule,
      user?.uid
    );
    relevantNotifs.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    setNotifications(relevantNotifs);

    const readIds = getReadNotificationIds(activeId);
    setReadNotificationIds(readIds);

    // Check and trigger local notification for unread alerts
    checkAndTriggerLocalNotifications(activeId, relevantNotifs, isAr);
  }, [patientId, user?.uid, isAr]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Synchronize on cross-tab or local notification events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'DIALYCARE_NOTIFICATIONS' ||
        e.key === `DIALYCARE_READ_NOTIFICATIONS_${patientId}`
      ) {
        loadData();
      }
    };
    const handleCustomUpdate = () => {
      loadData();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dialycare_notifications_updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dialycare_notifications_updated', handleCustomUpdate);
    };
  }, [loadData, patientId]);

  // Doctor Notifications computation
  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationIds);
    return notifications.filter((n) => !readSet.has(n.id));
  }, [notifications, readNotificationIds]);

  const unreadCount = unreadNotifications.length;
  const latestUnread = unreadNotifications[0] || null;

  const handleMarkAsRead = (id: string) => {
    const activeId = patientRecord?.id || patientId;
    const updated = markNotificationAsRead(activeId, id);
    setReadNotificationIds(updated);
  };

  const handleMarkAllAsRead = () => {
    const activeId = patientRecord?.id || patientId;
    const allIds = notifications.map((n) => n.id);
    const updated = markAllNotificationsAsRead(activeId, allIds);
    setReadNotificationIds(updated);
  };

  const handleOpenInbox = (id?: string) => {
    setSelectedNotifId(id || null);
    setIsInboxOpen(true);
  };

  // Greeting by time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return isAr ? 'صباح الخير' : 'Good morning';
    }
    if (hour < 17) {
      return isAr ? 'مساء الخير' : 'Good afternoon';
    }
    return isAr ? 'مساء الخير' : 'Good evening';
  }, [isAr]);

  // Current Date formatted
  const formattedDate = useMemo(() => {
    const today = new Date();
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(today);
  }, [locale]);

  // Today's total active reminders
  const activeReminders = useMemo(() => reminders.filter((r) => r.isActive), [reminders]);

  // Calculate status of each active reminder
  const processedReminders = useMemo(() => {
    return activeReminders.map((r) => {
      const tpl = templates.find((t) => t.id === r.templateId);
      const res = getReminderStatus(r, adherenceLogs, fluidLogs, dietLogs, templates);
      const parts = r.time.split(':');
      const minutes = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);

      const title = isAr
        ? tpl?.titleAr ||
          (r.type === 'ttt'
            ? 'تناول الدواء'
            : r.type === 'fluid'
            ? 'متابعة السوائل'
            : 'تسجيل الوجبة')
        : tpl?.titleEn ||
          (r.type === 'ttt'
            ? 'Take Medication'
            : r.type === 'fluid'
            ? 'Fluid Check'
            : 'Diet Log');

      return {
        ...r,
        title,
        status: res.status,
        isDone: res.status === 'done',
        minutes,
      };
    });
  }, [activeReminders, adherenceLogs, fluidLogs, dietLogs, templates, isAr]);

  // Medication (TTT) stats - counts unique completed medication reminders
  const medStats = useMemo(() => {
    const medReminders = processedReminders.filter((r) => r.type === 'ttt');
    const total = medReminders.length;
    const completed = medReminders.filter((r) => r.isDone).length;
    return {
      total,
      completed,
      ratio: total > 0 ? completed / total : 1,
    };
  }, [processedReminders]);

  // Fluid stats
  const fluidStats = useMemo(() => {
    const totalConsumed = fluidLogs.reduce((sum, item) => sum + item.amountMl, 0);
    const percentage = Math.min(100, Math.round((totalConsumed / fluidLimit) * 100));
    return {
      totalConsumed,
      limit: fluidLimit,
      percentage,
      isOver: totalConsumed > fluidLimit,
    };
  }, [fluidLogs, fluidLimit]);

  // Diet stats
  const dietStats = useMemo(() => {
    const mealsLogged = dietLogs.length;
    const targetMeals = 3;
    return {
      mealsLogged,
      targetMeals,
      ratio: Math.min(1, mealsLogged / targetMeals),
    };
  }, [dietLogs]);

  // Overall Adherence Score % (completed vs total reminders today)
  const adherenceScore = useMemo(() => {
    if (processedReminders.length === 0) return 100;
    const completedCount = processedReminders.filter((r) => r.isDone).length;
    return Math.min(100, Math.round((completedCount / processedReminders.length) * 100));
  }, [processedReminders]);

  // Next Upcoming Pending Reminder
  const nextReminder = useMemo(() => {
    if (processedReminders.length === 0) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Sort by scheduled time
    const sorted = [...processedReminders].sort((a, b) => a.minutes - b.minutes);

    // Look for next pending reminder today that hasn't passed or is closest upcoming
    const upcomingPending = sorted.find((r) => !r.isDone && r.minutes >= currentMinutes);
    if (upcomingPending) return upcomingPending;

    // Any remaining pending or missed reminder today that user can still complete
    const anyPending = sorted.find((r) => !r.isDone);
    if (anyPending) return anyPending;

    return null;
  }, [processedReminders]);

  // Daily Coaching Tip (rotates daily based on day of year)
  const dailyTip = useMemo(() => {
    if (tips.length === 0) return null;
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    const index = Math.abs(dayOfYear) % tips.length;
    return tips[index];
  }, [tips]);

  // Quick complete next reminder
  const handleQuickComplete = (rem: NonNullable<typeof nextReminder>) => {
    startTransition(() => {
      recordReminderAdherence({
        patientId,
        reminderId: rem.id,
        type: rem.type,
        status: 'done',
        title: rem.title,
      });
      loadData();
    });
  };

  // SVG circular progress calculation
  const circleRadius = 58;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (circleCircumference * adherenceScore) / 100;

  // Name extraction (first name localized)
  const patientFirstName = useMemo(() => {
    if (isAr) {
      if (patientRecord?.fullNameAr) {
        return patientRecord.fullNameAr.split(' ')[0];
      }
      return 'أحمد';
    }
    if (patientRecord?.fullName) {
      return patientRecord.fullName.split(' ')[0];
    }
    return user?.displayName?.split(' ')[0] || user?.username || 'Patient';
  }, [isAr, patientRecord, user]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ttt':
        return isAr ? 'أدوية' : 'Medication';
      case 'fluid':
        return isAr ? 'سوائل' : 'Fluid';
      case 'diet':
        return isAr ? 'تغذية' : 'Diet';
      default:
        return isAr ? 'تذكير' : 'Reminder';
    }
  };

  const getTypeIcon = (type: string) => {
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

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* PWA Install Prompt Banner */}
      <InstallPwaPrompt />

      {/* Header Greeting Banner with Doctor Notification Bell */}
      <section className="bg-gradient-to-br from-[#1e6bb8] to-[#155392] text-white p-5 rounded-3xl shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">
              {formattedDate}
            </p>
            <h1 className="text-2xl font-black mt-1 tracking-tight truncate">
              {greeting}, {patientFirstName} 👋
            </h1>
            <p className="text-blue-100/90 text-sm mt-1 leading-snug">
              {tPatient('goodJob') || (isAr ? 'أنت تقوم بعمل رائع للحفاظ على صحتك!' : 'Great job taking care of your health!')}
            </p>
          </div>

          {/* Interactive Notification Bell with unread counter badge */}
          <button
            type="button"
            onClick={() => handleOpenInbox()}
            aria-label={
              isAr
                ? `رسائل الفريق الطبي (${unreadCount} غير مقروء)`
                : `Doctor updates (${unreadCount} unread)`
            }
            className="relative p-3 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white backdrop-blur-xs flex items-center justify-center min-w-[48px] min-h-[48px] cursor-pointer shadow-inner border border-white/20 shrink-0"
          >
            <span className="text-2xl" role="img" aria-hidden="true">
              🔔
            </span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white shadow-sm animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* Eye-Catching Doctor Update Alert Banner (when unread doctor messages exist) */}
      {unreadCount > 0 && latestUnread && (
        <div
          role="alert"
          aria-live="polite"
          className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 shadow-md animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shrink-0 shadow-sm mt-0.5">
                🩺
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-amber-900 uppercase tracking-wider">
                    {isAr ? 'رسالة من الفريق الطبي' : 'Doctor Update'}
                  </span>
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ring-1 ring-white">
                    {unreadCount} {isAr ? 'رسائل جديدة' : 'New Messages'}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-1 truncate leading-snug">
                  {isAr
                    ? latestUnread.titleAr || latestUnread.titleEn
                    : latestUnread.titleEn || latestUnread.titleAr}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed font-medium">
                  {isAr
                    ? latestUnread.messageAr || latestUnread.messageEn
                    : latestUnread.messageEn || latestUnread.messageAr}
                </p>
                <p className="text-[11px] text-amber-800 font-bold mt-1.5 flex items-center gap-1.5">
                  <span>🕒</span>
                  <span>{formatNotifTime(latestUnread.sentAt, isAr)}</span>
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleOpenInbox(latestUnread.id)}
              className="shrink-0 font-extrabold text-xs min-h-[42px] px-3.5 shadow-sm"
            >
              {isAr ? 'عرض الرسالة' : 'View Message'}
            </Button>
          </div>
        </div>
      )}

      {/* Dialysis Day vs Non-Dialysis Day Smart Awareness Card */}
      <DialysisDayCard dialysisSchedule={patientRecord?.dialysisSchedule} />

      {/* Today's Overall Progress Ring */}
      <Card className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40 flex items-center justify-center my-2">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
              {/* Background track */}
              <circle
                cx="70"
                cy="70"
                r={circleRadius}
                className="stroke-slate-100"
                strokeWidth="12"
                fill="transparent"
              />
              {/* Animated Progress ring */}
              <circle
                cx="70"
                cy="70"
                r={circleRadius}
                className="transition-all duration-700 ease-out"
                stroke={adherenceScore >= 80 ? '#10b981' : adherenceScore >= 50 ? '#1e6bb8' : '#ef4444'}
                strokeWidth="12"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {adherenceScore}%
              </span>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {tPatient('todayAdherence') || (isAr ? 'التزام اليوم' : 'Adherence')}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-600 mt-2 font-medium">
            {processedReminders.length === 0
              ? (isAr ? 'لا توجد مهام مجدولة لهذا اليوم' : 'No tasks scheduled for today')
              : adherenceScore === 100
              ? (isAr ? '🎉 أحسنت! أتممت جميع المهام المقررة لليوم' : '🎉 Fantastic! All reminders completed today')
              : (isAr ? 'أكمل ما تبقى من التنبيهات لتحقيق 100%' : 'Complete your pending tasks to reach 100%')}
          </p>
        </div>
      </Card>

      {/* Quick Status Cards (3 cards in a row) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* TTT Status Card: "X/Y medications taken" with green/yellow/red indicator */}
        <Link
          href={`/${locale}/patient/log?tab=medication`}
          className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-[#1e6bb8] transition-all flex flex-col justify-between min-h-[118px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl" role="img" aria-label="Medication">💊</span>
            <span
              className={`w-3 h-3 rounded-full ${
                medStats.total > 0 && medStats.completed === medStats.total
                  ? 'bg-emerald-500 ring-2 ring-emerald-200'
                  : medStats.completed > 0
                  ? 'bg-amber-500 ring-2 ring-amber-200'
                  : medStats.total === 0
                  ? 'bg-slate-300'
                  : 'bg-red-500 ring-2 ring-red-200'
              }`}
              title={
                medStats.completed === medStats.total
                  ? 'Complete'
                  : medStats.completed > 0
                  ? 'In Progress'
                  : 'Needs Attention'
              }
            />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
              {isAr ? 'أدوية TTT' : 'TTT Meds'}
            </p>
            <p className="text-base font-black text-slate-900 leading-tight">
              {medStats.completed}/{medStats.total}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold leading-tight mt-0.5">
              {isAr ? 'أدوية متناولة' : 'medications taken'}
            </p>
          </div>
        </Link>

        {/* Fluid Status Card: "X mL / Y mL limit" with progress bar */}
        <Link
          href={`/${locale}/patient/log?tab=fluid`}
          className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-[#1e6bb8] transition-all flex flex-col justify-between min-h-[118px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl" role="img" aria-label="Fluid">💧</span>
            <span
              className={`w-3 h-3 rounded-full ${
                fluidStats.percentage <= 70
                  ? 'bg-emerald-500 ring-2 ring-emerald-200'
                  : fluidStats.percentage <= 90
                  ? 'bg-amber-500 ring-2 ring-amber-200'
                  : 'bg-red-500 ring-2 ring-red-200'
              }`}
              title={`${fluidStats.percentage}% consumed`}
            />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
              {isAr ? 'السوائل' : 'Fluid'}
            </p>
            <p className="text-sm font-black text-slate-900 truncate leading-tight">
              {fluidStats.totalConsumed} / {fluidStats.limit}
              <span className="text-[10px] font-semibold text-slate-500 ms-0.5">mL</span>
            </p>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  fluidStats.percentage <= 70
                    ? 'bg-emerald-500'
                    : fluidStats.percentage <= 90
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, fluidStats.percentage)}%` }}
              />
            </div>
          </div>
        </Link>

        {/* Diet Status Card: "X/Y meals logged" with green/yellow/red indicator */}
        <Link
          href={`/${locale}/patient/log?tab=diet`}
          className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-[#1e6bb8] transition-all flex flex-col justify-between min-h-[118px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl" role="img" aria-label="Diet">🥗</span>
            <span
              className={`w-3 h-3 rounded-full ${
                dietStats.mealsLogged >= 3
                  ? 'bg-emerald-500 ring-2 ring-emerald-200'
                  : dietStats.mealsLogged > 0
                  ? 'bg-amber-500 ring-2 ring-amber-200'
                  : 'bg-red-500 ring-2 ring-red-200'
              }`}
              title={
                dietStats.mealsLogged >= 3
                  ? 'Goal reached'
                  : dietStats.mealsLogged > 0
                  ? 'In progress'
                  : 'Not logged'
              }
            />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
              {isAr ? 'الوجبات' : 'Diet'}
            </p>
            <p className="text-base font-black text-slate-900 leading-tight">
              {dietStats.mealsLogged}/{dietStats.targetMeals}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold leading-tight mt-0.5">
              {isAr ? 'وجبات مسجلة' : 'meals logged'}
            </p>
          </div>
        </Link>
      </div>

      {/* Next Upcoming Reminder */}
      <Card className="p-5 border-l-4 border-l-[#1e6bb8] rtl:border-l-0 rtl:border-r-4 rtl:border-r-[#1e6bb8] bg-white rounded-2xl shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center text-2xl shrink-0">
              {nextReminder ? getTypeIcon(nextReminder.type) : '🎉'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'التنبيه القادم' : 'Next Reminder'}
                </p>
                {nextReminder && (
                  <Badge variant="info" size="sm" className="font-bold">
                    {getTypeLabel(nextReminder.type)}
                  </Badge>
                )}
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5 leading-snug">
                {nextReminder
                  ? nextReminder.title
                  : isAr
                  ? 'أحسنت! لا توجد تنبيهات متبقية اليوم'
                  : 'All reminders done for today!'}
              </h3>
              {nextReminder && (
                <p className="text-xs font-extrabold text-[#1e6bb8] mt-0.5">
                  🕒 {nextReminder.time}
                </p>
              )}
            </div>
          </div>

          {nextReminder && !nextReminder.isDone && (
            <Button
              size="md"
              variant="success"
              onClick={() => handleQuickComplete(nextReminder)}
              disabled={isPending}
              className="shrink-0 font-extrabold min-h-[48px]"
            >
              {isAr ? 'تم ✅' : 'Done ✅'}
            </Button>
          )}
        </div>
      </Card>

      {/* Quick Action Buttons (Large buttons linking to respective forms) */}
      <section className="space-y-2">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider px-1">
          {tPatient('quickActions') || (isAr ? 'تسجيل سريع' : 'Quick Actions')}
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          <Link
            href={`/${locale}/patient/log?tab=medication`}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-blue-50/50 hover:border-[#1e6bb8] active:scale-95 transition-all min-h-[58px]"
          >
            <span className="text-xl">💊</span>
            <span className="text-xs font-black text-slate-900 mt-1 text-center">
              {isAr ? 'تسجيل الدواء' : 'Log Medication'}
            </span>
          </Link>

          <Link
            href={`/${locale}/patient/log?tab=fluid`}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-blue-50/50 hover:border-[#1e6bb8] active:scale-95 transition-all min-h-[58px]"
          >
            <span className="text-xl">💧</span>
            <span className="text-xs font-black text-slate-900 mt-1 text-center">
              {isAr ? 'تسجيل السوائل' : 'Log Fluid'}
            </span>
          </Link>

          <Link
            href={`/${locale}/patient/log?tab=diet`}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-blue-50/50 hover:border-[#1e6bb8] active:scale-95 transition-all min-h-[58px]"
          >
            <span className="text-xl">🥗</span>
            <span className="text-xs font-black text-slate-900 mt-1 text-center">
              {isAr ? 'تسجيل الوجبة' : 'Log Diet'}
            </span>
          </Link>
        </div>
      </section>

      {/* Daily Coaching Tip */}
      {dailyTip && (
        <Card className="p-5 bg-gradient-to-r from-emerald-50/70 to-blue-50/70 border border-emerald-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💡</span>
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                {isAr ? 'نصيحة اليوم الطبية' : 'Daily Coaching Tip'}
              </span>
            </div>
            <Badge variant="success" size="sm" className="font-bold uppercase">
              {dailyTip.category}
            </Badge>
          </div>
          <h4 className="text-base font-extrabold text-slate-900 leading-snug">
            {isAr ? dailyTip.titleAr : dailyTip.titleEn}
          </h4>
          <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
            {isAr ? dailyTip.contentAr : dailyTip.contentEn}
          </p>
          <div className="mt-3 flex justify-end">
            <Link
              href={`/${locale}/patient/tips`}
              className="text-xs font-bold text-[#1e6bb8] hover:underline flex items-center gap-1 min-h-[48px] py-2 px-1"
            >
              <span>{isAr ? 'قراءة المزيد من النصائح' : 'Read more coaching tips'}</span>
              <span aria-hidden="true">{isAr ? '←' : '→'}</span>
            </Link>
          </div>
        </Card>
      )}

      {/* Interactive Doctor Notifications Inbox Modal */}
      <DoctorNotificationsInboxModal
        isOpen={isInboxOpen}
        onClose={() => {
          setIsInboxOpen(false);
          setSelectedNotifId(null);
        }}
        notifications={notifications}
        readIds={readNotificationIds}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        selectedNotificationId={selectedNotifId}
      />
    </div>
  );
}
