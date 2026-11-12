'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  QUESTIONNAIRE_OPTIONS,
  QUESTIONNAIRE_SECTIONS,
  ADHERENCE_QUESTIONS,
  calculateSurveyScore,
  getCycleInfo,
  type QuestionnaireCategory,
} from '@/lib/questionnaire-data';
import { saveAdherenceSurvey } from '@/lib/data-store';
import type { QuestionnaireOptionValue, AdherenceSurveySubmission } from '@/lib/types';

export interface AdherenceSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  cycleNumber?: number;
  onSubmitted?: (submission: AdherenceSurveySubmission) => void;
}

export function AdherenceSurveyModal({
  isOpen,
  onClose,
  patientId,
  cycleNumber = 1,
  onSubmitted,
}: AdherenceSurveyModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [activeCategory, setActiveCategory] = useState<QuestionnaireCategory>('dialysis');
  const [answers, setAnswers] = useState<Record<number, QuestionnaireOptionValue>>({});
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<AdherenceSurveySubmission | null>(null);

  const cycleMeta = useMemo(() => getCycleInfo(cycleNumber), [cycleNumber]);

  // Total answers progress
  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === 20;
  const completionPercent = Math.round((answeredCount / 20) * 100);

  // Section progress map
  const sectionProgress = useMemo(() => {
    const res: Record<QuestionnaireCategory, { answered: number; total: number; isComplete: boolean }> = {
      dialysis: { answered: 0, total: 5, isComplete: false },
      medications: { answered: 0, total: 5, isComplete: false },
      diet: { answered: 0, total: 5, isComplete: false },
      fluids: { answered: 0, total: 5, isComplete: false },
    };

    ADHERENCE_QUESTIONS.forEach((q) => {
      if (answers[q.id] !== undefined) {
        res[q.category].answered += 1;
      }
    });

    Object.keys(res).forEach((key) => {
      const cat = key as QuestionnaireCategory;
      res[cat].isComplete = res[cat].answered === res[cat].total;
    });

    return res;
  }, [answers]);

  const handleSelectOption = (questionId: number, optionId: QuestionnaireOptionValue) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleReset = () => {
    setAnswers({});
    setNotes('');
    setSubmittedResult(null);
    setActiveCategory('dialysis');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = () => {
    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const scoreResult = calculateSurveyScore(answers);

      const submission = saveAdherenceSurvey({
        patientId,
        cycleNumber: cycleMeta.cycleNumber,
        cycleLabelAr: cycleMeta.cycleLabelAr,
        cycleLabelEn: cycleMeta.cycleLabelEn,
        answers,
        overallScorePercent: scoreResult.overallScorePercent,
        sectionScores: scoreResult.sectionScores,
        notes: notes.trim() || undefined,
      });

      setSubmittedResult(submission);
      if (onSubmitted) {
        onSubmitted(submission);
      }
    } catch (err) {
      console.error('Error submitting adherence survey:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find questions belonging to active category
  const activeQuestions = useMemo(() => {
    return ADHERENCE_QUESTIONS.filter((q) => q.category === activeCategory);
  }, [activeCategory]);

  const categoryIndex = QUESTIONNAIRE_SECTIONS.findIndex((s) => s.id === activeCategory);

  const handleNextCategory = () => {
    if (categoryIndex < QUESTIONNAIRE_SECTIONS.length - 1) {
      setActiveCategory(QUESTIONNAIRE_SECTIONS[categoryIndex + 1].id);
    }
  };

  const handlePrevCategory = () => {
    if (categoryIndex > 0) {
      setActiveCategory(QUESTIONNAIRE_SECTIONS[categoryIndex - 1].id);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="3xl"
      noBodyPadding
      className="p-0 overflow-hidden"
    >
      <div
        data-testid="adherence-survey-modal"
        className="flex flex-col max-h-[88vh] text-slate-900 bg-white"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1e6bb8] to-[#0284c7] text-white p-4 sm:p-5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 mb-1">
                <span className="text-xl">📋</span>
                <Badge variant="info" size="sm" className="bg-white/20 text-white border-white/30">
                  {isAr ? cycleMeta.cycleLabelAr : cycleMeta.cycleLabelEn}
                </Badge>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                {isAr
                  ? 'استبيان الالتزام بالعلاج لمرضى الغسيل الكلوي'
                  : 'Dialysis Treatment Adherence Questionnaire'}
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                {isAr
                  ? 'يرجى الإجابة بصدق عن مدى التزامك خلال الشهر الماضي'
                  : 'Please answer honestly regarding your adherence over the past month'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              data-testid="survey-modal-close-btn"
              aria-label={isAr ? 'إغلاق' : 'Close'}
              className="w-12 h-12 min-h-[48px] min-w-[48px] rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-xl cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Overall Progress Bar */}
          {!submittedResult && (
            <div className="mt-4 pt-3 border-t border-white/20">
              <div className="flex items-center justify-between text-xs font-semibold mb-1 text-blue-50">
                <span>
                  {isAr
                    ? `التقدم الإجمالي: ${answeredCount} من 20 سؤال مكتمل`
                    : `Overall Progress: ${answeredCount} of 20 answered`}
                </span>
                <span>{completionPercent}%</span>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Body */}
        {submittedResult ? (
          /* Success Screen */
          <div
            data-testid="survey-score-result"
            className="p-6 sm:p-8 space-y-6 overflow-y-auto text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto shadow-inner animate-in zoom-in duration-300">
              ✓
            </div>

            <div className="space-y-2">
              <Badge variant="success" size="lg" className="px-3 py-1 font-bold">
                {isAr ? 'تم الإرسال بنجاح' : 'Submitted Successfully'}
              </Badge>
              <h3 className="text-2xl font-black text-slate-900">
                {isAr ? 'شكراً لتعاونك!' : 'Thank you for your response!'}
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {isAr
                  ? 'تم تسجيل إجاباتك بنجاح ومشاركتها مع طبيبك المعالج لدعم ومتابعة خطتك العلاجية.'
                  : 'Your adherence questionnaire has been saved and shared with your clinical nephrology team.'}
              </p>
            </div>

            {/* Score Breakdown Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-md mx-auto text-start space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    {isAr ? 'معدل الالتزام العام' : 'Overall Adherence Score'}
                  </span>
                  <span className="text-3xl font-black text-[#1e6bb8]">
                    {submittedResult.overallScorePercent}%
                  </span>
                </div>
                <div className="text-end">
                  <Badge
                    variant={
                      submittedResult.overallScorePercent >= 80
                        ? 'success'
                        : submittedResult.overallScorePercent >= 60
                        ? 'warning'
                        : 'danger'
                    }
                    size="md"
                    className="font-bold text-sm"
                  >
                    {submittedResult.overallScorePercent >= 80
                      ? isAr
                        ? 'التزام ممتاز 🌟'
                        : 'Excellent Adherence 🌟'
                      : submittedResult.overallScorePercent >= 60
                      ? isAr
                        ? 'التزام متوسط ⚠️'
                        : 'Moderate Adherence ⚠️'
                      : isAr
                      ? 'بحاجة لمتابعة ❗'
                      : 'Needs Attention ❗'}
                  </Badge>
                </div>
              </div>

              {/* 4 Clinical Domain Breakdown */}
              <div className="space-y-3 pt-1">
                <span className="text-xs font-bold text-slate-700 block">
                  {isAr ? 'تفاصيل الأقسام الأربعة:' : 'Section Breakdown:'}
                </span>

                {/* Dialysis Attendance */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span>🩺</span>
                      <span>{isAr ? 'حضور الجلسات' : 'Dialysis Attendance'}</span>
                    </span>
                    <span className="font-bold">{submittedResult.sectionScores.dialysisPercent}%</span>
                  </div>
                  <ProgressBar
                    value={submittedResult.sectionScores.dialysisPercent}
                    variant={submittedResult.sectionScores.dialysisPercent >= 80 ? 'success' : 'primary'}
                    showValue={false}
                    size="sm"
                  />
                </div>

                {/* Medications */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span>💊</span>
                      <span>{isAr ? 'الأدوية ومثبت الفوسفور' : 'Medications & Binders'}</span>
                    </span>
                    <span className="font-bold">{submittedResult.sectionScores.medicationsPercent}%</span>
                  </div>
                  <ProgressBar
                    value={submittedResult.sectionScores.medicationsPercent}
                    variant={submittedResult.sectionScores.medicationsPercent >= 80 ? 'success' : 'primary'}
                    showValue={false}
                    size="sm"
                  />
                </div>

                {/* Diet */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span>🥗</span>
                      <span>{isAr ? 'النظام الغذائي والأملاح' : 'Dietary Plan'}</span>
                    </span>
                    <span className="font-bold">{submittedResult.sectionScores.dietPercent}%</span>
                  </div>
                  <ProgressBar
                    value={submittedResult.sectionScores.dietPercent}
                    variant={submittedResult.sectionScores.dietPercent >= 80 ? 'success' : 'primary'}
                    showValue={false}
                    size="sm"
                  />
                </div>

                {/* Fluids */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span>💧</span>
                      <span>{isAr ? 'تقييد السوائل والوزن' : 'Fluid & Weight Control'}</span>
                    </span>
                    <span className="font-bold">{submittedResult.sectionScores.fluidsPercent}%</span>
                  </div>
                  <ProgressBar
                    value={submittedResult.sectionScores.fluidsPercent}
                    variant={submittedResult.sectionScores.fluidsPercent >= 80 ? 'success' : 'primary'}
                    showValue={false}
                    size="sm"
                  />
                </div>
              </div>

              {submittedResult.notes && (
                <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                  <span className="font-bold block text-slate-700">{isAr ? 'ملاحظاتك:' : 'Your Notes:'}</span>
                  <p className="italic mt-0.5">{submittedResult.notes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 max-w-xs mx-auto">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleClose}
                className="font-bold min-h-[48px]"
              >
                {isAr ? 'تم، إغلاق النافذة' : 'Done, Close Dialog'}
              </Button>
            </div>
          </div>
        ) : (
          /* Survey Form View */
          <>
            {/* Category Navigation Tabs */}
            <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-5 py-2.5 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max">
                {QUESTIONNAIRE_SECTIONS.map((sec) => {
                  const isActive = sec.id === activeCategory;
                  const stat = sectionProgress[sec.id];
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveCategory(sec.id)}
                      className={`min-h-[48px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#1e6bb8] text-white shadow-sm ring-2 ring-[#1e6bb8]/30'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span className="text-base">{sec.icon}</span>
                      <span>{isAr ? sec.titleAr : sec.titleEn}</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : stat.isComplete
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {stat.isComplete ? '✓' : `${stat.answered}/${stat.total}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Questions Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>
                    {QUESTIONNAIRE_SECTIONS.find((s) => s.id === activeCategory)?.icon}
                  </span>
                  <span>
                    {isAr
                      ? QUESTIONNAIRE_SECTIONS.find((s) => s.id === activeCategory)?.titleAr
                      : QUESTIONNAIRE_SECTIONS.find((s) => s.id === activeCategory)?.titleEn}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'اختر الإجابة الأكثر دقة التي تصف سلوكك المعتاد:'
                    : 'Select the option that best reflects your habitual adherence:'}
                </p>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {activeQuestions.map((q) => {
                  const selectedVal = answers[q.id];

                  return (
                    <div
                      key={q.id}
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-colors shadow-xs"
                    >
                      {/* Question Text */}
                      <div className="flex items-start gap-3 mb-3">
                        <span className="w-7 h-7 rounded-lg bg-[#1e6bb8]/10 text-[#1e6bb8] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {q.id}
                        </span>
                        <div className="space-y-0.5 flex-1">
                          <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                            {isAr ? q.textAr : q.textEn}
                          </p>
                          <p className="text-xs text-slate-500 font-normal">
                            {isAr ? q.textEn : q.textAr}
                          </p>
                        </div>
                        {selectedVal !== undefined && (
                          <span className="text-emerald-600 font-bold text-xs shrink-0 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                            ✓ {isAr ? 'مكتمل' : 'Answered'}
                          </span>
                        )}
                      </div>

                      {/* 6 Options Grid - min 48px touch targets */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                        {QUESTIONNAIRE_OPTIONS.map((opt) => {
                          const isSelected = selectedVal === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`survey-option-${q.id}-${opt.id}`}
                              onClick={() => handleSelectOption(q.id, opt.id)}
                              className={`min-h-[48px] p-2.5 rounded-xl border text-xs sm:text-sm font-semibold flex flex-col items-center justify-center text-center gap-0.5 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#1e6bb8] text-white border-[#1e6bb8] shadow-sm ring-2 ring-[#1e6bb8]/30 font-bold'
                                  : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className="leading-tight">
                                {isAr ? opt.textAr : opt.textEn}
                              </span>
                              <span
                                className={`text-[10px] ${
                                  isSelected ? 'text-blue-100' : 'text-slate-500'
                                }`}
                              >
                                {isAr ? opt.textEn : opt.textAr}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Patient Notes (shown on last category) */}
              {categoryIndex === QUESTIONNAIRE_SECTIONS.length - 1 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label
                    htmlFor="survey-patient-notes"
                    className="block text-xs font-bold text-slate-800"
                  >
                    {isAr
                      ? 'ملاحظات إضافية تود إرسالها لطبيبك (اختياري):'
                      : 'Additional notes for your doctor (optional):'}
                  </label>
                  <textarea
                    id="survey-patient-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      isAr
                        ? 'اكتب أي صعوبات واجهتها أو ملاحظات خاصة بجرعات الأدوية أو السوائل...'
                        : 'Mention any challenges faced regarding medications, fluids, or dialysis sessions...'
                    }
                    className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 focus:border-[#1e6bb8] focus:ring-1 focus:ring-[#1e6bb8] outline-hidden bg-white resize-none"
                  />
                </div>
              )}
            </div>

            {/* Sticky Navigation Footer */}
            <div className="bg-white border-t border-slate-200 p-3 sm:p-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {categoryIndex > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={handlePrevCategory}
                    className="min-h-[48px] font-bold"
                  >
                    {isAr ? '← القسم السابق' : '← Previous Section'}
                  </Button>
                )}

                {categoryIndex < QUESTIONNAIRE_SECTIONS.length - 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleNextCategory}
                    className="min-h-[48px] font-bold"
                  >
                    {isAr ? 'القسم التالي →' : 'Next Section →'}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isComplete && (
                  <span className="text-xs text-amber-700 font-semibold hidden sm:inline">
                    {isAr
                      ? `بقي ${20 - answeredCount} سؤال لإتمام الاستبيان`
                      : `${20 - answeredCount} questions remaining`}
                  </span>
                )}

                <Button
                  type="button"
                  variant={isComplete ? 'success' : 'primary'}
                  size="md"
                  data-testid="survey-submit-btn"
                  disabled={!isComplete || isSubmitting}
                  onClick={handleSubmit}
                  className={`min-h-[48px] font-black px-6 shadow-sm ${
                    !isComplete ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isSubmitting
                    ? isAr
                      ? 'جاري الإرسال...'
                      : 'Submitting...'
                    : isAr
                    ? 'إرسال الاستبيان للطبيب ✓'
                    : 'Submit Questionnaire ✓'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
export default AdherenceSurveyModal;
