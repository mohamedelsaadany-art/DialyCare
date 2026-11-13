'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import {
  getAuthAccounts,
  syncCloudAccounts,
  approveUserRegistration,
  rejectUserRegistration,
  ADMIN_CONFIG,
} from '@/lib/data-store';
import type { User } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function RegistrationApprovalsPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user, isAdmin } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'doctors' | 'patients'>('doctors');
  const [searchQuery, setSearchQuery] = useState('');

  // ID Card preview modal
  const [previewIdUrl, setPreviewIdUrl] = useState<string | null>(null);
  const [previewDoctorName, setPreviewDoctorName] = useState<string>('');

  // Rejection modal
  const [rejectingUser, setRejectingUser] = useState<User | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      // 2. Fetch latest registrations from Cloud Store (Vercel Blob / Next.js backend)
      const syncedAccs = await syncCloudAccounts();
      setUsers(syncedAccs.map((a) => a.user));
    } catch (err) {
      console.error('Failed to load accounts for approvals:', err);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    loadData();

    // Auto-poll cloud every 8 seconds for new cross-device patient registrations
    const pollInterval = setInterval(() => {
      loadData(false);
    }, 8000);

    const handleFocus = () => loadData(false);
    const handleUpdate = () => loadData(false);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('dialycare_approvals_updated', handleUpdate);
    window.addEventListener('dialycare_users_updated', handleUpdate);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('dialycare_approvals_updated', handleUpdate);
      window.removeEventListener('dialycare_users_updated', handleUpdate);
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
        loadData();
      }
    } finally {
      setIsSubmitting(false);
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
        loadData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter pending lists
  const pendingDoctors = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'doctor' &&
        u.status === 'pending' &&
        (u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.phone && u.phone.includes(searchQuery)) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [users, searchQuery]);

  const pendingPatients = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'patient' &&
        u.status === 'pending' &&
        (u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.phone && u.phone.includes(searchQuery)) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [users, searchQuery]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" color="primary" />
      </div>
    );
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
              ? 'مراجعة واعتماد طلبات الأطباء والمرضى تتطلب صلاحية مدير النظام الرئيسي.'
              : 'Reviewing and approving doctor and patient accounts requires Super Administrator privileges.'}
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
              ? 'مراجعة وتدقيق بيانات الأطباء وهوياتهم النقابية، واعتماد ملفات مرضى الغسيل الكلوي وإدراجهم رسمياً في النظام.'
              : 'Review medical syndicate IDs, verify doctor credentials, and audit/enroll hemodialysis patients into active care.'}
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
            className="text-emerald-700 hover:text-emerald-900 min-h-[44px] min-w-[44px] flex items-center justify-center p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('doctors')}
            data-testid="tab-pending-doctors"
            className={`min-h-[48px] px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'doctors'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>👨‍⚕️ {isAr ? 'أطباء قيد المراجعة' : 'Pending Doctors'}</span>
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
            onClick={() => setActiveTab('patients')}
            data-testid="tab-pending-patients"
            className={`min-h-[48px] px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'patients'
                ? 'bg-[#1e6bb8] text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🩺 {isAr ? 'مرضى قيد المراجعة' : 'Pending Patients'}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                activeTab === 'patients'
                  ? 'bg-white text-[#1e6bb8]'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {pendingPatients.length}
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

      {/* Tab 1: Pending Doctors Content */}
      {activeTab === 'doctors' && (
        <div className="space-y-4" data-testid="pending-doctors-list">
          {pendingDoctors.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-slate-200">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-3xl">
                ✓
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {isAr ? 'لا توجد طلبات أطباء معلقة حالياً' : 'No Pending Doctor Registrations'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {isAr
                  ? 'تمت مراجعة واعتماد جميع طلبات الأطباء المسجلين.'
                  : 'All doctor registration requests have been reviewed.'}
              </p>
            </Card>
          ) : (
            pendingDoctors.map((doc) => (
              <Card
                key={doc.uid}
                data-testid={`pending-doctor-card-${doc.uid}`}
                className="p-5 border-amber-200 bg-amber-50/20 hover:border-amber-300 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  {/* Left: Doctor Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-extrabold text-slate-900">
                        👨‍⚕️ {doc.displayName}
                      </h3>
                      <Badge variant="warning">
                        {isAr ? 'قيد المراجعة والاعتماد' : 'Pending Review'}
                      </Badge>
                      {doc.specialty && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-[#1e6bb8] border border-blue-200">
                          {doc.specialty}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-4 text-xs text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'المستشفى / المركز:' : 'Hospital / Center:'} </span>
                        <span>{doc.hospital || '—'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'رقم الهاتف:' : 'Phone:'} </span>
                        <span dir="ltr" className="font-mono font-bold text-slate-900">{doc.phone || doc.username}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'اسم المستخدم:' : 'Username:'} </span>
                        <span className="font-mono">{doc.username}</span>
                      </div>
                      {doc.email && (
                        <div>
                          <span className="font-semibold text-slate-700">{isAr ? 'البريد الإلكتروني:' : 'Email:'} </span>
                          <span>{doc.email}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-700">{isAr ? 'تاريخ الطلب:' : 'Registered:'} </span>
                        <span>{new Date(doc.registeredAt || doc.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { dateStyle: 'medium' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: ID Preview & Decision Action Buttons */}
                  <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    {/* Medical ID Card Preview */}
                    {doc.idCardDataUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewIdUrl(doc.idCardDataUrl || null);
                          setPreviewDoctorName(doc.displayName);
                        }}
                        data-testid={`view-id-card-btn-${doc.uid}`}
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
                      onClick={() => handleApprove(doc)}
                      disabled={isSubmitting}
                      data-testid={`approve-doctor-btn-${doc.uid}`}
                      className="min-h-[48px] bg-emerald-600 hover:bg-emerald-700 font-bold px-4"
                    >
                      ✓ {isAr ? 'اعتماد وتفعيل الطبيب' : 'Approve & Activate'}
                    </Button>

                    {/* Reject Button */}
                    <Button
                      type="button"
                      variant="danger"
                      size="md"
                      onClick={() => {
                        setRejectingUser(doc);
                        setRejectionReason('');
                      }}
                      disabled={isSubmitting}
                      data-testid={`reject-doctor-btn-${doc.uid}`}
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
      )}

      {/* Tab 2: Pending Patients Content */}
      {activeTab === 'patients' && (
        <div className="space-y-4" data-testid="pending-patients-list">
          {pendingPatients.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-slate-200">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-3xl">
                ✓
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {isAr ? 'لا توجد طلبات مرضى معلقة حالياً' : 'No Pending Patient Registrations'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {isAr
                  ? 'تمت مراجعة واعتماد جميع طلبات تسجيل المرضى.'
                  : 'All patient registrations have been verified and enrolled.'}
              </p>
            </Card>
          ) : (
            pendingPatients.map((p) => {
              const prof = p.patientProfile;
              return (
                <Card
                  key={p.uid}
                  data-testid={`pending-patient-card-${p.uid}`}
                  className="p-5 border-blue-200 bg-blue-50/20 hover:border-blue-300 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left: Patient Clinical Breakdown */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-extrabold text-slate-900">
                          🩺 {p.displayName}
                        </h3>
                        <Badge variant="warning">
                          {isAr ? 'بانتظار الاعتماد السريري' : 'Pending Clinical Approval'}
                        </Badge>
                        {prof?.dialysisSchedule && (
                          <Badge variant="info">
                            {prof.dialysisSchedule === 'SMW'
                              ? (isAr ? 'السبت / الإثنين / الأربعاء' : 'Sat / Mon / Wed')
                              : (isAr ? 'الأحد / الثلاثاء / الخميس' : 'Sun / Tue / Thu')}
                          </Badge>
                        )}
                      </div>

                      {/* Clinical Badges Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-400 block text-[11px] font-bold">{isAr ? 'الوزن الجاف:' : 'Dry Weight:'}</span>
                          <span className="font-extrabold text-slate-900 text-sm">{prof?.dryWeightKg || '—'} kg</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-400 block text-[11px] font-bold">{isAr ? 'وصلة الغسيل:' : 'Vascular Access:'}</span>
                          <span className="font-extrabold text-slate-900 text-sm">{prof?.accessType || '—'}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-400 block text-[11px] font-bold">{isAr ? 'رقم الهاتف (الدخول):' : 'Phone / Login:'}</span>
                          <span dir="ltr" className="font-mono font-extrabold text-slate-900 text-sm">{p.phone || p.username}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-400 block text-[11px] font-bold">{isAr ? 'مركز الغسيل:' : 'Dialysis Center:'}</span>
                          <span className="font-bold text-slate-900 text-sm truncate block">{prof?.dialysisCenter || '—'}</span>
                        </div>
                      </div>

                      {/* Viral Isolation & Emergency Contact */}
                      {(prof?.viralMarkers || prof?.emergencyContact) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          {prof?.viralMarkers && (
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700">
                              <span className="font-bold text-slate-500">{isAr ? 'الفيروسات:' : 'Viral:'}</span>
                              <span className={prof.viralMarkers.hcv ? 'text-amber-700 font-bold' : 'text-slate-600'}>HCV: {prof.viralMarkers.hcv ? '+' : '-'}</span>
                              <span>•</span>
                              <span className={prof.viralMarkers.hbv ? 'text-red-700 font-bold' : 'text-slate-600'}>HBV: {prof.viralMarkers.hbv ? '+' : '-'}</span>
                              <span>•</span>
                              <span className={prof.viralMarkers.hiv ? 'text-red-700 font-bold' : 'text-slate-600'}>HIV: {prof.viralMarkers.hiv ? '+' : '-'}</span>
                            </div>
                          )}
                          {prof?.emergencyContact?.name && (
                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700">
                              <span className="font-bold text-slate-500">{isAr ? 'طوارئ:' : 'Emergency:'}</span>
                              <span className="font-semibold">{prof.emergencyContact.name} ({prof.emergencyContact.relationship || (isAr ? 'قريب' : 'Relative')})</span>
                              {prof.emergencyContact.phone && (
                                <span dir="ltr" className="font-mono text-slate-600">{prof.emergencyContact.phone}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Decision Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={() => handleApprove(p)}
                        disabled={isSubmitting}
                        data-testid={`approve-patient-btn-${p.uid}`}
                        className="min-h-[48px] bg-emerald-600 hover:bg-emerald-700 font-bold px-4"
                      >
                        ✓ {isAr ? 'اعتماد وتسجيل المريض' : 'Approve & Enroll Patient'}
                      </Button>

                      <Button
                        type="button"
                        variant="danger"
                        size="md"
                        onClick={() => {
                          setRejectingUser(p);
                          setRejectionReason('');
                        }}
                        disabled={isSubmitting}
                        data-testid={`reject-patient-btn-${p.uid}`}
                        className="min-h-[48px] font-bold px-4"
                      >
                        ✕ {isAr ? 'رفض الطلب' : 'Reject'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

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
