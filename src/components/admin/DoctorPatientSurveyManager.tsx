'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
  getPatientSurveyStatus,
  getAdherenceSurveys,
  setDoctorSurveyActivation,
  sendSurveyReminderNotification,
  STORAGE_KEYS,
} from '@/lib/data-store';
import {
  QUESTIONNAIRE_OPTIONS,
  ADHERENCE_QUESTIONS,
  QUESTIONNAIRE_SECTIONS,
} from '@/lib/questionnaire-data';
import type { PatientSurveyStatus, AdherenceSurveySubmission } from '@/lib/types';

export interface DoctorPatientSurveyManagerProps {
  patientId: string;
  patientName?: string;
  doctorName?: string;
}

export function DoctorPatientSurveyManager({
  patientId,
  patientName,
  doctorName = 'Dr. Nephrologist',
}: DoctorPatientSurveyManagerProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [status, setStatus] = useState<PatientSurveyStatus | null>(null);
  const [submissions, setSubmissions] = useState<AdherenceSurveySubmission[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const loadData = useCallback(() => {
    if (!patientId) return;
    const currentStatus = getPatientSurveyStatus(patientId);
    const allSubs = getAdherenceSurveys(patientId);
    setStatus(currentStatus);
    setSubmissions(allSubs);
  }, [patientId]);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      loadData();
    }, 0);

    const handleUpdate = () => {
      loadData();
    };

    const handleStorage = (e: StorageEvent) => {
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
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('dialycare_questionnaires_updated', handleUpdate);
      window.removeEventListener('dialycare_survey_updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadData]);

  const handleToggleActivation = () => {
    if (!status) return;
    const willActivate = !status.isManuallyActivatedByDoctor;
    setDoctorSurveyActivation(patientId, willActivate);
    loadData();

    showToast(
      willActivate
        ? isAr
          ? 'تم تفعيل استبيان الالتزام الآن للمريض بنجاح ✓'
          : 'Survey manually activated for patient ✓'
        : isAr
        ? 'تم إلغاء تفعيل الاستبيان اليدوي للمريض'
        : 'Manual survey activation cleared'
    );
  };

  const handleSendReminder = () => {
    sendSurveyReminderNotification(patientId, doctorName);
    showToast(
      isAr
        ? `تم إرسال تنبيه بالاستبيان للمريض (${patientName || patientId}) بنجاح 🔔`
        : `Survey reminder sent to patient (${patientName || patientId}) 🔔`
    );
  };

  if (!status) return null;

  return (
    <Card
      data-testid="doctor-survey-manager"
      id="doctor-survey-manager-section"
      className="p-5 sm:p-6 border-slate-200 shadow-sm space-y-6"
      title={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-100 text-[#1e6bb8] flex items-center justify-center text-lg font-bold">
              📋
            </span>
            <div>
              <h3 className="font-black text-lg text-slate-900 leading-snug">
                {isAr
                  ? 'إدارة استبيان الالتزام بالعلاج لمرضى الغسيل'
                  : 'Treatment Adherence Questionnaire Manager'}
              </h3>
              <p className="text-xs text-slate-500 font-normal">
                {isAr
                  ? 'متابعة دورية كل شهر (20 سؤالاً عبر 4 محاور علاجية)'
                  : 'Monthly tracking (20 questions across 4 clinical sections)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span data-testid="doctor-survey-status-badge">
              {status.isDue ? (
                <Badge
                  variant={status.reason === 'doctor_activated' ? 'danger' : 'warning'}
                  size="md"
                  dot
                  className="font-bold text-xs"
                >
                  {status.reason === 'doctor_activated'
                    ? isAr
                      ? 'مفعّل يدوياً بواسطة الطبيب'
                      : 'Doctor Activated'
                    : status.reason === 'initial'
                    ? isAr
                      ? 'مستحق (الاستبيان الأولي)'
                      : 'Initial Baseline Due'
                    : isAr
                    ? 'مستحق (الموعد الشهري)'
                    : 'Monthly Survey Due'}
                </Badge>
              ) : (
                <Badge variant="success" size="md" dot className="font-bold text-xs">
                  {isAr ? 'مكتمل ومحدّث ✓' : 'Completed & Up-To-Date ✓'}
                </Badge>
              )}
            </span>
          </div>
        </div>
      }
    >
      {/* Toast Confirmation */}
      {toastMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick Status Info Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 block">
            {isAr ? 'الدورة الحالية:' : 'Current Cycle:'}
          </span>
          <span className="text-sm font-black text-slate-900 block">
            {isAr ? status.cycleLabelAr : status.cycleLabelEn}
          </span>
          <span className="text-[11px] text-slate-500">
            {isAr
              ? `إجمالي الاستبيانات المكتملة: ${status.totalSubmissions}`
              : `Total submissions: ${status.totalSubmissions}`}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 block">
            {isAr ? 'حالة الاستحقاق:' : 'Due Status:'}
          </span>
          <span className="text-sm font-black text-slate-900 block">
            {status.isDue
              ? isAr
                ? 'مطلوب الملء الآن'
                : 'Pending Completion'
              : isAr
              ? `مكتمل (متبقي ${status.daysUntilDue} يوماً)`
              : `Up-to-date (${status.daysUntilDue} days left)`}
          </span>
          <span className="text-[11px] text-slate-500">
            {status.lastSubmissionDate
              ? `${isAr ? 'آخر إرسال:' : 'Last:'} ${new Date(
                  status.lastSubmissionDate
                ).toLocaleDateString(locale)}`
              : isAr
              ? 'لم يقدم أي استبيان سابق'
              : 'No submissions yet'}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 block">
            {isAr ? 'آخر معدل التزام كلي:' : 'Latest Adherence Score:'}
          </span>
          <span className="text-sm font-black text-[#1e6bb8] block">
            {submissions[0]
              ? `${submissions[0].overallScorePercent}%`
              : isAr
              ? 'قيد الانتظار'
              : 'Pending'}
          </span>
          <span className="text-[11px] text-slate-500">
            {submissions[0]
              ? submissions[0].overallScorePercent >= 80
                ? isAr
                  ? '🌟 التزام ممتاز'
                  : '🌟 Excellent'
                : submissions[0].overallScorePercent >= 60
                ? isAr
                  ? '⚠️ التزام متوسط'
                  : '⚠️ Moderate'
                : isAr
                ? '❗ بحاجة لدعم ومتابعة'
                : '❗ Needs Clinical Review'
              : isAr
              ? 'بانتظار خط الأساس'
              : 'Awaiting baseline'}
          </span>
        </div>
      </div>

      {/* Doctor Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <Button
          type="button"
          variant={status.isManuallyActivatedByDoctor ? 'danger' : 'primary'}
          size="md"
          data-testid="doctor-activate-survey-btn"
          onClick={handleToggleActivation}
          className="min-h-[48px] font-bold text-xs sm:text-sm px-4 flex items-center gap-2"
        >
          <span>{status.isManuallyActivatedByDoctor ? '⏹️' : '⚡'}</span>
          <span>
            {status.isManuallyActivatedByDoctor
              ? isAr
                ? 'إلغاء التفعيل اليدوي للاستبيان'
                : 'Cancel Manual Survey Activation'
              : isAr
              ? 'تفعيل الاستبيان الآن للمريض'
              : 'Activate Survey for Patient Now'}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="md"
          data-testid="doctor-send-reminder-btn"
          onClick={handleSendReminder}
          className="min-h-[48px] font-bold text-xs sm:text-sm px-4 border-blue-300 text-blue-900 bg-blue-50/70 hover:bg-blue-100 flex items-center gap-2"
        >
          <span>🔔</span>
          <span>{isAr ? 'إرسال تنبيه بالاستبيان' : 'Send Survey Reminder'}</span>
        </Button>
      </div>

      {/* Submissions History with 20-Questions Drill-Down */}
      <div className="space-y-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <span>📜</span>
            <span>
              {isAr
                ? 'سجل استبيانات المريض والتحليل الإكلينيكي'
                : 'Patient Survey History & Clinical Breakdown'}
            </span>
          </h4>
          <span className="text-xs text-slate-500 font-semibold">
            {isAr
              ? `${submissions.length} استبيان مسجل`
              : `${submissions.length} recorded`}
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
            <span className="text-2xl">⏳</span>
            <p className="text-sm font-bold text-slate-700">
              {isAr
                ? 'لا توجد استبيانات مسجلة بعد لهذا المريض'
                : 'No survey submissions recorded for this patient yet'}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isAr
                ? 'يمكنك تفعيل الاستبيان يدويًا أو إرسال تنبيه للمريض ليقوم بتعبئته في ملفه الشخصي.'
                : 'You can activate the survey now or send an alert so the patient can complete it in their profile.'}
            </p>
          </div>
        ) : (
          <div data-testid="doctor-survey-submissions" className="space-y-4">
            {submissions.map((sub, idx) => {
              const isExpanded = expandedSubId === sub.id || (idx === 0 && expandedSubId === null);

              return (
                <div
                  key={sub.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs"
                >
                  {/* Submission Summary Header */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-[#1e6bb8]/10 text-[#1e6bb8] font-bold text-xs flex items-center justify-center shrink-0">
                        #{submissions.length - idx}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {isAr ? sub.cycleLabelAr : sub.cycleLabelEn}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({new Date(sub.submittedAt).toLocaleDateString(locale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })})
                          </span>
                        </div>
                        {sub.notes && (
                          <p className="text-xs text-slate-600 italic mt-0.5">
                            {isAr ? 'ملاحظة المريض:' : 'Patient note:'} &quot;{sub.notes}&quot;
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                          {isAr ? 'المعدل العام' : 'Overall'}
                        </span>
                        <span className="text-xl font-black text-[#1e6bb8]">
                          {sub.overallScorePercent}%
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedSubId(isExpanded ? '__none__' : sub.id)}
                        className="min-h-[48px] text-xs font-bold"
                      >
                        {isExpanded
                          ? isAr
                            ? 'إخفاء الأسئلة ▲'
                            : 'Hide Questions ▲'
                          : isAr
                          ? 'عرض 20 سؤالاً ▼'
                          : 'Show 20 Questions ▼'}
                      </Button>
                    </div>
                  </div>

                  {/* 4 Category Score Pills */}
                  <div className="p-3 bg-white grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-b border-slate-100">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600 font-medium">🩺 حضور الجلسات:</span>
                      <span className="font-black text-slate-900">
                        {sub.sectionScores.dialysisPercent}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600 font-medium">💊 الأدوية:</span>
                      <span className="font-black text-slate-900">
                        {sub.sectionScores.medicationsPercent}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600 font-medium">🥗 الطعام والأملاح:</span>
                      <span className="font-black text-slate-900">
                        {sub.sectionScores.dietPercent}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <span className="text-slate-600 font-medium">💧 السوائل والوزن:</span>
                      <span className="font-black text-slate-900">
                        {sub.sectionScores.fluidsPercent}%
                      </span>
                    </div>
                  </div>

                  {/* 20 Questions Answers Drill-down */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 bg-slate-50/50 space-y-5 animate-in fade-in duration-150">
                      <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {isAr
                          ? 'إجابات المريض التفصيلية على الأسئلة الـ 20:'
                          : 'Detailed Answers to all 20 Questions:'}
                      </h5>

                      <div className="space-y-4">
                        {QUESTIONNAIRE_SECTIONS.map((sec) => {
                          const secQuestions = ADHERENCE_QUESTIONS.filter(
                            (q) => q.category === sec.id
                          );

                          return (
                            <div
                              key={sec.id}
                              className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5"
                            >
                              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <span className="font-bold text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
                                  <span>{sec.icon}</span>
                                  <span>{isAr ? sec.titleAr : sec.titleEn}</span>
                                </span>
                              </div>

                              <div className="space-y-2">
                                {secQuestions.map((q) => {
                                  const answerVal = sub.answers[q.id];
                                  const opt = QUESTIONNAIRE_OPTIONS.find(
                                    (o) => o.id === answerVal
                                  );

                                  return (
                                    <div
                                      key={q.id}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-slate-50/80 hover:bg-slate-50 text-xs"
                                    >
                                      <div className="flex items-start gap-2 flex-1">
                                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                          {q.id}
                                        </span>
                                        <div>
                                          <p className="font-semibold text-slate-800">
                                            {isAr ? q.textAr : q.textEn}
                                          </p>
                                          <p className="text-[10px] text-slate-500">
                                            {isAr ? q.textEn : q.textAr}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                                        {opt ? (
                                          <span
                                            className={`px-2.5 py-1 rounded-md font-bold text-xs ${
                                              opt.scoreWeight === 5
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : opt.scoreWeight === 4
                                                ? 'bg-blue-100 text-blue-800'
                                                : opt.scoreWeight === 3
                                                ? 'bg-amber-100 text-amber-800'
                                                : opt.scoreWeight === 2 || opt.scoreWeight === 1
                                                ? 'bg-rose-100 text-rose-800'
                                                : 'bg-slate-200 text-slate-700'
                                            }`}
                                          >
                                            {isAr ? opt.textAr : opt.textEn}
                                            {opt.scoreWeight !== null && (
                                              <span className="ms-1 opacity-70 font-mono">
                                                ({opt.scoreWeight}/5)
                                              </span>
                                            )}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 italic">
                                            {isAr ? 'لم تتم الإجابة' : 'Unanswered'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

export default DoctorPatientSurveyManager;
