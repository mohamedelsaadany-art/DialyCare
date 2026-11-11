'use client';

import React, { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PatientLabRecord, LabTestValues } from '@/lib/types';
import { savePatientLabResults } from '@/lib/data-store';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export interface ClinicalLabTestDef {
  key: keyof LabTestValues;
  nameEn: string;
  nameAr: string;
  unit: string;
  refMin: number;
  refMax: number;
  step?: string;
  placeholder: string;
}

export const CLINICAL_12_LAB_TESTS: ClinicalLabTestDef[] = [
  {
    key: 'hemoglobin',
    nameEn: 'Hemoglobin',
    nameAr: 'الهيموجلوبين',
    unit: 'g/dL',
    refMin: 10.0,
    refMax: 12.0,
    step: '0.1',
    placeholder: '11.0',
  },
  {
    key: 'wbc',
    nameEn: 'WBC',
    nameAr: 'كرات الدم البيضاء',
    unit: '10^3/µL',
    refMin: 4.0,
    refMax: 10.0,
    step: '0.1',
    placeholder: '6.5',
  },
  {
    key: 'platelets',
    nameEn: 'Platelets',
    nameAr: 'الصفائح الدموية',
    unit: '10^3/µL',
    refMin: 150,
    refMax: 450,
    step: '1',
    placeholder: '250',
  },
  {
    key: 'calcium',
    nameEn: 'Calcium',
    nameAr: 'الكالسيوم',
    unit: 'mg/dL',
    refMin: 8.4,
    refMax: 10.2,
    step: '0.1',
    placeholder: '9.2',
  },
  {
    key: 'phosphorus',
    nameEn: 'Phosphorus',
    nameAr: 'الفسفور',
    unit: 'mg/dL',
    refMin: 3.5,
    refMax: 5.5,
    step: '0.1',
    placeholder: '4.5',
  },
  {
    key: 'pth',
    nameEn: 'PTH',
    nameAr: 'الغدة الجار درقية',
    unit: 'pg/mL',
    refMin: 150,
    refMax: 300,
    step: '1',
    placeholder: '220',
  },
  {
    key: 'creatinine',
    nameEn: 'Creatinine',
    nameAr: 'الكرياتينين',
    unit: 'mg/dL',
    refMin: 6.0,
    refMax: 12.0,
    step: '0.1',
    placeholder: '8.5',
  },
  {
    key: 'urea',
    nameEn: 'Urea',
    nameAr: 'اليوريا',
    unit: 'mg/dL',
    refMin: 50,
    refMax: 150,
    step: '1',
    placeholder: '90',
  },
  {
    key: 'serumIron',
    nameEn: 'Serum Iron',
    nameAr: 'حديد الدم',
    unit: 'µg/dL',
    refMin: 60,
    refMax: 170,
    step: '1',
    placeholder: '85',
  },
  {
    key: 'tibc',
    nameEn: 'TIBC',
    nameAr: 'السعة الكلية لربط الحديد',
    unit: 'µg/dL',
    refMin: 250,
    refMax: 400,
    step: '1',
    placeholder: '310',
  },
  {
    key: 'ferritin',
    nameEn: 'Ferritin',
    nameAr: 'الفيريتين',
    unit: 'ng/mL',
    refMin: 200,
    refMax: 500,
    step: '1',
    placeholder: '350',
  },
  {
    key: 'albumin',
    nameEn: 'Albumin',
    nameAr: 'الألبومين',
    unit: 'g/dL',
    refMin: 3.5,
    refMax: 5.0,
    step: '0.1',
    placeholder: '4.1',
  },
];

export interface PatientLabResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  existingRecord?: PatientLabRecord | null;
  onSaved?: (record: PatientLabRecord) => void;
}

export function PatientLabResultsModal({
  isOpen,
  onClose,
  patientId,
  existingRecord,
  onSaved,
}: PatientLabResultsModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tLabs = useTranslations('labResults');
  const tCommon = useTranslations('common');

  const [testDate, setTestDate] = useState<string>('');
  const [recordedBy, setRecordedBy] = useState<string>('Dr. Nephrologist');
  const [notes, setNotes] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form when opened or when existingRecord changes
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTestDate(existingRecord?.testDate || new Date().toISOString().slice(0, 10));
      setRecordedBy(existingRecord?.recordedBy || 'Dr. Nephrologist');
      setNotes(existingRecord?.notes || '');
      const valMap: Record<string, string> = {};
      if (existingRecord?.values) {
        Object.entries(existingRecord.values).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            valMap[k] = String(v);
          }
        });
      }
      setValues(valMap);
      setErrorMessage(null);
    }
  }, [isOpen, existingRecord]);

  const handleValueChange = (key: string, val: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const getTestStatus = (def: ClinicalLabTestDef, rawVal: string) => {
    if (!rawVal.trim()) return null;
    const num = parseFloat(rawVal);
    if (isNaN(num)) return null;

    if (num < def.refMin) return 'low';
    if (num > def.refMax) return 'high';
    return 'normal';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDate) {
      setErrorMessage(isAr ? 'يرجى تحديد تاريخ الفحص المخبري' : 'Please select test date');
      return;
    }

    // Convert string map to numeric LabTestValues
    const parsedValues: LabTestValues = {};
    let enteredCount = 0;
    CLINICAL_12_LAB_TESTS.forEach((def) => {
      const raw = values[def.key];
      if (raw !== undefined && raw.trim() !== '') {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          parsedValues[def.key] = num;
          enteredCount++;
        }
      }
    });

    if (enteredCount === 0) {
      setErrorMessage(
        isAr
          ? 'يرجى إدخال قيمة تحليل مخبري واحد على الأقل'
          : 'Please enter at least one laboratory test value'
      );
      return;
    }

    const payload = {
      ...(existingRecord?.id ? { id: existingRecord.id } : {}),
      patientId,
      testDate,
      recordedBy: recordedBy || 'Dr. Nephrologist',
      recordedAt: new Date().toISOString(),
      values: parsedValues,
      notes: notes.trim() || undefined,
    };

    const saved = savePatientLabResults(payload);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" role="img" aria-hidden="true">
            🔬
          </span>
          <span className="font-black text-slate-900 text-lg">
            {existingRecord
              ? tLabs('enterLabs') || (isAr ? 'تعديل نتائج التحاليل المخبرية' : 'Edit Clinical Lab Panel')
              : tLabs('enterLabs') || (isAr ? 'إدخال نتائج التحاليل المخبرية' : 'Enter Clinical Lab Results')}
          </span>
        </div>
      }
      description={
        isAr
          ? 'إدخال وتحديث نتائج الفحوصات الدورية الـ 12 مع المسميات الثنائية والمعدلات المستهدفة لمرضى الغسيل'
          : 'Enter and update all 12 routine clinical hemodialysis lab tests with side-by-side bilingual terms'
      }
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 pt-2">
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Header Metadata (Date & Recorder) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              📅 {tLabs('testDate') || (isAr ? 'تاريخ إجراء الفحص' : 'Laboratory Test Date *')}
            </label>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              required
              className="w-full min-h-[48px] px-3.5 py-2 text-sm font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              👨‍⚕️ {isAr ? 'المسجل / الطبيب المعالج' : 'Clinician / Recorder'}
            </label>
            <Input
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              placeholder="Dr. Nephrologist"
              className="min-h-[48px] text-sm font-semibold"
            />
          </div>
        </div>

        {/* 12 Tests Grid with Side-by-Side Bilingual Labels */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {isAr ? 'الفحوصات السريرية الـ 12 المعتمدة' : '12 Clinical Laboratory Investigations'}
            </h3>
            <span className="text-[11px] font-semibold text-slate-500">
              {isAr ? 'القيم بالمعدلات المستهدفة لمرضى الغسيل' : 'Targets tailored for hemodialysis patients'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto p-1 pr-2">
            {CLINICAL_12_LAB_TESTS.map((test) => {
              const currentVal = values[test.key] || '';
              const status = getTestStatus(test, currentVal);

              return (
                <div
                  key={test.key}
                  className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-[#1e6bb8]/40 transition-all flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* Side-by-Side Bilingual Label */}
                      <span className="font-extrabold text-slate-900 text-sm block leading-snug">
                        {test.nameEn} / <span className="font-arabic text-[#1e6bb8]">{test.nameAr}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-semibold block mt-0.5">
                        {isAr ? 'المستهدف:' : 'Target:'} {test.refMin} - {test.refMax} {test.unit}
                      </span>
                    </div>

                    {status && (
                      <Badge
                        variant={status === 'normal' ? 'success' : status === 'high' ? 'warning' : 'danger'}
                        size="sm"
                        className="font-bold text-[10px] shrink-0"
                      >
                        {status === 'normal'
                          ? isAr ? 'طبيعي' : 'In Target'
                          : status === 'high'
                          ? isAr ? 'مرتفع' : 'High'
                          : isAr ? 'منخفض' : 'Low'}
                      </Badge>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step={test.step || 'any'}
                      value={currentVal}
                      onChange={(e) => handleValueChange(test.key, e.target.value)}
                      placeholder={test.placeholder}
                      aria-label={`${test.nameEn} / ${test.nameAr}`}
                      className="w-full min-h-[48px] px-3.5 py-2 pe-16 text-sm font-mono font-bold rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      {test.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clinical Notes */}
        <div>
          <label className="block text-xs font-extrabold text-slate-700 mb-1">
            📝 {isAr ? 'ملاحظات وتوصيات الطبيب السريرية' : 'Clinical Assessment & Nephrologist Notes'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={
              isAr
                ? 'سجل التوصيات بخصوص جرعات مثبتات الفوسفات، إبر الحديد، أو تعديل خطة العلاج...'
                : 'e.g. Phosphate binders adequate, ferritin within target, continue current dosing...'
            }
            className="w-full p-3 text-sm rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            className="min-h-[48px] font-bold"
          >
            {tCommon('cancel') || (isAr ? 'إلغاء' : 'Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="min-h-[48px] font-extrabold"
          >
            💾 {tLabs('saveLabs') || (isAr ? 'حفظ نتائج التحاليل' : 'Save Laboratory Results')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default PatientLabResultsModal;
