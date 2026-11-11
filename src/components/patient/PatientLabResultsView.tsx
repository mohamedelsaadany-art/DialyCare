'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PatientLabRecord } from '@/lib/types';
import { getPatientLabResults } from '@/lib/data-store';
import { CLINICAL_12_LAB_TESTS } from '@/components/admin/PatientLabResultsModal';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface PatientLabResultsViewProps {
  patientId: string;
  canEdit?: boolean;
  onEditClick?: (record?: PatientLabRecord | null) => void;
  className?: string;
}

export function PatientLabResultsView({
  patientId,
  canEdit = false,
  onEditClick,
  className = '',
}: PatientLabResultsViewProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tLabs = useTranslations('labResults');

  const [labRecords, setLabRecords] = useState<PatientLabRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const loadLabs = useCallback(() => {
    if (!patientId) {
      setLabRecords([]);
      return;
    }
    const results = getPatientLabResults(patientId);
    setLabRecords(results);
    if (results.length > 0 && !selectedRecordId) {
      setSelectedRecordId(results[0].id);
    }
  }, [patientId, selectedRecordId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLabs();
  }, [loadLabs]);

  // Reactive listener for lab changes across components/tabs
  useEffect(() => {
    const handleUpdate = () => {
      loadLabs();
    };
    window.addEventListener('dialycare_labs_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('dialycare_labs_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [loadLabs]);

  const currentRecord = useMemo(() => {
    if (!labRecords || labRecords.length === 0) return null;
    if (selectedRecordId) {
      const match = labRecords.find((r) => r.id === selectedRecordId);
      if (match) return match;
    }
    return labRecords[0];
  }, [labRecords, selectedRecordId]);

  // Calculate target breakdown for current record
  const metrics = useMemo(() => {
    if (!currentRecord || !currentRecord.values) {
      return { total: 0, inTarget: 0, high: 0, low: 0 };
    }

    let inTarget = 0;
    let high = 0;
    let low = 0;
    let total = 0;

    CLINICAL_12_LAB_TESTS.forEach((def) => {
      const val = currentRecord.values[def.key];
      if (val !== undefined && val !== null) {
        total++;
        if (val < def.refMin) low++;
        else if (val > def.refMax) high++;
        else inTarget++;
      }
    });

    return { total, inTarget, high, low };
  }, [currentRecord]);

  return (
    <Card className={`p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-2xl shrink-0 shadow-inner">
            🔬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {tLabs('title') || (isAr ? 'نتائج التحاليل المخبرية السريرية' : 'Clinical Laboratory Results')}
              </h2>
              {currentRecord && (
                <Badge variant="info" size="sm" className="font-mono font-bold">
                  {currentRecord.testDate}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr
                ? 'لوحة الفحوصات الدورية الـ 12 مع المسميات الثنائية والمعدلات المستهدفة لمرضى الغسيل'
                : '12 routine dialysis lab tests with side-by-side bilingual labels and target ranges'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* History selector if multiple dates exist */}
          {labRecords.length > 1 && (
            <select
              value={currentRecord?.id || ''}
              onChange={(e) => setSelectedRecordId(e.target.value)}
              className="min-h-[48px] px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8] cursor-pointer"
              aria-label="Select lab panel date"
            >
              {labRecords.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {r.testDate} {i === 0 ? (isAr ? '(الأحدث)' : '(Latest)') : ''}
                </option>
              ))}
            </select>
          )}

          {canEdit && (
            <Button
              variant="primary"
              size="md"
              onClick={() => onEditClick?.(currentRecord)}
              className="min-h-[48px] font-extrabold shadow-sm"
              data-testid="enter-lab-results-btn"
            >
              <span>✏️</span>
              <span>
                {currentRecord
                  ? tLabs('enterLabs') || (isAr ? 'تعديل التحاليل' : 'Update Lab Panel')
                  : tLabs('enterLabs') || (isAr ? 'إدخال التحاليل' : 'Enter Lab Results')}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!currentRecord ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 p-6 mt-4">
          <span className="text-4xl block mb-2" role="img" aria-hidden="true">
            🔬
          </span>
          <p className="text-sm font-extrabold text-slate-800">
            {tLabs('noLabs') || (isAr ? 'لا توجد نتائج تحاليل مسجلة لهذا المريض بعد' : 'No laboratory results recorded yet.')}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {canEdit
              ? isAr
                ? 'اضغط على زر "إدخال التحاليل" بالأعلى لإدراج نتائج الفحوصات الـ 12 للمريض.'
                : 'Click "Enter Lab Results" above to record the patient’s clinical panel.'
              : isAr
              ? 'يقوم الطبيب المعالج بتسجيل نتائج التحاليل الدورية فور صدورها من المختبر.'
              : 'Your nephrologist will post your monthly dialysis lab panel here.'}
          </p>
          {canEdit && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditClick?.(null)}
                className="min-h-[48px] font-bold"
              >
                ➕ {tLabs('enterLabs') || (isAr ? 'إدخال التحاليل الآن' : 'Enter Lab Results Now')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Quick Stats Badges Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">
                {isAr ? 'ملخص الحالة:' : 'Panel Summary:'}
              </span>
              <Badge variant="success" size="sm" className="font-extrabold">
                {metrics.inTarget} {isAr ? 'ضمن المعدل' : 'In Target'}
              </Badge>
              {metrics.high > 0 && (
                <Badge variant="warning" size="sm" className="font-extrabold">
                  {metrics.high} {isAr ? 'مرتفع' : 'Above Target'}
                </Badge>
              )}
              {metrics.low > 0 && (
                <Badge variant="danger" size="sm" className="font-extrabold">
                  {metrics.low} {isAr ? 'منخفض' : 'Below Target'}
                </Badge>
              )}
            </div>

            <div className="text-xs text-slate-500 font-semibold">
              📅 {isAr ? 'تاريخ التحليل:' : 'Test Date:'}{' '}
              <strong className="text-slate-800 font-mono">{currentRecord.testDate}</strong>
            </div>
          </div>

          {/* 12 Tests Grid with side-by-side bilingual names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {CLINICAL_12_LAB_TESTS.map((test) => {
              const val = currentRecord.values ? currentRecord.values[test.key] : undefined;
              const hasVal = val !== undefined && val !== null;

              let status: 'normal' | 'high' | 'low' = 'normal';
              if (hasVal) {
                if (val < test.refMin) status = 'low';
                else if (val > test.refMax) status = 'high';
                else status = 'normal';
              }

              return (
                <div
                  key={test.key}
                  className={`
                    p-4 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 shadow-2xs
                    ${
                      !hasVal
                        ? 'bg-slate-50/50 border-slate-200 opacity-70'
                        : status === 'normal'
                        ? 'bg-white border-emerald-200/90 hover:border-emerald-400'
                        : status === 'high'
                        ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400'
                        : 'bg-red-50/40 border-red-300 hover:border-red-400'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* Side-by-side Bilingual Label for all 12 tests */}
                      <h4 className="font-black text-slate-900 text-sm leading-snug">
                        {test.nameEn} / <span className="font-arabic text-[#1e6bb8]">{test.nameAr}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {isAr ? 'المعدل المستهدف:' : 'Target:'} {test.refMin} - {test.refMax} {test.unit}
                      </p>
                    </div>

                    {hasVal && (
                      <Badge
                        variant={status === 'normal' ? 'success' : status === 'high' ? 'warning' : 'danger'}
                        size="sm"
                        className="font-extrabold text-[10px] shrink-0"
                      >
                        {status === 'normal'
                          ? isAr ? 'طبيعي' : 'In Target'
                          : status === 'high'
                          ? isAr ? 'مرتفع' : 'High'
                          : isAr ? 'منخفض' : 'Low'}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                        {hasVal ? val : '—'}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {test.unit}
                      </span>
                    </div>

                    {!hasVal && (
                      <span className="text-[11px] text-slate-400 font-semibold italic">
                        {isAr ? 'غير مسجل' : 'Not recorded'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clinical Assessment Notes */}
          {currentRecord.notes && (
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/80 text-xs text-slate-700 leading-relaxed">
              <strong className="font-black text-[#1e6bb8] block mb-1">
                📝 {isAr ? 'ملاحظات الطبيب وتوصيات العلاج:' : 'Nephrologist Notes & Guidance:'}
              </strong>
              <p className="font-medium text-slate-800">{currentRecord.notes}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default PatientLabResultsView;
