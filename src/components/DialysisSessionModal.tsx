'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  DialysisSession,
  DialysisSessionVitals,
  VitalsTimepoint,
  LegEdemaLevel,
  LungCracklesLevel,
  DyspneaLevel,
  DialysisAccessType,
  DialysateFlowRate,
  SessionDurationHours,
} from '@/lib/types';
import { addDialysisSession, updateDialysisSession } from '@/lib/data-store';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export interface DialysisSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  recordedBy?: string;
  onSessionRecorded?: (session: DialysisSession) => void;
  initialSession?: DialysisSession | null;
}

type VitalsTimepointForm = {
  systolic: string;
  diastolic: string;
  heartRate: string;
};

type DialysisSessionVitalsForm = Record<keyof DialysisSessionVitals, VitalsTimepointForm>;

const DEFAULT_TIMEPOINT: VitalsTimepointForm = {
  systolic: '130',
  diastolic: '80',
  heartRate: '72',
};

const DEFAULT_VITALS: DialysisSessionVitals = {
  preSession: { systolic: 140, diastolic: 85, heartRate: 76 },
  after1hr: { systolic: 135, diastolic: 82, heartRate: 74 },
  after2hr: { systolic: 130, diastolic: 80, heartRate: 72 },
  after3hr: { systolic: 125, diastolic: 78, heartRate: 75 },
  endSession: { systolic: 128, diastolic: 79, heartRate: 72 },
};

function toVitalsForm(vitals: DialysisSessionVitals): DialysisSessionVitalsForm {
  const mapTp = (tp: VitalsTimepoint | undefined, fallback: VitalsTimepoint): VitalsTimepointForm => ({
    systolic: String(tp?.systolic ?? fallback.systolic),
    diastolic: String(tp?.diastolic ?? fallback.diastolic),
    heartRate: String(tp?.heartRate ?? fallback.heartRate),
  });
  return {
    preSession: mapTp(vitals.preSession, DEFAULT_VITALS.preSession),
    after1hr: mapTp(vitals.after1hr, DEFAULT_VITALS.after1hr),
    after2hr: mapTp(vitals.after2hr, DEFAULT_VITALS.after2hr),
    after3hr: mapTp(vitals.after3hr, DEFAULT_VITALS.after3hr),
    endSession: mapTp(vitals.endSession, DEFAULT_VITALS.endSession),
  };
}

export function DialysisSessionModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  recordedBy = 'doctor',
  onSessionRecorded,
  initialSession,
}: DialysisSessionModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tSession = useTranslations('dialysisSession');
  const tCommon = useTranslations('common');

  // Form states for all 14 clinical fields
  const [sessionDate, setSessionDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  // Field 1: Compliance rating (1-5)
  const [complianceRating, setComplianceRating] = useState<1 | 2 | 3 | 4 | 5>(5);

  // Field 2: Pre-dialysis weight (kg + grams)
  const [preWeightKg, setPreWeightKg] = useState<string>('70');
  const [preWeightGrams, setPreWeightGrams] = useState<string>('0');

  // Field 3: Post-dialysis weight (kg + grams)
  const [postWeightKg, setPostWeightKg] = useState<string>('68');
  const [postWeightGrams, setPostWeightGrams] = useState<string>('0');

  // Field 4 & 5: Vitals (BP & HR at 5 timepoints)
  const [vitals, setVitals] = useState<DialysisSessionVitalsForm>(() =>
    toVitalsForm(DEFAULT_VITALS)
  );

  // Field 6: Temperature (°C)
  const [temperatureC, setTemperatureC] = useState<string>('36.6');

  // Field 7: Fluid status assessment
  const [legEdema, setLegEdema] = useState<LegEdemaLevel>('none');
  const [lungCrackles, setLungCrackles] = useState<LungCracklesLevel>('none');
  const [dyspnea, setDyspnea] = useState<DyspneaLevel>('none');

  // Field 8: Vascular access inspection signs of infection (yes / no)
  const [accessInfectionSigns, setAccessInfectionSigns] = useState<boolean>(false);

  // Field 9: Session duration (1 / 2 / 3 / 4 hours)
  const [durationHours, setDurationHours] = useState<SessionDurationHours>(4);

  // Field 10: Ultrafiltration volume (mL)
  const [ultrafiltrationVolumeMl, setUltrafiltrationVolumeMl] = useState<string>('2000');

  // Field 11: Blood flow rate (mL/min)
  const [bloodFlowRateMlMin, setBloodFlowRateMlMin] = useState<string>('350');

  // Field 12: Dialysate flow rate (300 / 500 / 700 / 800 mL/min)
  const [dialysateFlowRateMlMin, setDialysateFlowRateMlMin] = useState<DialysateFlowRate>(500);

  // Field 13: Access type (AVF / AVG / Permcath / Mahurkar)
  const [accessType, setAccessType] = useState<DialysisAccessType>('AVF');

  // Field 14: Sodium concentration in dialysis machine (mEq/L)
  const [machineSodiumMeqL, setMachineSodiumMeqL] = useState<string>('138');

  // Notes
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formBodyRef = useRef<HTMLDivElement>(null);

  // Populate form if initialSession changes or modal opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    if (initialSession) {
      setSessionDate(initialSession.sessionDate);
      setComplianceRating(initialSession.complianceRating);
      setPreWeightKg(String(initialSession.preWeightKg));
      setPreWeightGrams(String(initialSession.preWeightGrams ?? 0));
      setPostWeightKg(String(initialSession.postWeightKg));
      setPostWeightGrams(String(initialSession.postWeightGrams ?? 0));
      setVitals(toVitalsForm(initialSession.vitals || DEFAULT_VITALS));
      setTemperatureC(String(initialSession.temperatureC));
      setLegEdema(initialSession.fluidStatus?.legEdema || 'none');
      setLungCrackles(initialSession.fluidStatus?.lungCrackles || 'none');
      setDyspnea(initialSession.fluidStatus?.dyspnea || 'none');
      setAccessInfectionSigns(Boolean(initialSession.accessInfectionSigns));
      setDurationHours(initialSession.durationHours || 4);
      setUltrafiltrationVolumeMl(String(initialSession.ultrafiltrationVolumeMl));
      setBloodFlowRateMlMin(String(initialSession.bloodFlowRateMlMin));
      setDialysateFlowRateMlMin(initialSession.dialysateFlowRateMlMin || 500);
      setAccessType(initialSession.accessType || 'AVF');
      setMachineSodiumMeqL(String(initialSession.machineSodiumMeqL));
      setNotes(initialSession.notes || '');
      setErrorMsg(null);
    } else if (isOpen) {
      setSessionDate(new Date().toISOString().slice(0, 10));
      setComplianceRating(5);
      setPreWeightKg('70');
      setPreWeightGrams('0');
      setPostWeightKg('68');
      setPostWeightGrams('0');
      setVitals(toVitalsForm(DEFAULT_VITALS));
      setTemperatureC('36.6');
      setLegEdema('none');
      setLungCrackles('none');
      setDyspnea('none');
      setAccessInfectionSigns(false);
      setDurationHours(4);
      setUltrafiltrationVolumeMl('2000');
      setBloodFlowRateMlMin('350');
      setDialysateFlowRateMlMin(500);
      setAccessType('AVF');
      setMachineSodiumMeqL('138');
      setNotes('');
      setErrorMsg(null);
    }
  }, [initialSession, isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle vitals timepoint changes (keep string values so clearing inputs works smoothly)
  const handleVitalsChange = (
    timepointKey: keyof DialysisSessionVitals,
    field: keyof VitalsTimepoint,
    value: string
  ) => {
    setVitals((prev) => ({
      ...prev,
      [timepointKey]: {
        ...prev[timepointKey],
        [field]: value,
      },
    }));
  };

  const showValidationError = (msg: string) => {
    setErrorMsg(msg);
    formBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!sessionDate.trim()) {
      showValidationError(
        isAr ? 'يرجى تحديد تاريخ الجلسة.' : 'Please select a dialysis session date.'
      );
      return;
    }

    const preKg = parseFloat(preWeightKg);
    const postKg = parseFloat(postWeightKg);
    const preGrams = preWeightGrams.trim() === '' ? 0 : Number(preWeightGrams);
    const postGrams = postWeightGrams.trim() === '' ? 0 : Number(postWeightGrams);
    const temp = parseFloat(temperatureC);
    const ufVol = parseFloat(ultrafiltrationVolumeMl);
    const bloodFlow = parseFloat(bloodFlowRateMlMin);
    const sodium = parseFloat(machineSodiumMeqL);

    if (isNaN(preKg) || preKg <= 0 || isNaN(postKg) || postKg <= 0) {
      showValidationError(
        isAr
          ? 'يرجى إدخال أوزان صحيحة قبل وبعد الجلسة بالكيلوجرام.'
          : 'Please enter valid pre- and post-dialysis weights.'
      );
      return;
    }

    if (
      isNaN(preGrams) ||
      preGrams < 0 ||
      preGrams > 999 ||
      isNaN(postGrams) ||
      postGrams < 0 ||
      postGrams > 999
    ) {
      showValidationError(
        isAr
          ? 'يرجى إدخال قيمة الجرامات بين 0 و 999 جرام.'
          : 'Please enter valid gram values between 0 and 999.'
      );
      return;
    }

    const parseNum = (s: string) => {
      const trimmed = s.trim();
      if (!trimmed) return NaN;
      const num = Number(trimmed);
      return Number.isFinite(num) ? Math.round(num) : NaN;
    };

    const parsedVitals: DialysisSessionVitals = {
      preSession: {
        systolic: parseNum(vitals.preSession.systolic),
        diastolic: parseNum(vitals.preSession.diastolic),
        heartRate: parseNum(vitals.preSession.heartRate),
      },
      after1hr: {
        systolic: parseNum(vitals.after1hr.systolic),
        diastolic: parseNum(vitals.after1hr.diastolic),
        heartRate: parseNum(vitals.after1hr.heartRate),
      },
      after2hr: {
        systolic: parseNum(vitals.after2hr.systolic),
        diastolic: parseNum(vitals.after2hr.diastolic),
        heartRate: parseNum(vitals.after2hr.heartRate),
      },
      after3hr: {
        systolic: parseNum(vitals.after3hr.systolic),
        diastolic: parseNum(vitals.after3hr.diastolic),
        heartRate: parseNum(vitals.after3hr.heartRate),
      },
      endSession: {
        systolic: parseNum(vitals.endSession.systolic),
        diastolic: parseNum(vitals.endSession.diastolic),
        heartRate: parseNum(vitals.endSession.heartRate),
      },
    };

    const vitalsList = Object.values(parsedVitals);
    const hasInvalidVitals = vitalsList.some(
      (tp) =>
        isNaN(tp.systolic) ||
        tp.systolic < 40 ||
        tp.systolic > 280 ||
        isNaN(tp.diastolic) ||
        tp.diastolic < 20 ||
        tp.diastolic > 180 ||
        isNaN(tp.heartRate) ||
        tp.heartRate < 25 ||
        tp.heartRate > 240
    );
    if (hasInvalidVitals) {
      showValidationError(
        isAr
          ? 'يرجى التأكد من صحة قياسات ضغط الدم والنبض في جميع النقاط الزمنية الـ 5.'
          : 'Please enter valid systolic, diastolic, and heart rate values across all 5 timepoints.'
      );
      return;
    }

    if (isNaN(temp) || temp < 34 || temp > 43) {
      showValidationError(
        isAr
          ? 'يرجى إدخال درجة حرارة طبيعية ومقبولة طبياً (°م).'
          : 'Please enter a valid clinical body temperature (°C).'
      );
      return;
    }

    if (isNaN(ufVol) || ufVol < 0) {
      showValidationError(
        isAr
          ? 'يرجى إدخال حجم سحب الماء الفائق (UF Volume) بشكل صحيح.'
          : 'Please enter a valid ultrafiltration volume (mL).'
      );
      return;
    }

    if (isNaN(bloodFlow) || bloodFlow <= 0) {
      showValidationError(
        isAr
          ? 'يرجى إدخال معدل تدفق الدم (Blood Flow Rate) بشكل صحيح.'
          : 'Please enter a valid blood flow rate (mL/min).'
      );
      return;
    }

    if (isNaN(sodium) || sodium < 120 || sodium > 160) {
      showValidationError(
        isAr
          ? 'يرجى إدخال تركيز صوديوم جهاز الغسيل بين 120 و 160 مل مكافئ/لتر.'
          : 'Please enter a machine sodium concentration between 120 and 160 mEq/L.'
      );
      return;
    }

    const sessionData = {
      patientId,
      sessionDate,
      recordedBy: initialSession?.recordedBy || recordedBy,
      complianceRating,
      preWeightKg: preKg,
      preWeightGrams: preGrams,
      postWeightKg: postKg,
      postWeightGrams: postGrams,
      vitals: parsedVitals,
      temperatureC: temp,
      fluidStatus: {
        legEdema,
        lungCrackles,
        dyspnea,
      },
      accessInfectionSigns,
      durationHours,
      ultrafiltrationVolumeMl: ufVol,
      bloodFlowRateMlMin: bloodFlow,
      dialysateFlowRateMlMin,
      accessType,
      machineSodiumMeqL: sodium,
      notes: notes.trim(),
    };

    let result: DialysisSession;
    if (initialSession && initialSession.id) {
      const updated = updateDialysisSession(initialSession.id, sessionData);
      result = updated || { ...sessionData, id: initialSession.id };
    } else {
      result = addDialysisSession(sessionData);
    }

    onSessionRecorded?.(result);
    onClose();
  };

  const timepointDefs: Array<{
    key: keyof DialysisSessionVitals;
    labelEn: string;
    labelAr: string;
    subEn: string;
    subAr: string;
  }> = [
    { key: 'preSession', labelEn: 'Pre-Session', labelAr: 'قبل الجلسة', subEn: '0 hr baseline', subAr: 'بداية الجلسة' },
    { key: 'after1hr', labelEn: 'After 1 Hour', labelAr: 'بعد ساعة', subEn: '60 min', subAr: 'ساعة واحدة' },
    { key: 'after2hr', labelEn: 'After 2 Hours', labelAr: 'بعد ساعتين', subEn: '120 min', subAr: 'ساعتان' },
    { key: 'after3hr', labelEn: 'After 3 Hours', labelAr: 'بعد 3 ساعات', subEn: '180 min', subAr: '3 ساعات' },
    { key: 'endSession', labelEn: 'End Session', labelAr: 'نهاية الجلسة', subEn: 'Post-rinseback', subAr: 'ختام الجلسة' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      hideHeader
      noBodyPadding
    >
      {/* Custom Sticky Header */}
      <div className="px-4 py-3.5 sm:p-6 [@media(max-height:520px)]:px-4 [@media(max-height:520px)]:py-2 bg-gradient-to-r from-blue-900 to-[#1e6bb8] text-white flex items-center justify-between gap-3 sm:gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 [@media(max-height:520px)]:w-9 [@media(max-height:520px)]:h-9 rounded-2xl bg-white/15 flex items-center justify-center text-xl sm:text-2xl shadow-inner border border-white/20 shrink-0">
            🩺
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-2xl [@media(max-height:520px)]:text-base font-black tracking-tight">
                {initialSession
                  ? isAr
                    ? 'تعديل جلسة الغسيل الكلوي'
                    : 'Edit Dialysis Session'
                  : tSession('recordSession') || (isAr ? 'تسجيل جلسة الغسيل الكلوي' : 'Record Dialysis Session')}
              </h2>
              <Badge variant="info" size="sm" className="bg-white/20 text-white border-0 font-bold">
                {isAr ? '14 معيار سريري' : '14 Clinical Fields'}
              </Badge>
            </div>
            <p className="text-blue-100 text-xs sm:text-sm mt-0.5 font-medium truncate [@media(max-height:520px)]:hidden">
              {patientName ? (
                <>
                  {isAr ? 'المريض:' : 'Patient:'}{' '}
                  <strong className="text-white underline underline-offset-2">{patientName}</strong>{' '}
                  ({patientId})
                </>
              ) : (
                <>{isAr ? 'تسجيل المؤشرات السريرية لجلسة اليوم' : 'Enter complete hemodialysis telemetry'}</>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close') || (isAr ? 'إغلاق' : 'Close')}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer min-w-[48px] min-h-[48px] flex items-center justify-center shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Form Layout: Scrollable Clinical Body + Sticky Footer */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex-1 min-h-0 flex flex-col overflow-hidden text-slate-800"
      >
        <div
          ref={formBodyRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 sm:space-y-6"
        >
        {errorMsg && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold flex items-center gap-3"
          >
            <span className="text-2xl">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* SECTION 1: SESSION DATE, DURATION & COMPLIANCE RATING (FIELD 1 & 9) */}
        {/* ============================================================== */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900 border-b border-slate-200/60 pb-2">
            <span>📅</span>
            <span>{isAr ? 'بيانات الجلسة العامة والالتزام' : 'General Session & Compliance'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Session Date */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                {tSession('sessionDate') || (isAr ? 'تاريخ الجلسة' : 'Session Date')}
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                required
                className="w-full min-h-[48px] px-3.5 py-2.5 text-sm font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              />
            </div>

            {/* Field 9: Session Duration Hours (1 / 2 / 3 / 4) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                ⏱️ {tSession('durationHours') || (isAr ? 'مدة الجلسة (ساعات)' : 'Treatment Duration')}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([1, 2, 3, 4] as SessionDurationHours[]).map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setDurationHours(hrs)}
                    aria-label={`${hrs} ${isAr ? 'ساعات' : 'Hours'}`}
                    className={`
                      min-h-[48px] rounded-xl font-black text-sm flex flex-col items-center justify-center transition-all cursor-pointer border
                      ${
                        durationHours === hrs
                          ? 'bg-[#1e6bb8] text-white border-[#1e6bb8] shadow-sm ring-2 ring-blue-300'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }
                    `}
                  >
                    <span>{hrs}</span>
                    <span className="text-[10px] font-semibold">{isAr ? 'ساعات' : 'hrs'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 1: Compliance Rating (1 to 5 scale) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                ⭐ {tSession('complianceRating') || (isAr ? 'مقياس الالتزام الطبي (1-5)' : 'Medical Compliance Rating')}
              </label>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setComplianceRating(star)}
                    aria-label={`${star} ${isAr ? 'من 5 نجوم' : 'out of 5 stars'}`}
                    title={`${star}/5`}
                    className={`
                      flex-1 min-h-[48px] rounded-xl font-black text-base flex items-center justify-center transition-all cursor-pointer border
                      ${
                        complianceRating >= star
                          ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                          : 'bg-white text-slate-400 border-slate-300 hover:bg-amber-50'
                      }
                    `}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-semibold text-end">
                {isAr
                  ? `${complianceRating} من 5 (${complianceRating === 5 ? 'التزام تام' : complianceRating >= 3 ? 'متوسط' : 'منخفض'})`
                  : `Score: ${complianceRating}/5 (${complianceRating === 5 ? 'Highest' : complianceRating >= 3 ? 'Moderate' : 'Low'})`}
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: PRE & POST WEIGHT (FIELDS 2 & 3) */}
        {/* ============================================================== */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span>⚖️</span>
              <span>{isAr ? 'أوزان المريض قبل وبعد الجلسة' : 'Pre & Post Dialysis Weights'}</span>
            </div>
            {/* Weight difference calculation */}
            {(() => {
              const pre = (parseFloat(preWeightKg) || 0) + (parseInt(preWeightGrams, 10) || 0) / 1000;
              const post = (parseFloat(postWeightKg) || 0) + (parseInt(postWeightGrams, 10) || 0) / 1000;
              const loss = pre - post;
              return loss > 0 ? (
                <Badge variant="success" size="sm" className="font-mono font-bold">
                  {isAr ? `الفقد الصافي: ${loss.toFixed(2)} كجم` : `Weight Loss: ${loss.toFixed(2)} kg`}
                </Badge>
              ) : null;
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field 2: Pre-dialysis weight */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                {tSession('preWeight') || (isAr ? 'الوزن قبل الجلسة' : 'Pre-Dialysis Weight')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isAr ? 'كيلوجرام (كجم)' : 'Kilograms (kg)'}
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={preWeightKg}
                    onChange={(e) => setPreWeightKg(e.target.value)}
                    required
                    placeholder="70"
                    aria-label={isAr ? 'الوزن قبل الجلسة بالكيلوجرام' : 'Pre-dialysis weight in kilograms'}
                    className="w-full min-h-[48px] px-3 text-base font-bold font-mono rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isAr ? 'جرام (جم)' : 'Grams (g)'}
                  </span>
                  <input
                    type="number"
                    step="50"
                    min="0"
                    max="950"
                    value={preWeightGrams}
                    onChange={(e) => setPreWeightGrams(e.target.value)}
                    placeholder="0"
                    aria-label={isAr ? 'الوزن قبل الجلسة بالجرام' : 'Pre-dialysis weight in grams'}
                    className="w-full min-h-[48px] px-3 text-base font-bold font-mono rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                  />
                </div>
              </div>
            </div>

            {/* Field 3: Post-dialysis weight */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                {tSession('postWeight') || (isAr ? 'الوزن بعد الجلسة' : 'Post-Dialysis Weight')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isAr ? 'كيلوجرام (كجم)' : 'Kilograms (kg)'}
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={postWeightKg}
                    onChange={(e) => setPostWeightKg(e.target.value)}
                    required
                    placeholder="68"
                    aria-label={isAr ? 'الوزن بعد الجلسة بالكيلوجرام' : 'Post-dialysis weight in kilograms'}
                    className="w-full min-h-[48px] px-3 text-base font-bold font-mono rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isAr ? 'جرام (جم)' : 'Grams (g)'}
                  </span>
                  <input
                    type="number"
                    step="50"
                    min="0"
                    max="950"
                    value={postWeightGrams}
                    onChange={(e) => setPostWeightGrams(e.target.value)}
                    placeholder="0"
                    aria-label={isAr ? 'الوزن بعد الجلسة بالجرام' : 'Post-dialysis weight in grams'}
                    className="w-full min-h-[48px] px-3 text-base font-bold font-mono rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 3: BLOOD PRESSURE & HEART RATE AT 5 TIMEPOINTS (FIELDS 4 & 5) */}
        {/* ============================================================== */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span>🩺</span>
              <span>
                {tSession('bloodPressureAndPulse') ||
                  (isAr ? 'ضغط الدم والنبض عبر 5 نقاط زمنية' : 'Blood Pressure & Heart Rate at 5 Timepoints')}
              </span>
            </div>
            <Badge variant="info" size="sm" className="font-bold">
              {isAr ? '5 قياسات دورية' : '5 Timepoints'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {timepointDefs.map((tp) => {
              const cur = vitals[tp.key] || DEFAULT_TIMEPOINT;
              return (
                <div key={tp.key} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="border-b border-slate-100 pb-1.5">
                    <p className="text-xs font-extrabold text-slate-900">
                      {isAr ? tp.labelAr : tp.labelEn}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {isAr ? tp.subAr : tp.subEn}
                    </p>
                  </div>

                  {/* Systolic */}
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">
                      {isAr ? 'الانقباضي (ملم زئبق)' : 'Systolic (mmHg)'}
                    </span>
                    <input
                      type="number"
                      min="50"
                      max="260"
                      value={cur.systolic}
                      onChange={(e) => handleVitalsChange(tp.key, 'systolic', e.target.value)}
                      required
                      className="w-full min-h-[48px] px-2 text-center text-sm font-mono font-black rounded-lg border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                      aria-label={isAr ? `${tp.labelAr} - الضغط الانقباضي` : `${tp.labelEn} systolic blood pressure`}
                    />
                  </div>

                  {/* Diastolic */}
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">
                      {isAr ? 'الانبساطي (ملم زئبق)' : 'Diastolic (mmHg)'}
                    </span>
                    <input
                      type="number"
                      min="30"
                      max="160"
                      value={cur.diastolic}
                      onChange={(e) => handleVitalsChange(tp.key, 'diastolic', e.target.value)}
                      required
                      className="w-full min-h-[48px] px-2 text-center text-sm font-mono font-black rounded-lg border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                      aria-label={isAr ? `${tp.labelAr} - الضغط الانبساطي` : `${tp.labelEn} diastolic blood pressure`}
                    />
                  </div>

                  {/* Heart Rate */}
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">
                      ❤️ {isAr ? 'النبض (نبضة/د)' : 'Heart Rate (bpm)'}
                    </span>
                    <input
                      type="number"
                      min="30"
                      max="220"
                      value={cur.heartRate}
                      onChange={(e) => handleVitalsChange(tp.key, 'heartRate', e.target.value)}
                      required
                      className="w-full min-h-[48px] px-2 text-center text-sm font-mono font-black rounded-lg border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                      aria-label={isAr ? `${tp.labelAr} - نبض القلب` : `${tp.labelEn} heart rate in bpm`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 4: TEMPERATURE & FLUID STATUS ASSESSMENT (FIELDS 6 & 7) */}
        {/* ============================================================== */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900 border-b border-slate-200/60 pb-2">
            <span>🌡️</span>
            <span>{isAr ? 'درجة الحرارة وتقييم احتباس السوائل' : 'Temperature & Fluid Assessment'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Field 6: Temperature (°C) */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                🌡️ {tSession('temperature') || (isAr ? 'درجة الحرارة (°م)' : 'Body Temp (°C)')}
              </label>
              <input
                type="number"
                step="0.1"
                min="34"
                max="43"
                value={temperatureC}
                onChange={(e) => setTemperatureC(e.target.value)}
                required
                placeholder="36.6"
                aria-label={isAr ? 'درجة حرارة الجسم بالدرجة المئوية' : 'Body temperature in Celsius'}
                className="w-full min-h-[48px] px-3.5 text-base font-mono font-black rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              />
              <span className="block text-[11px] text-slate-400 mt-1 font-semibold">
                {isAr ? 'المعدل الطبيعي: 36.5 - 37.2 °م' : 'Norm: 36.5 - 37.2 °C'}
              </span>
            </div>

            {/* Field 7a: Leg Edema */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                🦵 {tSession('legEdema') || (isAr ? 'تورم الساقين' : 'Leg Edema')}
              </label>
              <select
                value={legEdema}
                onChange={(e) => setLegEdema(e.target.value as LegEdemaLevel)}
                aria-label={isAr ? 'درجة تورم الساقين' : 'Leg edema severity'}
                className="w-full min-h-[48px] px-3 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              >
                <option value="none">{isAr ? 'بدون تورم' : 'None'}</option>
                <option value="mild">{isAr ? 'بسيط (+1)' : 'Mild (+1)'}</option>
                <option value="moderate">{isAr ? 'متوسط (+2)' : 'Moderate (+2)'}</option>
                <option value="severe">{isAr ? 'شديد (+3/+4)' : 'Severe (+3/+4)'}</option>
              </select>
            </div>

            {/* Field 7b: Lung Crackles */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                🫁 {tSession('lungCrackles') || (isAr ? 'أصوات الرئة (الخشخشة)' : 'Lung Crackles')}
              </label>
              <select
                value={lungCrackles}
                onChange={(e) => setLungCrackles(e.target.value as LungCracklesLevel)}
                aria-label={isAr ? 'شدة أصوات الرئة' : 'Lung crackles severity'}
                className="w-full min-h-[48px] px-3 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              >
                <option value="none">{isAr ? 'بدون أصوات (رئة صافية)' : 'None (Clear lungs)'}</option>
                <option value="lower_bases">{isAr ? 'أسفل الرئتين' : 'Lower Lung Bases'}</option>
                <option value="mid_lung">{isAr ? 'منتصف الرئتين' : 'Mid-Lung Fields'}</option>
                <option value="all_areas">{isAr ? 'جميع أجزاء الصدر' : 'All Chest Areas (Diffuse)'}</option>
              </select>
            </div>

            {/* Field 7c: Dyspnea */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                😮‍💨 {tSession('dyspnea') || (isAr ? 'ضيق التنفس' : 'Dyspnea')}
              </label>
              <select
                value={dyspnea}
                onChange={(e) => setDyspnea(e.target.value as DyspneaLevel)}
                aria-label={isAr ? 'درجة ضيق التنفس' : 'Dyspnea level'}
                className="w-full min-h-[48px] px-3 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              >
                <option value="none">{isAr ? 'بدون ضيق تنفس' : 'None (Comfortable)'}</option>
                <option value="mild">{isAr ? 'بسيط عند المجهود' : 'Mild on exertion'}</option>
                <option value="moderate">{isAr ? 'متوسط مع الحركة' : 'Moderate with activity'}</option>
                <option value="severe">{isAr ? 'شديد أثناء الراحة' : 'Severe at rest'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 5: MACHINE & ACCESS PARAMETERS (FIELDS 8, 10, 11, 12, 13, 14) */}
        {/* ============================================================== */}
        <div className="bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900 border-b border-slate-200/60 pb-2">
            <span>⚙️</span>
            <span>{isAr ? 'بيانات ماكينة الغسيل ومدخل الأوعية' : 'Dialysis Machine & Vascular Access'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Field 13: Access Type */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                💉 {tSession('accessType') || (isAr ? 'نوع المدخل الوعائي' : 'Access Type')}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['AVF', 'AVG', 'Permcath', 'Mahurkar'] as DialysisAccessType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccessType(type)}
                    className={`
                      min-h-[48px] rounded-xl font-black text-xs transition-all cursor-pointer border
                      ${
                        accessType === type
                          ? 'bg-[#1e6bb8] text-white border-[#1e6bb8] shadow-xs ring-2 ring-blue-300'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }
                    `}
                    aria-label={isAr ? `نوع المدخل الوعائي ${type}` : `Access type ${type}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 8: Vascular Access Signs of Infection */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                🔍 {tSession('accessInfectionSigns') || (isAr ? 'علامات التهاب الوصلة' : 'Access Site Infection')}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAccessInfectionSigns(false)}
                  className={`
                    min-h-[48px] rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border
                    ${
                      !accessInfectionSigns
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }
                  `}
                  aria-label={isAr ? 'لا توجد علامات التهاب' : 'No infection signs'}
                >
                  <span>✓</span>
                  <span>{isAr ? 'سليمة (لا يوجد)' : 'No (Clean)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAccessInfectionSigns(true)}
                  className={`
                    min-h-[48px] rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border
                    ${
                      accessInfectionSigns
                        ? 'bg-red-600 text-white border-red-700 shadow-xs ring-2 ring-red-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-red-50'
                    }
                  `}
                  aria-label={isAr ? 'يوجد علامات التهاب' : 'Yes infection signs present'}
                >
                  <span>⚠️</span>
                  <span>{isAr ? 'يوجد التهاب!' : 'Yes (Infection)'}</span>
                </button>
              </div>
            </div>

            {/* Field 10: Ultrafiltration Volume (mL) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                💧 {tSession('ultrafiltrationVolume') || (isAr ? 'حجم السحب الفائق UF (مل)' : 'UF Volume (mL)')}
              </label>
              <input
                type="number"
                step="50"
                min="0"
                max="6000"
                value={ultrafiltrationVolumeMl}
                onChange={(e) => setUltrafiltrationVolumeMl(e.target.value)}
                required
                placeholder="2000"
                aria-label={isAr ? 'حجم السحب الفائق بالملليلتر' : 'Ultrafiltration volume in milliliters'}
                className="w-full min-h-[48px] px-3.5 text-base font-mono font-black rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              />
            </div>

            {/* Field 11: Blood Flow Rate (mL/min) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                🩸 {tSession('bloodFlowRate') || (isAr ? 'معدل تدفق الدم (مل/دقيقة)' : 'Blood Flow Rate (mL/min)')}
              </label>
              <input
                type="number"
                step="10"
                min="100"
                max="600"
                value={bloodFlowRateMlMin}
                onChange={(e) => setBloodFlowRateMlMin(e.target.value)}
                required
                placeholder="350"
                aria-label={isAr ? 'معدل تدفق الدم بالملليلتر في الدقيقة' : 'Blood flow rate in milliliters per minute'}
                className="w-full min-h-[48px] px-3.5 text-base font-mono font-black rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              />
            </div>

            {/* Field 12: Dialysate Flow Rate (300 / 500 / 700 / 800 mL/min) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                🔄 {tSession('dialysateFlowRate') || (isAr ? 'تدفق سائل الغسيل (مل/د)' : 'Dialysate Flow (mL/min)')}
              </label>
              <div className="grid grid-cols-4 gap-1">
                {([300, 500, 700, 800] as DialysateFlowRate[]).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setDialysateFlowRateMlMin(rate)}
                    className={`
                      min-h-[48px] rounded-xl font-mono font-black text-xs transition-all cursor-pointer border
                      ${
                        dialysateFlowRateMlMin === rate
                          ? 'bg-[#1e6bb8] text-white border-[#1e6bb8] shadow-xs ring-2 ring-blue-300'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }
                    `}
                    aria-label={isAr ? `معدل تدفق سائل الغسيل ${rate} مل في الدقيقة` : `Dialysate flow ${rate} mL per min`}
                  >
                    {rate}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 14: Machine Sodium (mEq/L) */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                🧂 {tSession('machineSodium') || (isAr ? 'صوديوم الماكينة (مل مكافئ/لتر)' : 'Machine Sodium (mEq/L)')}
              </label>
              <input
                type="number"
                step="1"
                min="120"
                max="160"
                value={machineSodiumMeqL}
                onChange={(e) => setMachineSodiumMeqL(e.target.value)}
                required
                placeholder="138"
                aria-label={isAr ? 'تركيز صوديوم جهاز الغسيل' : 'Dialysis machine sodium concentration in milliequivalents per liter'}
                className="w-full min-h-[48px] px-3.5 text-base font-mono font-black rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              />
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 6: CLINICAL NOTES */}
        {/* ============================================================== */}
        <div className="space-y-1.5">
          <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
            📝 {tSession('clinicalNotes') || (isAr ? 'ملاحظات الجلسة السريرية' : 'Clinical Notes & Patient Tolerance')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={
              tSession('clinicalNotesPlaceholder') ||
              (isAr
                ? 'سجل استجابة المريض للجلسة، حدوث تقلصات أو هبوط ضغط، والتدخلات التمريضية...'
                : 'Record patient tolerance, cramps, intradialytic hypotension, or interventions...')
            }
            className="w-full p-3.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
          />
        </div>
        </div>

        {/* Modal Sticky Footer Actions */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 [@media(max-height:520px)]:py-2 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            className="min-h-[48px] px-3.5 sm:px-5 text-sm sm:text-base font-bold"
          >
            {tCommon('cancel') || (isAr ? 'إلغاء' : 'Cancel')}
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="min-h-[48px] font-black px-4 sm:px-6 text-sm sm:text-base shadow-md"
            data-testid="save-dialysis-session-btn"
          >
            💾 {tSession('saveSession') || (isAr ? 'حفظ بيانات الجلسة' : 'Save Dialysis Session')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default DialysisSessionModal;
