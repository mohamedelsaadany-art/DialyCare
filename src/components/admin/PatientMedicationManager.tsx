'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PatientMedication, Patient } from '@/lib/types';
import {
  getPatients,
  getPatientMedications,
  addPatientMedication,
  updatePatientMedication,
  deletePatientMedication,
} from '@/lib/data-store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface PatientMedicationManagerProps {
  patientId?: string;
  onMedicationAdded?: (med: PatientMedication) => void;
  onMedicationUpdated?: (med: PatientMedication) => void;
  onMedicationDeleted?: (id: string) => void;
  className?: string;
}

export function PatientMedicationManager({
  patientId: initialPatientId,
  onMedicationAdded,
  onMedicationUpdated,
  onMedicationDeleted,
  className = '',
}: PatientMedicationManagerProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tMeds = useTranslations('medications');
  const tCommon = useTranslations('common');

  const [patients, setPatients] = useState<Patient[]>(() => {
    if (typeof window !== 'undefined') {
      return getPatients();
    }
    return [];
  });
  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    if (initialPatientId) return initialPatientId;
    if (typeof window !== 'undefined') {
      const p = getPatients();
      return p[0]?.id || '';
    }
    return '';
  });
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formDose, setFormDose] = useState('');
  const [formScheduleTime, setFormScheduleTime] = useState('08:00');
  const [formScheduleTimes, setFormScheduleTimes] = useState<string[]>(['08:00']);
  const [formInstructions, setFormInstructions] = useState('');
  const [formInstructionsAr, setFormInstructionsAr] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync patients list on storage events
  useEffect(() => {
    const handleSync = () => {
      setPatients(getPatients());
    };
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Keep selectedPatientId in sync if initialPatientId prop changes
  useEffect(() => {
    if (initialPatientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  // Load medications for selected patient
  const loadMedications = useCallback(() => {
    if (!selectedPatientId) {
      setMedications([]);
      return;
    }
    const list = getPatientMedications(selectedPatientId);
    setMedications(list);
  }, [selectedPatientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMedications();
  }, [loadMedications]);

  // Listen to cross-component reactive updates
  useEffect(() => {
    const handleUpdate = () => {
      loadMedications();
    };
    window.addEventListener('dialycare_medications_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('dialycare_medications_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [loadMedications]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleOpenAddModal = () => {
    setEditingMedId(null);
    setFormName('');
    setFormNameAr('');
    setFormDose('');
    setFormScheduleTime('08:00');
    setFormScheduleTimes(['08:00']);
    setFormInstructions('');
    setFormInstructionsAr('');
    setFormIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (med: PatientMedication) => {
    setEditingMedId(med.id);
    setFormName(med.name);
    setFormNameAr(med.nameAr || '');
    setFormDose(med.dose);
    setFormScheduleTime(med.scheduleTime || '08:00');
    setFormScheduleTimes(med.scheduleTimes && med.scheduleTimes.length > 0 ? med.scheduleTimes : [med.scheduleTime || '08:00']);
    setFormInstructions(med.instructions || '');
    setFormInstructionsAr(med.instructionsAr || '');
    setFormIsActive(med.isActive !== false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddTimeSlot = () => {
    setFormScheduleTimes((prev) => [...prev, '14:00']);
  };

  const handleRemoveTimeSlot = (index: number) => {
    if (formScheduleTimes.length <= 1) return;
    setFormScheduleTimes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTimeSlotChange = (index: number, val: string) => {
    setFormScheduleTimes((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    if (index === 0) {
      setFormScheduleTime(val);
    }
  };

  const handleSaveMedication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setFormError(isAr ? 'يرجى اختيار المريض أولاً' : 'Please select a patient first');
      return;
    }
    if (!formName.trim()) {
      setFormError(isAr ? 'يرجى إدخال اسم الدواء' : 'Medication name is required');
      return;
    }
    if (!formDose.trim()) {
      setFormError(isAr ? 'يرجى تحديد الجرعة' : 'Medication dose is required');
      return;
    }

    const uniqueTimes = Array.from(new Set(formScheduleTimes.map((t) => t.trim()))).filter(Boolean);
    const primaryTime = uniqueTimes[0] || formScheduleTime || '08:00';

    if (editingMedId) {
      const updated = updatePatientMedication(editingMedId, {
        name: formName.trim(),
        nameAr: formNameAr.trim() || undefined,
        dose: formDose.trim(),
        scheduleTime: primaryTime,
        scheduleTimes: uniqueTimes.length > 0 ? uniqueTimes : [primaryTime],
        instructions: formInstructions.trim() || undefined,
        instructionsAr: formInstructionsAr.trim() || undefined,
        isActive: formIsActive,
      });

      if (updated) {
        loadMedications();
        onMedicationUpdated?.(updated);
        showToast(isAr ? 'تم تحديث الدواء بنجاح ✅' : 'Medication updated successfully ✅');
        setIsModalOpen(false);
      }
    } else {
      const created = addPatientMedication({
        patientId: selectedPatientId,
        name: formName.trim(),
        nameAr: formNameAr.trim() || undefined,
        dose: formDose.trim(),
        scheduleTime: primaryTime,
        scheduleTimes: uniqueTimes.length > 0 ? uniqueTimes : [primaryTime],
        instructions: formInstructions.trim() || undefined,
        instructionsAr: formInstructionsAr.trim() || undefined,
        isActive: formIsActive,
        createdAt: new Date().toISOString(),
      });

      loadMedications();
      onMedicationAdded?.(created);
      showToast(isAr ? 'تم تسجيل وتخصيص الدواء للمريض بنجاح ✅' : 'Prescribed medication assigned to patient ✅');
      setIsModalOpen(false);
    }
  };

  const handleDeleteMedication = (id: string) => {
    const ok = window.confirm(
      isAr
        ? 'هل أنت متأكد من رغبتك في حذف / إيقاف هذا الدواء للمريض؟'
        : 'Are you sure you want to discontinue this medication for this patient?'
    );
    if (!ok) return;

    deletePatientMedication(id);
    loadMedications();
    onMedicationDeleted?.(id);
    showToast(isAr ? 'تم حذف الدواء بنجاح 🗑️' : 'Medication removed successfully 🗑️');
  };

  const selectedPatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  return (
    <Card className={`p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-xs ${className}`}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm shadow-md flex items-center justify-between animate-in slide-in-from-top-2">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-emerald-700 rounded-lg text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center text-2xl shrink-0 shadow-inner">
            💊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {tMeds('title') || (isAr ? 'إدارة الأدوية الموصوفة للمريض' : 'Prescribed Medications')}
              </h2>
              <Badge variant="info" size="sm" className="font-mono font-bold">
                {medications.length}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr
                ? 'تخصيص الأدوية وجرعاتها ومواعيدها لكل مريض على حدة'
                : 'Assign exact drug names, doses, and schedules per patient'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Patient dropdown if not locked to single patient */}
          {!initialPatientId && patients.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="patient-select" className="text-xs font-bold text-slate-600 shrink-0">
                {isAr ? 'المريض:' : 'Patient:'}
              </label>
              <select
                id="patient-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="min-h-[48px] px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8] cursor-pointer"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isAr && p.fullNameAr ? `${p.fullNameAr} (${p.fullName})` : p.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={handleOpenAddModal}
            className="min-h-[48px] font-extrabold shadow-sm"
            data-testid="add-prescribed-medication-btn"
          >
            <span>➕</span>
            <span>{tMeds('addMedication') || (isAr ? 'إضافة دواء جديد' : 'Prescribe Medication')}</span>
          </Button>
        </div>
      </div>

      {/* Medication List */}
      <div className="mt-5 space-y-3.5">
        {medications.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 p-6">
            <span className="text-4xl block mb-2" role="img" aria-hidden="true">
              💊
            </span>
            <p className="text-sm font-extrabold text-slate-800">
              {tMeds('noMedications') ||
                (isAr
                  ? 'لا توجد أدوية مخصصة مسجلة لهذا المريض حالياً'
                  : 'No prescribed medications recorded for this patient yet.')}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {isAr
                ? 'اضغط على زر "إضافة دواء جديد" لإدراج اسم الدواء وجرعته ومواعيد تناوله اليومية.'
                : 'Click "Prescribe Medication" to assign a specific drug, dose, and daily dosing schedule.'}
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAddModal}
                className="min-h-[48px] font-bold"
              >
                ➕ {tMeds('addMedication') || (isAr ? 'إضافة دواء' : 'Add Medication')}
              </Button>
            </div>
          </div>
        ) : (
          medications.map((med) => {
            const times = med.scheduleTimes && med.scheduleTimes.length > 0 ? med.scheduleTimes : [med.scheduleTime];
            return (
              <div
                key={med.id}
                className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-[#1e6bb8]/40 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-900 text-base leading-snug">
                      {med.name}
                    </h3>
                    {med.nameAr && (
                      <span className="text-xs font-semibold text-slate-500 font-arabic">
                        ({med.nameAr})
                      </span>
                    )}
                    <Badge variant={med.isActive !== false ? 'success' : 'neutral'} size="sm" dot>
                      {med.isActive !== false
                        ? isAr ? 'نشط' : 'Active'
                        : isAr ? 'متوقف' : 'Discontinued'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                      ⚖️ {isAr ? 'الجرعة:' : 'Dose:'} <span className="font-mono text-[#1e6bb8]">{med.dose}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                      🕒 {isAr ? 'المواعيد:' : 'Schedule:'}
                      <span className="font-mono font-semibold text-slate-700">
                        {times.join(', ')}
                      </span>
                    </span>
                  </div>

                  {(med.instructions || med.instructionsAr) && (
                    <p className="text-xs text-slate-500 font-medium italic pt-0.5">
                      ℹ️ {isAr ? med.instructionsAr || med.instructions : med.instructions || med.instructionsAr}
                    </p>
                  )}
                </div>

                {/* Row actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEditModal(med)}
                    className="min-h-[48px] px-3 text-xs font-bold"
                    aria-label={`Edit ${med.name}`}
                  >
                    ✏️ {tCommon('edit') || (isAr ? 'تعديل' : 'Edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteMedication(med.id)}
                    className="min-h-[48px] px-3 text-xs font-bold"
                    aria-label={`Delete ${med.name}`}
                  >
                    🗑️ {tCommon('delete') || (isAr ? 'حذف' : 'Delete')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Medication Modal (Add / Edit) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <span>💊</span>
            <span className="font-black text-slate-900">
              {editingMedId
                ? tMeds('editMedication') || (isAr ? 'تعديل الدواء الموصوف' : 'Edit Prescribed Medication')
                : tMeds('addMedication') || (isAr ? 'وصف دواء جديد للمريض' : 'Prescribe New Medication')}
            </span>
          </div>
        }
        description={
          selectedPatient
            ? isAr
              ? `المريض المحدد: ${selectedPatient.fullNameAr || selectedPatient.fullName} (ID: ${selectedPatient.id})`
              : `Assigned to: ${selectedPatient.fullName} (ID: ${selectedPatient.id})`
            : undefined
        }
        maxWidth="lg"
      >
        <form onSubmit={handleSaveMedication} className="space-y-4 pt-1">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}

          {/* Drug Name (English) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {tMeds('medicationName') || (isAr ? 'اسم الدواء بالإنجليزية / التجاري' : 'Medication Name *')}
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={tMeds('medicationNamePlaceholder') || 'e.g. Sevelamer Carbonate 800mg'}
              className="min-h-[48px] text-sm"
              required
            />
          </div>

          {/* Drug Name (Arabic) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {tMeds('medicationNameAr') || (isAr ? 'اسم الدواء بالعربية (اختياري)' : 'Medication Name in Arabic (Optional)')}
            </label>
            <Input
              value={formNameAr}
              onChange={(e) => setFormNameAr(e.target.value)}
              placeholder={tMeds('medicationNameArPlaceholder') || 'مثال: سيفيلامير كربونات (رينفيلا)'}
              className="min-h-[48px] text-sm"
              dir="rtl"
            />
          </div>

          {/* Dose */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {tMeds('dose') || (isAr ? 'الجرعة المحددة *' : 'Prescribed Dose *')}
            </label>
            <Input
              value={formDose}
              onChange={(e) => setFormDose(e.target.value)}
              placeholder={tMeds('dosePlaceholder') || 'e.g. 800 mg (1 tablet), 5 mg, 0.25 mcg'}
              className="min-h-[48px] text-sm font-mono"
              required
            />
          </div>

          {/* Schedule Times */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-extrabold text-slate-700">
                {tMeds('scheduleTimes') || (isAr ? 'مواعيد تناول الجرعات اليومية' : 'Daily Dosing Schedule Times *')}
              </label>
              <button
                type="button"
                onClick={handleAddTimeSlot}
                className="text-xs font-extrabold text-[#1e6bb8] hover:underline cursor-pointer min-h-[48px] py-1 px-2"
              >
                ➕ {isAr ? 'إضافة موعد جرعة' : 'Add Time Slot'}
              </button>
            </div>

            <div className="space-y-2">
              {formScheduleTimes.map((timeVal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-400 w-6">
                    #{idx + 1}
                  </span>
                  <input
                    type="time"
                    value={timeVal}
                    onChange={(e) => handleTimeSlotChange(idx, e.target.value)}
                    required
                    className="flex-1 min-h-[48px] px-3 py-2 text-sm font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                  />
                  {formScheduleTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTimeSlot(idx)}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center p-2 rounded-xl text-red-500 hover:bg-red-50 font-bold"
                      title={isAr ? 'حذف هذا الموعد' : 'Remove time'}
                      aria-label={isAr ? 'حذف هذا الموعد' : 'Remove time'}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Clinical Instructions (English) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {tMeds('instructions') || (isAr ? 'التعليمات الطبية للمريض (الإنجليزية)' : 'Clinical Instructions')}
            </label>
            <Input
              value={formInstructions}
              onChange={(e) => setFormInstructions(e.target.value)}
              placeholder={tMeds('instructionsPlaceholder') || 'e.g. Take with meals to bind dietary phosphorus'}
              className="min-h-[48px] text-sm"
            />
          </div>

          {/* Clinical Instructions (Arabic) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {tMeds('instructionsAr') || (isAr ? 'التعليمات الطبية بالعربية' : 'Arabic Instructions (Optional)')}
            </label>
            <Input
              value={formInstructionsAr}
              onChange={(e) => setFormInstructionsAr(e.target.value)}
              placeholder={tMeds('instructionsArPlaceholder') || 'مثال: يؤخذ وسط الوجبة لربط الفوسفات في الطعام'}
              className="min-h-[48px] text-sm"
              dir="rtl"
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer min-h-[48px]">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="w-5 h-5 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8] cursor-pointer"
              />
              <span className="text-sm font-bold text-slate-800">
                {tMeds('active') || (isAr ? 'دواء نشط ومستمر' : 'Active Medication')}
              </span>
            </label>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsModalOpen(false)}
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
              💾 {tMeds('saveMedication') || (isAr ? 'حفظ الدواء' : 'Save Medication')}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

export default PatientMedicationManager;
