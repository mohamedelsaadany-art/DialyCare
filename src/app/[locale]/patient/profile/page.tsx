'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getPatients,
  updatePatient,
  getAdherenceLogs,
  getFluidLogs,
  getDietLogs,
} from '@/lib/data-store';
import {
  requestNotificationPermission,
  showLocalNotification,
} from '@/lib/notifications';
import type { Patient } from '@/lib/types';
import { getDialysisScheduleFullLabel } from '@/app/[locale]/patient/patient-utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { PatientAvatarSvg } from '@/components/avatar/PatientAvatarPresets';
import { AvatarStyleSelectorModal } from '@/components/avatar/AvatarStyleSelectorModal';

export default function PatientProfilePage() {
  const { user, logout } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const isAr = locale === 'ar';

  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');

  const patientId = user?.uid || 'patient-1';

  const [patientRecord, setPatientRecord] = useState<Patient | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState<boolean>(false);
  const [fluidLimitInput, setFluidLimitInput] = useState<string>('');
  const [isLimitSaved, setIsLimitSaved] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  const limitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedLimitForIdRef = React.useRef<string | null>(null);

  // Adherence rates state
  const [weeklyRates, setWeeklyRates] = useState<{
    medRate: number;
    fluidRate: number;
    dietRate: number;
  }>({ medRate: 85, fluidRate: 80, dietRate: 75 });

  const activePatientId = patientRecord?.id || patientId;
  const activeFluidLimitKey = `DIALYCARE_FLUID_LIMIT_${activePatientId}`;

  const loadProfileMetrics = React.useCallback(() => {
    // Load patient data
    const allPatients = getPatients();
    const current =
      allPatients.find((p) => p.id === patientId) ||
      allPatients.find((p) => p.fullName.toLowerCase().includes('ahmed')) ||
      allPatients[0] ||
      null;
    if (current) {
      setPatientRecord(current);
    }

    const activeId = current?.id || patientId;
    const resolvedFluidLimitKey = `DIALYCARE_FLUID_LIMIT_${activeId}`;

    // Load saved fluid limit once per resolved patient (do not overwrite active typing)
    const fallbackFluidLimit =
      current?.fluidLimit && current.fluidLimit > 0 ? String(current.fluidLimit) : '';
    let savedFluidLimit = fallbackFluidLimit;
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(resolvedFluidLimitKey);
      if (saved) {
        savedFluidLimit = saved;
      }
      if (loadedLimitForIdRef.current !== activeId) {
        loadedLimitForIdRef.current = activeId;
        setFluidLimitInput(saved || fallbackFluidLimit);
      }
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }

    // Calculate weekly adherence metrics (past 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const now = new Date();
    const adh = getAdherenceLogs(activeId, undefined, {
      start: sevenDaysAgo.toISOString(),
      end: now.toISOString(),
    });

    // Med adherence
    const medLogs = adh.filter((l) => l.type === 'ttt');
    const medDone = medLogs.filter((l) => l.status === 'done').length;
    const medRate = medLogs.length > 0 ? Math.round((medDone / medLogs.length) * 100) : 90;

    // Fluid adherence (past 7 days)
    const allFluid = getFluidLogs(activeId);
    const recentFluid = allFluid.filter((fl) => new Date(fl.loggedAt) >= sevenDaysAgo);
    const limitNum = parseInt(savedFluidLimit, 10) || 1000;
    const dayTotals: Record<string, number> = {};
    recentFluid.forEach((fl) => {
      const d = new Date(fl.loggedAt).toISOString().slice(0, 10);
      dayTotals[d] = (dayTotals[d] || 0) + fl.amountMl;
    });
    const daysTracked = Object.keys(dayTotals).length;
    const compliantDays = Object.values(dayTotals).filter((total) => total <= limitNum).length;
    const fluidRate = daysTracked > 0 ? Math.round((compliantDays / daysTracked) * 100) : 85;

    // Diet adherence (past 7 days)
    const allDiet = getDietLogs(activeId);
    const recentDiet = allDiet.filter((dl) => new Date(dl.loggedAt) >= sevenDaysAgo);
    const targetWeekMeals = 21; // 3 meals * 7 days
    const computedDietRate = Math.min(100, Math.round((recentDiet.length / targetWeekMeals) * 100));
    const dietRate = recentDiet.length > 0 ? computedDietRate : 80;

    setWeeklyRates({
      medRate,
      fluidRate,
      dietRate,
    });
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfileMetrics();
    const handleAvatarUpdated = () => loadProfileMetrics();
    window.addEventListener('dialycare_avatar_updated', handleAvatarUpdated);
    window.addEventListener('dialycare_patient_updated', handleAvatarUpdated);
    return () => {
      window.removeEventListener('dialycare_avatar_updated', handleAvatarUpdated);
      window.removeEventListener('dialycare_patient_updated', handleAvatarUpdated);
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, [loadProfileMetrics]);

  const handleSaveFluidLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(fluidLimitInput, 10);
    if (isNaN(val) || val <= 0) return;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(activeFluidLimitKey, String(val));
    }
    updatePatient(activePatientId, { fluidLimit: val });
    loadProfileMetrics();
    setIsLimitSaved(true);
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = setTimeout(() => setIsLimitSaved(false), 3000);
  };

  const handleToggleNotifications = async () => {
    const res = await requestNotificationPermission();
    setNotificationPermission(res);

    if (res === 'granted') {
      showLocalNotification(
        isAr ? 'تنبيهات دايلي كير مفعلة 🔔' : 'DialyCare Notifications Enabled 🔔',
        isAr
          ? 'ستصلك تنبيهات دورية بمواعيد الأدوية والسوائل'
          : 'You will receive reminders for scheduled medications & fluid limits.'
      );
      setNotifFeedback(isAr ? 'تم تفعيل التنبيهات بنجاح!' : 'Notifications enabled!');
    } else {
      setNotifFeedback(isAr ? 'تم رفض إذن التنبيهات من المتصفح.' : 'Permission denied by browser.');
    }

    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotifFeedback(null), 4000);
  };

  const handleLogout = () => {
    logout();
    router.push(`/${locale}/login`);
  };

  const scheduleLabel = useMemo(() => {
    return getDialysisScheduleFullLabel(patientRecord?.dialysisSchedule, isAr);
  }, [patientRecord?.dialysisSchedule, isAr]);

  const fullNameDisplay = useMemo(() => {
    if (isAr) {
      return patientRecord?.fullNameAr || patientRecord?.fullName || user?.displayName || 'مريض دايلي كير';
    }
    return patientRecord?.fullName || user?.displayName || 'DialyCare Patient';
  }, [isAr, patientRecord, user]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Profile Header: Patient name (large), username */}
      <div className="p-6 bg-gradient-to-br from-[#1e6bb8] to-[#155392] text-white rounded-3xl shadow-md flex items-center gap-4">
        <button
          type="button"
          onClick={() => setIsAvatarModalOpen(true)}
          aria-label={isAr ? 'تغيير مظهر الشخصية' : 'Change avatar appearance style'}
          className="relative w-18 h-18 rounded-2xl bg-white/20 backdrop-blur-xs border-2 border-white/40 p-1 flex items-center justify-center shrink-0 shadow-inner hover:scale-105 active:scale-95 transition-transform cursor-pointer min-h-[48px] min-w-[48px]"
          title={isAr ? 'اضغط لتغيير المظهر' : 'Click to customize avatar'}
        >
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/10">
            <PatientAvatarSvg presetId={patientRecord?.avatarId} gender={patientRecord?.gender} />
          </div>
          <span className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-white text-[#1e6bb8] text-xs font-black flex items-center justify-center shadow-xs">
            ✎
          </span>
        </button>
        <div className="space-y-0.5 overflow-hidden">
          <h1 className="text-2xl font-black truncate">{fullNameDisplay}</h1>
          <p className="text-xs text-blue-100 font-mono tracking-wide truncate">
            @{user?.username || 'patient'} • ID: {activePatientId}
          </p>
          <div className="pt-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/90 text-white text-[11px] font-extrabold">
              ● {isAr ? 'مريض نشط' : 'Active Patient'}
            </span>
          </div>
        </div>
      </div>

      {/* Personal Info Card: Name, phone, dialysis schedule, dialysis center, avatar style */}
      <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
            {isAr ? 'البيانات الشخصية والجدول' : 'Personal & Dialysis Information'}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAvatarModalOpen(true)}
            className="text-xs font-extrabold min-h-[40px] px-3 border-[#1e6bb8] text-[#1e6bb8] hover:bg-blue-50"
          >
            🎨 {isAr ? 'تغيير المظهر' : 'Change Avatar'}
          </Button>
        </div>

        <div className="space-y-2 text-sm divide-y divide-slate-100">
          <div className="pt-2 flex items-center justify-between">
            <span className="text-slate-500 font-medium">{isAr ? 'الاسم الكامل:' : 'Full Name:'}</span>
            <span className="font-extrabold text-slate-900">{fullNameDisplay}</span>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-slate-500 font-medium">{isAr ? 'رقم الهاتف:' : 'Phone:'}</span>
            <span className="font-semibold text-slate-800 font-mono">
              {patientRecord?.phone || (isAr ? 'غير مسجل' : 'Not provided')}
            </span>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-slate-500 font-medium">
              {isAr ? 'جدول جلسات الغسيل:' : 'Dialysis Schedule:'}
            </span>
            <Badge variant="info" size="sm" className="font-extrabold">
              {scheduleLabel}
            </Badge>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-slate-500 font-medium">
              {isAr ? 'مركز الغسيل الكلوي:' : 'Dialysis Center:'}
            </span>
            <span className="font-semibold text-slate-800">
              {patientRecord?.centerName?.trim() ||
                (isAr ? 'مركز دايلي كير التخصصي' : 'DialyCare Specialized Center')}
            </span>
          </div>
        </div>
      </Card>

      {/* Adherence Summary Card: This week's adherence rates (TTT %, Fluid %, Diet %) */}
      <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
            {isAr ? 'معدل الالتزام هذا الأسبوع' : "This Week's Adherence Rates"}
          </h2>
          <span className="text-xs text-slate-500 font-bold">
            {isAr ? 'آخر 7 أيام' : 'Past 7 days'}
          </span>
        </div>

        <div className="space-y-3.5">
          {/* TTT Medication */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-700 flex items-center gap-1.5">
                <span>💊</span>
                <span>{isAr ? 'الالتزام بالأدوية (TTT)' : 'Medication Adherence (TTT)'}</span>
              </span>
              <span className="text-emerald-600 font-mono font-extrabold">{weeklyRates.medRate}%</span>
            </div>
            <ProgressBar value={weeklyRates.medRate} variant="success" size="md" showValue={false} />
          </div>

          {/* Fluid */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-700 flex items-center gap-1.5">
                <span>💧</span>
                <span>{isAr ? 'الالتزام بحد السوائل' : 'Fluid Limit Adherence'}</span>
              </span>
              <span className="text-[#1e6bb8] font-mono font-extrabold">{weeklyRates.fluidRate}%</span>
            </div>
            <ProgressBar value={weeklyRates.fluidRate} variant="primary" size="md" showValue={false} />
          </div>

          {/* Diet */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-700 flex items-center gap-1.5">
                <span>🥗</span>
                <span>{isAr ? 'الالتزام بالحمية الكلوية' : 'Renal Diet Adherence'}</span>
              </span>
              <span className="text-amber-600 font-mono font-extrabold">{weeklyRates.dietRate}%</span>
            </div>
            <ProgressBar value={weeklyRates.dietRate} variant="warning" size="md" showValue={false} />
          </div>
        </div>
      </Card>

      {/* Settings Section */}
      <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
          {tSettings('general') || (isAr ? 'إعدادات التطبيق' : 'Preferences & Settings')}
        </h2>

        {/* Language Toggle */}
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <p className="font-extrabold text-sm text-slate-900">
              {tSettings('language') || (isAr ? 'لغة التطبيق' : 'Application Language')}
            </p>
            <p className="text-xs text-slate-500">
              {isAr ? 'التبديل بين العربية والإنجليزية' : 'Switch between English and Arabic'}
            </p>
          </div>
          <LanguageToggle variant="button" />
        </div>

        {/* Notification Setting */}
        <div className="flex flex-col gap-2 py-2 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-extrabold text-sm text-slate-900">
                {tSettings('notificationsEnabled') || (isAr ? 'التنبيهات اللحظية' : 'Push Notifications')}
              </p>
              <p className="text-xs text-slate-500">
                {notificationPermission === 'granted'
                  ? isAr
                    ? 'التنبيهات مفعلة على هذا المتصفح'
                    : 'Active in browser'
                  : isAr
                  ? 'انقر لتفعيل تنبيهات المتصفح'
                  : 'Click to enable browser alerts'}
              </p>
            </div>
            <Button
              type="button"
              variant={notificationPermission === 'granted' ? 'success' : 'outline'}
              size="md"
              onClick={handleToggleNotifications}
              className="font-extrabold shrink-0 min-h-[48px]"
            >
              {notificationPermission === 'granted'
                ? isAr
                  ? 'مفعلة 🔔'
                  : 'Enabled 🔔'
                : isAr
                ? 'تفعيل 🔔'
                : 'Enable 🔔'}
            </Button>
          </div>
          {notifFeedback && (
            <p className="text-xs font-bold text-emerald-600 animate-in fade-in">
              {notifFeedback}
            </p>
          )}
        </div>

        {/* Daily Fluid Limit Input */}
        <form onSubmit={handleSaveFluidLimit} className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="fluid-limit-input" className="font-extrabold text-sm text-slate-900 block">
                {isAr ? 'الحد اليومي المخصص للسوائل' : 'Daily Fluid Target Limit'}
              </label>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'الحد المحدد بواسطة طبيبك المعالج (مليلتر)'
                  : 'Prescribed daily fluid intake (milliliters)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Input
              id="fluid-limit-input"
              type="number"
              min="200"
              max="5000"
              step="50"
              placeholder="1000"
              value={fluidLimitInput}
              onChange={(e) => setFluidLimitInput(e.target.value)}
              className="flex-1"
              required
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="shrink-0 font-extrabold min-h-[48px]"
            >
              {isLimitSaved ? (isAr ? 'تم الحفظ ✓' : 'Saved ✓') : (isAr ? 'حفظ' : 'Save')}
            </Button>
          </div>
        </form>
      </Card>

      {/* Logout Section: Logout button (large, red) */}
      <div className="pt-2 pb-4">
        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={handleLogout}
          className="font-black text-base min-h-[54px] shadow-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{tCommon('logout') || (isAr ? 'تسجيل الخروج من الحساب' : 'Sign Out')}</span>
        </Button>
      </div>

      {/* Avatar Personalization Modal */}
      <AvatarStyleSelectorModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        patientId={activePatientId}
        currentAvatarId={patientRecord?.avatarId}
        patientGender={patientRecord?.gender}
        onAvatarSelected={(newAvatarId) => {
          setPatientRecord((prev) => (prev ? { ...prev, avatarId: newAvatarId } : null));
          loadProfileMetrics();
        }}
      />
    </div>
  );
}
