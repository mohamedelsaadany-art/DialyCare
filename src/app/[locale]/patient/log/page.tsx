'use client';

import React, { useState, useEffect, useMemo, useTransition, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getReminders,
  getReminderTemplates,
  getAdherenceLogs,
  addAdherenceLog,
  getFluidLogs,
  addFluidLog,
  getDietLogs,
  addDietLog,
  getDietChecklist,
} from '@/lib/data-store';
import { getReminderStatus, recordReminderAdherence } from '../patient-utils';
import type {
  PatientReminder,
  ReminderTemplate,
  AdherenceLog,
  FluidLog,
  DietLog,
  DietChecklistItem,
  MealType,
} from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type LogTab = 'medication' | 'fluid' | 'diet';

function LogContent() {
  const { user } = useAuth();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const router = useRouter();
  const searchParams = useSearchParams();

  const tPatient = useTranslations('patient');
  const tCommon = useTranslations('common');

  const initialTab = (searchParams.get('tab') as LogTab) || 'medication';
  const [activeTab, setActiveTab] = useState<LogTab>(initialTab);

  // Sync tab with query param
  const handleTabChange = (tab: LogTab) => {
    setActiveTab(tab);
    router.replace(`/${locale}/patient/log?tab=${tab}`, { scroll: false });
  };

  const patientId = user?.uid || 'patient-1';

  // Common State
  const [reminders, setReminders] = useState<PatientReminder[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);
  const [fluidLogs, setFluidLogs] = useState<FluidLog[]>([]);
  const [dietLogs, setDietLogs] = useState<DietLog[]>([]);
  const [dietChecklistItems, setDietChecklistItems] = useState<DietChecklistItem[]>([]);
  const [fluidLimit, setFluidLimit] = useState<number>(1000);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Medication Tab State
  const [medStatuses, setMedStatuses] = useState<Record<string, 'done' | 'skipped' | 'pending'>>({});

  // Fluid Tab State
  const [customAmount, setCustomAmount] = useState<string>('');
  const [fluidUnit, setFluidUnit] = useState<'ml' | 'cups'>('ml');

  // Diet Tab State (starts unchecked)
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [selectedChecklist, setSelectedChecklist] = useState<string[]>([]);

  const loadAllLogs = React.useCallback(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const r = getReminders(patientId);
    const tmpl = getReminderTemplates();
    const adh = getAdherenceLogs(patientId, undefined, {
      start: startOfToday.toISOString(),
      end: endOfToday.toISOString(),
    });
    const fl = getFluidLogs(patientId, todayStr);
    const dl = getDietLogs(patientId, todayStr);
    const dCheck = getDietChecklist();

    const activeList = r.length > 0 ? r : getReminders('patient-1');

    setReminders(activeList);
    setTemplates(tmpl);
    setAdherenceLogs(adh);
    setFluidLogs(fl);
    setDietLogs(dl);
    setDietChecklistItems(dCheck);

    // Accurately determine initial med statuses for each reminder individually
    const initialStatuses: Record<string, 'done' | 'skipped' | 'pending'> = {};
    activeList
      .filter((item) => item.type === 'ttt' && item.isActive)
      .forEach((item) => {
        const res = getReminderStatus(item, adh, fl, dl, tmpl);
        initialStatuses[item.id] =
          res.status === 'done' ? 'done' : res.status === 'skipped' ? 'skipped' : 'pending';
      });
    setMedStatuses(initialStatuses);

    // Read personalized fluid limit
    if (typeof window !== 'undefined') {
      const savedLimit = window.localStorage.getItem(`DIALYCARE_FLUID_LIMIT_${patientId}`);
      if (savedLimit) {
        setFluidLimit(parseInt(savedLimit, 10) || 1000);
      }
    }
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAllLogs();
  }, [loadAllLogs]);

  const showNotification = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner(null);
    }, 3500);
  };

  // Medication Reminders
  const medReminders = useMemo(() => {
    return reminders
      .filter((r) => r.type === 'ttt' && r.isActive)
      .map((r) => {
        const tpl = templates.find((t) => t.id === r.templateId);
        return {
          id: r.id,
          time: r.time,
          title: isAr
            ? tpl?.titleAr || 'أدوية ومثبتات الفوسفات'
            : tpl?.titleEn || 'Scheduled Medication',
        };
      });
  }, [reminders, templates, isAr]);

  // Handle Med toggle
  const handleMedToggle = (remId: string, status: 'done' | 'skipped') => {
    setMedStatuses((prev) => ({
      ...prev,
      [remId]: prev[remId] === status ? 'pending' : status,
    }));
  };

  // Save all Med changes
  const handleSaveMedications = () => {
    startTransition(() => {
      Object.entries(medStatuses).forEach(([remId, status]) => {
        if (status !== 'pending') {
          const rem = medReminders.find((m) => m.id === remId);
          recordReminderAdherence({
            patientId,
            reminderId: remId,
            type: 'ttt',
            status,
            title: rem?.title || 'Scheduled Medication',
          });
        }
      });
      loadAllLogs();
      showNotification(
        isAr ? 'تم حفظ سجل الأدوية بنجاح ✅' : 'Medication adherence saved successfully ✅'
      );
    });
  };

  // Today's Medication Logs History
  const todayMedLogs = useMemo(() => {
    return adherenceLogs.filter((l) => l.type === 'ttt');
  }, [adherenceLogs]);

  // Fluid calculations
  const totalFluidConsumed = useMemo(() => {
    return fluidLogs.reduce((sum, item) => sum + item.amountMl, 0);
  }, [fluidLogs]);

  const fluidPercentage = useMemo(() => {
    return Math.min(100, Math.round((totalFluidConsumed / fluidLimit) * 100));
  }, [totalFluidConsumed, fluidLimit]);

  const fluidProgressVariant = useMemo(() => {
    if (fluidPercentage < 70) return 'success';
    if (fluidPercentage <= 90) return 'warning';
    return 'danger';
  }, [fluidPercentage]);

  // Handle Quick Add Fluid
  const handleAddFluidAmount = (amountMl: number) => {
    startTransition(() => {
      addFluidLog({
        patientId,
        amountMl,
        unit: 'ml',
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId,
        type: 'fluid',
        status: 'done',
        loggedAt: new Date().toISOString(),
        data: { amountMl },
      });

      loadAllLogs();
      showNotification(
        isAr
          ? `تمت إضافة ${amountMl} مل إلى سجل السوائل 💧`
          : `Added ${amountMl} mL to your fluid log 💧`
      );
    });
  };

  // Handle Custom Fluid Submit
  const handleCustomFluidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customAmount);
    if (isNaN(val) || val <= 0) return;

    const amountInMl = fluidUnit === 'cups' ? Math.round(val * 240) : Math.round(val);

    startTransition(() => {
      addFluidLog({
        patientId,
        amountMl: amountInMl,
        unit: fluidUnit,
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId,
        type: 'fluid',
        status: 'done',
        loggedAt: new Date().toISOString(),
        data: { amountMl: amountInMl, unit: fluidUnit },
      });

      setCustomAmount('');
      loadAllLogs();
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
        patientId,
        checklist: selectedChecklist,
        mealType: selectedMealType,
        loggedAt: new Date().toISOString(),
      });

      addAdherenceLog({
        patientId,
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

      {/* Tabs Header */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/80 rounded-2xl">
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
      </div>

      {/* =================================================== */}
      {/* 1. MEDICATION TAB */}
      {/* =================================================== */}
      {activeTab === 'medication' && (
        <div className="space-y-4">
          <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              {isAr ? 'أدوية ومثبتات الفوسفات اليوم' : "Today's Medication Adherence"}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr
                ? 'حدد حالة تناول كل دواء تم جدولته لليوم ثم اضغط حفظ'
                : 'Confirm which scheduled doses you completed or skipped'}
            </p>

            <div className="mt-4 space-y-3">
              {medReminders.length === 0 ? (
                <p className="text-sm text-slate-500 py-3 text-center">
                  {isAr ? 'لا توجد أدوية مقررة اليوم' : 'No medications scheduled today'}
                </p>
              ) : (
                medReminders.map((med) => {
                  const currentStatus = medStatuses[med.id] || 'pending';
                  return (
                    <div
                      key={med.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm leading-snug">
                          {med.title}
                        </h3>
                        <p className="text-xs text-[#1e6bb8] font-bold mt-0.5 font-mono">
                          🕒 {med.time}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleMedToggle(med.id, 'done')}
                          className={`
                            flex-1 sm:flex-none min-h-[48px] px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer
                            ${
                              currentStatus === 'done'
                                ? 'bg-emerald-600 text-white shadow-xs scale-102'
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                            }
                          `}
                        >
                          {isAr ? 'تم ✅' : 'Done ✅'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMedToggle(med.id, 'skipped')}
                          className={`
                            flex-1 sm:flex-none min-h-[48px] px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer
                            ${
                              currentStatus === 'skipped'
                                ? 'bg-amber-500 text-white shadow-xs scale-102'
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-amber-50 hover:text-amber-700'
                            }
                          `}
                        >
                          {isAr ? 'تخطي ⏭️' : 'Skip ⏭️'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleSaveMedications}
                disabled={isPending}
                className="font-extrabold min-h-[52px]"
              >
                {tCommon('save') || (isAr ? 'حفظ سجل الأدوية' : 'Save Medication Logs')}
              </Button>
            </div>
          </Card>

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
      {/* 2. FLUID TAB */}
      {/* =================================================== */}
      {activeTab === 'fluid' && (
        <div className="space-y-4">
          {/* Target and Progress Card */}
          <Card className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {tPatient('fluidAllowance') || (isAr ? 'حد السوائل اليومي' : 'Daily Fluid Target')}
                </p>
                <h2 className="text-2xl font-black text-slate-900 mt-0.5">
                  {totalFluidConsumed}{' '}
                  <span className="text-sm font-bold text-slate-500">/ {fluidLimit} mL</span>
                </h2>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center text-2xl font-bold">
                💧
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar
                value={totalFluidConsumed}
                max={fluidLimit}
                variant={fluidProgressVariant}
                size="lg"
                showValue={true}
                valueSuffix="mL"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600">
                {totalFluidConsumed >= fluidLimit
                  ? (isAr ? '⚠️ وصلت إلى الحد الأقصى' : '⚠️ Limit Reached!')
                  : isAr
                  ? `المتبقي: ${Math.max(0, fluidLimit - totalFluidConsumed)} مل`
                  : `Remaining: ${Math.max(0, fluidLimit - totalFluidConsumed)} mL`}
              </span>
              <span
                className={`font-black ${
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
                    min={fluidUnit === 'cups' ? '0.1' : '1'}
                    step={fluidUnit === 'cups' ? '0.1' : '1'}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder={fluidUnit === 'ml' ? 'e.g. 150' : 'e.g. 0.5'}
                    required
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
