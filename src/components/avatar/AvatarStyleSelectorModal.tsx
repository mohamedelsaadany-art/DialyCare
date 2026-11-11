'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  AVATAR_PRESETS,
  type AvatarPreset,
  type Gender,
  PatientAvatarSvg,
} from './PatientAvatarPresets';
import { updatePatientAvatar } from '@/lib/data-store';

export interface AvatarStyleSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  currentAvatarId?: string;
  patientGender?: Gender;
  onAvatarSelected?: (avatarId: string) => void;
}

export function AvatarStyleSelectorModal({
  isOpen,
  onClose,
  patientId,
  currentAvatarId,
  patientGender,
  onAvatarSelected,
}: AvatarStyleSelectorModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [selectedId, setSelectedId] = useState<string>(
    currentAvatarId || (patientGender === 'female' ? 'female_mature_1' : 'male_mature_1')
  );
  const [prevAvatarId, setPrevAvatarId] = useState<string | undefined>(currentAvatarId);
  if (currentAvatarId !== prevAvatarId) {
    setPrevAvatarId(currentAvatarId);
    if (currentAvatarId) {
      setSelectedId(currentAvatarId);
    }
  }
  const [filterGender, setFilterGender] = useState<'all' | Gender>(patientGender || 'all');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const filteredPresets = useMemo(() => {
    if (filterGender === 'all') return AVATAR_PRESETS;
    return AVATAR_PRESETS.filter((p) => p.gender === filterGender);
  }, [filterGender]);

  const currentPreset: AvatarPreset = useMemo(() => {
    return AVATAR_PRESETS.find((p) => p.id === selectedId) || AVATAR_PRESETS[0];
  }, [selectedId]);

  if (!isOpen) return null;

  const handleSave = () => {
    updatePatientAvatar(patientId, selectedId, selectedId);
    if (onAvatarSelected) {
      onAvatarSelected(selectedId);
    }
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 400);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-selector-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1e6bb8] text-white flex items-center justify-center shrink-0 shadow-md">
              <span className="text-2xl" role="img" aria-hidden="true">
                🎨
              </span>
            </div>
            <div>
              <h2
                id="avatar-selector-title"
                className="text-base sm:text-lg font-black text-slate-900 tracking-tight"
              >
                {isAr ? 'تخصيص المظهر والشخصية' : 'Personalize Patient Avatar'}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'اختر المظهر والشخصية التي تمثلك وترافقك يومياً'
                  : 'Choose the coaching avatar that best represents you'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق نافذة المظهر' : 'Close avatar selector modal'}
            className="w-10 h-10 min-h-[48px] min-w-[48px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-bold flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Selected Hero Preview Card */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white border-2 border-[#1e6bb8] p-1.5 shadow-sm shrink-0">
            <PatientAvatarSvg presetId={currentPreset.id} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 truncate">
                {isAr ? currentPreset.nameAr : currentPreset.nameEn}
              </h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-[#1e6bb8]">
                {currentPreset.gender === 'female'
                  ? isAr
                    ? 'سيدات 👩'
                    : 'Female 👩'
                  : isAr
                  ? 'رجال 👨'
                  : 'Male 👨'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-snug">
              {isAr ? currentPreset.descriptionAr : currentPreset.descriptionEn}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-teal-800">
              <span>🩺</span>
              <span>
                {currentPreset.medicalAccessory === 'permcath_chest'
                  ? isAr
                    ? 'قسطرة غسيل مستديمة (بيرمكاث)'
                    : 'Chest Permcath Access Dressing'
                  : isAr
                  ? 'ناسور شرياني وريدي (فيستولا الذراع)'
                  : 'Vascular AV Fistula Bandage'}
              </span>
            </div>
          </div>
        </div>

        {/* Gender Filter Tabs */}
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-white">
          <span className="text-xs font-black text-slate-500 me-1">
            {isAr ? 'التصنيف:' : 'Filter:'}
          </span>
          <button
            type="button"
            onClick={() => setFilterGender('all')}
            className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              filterGender === 'all'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isAr ? 'الكل (8)' : 'All (8)'}
          </button>
          <button
            type="button"
            onClick={() => setFilterGender('male')}
            className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              filterGender === 'male'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isAr ? 'رجال (4)' : 'Male (4)'}
          </button>
          <button
            type="button"
            onClick={() => setFilterGender('female')}
            className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              filterGender === 'female'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isAr ? 'سيدات (4)' : 'Female (4)'}
          </button>
        </div>

        {/* Presets Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white">
          {filteredPresets.map((preset) => {
            const isSelected = preset.id === selectedId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedId(preset.id)}
                aria-label={
                  isAr
                    ? `اختيار مظهر ${preset.nameAr}`
                    : `Select avatar ${preset.nameEn}`
                }
                className={`
                  relative min-h-[48px] p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all cursor-pointer group
                  ${
                    isSelected
                      ? 'border-[#1e6bb8] bg-blue-50/80 shadow-md ring-2 ring-blue-300'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }
                `}
              >
                {/* Active Selection Badge */}
                {isSelected && (
                  <span className="absolute top-2 end-2 w-5 h-5 rounded-full bg-[#1e6bb8] text-white text-xs font-black flex items-center justify-center shadow-xs">
                    ✓
                  </span>
                )}

                <div className="w-16 h-16 rounded-xl bg-white p-1 border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform">
                  <PatientAvatarSvg presetId={preset.id} />
                </div>

                <p className="text-xs font-black text-slate-900 mt-2 truncate w-full">
                  {isAr ? preset.nameAr : preset.nameEn}
                </p>

                <span className="text-[10px] font-semibold text-slate-500 mt-0.5 line-clamp-1">
                  {preset.medicalAccessory === 'permcath_chest'
                    ? isAr
                      ? 'قسطرة صدر'
                      : 'Permcath'
                    : isAr
                    ? 'فيستولا ذراع'
                    : 'Fistula Arm'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-black transition-colors cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaved}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#1e6bb8] hover:bg-[#155392] text-white text-xs font-black transition-all cursor-pointer shadow-md flex items-center gap-2"
          >
            <span>{isSaved ? '✓' : '💾'}</span>
            <span>
              {isSaved
                ? isAr
                  ? 'تم الحفظ بنجاح!'
                  : 'Saved Successfully!'
                : isAr
                ? 'حفظ المظهر الجديد'
                : 'Save Avatar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
