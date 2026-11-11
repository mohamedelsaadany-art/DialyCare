'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { DialysisSession } from '@/lib/types';
import { getDialysisSessions, deleteDialysisSession } from '@/lib/data-store';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DialysisSessionModal } from '@/components/DialysisSessionModal';

export interface DialysisSessionHistoryProps {
  patientId?: string;
  patientName?: string;
  canRecord?: boolean;
  canManage?: boolean;
  className?: string;
  onRecordClick?: () => void;
}

function localizeLegEdema(level: string | undefined, isAr: boolean): string {
  switch (level) {
    case 'mild':
      return isAr ? 'بسيط (+1)' : 'Mild (+1)';
    case 'moderate':
      return isAr ? 'متوسط (+2)' : 'Moderate (+2)';
    case 'severe':
      return isAr ? 'شديد (+3/+4)' : 'Severe (+3/+4)';
    case 'none':
    default:
      return isAr ? 'لا يوجد' : 'None';
  }
}

function localizeLungCrackles(level: string | undefined, isAr: boolean): string {
  switch (level) {
    case 'lower_bases':
      return isAr ? 'أسفل الرئتين' : 'Lower Bases';
    case 'mid_lung':
      return isAr ? 'منتصف الرئتين' : 'Mid-Lung Fields';
    case 'all_areas':
      return isAr ? 'جميع أجزاء الصدر' : 'All Chest Areas';
    case 'none':
    default:
      return isAr ? 'صافية (لا يوجد)' : 'Clear (None)';
  }
}

function localizeDyspnea(level: string | undefined, isAr: boolean): string {
  switch (level) {
    case 'mild':
      return isAr ? 'بسيط عند المجهود' : 'Mild on exertion';
    case 'moderate':
      return isAr ? 'متوسط مع الحركة' : 'Moderate with activity';
    case 'severe':
      return isAr ? 'شديد أثناء الراحة' : 'Severe at rest';
    case 'none':
    default:
      return isAr ? 'لا يوجد' : 'None';
  }
}

export function DialysisSessionHistory({
  patientId,
  patientName,
  canRecord = true,
  canManage = true,
  className = '',
  onRecordClick,
}: DialysisSessionHistoryProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tSession = useTranslations('dialysisSession');

  const [sessions, setSessions] = useState<DialysisSession[]>([]);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<DialysisSession | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(() => {
    const list = getDialysisSessions(patientId);
    setSessions(list);
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const handleUpdate = () => {
      loadSessions();
    };
    window.addEventListener('dialycare_sessions_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('dialycare_sessions_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [loadSessions]);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(isAr ? 'هل أنت متأكد من حذف جلسة الغسيل هذه؟' : 'Are you sure you want to delete this dialysis session?')) {
      deleteDialysisSession(id);
      loadSessions();
      showToast(isAr ? 'تم حذف الجلسة بنجاح' : 'Session deleted successfully');
    }
  };

  const handleOpenRecord = () => {
    if (onRecordClick) {
      onRecordClick();
    } else {
      setSelectedSessionForModal(null);
      setIsRecordModalOpen(true);
    }
  };

  const handleEditSession = (session: DialysisSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSessionForModal(session);
    setIsRecordModalOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedSessionId((prev) => (prev === id ? null : id));
  };

  const formatWeight = (kg: number, grams?: number) => {
    const total = kg + (grams || 0) / 1000;
    return `${total.toFixed(2)} ${isAr ? 'كجم' : 'kg'}`;
  };

  return (
    <Card className={`p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-xs ${className}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm shadow-md flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center p-2 hover:bg-emerald-700 rounded-xl text-white cursor-pointer shrink-0"
            aria-label={isAr ? 'إغلاق الإشعار' : 'Dismiss notification'}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center text-2xl shrink-0 shadow-inner">
            🩺
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {tSession('sessionHistory') || (isAr ? 'سجل جلسات الغسيل السابقة' : 'Dialysis Treatment History')}
              </h2>
              <Badge variant="info" size="sm" className="font-mono font-bold">
                {sessions.length} {isAr ? 'جلسات' : 'Sessions'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr
                ? 'سجل سريري شامل لجميع جلسات الغسيل مع المؤشرات الحيوية والمواصفات السريرية الـ 14'
                : 'Complete audit trail of all 14 clinical hemodialysis telemetry parameters'}
            </p>
          </div>
        </div>

        {canRecord === true && (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleOpenRecord}
            className="min-h-[48px] font-black px-4 shadow-sm shrink-0"
            data-testid="record-dialysis-session-open-btn"
          >
            ➕ {tSession('recordSession') || (isAr ? 'تسجيل جلسة غسيل جديدة' : 'Record Dialysis Session')}
          </Button>
        )}
      </div>

      {/* Session List */}
      <div className="mt-4 space-y-3.5">
        {sessions.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6">
            <span className="text-4xl block mb-2" role="img" aria-hidden="true">
              🩺
            </span>
            <p className="text-sm font-bold text-slate-700">
              {tSession('noSessions') ||
                (isAr
                  ? 'لم يتم تسجيل أي جلسات غسيل سابقة لهذا المريض بعد.'
                  : 'No dialysis sessions logged yet for this patient.')}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {canRecord === true
                ? isAr
                  ? 'اضغط على زر "تسجيل جلسة غسيل جديدة" لتدوين بيانات الجلسة والمؤشرات الحيوية الـ 14.'
                  : 'Click "Record Dialysis Session" to log session parameters and vitals.'
                : isAr
                ? 'ستظهر هنا تفاصيل جلسات الغسيل المسجلة في ملفك السريري.'
                : 'Recorded hemodialysis sessions and clinical metrics will appear here.'}
            </p>
            {canRecord === true && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenRecord}
                  className="min-h-[48px] font-bold"
                  data-testid="empty-record-dialysis-session-btn"
                >
                  ➕ {tSession('recordSession') || (isAr ? 'تسجيل جلسة غسيل جديدة' : 'Record Dialysis Session')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          sessions.map((session) => {
            const isExpanded = expandedSessionId === session.id;
            const preTotal = session.preWeightKg + (session.preWeightGrams || 0) / 1000;
            const postTotal = session.postWeightKg + (session.postWeightGrams || 0) / 1000;
            const weightLoss = preTotal - postTotal;

            const preVitals = session.vitals?.preSession;
            const endVitals = session.vitals?.endSession;

            return (
              <div
                key={session.id}
                className="rounded-2xl border border-slate-200 bg-white hover:border-[#1e6bb8]/50 transition-all shadow-xs overflow-hidden"
              >
                {/* Main Session Row Card */}
                <div
                  onClick={() => toggleExpand(session.id)}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={
                    isAr
                      ? `جلسة الغسيل بتاريخ ${session.sessionDate}`
                      : `Dialysis session on ${session.sessionDate}`
                  }
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(session.id);
                    }
                  }}
                >
                  {/* Left: Date, Compliance, Duration, Access */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
                        📅 {session.sessionDate}
                      </span>
                      <Badge
                        variant={session.complianceRating >= 4 ? 'success' : session.complianceRating >= 3 ? 'warning' : 'danger'}
                        size="sm"
                        className="font-bold"
                      >
                        ⭐ {session.complianceRating}/5 {isAr ? 'التزام' : 'Compliance'}
                      </Badge>
                      <Badge variant="neutral" size="sm" className="font-bold">
                        ⏱️ {session.durationHours} {isAr ? 'ساعات' : 'hrs'}
                      </Badge>
                      <Badge variant="info" size="sm" className="font-bold">
                        💉 {session.accessType}
                      </Badge>
                      {session.accessInfectionSigns ? (
                        <Badge variant="danger" size="sm" className="font-bold animate-pulse">
                          ⚠️ {isAr ? 'اشتباه التهاب بالوصلة!' : 'Access Infection Alert!'}
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm" className="font-bold">
                          ✓ {isAr ? 'الوصلة سليمة' : 'Clean Access'}
                        </Badge>
                      )}
                    </div>

                    {/* Vitals Summary: Pre vs End */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-800">{isAr ? 'ضغط الدم (بداية/نهاية):' : 'BP (Pre/End):'}</strong>{' '}
                        <span className="font-mono font-bold text-[#1e6bb8]">
                          {preVitals ? `${preVitals.systolic}/${preVitals.diastolic}` : 'N/A'}
                        </span>
                        {isAr ? ' ← ' : ' → '}
                        <span className="font-mono font-bold text-slate-800">
                          {endVitals ? `${endVitals.systolic}/${endVitals.diastolic}` : 'N/A'}
                        </span>{' '}
                        mmHg
                      </span>

                      <span>
                        <strong className="text-slate-800">{isAr ? 'الحرارة:' : 'Temp:'}</strong>{' '}
                        <span className="font-mono font-bold">{session.temperatureC}°C</span>
                      </span>

                      <span>
                        <strong className="text-slate-800">{isAr ? 'سحب الماء UF:' : 'UF Vol:'}</strong>{' '}
                        <span className="font-mono font-bold text-blue-600">{session.ultrafiltrationVolumeMl} mL</span>
                      </span>
                    </div>
                  </div>

                  {/* Middle: Weights */}
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 shrink-0">
                    <div className="text-center px-2">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">
                        {isAr ? 'قبل الجلسة' : 'Pre-Weight'}
                      </span>
                      <span className="font-mono font-black text-xs text-slate-800">
                        {formatWeight(session.preWeightKg, session.preWeightGrams)}
                      </span>
                    </div>

                    <span className="text-slate-300 font-bold">{isAr ? '←' : '→'}</span>

                    <div className="text-center px-2">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">
                        {isAr ? 'بعد الجلسة' : 'Post-Weight'}
                      </span>
                      <span className="font-mono font-black text-xs text-slate-800">
                        {formatWeight(session.postWeightKg, session.postWeightGrams)}
                      </span>
                    </div>

                    {weightLoss > 0 && (
                      <div className="border-s border-slate-200 ps-2 text-center">
                        <span className="block text-[10px] font-bold text-emerald-600 uppercase">
                          {isAr ? 'صافي الفقد' : 'Loss'}
                        </span>
                        <span className="font-mono font-black text-xs text-emerald-700">
                          -{weightLoss.toFixed(2)} {isAr ? 'كجم' : 'kg'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Expand & Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(session.id);
                      }}
                      className="min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                      aria-expanded={isExpanded}
                      aria-label={isAr ? 'عرض أو إخفاء الـ 14 معياراً السريرياً' : 'Toggle all 14 clinical metrics'}
                    >
                      <span>{isExpanded ? (isAr ? 'إخفاء التفاصيل' : 'Hide Vitals') : (isAr ? 'عرض الـ 14 معيار' : 'All 14 Metrics')}</span>
                      <span>{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {canManage === true && (
                      <button
                        type="button"
                        onClick={(e) => handleEditSession(session, e)}
                        className="min-h-[48px] min-w-[48px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#1e6bb8] bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        title={isAr ? 'تعديل الجلسة' : 'Edit Session'}
                        aria-label={isAr ? 'تعديل الجلسة' : 'Edit session'}
                      >
                        ✏️ {isAr ? 'تعديل' : 'Edit'}
                      </button>
                    )}

                    {canManage === true && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(session.id, e)}
                        className="min-h-[48px] min-w-[48px] px-3 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center cursor-pointer"
                        title={isAr ? 'حذف الجلسة' : 'Delete Session'}
                        aria-label={isAr ? 'حذف الجلسة' : 'Delete session'}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Detailed 14-Field View */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-slate-50/80 border-t border-slate-200/80 space-y-4 animate-in fade-in duration-150">
                    {/* 5-Timepoint Blood Pressure & Heart Rate Table */}
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                        🩺 {isAr ? 'ضغط الدم والنبض على مدار الجلسة (5 نقاط زمنية)' : 'Intradialytic Vitals at 5 Timepoints'}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { key: 'preSession', nameEn: 'Pre-Session (0 hr)', nameAr: 'قبل الجلسة (0 س)' },
                          { key: 'after1hr', nameEn: 'After 1 Hr', nameAr: 'بعد 1 ساعة' },
                          { key: 'after2hr', nameEn: 'After 2 Hr', nameAr: 'بعد 2 ساعة' },
                          { key: 'after3hr', nameEn: 'After 3 Hr', nameAr: 'بعد 3 ساعات' },
                          { key: 'endSession', nameEn: 'End Session', nameAr: 'نهاية الجلسة' },
                        ].map((tp) => {
                          const vp = session.vitals?.[tp.key as keyof typeof session.vitals];
                          return (
                            <div key={tp.key} className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                              <span className="block text-[10px] font-bold text-slate-400">
                                {isAr ? tp.nameAr : tp.nameEn}
                              </span>
                              <span className="block text-sm font-mono font-black text-slate-900 mt-0.5">
                                {vp ? `${vp.systolic}/${vp.diastolic}` : '—'}
                              </span>
                              <span className="block text-[11px] font-mono font-bold text-red-600">
                                ❤️ {vp ? `${vp.heartRate} bpm` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fluid Status & Machine Parameters Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Fluid Status Assessment */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">
                          💧 {isAr ? 'تقييم احتباس السوائل' : 'Fluid Status Assessment'}
                        </span>
                        <div className="text-xs font-semibold text-slate-800 space-y-0.5">
                          <p>
                            <strong>{isAr ? 'تورم الساقين:' : 'Edema:'}</strong>{' '}
                            <span>{localizeLegEdema(session.fluidStatus?.legEdema, isAr)}</span>
                          </p>
                          <p>
                            <strong>{isAr ? 'أصوات الرئة:' : 'Crackles:'}</strong>{' '}
                            <span>{localizeLungCrackles(session.fluidStatus?.lungCrackles, isAr)}</span>
                          </p>
                          <p>
                            <strong>{isAr ? 'ضيق التنفس:' : 'Dyspnea:'}</strong>{' '}
                            <span>{localizeDyspnea(session.fluidStatus?.dyspnea, isAr)}</span>
                          </p>
                        </div>
                      </div>

                      {/* Machine Telemetry */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">
                          ⚙️ {isAr ? 'تدفق الدم والمحلول' : 'Flow Telemetry'}
                        </span>
                        <div className="text-xs font-semibold text-slate-800 space-y-0.5">
                          <p>
                            <strong>{isAr ? 'تدفق الدم:' : 'Blood Flow:'}</strong>{' '}
                            <span className="font-mono text-[#1e6bb8]">{session.bloodFlowRateMlMin} mL/min</span>
                          </p>
                          <p>
                            <strong>{isAr ? 'تدفق سائل الغسيل:' : 'Dialysate:'}</strong>{' '}
                            <span className="font-mono text-slate-800">{session.dialysateFlowRateMlMin} mL/min</span>
                          </p>
                          <p>
                            <strong>{isAr ? 'صوديوم الماكينة:' : 'Sodium:'}</strong>{' '}
                            <span className="font-mono text-slate-800">{session.machineSodiumMeqL} mEq/L</span>
                          </p>
                        </div>
                      </div>

                      {/* Access & Duration */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">
                          💉 {isAr ? 'المدخل الوعائي والمدة' : 'Access & Duration'}
                        </span>
                        <div className="text-xs font-semibold text-slate-800 space-y-0.5">
                          <p>
                            <strong>{isAr ? 'نوع المدخل:' : 'Type:'}</strong> {session.accessType}
                          </p>
                          <p>
                            <strong>{isAr ? 'مدة الجلسة:' : 'Duration:'}</strong> {session.durationHours} {isAr ? 'ساعات' : 'Hours'}
                          </p>
                          <p>
                            <strong>{isAr ? 'علامات التهاب:' : 'Infection:'}</strong>{' '}
                            {session.accessInfectionSigns ? (
                              <span className="text-red-600 font-bold">{isAr ? 'نعم (يوجد)' : 'Yes'}</span>
                            ) : (
                              <span className="text-emerald-600 font-bold">{isAr ? 'لا (سليم)' : 'No (Clean)'}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Weights & UF */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">
                          ⚖️ {isAr ? 'ملخص الأوزان والسحب' : 'Weight & Ultrafiltration'}
                        </span>
                        <div className="text-xs font-semibold text-slate-800 space-y-0.5">
                          <p>
                            <strong>{isAr ? 'الوزن الأولي:' : 'Pre:'}</strong>{' '}
                            {formatWeight(session.preWeightKg, session.preWeightGrams)}
                          </p>
                          <p>
                            <strong>{isAr ? 'الوزن النهائي:' : 'Post:'}</strong>{' '}
                            {formatWeight(session.postWeightKg, session.postWeightGrams)}
                          </p>
                          <p>
                            <strong>{isAr ? 'حجم السحب:' : 'UF Volume:'}</strong>{' '}
                            <span className="font-mono text-blue-600 font-bold">{session.ultrafiltrationVolumeMl} mL</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Clinical Notes */}
                    {session.notes && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
                        <strong className="block text-slate-900 mb-0.5 font-bold">
                          📝 {isAr ? 'ملاحظات الطبيب / التمريض:' : 'Clinical Notes:'}
                        </strong>
                        {session.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Embedded Dialysis Session Modal */}
      <DialysisSessionModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setSelectedSessionForModal(null);
        }}
        patientId={selectedSessionForModal?.patientId || patientId || 'patient-1'}
        patientName={patientName}
        recordedBy={selectedSessionForModal?.recordedBy}
        initialSession={selectedSessionForModal}
        onSessionRecorded={(savedSession) => {
          loadSessions();
          showToast(
            isAr
              ? `تم حفظ بيانات جلسة الغسيل (${savedSession.sessionDate}) بنجاح! ✅`
              : `Dialysis session for ${savedSession.sessionDate} recorded successfully! ✅`
          );
        }}
      />
    </Card>
  );
}

export default DialysisSessionHistory;
