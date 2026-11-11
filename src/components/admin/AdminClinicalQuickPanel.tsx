'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { DialysisSessionModal } from '@/components/DialysisSessionModal';
import { PatientLabResultsModal } from '@/components/admin/PatientLabResultsModal';
import { DialysisSessionHistory } from '@/components/DialysisSessionHistory';
import { PatientLabResultsView } from '@/components/patient/PatientLabResultsView';
import {
  getPatients,
  getDialysisSessions,
  getPatientLabResults,
  getPatientMedications,
} from '@/lib/data-store';
import type { PatientLabRecord } from '@/lib/types';

export interface AdminClinicalQuickPanelProps {
  /** Optional externally controlled patient ID */
  selectedPatientId?: string;
  /** Callback fired when the doctor selects a different patient */
  onPatientChange?: (patientId: string) => void;
  /** Callback fired after any dialysis session or lab result is saved */
  onDataUpdated?: () => void;
  /** Optional handler to focus/open the medications manager on the current page */
  onOpenMedications?: (patientId: string) => void;
  /** Whether to expand the embedded session history & lab viewer by default */
  showEmbeddedViews?: boolean;
  /** Optional DOM id for anchor scrolling */
  id?: string;
  className?: string;
}

export function AdminClinicalQuickPanel({
  selectedPatientId,
  onPatientChange,
  onDataUpdated,
  onOpenMedications,
  showEmbeddedViews = false,
  id = 'clinical-quick-panel',
  className = '',
}: AdminClinicalQuickPanelProps) {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const { user } = useAuth();

  const [hydrated, setHydrated] = useState<boolean>(false);
  const [syncVersion, setSyncVersion] = useState<number>(0);
  const [internalPatientId, setInternalPatientId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [prevSelectedPatientId, setPrevSelectedPatientId] = useState<string | undefined>(selectedPatientId);

  // Embedded records accordion/tabs state
  const [recordsExpanded, setRecordsExpanded] = useState<boolean>(showEmbeddedViews);
  const [embeddedTab, setEmbeddedTab] = useState<'dialysis' | 'labs'>('dialysis');

  // Modals state
  const [dialysisModalOpen, setDialysisModalOpen] = useState<boolean>(false);
  const [labModalOpen, setLabModalOpen] = useState<boolean>(false);
  const [editingLabRecord, setEditingLabRecord] = useState<PatientLabRecord | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate client localStorage after mount and subscribe to clinical store events
  useEffect(() => {
    const timer = setTimeout(() => {
      setHydrated(true);
    }, 0);

    const handleSync = () => {
      setSyncVersion((v) => v + 1);
    };

    window.addEventListener('dialycare_sessions_updated', handleSync);
    window.addEventListener('dialycare_labs_updated', handleSync);
    window.addEventListener('dialycare_medications_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      clearTimeout(timer);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      window.removeEventListener('dialycare_sessions_updated', handleSync);
      window.removeEventListener('dialycare_labs_updated', handleSync);
      window.removeEventListener('dialycare_medications_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const patients = useMemo(() => {
    void syncVersion;
    return hydrated ? getPatients() : [];
  }, [hydrated, syncVersion]);

  const effectivePatientId = selectedPatientId ?? internalPatientId;

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q) ||
        (p.dialysisSchedule && p.dialysisSchedule.toLowerCase().includes(q))
      );
    });
  }, [patients, searchQuery]);

  if (selectedPatientId !== prevSelectedPatientId) {
    setPrevSelectedPatientId(selectedPatientId);
    if (
      searchQuery.trim() &&
      selectedPatientId &&
      !filteredPatients.some((p) => p.id === selectedPatientId)
    ) {
      setSearchQuery('');
    }
  }

  const activePatient = useMemo(() => {
    if (filteredPatients.length === 0) return null;
    return (
      filteredPatients.find((p) => p.id === effectivePatientId) ||
      filteredPatients[0]
    );
  }, [filteredPatients, effectivePatientId]);

  const resolvedPatientId = activePatient?.id || '';

  const { sessionsCount, latestSession, labsCount, latestLab, activeMedsCount } = useMemo(() => {
    void syncVersion;
    if (!hydrated || !resolvedPatientId) {
      return {
        sessionsCount: 0,
        latestSession: null,
        labsCount: 0,
        latestLab: null,
        activeMedsCount: 0,
      };
    }

    const sessions = getDialysisSessions(resolvedPatientId);
    const labs = getPatientLabResults(resolvedPatientId);
    const meds = getPatientMedications(resolvedPatientId).filter((m) => m.isActive !== false);

    return {
      sessionsCount: sessions.length,
      latestSession: sessions[0] || null,
      labsCount: labs.length,
      latestLab: labs[0] || null,
      activeMedsCount: meds.length,
    };
  }, [hydrated, resolvedPatientId, syncVersion]);

  const handleSelectPatient = (pid: string) => {
    if (selectedPatientId === undefined) {
      setInternalPatientId(pid);
    }
    onPatientChange?.(pid);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    const q = value.trim().toLowerCase();
    if (!q) return;

    const matching = patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q) ||
        (p.dialysisSchedule && p.dialysisSchedule.toLowerCase().includes(q))
    );
    if (matching.length > 0 && !matching.some((p) => p.id === effectivePatientId)) {
      handleSelectPatient(matching[0].id);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  const doctorRecorderName = user?.displayName || user?.username || 'doctor';

  const patientDisplayName = activePatient
    ? isRtl
      ? `${activePatient.fullNameAr || activePatient.fullName} (${activePatient.fullName})`
      : `${activePatient.fullName}${activePatient.fullNameAr ? ` (${activePatient.fullNameAr})` : ''}`
    : '';

  const patientShortName = activePatient
    ? isRtl
      ? activePatient.fullNameAr || activePatient.fullName
      : activePatient.fullName
    : '';

  return (
    <section
      id={id}
      data-testid="admin-clinical-quick-panel"
      className={`space-y-4 ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <Card className="border-2 border-[#1e6bb8]/20 bg-gradient-to-br from-white via-blue-50/25 to-emerald-50/25 shadow-sm">
        <div className="space-y-5">
          {/* Header Banner */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#1e6bb8] text-white flex items-center justify-center text-2xl shrink-0 shadow-sm">
                🩺
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900">
                    {isRtl
                      ? 'التسجيل السريري السريع للطبيب'
                      : 'Doctor Clinical Quick Recorder'}
                  </h2>
                  <Badge variant="info" size="sm">
                    {isRtl ? 'صلاحية الطبيب فقط — التحاليل والغسيل' : 'Doctor Only — Labs & Dialysis'}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">
                  {isRtl
                    ? 'اختر أي مريض لتسجيل جلسة الغسيل الكلوي أو إدخال نتائج الـ 12 تحليل مخبري أو متابعة أدويته فوراً.'
                    : 'Select any enrolled patient to immediately record a dialysis session, enter the 12 lab tests, or manage medications.'}
                </p>
              </div>
            </div>

            {toastMsg && (
              <div
                role="status"
                aria-live="polite"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm flex items-center gap-2"
              >
                <span>✓</span>
                <span>{toastMsg}</span>
              </div>
            )}
          </div>

          {/* Patient Search & Selection Row */}
          {patients.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm">
              {isRtl ? 'لا يوجد مرضى مسجلين حالياً.' : 'No enrolled patients found.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                {/* Search input */}
                <div className="lg:col-span-5">
                  <label
                    htmlFor={`${id}-patient-search`}
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    {isRtl ? '🔍 بحث سريع عن مريض (الاسم / الكود / الموعد)' : '🔍 Quick Patient Filter (Name / ID / Schedule)'}
                  </label>
                  <input
                    id={`${id}-patient-search`}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={isRtl ? 'اكتب اسم المريض أو ID...' : 'Type patient name or ID...'}
                    data-testid="clinical-panel-patient-search"
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/30 focus:border-[#1e6bb8]"
                  />
                </div>

                {/* Patient Select Dropdown */}
                <div className="lg:col-span-7">
                  <label
                    htmlFor={`${id}-patient-select`}
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    {isRtl
                      ? `👤 اختر المريض (${filteredPatients.length} متاح)`
                      : `👤 Select Patient (${filteredPatients.length} available)`}
                  </label>
                  <select
                    id={`${id}-patient-select`}
                    value={activePatient?.id || ''}
                    disabled={filteredPatients.length === 0}
                    onChange={(e) => handleSelectPatient(e.target.value)}
                    data-testid="clinical-panel-patient-select"
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border-2 border-[#1e6bb8]/30 bg-white text-slate-900 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/30 focus:border-[#1e6bb8] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {filteredPatients.length === 0 ? (
                      <option value="">
                        {isRtl ? 'لا توجد نتائج مطابقة للبحث' : 'No matching patients'}
                      </option>
                    ) : (
                      filteredPatients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {isRtl
                            ? `${p.fullNameAr || p.fullName} — ${p.fullName} | ${p.id} | ${p.dialysisSchedule}`
                            : `${p.fullName}${p.fullNameAr ? ` (${p.fullNameAr})` : ''} | ${p.id} | ${p.dialysisSchedule}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {filteredPatients.length === 0 && (
                <div
                  data-testid="clinical-panel-empty-search"
                  className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3"
                >
                  <p className="text-sm font-semibold text-amber-900">
                    {isRtl
                      ? 'لا يوجد مريض مطابق لعبارة البحث الحالية. أعد ضبط البحث لاختيار مريض وتسجيل بياناته.'
                      : 'No enrolled patient matches your search filter. Clear the filter to select a patient.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    data-testid="clinical-panel-clear-search-btn"
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-sm shrink-0 cursor-pointer transition-colors"
                  >
                    {isRtl ? '🔄 إعادة ضبط البحث' : '🔄 Clear Filter'}
                  </button>
                </div>
              )}

              {/* Selected Patient Snapshot Strip */}
              {activePatient && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {patientDisplayName}
                    </span>
                    <Badge variant="neutral" size="sm">
                      ID: {activePatient.id}
                    </Badge>
                    <Badge variant="info" size="sm">
                      📅 {activePatient.dialysisSchedule}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                      🩺 {isRtl ? `جلسات الغسيل: ${sessionsCount}` : `Dialysis: ${sessionsCount}`}
                      {latestSession ? ` (${latestSession.sessionDate})` : ''}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                      🔬 {isRtl ? `التحاليل: ${labsCount}` : `Labs: ${labsCount}`}
                      {latestLab ? ` (${latestLab.testDate})` : ''}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                      💊 {isRtl ? `أدوية نشطة: ${activeMedsCount}` : `Active Meds: ${activeMedsCount}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Prominent >=48px Clinical Action Buttons */}
              {activePatient && (
                <div className="space-y-2.5">
                  {/* Primary Doctor Actions: Dialysis & 12-Test Labs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDialysisModalOpen(true)}
                      data-testid="clinical-panel-record-dialysis-btn"
                      className="min-h-[52px] px-4 py-3 rounded-xl bg-[#1e6bb8] hover:bg-blue-700 text-white font-bold text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
                    >
                      <span className="text-lg">🩺</span>
                      <span>
                        {isRtl
                          ? 'تسجيل جلسة غسيل للمريض'
                          : 'Record Patient Dialysis Session'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingLabRecord(null);
                        setLabModalOpen(true);
                      }}
                      data-testid="clinical-panel-record-labs-btn"
                      className="min-h-[52px] px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
                    >
                      <span className="text-lg">🔬</span>
                      <span>
                        {isRtl
                          ? 'تسجيل نتائج التحاليل (12 تحليل)'
                          : 'Record Lab Results (12 Tests)'}
                      </span>
                    </button>
                  </div>

                  {/* Secondary Actions: Update Latest Labs, Medications, Full File */}
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${
                      latestLab ? 'lg:grid-cols-3' : ''
                    } gap-3`}
                  >
                    {latestLab && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLabRecord(latestLab);
                          setLabModalOpen(true);
                        }}
                        data-testid="clinical-panel-update-latest-labs-btn"
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border-2 border-amber-300 font-bold text-sm transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
                      >
                        <span className="text-lg">✏️</span>
                        <span>
                          {isRtl
                            ? `تحديث آخر تحاليل (${latestLab.testDate})`
                            : `Update Latest Labs (${latestLab.testDate})`}
                        </span>
                      </button>
                    )}

                    {onOpenMedications ? (
                      <button
                        type="button"
                        onClick={() => onOpenMedications(activePatient.id)}
                        data-testid="clinical-panel-manage-meds-btn"
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
                      >
                        <span className="text-lg">💊</span>
                        <span>
                          {isRtl ? 'إدارة أدوية المريض' : 'Manage Patient Medications'}
                        </span>
                      </button>
                    ) : (
                      <Link
                        href={`/${locale}/admin/patients?patientId=${activePatient.id}#admin-medications-section`}
                        data-testid="clinical-panel-manage-meds-link"
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 text-center"
                      >
                        <span className="text-lg">💊</span>
                        <span>
                          {isRtl ? 'إدارة أدوية المريض' : 'Manage Patient Medications'}
                        </span>
                      </Link>
                    )}

                    <Link
                      href={`/${locale}/admin/patients/${activePatient.id}`}
                      data-testid="clinical-panel-full-profile-link"
                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-sm transition-all flex items-center justify-center gap-2 text-center"
                    >
                      <span>📋</span>
                      <span>
                        {isRtl ? 'ملف المريض الكامل' : 'Full Clinical File'}
                      </span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Toggle / Expandable Clinical History & Labs Section */}
              {activePatient && (
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={recordsExpanded && embeddedTab === 'dialysis' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          if (recordsExpanded && embeddedTab === 'dialysis' && !showEmbeddedViews) {
                            setRecordsExpanded(false);
                          } else {
                            setEmbeddedTab('dialysis');
                            setRecordsExpanded(true);
                          }
                        }}
                        className="min-h-[48px] px-4"
                        data-testid="clinical-panel-tab-dialysis"
                      >
                        🩺 {isRtl ? `سجل جلسات الغسيل (${sessionsCount})` : `Dialysis History (${sessionsCount})`}
                      </Button>

                      <Button
                        variant={recordsExpanded && embeddedTab === 'labs' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          if (recordsExpanded && embeddedTab === 'labs' && !showEmbeddedViews) {
                            setRecordsExpanded(false);
                          } else {
                            setEmbeddedTab('labs');
                            setRecordsExpanded(true);
                          }
                        }}
                        className="min-h-[48px] px-4"
                        data-testid="clinical-panel-tab-labs"
                      >
                        🔬 {isRtl ? `نتائج التحاليل المخبرية (${labsCount})` : `Lab Results (${labsCount})`}
                      </Button>
                    </div>

                    {!showEmbeddedViews && recordsExpanded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecordsExpanded(false)}
                        className="min-h-[48px] px-3 text-slate-500"
                      >
                        {isRtl ? 'إخفاء التفاصيل ▲' : 'Collapse ▲'}
                      </Button>
                    )}
                  </div>

                  {recordsExpanded && (
                    <div className="mt-4">
                      {embeddedTab === 'dialysis' ? (
                        <DialysisSessionHistory
                          patientId={activePatient.id}
                          patientName={patientShortName}
                          canRecord={true}
                          canManage={true}
                          onRecordClick={() => setDialysisModalOpen(true)}
                        />
                      ) : (
                        <PatientLabResultsView
                          patientId={activePatient.id}
                          canEdit={true}
                          onEditClick={(rec) => {
                            setEditingLabRecord(rec || null);
                            setLabModalOpen(true);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Doctor Dialysis Session Recording Modal */}
      {activePatient && (
        <DialysisSessionModal
          isOpen={dialysisModalOpen}
          onClose={() => setDialysisModalOpen(false)}
          patientId={activePatient.id}
          patientName={patientShortName}
          recordedBy={doctorRecorderName}
          onSessionRecorded={() => {
            setSyncVersion((v) => v + 1);
            onDataUpdated?.();
            showToast(
              isRtl
                ? `تم تسجيل جلسة الغسيل للمريض ${patientShortName} بنجاح`
                : `Dialysis session recorded for ${patientShortName}`
            );
          }}
        />
      )}

      {/* Doctor Lab Results Recording / Editing Modal */}
      {activePatient && (
        <PatientLabResultsModal
          isOpen={labModalOpen}
          onClose={() => {
            setLabModalOpen(false);
            setEditingLabRecord(null);
          }}
          patientId={activePatient.id}
          patientName={patientShortName}
          recordedBy={doctorRecorderName}
          existingRecord={editingLabRecord}
          onSaved={() => {
            setSyncVersion((v) => v + 1);
            onDataUpdated?.();
            showToast(
              isRtl
                ? `تم حفظ التحاليل المخبرية للمريض ${patientShortName} بنجاح`
                : `Lab results saved for ${patientShortName}`
            );
          }}
        />
      )}
    </section>
  );
}

export default AdminClinicalQuickPanel;
