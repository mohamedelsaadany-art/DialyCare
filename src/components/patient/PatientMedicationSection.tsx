'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PatientMedication, AdherenceLog, AdherenceStatus } from '@/lib/types';
import {
  getPatientMedications,
  getAdherenceLogs,
  addAdherenceLog,
} from '@/lib/data-store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface PatientMedicationSectionProps {
  patientId: string;
  isEditable?: boolean;
  showTitle?: boolean;
  className?: string;
  onAdherenceLogged?: (log: AdherenceLog) => void;
}

interface DoseSlot {
  medicationId: string;
  medicationName: string;
  medicationNameAr?: string;
  dose: string;
  time: string;
  instructions?: string;
  instructionsAr?: string;
  status: AdherenceStatus | 'pending';
  logId?: string;
}

export function PatientMedicationSection({
  patientId,
  isEditable = true,
  showTitle = true,
  className = '',
  onAdherenceLogged,
}: PatientMedicationSectionProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tMeds = useTranslations('medications');

  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [doseStatuses, setDoseStatuses] = useState<Record<string, AdherenceStatus | 'pending'>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load medications & today's adherence logs
  const loadData = useCallback(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const activeMeds = getPatientMedications(patientId).filter((m) => m.isActive !== false);
    const logs = getAdherenceLogs(patientId, 'ttt', {
      start: startOfToday.toISOString(),
      end: endOfToday.toISOString(),
    });

    setMedications(activeMeds);

    // Compute status map for each dose slot: key = `${medId}_${time}`
    const statuses: Record<string, AdherenceStatus | 'pending'> = {};
    activeMeds.forEach((med) => {
      const times =
        med.scheduleTimes && med.scheduleTimes.length > 0
          ? med.scheduleTimes
          : med.scheduleTime
          ? [med.scheduleTime]
          : [''];
      times.forEach((t) => {
        const slotKey = `${med.id}_${t}`;
        // Find matching adherence log for this med & time, or any log for this med today
        const matchingLog = logs.find((l) => {
          if (l.data && typeof l.data === 'object') {
            if (l.data.medicationId === med.id) {
              return !l.data.scheduleTime || l.data.scheduleTime === t;
            }
          }
          return false;
        });

        if (matchingLog) {
          statuses[slotKey] = matchingLog.status;
        } else {
          statuses[slotKey] = 'pending';
        }
      });
    });

    setDoseStatuses(statuses);
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Reactive listener for medication updates and adherence logs
  useEffect(() => {
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('dialycare_medications_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('dialycare_medications_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [loadData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Flatten medications into individual dose slots for today
  const doseSlots: DoseSlot[] = useMemo(() => {
    const list: DoseSlot[] = [];
    medications.forEach((med) => {
      const times =
        med.scheduleTimes && med.scheduleTimes.length > 0
          ? med.scheduleTimes
          : med.scheduleTime
          ? [med.scheduleTime]
          : [''];
      times.forEach((t) => {
        const slotKey = `${med.id}_${t}`;
        list.push({
          medicationId: med.id,
          medicationName: med.name,
          medicationNameAr: med.nameAr,
          dose: med.dose,
          time: t,
          instructions: med.instructions,
          instructionsAr: med.instructionsAr,
          status: doseStatuses[slotKey] || 'pending',
        });
      });
    });

    // Sort chronologically by time
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, doseStatuses]);

  // Handle Mark Done or Skip
  const handleRecordDose = (slot: DoseSlot, newStatus: AdherenceStatus) => {
    if (!isEditable) return;

    const slotKey = `${slot.medicationId}_${slot.time}`;

    // Optimistically update UI
    setDoseStatuses((prev) => ({
      ...prev,
      [slotKey]: newStatus,
    }));

    // Record in dataStore
    const newLog = addAdherenceLog({
      patientId,
      type: 'ttt',
      status: newStatus,
      loggedAt: new Date().toISOString(),
      data: {
        title: `${slot.medicationName} - ${slot.dose} (${slot.time})`,
        medicationId: slot.medicationId,
        medicationName: slot.medicationName,
        dose: slot.dose,
        scheduleTime: slot.time,
      },
    });

    onAdherenceLogged?.(newLog);

    if (newStatus === 'done') {
      showToast(
        isAr
          ? `أحسنت! تم تسجيل تناول جرعة ${slot.medicationNameAr || slot.medicationName} بنجاح ✅`
          : `Recorded dose for ${slot.medicationName} as completed ✅`
      );
    } else {
      showToast(
        isAr
          ? `تم تسجيل تخطي جرعة ${slot.medicationNameAr || slot.medicationName} ⏭️`
          : `Recorded dose for ${slot.medicationName} as skipped ⏭️`
      );
    }
  };

  const completedCount = useMemo(() => {
    return doseSlots.filter((d) => d.status === 'done').length;
  }, [doseSlots]);

  return (
    <Card className={`p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-xs ${className}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm shadow-md flex items-center justify-between animate-in slide-in-from-top-2">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-emerald-700 rounded-lg text-white"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Section Header */}
      {showTitle && (
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl shrink-0 shadow-inner">
              💊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {tMeds('todayMedications') || (isAr ? 'أدوية اليوم الموصوفة' : "Today's Prescribed Medications")}
                </h2>
                <Badge
                  variant={completedCount === doseSlots.length && doseSlots.length > 0 ? 'success' : 'info'}
                  size="sm"
                  className="font-mono font-bold"
                >
                  {completedCount}/{doseSlots.length} {isAr ? 'جرعة' : 'Taken'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'سجل التزامك بجرعات الأدوية الموصوفة بدقة للحفاظ على صحة الكلى والأوعية'
                  : 'Track each prescribed dose with exact drug name, dose, and schedule'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Medication Dosing List */}
      <div className="mt-4 space-y-3">
        {doseSlots.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6">
            <span className="text-3xl block mb-2" role="img" aria-hidden="true">
              💊
            </span>
            <p className="text-sm font-bold text-slate-700">
              {tMeds('noMedications') ||
                (isAr
                  ? 'لا توجد أدوية مخصصة مسجلة لهذا الحساب حتى الآن'
                  : 'No prescribed medications recorded yet.')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'يقوم طبيب الكلى المعالج بتحديد الأدوية وجرعاتها ومواعيدها هنا.'
                : 'Your nephrologist will assign your personalized prescription schedule here.'}
            </p>
          </div>
        ) : (
          doseSlots.map((slot, index) => {
            const isCompleted = slot.status === 'done';
            const isSkipped = slot.status === 'skipped';

            return (
              <div
                key={`${slot.medicationId}_${slot.time}_${index}`}
                className={`
                  p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5
                  ${
                    isCompleted
                      ? 'bg-emerald-50/40 border-emerald-300/80 shadow-xs'
                      : isSkipped
                      ? 'bg-slate-100/70 border-slate-300 text-slate-600'
                      : 'bg-white border-slate-200 hover:border-[#1e6bb8]/40 shadow-xs'
                  }
                `}
              >
                {/* Medication Details */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-900 text-base leading-snug">
                      {isAr && slot.medicationNameAr ? slot.medicationNameAr : slot.medicationName}
                    </h3>
                    {isAr && slot.medicationNameAr && slot.medicationName !== slot.medicationNameAr && (
                      <span className="text-xs font-semibold text-slate-500">
                        ({slot.medicationName})
                      </span>
                    )}
                    {!isAr && slot.medicationNameAr && (
                      <span className="text-xs font-semibold text-slate-400 font-arabic">
                        ({slot.medicationNameAr})
                      </span>
                    )}
                    {isCompleted && (
                      <Badge variant="success" size="sm" className="font-bold">
                        {isAr ? 'تم التناول ✅' : 'Taken ✅'}
                      </Badge>
                    )}
                    {isSkipped && (
                      <Badge variant="neutral" size="sm" className="font-bold">
                        {isAr ? 'تم التخطي ⏭️' : 'Skipped ⏭️'}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                      ⚖️ {isAr ? 'الجرعة:' : 'Dose:'}{' '}
                      <strong className="font-mono text-[#1e6bb8]">{slot.dose}</strong>
                    </span>

                    <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-blue-50/70 text-[#1e6bb8] px-2.5 py-0.5 rounded-lg border border-blue-200">
                      🕒{' '}
                      <span className="font-mono">
                        {slot.time || (isAr ? 'حسب الإرشادات' : 'As directed')}
                      </span>
                    </span>
                  </div>

                  {(slot.instructions || slot.instructionsAr) && (
                    <p className="text-xs text-slate-600 font-medium pt-1">
                      💡 {isAr ? slot.instructionsAr || slot.instructions : slot.instructions || slot.instructionsAr}
                    </p>
                  )}
                </div>

                {/* Dose Tracking Action Buttons (Done / Skip) - Min 48px touch targets */}
                {isEditable && (
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleRecordDose(slot, 'done')}
                      aria-label={`${isAr ? 'تم تناول' : 'Mark taken'} ${slot.medicationName}`}
                      className={`
                        min-h-[48px] px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95
                        ${
                          isCompleted
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-md scale-102'
                            : 'bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                        }
                      `}
                    >
                      <span>✅</span>
                      <span>{isAr ? 'تم' : 'Done'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRecordDose(slot, 'skipped')}
                      aria-label={`${isAr ? 'تخطي' : 'Skip dose'} ${slot.medicationName}`}
                      className={`
                        min-h-[48px] px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95
                        ${
                          isSkipped
                            ? 'bg-slate-700 text-white ring-2 ring-slate-400 shadow-md'
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }
                      `}
                    >
                      <span>⏭️</span>
                      <span>{isAr ? 'تخطي' : 'Skip'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

export default PatientMedicationSection;
