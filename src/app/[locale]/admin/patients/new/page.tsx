'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { addPatientAccount } from '@/lib/auth-context';
import { generatePatientCredentials, syncFullCloudData } from '@/lib/data-store';
import type { Patient, DialysisAccessType, User } from '@/lib/types';
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
  const [dryWeightKg, setDryWeightKg] = useState('');
  const [accessType, setAccessType] = useState<DialysisAccessType>('AVF');
  const [centerName, setCenterName] = useState('');
  const [fluidLimit, setFluidLimit] = useState('');

  // Generated Credentials State & Modal
  const [generatedSuffix, setGeneratedSuffix] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{
    patient: Patient;
    user: User;
    rawPassword: string;
  } | null>(null);

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

  // Helper to auto-generate username and password from patient phone
  const handleAutoGenerate = () => {
    const rawDigits = phone.replace(/[\s\-\(\)\+]/g, '');
    const basePhone = rawDigits.length >= 7 ? rawDigits : `010${Math.floor(10000000 + Math.random() * 90000000)}`;
    if (!phone) {
      setPhone(basePhone);
    }
    const creds = generatePatientCredentials(basePhone);
    setUsername(creds.username);
    setPassword(creds.password);
    setGeneratedSuffix(creds.randomSuffix);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const effectiveName = fullName.trim() || fullNameAr.trim();
    if (!effectiveName) {
      errs.fullName = isRtl ? 'اسم المريض مطلوب' : 'Patient name is required';
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

    if (dryWeightKg && (isNaN(Number(dryWeightKg)) || Number(dryWeightKg) <= 0)) {
      errs.dryWeightKg = isRtl ? 'يرجى إدخال وزن جاف صحيح' : 'Please enter valid dry weight';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);

    try {
      const effectiveFullName = fullName.trim() || fullNameAr.trim();
      const effectiveFullNameAr = fullNameAr.trim() || fullName.trim();

      // 1. Create Patient + Auth Account via addPatientAccount
      const patientData: Partial<Patient> & { language?: 'ar' | 'en' } = {
        fullName: effectiveFullName,
        fullNameAr: effectiveFullNameAr,
        phone: phone.trim(),
        dialysisSchedule,
        dryWeightKg: dryWeightKg.trim() ? Number(dryWeightKg) : undefined,
        accessType,
        reminderSchedule: useDefaultReminders ? 'standard' : 'custom',
        isActive: true,
      };

      const { user: newUser } = addPatientAccount(username.trim(), password, patientData);

      // Store username, fluid limit, center name, dry weight, and access type directly on patient record
      updatePatient(newUser.uid, {
        ...patientData,
        username: username.trim(),
        centerName: centerName.trim(),
        fluidLimit: fluidLimit.trim() ? Number(fluidLimit) : undefined,
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
        titleEn: 'Welcome to Waslity! 🌟',
        titleAr: 'مرحباً بك في وَصْلِتي! 🌟',
        messageEn: `Welcome ${fullName.trim()} to Waslity! Your care team is here to support your daily adherence and treatment schedule.`,
        messageAr: `أهلاً بك يا ${fullNameAr.trim() || fullName.trim()} في وَصْلِتي! فريقك الطبي هنا لدعم التزامك اليومي وجدول علاجك.`,
        sentAt: new Date().toISOString(),
        status: 'sent',
      });

      // Show the generated credentials card modal
      setCreatedCredentialsModal({
        patient: {
          ...patientData,
          id: newUser.uid,
          fullName: fullName.trim(),
          fullNameAr: fullNameAr.trim(),
          dialysisSchedule,
          isActive: true,
          createdAt: new Date().toISOString(),
        } as Patient,
        user: newUser,
        rawPassword: password,
      });

      // Instantly push to unified cloud database so all clinic tablets & phones see new patient immediately
      void syncFullCloudData();
    } catch (error) {
      console.error('Failed to create patient account:', error);
      setErrors({ form: isRtl ? 'حدث خطأ أثناء إنشاء الحساب' : 'An error occurred while creating the account' });
    } finally {
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

  // WhatsApp share message
  const handleWhatsAppShare = () => {
    if (!createdCredentialsModal) return;
    const { patient, user: createdUser, rawPassword } = createdCredentialsModal;
    const cleanPhone = (patient.phone || '').replace(/[\s\-\(\)\+]/g, '');
    const schedText = patient.dialysisSchedule === 'SMW'
      ? (isRtl ? 'السبت - الإثنين - الأربعاء' : 'Sat - Mon - Wed')
      : (isRtl ? 'الأحد - الثلاثاء - الخميس' : 'Sun - Tue - Thu');

    const msg = isRtl
      ? `أهلاً بك يا ${patient.fullNameAr || patient.fullName} في منصة وَصْلِتي (Waslity) لمتابعة جلسات الغسيل الكلوي.
بيانات الدخول لحسابك:
👤 اسم المستخدم: ${createdUser.username}
🔑 كلمة المرور: ${rawPassword}
🗓️ جدول الغسيل: ${schedText}
🔗 رابط تسجيل الدخول: https://waslity.vercel.app`
      : `Welcome ${patient.fullName} to Waslity!
Your account credentials:
👤 Username: ${createdUser.username}
🔑 Password: ${rawPassword}
🗓️ Schedule: ${schedText}
🔗 Link: https://waslity.vercel.app`;

    const url = `https://wa.me/${cleanPhone ? (cleanPhone.startsWith('0') ? `2${cleanPhone}` : cleanPhone) : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Copy credentials to clipboard
  const handleCopyCredentials = () => {
    if (!createdCredentialsModal) return;
    const { patient, user: createdUser, rawPassword } = createdCredentialsModal;
    const text = `Waslity Patient Account:
Name: ${patient.fullNameAr || patient.fullName}
Username: ${createdUser.username}
Password: ${rawPassword}
Schedule: ${patient.dialysisSchedule}
Portal: https://waslity.vercel.app`;

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
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
            ? 'إنشاء ملف سريري جديد، وتوليد بيانات الدخول تلقائياً، وتعيين جدول التذكيرات'
            : 'Create patient clinical record, auto-generate credentials, and configure reminders'}
        </p>
      </div>

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
              label={isRtl ? 'رقم الهاتف المحمول (واتساب)' : 'Phone Number (WhatsApp)'}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
            />

            <Input
              label={isRtl ? 'اسم مركز / وحدة الغسيل' : 'Dialysis Center / Hospital'}
              value={centerName}
              onChange={(e) => setCenterName(e.target.value)}
              placeholder="e.g. Kasr Al-Ainy Dialysis Unit"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-100">
            {/* Dialysis Schedule */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                {isRtl ? 'جدول جلسات الغسيل الأسبوعي' : 'Weekly Dialysis Schedule'}
                <span className="text-red-500 font-bold ms-1">*</span>
              </label>

              <div className="flex flex-col gap-2 pt-0.5">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="SMW"
                    checked={dialysisSchedule === 'SMW'}
                    onChange={() => setDialysisSchedule('SMW')}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>
                    {isRtl ? 'السبت / الإثنين / الأربعاء (SMW)' : 'Sat / Mon / Wed (SMW)'}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="STT"
                    checked={dialysisSchedule === 'STT'}
                    onChange={() => setDialysisSchedule('STT')}
                    className="w-4 h-4 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                  />
                  <span>
                    {isRtl ? 'الأحد / الثلاثاء / الخميس (STT)' : 'Sun / Tue / Thu (STT)'}
                  </span>
                </label>
              </div>
            </div>

            {/* Dry Weight */}
            <div>
              <Input
                label={isRtl ? 'الوزن الجاف المستهدف (كجم)' : 'Target Dry Weight (kg)'}
                type="number"
                step="0.1"
                value={dryWeightKg}
                onChange={(e) => setDryWeightKg(e.target.value)}
                placeholder="70.5"
                error={errors.dryWeightKg}
              />
            </div>

            {/* Vascular Access */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isRtl ? 'نوع الوصلة الوعائية' : 'Vascular Access Type'}
              </label>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as DialysisAccessType)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
              >
                <option value="AVF">{isRtl ? 'وصلة وريدية شريانية (AVF)' : 'AV Fistula (AVF)'}</option>
                <option value="AVG">{isRtl ? 'وصلة صناعية (AVG)' : 'AV Graft (AVG)'}</option>
                <option value="Permcath">{isRtl ? 'قسطرة مستديمة (Permcath)' : 'Permcath'}</option>
                <option value="Mahurkar">{isRtl ? 'قسطرة مؤقتة (Mahurkar)' : 'Mahurkar'}</option>
              </select>
            </div>

            {/* Daily Fluid Limit */}
            <div className="md:col-span-3">
              <Input
                label={isRtl ? 'الحد الأقصى اليومي للسوائل (مليلتر - اختياري)' : 'Daily Fluid Allowance (mL - Optional)'}
                type="number"
                value={fluidLimit}
                onChange={(e) => setFluidLimit(e.target.value)}
                placeholder="1000"
                error={errors.fluidLimit}
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Patient App Credentials with Auto-Generation */}
        <Card
          title={
            <div className="flex items-center justify-between">
              <span>{isRtl ? 'بيانات حساب دخول المريض' : 'Patient Login Account'}</span>
              <button
                type="button"
                onClick={handleAutoGenerate}
                className="text-xs px-3 py-1.5 bg-blue-50 text-[#1e6bb8] hover:bg-blue-100 rounded-lg font-bold border border-blue-200 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{isRtl ? 'توليد تلقائي لبيانات الدخول' : 'Auto-Generate Credentials'}</span>
              </button>
            </div>
          }
          subtitle={
            isRtl
              ? 'اسم المستخدم = رقم الهاتف، وكلمة المرور = رقم الهاتف + 3 أحرف عشوائية غير مكررة'
              : 'Username = Phone number, Password = Phone + 3 random distinct letters'
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'اسم المستخدم (رقم الهاتف)' : 'Username (Phone)'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="01012345678"
              error={errors.username}
              required
            />

            <div>
              <Input
                label={isRtl ? 'كلمة المرور' : 'Password (min 6 characters)'}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="01012345678aBc"
                error={errors.password}
                required
              />
              {generatedSuffix && (
                <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                  ✓ {isRtl ? `تم إلحاق الرمز العشوائي: [${generatedSuffix}]` : `Random suffix appended: [${generatedSuffix}]`}
                </p>
              )}
            </div>
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
            className="font-bold shadow-md"
          >
            {tAdmin('createAccount') || (isRtl ? 'إنشاء وتفعيل حساب المريض' : 'Create & Activate Account')}
          </Button>
        </div>
      </form>

      {/* Generated Credentials Clinical Access Card Modal */}
      {createdCredentialsModal && (
        <Modal
          isOpen={Boolean(createdCredentialsModal)}
          onClose={() => router.push(`/${locale}/admin/patients`)}
          title={isRtl ? 'بطاقة بيانات دخول المريض (Waslity Access Card)' : 'Patient Waslity Access Card'}
        >
          <div className="space-y-4">
            <div className="p-4 bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {createdCredentialsModal.patient.fullNameAr || createdCredentialsModal.patient.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {createdCredentialsModal.patient.dialysisSchedule === 'SMW'
                      ? (isRtl ? 'جدول: السبت - الإثنين - الأربعاء' : 'Schedule: Sat - Mon - Wed')
                      : (isRtl ? 'جدول: الأحد - الثلاثاء - الخميس' : 'Schedule: Sun - Tue - Thu')}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#1e6bb8] text-white flex items-center justify-center font-bold text-sm">
                  DC
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                  <span className="text-slate-500 block mb-0.5">{isRtl ? 'اسم المستخدم:' : 'Username:'}</span>
                  <span className="font-mono font-bold text-slate-800 text-sm" dir="ltr">
                    {createdCredentialsModal.user.username}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                  <span className="text-slate-500 block mb-0.5">{isRtl ? 'كلمة المرور:' : 'Password:'}</span>
                  <span className="font-mono font-bold text-[#1e6bb8] text-sm" dir="ltr">
                    {createdCredentialsModal.rawPassword}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                <span>{isRtl ? 'الرابط:' : 'Link:'} waslity.vercel.app</span>
                <span className="text-emerald-700 font-semibold">{isRtl ? '● الحساب مفعّل' : '● Account Active'}</span>
              </div>
            </div>

            {copiedNotification && (
              <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-800 text-xs text-center font-semibold animate-in fade-in">
                {isRtl ? '✓ تم نسخ بيانات الدخول إلى الحافظة' : '✓ Credentials copied to clipboard'}
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCredentials}
                className="font-semibold text-xs"
              >
                📋 {isRtl ? 'نسخ بيانات الدخول' : 'Copy Credentials'}
              </Button>

              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
              >
                💬 {isRtl ? 'إرسال عبر واتساب للمريض' : 'Share via WhatsApp'}
              </button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                className="font-semibold text-xs"
              >
                🖨️ {isRtl ? 'طباعة البطاقة' : 'Print Access Card'}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push(`/${locale}/admin/patients`)}
                className="font-bold text-xs"
              >
                ✓ {isRtl ? 'تم / الذهاب للمرضى' : 'Done / Go to Directory'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
