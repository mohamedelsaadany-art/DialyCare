'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { PatientMedicationManager } from '@/components/admin/PatientMedicationManager';
import type { Patient, Notification } from '@/lib/types';
import {
  getPatients,
  updatePatient,
  getPatientMetrics,
  getPatientUsername,
  addNotification,
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
} from '../admin-icons';

interface PatientRow extends Patient {
  username: string;
  metrics: PatientMetrics;
}

type SortField = 'fullName' | 'username' | 'dialysisSchedule' | 'ttt' | 'fluid' | 'diet' | 'isActive';
type SortOrder = 'asc' | 'desc';

export default function PatientsListPage() {
  const locale = useLocale();
  const router = useRouter();
  const isRtl = locale === 'ar';
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    dialysisSchedule: 'MWF',
    isActive: true,
  });

  const loadData = () => {
    try {
      const raw = getPatients();
      const rows: PatientRow[] = raw.map((p, idx) => {
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
    } catch (err) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
      if (typeof window !== 'undefined') {
        const querySearch = new URLSearchParams(window.location.search).get('search');
        if (querySearch) {
          setSearchTerm(querySearch);
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Filter by search term
  const filteredPatients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return patients;
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(term) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(term)) ||
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
    setTimeout(() => {
      setNotifModalOpen(false);
      setNotifSuccess(false);
      setSelectedIds(new Set());
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
      `"${p.fullName}"`,
      `"${p.fullNameAr || ''}"`,
      p.username,
      p.dialysisSchedule,
      `"${p.phone || ''}"`,
      p.metrics.tttAdherence,
      p.metrics.fluidAdherence,
      p.metrics.dietAdherence,
      p.metrics.overallAdherence,
      p.isActive ? 'Active' : 'Inactive',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
      dialysisSchedule: patient.dialysisSchedule,
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
            onClick={() => {
              const el = document.getElementById('admin-medications-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            data-testid="admin-prescribe-medications-header-btn"
            title={isRtl ? 'الانتقال إلى قسم تخصيص الأدوية' : 'Prescribe Medications'}
          >
            <span>💊</span>
            <span>{isRtl ? 'تخصيص الأدوية' : 'Prescribe Medications'}</span>
          </Button>

          <Link href={`/${locale}/admin/patients/new`}>
            <Button
              variant="primary"
              size="md"
              leftIcon={<PlusIcon className="w-4 h-4" />}
            >
              {tAdmin('addPatient') || (isRtl ? 'إضافة مريض جديد' : 'Register Patient')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Bulk Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isRtl ? 'بحث بالاسم، اسم المستخدم، الهاتف...' : 'Filter by name, username, or phone...'}
            leftIcon={<SearchIcon className="w-4 h-4" />}
          />
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-xl animate-in fade-in">
            <span className="text-xs font-bold text-[#1e6bb8] px-2">
              {selectedIds.size} {isRtl ? 'مريض محدد' : 'selected'}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenBulkNotification}
              leftIcon={<NotificationsIcon className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'إرسال إشعار' : 'Notify'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkExportCSV}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'تصدير' : 'Export'}
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-800 underline px-1"
            >
              {isRtl ? 'إلغاء' : 'Clear'}
            </button>
          </div>
        )}
      </div>

      {/* Patient Table Card */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
                <th className="py-3.5 px-4 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === sortedPatients.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8] cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort('fullName')}
                  className="py-3.5 px-4 text-start cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-start cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-start cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-center cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-center cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-center cursor-pointer hover:text-slate-800"
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
                  className="py-3.5 px-4 text-center cursor-pointer hover:text-slate-800"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{isRtl ? 'الحالة' : 'Status'}</span>
                    {sortField === 'isActive' && (
                      <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-end">{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
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
                      <td className="py-3.5 px-4 text-center" onClick={(e) => handleToggleSelect(patient.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-[#1e6bb8] border-slate-300 focus:ring-[#1e6bb8] cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900">
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

                      <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                        {patient.username}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="neutral" size="sm">
                          {patient.dialysisSchedule}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {getAdherenceBadge(patient.metrics.tttAdherence)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {getAdherenceBadge(patient.metrics.fluidAdherence)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {getAdherenceBadge(patient.metrics.dietAdherence)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
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

                      <td className="py-3.5 px-4 text-end">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => router.push(`/${locale}/admin/patients/${patient.id}`)}
                            title={isRtl ? 'عرض التفاصيل' : 'View Patient Details'}
                            className="p-1.5 text-slate-500 hover:text-[#1e6bb8] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleOpenEdit(patient, e)}
                            title={isRtl ? 'تعديل البيانات' : 'Edit Profile'}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleOpenSingleNotification(patient, e)}
                            title={isRtl ? 'إرسال إشعار' : 'Send Notification'}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <NotificationsIcon className="w-4 h-4" />
                          </button>
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
              ? `عرض ${sortedPatients.length} من أصل ${patients.length} مريض`
              : `Showing ${sortedPatients.length} of ${patients.length} enrolled patients`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBulkExportCSV}
            leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
          >
            {isRtl ? 'تصدير السجل كاملاً (CSV)' : 'Export Full Roster (CSV)'}
          </Button>
        </div>
      </Card>

      {/* Administrative Medication Assignment Section (R1) */}
      <section id="admin-medications-section" className="space-y-3 pt-2">
        <PatientMedicationManager />
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
            <div className="flex gap-4 mt-1">
              {['MWF', 'TTS', 'Custom'].map((sch) => (
                <label key={sch} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="editSchedule"
                    value={sch}
                    checked={editForm.dialysisSchedule === sch}
                    onChange={(e) => setEditForm({ ...editForm, dialysisSchedule: e.target.value })}
                    className="text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>{sch}</span>
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
    </div>
  );
}
