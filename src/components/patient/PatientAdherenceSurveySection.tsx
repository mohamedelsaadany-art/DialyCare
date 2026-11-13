'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
  getPatientSurveyStatus,
  getAdherenceSurveys,
  STORAGE_KEYS,
} from '@/lib/data-store';
import type { PatientSurveyStatus, AdherenceSurveySubmission } from '@/lib/types';
import { AdherenceSurveyModal } from './AdherenceSurveyModal';

export interface PatientAdherenceSurveySectionProps {
  patientId: string;
  autoOpenOnFirstLogin?: boolean;
}

export function PatientAdherenceSurveySection({
  patientId,
  autoOpenOnFirstLogin = true,
}: PatientAdherenceSurveySectionProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [status, setStatus] = useState<PatientSurveyStatus | null>(null);
  const [submissions, setSubmissions] = useState<AdherenceSurveySubmission[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!patientId) return;
    const currentStatus = getPatientSurveyStatus(patientId);
    const allSubs = getAdherenceSurveys(patientId);
    setStatus(currentStatus);
    setSubmissions(allSubs);
  }, [patientId]);

  // Auto-open questionnaire pop-up when patient first logs in (baseline initial survey)
  useEffect(() => {
    if (!autoOpenOnFirstLogin || !status) return;
    if (status.isDue && status.reason === 'initial') {
      const seenKey = `WASLITY_INITIAL_SURVEY_POPUP_${patientId}`;
      if (typeof window !== 'undefined' && !window.sessionStorage.getItem(seenKey)) {
        const timer = setTimeout(() => {
          setIsModalOpen(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [status, autoOpenOnFirstLogin, patientId]);

  const handleModalClose = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`WASLITY_INITIAL_SURVEY_POPUP_${patientId}`, 'true');
    }
    setIsModalOpen(false);
  };

  const handleModalSubmitted = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`WASLITY_INITIAL_SURVEY_POPUP_${patientId}`, 'true');
    }
    loadData();
  };

  useEffect(() => {
    const initTimer = setTimeout(() => {
      loadData();
    }, 0);

    const handleUpdate = () => {
      loadData();
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === STORAGE_KEYS.ADHERENCE_SURVEYS ||
        (e.key && e.key.startsWith('DIALYCARE_SURVEY_ACTIVATION_'))
      ) {
        loadData();
      }
    };

    window.addEventListener('dialycare_questionnaires_updated', handleUpdate);
    window.addEventListener('dialycare_survey_updated', handleUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('dialycare_questionnaires_updated', handleUpdate);
      window.removeEventListener('dialycare_survey_updated', handleUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadData]);

  if (!status) return null;

  const latestSubmission = submissions[0] || null;

  return (
    <div data-testid="patient-adherence-survey-section" className="space-y-4">
      {/* 1. Due Alert Banner (High-visibility when survey is due) */}
      {status.isDue ? (
        <div
          data-testid="patient-survey-due-banner"
          className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/70 p-5 sm:p-6 shadow-sm relative overflow-hidden animate-in fade-in duration-200"
        >
          <div className="absolute top-0 end-0 w-32 h-32 bg-amber-200/30 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  📋
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-200/70 px-2.5 py-0.5 rounded-full">
                  {status.reason === 'doctor_activated'
                    ? isAr
                      ? 'مطلوب بواسطة الطبيب المعالج'
                      : 'Requested by Care Team'
                    : status.reason === 'initial'
                    ? isAr
                      ? 'مطلوب في بداية الاستخدام'
                      : 'Baseline Initial Requirement'
                    : isAr
                    ? 'الموعد الدوري الشهري مستحق'
                    : 'Monthly Due'}
                </span>
                <Badge variant="warning" size="sm" className="font-bold">
                  {isAr ? status.cycleLabelAr : status.cycleLabelEn}
                </Badge>
              </div>

              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                {isAr
                  ? 'مطلوب ملء استبيان الالتزام بالعلاج'
                  : 'Treatment Adherence Survey Due'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-700 max-w-xl leading-relaxed">
                {isAr
                  ? 'يساعد هذا الاستبيان فريقك الطبي في تقييم مدى التزامك بجلسات الغسيل، وأدويتك، وحميتك، وسوائلك لتحسين جودة الرعاية الطبية المقدمة لك.'
                  : 'This survey helps your clinical team evaluate adherence across dialysis sessions, medications, renal diet, and fluid limits.'}
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              data-testid="patient-survey-start-btn"
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 min-h-[48px] px-6 font-black shadow-md bg-gradient-to-r from-[#1e6bb8] to-[#0284c7] hover:from-[#1b5e9f] hover:to-[#0275b1] text-white flex items-center justify-center gap-2"
            >
              <span>{isAr ? 'بدء ملء الاستبيان الآن' : 'Start Survey Now'}</span>
              <span className="text-base rtl:rotate-180">➔</span>
            </Button>
          </div>
        </div>
      ) : (
        /* 2. Completed Status Card (When survey is up-to-date) */
        <Card
          data-testid="patient-survey-completed-status"
          className="p-5 sm:p-6 border-slate-200 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-2xl shrink-0 shadow-xs">
                ✓
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    {isAr
                      ? 'تم إكمال استبيان الالتزام بالعلاج بنجاح'
                      : 'Adherence Survey Up-To-Date'}
                  </h3>
                  <Badge variant="success" size="sm">
                    {isAr ? status.cycleLabelAr : status.cycleLabelEn}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? `الاستبيان الدوري القادم مستحق بعد ${status.daysUntilDue} يوماً (${new Date(
                        status.nextDueDate
                      ).toLocaleDateString(locale)})`
                    : `Next scheduled survey due in ${status.daysUntilDue} days (${new Date(
                        status.nextDueDate
                      ).toLocaleDateString(locale)})`}
                </p>
              </div>
            </div>

            {latestSubmission && (
              <div className="flex items-center gap-3 self-end sm:self-center">
                <div className="text-end">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    {isAr ? 'آخر معدل التزام:' : 'Latest Score:'}
                  </span>
                  <span className="text-2xl font-black text-[#1e6bb8]">
                    {latestSubmission.overallScorePercent}%
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsModalOpen(true)}
                  className="min-h-[48px] font-bold text-xs"
                >
                  {isAr ? 'إعادة الإرسال 📋' : 'Retake Survey 📋'}
                </Button>
              </div>
            )}
          </div>

          {/* Latest Scores Quick Bar */}
          {latestSubmission && (
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  🩺 {isAr ? 'جلسات الغسيل' : 'Sessions'}
                </span>
                <span className="text-base font-black text-slate-800">
                  {latestSubmission.sectionScores.dialysisPercent}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  💊 {isAr ? 'الأدوية' : 'Medications'}
                </span>
                <span className="text-base font-black text-slate-800">
                  {latestSubmission.sectionScores.medicationsPercent}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  🥗 {isAr ? 'النظام الغذائي' : 'Diet'}
                </span>
                <span className="text-base font-black text-slate-800">
                  {latestSubmission.sectionScores.dietPercent}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  💧 {isAr ? 'السوائل' : 'Fluids'}
                </span>
                <span className="text-base font-black text-slate-800">
                  {latestSubmission.sectionScores.fluidsPercent}%
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 3. Submissions History Accordion */}
      {submissions.length > 0 && (
        <Card className="p-4 sm:p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📜</span>
              <h4 className="font-bold text-sm text-slate-900">
                {isAr ? 'سجل استبيانات الالتزام السابقة' : 'Past Adherence Survey Submissions'}
              </h4>
              <Badge variant="neutral" size="sm">
                {submissions.length}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="text-xs font-bold text-[#1e6bb8] hover:underline cursor-pointer min-h-[48px] px-2 flex items-center"
            >
              {isHistoryExpanded
                ? isAr
                  ? 'إخفاء السجل ▲'
                  : 'Hide History ▲'
                : isAr
                ? 'عرض السجل ▼'
                : 'Show History ▼'}
            </button>
          </div>

          {isHistoryExpanded && (
            <div data-testid="patient-survey-history" className="mt-4 pt-3 border-t border-slate-100 space-y-3">
              {submissions.map((sub) => {
                const isSelected = expandedSubmissionId === sub.id;
                return (
                  <div
                    key={sub.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">
                            {isAr ? sub.cycleLabelAr : sub.cycleLabelEn}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(sub.submittedAt).toLocaleDateString(locale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        {sub.notes && (
                          <p className="text-xs text-slate-600 italic">
                            &quot;{sub.notes}&quot;
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-[#1e6bb8]">
                          {sub.overallScorePercent}%
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedSubmissionId(isSelected ? null : sub.id)
                          }
                          className="text-xs font-bold min-h-[48px] px-3"
                        >
                          {isSelected ? (isAr ? 'إخفاء التفاصيل' : 'Hide') : (isAr ? 'تفاصيل الإجابات' : 'Details')}
                        </Button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 animate-in fade-in duration-150">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 rounded bg-white border border-slate-200">
                            <span className="text-slate-500 block">🩺 حضور الجلسات:</span>
                            <span className="font-bold text-slate-800">
                              {sub.sectionScores.dialysisPercent}%
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white border border-slate-200">
                            <span className="text-slate-500 block">💊 الأدوية:</span>
                            <span className="font-bold text-slate-800">
                              {sub.sectionScores.medicationsPercent}%
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white border border-slate-200">
                            <span className="text-slate-500 block">🥗 الطعام:</span>
                            <span className="font-bold text-slate-800">
                              {sub.sectionScores.dietPercent}%
                            </span>
                          </div>
                          <div className="p-2 rounded bg-white border border-slate-200">
                            <span className="text-slate-500 block">💧 السوائل:</span>
                            <span className="font-bold text-slate-800">
                              {sub.sectionScores.fluidsPercent}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      <AdherenceSurveyModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        patientId={patientId}
        cycleNumber={status.currentCycleNumber}
        onSubmitted={handleModalSubmitted}
      />
    </div>
  );
}

export default PatientAdherenceSurveySection;
