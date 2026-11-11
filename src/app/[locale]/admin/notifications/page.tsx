'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import type { Notification, Patient } from '@/lib/types';
import { getDialysisScheduleLabel } from '@/app/[locale]/patient/patient-utils';
import {
  getNotifications,
  addNotification,
  getPatients,
} from '../admin-store';
import {
  NotificationsIcon,
  SearchIcon,
  EyeIcon,
  CheckCircleIcon,
} from '../admin-icons';

interface PrewrittenTemplate {
  key: string;
  labelEn: string;
  labelAr: string;
  titleEn: string;
  titleAr: string;
  msgEn: string;
  msgAr: string;
}

const PREWRITTEN_TEMPLATES: PrewrittenTemplate[] = [
  {
    key: 'session_reminder',
    labelEn: 'Dialysis session reminder',
    labelAr: 'تذكير بموعد جلسة الغسيل',
    titleEn: 'Dialysis Session Reminder',
    titleAr: 'تذكير بموعد جلسة الغسيل الكلوي',
    msgEn: 'Please arrive 15 minutes before your scheduled treatment. Remember to check your vascular access thrill.',
    msgAr: 'يرجى الحضور قبل 15 دقيقة من موعد جلستك المقررة، والتحقق من نبض واهتزاز وصلة الغسيل الشريانية.',
  },
  {
    key: 'lab_work',
    labelEn: 'Lab work due',
    labelAr: 'موعد التحاليل الدورية',
    titleEn: 'Monthly Routine Blood Work Due',
    titleAr: 'موعد التحاليل الدورية الشهرية',
    msgEn: 'Your routine monthly blood lab work is scheduled during your upcoming dialysis run. Please fast as instructed.',
    msgAr: 'موعد سحب عينات تحاليلك الدورية في جلستك القادمة؛ يرجى الالتزام بالصيام وفقاً لتعليمات التمريض.',
  },
  {
    key: 'clinic_visit',
    labelEn: 'Clinic visit scheduled',
    labelAr: 'موعد زيارة استشاري الكلى',
    titleEn: 'Clinical Consultation Scheduled',
    titleAr: 'موعد استشارة طبية بوحدة الكلى',
    msgEn: 'You have a scheduled clinical review with your attending nephrologist during rounds this week.',
    msgAr: 'لديك موعد مراجعة سريرية مع استشاري الكلى المعالج أثناء مروره بالوحدة هذا الأسبوع.',
  },
  {
    key: 'medication_update',
    labelEn: 'Important medication update',
    labelAr: 'تحديث هام في خطة الأدوية',
    titleEn: 'Important Medication Regimen Update',
    titleAr: 'تحديث هام في خطة أدويتك الموصوفة',
    msgEn: 'Please review your updated medication doses and phosphate binder instructions with the unit pharmacist.',
    msgAr: 'يرجى مراجعة التعديلات الجديدة على جرعات أدويتك ومثبتات الفوسفات مع صيدلي الوحدة.',
  },
  {
    key: 'general_tip',
    labelEn: 'General health tip',
    labelAr: 'نصيحة سريرية عامة',
    titleEn: 'Renal Care & Thirst Management Tip',
    titleAr: 'نصيحة طبية لترطيب الفم والسيطرة على العطش',
    msgEn: 'Sucking on small ice chips or chewing mint gum helps quench severe thirst while protecting your daily fluid limit.',
    msgAr: 'مص مكعبات الثلج ببطء أو مضغ علكة بالنعناع ينعش الفم الجاف ويحميك من تجاوز حصة السوائل اليومية.',
  },
];

export default function NotificationsCenterPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const tNotifications = useTranslations('notifications');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Form State
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [messageAr, setMessageAr] = useState('');

  // Recipient targeting
  const [audienceType, setAudienceType] = useState<'all' | 'custom' | 'schedule'>('all');
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
  const [selectedSchedules, setSelectedSchedules] = useState<Set<string>>(new Set(['SMW']));
  const [patientSearch, setPatientSearch] = useState('');

  // Status feedback
  const [submitting, setSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // View Notification Detail Modal
  const [viewingNotif, setViewingNotif] = useState<Notification | null>(null);

  const loadData = () => {
    try {
      const pList = getPatients();
      setPatients(pList);

      const nList = getNotifications();
      // Sort newest first
      nList.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      setNotifications(nList);
    } catch (err) {
      console.error('Failed to load notifications data:', err);
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

  // Synchronize on cross-tab or local notification events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'DIALYCARE_NOTIFICATIONS') {
        loadData();
      }
    };
    const handleCustomUpdate = () => {
      loadData();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dialycare_notifications_updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dialycare_notifications_updated', handleCustomUpdate);
    };
  }, []);

  // Filter patients for custom selector
  const filteredPatients = useMemo(() => {
    const term = patientSearch.toLowerCase().trim();
    if (!term) return patients;
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(term) ||
        (p.fullNameAr && p.fullNameAr.toLowerCase().includes(term))
    );
  }, [patients, patientSearch]);

  // Handle Quick Template selection
  const handleSelectTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    if (!key) return;

    const tpl = PREWRITTEN_TEMPLATES.find((t) => t.key === key);
    if (tpl) {
      setTitleEn(tpl.titleEn);
      setTitleAr(tpl.titleAr);
      setMessageEn(tpl.msgEn);
      setMessageAr(tpl.msgAr);
    }
  };

  // Toggle Schedule checkbox
  const handleToggleSchedule = (sch: string) => {
    const updated = new Set(selectedSchedules);
    if (updated.has(sch)) {
      if (updated.size > 1) updated.delete(sch);
    } else {
      updated.add(sch);
    }
    setSelectedSchedules(updated);
  };

  // Toggle patient selection
  const handleTogglePatient = (id: string) => {
    const updated = new Set(selectedPatientIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedPatientIds(updated);
  };

  // Determine recipient IDs
  const computeRecipientIds = (): string[] => {
    if (audienceType === 'all') {
      return patients.map((p) => p.id);
    }
    if (audienceType === 'schedule') {
      return patients
        .filter((p) => {
          const sched = (p.dialysisSchedule || '').trim().toUpperCase();
          const isSTT = sched === 'STT' || sched === 'TTS' || sched.includes('SUN') || sched.includes('أحد');
          const norm = isSTT ? 'STT' : 'SMW';
          return (
            selectedSchedules.has(norm) ||
            selectedSchedules.has(sched) ||
            (norm === 'SMW' && selectedSchedules.has('MWF')) ||
            (norm === 'STT' && selectedSchedules.has('TTS'))
          );
        })
        .map((p) => p.id);
    }
    return Array.from(selectedPatientIds);
  };

  // Handle Send Notification
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!titleEn.trim() && !titleAr.trim()) {
      setErrorMessage(isRtl ? 'يرجى إدخال عنوان الإشعار' : 'Please provide a notification title.');
      return;
    }
    if (!messageEn.trim() && !messageAr.trim()) {
      setErrorMessage(isRtl ? 'يرجى إدخال نص الرسالة' : 'Please provide a message body.');
      return;
    }

    const recipients = computeRecipientIds();
    if (recipients.length === 0) {
      setErrorMessage(isRtl ? 'يرجى تحديد مستلم واحد على الأقل' : 'Please select at least one recipient.');
      return;
    }

    setSubmitting(true);

    try {
      const newNotif: Notification = {
        id: `notif_${Date.now()}`,
        senderId: 'admin-1',
        type: audienceType === 'all' ? 'broadcast' : audienceType === 'schedule' ? 'group' : 'individual',
        recipientIds: recipients,
        titleEn: titleEn.trim() || titleAr.trim(),
        titleAr: titleAr.trim() || titleEn.trim(),
        messageEn: messageEn.trim() || messageAr.trim(),
        messageAr: messageAr.trim() || messageEn.trim(),
        sentAt: new Date().toISOString(),
        status: 'sent',
      };

      addNotification(newNotif);

      setSuccessToast(true);
      setTitleEn('');
      setTitleAr('');
      setMessageEn('');
      setMessageAr('');
      setSelectedPatientIds(new Set());

      // Refresh list
      loadData();

      setTimeout(() => {
        setSuccessToast(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to send notification:', err);
      setErrorMessage(isRtl ? 'تعذر إرسال الإشعار' : 'Failed to send notification.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading notification center...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {tNotifications('title') || (isRtl ? 'مركز الإشعارات والتنبيهات' : 'Clinical Notification Center')}
          </h1>
          <Badge variant="neutral" size="sm">
            {notifications.length} {isRtl ? 'مرسلة' : 'Sent'}
          </Badge>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {isRtl
            ? 'بث الرسائل الجماعية والتوجيهات السريرية لمرضى وحدة الغسيل الكلوي'
            : 'Broadcast clinical updates, lab reminders, and urgent alerts to patient mobile devices'}
        </p>
      </div>

      {/* Success Banner */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in fade-in">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">
              {tNotifications('sentSuccess') || (isRtl ? 'تم إرسال الإشعار بنجاح!' : 'Notification dispatched successfully!')}
            </h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              {isRtl ? 'تم تسليم الرسالة وحفظها في سجل التاريخ أدناه' : 'Alert saved and registered in history.'}
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {/* Compose Section Card */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <NotificationsIcon className="w-5 h-5 text-[#1e6bb8]" />
            <span>{isRtl ? 'إنشاء وإرسال إشعار جديد' : 'Compose & Dispatch Notification'}</span>
          </div>
        }
        subtitle={isRtl ? 'اختر قالباً جاهزاً أو اكتب رسالة مخصصة مع تحديد الجمهور' : 'Target all patients, specific shift schedules, or individual recipients'}
      >
        <form onSubmit={handleSend} className="space-y-6">
          {/* Quick Prewritten Templates Dropdown */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              ⚡ {isRtl ? 'نماذج رسائل سريرية سريعة:' : 'Quick Clinical Message Presets:'}
            </label>
            <select
              onChange={handleSelectTemplate}
              defaultValue=""
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8]"
            >
              <option value="">{isRtl ? '-- اختر نموذجاً معتمداً للتحميل التلقائي --' : '-- Choose a pre-written clinical preset --'}</option>
              {PREWRITTEN_TEMPLATES.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {isRtl ? tpl.labelAr : tpl.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* Titles in EN & AR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'عنوان الإشعار (بالإنجليزية)' : 'Subject / Title (English)'}
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="e.g. Tomorrow Dialysis Treatment Reminder"
              required
            />

            <Input
              label={isRtl ? 'عنوان الإشعار (بالعربية)' : 'Subject / Title (Arabic)'}
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="مثال: تذكير بموعد جلسة الغسيل الكلوي غداً"
              required
            />
          </div>

          {/* Messages in EN & AR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص الرسالة (بالإنجليزية)' : 'Notification Content (English)'}
                <span className="text-red-500 font-bold ms-1">*</span>
              </label>
              <textarea
                value={messageEn}
                onChange={(e) => setMessageEn(e.target.value)}
                rows={4}
                required
                placeholder="Write clear instructions for patients..."
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8] text-slate-900"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص الرسالة (بالعربية)' : 'Notification Content (Arabic)'}
                <span className="text-red-500 font-bold ms-1">*</span>
              </label>
              <textarea
                value={messageAr}
                onChange={(e) => setMessageAr(e.target.value)}
                rows={4}
                required
                placeholder="اكتب التعليمات الطبية بوضوح للمرضى..."
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8] text-slate-900"
              />
            </div>
          </div>

          {/* Recipients Targeting Selector */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <label className="text-sm font-bold text-slate-800 block">
              {isRtl ? 'الجمهور المستهدف:' : 'Recipient Audience:'}
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="audience"
                  value="all"
                  checked={audienceType === 'all'}
                  onChange={() => setAudienceType('all')}
                  className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                />
                <span>{isRtl ? `جميع المرضى بالوحدة (${patients.length})` : `All Enrolled Patients (${patients.length})`}</span>
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="audience"
                  value="schedule"
                  checked={audienceType === 'schedule'}
                  onChange={() => setAudienceType('schedule')}
                  className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                />
                <span>{isRtl ? 'حسب جدول أيام الغسيل' : 'By Dialysis Schedule Shift'}</span>
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="audience"
                  value="custom"
                  checked={audienceType === 'custom'}
                  onChange={() => setAudienceType('custom')}
                  className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                />
                <span>{isRtl ? 'تحديد مرضى معينين' : 'Specific Patient Selection'}</span>
              </label>
            </div>

            {/* Schedule checkboxes if 'schedule' selected */}
            {audienceType === 'schedule' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 animate-in fade-in">
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
                  <label key={sch.code} className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        selectedSchedules.has(sch.code) ||
                        (sch.code === 'SMW' && selectedSchedules.has('MWF')) ||
                        (sch.code === 'STT' && selectedSchedules.has('TTS'))
                      }
                      onChange={() => handleToggleSchedule(sch.code)}
                      className="w-4 h-4 text-[#1e6bb8] rounded"
                    />
                    <span>{isRtl ? sch.labelAr : sch.labelEn}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Patient multi-select if 'custom' selected */}
            {audienceType === 'custom' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder={isRtl ? 'بحث في قائمة المرضى...' : 'Filter patients by name...'}
                    className="w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                  />
                  <SearchIcon className="absolute left-3 rtl:left-auto rtl:right-3 top-2.5 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                  {filteredPatients.map((p) => {
                    const isChecked = selectedPatientIds.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePatient(p.id)}
                            className="w-4 h-4 text-[#1e6bb8] rounded"
                          />
                          <span className="font-semibold text-slate-800">
                            {p.fullName} {p.fullNameAr && `(${p.fullNameAr})`}
                          </span>
                        </div>
                        <Badge variant="neutral" size="sm">
                          {getDialysisScheduleLabel(p.dialysisSchedule, isRtl)}
                        </Badge>
                      </label>
                    );
                  })}
                </div>
                <div className="text-xs text-slate-500">
                  {isRtl
                    ? `تم تحديد ${selectedPatientIds.size} من أصل ${patients.length} مريض`
                    : `Selected ${selectedPatientIds.size} of ${patients.length} patients`}
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <Button
              variant="primary"
              size="lg"
              type="submit"
              isLoading={submitting}
              leftIcon={<NotificationsIcon className="w-5 h-5" />}
              className="bg-[#1e6bb8] hover:bg-[#155392] px-8"
            >
              {tNotifications('sendNow') || (isRtl ? 'إرسال الإشعار الآن' : 'Dispatch Notification')}
            </Button>
          </div>
        </form>
      </Card>

      {/* Notification History Table Card */}
      <Card
        title={isRtl ? 'سجل الإشعارات المرسلة' : 'Sent Notifications Archive'}
        subtitle={isRtl ? 'أرشيف الرسائل والتوجيهات السريرية المرسلة' : 'Chronological log of alerts, broadcast reminders, and target audience'}
      >
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">
              {isRtl ? 'لا توجد إشعارات مرسلة حتى الآن' : 'No clinical notifications dispatched yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 text-start">{isRtl ? 'تاريخ الإرسال' : 'Sent Date'}</th>
                  <th className="py-3 px-4 text-start">{isRtl ? 'العنوان' : 'Subject'}</th>
                  <th className="py-3 px-4 text-center">{isRtl ? 'المستلمون' : 'Recipients'}</th>
                  <th className="py-3 px-4 text-center">{isRtl ? 'النوع' : 'Type'}</th>
                  <th className="py-3 px-4 text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-end">{isRtl ? 'التفاصيل' : 'Details'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setViewingNotif(n)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(n.sentAt).toLocaleString()}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>
                        <span>{n.titleEn}</span>
                        {n.titleAr && (
                          <span className="block text-xs font-normal text-slate-400">
                            {n.titleAr}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="font-mono text-xs font-bold text-slate-700 px-2 py-0.5 bg-slate-100 rounded-md">
                        {n.recipientIds.length} {isRtl ? 'مرضى' : 'pts'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          n.type === 'broadcast'
                            ? 'info'
                            : n.type === 'group'
                            ? 'warning'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {n.type.toUpperCase()}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge variant="success" size="sm" dot>
                        {n.status}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingNotif(n);
                        }}
                        leftIcon={<EyeIcon className="w-3.5 h-3.5" />}
                      >
                        {isRtl ? 'عرض' : 'View'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* View Full Notification Modal */}
      <Modal
        isOpen={Boolean(viewingNotif)}
        onClose={() => setViewingNotif(null)}
        title={isRtl ? 'تفاصيل الإشعار المرسل' : 'Archived Notification Details'}
      >
        {viewingNotif && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between">
              <div>
                <span className="font-semibold text-slate-700">{isRtl ? 'التاريخ: ' : 'Timestamp: '}</span>
                <span className="text-slate-600">{new Date(viewingNotif.sentAt).toLocaleString()}</span>
              </div>
              <Badge variant="success" size="sm">
                {viewingNotif.type.toUpperCase()}
              </Badge>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">
                {isRtl ? 'العنوان (إنجليزي وعربي)' : 'Subject / Titles'}
              </label>
              <h4 className="text-base font-bold text-slate-900 mt-0.5">{viewingNotif.titleEn}</h4>
              {viewingNotif.titleAr && (
                <p className="text-sm font-semibold text-slate-600">{viewingNotif.titleAr}</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">
                {isRtl ? 'نص الرسالة' : 'Dispatched Message Body'}
              </label>
              <p className="text-sm text-slate-800 leading-relaxed">{viewingNotif.messageEn}</p>
              {viewingNotif.messageAr && (
                <p className="text-sm text-slate-800 leading-relaxed pt-2 border-t border-slate-200 text-right" dir="rtl">
                  {viewingNotif.messageAr}
                </p>
              )}
            </div>

            <div className="text-xs text-slate-500">
              <strong>{isRtl ? 'المستلمون: ' : 'Recipient Roster: '}</strong>
              <span>
                {viewingNotif.recipientIds.length} {isRtl ? 'مريض تم إرسال الإشعار لهم' : 'enrolled patients targeted'}
              </span>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setViewingNotif(null)}>
                {tCommon('close') || 'Close'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
