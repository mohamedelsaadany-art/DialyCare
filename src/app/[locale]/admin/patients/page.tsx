'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/lib/auth-context';
import { PatientMedicationManager } from '@/components/admin/PatientMedicationManager';
import { AdminClinicalQuickPanel } from '@/components/admin/AdminClinicalQuickPanel';
import { DialysisSessionModal } from '@/components/DialysisSessionModal';
import { PatientLabResultsModal } from '@/components/admin/PatientLabResultsModal';
import type { Patient, Notification, PatientLabRecord } from '@/lib/types';
import { getDialysisScheduleLabel } from '@/app/[locale]/patient/patient-utils';
import { STORAGE_KEYS, syncFullCloudData } from '@/lib/data-store';
import {
  getPatients,
  updatePatient,
  getPatientMetrics,
  getPatientUsername,
  addNotification,
  getArchivedPatients,
  archivePatients,
  restorePatient,
  calculateArchiveDaysRemaining,
  type PatientMetrics,
} from '../admin-store';
import {
  SearchIcon,
  PlusIcon,
  EyeIcon,
  EditIcon,
  NotificationsIcon,
  DownloadIcon,
  CheckCircleIcon,
  TrashIcon,
} from '../admin-icons';
import { startVisibilityAwarePolling } from '@/lib/visibility-poll';

interface PatientRow extends Patient {
  username: string;
  metrics: PatientMetrics;
  daysRemaining?: number;
}

type SortField = 'fullName' | 'username' | 'dialysisSchedule' | 'ttt' | 'fluid' | 'diet' | 'isActive';
type SortOrder = 'asc' | 'desc';

export default function PatientsListPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const currentUser = user;
  const isSuperAdmin = currentUser?.role === 'admin';
  const isRtl = locale === 'ar';
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [archivedPatients, setArchivedPatients] = useState<PatientRow[]>([]);
  const [viewTab, setViewTab] = useState<'active' | 'archive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // 14-Day Archive Modal & action states
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [targetArchivePatients, setTargetArchivePatients] = useState<PatientRow[]>([]);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);

  // Clinical recorder focus & row-level modal state
  const [activeClinicalPatientId, setActiveClinicalPatientId] = useState<string>('');
  const [medFocusPatientId, setMedFocusPatientId] = useState<string>('');
  const [rowDialysisPatient, setRowDialysisPatient] = useState<PatientRow | null>(null);
  const [rowLabPatient, setRowLabPatient] = useState<PatientRow | null>(null);
  const [rowLabExistingRecord, setRowLabExistingRecord] = useState<PatientLabRecord | null>(null);
  const [clinicalToast, setClinicalToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('fullName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Quick Notification Modal
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [targetPatients, setTargetPatients] = useState<PatientRow[]>([]);
  const [notifTitleEn, setNotifTitleEn] = useState('');
  const [notifTitleAr, setNotifTitleAr] = useState('');
  const [notifMsgEn, setNotifMsgEn] = useState('');
  const [notifMsgAr, setNotifMsgAr] = useState('');
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Quick Edit Patient Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRow | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    fullNameAr: '',
    phone: '',
    dialysisSchedule: 'SMW',
    isActive: true,
  });

  const loadData = React.useCallback(() => {
    try {
      const raw = getPatients();
      const activeOnly = raw.filter((p) => !p.isArchived);
      const rows: PatientRow[] = activeOnly.map((p, idx) => {
        const uname =
          (p as unknown as { username?: string }).username ||
          getPatientUsername(p.id) ||
          `patient${idx + 1}`;
        return {
          ...p,
          username: uname,
          metrics: getPatientMetrics(p.id),
        };
      });
      setPatients(rows);
      setActiveClinicalPatientId((prev) => prev || rows[0]?.id || '');
    } catch (err) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadArchived = React.useCallback(async () => {
    try {
      // 1. Read local storage first
      const local = getArchivedPatients();
      const rows: PatientRow[] = local.map((p, idx) => ({
        ...p,
        username: p.username || getPatientUsername(p.id) || `archived${idx + 1}`,
        metrics: getPatientMetrics(p.id),
        daysRemaining: calculateArchiveDaysRemaining(p.archivedAt, p.archiveExpiresAt),
      }));
      setArchivedPatients(rows);

      // 2. Fetch latest from /api/admin/archive
      const res = await fetch('/api/admin/archive').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && Array.isArray(data.archivedPatients)) {
          const fetchedRows: PatientRow[] = data.archivedPatients.map((p: any, idx: number) => {
            const innerPatient = p.patient || {};
            const pid = p.id || innerPatient.id || p.patientId || `archived${idx + 1}`;
            return {
              ...innerPatient,
              ...p,
              id: pid,
              fullName: p.fullName || innerPatient.fullName || 'Patient',
              fullNameAr: p.fullNameAr || innerPatient.fullNameAr,
              phone: p.phone || innerPatient.phone,
              username: p.username || innerPatient.username || getPatientUsername(pid) || `archived${idx + 1}`,
              dialysisSchedule: innerPatient.dialysisSchedule || p.dialysisSchedule || 'SMW',
              metrics: getPatientMetrics(pid),
              daysRemaining:
                p.daysRemaining ??
                calculateArchiveDaysRemaining(
                  p.archivedAt || innerPatient.archivedAt,
                  p.archiveExpiresAt || p.purgeAt || innerPatient.archiveExpiresAt
                ),
            };
          });
          setArchivedPatients(fetchedRows);
        }
      }
    } catch (err) {
      console.warn('Failed to load archived patients:', err);
    }
  }, []);

  // Cloud synchronization function: bidirectional merge and live refresh
  const handleCloudSync = React.useCallback(async (showToastNotice = false) => {
    setIsSyncing(true);
    try {
      await syncFullCloudData();
      loadData();
      void loadArchived();
      setLastSyncedAt(new Date());
      if (showToastNotice) {
        setClinicalToast(
          isRtl
            ? 'تمت مزامنة جميع حسابات وسجلات المرضى مع السحابة بنجاح ✓'
            : 'All patient records successfully synchronized with cloud ✓'
        );
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setClinicalToast(null), 3500);
      }
    } catch (err) {
      console.warn('Failed cloud sync in patients list:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [loadData, loadArchived, isRtl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
      void loadArchived();
      void handleCloudSync(false);

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const querySearch = params.get('search');
        if (querySearch) {
          setSearchTerm(querySearch);
        }
        const queryPatientId = params.get('patientId');
        if (queryPatientId) {
          setActiveClinicalPatientId(queryPatientId);
          setMedFocusPatientId(queryPatientId);
        }
      }
    }, 0);

    // Regular cloud sync polling (every 12 seconds) so newly registered patients appear in real-time
    const stopPolling = startVisibilityAwarePolling(() => {
      void handleCloudSync(false);
    }, { intervalMs: 12000 });

    const handleSync = () => {
      loadData();
      void loadArchived();
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === STORAGE_KEYS.PATIENTS ||
        e.key === STORAGE_KEYS.AUTH_ACCOUNTS ||
        e.key === STORAGE_KEYS.DIALYSIS_SESSIONS ||
        e.key === STORAGE_KEYS.LAB_RESULTS ||
        e.key === STORAGE_KEYS.PATIENT_MEDICATIONS ||
        e.key === STORAGE_KEYS.ADHERENCE_LOGS ||
        e.key === STORAGE_KEYS.ARCHIVED_PATIENTS
      ) {
        loadData();
        void loadArchived();
      }
    };

    window.addEventListener('dialycare_patient_updated', handleSync);
    window.addEventListener('dialycare_users_updated', handleSync);
    window.addEventListener('dialycare_sessions_updated', handleSync);
    window.addEventListener('dialycare_labs_updated', handleSync);
    window.addEventListener('dialycare_medications_updated', handleSync);
    window.addEventListener('dialycare_archive_updated', handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimeout(timer);
      stopPolling();
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (notifTimerRef.current) {
        clearTimeout(notifTimerRef.current);
      }
      window.removeEventListener('dialycare_patient_updated', handleSync);
      window.removeEventListener('dialycare_users_updated', handleSync);
      window.removeEventListener('dialycare_sessions_updated', handleSync);
      window.removeEventListener('dialycare_labs_updated', handleSync);
      window.removeEventListener('dialycare_medications_updated', handleSync);
      window.removeEventListener('dialycare_archive_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadData, loadArchived, handleCloudSync]);

  // Filter by search term
  const filteredPatients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return patients;
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(term) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(term)) ||
        p.id.toLowerCase().includes(term) ||
        p.username.toLowerCase().includes(term) ||
        (p.phone && p.phone.includes(term))
    );
  }, [patients, searchTerm]);

  // Sort patients
  const sortedPatients = useMemo(() => {
    return [...filteredPatients].sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortField) {
        case 'fullName':
          valA = a.fullName.toLowerCase();
          valB = b.fullName.toLowerCase();
          break;
        case 'username':
          valA = a.username.toLowerCase();
          valB = b.username.toLowerCase();
          break;
        case 'dialysisSchedule':
          valA = a.dialysisSchedule;
          valB = b.dialysisSchedule;
          break;
        case 'ttt':
          valA = a.metrics.tttAdherence;
          valB = b.metrics.tttAdherence;
          break;
        case 'fluid':
          valA = a.metrics.fluidAdherence;
          valB = b.metrics.fluidAdherence;
          break;
        case 'diet':
          valA = a.metrics.dietAdherence;
          valB = b.metrics.dietAdherence;
          break;
        case 'isActive':
          valA = a.isActive ? 1 : 0;
          valB = b.isActive ? 1 : 0;
          break;
        default:
          valA = a.fullName;
          valB = b.fullName;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPatients, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Bulk selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(sortedPatients.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const filteredArchivedPatients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return archivedPatients;
    return archivedPatients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(term) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(term)) ||
        p.id.toLowerCase().includes(term) ||
        p.username.toLowerCase().includes(term) ||
        (p.phone && p.phone.includes(term))
    );
  }, [archivedPatients, searchTerm]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = new Set(selectedIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedIds(updated);
  };

  // Open single archive modal
  const handleOpenSingleArchiveModal = (patient: PatientRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetArchivePatients([patient]);
    setArchiveModalOpen(true);
  };

  // Open bulk archive modal
  const handleOpenBulkArchiveModal = () => {
    const selected = patients.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    setTargetArchivePatients(selected);
    setArchiveModalOpen(true);
  };

  // Confirm Archive Action (calls /api/admin/archive)
  const handleConfirmArchive = async () => {
    if (targetArchivePatients.length === 0) return;
    setIsArchiving(true);
    const targetIds = targetArchivePatients.map((p) => p.id);
    try {
      // 1. Call /api/admin/archive
      await fetch('/api/admin/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientIds: targetIds }),
      }).catch((err) => console.warn('Archive API fetch failed:', err));

      // 2. Local fallback & update
      archivePatients(targetIds, user?.displayName || user?.username || 'Super Admin');

      // 3. Clear modal & selections
      setArchiveModalOpen(false);
      setSelectedIds(new Set());
      setTargetArchivePatients([]);

      // 4. Reload lists
      loadData();
      await loadArchived();

      // 5. Toast
      const count = targetIds.length;
      setClinicalToast(
        isRtl
          ? count > 1
            ? `تم نقل ${count} مرضى إلى الأرشيف وسلة المهملات بنجاح (مهلة 14 يوماً)`
            : `تم نقل المريض إلى الأرشيف وسلة المهملات بنجاح (مهلة 14 يوماً)`
          : count > 1
          ? `${count} patients moved to 14-day temporary archive`
          : `Patient moved to 14-day temporary archive`
      );
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setClinicalToast(null), 4000);
    } catch (err) {
      console.error('Failed to archive patients:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  // Restore Patient Action (calls /api/admin/restore)
  const handleRestorePatient = async (patientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanId = (patientId || '').trim();
    if (!cleanId) return;
    setIsRestoringId(cleanId);
    try {
      // 1. Call /api/admin/restore
      await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: cleanId, uid: cleanId }),
      }).catch((err) => console.warn('Restore API fetch failed:', err));

      // 2. Local fallback & update
      restorePatient(cleanId);

      // 3. Reload lists
      loadData();
      await loadArchived();

      // 4. Toast
      setClinicalToast(
        isRtl
          ? 'تمت استعادة المريض بنجاح وإعادته إلى قائمة المرضى النشطين ✓'
          : 'Patient successfully restored to active roster ✓'
      );
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setClinicalToast(null), 4000);
    } catch (err) {
      console.error('Failed to restore patient:', err);
    } finally {
      setIsRestoringId(null);
    }
  };

  // Bulk Send Notification
  const handleOpenBulkNotification = () => {
    const selected = patients.filter((p) => selectedIds.has(p.id));
    setTargetPatients(selected);
    setNotifTitleEn('Clinical Update');
    setNotifTitleAr('تنبيه طبي عاجل');
    setNotifMsgEn('Please adhere to your fluid quota and remember your evening binders.');
    setNotifMsgAr('يرجى الالتزام بحصة السوائل المقررة وتناول مثبتات الفوسفات المسائية.');
    setNotifSuccess(false);
    setNotifModalOpen(true);
  };

  // Single Send Notification
  const handleOpenSingleNotification = (patient: PatientRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetPatients([patient]);
    setNotifTitleEn(`Clinical Reminder for ${patient.fullName}`);
    setNotifTitleAr(`تذكير طبي للمريض ${patient.fullNameAr || patient.fullName}`);
    setNotifMsgEn('Please log your afternoon fluids and check your scheduled medication.');
    setNotifMsgAr('يرجى تسجيل سوائل الظهيرة والتأكد من تناول جرعات الأدوية المجدولة.');
    setNotifSuccess(false);
    setNotifModalOpen(true);
  };

  // Submit Notification
  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitleEn.trim() || !notifMsgEn.trim()) return;

    const newNotif: Notification = {
      id: `notif_${Date.now()}`,
      senderId: 'admin-1',
      type: targetPatients.length > 1 ? 'group' : 'individual',
      recipientIds: targetPatients.map((p) => p.id),
      titleEn: notifTitleEn.trim(),
      titleAr: notifTitleAr.trim() || notifTitleEn.trim(),
      messageEn: notifMsgEn.trim(),
      messageAr: notifMsgAr.trim() || notifMsgEn.trim(),
      sentAt: new Date().toISOString(),
      status: 'sent',
    };

    addNotification(newNotif);
    setNotifSuccess(true);
    if (notifTimerRef.current) {
      clearTimeout(notifTimerRef.current);
    }
    notifTimerRef.current = setTimeout(() => {
      setNotifModalOpen(false);
      setNotifSuccess(false);
      setSelectedIds(new Set());
      notifTimerRef.current = null;
    }, 1500);
  };

  // Bulk Export to CSV
  const handleBulkExportCSV = () => {
    const listToExport = selectedIds.size > 0
      ? patients.filter((p) => selectedIds.has(p.id))
      : patients;

    const headers = ['ID', 'Name', 'Arabic Name', 'Username', 'Schedule', 'Phone', 'TTT %', 'Fluid %', 'Diet %', 'Overall %', 'Status'];
    const rows = listToExport.map((p) => [
      p.id,
      `"${(p.fullName || '').replace(/"/g, '""')}"`,
      `"${(p.fullNameAr || p.fullName || '').replace(/"/g, '""')}"`,
      `"${(p.username || '').replace(/"/g, '""')}"`,
      p.dialysisSchedule,
      `"\t${p.phone || ''}"`,
      p.metrics.tttAdherence,
      p.metrics.fluidAdherence,
      p.metrics.dietAdherence,
      p.metrics.overallAdherence,
      p.isActive ? 'Active' : 'Inactive',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Patients_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Quick Edit Patient
  const handleOpenEdit = (patient: PatientRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPatient(patient);
    setEditForm({
      fullName: patient.fullName,
      fullNameAr: patient.fullNameAr || '',
      phone: patient.phone || '',
      dialysisSchedule: (patient.dialysisSchedule === 'TTS' || patient.dialysisSchedule === 'STT') ? 'STT' : 'SMW',
      isActive: patient.isActive,
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPatient) return;

    updatePatient(editingPatient.id, {
      fullName: editForm.fullName.trim(),
      fullNameAr: editForm.fullNameAr.trim(),
      phone: editForm.phone.trim(),
      dialysisSchedule: editForm.dialysisSchedule,
      isActive: editForm.isActive,
    });

    setEditModalOpen(false);
    loadData();
  };

  const getAdherenceBadge = (rate: number) => {
    if (rate >= 70) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {rate}%
        </span>
      );
    }
    if (rate >= 50) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          {rate}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-red-50 text-red-700 border border-red-200">
        {rate}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading patient records...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {tAdmin('patientList') || (isRtl ? 'سجل المرضى' : 'Patient Directory')}
            </h1>
            <Badge variant="neutral" size="sm">
              {patients.length} {isRtl ? 'مريض' : 'Patients'}
            </Badge>
            {lastSyncedAt && (
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                {isRtl
                  ? `(محدّث سحابياً: ${lastSyncedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`
                  : `(Synced: ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isRtl
              ? 'إدارة الحسابات وجداول الغسيل ومتابعة معدلات الالتزام'
              : 'Manage patient profiles, dialysis schedules, and clinical compliance'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => handleCloudSync(true)}
            isLoading={isSyncing}
            className="min-h-[48px] border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 text-[#1e6bb8] font-bold"
            title={isRtl ? 'مزامنة وتحديث فوري مع الخادم السحابي' : 'Instant sync with cloud server'}
          >
            <span>🔄</span>
            <span>{isRtl ? 'مزامنة السحابة' : 'Cloud Sync'}</span>
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              const el = document.getElementById('admin-clinical-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            data-testid="admin-clinical-recorder-header-btn"
            className="min-h-[48px] bg-[#1e6bb8] hover:bg-blue-700"
            title={isRtl ? 'تسجيل جلسات الغسيل ونتائج التحاليل' : 'Record Dialysis & Lab Results'}
          >
            <span>🩺🔬</span>
            <span>{isRtl ? 'تسجيل الغسيل والتحاليل' : 'Record Dialysis & Labs'}</span>
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => {
              const el = document.getElementById('admin-medications-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            data-testid="admin-prescribe-medications-header-btn"
            className="min-h-[48px]"
            title={isRtl ? 'الانتقال إلى قسم تخصيص الأدوية' : 'Prescribe Medications'}
          >
            <span>💊</span>
            <span>{isRtl ? 'تخصيص الأدوية' : 'Prescribe Medications'}</span>
          </Button>

          <Link href={`/${locale}/admin/patients/new`}>
            <Button
              variant="outline"
              size="md"
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="min-h-[48px]"
            >
              {tAdmin('addPatient') || (isRtl ? 'إضافة مريض جديد' : 'Register Patient')}
            </Button>
          </Link>
        </div>
      </div>

      {clinicalToast && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm flex items-center justify-between gap-2"
        >
          <span>✓ {clinicalToast}</span>
          <button
            type="button"
            onClick={() => setClinicalToast(null)}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg hover:bg-emerald-700"
            aria-label={isRtl ? 'إغلاق الإشعار' : 'Dismiss'}
          >
            ✕
          </button>
        </div>
      )}

      {/* Super Admin Roster View Tabs: Active vs 14-Day Archive */}
      {isSuperAdmin && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => {
              setViewTab('active');
              setSelectedIds(new Set());
            }}
            data-testid="tab-active-patients"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              viewTab === 'active'
                ? 'bg-[#1e6bb8] text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>👥 {tAdmin('activePatientsTab') || (isRtl ? 'المرضى النشطون' : 'Active Patients')}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                viewTab === 'active' ? 'bg-white text-[#1e6bb8]' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {patients.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewTab('archive');
              setSelectedIds(new Set());
              void loadArchived();
            }}
            data-testid="tab-archive-patients"
            className={`min-h-[48px] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              viewTab === 'archive'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-red-50 hover:text-red-700 border border-slate-200'
            }`}
          >
            <span>🗑️ {tAdmin('archivedPatientsTab') || (isRtl ? 'الأرشيف وسلة المهملات (14 يوماً)' : 'Archive & Trash (14 Days)')}</span>
            <span
              className={`px-2 py-0.5 text-xs font-black rounded-full ${
                viewTab === 'archive' ? 'bg-white text-red-700' : 'bg-red-100 text-red-800'
              }`}
            >
              {archivedPatients.length}
            </span>
          </button>
        </div>
      )}

      {/* Search & Bulk Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              viewTab === 'archive'
                ? isRtl ? 'بحث في أرشيف المرضى وسلة المهملات...' : 'Search archived patient records...'
                : isRtl ? 'بحث بالاسم، اسم المستخدم، الهاتف...' : 'Filter by name, username, or phone...'
            }
            leftIcon={<SearchIcon className="w-4 h-4" />}
          />
        </div>

        {/* Bulk Action Controls (Super Admin Bulk Archive & Notifications) */}
        {viewTab === 'active' && selectedIds.size > 0 && (
          <div
            data-testid="bulk-action-bar"
            className="sticky top-2 z-30 flex flex-wrap items-center gap-2 p-2.5 bg-blue-50/95 backdrop-blur-sm border-2 border-[#1e6bb8]/30 rounded-2xl shadow-lg animate-in slide-in-from-top-2 duration-200"
          >
            <span className="text-xs font-bold text-[#1e6bb8] px-2">
              {selectedIds.size} {isRtl ? 'مريض محدد' : 'selected'}
            </span>

            {isSuperAdmin && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleOpenBulkArchiveModal}
                leftIcon={<TrashIcon className="w-3.5 h-3.5" />}
                className="min-h-[48px] font-bold px-4 shadow-sm"
                data-testid="bulk-delete-patients-btn"
              >
                {tAdmin('deleteSelectedPatients') || (isRtl ? 'حذف المرضى المحددين' : 'Delete Selected Patients')} ({selectedIds.size})
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenBulkNotification}
              leftIcon={<NotificationsIcon className="w-3.5 h-3.5" />}
              className="min-h-[48px]"
            >
              {isRtl ? 'إرسال إشعار' : 'Notify'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkExportCSV}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="min-h-[48px]"
            >
              {isRtl ? 'تصدير' : 'Export'}
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-[48px] px-3 text-xs text-slate-500 hover:text-slate-800 underline flex items-center cursor-pointer"
            >
              {isRtl ? 'إلغاء' : 'Clear'}
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: 14-Day Temporary Archive View */}
      {viewTab === 'archive' && isSuperAdmin ? (
        <Card className="overflow-hidden p-0" data-testid="archived-patients-table-card">
          <div className="p-4 bg-amber-50/70 border-b border-amber-200 text-xs sm:text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗑️</span>
              <div>
                <span className="font-extrabold block">
                  {tAdmin('archivedPatientsTab') || (isRtl ? 'الأرشيف وسلة المهملات (14 يوماً)' : 'Archive & Trash Bin (14 Days)')}
                </span>
                <span className="text-slate-600 text-xs">
                  {tAdmin('archiveTabSubtitle') || (isRtl ? 'قائمة المرضى المحذوفين مؤقتاً قبل الحذف النهائي الدائم' : 'Temporarily archived patients awaiting permanent purge')}
                </span>
              </div>
            </div>
            <Badge variant="warning" size="sm">
              {archivedPatients.length} {isRtl ? 'مريض بالأرشيف' : 'Archived'}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
                  <th className="py-3.5 px-3 text-start">{isRtl ? 'الاسم' : 'Name'}</th>
                  <th className="py-3.5 px-2.5 text-start">{isRtl ? 'اسم المستخدم / الهاتف' : 'Username / Phone'}</th>
                  <th className="py-3.5 px-2.5 text-start">{isRtl ? 'جدول الغسيل' : 'Schedule'}</th>
                  <th className="py-3.5 px-2.5 text-center">{tAdmin('archivedDate') || (isRtl ? 'تاريخ النقل للأرشيف' : 'Archived On')}</th>
                  <th className="py-3.5 px-2.5 text-center">{isRtl ? 'المهلة المتبقية' : 'Days Remaining'}</th>
                  <th className="py-3.5 px-3 text-end">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredArchivedPatients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <p className="text-sm font-medium">
                        {searchTerm
                          ? (isRtl ? 'لم يتم العثور على أي مريض مطابق في الأرشيف' : 'No archived patients matching search')
                          : (tAdmin('noArchivedPatients') || (isRtl ? 'سلة المهملات والأرشيف فارغة حالياً' : 'Archive and trash bin are currently empty'))}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredArchivedPatients.map((patient) => {
                    const daysRemaining =
                      patient.daysRemaining ??
                      calculateArchiveDaysRemaining(patient.archivedAt, patient.archiveExpiresAt);
                    const isUrgent = daysRemaining <= 3;

                    return (
                      <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-3 font-semibold text-slate-900">
                          <div className="flex flex-col">
                            <span>{patient.fullName}</span>
                            {patient.fullNameAr && (
                              <span className="text-xs font-normal text-slate-400">{patient.fullNameAr}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-2.5 text-slate-600 text-xs font-mono">
                          <div className="flex flex-col">
                            <span>{patient.username}</span>
                            {patient.phone && (
                              <span className="text-[11px] text-slate-400" dir="ltr">{patient.phone}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-2.5">
                          <Badge variant="neutral" size="sm">
                            {getDialysisScheduleLabel(patient.dialysisSchedule, isRtl)}
                          </Badge>
                        </td>

                        <td className="py-3.5 px-2.5 text-center text-xs text-slate-600 font-mono">
                          {patient.archivedAt
                            ? new Date(patient.archivedAt).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', { dateStyle: 'medium' })
                            : '—'}
                        </td>

                        <td className="py-3.5 px-2.5 text-center">
                          <span
                            data-testid={`badge-days-remaining-${patient.id}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border ${
                              isUrgent
                                ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                                : daysRemaining <= 7
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-[#1e6bb8] border-blue-200'
                            }`}
                          >
                            <span aria-hidden="true">⏳</span>
                            <span>
                              {isRtl
                                ? `متبقي ${daysRemaining} يوماً قبل الحذف النهائي`
                                : `${daysRemaining} days remaining before permanent purge`}
                            </span>
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-end">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => handleRestorePatient(patient.id, e)}
                            isLoading={isRestoringId === patient.id}
                            data-testid={`restore-patient-btn-${patient.id}`}
                            className="min-h-[48px] px-4 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            title={isRtl ? 'استعادة المريض وإعادته للملفات النشطة' : 'Restore patient to active roster'}
                          >
                            <span>↩️</span>
                            <span>{tAdmin('restorePatient') || (isRtl ? 'استعادة المريض' : 'Restore')}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {isRtl
                ? `عرض ${filteredArchivedPatients.length} من أصل ${archivedPatients.length} مريض مؤرشف`
                : `Showing ${filteredArchivedPatients.length} of ${archivedPatients.length} archived patients`}
            </span>
          </div>
        </Card>
      ) : (
        /* VIEW 2: Active Patients Table Card */
        <Card className="overflow-hidden p-0" data-testid="active-patients-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
                  {/* Super Admin only: checkbox column */}
                  {isSuperAdmin && (
                    <th className="py-1 px-1 text-center w-12 min-w-[48px]">
                      <label className="inline-flex items-center justify-center min-w-[48px] min-h-[48px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === sortedPatients.length}
                          onChange={handleSelectAll}
                          className="w-4 h-4 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8] cursor-pointer"
                          aria-label={isRtl ? 'تحديد كل المرضى' : 'Select all patients'}
                        />
                      </label>
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('fullName')}
                    className="py-3.5 px-2.5 text-start cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center gap-1">
                      <span>{isRtl ? 'الاسم' : 'Name'}</span>
                      {sortField === 'fullName' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('username')}
                    className="py-3.5 px-2 text-start cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center gap-1">
                      <span>{isRtl ? 'اسم المستخدم' : 'Username'}</span>
                      {sortField === 'username' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('dialysisSchedule')}
                    className="py-3.5 px-2 text-start cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center gap-1">
                      <span>{isRtl ? 'جدول الغسيل' : 'Schedule'}</span>
                      {sortField === 'dialysisSchedule' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('ttt')}
                    className="py-3.5 px-2 text-center cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{isRtl ? 'الأدوية' : 'TTT %'}</span>
                      {sortField === 'ttt' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('fluid')}
                    className="py-3.5 px-2 text-center cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{isRtl ? 'السوائل' : 'Fluid %'}</span>
                      {sortField === 'fluid' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('diet')}
                    className="py-3.5 px-2 text-center cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{isRtl ? 'الغذاء' : 'Diet %'}</span>
                      {sortField === 'diet' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('isActive')}
                    className="py-3.5 px-2 text-center cursor-pointer hover:text-slate-800"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{isRtl ? 'الحالة' : 'Status'}</span>
                      {sortField === 'isActive' && (
                        <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th className="py-3.5 px-2.5 text-end">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPatients.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 9 : 8} className="py-12 text-center text-slate-400">
                      <p className="text-sm font-medium">
                        {isRtl ? 'لم يتم العثور على أي مريض مطابق' : 'No patients found matching your search.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedPatients.map((patient) => {
                    const isSelected = selectedIds.has(patient.id);

                    return (
                      <tr
                        key={patient.id}
                        onClick={() => router.push(`/${locale}/admin/patients/${patient.id}`)}
                        className={`
                          hover:bg-slate-50 transition-colors cursor-pointer
                          ${isSelected ? 'bg-blue-50/50' : ''}
                        `}
                      >
                        {/* Super Admin only: row checkbox */}
                        {isSuperAdmin && (
                          <td className="py-1 px-1 text-center w-12 min-w-[48px]" onClick={(e) => handleToggleSelect(patient.id, e)}>
                            <label
                              className="inline-flex items-center justify-center min-w-[48px] min-h-[48px] cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const updated = new Set(selectedIds);
                                  if (updated.has(patient.id)) {
                                    updated.delete(patient.id);
                                  } else {
                                    updated.add(patient.id);
                                  }
                                  setSelectedIds(updated);
                                }}
                                className="w-4 h-4 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8] cursor-pointer"
                                aria-label={isRtl ? `تحديد المريض ${patient.fullName}` : `Select ${patient.fullName}`}
                              />
                            </label>
                          </td>
                        )}

                        <td className="py-3 px-2.5 font-semibold text-slate-900">
                          <div className="flex flex-col">
                            <span className="hover:text-[#1e6bb8] transition-colors">
                              {patient.fullName}
                            </span>
                            {patient.fullNameAr && (
                              <span className="text-xs font-normal text-slate-400">
                                {patient.fullNameAr}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-2 text-slate-600 font-mono text-xs">
                          {patient.username}
                        </td>

                        <td className="py-3 px-2">
                          <Badge variant="neutral" size="sm">
                            {getDialysisScheduleLabel(patient.dialysisSchedule, isRtl)}
                          </Badge>
                        </td>

                        <td className="py-3 px-2 text-center">
                          {getAdherenceBadge(patient.metrics.tttAdherence)}
                        </td>

                        <td className="py-3 px-2 text-center">
                          {getAdherenceBadge(patient.metrics.fluidAdherence)}
                        </td>

                        <td className="py-3 px-2 text-center">
                          {getAdherenceBadge(patient.metrics.dietAdherence)}
                        </td>

                        <td className="py-3 px-2 text-center">
                          <Badge
                            variant={patient.isActive ? 'success' : 'neutral'}
                            size="sm"
                            dot
                          >
                            {patient.isActive
                              ? isRtl ? 'نشط' : 'Active'
                              : isRtl ? 'غير نشط' : 'Inactive'}
                          </Badge>
                        </td>

                        <td className="py-3 px-2.5 text-end">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveClinicalPatientId(patient.id);
                                setRowDialysisPatient(patient);
                              }}
                              data-testid={`row-record-dialysis-${patient.id}`}
                              aria-label={isRtl ? `تسجيل جلسة غسيل للمريض ${patient.fullNameAr || patient.fullName}` : `Record Dialysis Session for ${patient.fullName}`}
                              title={isRtl ? 'تسجيل جلسة غسيل للمريض' : 'Record Dialysis Session'}
                              className="min-w-[48px] min-h-[48px] px-1.5 flex items-center justify-center gap-1 rounded-xl bg-blue-50 text-[#1e6bb8] hover:bg-[#1e6bb8] hover:text-white border border-blue-200 font-bold text-xs transition-colors cursor-pointer"
                            >
                              <span aria-hidden="true">🩺</span>
                              <span className="hidden 2xl:inline">{isRtl ? 'غسيل' : 'Dialysis'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveClinicalPatientId(patient.id);
                                setRowLabExistingRecord(null);
                                setRowLabPatient(patient);
                              }}
                              data-testid={`row-record-labs-${patient.id}`}
                              aria-label={isRtl ? `تسجيل تحاليل المريض ${patient.fullNameAr || patient.fullName}` : `Record Lab Results for ${patient.fullName}`}
                              title={isRtl ? 'تسجيل التحاليل المخبرية (12 تحليل)' : 'Record Lab Results (12 Tests)'}
                              className="min-w-[48px] min-h-[48px] px-1.5 flex items-center justify-center gap-1 rounded-xl bg-teal-50 text-teal-800 hover:bg-teal-600 hover:text-white border border-teal-200 font-bold text-xs transition-colors cursor-pointer"
                            >
                              <span aria-hidden="true">🔬</span>
                              <span className="hidden 2xl:inline">{isRtl ? 'تحاليل' : 'Labs'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => router.push(`/${locale}/admin/patients/${patient.id}`)}
                              title={isRtl ? 'عرض التفاصيل' : 'View Patient Details'}
                              aria-label={isRtl ? 'عرض التفاصيل' : 'View Patient Details'}
                              className="min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-500 hover:text-[#1e6bb8] hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleOpenEdit(patient, e)}
                              title={isRtl ? 'تعديل البيانات' : 'Edit Profile'}
                              aria-label={isRtl ? 'تعديل البيانات' : 'Edit Profile'}
                              className="min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <EditIcon className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleOpenSingleNotification(patient, e)}
                              title={isRtl ? 'إرسال إشعار' : 'Send Notification'}
                              aria-label={isRtl ? 'إرسال إشعار' : 'Send Notification'}
                              className="min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <NotificationsIcon className="w-4 h-4" />
                            </button>

                            {/* Super Admin ONLY: individual trash can icon button */}
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenSingleArchiveModal(patient, e)}
                                title={isRtl ? 'نقل المريض إلى الأرشيف وسلة المهملات' : 'Move patient to 14-day archive'}
                                aria-label={isRtl ? `نقل المريض ${patient.fullNameAr || patient.fullName} إلى الأرشيف` : `Archive ${patient.fullName}`}
                                data-testid={`row-archive-patient-${patient.id}`}
                                className="min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer info */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {isRtl
                ? `عرض ${sortedPatients.length} من أصل ${patients.length} مريض نشط`
                : `Showing ${sortedPatients.length} of ${patients.length} active patients`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkExportCSV}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="min-h-[48px]"
            >
              {isRtl ? 'تصدير السجل كاملاً (CSV)' : 'Export Full Roster (CSV)'}
            </Button>
          </div>
        </Card>
      )}

      {/* Doctor Clinical Quick Recorder + Embedded Dialysis History & Lab Results (Doctor-Only Labs & Dialysis) */}
      <AdminClinicalQuickPanel
        id="admin-clinical-section"
        selectedPatientId={activeClinicalPatientId}
        onPatientChange={(pid) => {
          setActiveClinicalPatientId(pid);
          if (medFocusPatientId) {
            setMedFocusPatientId(pid);
          }
        }}
        onDataUpdated={loadData}
        onOpenMedications={(pid) => {
          setMedFocusPatientId(pid);
          document.getElementById('admin-medications-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
        showEmbeddedViews={true}
      />

      {/* Administrative Medication Assignment Section (R1) */}
      <section id="admin-medications-section" className="space-y-3 pt-2">
        {medFocusPatientId && (
          <div
            data-testid="med-focus-banner"
            className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-950">
              <span>💊</span>
              <span>
                {(() => {
                  const focused = patients.find((p) => p.id === medFocusPatientId);
                  const fName = focused
                    ? isRtl
                      ? focused.fullNameAr || focused.fullName
                      : focused.fullName
                    : medFocusPatientId;
                  return isRtl
                    ? `أدوية المريض المحدد: ${fName}`
                    : `Focused Patient Medications: ${fName}`;
                })()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMedFocusPatientId('')}
              data-testid="med-focus-reset-btn"
              className="min-h-[48px] px-4 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs sm:text-sm cursor-pointer transition-colors"
            >
              {isRtl ? 'إظهار قائمة كل المرضى' : 'Show All-Patients Dropdown'}
            </button>
          </div>
        )}
        <PatientMedicationManager
          key={medFocusPatientId || 'default'}
          patientId={medFocusPatientId || undefined}
        />
      </section>

      {/* Notification Modal */}
      <Modal
        isOpen={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <NotificationsIcon className="w-5 h-5 text-[#1e6bb8]" />
            <span>
              {isRtl
                ? `إرسال إشعار (${targetPatients.length} مريض)`
                : `Dispatch Notification (${targetPatients.length} recipient${targetPatients.length > 1 ? 's' : ''})`}
            </span>
          </div>
        }
      >
        {notifSuccess ? (
          <div className="py-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {isRtl ? 'تم إرسال الإشعار بنجاح!' : 'Notification Sent Successfully!'}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {isRtl ? 'تم حفظ الرسالة في سجل الإشعارات' : 'Dispatched and saved in system log.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendNotification} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">
                {isRtl ? 'المستلمون: ' : 'Recipients: '}
              </span>
              <span className="text-slate-600">
                {targetPatients.map((p) => p.fullName).join(', ')}
              </span>
            </div>

            <Input
              label={isRtl ? 'العنوان (إنجليزي)' : 'Subject / Title (EN)'}
              value={notifTitleEn}
              onChange={(e) => setNotifTitleEn(e.target.value)}
              required
            />

            <Input
              label={isRtl ? 'العنوان (عربي)' : 'Subject / Title (AR)'}
              value={notifTitleAr}
              onChange={(e) => setNotifTitleAr(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص الرسالة (إنجليزي)' : 'Message Content (EN)'}
              </label>
              <textarea
                value={notifMsgEn}
                onChange={(e) => setNotifMsgEn(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص الرسالة (عربي)' : 'Message Content (AR)'}
              </label>
              <textarea
                value={notifMsgAr}
                onChange={(e) => setNotifMsgAr(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={() => setNotifModalOpen(false)}>
                {tCommon('cancel') || 'Cancel'}
              </Button>
              <Button variant="primary" size="sm" type="submit">
                {isRtl ? 'إرسال الآن' : 'Send Notification'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 2-Step Confirmation Modal: 14-Day Temporary Archive (Calls /api/admin/archive) */}
      <Modal
        isOpen={archiveModalOpen}
        onClose={() => !isArchiving && setArchiveModalOpen(false)}
        maxWidth="md"
        title={
          <div className="flex items-center gap-2 text-red-600 font-extrabold text-base sm:text-lg">
            <span className="text-xl">⚠️</span>
            <span>
              {tAdmin('confirmArchiveTitle') || (isRtl ? 'تأكيد نقل المريض إلى الأرشيف' : 'Confirm Archive & Deletion')}
            </span>
          </div>
        }
      >
        <div className="space-y-4 pt-1" data-testid="archive-confirmation-modal">
          {/* Explicit Clinical Warning Notice */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs sm:text-sm text-red-900 leading-relaxed font-semibold">
            <div className="flex items-start gap-2.5">
              <span className="text-lg leading-none shrink-0 mt-0.5">🛡️</span>
              <p>
                {tAdmin('archiveClinicalWarning') ||
                  (isRtl
                    ? 'سيتم إخفاء بيانات المريض فوراً عن جميع الأطباء والتمريض، وستبقى في الأرشيف المؤقت لمدة 14 يوماً قبل الحذف النهائي الدائم. إذا أراد المريض العودة، يمكنه التسجيل ومراسلة الإدارة لتفعيل حسابه.'
                    : 'Patient clinical data will be hidden immediately from all doctors and nurses, and will remain in temporary archive for 14 days before permanent deletion. If the patient wishes to return, they can re-register and contact administration to reactivate their account.')}
              </p>
            </div>
          </div>

          {/* List of Targeted Patients */}
          <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>
                {tAdmin('selectedPatientsList') || (isRtl ? 'قائمة المرضى المحددين للحذف المؤقت:' : 'Selected patients for temporary archive:')}
              </span>
              <Badge variant="warning" size="sm">
                {targetArchivePatients.length} {isRtl ? 'مريض' : 'Patients'}
              </Badge>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 pr-1">
              {targetArchivePatients.map((p) => (
                <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="font-extrabold text-slate-900 text-sm">
                      {isRtl ? p.fullNameAr || p.fullName : p.fullName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      ID: {p.id} • {p.username}
                    </span>
                  </div>
                  {p.phone && (
                    <span className="font-mono text-slate-600 font-bold bg-white px-2 py-1 rounded-lg border border-slate-200" dir="ltr">
                      {p.phone}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setArchiveModalOpen(false)}
              disabled={isArchiving}
              className="min-h-[48px] px-4 font-bold"
            >
              {tCommon('cancel') || (isRtl ? 'إلغاء' : 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleConfirmArchive}
              isLoading={isArchiving}
              data-testid="confirm-archive-btn"
              className="min-h-[48px] px-5 font-black bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              <span>{tAdmin('confirmArchiveBtn') || (isRtl ? 'تأكيد النقل للأرشيف' : 'Confirm Archive')}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Patient Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={isRtl ? 'تعديل بيانات المريض' : 'Edit Patient Profile'}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label={isRtl ? 'الاسم بالكامل (إنجليزي)' : 'Full Name (English)'}
            value={editForm.fullName}
            onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
            required
          />

          <Input
            label={isRtl ? 'الاسم بالكامل (عربي)' : 'Full Name (Arabic)'}
            value={editForm.fullNameAr}
            onChange={(e) => setEditForm({ ...editForm, fullNameAr: e.target.value })}
            required
          />

          <Input
            label={isRtl ? 'رقم الهاتف' : 'Phone Number'}
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">
              {isRtl ? 'أيام جلسات الغسيل' : 'Dialysis Schedule'}
            </label>
            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              {[
                {
                  code: 'SMW',
                  labelAr: 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)',
                  labelEn: 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)',
                },
                {
                  code: 'STT',
                  labelAr: 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)',
                  labelEn: 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)',
                },
              ].map((sch) => (
                <label key={sch.code} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="editSchedule"
                    value={sch.code}
                    checked={
                      editForm.dialysisSchedule === sch.code ||
                      (sch.code === 'SMW' && (editForm.dialysisSchedule === 'MWF' || editForm.dialysisSchedule === 'Custom')) ||
                      (sch.code === 'STT' && editForm.dialysisSchedule === 'TTS')
                    }
                    onChange={() => setEditForm({ ...editForm, dialysisSchedule: sch.code })}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>{isRtl ? sch.labelAr : sch.labelEn}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="patientActiveToggle"
              checked={editForm.isActive}
              onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              className="w-4 h-4 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8]"
            />
            <label htmlFor="patientActiveToggle" className="text-sm font-semibold text-slate-700 select-none cursor-pointer">
              {isRtl ? 'حساب المريض نشط بالوحدة' : 'Patient account is currently active'}
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {tCommon('save') || 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Row Quick Action: Dialysis Session Modal */}
      {rowDialysisPatient && (
        <DialysisSessionModal
          isOpen={true}
          onClose={() => setRowDialysisPatient(null)}
          patientId={rowDialysisPatient.id}
          patientName={isRtl ? rowDialysisPatient.fullNameAr || rowDialysisPatient.fullName : rowDialysisPatient.fullName}
          recordedBy={user?.displayName || user?.username || 'doctor'}
          onSessionRecorded={() => {
            const pName = isRtl
              ? rowDialysisPatient.fullNameAr || rowDialysisPatient.fullName
              : rowDialysisPatient.fullName;
            loadData();
            setClinicalToast(
              isRtl
                ? `تم تسجيل جلسة الغسيل للمريض ${pName} بنجاح`
                : `Dialysis session recorded for ${pName}`
            );
            if (toastTimerRef.current) {
              clearTimeout(toastTimerRef.current);
            }
            toastTimerRef.current = setTimeout(() => {
              setClinicalToast(null);
              toastTimerRef.current = null;
            }, 4500);
          }}
        />
      )}

      {/* Row Quick Action: Doctor Lab Results Modal */}
      {rowLabPatient && (
        <PatientLabResultsModal
          isOpen={true}
          onClose={() => {
            setRowLabPatient(null);
            setRowLabExistingRecord(null);
          }}
          patientId={rowLabPatient.id}
          patientName={isRtl ? rowLabPatient.fullNameAr || rowLabPatient.fullName : rowLabPatient.fullName}
          recordedBy={user?.displayName || user?.username || 'doctor'}
          existingRecord={rowLabExistingRecord}
          onSaved={() => {
            const pName = isRtl
              ? rowLabPatient.fullNameAr || rowLabPatient.fullName
              : rowLabPatient.fullName;
            loadData();
            setClinicalToast(
              isRtl
                ? `تم حفظ التحاليل المخبرية للمريض ${pName} بنجاح`
                : `Lab results saved for ${pName}`
            );
            if (toastTimerRef.current) {
              clearTimeout(toastTimerRef.current);
            }
            toastTimerRef.current = setTimeout(() => {
              setClinicalToast(null);
              toastTimerRef.current = null;
            }, 4500);
          }}
        />
      )}
    </div>
  );
}
