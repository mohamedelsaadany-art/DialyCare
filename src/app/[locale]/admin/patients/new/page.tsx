'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { addPatientAccount } from '@/lib/auth-context';
import type { Patient } from '@/lib/types';
import {
  getReminderTemplates,
  addReminder,
  updatePatient,
  isUsernameTaken,
  addNotification,
} from '../../admin-store';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  RemindersIcon,
} from '../../admin-icons';

interface CustomReminderItem {
  id: string;
  type: 'ttt' | 'fluid' | 'diet';
  titleEn: string;
  titleAr: string;
  time: string;
  isActive: boolean;
}

export default function NewPatientPage() {
  const locale = useLocale();
  const router = useRouter();
  const isRtl = locale === 'ar';
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');

  // Form State
  const [fullName, setFullName] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dialysisSchedule, setDialysisSchedule] = useState<'SMW' | 'STT'>('SMW');
  const [centerName, setCenterName] = useState('');
  const [fluidLimit, setFluidLimit] = useState('1000');

  // Reminder Schedule Option
  const [useDefaultReminders, setUseDefaultReminders] = useState(true);
  const [customReminders, setCustomReminders] = useState<CustomReminderItem[]>([
    { id: '1', type: 'ttt', titleEn: 'Morning Medication', titleAr: 'أدوية الصباح', time: '08:00', isActive: true },
    { id: '2', type: 'ttt', titleEn: 'Afternoon Medication', titleAr: 'أدوية الظهيرة', time: '14:00', isActive: true },
    { id: '3', type: 'ttt', titleEn: 'Evening Medication', titleAr: 'أدوية المساء', time: '20:00', isActive: true },
    { id: '4', type: 'fluid', titleEn: 'Morning Fluid Check', titleAr: 'متابعة سوائل الصباح', time: '10:00', isActive: true },
    { id: '5', type: 'fluid', titleEn: 'Afternoon Fluid Check', titleAr: 'متابعة سوائل الظهيرة', time: '15:00', isActive: true },
    { id: '6', type: 'fluid', titleEn: 'Evening Fluid Check', titleAr: 'متابعة سوائل المساء', time: '20:00', isActive: true },
    { id: '7', type: 'diet', titleEn: 'Breakfast Diet Log', titleAr: 'تسجيل إفطار الصباح', time: '09:00', isActive: true },
    { id: '8', type: 'diet', titleEn: 'Lunch Diet Log', titleAr: 'تسجيل وجبة الغداء', time: '13:00', isActive: true },
    { id: '9', type: 'diet', titleEn: 'Dinner Diet Log', titleAr: 'تسجيل وجبة العشاء', time: '19:00', isActive: true },
  ]);

  // Validation & Submission States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!fullName.trim()) {
      errs.fullName = isRtl ? 'الاسم بالإنجليزية مطلوب' : 'Full name in English is required';
    }

    if (!fullNameAr.trim()) {
      errs.fullNameAr = isRtl ? 'الاسم بالعربية مطلوب' : 'Full name in Arabic is required';
    }

    if (!username.trim()) {
      errs.username = isRtl ? 'اسم المستخدم مطلوب' : 'Username is required';
    } else if (username.length < 3) {
      errs.username = isRtl ? 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' : 'Username must be at least 3 characters';
    } else if (isUsernameTaken(username)) {
      errs.username = isRtl ? 'اسم المستخدم مستخدم بالفعل' : 'This username is already taken';
    }

    if (!password) {
      errs.password = isRtl ? 'كلمة المرور مطلوبة' : 'Password is required';
    } else if (password.length < 6) {
      errs.password = isRtl ? 'كلمة المرور يجب ألا تقل عن 6 أحرف' : 'Password must be at least 6 characters';
    }

    if (fluidLimit && (isNaN(Number(fluidLimit)) || Number(fluidLimit) <= 0)) {
      errs.fluidLimit = isRtl ? 'يرجى إدخال كمية صحيحة بالمليلتر' : 'Please enter a valid fluid volume in mL';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);

    try {
      // 1. Create Patient + Auth Account via addPatientAccount
      const patientData = {
        fullName: fullName.trim(),
        fullNameAr: fullNameAr.trim(),
        phone: phone.trim(),
        dialysisSchedule,
        reminderSchedule: useDefaultReminders ? 'standard' : 'custom',
        isActive: true,
      };

      const newUser = addPatientAccount(username.trim(), password, patientData);

      // Store username, fluid limit and center name directly on patient record
      updatePatient(newUser.uid, {
        ...patientData,
        username: username.trim(),
        centerName: centerName.trim(),
        fluidLimit: Number(fluidLimit) || 1000,
      } as unknown as Partial<Patient>);

      // 2. Create Reminders
      if (useDefaultReminders) {
        const templates = getReminderTemplates();
        templates.forEach((tpl) => {
          addReminder({
            id: `rem_${newUser.uid}_${tpl.id}`,
            patientId: newUser.uid,
            templateId: tpl.id,
            type: tpl.type,
            time: tpl.defaultTime,
            isActive: true,
            useCustomSchedule: false,
          });
        });
      } else {
        customReminders.forEach((r) => {
          addReminder({
            id: `rem_${newUser.uid}_${r.id}`,
            patientId: newUser.uid,
            type: r.type,
            time: r.time,
            isActive: r.isActive,
            useCustomSchedule: true,
          });
        });
      }

      // 3. Seed initial welcome notification for new patient
      addNotification({
        id: `notif_welcome_${newUser.uid}`,
        senderId: 'admin-1',
        type: 'individual',
        recipientIds: [newUser.uid],
        titleEn: 'Welcome to DialyCare! 🌟',
        titleAr: 'مرحباً بك في دايلي كير! 🌟',
        messageEn: `Welcome ${fullName.trim()} to DialyCare! Your care team is here to support your daily adherence and treatment schedule.`,
        messageAr: `أهلاً بك يا ${fullNameAr.trim() || fullName.trim()} في دايلي كير! فريقك الطبي هنا لدعم التزامك اليومي وجدول علاجك.`,
        sentAt: new Date().toISOString(),
        status: 'sent',
      });

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${locale}/admin/patients`);
      }, 1500);
    } catch (error) {
      console.error('Failed to create patient account:', error);
      setErrors({ form: isRtl ? 'حدث خطأ أثناء إنشاء الحساب' : 'An error occurred while creating the account' });
      setSubmitting(false);
    }
  };

  const handleCustomReminderTimeChange = (id: string, time: string) => {
    setCustomReminders(
      customReminders.map((r) => (r.id === id ? { ...r, time } : r))
    );
  };

  const handleCustomReminderToggle = (id: string) => {
    setCustomReminders(
      customReminders.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top back breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${locale}/admin/patients`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#1e6bb8] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5 rtl:rotate-180" />
          <span>{isRtl ? 'العودة للمرضى' : 'Back to Patients'}</span>
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          {tAdmin('addPatient') || (isRtl ? 'تسجيل مريض جديد بالوحدة' : 'Register New Patient')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isRtl
            ? 'إنشاء ملف سريري جديد وحساب دخول لمنصة المتابعة وتعيين جدول التذكيرات'
            : 'Create patient clinical record, credentials, and personalized reminder schedule'}
        </p>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in fade-in">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">
              {tAdmin('patientAccountCreated') || (isRtl ? 'تم تسجيل المريض بنجاح!' : 'Patient account registered successfully!')}
            </h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              {isRtl ? 'جاري تحويلك إلى سجل المرضى...' : 'Redirecting to patient directory...'}
            </p>
          </div>
        </div>
      )}

      {errors.form && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
          {errors.form}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Clinical Profile Information */}
        <Card
          title={isRtl ? 'البيانات الشخصية والسريرية' : 'Personal & Clinical Details'}
          subtitle={isRtl ? 'الاسم، الهاتف، ومعلومات وحدة الغسيل' : 'Full demographic and contact information'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'الاسم بالكامل (بالإنجليزية)' : 'Full Name (English)'}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ahmed Mahmoud"
              error={errors.fullName}
              required
            />

            <Input
              label={isRtl ? 'الاسم بالكامل (بالعربية)' : 'Full Name (Arabic)'}
              value={fullNameAr}
              onChange={(e) => setFullNameAr(e.target.value)}
              placeholder="مثال: أحمد محمود"
              error={errors.fullNameAr}
              required
            />

            <Input
              label={isRtl ? 'رقم الهاتف المحمول' : 'Phone Number (Optional)'}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+201012345678"
            />

            <Input
              label={isRtl ? 'اسم مركز / وحدة الغسيل' : 'Dialysis Center / Hospital'}
              value={centerName}
              onChange={(e) => setCenterName(e.target.value)}
              placeholder="e.g. Cairo Kidney Center"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 pt-4 border-t border-slate-100">
            {/* Dialysis Schedule */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block">
                {isRtl ? 'جدول جلسات الغسيل الأسبوعي' : 'Weekly Dialysis Schedule'}
                <span className="text-red-500 font-bold ms-1">*</span>
              </label>

              <div className="flex flex-col sm:flex-row gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="SMW"
                    checked={dialysisSchedule === 'SMW'}
                    onChange={() => setDialysisSchedule('SMW')}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>
                    {isRtl
                      ? 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)'
                      : 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)'}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="STT"
                    checked={dialysisSchedule === 'STT'}
                    onChange={() => setDialysisSchedule('STT')}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>
                    {isRtl
                      ? 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)'
                      : 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)'}
                  </span>
                </label>
              </div>
            </div>

            {/* Daily Fluid Limit */}
            <div>
              <Input
                label={isRtl ? 'الحد الأقصى اليومي للسوائل (مليلتر)' : 'Daily Fluid Allowance (mL)'}
                type="number"
                value={fluidLimit}
                onChange={(e) => setFluidLimit(e.target.value)}
                placeholder="1000"
                error={errors.fluidLimit}
                helperText={isRtl ? 'الكمية الافتراضية الموصى بها هي 1000 مل يومياً' : 'Standard target is typically 1000 mL/day'}
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Patient App Credentials */}
        <Card
          title={isRtl ? 'بيانات تسجيل الدخول لتطبيق المريض' : 'Patient App Account Credentials'}
          subtitle={isRtl ? 'يستخدمها المريض لتسجيل الدخول في تطبيق DialyCare' : 'Login credentials for patient smartphone interface'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'اسم المستخدم' : 'Username'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ahmed2026"
              error={errors.username}
              required
            />

            <Input
              label={isRtl ? 'كلمة المرور' : 'Password (min 6 characters)'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              error={errors.password}
              required
            />
          </div>
        </Card>

        {/* Section 3: Reminder Schedule Settings */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <RemindersIcon className="w-5 h-5 text-[#1e6bb8]" />
              <span>{isRtl ? 'إعدادات جدول التذكيرات اليومي' : 'Daily Adherence Reminder Schedule'}</span>
            </div>
          }
          subtitle={isRtl ? 'تحديد مواعيد إشعارات الأدوية والسوائل والوجبات' : 'Configure push alert times for TTT, fluid checks, and diet logs'}
        >
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={useDefaultReminders}
                onChange={(e) => setUseDefaultReminders(e.target.checked)}
                className="w-4 h-4 text-[#1e6bb8] rounded focus:ring-[#1e6bb8]"
              />
              <div>
                <span className="text-sm font-bold text-slate-800 block">
                  {isRtl ? 'استخدام جدول التذكيرات الافتراضي (9 تذكيرات يومية)' : 'Use standard clinical reminder schedule (9 daily alerts)'}
                </span>
                <span className="text-xs text-slate-600 block mt-0.5">
                  {isRtl
                    ? '3 مواعيد للأدوية، 3 لمتابعة السوائل، و 3 للوجبات الغذائية'
                    : '3 medication doses (08:00, 14:00, 20:00), 3 fluid checks, and 3 meal logs'}
                </span>
              </div>
            </label>

            {/* Custom Reminders Configuration */}
            {!useDefaultReminders && (
              <div className="pt-2 animate-in fade-in">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {isRtl ? 'تخصيص المواعيد المحددة:' : 'Customize Times for This Patient:'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {customReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rem.isActive}
                          onChange={() => handleCustomReminderToggle(rem.id)}
                          className="w-4 h-4 text-[#1e6bb8] rounded"
                        />
                        <span className="text-xs font-semibold text-slate-800">
                          {isRtl ? rem.titleAr : rem.titleEn}
                        </span>
                      </div>

                      <input
                        type="time"
                        value={rem.time}
                        onChange={(e) => handleCustomReminderTimeChange(rem.id, e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link href={`/${locale}/admin/patients`}>
            <Button variant="ghost" size="md">
              {tCommon('cancel') || 'Cancel'}
            </Button>
          </Link>

          <Button
            variant="primary"
            size="md"
            type="submit"
            isLoading={submitting}
            leftIcon={<CheckCircleIcon className="w-4 h-4" />}
          >
            {tAdmin('createAccount') || (isRtl ? 'إنشاء حساب المريض' : 'Create Patient Profile')}
          </Button>
        </div>
      </form>
    </div>
  );
}
