'use client';

import React, { useState, useEffect, useMemo, useTransition, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getAdherenceLogs,
  addAdherenceLog,
  getFluidLogs,
  addFluidLog,
  getDietLogs,
  addDietLog,
  getDietChecklist,
  getPatients,
  getPatientFluidLimits,
} from '@/lib/data-store';
import { playFluidAlarm } from '@/lib/audio-alarm';
import { PatientCoachingAvatar } from '@/components/PatientCoachingAvatar';
import type {
  AdherenceLog,
  FluidLog,
  DietLog,
  DietChecklistItem,
  MealType,
  Patient,
} from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PatientMedicationSection } from '@/components/patient/PatientMedicationSection';
import { DialysisSessionModal } from '@/components/DialysisSessionModal';
import { DialysisSessionHistory } from '@/components/DialysisSessionHistory';
import { CLINICAL_RANGES, isInRange } from '@/lib/clinical-validation';
import { PatientLabResultsView } from '@/components/patient/PatientLabResultsView';

type LogTab = 'medication' | 'fluid' | 'diet' | 'dialysis' | 'labs';
const VALID_LOG_TABS: LogTab[] = ['medication', 'fluid', 'diet', 'dialysis', 'labs'];

function LogContent() {
  const { user } = useAuth();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const router = useRouter();
  const searchParams = useSearchParams();

  const tPatient = useTranslations('patient');
  const tCommon = useTranslations('common');
  const tFluidAlerts = useTranslations('fluidAlerts');

  const rawTabParam = searchParams.get('tab') as LogTab | null;
  const initialTab: LogTab = rawTabParam && VALID_LOG_TABS.includes(rawTabParam) ? rawTabParam : 'medication';
  const [activeTab, setActiveTab] = useState<LogTab>(initialTab);
  const [prevTabParam, setPrevTabParam] = useState<LogTab | null>(rawTabParam);

  if (rawTabParam !== prevTabParam) {
    setPrevTabParam(rawTabParam);
    if (rawTabParam && VALID_LOG_TABS.includes(rawTabParam)) {
      setActiveTab(rawTabParam);
    }
  }

  // Sync tab with query param
  const handleTabChange = (tab: LogTab) => {
    setActiveTab(tab);
    router.replace(`/${locale}/patient/log?tab=${tab}`, { scroll: false });
  };

  const patientId = user?.uid || 'patient-1';

  // Common State
  const [patientRecord, setPatientRecord] = useState<Patient | null>(null);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);
  const [fluidLogs, setFluidLogs] = useState<FluidLog[]>([]);
  const [dietLogs, setDietLogs] = useState<DietLog[]>([]);
  const [dietChecklistItems, setDietChecklistItems] = useState<DietChecklistItem[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isDialysisModalOpen, setIsDialysisModalOpen] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  // Fluid Tab State
  const [customAmount, setCustomAmount] = useState<string>('');
  const [customAmountError, setCustomAmountError] = useState<string | null>(null);
  const [fluidUnit, setFluidUnit] = useState<'ml' | 'cups'>('ml');

  // Diet Tab State (starts unchecked)
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [selectedChecklist, setSelectedChecklist] = useState<string[]>([]);

  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAllLogs = React.useCallback(() => {
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

    const adh = getAdherenceLogs(activeId, undefined, {
      start: startOfToday.toISOString(),
      end: endOfToday.toISOString(),
    });
    const fl = getFluidLogs(activeId, todayStr);
    const dl = getDietLogs(activeId, todayStr);
    const dCheck = getDietChecklist();

    setAdherenceLogs(adh);
    setFluidLogs(fl);
    setDietLogs(dl);
    setDietChecklistItems(dCheck);
  }, [patientId]);

  const activePatientId = patientRecord?.id || patientId;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAllLogs();

    const handleSync = () => {
      loadAllLogs();
    };
    window.addEventListener('dialycare_labs_updated', handleSync);
    window.addEventListener('dialycare_sessions_updated', handleSync);
    window.addEventListener('dialycare_medications_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      window.removeEventListener('dialycare_labs_updated', handleSync);
      window.removeEventListener('dialycare_sessions_updated', handleSync);
      window.removeEventListener('dialycare_medications_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadAllLogs]);

  const showNotification = (msg: string) => {
    setSuccessBanner(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setSuccessBanner(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  // Dry-weight based limits from R3 (Warning: dry_weight * 20, Critical: dry_weight * 26)
  const dryWeightKg = patientRecord?.dryWeightKg || 70;
  const fluidLimits = useMemo(() => getPatientFluidLimits(dryWeightKg), [dryWeightKg]);

  // Today's Medication Logs History
  const todayMedLogs = useMemo(() => {
    return adherenceLogs.filter((l) => l.type === 'ttt');
  }, [adherenceLogs]);

  // Fluid calculations
  const totalFluidConsumed = useMemo(() => {
    return fluidLogs.reduce((sum, item) => sum + item.amountMl, 0);
  }, [fluidLogs]);

  const fluidStatus = useMemo<'normal' | 'warning' | 'critical'>(() => {
    if (totalFluidConsumed >= fluidLimits.critical) return 'critical';
    if (totalFluidConsumed >= fluidLimits.warning) return 'warning';
    return 'normal';
  }, [totalFluidConsumed, fluidLimits]);

  const fluidPercentage = useMemo(() => {
    return Math.min(100, Math.round((totalFluidConsumed / fluidLimits.critical) * 100));
  }, [totalFluidConsumed, fluidLimits]);

  const fluidProgressVariant = useMemo(() => {
    if (fluidStatus === 'critical') return 'danger';
    if (fluidStatus === 'warning') return 'warning';
    return 'success';
  }, [fluidStatus]);

  // Handle Quick Add Fluid (Auto-triggers or re-triggers alarm when at/above critical)
  const handleAddFluidAmount = (amountMl: number) => {
    const nextTotal = totalFluidConsumed + amountMl;
    const willBeCritical = nextTotal >= fluidLimits.critical;

    startTransition(() => {
      addFluidLog({
        patientId: activePatientId,
        amountMl,
        unit: 'ml',
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId: activePatientId,
        type: 'fluid',
        status: 'done',
        loggedAt: new Date().toISOString(),
        data: { amountMl },
      });

      loadAllLogs();

      // CRITICAL REQUIREMENT: Trigger alarm on reaching critical limit OR re-trigger if already critical!
      if (willBeCritical) {
        playFluidAlarm();
      }

      showNotification(
        isAr
          ? `تمت إضافة ${amountMl} مل إلى سجل السوائل 💧`
          : `Added ${amountMl} mL to your fluid log 💧`
      );
    });
  };

  // Handle Custom Fluid Submit (Auto-triggers or re-triggers alarm when at/above critical)
  const handleCustomFluidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customAmount);
    const amountInMl = fluidUnit === 'cups' ? Math.round(val * 240) : Math.round(val);

    // Catch typos (e.g. 15000 instead of 150) before they hit the log and fire the critical alarm
    const { fluidEntryMl } = CLINICAL_RANGES;
    if (isNaN(val) || val <= 0 || !isInRange(amountInMl, fluidEntryMl)) {
      setCustomAmountError(
        isAr
          ? `يرجى إدخال كمية بين ${fluidEntryMl.min} و ${fluidEntryMl.max} مل (حتى 12 كوب) في المرة الواحدة.`
          : `Please enter an amount between ${fluidEntryMl.min} and ${fluidEntryMl.max} mL (up to 12 cups) per entry.`
      );
      return;
    }
    setCustomAmountError(null);
    const nextTotal = totalFluidConsumed + amountInMl;
    const willBeCritical = nextTotal >= fluidLimits.critical;

    startTransition(() => {
      addFluidLog({
        patientId: activePatientId,
        amountMl: amountInMl,
        unit: fluidUnit,
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId: activePatientId,
        type: 'fluid',
        status: 'done',
        loggedAt: new Date().toISOString(),
        data: { amountMl: amountInMl, unit: fluidUnit },
      });

      setCustomAmount('');
      loadAllLogs();

      // CRITICAL REQUIREMENT: Trigger alarm on reaching critical limit OR re-trigger if already critical!
      if (willBeCritical) {
        playFluidAlarm();
      }

      showNotification(
        isAr
          ? `تم تسجيل ${amountInMl} مل بنجاح 💧`
          : `Logged ${amountInMl} mL successfully 💧`
      );
    });
  };

  // Renal Checklist Items (5 required renal guidelines)
  const renalChecklistItems = useMemo(() => {
    const defaultFive = [
      { id: 'diet_1', nameEn: 'Low sodium meal', nameAr: 'وجبة منخفضة الصوديوم' },
      { id: 'diet_2', nameEn: 'Limited potassium intake', nameAr: 'بوتاسيوم محدود' },
      { id: 'diet_3', nameEn: 'Limited phosphorus intake', nameAr: 'فوسفور محدود' },
      { id: 'diet_4', nameEn: 'Adequate protein intake', nameAr: 'كمية كافية من البروتين' },
      { id: 'diet_5', nameEn: 'Limited fluid content in food', nameAr: 'سوائل محدودة في الطعام' },
    ];

    if (dietChecklistItems.length >= 5) {
      return dietChecklistItems.slice(0, 5);
    }
    return defaultFive;
  }, [dietChecklistItems]);

  // Handle Diet Checklist toggle
  const handleToggleChecklistItem = (itemId: string) => {
    setSelectedChecklist((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  // Handle Diet Log Submit
  const handleDietSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      addDietLog({
        patientId: activePatientId,
        checklist: selectedChecklist,
        mealType: selectedMealType,
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId: activePatientId,
        type: 'diet',
        status: 'done',
        loggedAt: new Date().toISOString(),
        data: {
          mealType: selectedMealType,
          checklistCount: selectedChecklist.length,
        },
      });

      setSelectedChecklist([]);
      loadAllLogs();
      showNotification(
        isAr
          ? `تم تسجيل وجبة ${getMealLabel(selectedMealType)} بنجاح 🥗`
          : `Logged ${getMealLabel(selectedMealType)} successfully 🥗`
      );
    });
  };

  const getMealLabel = (type: MealType) => {
    switch (type) {
      case 'breakfast':
        return isAr ? 'الإفطار 🌅' : 'Breakfast 🌅';
      case 'lunch':
        return isAr ? 'الغداء ☀️' : 'Lunch ☀️';
      case 'dinner':
        return isAr ? 'العشاء 🌙' : 'Dinner 🌙';
      case 'snack':
        return isAr ? 'وجبة خفيفة 🍎' : 'Snack 🍎';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toast / Banner Notification */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm shadow-md flex items-center justify-between animate-in slide-in-from-top-2">
          <span>{successBanner}</span>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="p-1 hover:bg-emerald-700 rounded-lg text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Patient Coaching Avatar Character "Dr. Dialy" (R4) */}
      <PatientCoachingAvatar
        patientId={activePatientId}
        adherenceMetrics={{
          fluidPercentage,
          adherenceScore: fluidStatus === 'critical' ? 45 : fluidStatus === 'warning' ? 70 : 95,
        }}
      />

      {/* Tabs Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-slate-200/80 rounded-2xl">
        <button
          type="button"
          onClick={() => handleTabChange('medication')}
          className={`
            min-h-[50px] rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer
            ${
              activeTab === 'medication'
                ? 'bg-white text-[#1e6bb8] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <span>💊</span>
          <span>{isAr ? 'الأدوية' : 'Medication'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('fluid')}
          className={`
            min-h-[50px] rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer
            ${
              activeTab === 'fluid'
                ? 'bg-white text-[#1e6bb8] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <span>💧</span>
          <span>{isAr ? 'السوائل' : 'Fluid'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('diet')}
          className={`
            min-h-[50px] rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer
            ${
              activeTab === 'diet'
                ? 'bg-white text-[#1e6bb8] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <span>🥗</span>
          <span>{isAr ? 'التغذية' : 'Diet'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('dialysis')}
          data-testid="patient-log-dialysis-tab-btn"
          aria-label={isAr ? 'سجل جلسات الغسيل الكلوي (14 معيار)' : 'Dialysis Sessions (14 Clinical Fields)'}
          className={`
            min-h-[50px] rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer
            ${
              activeTab === 'dialysis'
                ? 'bg-white text-[#1e6bb8] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <span>🩺</span>
          <span>{isAr ? 'جلسة الغسيل' : 'Dialysis'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('labs')}
          data-testid="patient-log-labs-tab-btn"
          aria-label={isAr ? 'نتائج التحاليل المخبرية — للعرض فقط' : 'Lab Results — Read-Only View'}
          className={`
            col-span-2 sm:col-span-1 min-h-[50px] rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer
            ${
              activeTab === 'labs'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <span>🔬</span>
          <span>{isAr ? 'التحاليل' : 'Labs'}</span>
        </button>
      </div>

      {/* =================================================== */}
      {/* 1. MEDICATION TAB */}
      {/* =================================================== */}
      {activeTab === 'medication' && (
        <div className="space-y-4">
          <PatientMedicationSection
            patientId={activePatientId}
            onAdherenceLogged={() => loadAllLogs()}
          />

          {/* Today's History */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider px-1">
              {isAr ? 'سجل جرعات اليوم المسجلة' : "Today's Logged Doses"}
            </h3>
            {todayMedLogs.length === 0 ? (
              <Card className="p-4 text-center bg-white rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">
                  {isAr ? 'لم تسجل أي جرعات بعد لليوم' : 'No doses recorded yet today'}
                </p>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {todayMedLogs.map((log) => {
                  const logTitle =
                    log.data && typeof log.data === 'object' && 'title' in log.data
                      ? String(log.data.title)
                      : isAr
                      ? 'دواء مقرر'
                      : 'Scheduled Medication';
                  const timeStr = new Date(log.loggedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold"
                    >
                      <div className="flex items-center gap-2">
                        <span>💊</span>
                        <span className="font-extrabold text-slate-800">{logTitle}</span>
                        <span className="text-slate-400 font-mono">({timeStr})</span>
                      </div>
                      <Badge variant={log.status === 'done' ? 'success' : 'warning'} size="sm" className="font-bold">
                        {log.status === 'done'
                          ? isAr
                            ? 'تم ✅'
                            : 'Done ✅'
                          : isAr
                          ? 'تم التخطي ⏭️'
                          : 'Skipped ⏭️'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================== */}
      {/* 2. FLUID TAB (R3: SMART FLUID LIMIT ALERTS) */}
      {/* =================================================== */}
      {activeTab === 'fluid' && (
        <div className="space-y-4">
          {/* R3 Smart Fluid Alert Target Card with Dynamic Warnings and Visual Flashing */}
          <Card
            data-testid="fluid-target-card"
            className={`
              p-5 rounded-3xl transition-all duration-300
              ${
                fluidStatus === 'critical'
                  ? 'bg-red-100/90 border-2 border-red-600 ring-4 ring-red-500 animate-pulse text-red-950 shadow-xl shadow-red-500/20'
                  : fluidStatus === 'warning'
                  ? 'bg-red-50 border-2 border-red-500 text-red-900 shadow-md'
                  : 'bg-white border border-slate-200/90 shadow-xs'
              }
            `}
          >
            {/* Critical Emergency Banner (Audible & Visual Alarm Triggered) */}
            {fluidStatus === 'critical' && (
              <div
                data-testid="fluid-critical-banner"
                className="mb-4 p-4 rounded-2xl bg-red-600 text-white font-extrabold text-xs flex flex-col gap-2.5 shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl animate-bounce" role="img" aria-label="Critical Alert">
                      🚨
                    </span>
                    <div>
                      <p className="font-black text-sm uppercase tracking-wide text-white">
                        {tFluidAlerts('criticalBanner') ||
                          (isAr
                            ? 'إنذار خطر حرج: تم تجاوز الحد الأقصى للسوائل!'
                            : 'CRITICAL ALARM: Interdialytic fluid limit exceeded!')}
                      </p>
                      <p className="text-xs font-bold text-red-100 mt-0.5">
                        {tFluidAlerts('criticalAction') ||
                          (isAr
                            ? 'توقف عن شرب السوائل فوراً! اكتفِ بقطع ثلج صغيرة أو مضمضة الفم فقط.'
                            : 'Stop fluid intake immediately! Take small ice chips or mouth rinse only.')}
                      </p>
                    </div>
                  </div>

                  {/* Accessible Re-Trigger / Audible Sound Alarm Button */}
                  <button
                    type="button"
                    onClick={() => playFluidAlarm()}
                    data-testid="fluid-alarm-sound-btn"
                    aria-label={isAr ? 'تشغيل صافرة الإنذار الصوتي' : 'Trigger Audible Alarm'}
                    className="shrink-0 min-h-[48px] px-3.5 py-2 rounded-xl bg-white text-red-700 hover:bg-red-50 font-black text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                  >
                    <span>🔊</span>
                    <span>{isAr ? 'صافرة الإنذار' : 'Sound Alarm'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-red-500/60 flex items-center justify-between text-[11px] font-semibold text-red-200">
                  <span>
                    {tFluidAlerts('subsequentWarning') ||
                      (isAr
                        ? 'تمت إضافة سوائل جديدة بعد بلوغ حد الخطر! إشعار عاجل للفريق الطبي.'
                        : 'Additional fluid logged beyond critical limit! Urgent medical notification.')}
                  </span>
                  <span className="font-mono bg-red-800/80 px-2 py-0.5 rounded text-white font-bold">
                    {tFluidAlerts('audioAlarmActive') || (isAr ? 'الإنذار الصوتي نشط' : 'Alarm Active')}
                  </span>
                </div>
              </div>
            )}

            {/* Warning State Banner (Intake >= dry_weight * 20 mL) */}
            {fluidStatus === 'warning' && (
              <div
                data-testid="fluid-warning-banner"
                className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-950 font-extrabold text-xs flex items-center justify-between gap-2 shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl" role="img" aria-label="Warning">
                    ⚠️
                  </span>
                  <div>
                    <p className="font-black text-amber-950 text-xs sm:text-sm">
                      {tFluidAlerts('warningBanner') ||
                        (isAr
                          ? 'تحذير: استهلاك السوائل يقترب من الحد الأقصى بين الجلسات!'
                          : 'Warning: Interdialytic fluid intake approaching limit!')}
                    </p>
                    <p className="text-[11px] font-semibold text-amber-800 mt-0.5">
                      {tFluidAlerts('warningStatus') ||
                        (isAr
                          ? `استهلاك السوائل في منطقة التحذير (أكبر من ${dryWeightKg} كجم × 20 مل = ${fluidLimits.warning} مل)`
                          : `Fluid intake in warning zone (> ${dryWeightKg} kg × 20 mL = ${fluidLimits.warning} mL)`)}
                    </p>
                  </div>
                </div>
                <Badge variant="warning" size="sm" className="font-black shrink-0">
                  {isAr ? 'منطقة التحذير' : 'Warning Zone'}
                </Badge>
              </div>
            )}

            {/* Header: Allowance Title & Consumed mL */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {tPatient('fluidAllowance') || (isAr ? 'سقف السوائل المعتمد' : 'Clinical Fluid Allowance')}
                  </p>
                  <Badge
                    variant={
                      fluidStatus === 'critical' ? 'danger' : fluidStatus === 'warning' ? 'warning' : 'success'
                    }
                    size="sm"
                    className="font-black uppercase"
                  >
                    {fluidStatus === 'critical'
                      ? isAr
                        ? 'خطر حرج 🚨'
                        : 'Critical Limit 🚨'
                      : fluidStatus === 'warning'
                      ? isAr
                        ? 'تحذير ⚠️'
                        : 'Warning Limit ⚠️'
                      : isAr
                      ? 'آمن 💧'
                      : 'Safe Zone 💧'}
                  </Badge>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black mt-1 text-slate-900">
                  {totalFluidConsumed}{' '}
                  <span className="text-sm font-bold text-slate-500">/ {fluidLimits.critical} mL</span>
                </h2>
              </div>

              <div
                className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-bold shrink-0
                  ${
                    fluidStatus === 'critical'
                      ? 'bg-red-200 text-red-700 animate-bounce'
                      : fluidStatus === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-50 text-[#1e6bb8]'
                  }
                `}
              >
                💧
              </div>
            </div>

            {/* Dry Weight Limits Breakdown Strip (R3 Auto-Calculation) */}
            <div className="mt-3.5 grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-100/80 border border-slate-200 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  {tFluidAlerts('dryWeight') || (isAr ? 'الوزن الجاف' : 'Dry Weight')}
                </p>
                <p className="text-xs sm:text-sm font-black text-slate-900 mt-0.5">
                  {dryWeightKg} <span className="text-[10px] font-bold text-slate-500">kg</span>
                </p>
              </div>

              <div className="border-x border-slate-200 px-1">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">
                  {tFluidAlerts('warningThreshold') || (isAr ? 'حد التحذير' : 'Warning (×20)')}
                </p>
                <p className="text-xs sm:text-sm font-black text-amber-800 mt-0.5">
                  {fluidLimits.warning} <span className="text-[10px] font-bold">mL</span>
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-tight">
                  {tFluidAlerts('criticalThreshold') || (isAr ? 'حد الخطر' : 'Critical (×26)')}
                </p>
                <p className="text-xs sm:text-sm font-black text-red-800 mt-0.5">
                  {fluidLimits.critical} <span className="text-[10px] font-bold">mL</span>
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <ProgressBar
                value={totalFluidConsumed}
                max={fluidLimits.critical}
                variant={fluidProgressVariant}
                size="lg"
                showValue={true}
                valueSuffix="mL"
              />
            </div>

            {/* Remaining budget and percentage footer */}
            <div className="mt-3 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-700">
                {totalFluidConsumed >= fluidLimits.critical
                  ? isAr
                    ? '⚠️ تم تجاوز الحد الحرج الأقصى المسموح به!'
                    : '🚨 Critical ceiling exceeded!'
                  : totalFluidConsumed >= fluidLimits.warning
                  ? isAr
                    ? `⚠️ متبقي ${Math.max(0, fluidLimits.critical - totalFluidConsumed)} مل فقط قبل الإنذار الحرج`
                    : `⚠️ Only ${Math.max(0, fluidLimits.critical - totalFluidConsumed)} mL before critical alarm`
                  : isAr
                  ? `المتبقي للحد الحرج: ${Math.max(0, fluidLimits.critical - totalFluidConsumed)} مل`
                  : `Remaining to critical: ${Math.max(0, fluidLimits.critical - totalFluidConsumed)} mL`}
              </span>
              <span
                className={`font-black text-sm ${
                  fluidProgressVariant === 'danger'
                    ? 'text-red-600'
                    : fluidProgressVariant === 'warning'
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {fluidPercentage}%
              </span>
            </div>
          </Card>

          {/* Quick-Add Buttons */}
          <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-3">
              {isAr ? 'إضافة سريعة بالمليلتر' : 'Quick Add Amounts'}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { ml: 100, label: '100 mL' },
                { ml: 200, label: '200 mL' },
                { ml: 240, label: isAr ? 'كوب (240 مل)' : '1 Cup (240 mL)' },
                { ml: 250, label: '250 mL' },
                { ml: 330, label: '330 mL' },
                { ml: 500, label: '500 mL' },
              ].map((item) => (
                <button
                  key={item.ml}
                  type="button"
                  onClick={() => handleAddFluidAmount(item.ml)}
                  disabled={isPending}
                  className="min-h-[50px] p-2 rounded-2xl bg-blue-50/70 hover:bg-blue-100 active:scale-95 text-[#1e6bb8] border border-blue-200/70 font-extrabold text-xs sm:text-sm transition-all cursor-pointer flex flex-col items-center justify-center select-none"
                >
                  <span>+{item.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Custom Input Form (fixed step/min for cups) */}
          <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-3">
              {isAr ? 'إدخال كمية مخصصة' : 'Custom Amount'}
            </h3>
            <form onSubmit={handleCustomFluidSubmit} className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={fluidUnit === 'cups' ? '0.1' : '1'}
                    step={fluidUnit === 'cups' ? '0.1' : '1'}
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setCustomAmountError(null);
                    }}
                    placeholder={fluidUnit === 'ml' ? 'e.g. 150' : 'e.g. 0.5'}
                    required
                    aria-invalid={Boolean(customAmountError)}
                    aria-describedby={customAmountError ? 'custom-fluid-error' : undefined}
                  />
                </div>
                <div className="flex rounded-xl border border-slate-300 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setFluidUnit('ml')}
                    className={`min-h-[48px] px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      fluidUnit === 'ml'
                        ? 'bg-[#1e6bb8] text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    mL
                  </button>
                  <button
                    type="button"
                    onClick={() => setFluidUnit('cups')}
                    className={`min-h-[48px] px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      fluidUnit === 'cups'
                        ? 'bg-[#1e6bb8] text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? 'كوب' : 'Cups'}
                  </button>
                </div>
              </div>

              {customAmountError && (
                <p id="custom-fluid-error" role="alert" className="text-xs font-bold text-red-600">
                  {customAmountError}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={isPending || !customAmount}
                className="font-extrabold min-h-[50px]"
              >
                {tCommon('add') || (isAr ? 'إضافة إلى السجل' : 'Add Entry')}
              </Button>
            </form>
          </Card>

          {/* Today's Fluid Log Entries */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider px-1">
              {isAr ? 'سجل شرب السوائل اليوم' : "Today's Intake Log"}
            </h3>
            {fluidLogs.length === 0 ? (
              <Card className="p-4 text-center bg-white rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">
                  {isAr ? 'لا توجد مدخلات سوائل مسجلة لليوم' : 'No fluid entries logged today'}
                </p>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {fluidLogs.map((item) => {
                  const time = new Date(item.loggedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500">💧</span>
                        <span className="font-extrabold text-slate-900">{item.amountMl} mL</span>
                        {item.unit === 'cups' && (
                          <span className="text-slate-400 font-mono">
                            (~{(item.amountMl / 240).toFixed(1)} {isAr ? 'كوب' : 'cups'})
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 font-mono">{time}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================== */}
      {/* 3. DIET TAB */}
      {/* =================================================== */}
      {activeTab === 'diet' && (
        <div className="space-y-4">
          <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              {isAr ? 'تسجيل الوجبة الغذائية وقائمة الفحص' : 'Log Meal & Renal Diet Checklist'}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr
                ? 'اختر الوجبة وحدد التوجيهات الغذائية التي التزمت بها'
                : 'Select meal type and check adherence to renal dietary guidelines'}
            </p>

            {/* Meal Type Radio Selection */}
            <div className="mt-4">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                {isAr ? 'نوع الوجبة' : 'Meal Type'}
              </label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => {
                  const isSelected = selectedMealType === meal;
                  return (
                    <button
                      key={meal}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedMealType(meal)}
                      className={`
                        min-h-[50px] p-3 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-all cursor-pointer select-none
                        ${
                          isSelected
                            ? 'bg-blue-50 border-[#1e6bb8] text-[#1e6bb8] shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }
                      `}
                    >
                      <span>{getMealLabel(meal)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Renal Checklist (starts unchecked, 5 items) */}
            <div className="mt-5 space-y-2.5">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-1">
                {isAr ? 'قائمة الفحص الكلوي' : 'Renal Diet Checklist'}
              </label>

              {renalChecklistItems.map((item) => {
                const checked = selectedChecklist.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`
                      flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none min-h-[50px]
                      ${
                        checked
                          ? 'bg-emerald-50/70 border-emerald-400 text-slate-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleChecklistItem(item.id)}
                      className="w-5 h-5 rounded text-[#1e6bb8] focus:ring-[#1e6bb8] border-slate-300 cursor-pointer"
                    />
                    <span className="text-sm flex-1">
                      {isAr ? item.nameAr : item.nameEn}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6">
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleDietSubmit}
                disabled={isPending}
                className="font-extrabold min-h-[52px]"
              >
                {isAr ? 'تسجيل الوجبة الآن 🥗' : 'Log Meal Now 🥗'}
              </Button>
            </div>
          </Card>

          {/* Today's Logged Meals History */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider px-1">
              {isAr ? 'الوجبات المسجلة اليوم' : "Today's Logged Meals"}
            </h3>
            {dietLogs.length === 0 ? (
              <Card className="p-4 text-center bg-white rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">
                  {isAr ? 'لم تسجل أي وجبات لليوم بعد' : 'No meals recorded yet today'}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {dietLogs.map((log) => {
                  const time = new Date(log.loggedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={log.id}
                      className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🥗</span>
                          <span className="font-extrabold text-sm text-slate-900">
                            {getMealLabel(log.mealType)}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">{time}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {log.checklist.map((itemId) => {
                          const item = renalChecklistItems.find((d) => d.id === itemId);
                          return (
                            <span
                              key={itemId}
                              className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-2 py-0.5 font-bold"
                            >
                              ✓ {isAr ? item?.nameAr || itemId : item?.nameEn || itemId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================== */}
      {/* 4. DIALYSIS TREATMENT SESSION TAB (R2) */}
      {/* =================================================== */}
      {activeTab === 'dialysis' && (
        <div className="space-y-4">
          <DialysisSessionHistory
            patientId={activePatientId}
            canRecord={true}
            canManage={false}
            onRecordClick={() => setIsDialysisModalOpen(true)}
          />
        </div>
      )}

      {/* =================================================== */}
      {/* 5. CLINICAL LAB RESULTS TAB (R5 — READ-ONLY FOR PATIENT) */}
      {/* =================================================== */}
      {activeTab === 'labs' && (
        <div className="space-y-3" data-testid="patient-log-labs-panel">
          <div className="px-4 py-3 rounded-2xl bg-teal-50 border border-teal-200/80 text-xs sm:text-sm font-bold text-teal-900 flex items-center gap-2">
            <span aria-hidden="true">🔬</span>
            <span>
              {isAr
                ? 'نتائج التحاليل المخبرية يتم إدخالها وتحديثها بواسطة الطبيب المعالج فقط (للعرض فقط).'
                : 'Laboratory test results are recorded and updated exclusively by your doctor (read-only).'}
            </span>
          </div>
          <PatientLabResultsView
            patientId={activePatientId}
          />
        </div>
      )}

      {/* Dialysis Session Recording Modal (14 Clinical Fields) */}
      <DialysisSessionModal
        isOpen={isDialysisModalOpen}
        onClose={() => setIsDialysisModalOpen(false)}
        patientId={activePatientId}
        recordedBy={user?.uid || 'patient'}
        onSessionRecorded={(saved) => {
          loadAllLogs();
          showNotification(
            isAr
              ? `تم تسجيل جلسة الغسيل الكلوي (${saved.sessionDate}) بنجاح! ✅`
              : `Dialysis session for ${saved.sessionDate} recorded successfully! ✅`
          );
        }}
      />
    </div>
  );
}

export default function PatientLogPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" color="primary" />
          <p className="text-sm text-slate-500 font-medium">Loading log forms...</p>
        </div>
      }
    >
      <LogContent />
    </Suspense>
  );
}
