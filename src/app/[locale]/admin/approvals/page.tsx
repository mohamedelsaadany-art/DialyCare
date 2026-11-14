'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getAuthAccounts,
  syncCloudAccounts,
  syncFullCloudData,
  approveUserRegistration,
  rejectUserRegistration,
  getPendingReactivations,
  restorePatient,
  calculateArchiveDaysRemaining,
  ADMIN_CONFIG,
} from '@/lib/data-store';
import type { User, Patient } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { startVisibilityAwarePolling } from '@/lib/visibility-poll';

export default function RegistrationApprovalsPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tAdmin = useTranslations('admin');
  const { user, isAdmin } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [reactivationRequests, setReactivationRequests] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'doctors' | 'nurses' | 'staff'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ID Card preview modal
  const [previewIdUrl, setPreviewIdUrl] = useState<string | null>(null);
  const [previewDoctorName, setPreviewDoctorName] = useState<string>('');

  // Rejection modal
  const [rejectingUser, setRejectingUser] = useState<User | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringPatientId, setIsRestoringPatientId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      // 1. Immediately read local accounts so UI renders without delay
      const localAccs = getAuthAccounts();
      if (localAccs.length > 0) {
        setUsers(localAccs.map((a) => a.user));
      }
      // Read local pending reactivations
      const localReactivations = getPendingReactivations();
      setReactivationRequests(localReactivations);

      // 2. Fetch latest registrations from Cloud Store (Next.js backend)
      const syncedAccs = await syncCloudAccounts();
      setUsers(syncedAccs.map((a) => a.user));

      // 3. Fetch latest archive & reactivation requests from /api/admin/archive
      try {
        const res = await fetch('/api/admin/archive').catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data && Array.isArray(data.reactivationRequests)) {
            const mappedReactivations: Patient[] = data.reactivationRequests.map((r: any) => ({
              ...((r && r.patient) || {}),
              ...r,
              id: r.id || r.patientId || (r.patient && r.patient.id),
              fullName: r.fullName || (r.patient && r.patient.fullName),
              fullNameAr: r.fullNameAr || (r.patient && (r.patient.fullNameAr || r.patient.fullName)),
              phone: r.phone || (r.patient && r.patient.phone) || r.username,
              username: r.username || (r.patient && r.patient.username),
              dialysisSchedule: r.dialysisSchedule || (r.patient && r.patient.dialysisSchedule) || 'SMW',
              archivedAt: r.archivedAt || (r.patient && r.patient.archivedAt),
              archiveExpiresAt: r.archiveExpiresAt || r.purgeAt || (r.patient && r.patient.archiveExpiresAt),
              daysRemaining: r.daysRemaining ?? calculateArchiveDaysRemaining(r.archivedAt, r.archiveExpiresAt || r.purgeAt),
              reactivationStatus: r.reactivationStatus || (r.patient && r.patient.reactivationStatus) || 'pending',
              reactivationRequestedAt: r.reactivationRequestedAt || (r.patient && r.patient.reactivationRequestedAt),
            }));
            setReactivationRequests(mappedReactivations);
          }
        }
      } catch {
        // network / offline fallback
      }
    } catch (err) {
      console.error('Failed to load accounts for approvals:', err);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) void loadData();
    }, 0);

    // Auto-poll cloud every 15 seconds for new cross-device staff registrations
    const stopPolling = startVisibilityAwarePolling(() => {
      void loadData(false);
    }, { intervalMs: 15000 });

    const handleFocus = () => void loadData(false);
    // Local updates read directly from local store without triggering network sync storms
    const handleLocalUpdate = () => {
      if (!mounted) return;
      const localAccs = getAuthAccounts();
      setUsers(localAccs.map((a) => a.user));
      const localReactivations = getPendingReactivations();
      setReactivationRequests(localReactivations);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleLocalUpdate);
    window.addEventListener('dialycare_approvals_updated', handleLocalUpdate);
    window.addEventListener('dialycare_users_updated', handleLocalUpdate);
    window.addEventListener('dialycare_archive_updated', handleLocalUpdate);

    return () => {
      mounted = false;
      clearTimeout(timer);
      stopPolling();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleLocalUpdate);
      window.removeEventListener('dialycare_approvals_updated', handleLocalUpdate);
      window.removeEventListener('dialycare_users_updated', handleLocalUpdate);
      window.removeEventListener('dialycare_archive_updated', handleLocalUpdate);
    };
  }, [loadData]);

  // Flash feedback toast
  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleApprove = async (u: User) => {
    setIsSubmitting(true);
    try {
      const res = approveUserRegistration(u.uid, user?.displayName || 'Super Admin');
      if (res) {
        showFeedback(
          isAr
            ? `تم اعتماد وتفعيل حساب ${u.displayName} بنجاح ✓`
            : `Successfully approved and activated ${u.displayName} ✓`
        );
        void syncFullCloudData();
        loadData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReactivation = async (patient: Patient) => {
    const targetId = patient.id || (patient as any).patientId || (patient as any).patient?.id;
    if (!targetId) return;
    setIsRestoringPatientId(targetId);
    try {
      // 1. Call /api/admin/restore
      await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: targetId, uid: targetId }),
      }).catch((err) => console.warn('API restore failed:', err));

      // 2. Local fallback update
      restorePatient(targetId);

      // 3. Feedback & reload
      const patientName = isAr ? patient.fullNameAr || patient.fullName : patient.fullName;
      showFeedback(
        isAr
          ? `تم اعتماد واستعادة الملف الطبي للمريض ${patientName} بنجاح ✓`
          : `Successfully approved and restored medical record for ${patient.fullName} ✓`
      );
      void syncFullCloudData();
      await loadData();
    } catch (err) {
      console.error('Failed to approve reactivation request:', err);
    } finally {
      setIsRestoringPatientId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingUser) return;
    setIsSubmitting(true);
    try {
      const res = rejectUserRegistration(
        rejectingUser.uid,
        rejectionReason.trim() || (isAr ? 'لم يستوفِ متطلبات الاعتماد' : 'Requirements not met'),
        user?.displayName || 'Super Admin'
      );
      if (res) {
        showFeedback(
          isAr
            ? `تم رفض طلب ${rejectingUser.displayName}`
            : `Rejected registration for ${rejectingUser.displayName}`
        );
        setRejectingUser(null);
        setRejectionReason('');
        void syncFullCloudData();
        loadData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter pending staff lists (Patients are pre-approved and active automatically)
  const pendingStaffAll = useMemo(() => {
    return users.filter(
      (u) =>
        u.status === 'pending' &&
        u.role !== 'patient' &&
        (u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.phone && u.phone.includes(searchQuery)) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.specialty && u.specialty.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (u.hospital && u.hospital.toLowerCase().includes(searchQuery.toLowerCase())))
    );
  }, [users, searchQuery]);

  const pendingDoctors = useMemo(() => {
    return pendingStaffAll.filter((u) => u.role === 'doctor');
  }, [pendingStaffAll]);

  const pendingNurses = useMemo(() => {
    return pendingStaffAll.filter((u) => u.role === 'nurse');
  }, [pendingStaffAll]);

  const pendingUnitAdmins = useMemo(() => {
    return pendingStaffAll.filter((u) => u.role === 'staff' || u.role === 'admin');
  }, [pendingStaffAll]);

  const displayedStaff = useMemo(() => {
    if (activeTab === 'doctors') return pendingDoctors;
    if (activeTab === 'nurses') return pendingNurses;
    if (activeTab === 'staff') return pendingUnitAdmins;
    return pendingStaffAll;
  }, [activeTab, pendingDoctors, pendingNurses, pendingUnitAdmins, pendingStaffAll]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" color="primary" />
      </div>
    );
  }

  // If logging out or not logged in, layout handles redirect cleanly
  if (!user) {
    return null;
  }

  // Access check: only Super Admin can review approvals
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="p-8 text-center border-amber-200 bg-amber-50/50">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            🛡️
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isAr ? 'صلاحية مقصورة على مدير النظام' : 'Super Admin Restricted Access'}
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            {isAr
              ? 'مراجعة واعتماد طلبات الكوادر الطبية تتطلب صلاحية مدير النظام الرئيسي.'
              : 'Reviewing and approving clinical staff accounts requires Super Administrator privileges.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" data-testid="admin-approvals-page">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-linear-to-r from-blue-900 via-indigo-900 to-[#1e6bb8] text-white p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-2xl font-extrabold">🛡️</span>
            <h1 className="text-2xl font-black tracking-tight">
              {isAr ? 'مركز مراجعة واعتماد الحسابات' : 'Registration Approvals Center'}
            </h1>
          </div>
          <p className="text-sm text-blue-100/90 max-w-2xl">
            {isAr
              ? 'مراجعة وتدقيق بيانات الأطباء وهيئة التمريض والإداريين وهوياتهم المهنية، واعتماد صلاحياتهم للوصول إلى النظام.'
              : 'Review professional IDs, verify clinical staff credentials (doctors, nurses, admins), and authorize secure unit access.'}
          </p>
        </div>

        {/* Contact Badge */}
        <div className="bg-white/10 backdrop-blur-xs border border-white/20 px-4 py-2.5 rounded-xl text-xs flex flex-col gap-1.5 shrink-0">
          <div>
            <span className="text-blue-200 font-semibold">{isAr ? 'هاتف المدير المسؤول (نائب أول الكلى):' : 'Primary Admin (Senior Resident):'} </span>
            <span className="font-mono font-bold text-white text-sm" dir="ltr">{ADMIN_CONFIG.primaryPhone}</span>
          </div>
          <div className="pt-1 border-t border-white/10">
            <span className="text-blue-200 font-semibold">{isAr ? 'الإدارة التقنية للنظام:' : 'Technical Administrator:'} </span>
            <span className="font-mono font-bold text-white text-sm" dir="ltr">{ADMIN_CONFIG.technicalAdminPhone}</span>
          </div>
        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionFeedback && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center justify-between animate-in fade-in duration-200"
        >
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 min-h-[48px] min-w-[48px] flex items-center justify-center p-1 rounded-lg"
            aria-label={isAr ? 'إغلاق الإشعار' : 'Dismiss notice'}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dedicated Section: Reactivation Requests for Archived Patients */}
      <Card
        data-testid="reactivation-requests-card"
        className="p-6 border-emerald-300 bg-linear-to-br from-emerald-50/70 via-teal-50/40 to-white shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-emerald-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">♻️</span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {isAr
                  ? 'طلبات استعادة الحسابات المعلقة (Reactivation Requests)'
                  : 'Pending Reactivation Requests'}
              </h2>
              <Badge variant={reactivationRequests.length > 0 ? 'warning' : 'neutral'} size="sm">
                {reactivationRequests.length} {isAr ? 'طلب' : 'Pending'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'مرضى كانوا في الأرشيف المؤقت وقاموا بإعادة التسجيل وطلبوا اعتماد واستعادة ملفاتهم الطبية قبل انتهاء مهلة الـ 14 يوماً.'
                : 'Archived patients who re-registered and requested their clinical history and medical records be restored before the 14-day purge deadline.'}
            </p>
          </div>
        </div>

        {reactivationRequests.length === 0 ? (
          <div className="py-6 text-center text-slate-400">
            <span className="text-3xl block mb-2">✓</span>
            <p className="text-sm font-bold text-slate-700">
              {isAr
                ? 'لا توجد طلبات استعادة حسابات معلقة حالياً'
                : 'No pending patient reactivation requests at this time'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr
                ? 'عندما يسجل مريض مؤرشف خلال مهلة الـ 14 يوماً، يظهر طلبه هنا للمراجعة والاعتماد.'
                : 'When an archived patient re-registers within 14 days, their request appears here for authorization.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reactivationRequests.map((patient) => {
              const patientId = patient.id || (patient as any).patientId || (patient as any).patient?.id || '';
              const daysRemaining =
                (patient as any).daysRemaining ??
                calculateArchiveDaysRemaining(
                  patient.archivedAt || (patient as any).patient?.archivedAt,
                  patient.archiveExpiresAt || (patient as any).purgeAt || (patient as any).patient?.archiveExpiresAt
                );
              const requestedDate =
                patient.reactivationRequestedAt ||
                (patient as any).patient?.reactivationRequestedAt ||
                patient.createdAt ||
                (patient as any).patient?.createdAt;
              const isUrgent = daysRemaining <= 3;
              const phone = patient.phone || (patient as any).patient?.phone || patient.username || '—';
              const schedule = patient.dialysisSchedule || (patient as any).patient?.dialysisSchedule || 'SMW';

              return (
                <div
                  key={patientId}
                  data-testid={`reactivation-card-${patientId}`}
                  className="p-4 rounded-xl border border-emerald-200 bg-white hover:border-emerald-400 transition-all shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-lg">🩺</span>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {isAr ? patient.fullNameAr || patient.fullName : patient.fullName}
                      </h3>
                      {patient.fullNameAr && patient.fullName !== patient.fullNameAr && (
                        <span className="text-xs font-semibold text-slate-500">
                          ({patient.fullName})
                        </span>
                      )}
                      <Badge variant="success" size="sm">
                        {isAr ? 'مريض غسيل كلوي' : 'Dialysis Patient'}
                      </Badge>
                      {/* Days Remaining Badge */}
                      <span
                        data-testid={`reactivation-badge-days-${patientId}`}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          isUrgent
                            ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                            : daysRemaining <= 7
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-[#1e6bb8] border-blue-200'
                        }`}
                      >
                        <span aria-hidden="true">⏳</span>
                        <span>
                          {isAr
                            ? `متبقي ${daysRemaining} يوماً قبل الحذف النهائي`
                            : `${daysRemaining} days remaining before purge`}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'رقم الهاتف:' : 'Phone:'} </span>
                        <span dir="ltr" className="font-mono font-bold text-slate-900">
                          {phone}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'جدول الغسيل:' : 'Schedule:'} </span>
                        <span>{schedule}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'تاريخ طلب الاستعادة:' : 'Date Requested:'} </span>
                        <span className="font-mono">
                          {requestedDate
                            ? new Date(requestedDate).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                                dateStyle: 'medium',
                              })
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Approve & Restore Button (Calls /api/admin/restore) */}
                  <div className="shrink-0 flex items-center">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={() => handleApproveReactivation(patient)}
                      disabled={isRestoringPatientId === patientId}
                      isLoading={isRestoringPatientId === patientId}
                      data-testid={`approve-reactivation-btn-${patientId}`}
                      className="min-h-[48px] bg-emerald-600 hover:bg-emerald-700 font-extrabold px-5 text-white shadow-xs"
                    >
                      ✓ {isAr ? 'اعتماد واستعادة الملف الطبي (Approve & Restore Data)' : 'Approve & Restore Data'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Filter and Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            data-testid="tab-pending-all"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🛡️ {isAr ? 'كافة الكوادر' : 'All Staff'}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeTab === 'all'
                  ? 'bg-white text-[#1e6bb8]'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pendingStaffAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('doctors')}
            data-testid="tab-pending-doctors"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'doctors'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>👨‍⚕️ {isAr ? 'أطباء' : 'Doctors'}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeTab === 'doctors'
                  ? 'bg-white text-[#1e6bb8]'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pendingDoctors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nurses')}
            data-testid="tab-pending-nurses"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'nurses'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>👩‍⚕️ {isAr ? 'تمريض' : 'Nurses'}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeTab === 'nurses'
                  ? 'bg-white text-[#1e6bb8]'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pendingNurses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            data-testid="tab-pending-staff"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📋 {isAr ? 'إداريون' : 'Unit Admins'}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeTab === 'staff'
                  ? 'bg-white text-[#1e6bb8]'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pendingUnitAdmins.length}
            </span>
          </button>
        </div>

        {/* Actions & Search */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            data-testid="sync-cloud-btn"
            className="shrink-0 min-h-[48px] px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            title={isAr ? 'تحديث ومزامنة طلبات التسجيل من السحابة' : 'Refresh and sync registrations from cloud'}
          >
            <span className={`text-base leading-none ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span className="hidden sm:inline">
              {isRefreshing ? (isAr ? 'جارِ المزامنة...' : 'Syncing...') : (isAr ? 'تحديث السحابة' : 'Sync Cloud')}
            </span>
          </button>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder={isAr ? 'بحث بالاسم أو الهاتف...' : 'Search by name or phone...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[48px] px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/30"
            />
          </div>
        </div>
      </div>

      {/* Staff Approvals Content */}
      <div className="space-y-4" data-testid="pending-staff-list">
        {displayedStaff.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-3xl">
              ✓
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              {isAr ? 'لا توجد طلبات كادر طبي معلقة حالياً' : 'No Pending Staff Registrations'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {isAr
                ? 'تمت مراجعة واعتماد جميع طلبات الكوادر الطبية والتمريضية والإدارية.'
                : 'All staff registration requests have been reviewed and approved.'}
            </p>
          </Card>
        ) : (
          displayedStaff.map((st) => (
            <Card
              key={st.uid}
              data-testid={`pending-staff-card-${st.uid}`}
              className="p-5 border-amber-200 bg-amber-50/20 hover:border-amber-300 transition-all"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                {/* Left: Staff Member Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {st.role === 'nurse' ? '👩‍⚕️' : st.role === 'doctor' ? '👨‍⚕️' : '📋'} {st.displayName}
                    </h3>
                    <Badge variant={st.role === 'doctor' ? 'info' : st.role === 'nurse' ? 'success' : 'neutral'}>
                      {st.role === 'doctor'
                        ? (isAr ? 'طبيب كلى' : 'Nephrologist')
                        : st.role === 'nurse'
                        ? (isAr ? 'تمريض كلى وغسيل كلوي' : 'Dialysis Nurse')
                        : (isAr ? 'إدارة وحدة الغسيل' : 'Unit Administrator')}
                    </Badge>
                    <Badge variant="warning">
                      {isAr ? 'قيد المراجعة والاعتماد' : 'Pending Review'}
                    </Badge>
                    {st.specialty && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-[#1e6bb8] border border-blue-200">
                        {st.specialty}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-4 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-700">{isAr ? 'المستشفى / المركز:' : 'Hospital / Center:'} </span>
                      <span>{st.hospital || '—'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">{isAr ? 'رقم الهاتف:' : 'Phone:'} </span>
                      <span dir="ltr" className="font-mono font-bold text-slate-900">{st.phone || st.username}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">{isAr ? 'اسم المستخدم:' : 'Username:'} </span>
                      <span className="font-mono">{st.username}</span>
                    </div>
                    {st.email && (
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'البريد الإلكتروني:' : 'Email:'} </span>
                        <span>{st.email}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-slate-700">{isAr ? 'تاريخ الطلب:' : 'Registered:'} </span>
                      <span>{new Date(st.registeredAt || st.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { dateStyle: 'medium' })}</span>
                    </div>
                  </div>
                </div>

                {/* Right: ID Preview & Decision Action Buttons */}
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  {/* Medical / Professional ID Card Preview */}
                  {st.idCardDataUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewIdUrl(st.idCardDataUrl || null);
                        setPreviewDoctorName(st.displayName);
                      }}
                      data-testid={`view-id-card-btn-${st.uid}`}
                      className="min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span className="text-base">🪪</span>
                      <span>{isAr ? 'معاينة كارنيه النقابة / الهوية' : 'View ID Card'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic px-2">
                      {isAr ? 'لم تُرفق صورة الهوية' : 'No ID uploaded'}
                    </span>
                  )}

                  {/* Approve Button */}
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => handleApprove(st)}
                    disabled={isSubmitting}
                    data-testid={`approve-doctor-btn-${st.uid}`}
                    className="min-h-[48px] bg-emerald-600 hover:bg-emerald-700 font-bold px-4"
                  >
                    ✓ {isAr ? 'اعتماد وتفعيل الكادر' : 'Approve & Activate'}
                  </Button>

                  {/* Reject Button */}
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={() => {
                      setRejectingUser(st);
                      setRejectionReason('');
                    }}
                    disabled={isSubmitting}
                    data-testid={`reject-doctor-btn-${st.uid}`}
                    className="min-h-[48px] font-bold px-4"
                  >
                    ✕ {isAr ? 'رفض الطلب' : 'Reject'}
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal 1: Doctor ID Card Zoom */}
      {previewIdUrl && (
        <Modal
          isOpen={Boolean(previewIdUrl)}
          onClose={() => setPreviewIdUrl(null)}
          maxWidth="lg"
          title={
            <div className="flex items-center gap-2">
              <span>🪪</span>
              <span>{isAr ? `معاينة هوية الطبيب: ${previewDoctorName}` : `Doctor ID: ${previewDoctorName}`}</span>
            </div>
          }
          footer={
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setPreviewIdUrl(null)}
              className="min-h-[48px] w-full font-bold"
            >
              {isAr ? 'إغلاق المعاينة' : 'Close Preview'}
            </Button>
          }
        >
          <div className="p-4 flex items-center justify-center bg-slate-100 rounded-xl overflow-hidden max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewIdUrl}
              alt="Medical ID Card"
              className="max-h-[65vh] w-auto object-contain rounded-lg shadow-md"
            />
          </div>
        </Modal>
      )}

      {/* Modal 2: Rejection Reason Confirmation */}
      {rejectingUser && (
        <Modal
          isOpen={Boolean(rejectingUser)}
          onClose={() => setRejectingUser(null)}
          maxWidth="md"
          title={
            <div className="flex items-center gap-2 text-red-600">
              <span>✕</span>
              <span>{isAr ? `رفض طلب تسجيل: ${rejectingUser.displayName}` : `Reject Registration: ${rejectingUser.displayName}`}</span>
            </div>
          }
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setRejectingUser(null)}
                className="min-h-[48px]"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={handleConfirmReject}
                disabled={isSubmitting}
                data-testid="confirm-reject-btn"
                className="min-h-[48px] font-bold"
              >
                {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 p-2">
            <p className="text-sm text-slate-600">
              {isAr
                ? 'يرجى كتابة سبب الرفض ليظهر للمستخدم عند محاولة تسجيل الدخول:'
                : 'Please state the reason for rejection, which will be visible to the applicant upon login attempt:'}
            </p>
            <textarea
              rows={3}
              placeholder={
                isAr
                  ? 'مثال: صورة الكارنيه غير واضحة، يرجى إعادة التسجيل بصورة واضحة...'
                  : 'e.g. ID card photo is illegible, please re-register with a clear photo...'
              }
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
