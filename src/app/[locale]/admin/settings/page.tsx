'use client';

import React, { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import {
  getAdminSettings,
  saveAdminSettings,
  getPatients,
  getAdherenceLogs,
  resetAllData,
  exportAllDataAsJson,
  type AdminSettings,
} from '../admin-store';
import { getAdminPassword, setAdminPassword } from '@/lib/data-store';
import { useAuth } from '@/lib/auth-context';
import {
  SettingsIcon,
  DownloadIcon,
  CheckCircleIcon,
  TrashIcon,
} from '../admin-icons';

export default function AdminSettingsPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [adminPassError, setAdminPassError] = useState('');
  const [adminPassSuccess, setAdminPassSuccess] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>({
    adherenceThreshold: 70,
    defaultTimes: {
      tttMorning: '08:00',
      tttAfternoon: '14:00',
      tttEvening: '20:00',
      fluidMorning: '10:00',
      fluidAfternoon: '15:00',
      fluidEvening: '20:00',
      dietBreakfast: '09:00',
      dietLunch: '13:00',
      dietDinner: '19:00',
    },
  });

  // App stats
  const [totalPatients, setTotalPatients] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);
  const [storageKb, setStorageKb] = useState(0);

  // Status feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const loadData = () => {
    try {
      const currentSettings = getAdminSettings();
      setSettings(currentSettings);

      const pts = getPatients();
      setTotalPatients(pts.length);

      const logs = getAdherenceLogs();
      setTotalLogs(logs.length);

      if (typeof window !== 'undefined') {
        let totalBytes = 0;
        for (const x of Object.keys(window.localStorage)) {
          const item = window.localStorage.getItem(x);
          totalBytes += (item ? item.length : 0) * 2;
        }
        setStorageKb(Math.round(totalBytes / 1024));
      }
    } catch (err) {
      console.error('Failed to load settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveAdminSettings(settings);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  };

  const handleExportAll = () => {
    const jsonStr = exportAllDataAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Waslity_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmReset = () => {
    resetAllData();
    setResetModalOpen(false);
    setResetSuccess(true);
    loadData();
    setTimeout(() => {
      setResetSuccess(false);
    }, 3000);
  };

  const handleUpdateAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassError('');
    setAdminPassSuccess(false);

    const actualCurrent = getAdminPassword();
    if (currentAdminPass !== actualCurrent) {
      setAdminPassError(tSettings('incorrectCurrentPassword') || (isRtl ? 'كلمة المرور الحالية غير صحيحة' : 'Current password is incorrect'));
      return;
    }
    if (newAdminPass.length < 6) {
      setAdminPassError(tSettings('passwordMinLength') || (isRtl ? 'يجب ألا تقل كلمة المرور عن 6 أحرف' : 'Password must be at least 6 characters'));
      return;
    }
    if (newAdminPass !== confirmAdminPass) {
      setAdminPassError(tSettings('passwordMismatch') || (isRtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'));
      return;
    }

    setAdminPassword(newAdminPass);
    setCurrentAdminPass('');
    setNewAdminPass('');
    setConfirmAdminPass('');
    setAdminPassSuccess(true);
    setTimeout(() => setAdminPassSuccess(false), 3500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading system configuration...'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-[#1e6bb8]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {tSettings('title') || (isRtl ? 'إعدادات النظام والمنصة' : 'Clinical System Settings')}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {isRtl
            ? 'تخصيص مؤشرات الالتزام، المواعيد الافتراضية، وإدارة وتصدير البيانات'
            : 'Configure clinical thresholds, baseline reminder times, and data backups'}
        </p>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in fade-in">
          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">
              {isRtl ? 'تم حفظ التعديلات بنجاح!' : 'Settings Saved Successfully!'}
            </h4>
            <p className="text-xs text-emerald-700">
              {isRtl ? 'تم تحديث عتبة التنبيه والمواعيد الافتراضية' : 'Thresholds and defaults have been applied.'}
            </p>
          </div>
        </div>
      )}

      {resetSuccess && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 animate-in fade-in">
          <div className="w-9 h-9 rounded-full bg-blue-100 text-[#1e6bb8] flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-blue-900 text-sm">
              {isRtl ? 'تمت إعادة تعيين البيانات التجريبية!' : 'Demo Data Successfully Restored!'}
            </h4>
            <p className="text-xs text-blue-700">
              {isRtl ? 'تم استرجاع السجلات والنصائح والنماذج الافتراضية' : 'Default patients, reminders, and coaching tips re-seeded.'}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Clinical Adherence Threshold */}
        <Card
          title={isRtl ? 'عتبة تنبيه انخفاض الالتزام' : 'Non-Adherence Flag Threshold'}
          subtitle={isRtl ? 'النسبة المئوية التي يُصنف تحتها المريض كغير ملتزم في لوحة التحكم' : 'Patients whose compliance drops below this percentage trigger clinical alerts'}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="text-sm font-bold text-slate-800 block">
                  {isRtl ? 'الحد الأدنى لنسبة الالتزام المقبولة (%)' : 'Minimum Acceptable Adherence Target (%)'}
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isRtl
                    ? 'المعدل الطبي المقبول عموماً في جلسات الغسيل هو 70% إلى 80%'
                    : 'The standard recommended clinical threshold is 70%'}
                </p>
              </div>

              <div className="w-32">
                <Input
                  type="number"
                  min={40}
                  max={95}
                  value={settings.adherenceThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      adherenceThreshold: Math.max(40, Math.min(95, parseInt(e.target.value, 10) || 70)),
                    })
                  }
                  className="font-mono font-bold text-center text-lg"
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {isRtl ? 'حالة التمييز الحالية:' : 'Current Flag Logic:'}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-700 font-semibold">
                  ≥ {settings.adherenceThreshold}% ({isRtl ? 'ملتزم' : 'Compliant'})
                </span>
                <span className="text-amber-700 font-semibold">
                  50% - {settings.adherenceThreshold}% ({isRtl ? 'يحتاج متابعة' : 'Moderate'})
                </span>
                <span className="text-red-700 font-semibold">
                  &lt; 50% ({isRtl ? 'خطر مرتفع' : 'Critical'})
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Section 2: Default Reminder Times */}
        <Card
          title={isRtl ? 'المواعيد الافتراضية للتنبيهات اليومية' : 'Default Clinical Reminder Timings'}
          subtitle={isRtl ? 'المواعيد المقترحة تلقائياً للمرضى الجدد لكل فئة' : 'Baseline times populated into new patient accounts'}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* TTT Medication Column */}
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <h4 className="text-xs font-bold text-[#1e6bb8] uppercase tracking-wider flex items-center gap-1.5">
                <span>💊</span>
                <span>{isRtl ? 'أدوية ومثبتات (TTT)' : 'Medication (TTT)'}</span>
              </h4>

              <div className="space-y-2.5">
                <Input
                  label={isRtl ? 'جرعة الصباح' : 'Morning Dose'}
                  type="time"
                  value={settings.defaultTimes.tttMorning}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, tttMorning: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'جرعة الظهيرة' : 'Afternoon Dose'}
                  type="time"
                  value={settings.defaultTimes.tttAfternoon}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, tttAfternoon: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'جرعة المساء' : 'Evening Dose'}
                  type="time"
                  value={settings.defaultTimes.tttEvening}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, tttEvening: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            {/* Fluid Intake Column */}
            <div className="space-y-3 p-4 bg-sky-50/50 rounded-xl border border-sky-100">
              <h4 className="text-xs font-bold text-[#0284c7] uppercase tracking-wider flex items-center gap-1.5">
                <span>💧</span>
                <span>{isRtl ? 'متابعة السوائل' : 'Fluid Quota'}</span>
              </h4>

              <div className="space-y-2.5">
                <Input
                  label={isRtl ? 'متابعة الصباح' : 'Morning Check'}
                  type="time"
                  value={settings.defaultTimes.fluidMorning}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, fluidMorning: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'متابعة الظهيرة' : 'Midday Check'}
                  type="time"
                  value={settings.defaultTimes.fluidAfternoon}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, fluidAfternoon: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'مراجعة المساء' : 'Evening Review'}
                  type="time"
                  value={settings.defaultTimes.fluidEvening}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, fluidEvening: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            {/* Diet Checklist Column */}
            <div className="space-y-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🥗</span>
                <span>{isRtl ? 'قائمة الغذاء' : 'Diet Checklist'}</span>
              </h4>

              <div className="space-y-2.5">
                <Input
                  label={isRtl ? 'وجبة الإفطار' : 'Breakfast Log'}
                  type="time"
                  value={settings.defaultTimes.dietBreakfast}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, dietBreakfast: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'وجبة الغداء' : 'Lunch Log'}
                  type="time"
                  value={settings.defaultTimes.dietLunch}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, dietLunch: e.target.value },
                    })
                  }
                />
                <Input
                  label={isRtl ? 'وجبة العشاء' : 'Dinner Log'}
                  type="time"
                  value={settings.defaultTimes.dietDinner}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimes: { ...settings.defaultTimes, dietDinner: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Section 3: App Diagnostics & Storage */}
        <Card
          title={isRtl ? 'معلومات النظام والبيانات المخزنة' : 'System Information & Diagnostics'}
          subtitle={isRtl ? 'إحصائيات المنصة واستهلاك التخزين المحلي' : 'Roster volume, adherence log count, and client-side database storage'}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 block">{isRtl ? 'إصدار المنصة' : 'App Version'}</span>
              <span className="text-base font-extrabold text-slate-800 mt-1 block">v1.0.0</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 block">{isRtl ? 'إجمالي المرضى' : 'Total Patients'}</span>
              <span className="text-base font-extrabold text-slate-800 mt-1 block">{totalPatients}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 block">{isRtl ? 'سجلات الالتزام' : 'Adherence Logs'}</span>
              <span className="text-base font-extrabold text-slate-800 mt-1 block">{totalLogs}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 block">{isRtl ? 'حجم التخزين' : 'DB Usage'}</span>
              <span className="text-base font-extrabold text-slate-800 mt-1 block">{storageKb} KB</span>
            </div>
          </div>
        </Card>

        {/* Section 4: Security & Master Admin Password Rotation */}
        {isAdmin && (
          <Card
            title={
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-[#1e6bb8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>{tSettings('securityTitle') || (isRtl ? 'أمان النظام وتغيير كلمة مرور المشرف (Admin)' : 'Security & Super Admin Password')}</span>
              </div>
            }
            subtitle={
              tSettings('securityDesc') || (isRtl ? 'تغيير كلمة المرور الافتراضية (admin123) لحساب الإدارة الرئيسية' : 'Update default credentials for the master admin account')
            }
          >
            <div className="space-y-4">
              {adminPassSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs sm:text-sm font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{tSettings('passwordUpdatedSuccess') || (isRtl ? 'تم تحديث كلمة مرور المشرف بنجاح!' : 'Admin password updated successfully!')}</span>
                </div>
              )}

              {adminPassError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-2 animate-in fade-in">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{adminPassError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  type="password"
                  label={tSettings('currentPassword') || (isRtl ? 'كلمة المرور الحالية' : 'Current Password')}
                  value={currentAdminPass}
                  onChange={(e) => setCurrentAdminPass(e.target.value)}
                  placeholder="••••••••"
                />

                <Input
                  type="password"
                  label={tSettings('newPassword') || (isRtl ? 'كلمة المرور الجديدة' : 'New Password')}
                  value={newAdminPass}
                  onChange={(e) => setNewAdminPass(e.target.value)}
                  placeholder="••••••••"
                />

                <Input
                  type="password"
                  label={tSettings('confirmNewPassword') || (isRtl ? 'تأكيد كلمة المرور' : 'Confirm New Password')}
                  value={confirmAdminPass}
                  onChange={(e) => setConfirmAdminPass(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleUpdateAdminPassword}
                  className="font-bold text-xs"
                >
                  {tSettings('updatePasswordBtn') || (isRtl ? 'تحديث كلمة مرور الإدارة' : 'Update Admin Password')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Section 5: Data Management & Backup */}
        <Card
          title={isRtl ? 'إدارة البيانات والنسخ الاحتياطي' : 'Data Management & Demo Tools'}
          subtitle={isRtl ? 'تصدير نسخة احتياطية كاملة أو استعادة البيانات الأولية' : 'Download complete JSON export or reset seed records for demonstration'}
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {isRtl ? 'النسخ الاحتياطي الكامل (JSON)' : 'Full System Backup (JSON)'}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRtl
                  ? 'تحميل ملف JSON يحتوي على سجلات المرضى والالتزام والتذكيرات والنصائح والإشعارات'
                  : 'Download complete database snapshot including patients, reminders, tips, and logs'}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAll}
              leftIcon={<DownloadIcon className="w-4 h-4" />}
            >
              {isRtl ? 'تصدير كل البيانات' : 'Export All Data'}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-red-50/60 border border-red-200 rounded-xl mt-4">
            <div>
              <h4 className="text-sm font-bold text-red-900">
                {isRtl ? 'إعادة تعيين البيانات التجريبية' : 'Reset Demo Database'}
              </h4>
              <p className="text-xs text-red-700 mt-0.5">
                {isRtl
                  ? 'مسح التعديلات المحلية وإعادة زرع المرضى والجداول والنصائح الافتراضية'
                  : 'Restores initial patients, reminder templates, and coaching library'}
              </p>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setResetModalOpen(true)}
              leftIcon={<TrashIcon className="w-4 h-4" />}
            >
              {isRtl ? 'إعادة التعيين' : 'Reset Demo Data'}
            </Button>
          </div>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="lg"
            type="submit"
            leftIcon={<CheckCircleIcon className="w-5 h-5" />}
            className="px-8"
          >
            {tCommon('save') || (isRtl ? 'حفظ كافة الإعدادات' : 'Save All Settings')}
          </Button>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={isRtl ? 'تأكيد إعادة تعيين البيانات' : 'Confirm Demo Data Reset'}
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs">
            ⚠️ {isRtl
              ? 'سيؤدي هذا الإجراء إلى مسح أية حسابات مرضى جديدة أو تذكيرات تم إنشاؤها واستعادة الحالة الأولية للمنصة.'
              : 'This action will discard any newly registered patients or custom reminders and re-seed the standard baseline records.'}
          </div>

          <p className="text-sm text-slate-700">
            {isRtl ? 'هل أنت متأكد من المتابعة؟' : 'Are you sure you wish to proceed?'}
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setResetModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmReset}>
              {isRtl ? 'تأكيد وإعادة التعيين' : 'Confirm Reset'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
