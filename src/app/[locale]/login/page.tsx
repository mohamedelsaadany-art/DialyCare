'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ADMIN_CONFIG } from '@/lib/data-store';
import { fetchRegistrationStatus, REAUTH_NOTICE_KEY, reauthNoticeText } from '@/lib/session-client';
import type { User, DialysisAccessType } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

export default function LoginPage() {
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const isRtl = locale === 'ar';
  const { user, login, registerStaff, registerPatient, loading: authLoading } = useAuth();

  // Active Tab: 'signin' | 'signup'
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  // Sign In State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [signInError, setSignInError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [pendingAccount, setPendingAccount] = useState<User | null>(null);
  const [rejectedAccount, setRejectedAccount] = useState<{ user: User; reason?: string } | null>(null);
  const [reactivationNotice, setReactivationNotice] = useState<{
    name?: string;
    phone?: string;
    adminWhatsApp?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState('');

  // Sign Up Role: 'doctor' (staff) | 'patient'
  const [signupRole, setSignupRole] = useState<'doctor' | 'patient'>('doctor');
  const [staffRole, setStaffRole] = useState<'doctor' | 'nurse' | 'staff'>('doctor');

  // Staff / Doctor Registration Form State
  const [docFullName, setDocFullName] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docHospital, setDocHospital] = useState('');
  const [docPassword, setDocPassword] = useState('');
  const [docConfirmPassword, setDocConfirmPassword] = useState('');
  const [docIdCardDataUrl, setDocIdCardDataUrl] = useState<string | undefined>(undefined);
  const [docIdCardName, setDocIdCardName] = useState<string>('');
  const [doctorSuccessUser, setDoctorSuccessUser] = useState<User | null>(null);

  // Patient Registration Form State (3 Steps - Simplified)
  const [patientStep, setPatientStep] = useState<1 | 2 | 3>(1);
  const [patFullName, setPatFullName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patAge, setPatAge] = useState('');
  const [patGender, setPatGender] = useState<'male' | 'female'>('male');
  const [patSchedule, setPatSchedule] = useState<'SMW' | 'STT'>('SMW');
  const [patDryWeight, setPatDryWeight] = useState('');
  const [patAccessType, setPatAccessType] = useState<DialysisAccessType>('AVF');
  const [patDialysisCenter, setPatDialysisCenter] = useState('');
  const [patPassword, setPatPassword] = useState('');
  const [patConfirmPassword, setPatConfirmPassword] = useState('');
  const [patientSuccessUser, setPatientSuccessUser] = useState<User | null>(null);

  // General error for registration
  const [regError, setRegError] = useState('');

  // One-time notice after a forced re-login (e.g. a session cached before the
  // security update). The flag is consumed immediately, so no loop is possible.
  useEffect(() => {
    let show = false;
    try {
      if (window.sessionStorage.getItem(REAUTH_NOTICE_KEY)) {
        window.sessionStorage.removeItem(REAUTH_NOTICE_KEY);
        show = true;
      }
    } catch {
      // storage unavailable
    }
    if (!show) return;
    const timer = setTimeout(() => setStatusNotice(reauthNoticeText(locale)), 0);
    return () => clearTimeout(timer);
  }, [locale]);

  // If already authenticated and active, redirect to appropriate portal
  useEffect(() => {
    if (user && !authLoading) {
      if (user.role === 'admin' || user.role === 'doctor' || user.role === 'nurse' || user.role === 'staff') {
        router.push(`/${locale}/admin`);
      } else {
        router.push(`/${locale}/patient`);
      }
    }
  }, [user, authLoading, locale, router]);

  // Auto-polling for pending account status: automatically clears pending notice when approved
  useEffect(() => {
    if (!pendingAccount) return;

    const interval = setInterval(async () => {
      try {
        // Status-only endpoint: no account list ever leaves the server.
        const updated = await fetchRegistrationStatus(pendingAccount.uid);

        if (updated && updated.status === 'active') {
          setPendingAccount(null);
          setStatusNotice(
            isRtl
              ? `تهانينا ${pendingAccount.displayName}! تم اعتماد حسابك بنجاح. يمكنك الآن تسجيل الدخول مباشرة.`
              : `Congratulations ${pendingAccount.displayName}! Your account has been approved. You can now sign in.`
          );
          setIdentifier(pendingAccount.username || pendingAccount.phone || '');
        }
      } catch {
        // silent fallback
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [pendingAccount, isRtl]);

  // Clean raw phone for WhatsApp link
  const cleanAdminPhone = ADMIN_CONFIG.primaryPhone.replace(/\+/g, '').trim();

  // Handle manual check of approval status
  const handleCheckApprovalStatus = async () => {
    if (!pendingAccount) return;
    setIsCheckingApproval(true);
    setApprovalFeedback('');
    try {
      const updated = await fetchRegistrationStatus(pendingAccount.uid);
      if (!updated) throw new Error('status unavailable');

      if (updated.status === 'active') {
        setPendingAccount(null);
        setStatusNotice(
          isRtl
            ? `تهانينا ${pendingAccount.displayName}! تم اعتماد حسابك بنجاح من قبل الإدارة الطبية. يرجى تسجيل الدخول.`
            : `Congratulations ${pendingAccount.displayName}! Your account has been approved. Please sign in.`
        );
        setIdentifier(pendingAccount.username || pendingAccount.phone || '');
      } else {
        setApprovalFeedback(
          isRtl
            ? 'تم التحقق من الخادم: ما زال الحساب قيد المراجعة والاعتماد لدى الإدارة الطبية.'
            : 'Checked server: Account is still awaiting clinical review by medical admin.'
        );
      }
    } catch {
      setApprovalFeedback(
        isRtl ? 'تعذر الاتصال بالخادم حالياً. يرجى المحاولة بعد قليل.' : 'Could not reach server. Please try again.'
      );
    } finally {
      setIsCheckingApproval(false);
    }
  };

  // Handle Sign In submission
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError('');
    setStatusNotice('');
    setPendingAccount(null);
    setRejectedAccount(null);
    setReactivationNotice(null);

    if (!identifier.trim() || !password.trim()) {
      setSignInError(tAuth('invalidCredentials'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(identifier, password, rememberMe);
      if (res.success && res.user) {
        if (res.user.role === 'admin' || res.user.role === 'doctor' || res.user.role === 'nurse' || res.user.role === 'staff') {
          router.push(`/${locale}/admin`);
        } else {
          router.push(`/${locale}/patient`);
        }
      } else if (res.status === 'pending_reactivation' || res.error === 'accountArchivedOnHold') {
        setReactivationNotice({
          name: res.patientName || identifier,
          phone: res.phone || identifier,
          adminWhatsApp: res.adminWhatsApp || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '+201012345678',
        });
      } else if (res.status === 'pending' && res.user) {
        setPendingAccount(res.user);
      } else if (res.status === 'rejected' && res.user) {
        setRejectedAccount({ user: res.user, reason: res.rejectionReason });
      } else if (res.error === 'loginError') {
        setSignInError(
          isRtl
            ? 'تعذّر الاتصال بالخادم. يرجى التحقق من الإنترنت والمحاولة مرة أخرى.'
            : 'Could not reach the server. Please check your connection and try again.'
        );
      } else {
        setSignInError(tAuth('invalidCredentials'));
      }
    } catch {
      setSignInError(tAuth('loginError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Medical ID card photo selection
  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setRegError(isRtl ? 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت' : 'Image size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDocIdCardDataUrl(reader.result as string);
      setDocIdCardName(file.name);
      setRegError('');
    };
    reader.readAsDataURL(file);
  };

  // Handle Doctor Registration
  const handleDoctorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!docFullName.trim()) {
      setRegError(isRtl ? 'يرجى كتابة الاسم الكامل' : 'Please enter your full name');
      return;
    }
    if (!docPhone.trim()) {
      setRegError(tAuth('phoneRequired'));
      return;
    }
    if (!docHospital.trim()) {
      setRegError(isRtl ? 'يرجى كتابة المستشفى أو مركز الغسيل' : 'Please enter hospital or center');
      return;
    }
    if (docPassword.length < 6) {
      setRegError(tAuth('passwordTooShort'));
      return;
    }
    if (docPassword !== docConfirmPassword) {
      setRegError(tAuth('passwordsDoNotMatch'));
      return;
    }

    setIsSubmitting(true);
    const defaultSpecialty =
      staffRole === 'nurse'
        ? (isRtl ? 'تمريض كلى وغسيل كلوي' : 'Nephrology Nurse')
        : staffRole === 'staff'
        ? (isRtl ? 'إدارة وتنسيق وحدة الكلى' : 'Dialysis Unit Admin')
        : (isRtl ? 'طبيب أمراض كلى وغسيل كلوي' : 'Nephrologist');

    try {
      const newUser = await registerStaff({
        fullName: docFullName.trim(),
        username: docPhone.trim().replace(/[\s\-\(\)\+]/g, ''),
        phone: docPhone.trim(),
        email: docEmail.trim() || undefined,
        role: staffRole,
        specialty: docSpecialty.trim() || defaultSpecialty,
        hospital: docHospital.trim(),
        password: docPassword,
        idCardDataUrl: docIdCardDataUrl,
        language: locale as 'ar' | 'en',
      });
      setDoctorSuccessUser(newUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setRegError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Patient Registration
  const handlePatientStepNext = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (patientStep === 1) {
      if (!patFullName.trim()) {
        setRegError(isRtl ? 'يرجى إدخال اسم المريض الكامل' : 'Please enter patient full name');
        return;
      }
      if (!patPhone.trim()) {
        setRegError(tAuth('phoneRequired'));
        return;
      }
      setPatientStep(2);
      return;
    }

    if (patientStep === 2) {
      if (patDryWeight && (isNaN(Number(patDryWeight)) || Number(patDryWeight) <= 0)) {
        setRegError(isRtl ? 'يرجى إدخال وزن جاف صحيح بالكيلوجرام' : 'Please enter valid dry weight in kg');
        return;
      }
      setPatientStep(3);
      return;
    }

    if (patientStep === 3) {
      if (patPassword.length < 6) {
        setRegError(tAuth('passwordTooShort'));
        return;
      }
      if (patPassword !== patConfirmPassword) {
        setRegError(tAuth('passwordsDoNotMatch'));
        return;
      }

      submitPatientRegistration();
    }
  };

  const submitPatientRegistration = async () => {
    setIsSubmitting(true);
    setRegError('');
    setReactivationNotice(null);
    try {
      const dryWeight = patDryWeight && Number(patDryWeight) > 0 ? Number(patDryWeight) : 70;
      const newUser = await registerPatient({
        fullName: patFullName.trim(),
        phone: patPhone.trim(),
        password: patPassword,
        language: locale as 'ar' | 'en',
        profile: {
          dialysisSchedule: patSchedule,
          dryWeightKg: dryWeight,
          accessType: patAccessType,
          dialysisCenter: patDialysisCenter.trim() || (isRtl ? 'وحدة الغسيل الكلوي' : 'Hemodialysis Unit'),
          age: patAge ? Number(patAge) : undefined,
          gender: patGender,
        },
      });

      if (newUser.reactivationStatus === 'pending' || (newUser as any).status === 'pending_reactivation') {
        setReactivationNotice({
          name: patFullName.trim(),
          phone: patPhone.trim(),
          adminWhatsApp: (newUser as any).adminWhatsApp || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '+201012345678',
        });
        return;
      }

      // registerPatient() already registered the account on the server (awaited) before caching it locally.
      setPatientSuccessUser(newUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Patient registration failed';
      setRegError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format WhatsApp message for staff notification
  const getDoctorWhatsAppUrl = () => {
    if (!doctorSuccessUser) return `https://wa.me/${cleanAdminPhone}`;
    const rolePrefix =
      doctorSuccessUser.role === 'nurse'
        ? (isRtl ? 'التمريض' : 'Nurse')
        : doctorSuccessUser.role === 'staff'
        ? (isRtl ? 'إدارة الوحدة' : 'Unit Admin')
        : (isRtl ? 'د/' : 'Dr.');
    const text = isRtl
      ? `السلام عليكم، أنا ${rolePrefix} ${doctorSuccessUser.displayName} (${doctorSuccessUser.specialty || 'كادر طبي'} - ${doctorSuccessUser.hospital || 'مركز الغسيل'}). قمت بإنشاء حساب جديد على منصة وَصْلِتي وأرجو اعتماد الحساب. رقم هاتفي: ${doctorSuccessUser.phone || ''}`
      : `Hello, I am ${rolePrefix} ${doctorSuccessUser.displayName} (${doctorSuccessUser.specialty} at ${doctorSuccessUser.hospital}). I have registered on Waslity and am awaiting account verification. Phone: ${doctorSuccessUser.phone}`;
    return `https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(text)}`;
  };

  // Format WhatsApp message for archived patient reactivation
  const getReactivationWhatsAppUrl = (notice: { name?: string; phone?: string; adminWhatsApp?: string }) => {
    const rawAdmin = notice.adminWhatsApp || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '+201012345678';
    let cleanPhone = rawAdmin.replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '20' + cleanPhone.slice(1);
    if (!cleanPhone) cleanPhone = '201012345678';

    const pName = notice.name || '';
    const pPhone = notice.phone || '';

    const text = isRtl
      ? `السلام عليكم، أنا المريض/ة ${pName}، ورقم هاتفي: ${pPhone}. تم العثور على ملفي الطبي في الأرشيف المؤقت وأرجو استعادة بياناتي السريرية وتفعيل حسابي على منصة وَصْلِتي.`
      : `Hello, I am patient ${pName}, phone: ${pPhone}. My medical record is currently on hold in the archive. Please restore my clinical data and reactivate my account on Waslity.`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  // Format WhatsApp message for pending account login inquiry
  const getPendingInquiryWhatsAppUrl = (acc: User) => {
    const roleLabel =
      acc.role === 'nurse'
        ? (isRtl ? 'التمريض ' : 'Nurse ')
        : acc.role === 'staff'
        ? (isRtl ? 'إدارة الوحدة ' : 'Unit Admin ')
        : acc.role === 'doctor'
        ? (isRtl ? 'د/ ' : 'Dr. ')
        : (isRtl ? 'المريض ' : 'Patient ');
    const text = isRtl
      ? `السلام عليكم، أنا ${roleLabel}${acc.displayName}، قمت بالتسجيل في تطبيق وَصْلِتي ورقم هاتفي: ${acc.phone || acc.username}. حسابي قيد المراجعة وأرجو تفعيله.`
      : `Hello, I am ${roleLabel}${acc.displayName}. I registered on Waslity with phone: ${acc.phone || acc.username}. My account is pending review, please approve.`;
    return `https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50/70 via-slate-50 to-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header with App Branding & Language Toggle */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1e6bb8] text-white flex items-center justify-center shadow-md font-bold text-xl">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {tCommon('appName')}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {tCommon('appTagline')}
            </p>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Main Container */}
      <main className="w-full max-w-lg mx-auto my-auto py-6">
        <Card className="border-slate-200/90 shadow-xl overflow-hidden">
          {/* Top Switcher Tabs (Sign In vs Sign Up) */}
          <div className="grid grid-cols-2 bg-slate-100/90 p-1.5 border-b border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setSignInError('');
                setPendingAccount(null);
                setRejectedAccount(null);
              }}
              className={`py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                tab === 'signin'
                  ? 'bg-white text-[#1e6bb8] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>{tAuth('signInTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setRegError('');
                setDoctorSuccessUser(null);
                setPatientSuccessUser(null);
              }}
              className={`py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                tab === 'signup'
                  ? 'bg-white text-[#1e6bb8] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>{tAuth('signUpTab')}</span>
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* ============================================================== */}
            {/* TAB 1: SIGN IN                                                  */}
            {/* ============================================================== */}
            {tab === 'signin' && (
              <div>
                {/* Reactivation Notice Card */}
                {reactivationNotice ? (
                  <div className="p-5 rounded-2xl bg-emerald-50/90 border border-emerald-300 text-slate-800 space-y-4 animate-in fade-in" data-testid="reactivation-notice-card">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-emerald-900">
                          {tAuth('accountArchivedOnHold')}
                        </h3>
                        <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                          {isRtl
                            ? 'تم العثور على ملفك الطبي السابق وهو معلق في الأرشيف المؤقت. لاستعادة بياناتك السريرية وتفعيل حسابك، يرجى مراسلة إدارة المركز عبر واتساب.'
                            : 'Your medical record is currently on hold in the archive. To restore your data and reactivate your account, please message the Admin on WhatsApp.'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 p-3 rounded-xl border border-emerald-200/80 text-xs space-y-1.5">
                      {reactivationNotice.name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRtl ? 'اسم المريض:' : 'Patient Name:'}</span>
                          <span className="font-bold text-slate-800">{reactivationNotice.name}</span>
                        </div>
                      )}
                      {reactivationNotice.phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRtl ? 'رقم الهاتف:' : 'Phone Number:'}</span>
                          <span className="font-mono text-slate-700" dir="ltr">{reactivationNotice.phone}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'حالة السجل:' : 'Record Status:'}</span>
                        <span className="font-semibold text-emerald-700">{isRtl ? 'معلق في الأرشيف المؤقت' : 'On hold in temporary archive'}</span>
                      </div>
                    </div>

                    <a
                      href={getReactivationWhatsAppUrl(reactivationNotice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-md text-sm transition-all transform active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                      <span>{tAuth('contactAdminWhatsApp')}</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => {
                        setReactivationNotice(null);
                        setTab('signin');
                      }}
                    >
                      {tAuth('backToLoginBtn')}
                    </Button>
                  </div>
                ) : pendingAccount ? (
                  <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-300 text-slate-800 space-y-4 animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-amber-900">
                          {tAuth('accountPendingTitle')}
                        </h3>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                          {tAuth('accountPendingDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 p-3 rounded-xl border border-amber-200/80 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'صاحب الحساب:' : 'Account Holder:'}</span>
                        <span className="font-bold text-slate-800">{pendingAccount.displayName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'الدور المتقدم له:' : 'Applied Role:'}</span>
                        <span className="font-semibold text-[#1e6bb8]">
                          {pendingAccount.role === 'doctor' ? tAuth('roleDoctor') : tAuth('rolePatient')}
                        </span>
                      </div>
                      {pendingAccount.phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRtl ? 'رقم الهاتف:' : 'Phone:'}</span>
                          <span className="font-mono text-slate-700" dir="ltr">{pendingAccount.phone}</span>
                        </div>
                      )}
                    </div>

                    {approvalFeedback && (
                      <div className="p-3 bg-white/95 rounded-xl border border-amber-300 text-xs font-medium text-amber-900 animate-in fade-in">
                        {approvalFeedback}
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="primary"
                      className="w-full bg-[#1e6bb8] hover:bg-[#175492] text-white font-bold py-3 rounded-xl shadow-sm text-sm"
                      onClick={handleCheckApprovalStatus}
                      isLoading={isCheckingApproval}
                    >
                      {isRtl ? '🔄 التحقق من حالة الاعتماد الآن' : '🔄 Check Approval Status Now'}
                    </Button>

                    <a
                      href={getPendingInquiryWhatsAppUrl(pendingAccount)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-sm text-sm transition-colors"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                      <span>{tAuth('whatsappInquiryBtn')}</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => setPendingAccount(null)}
                    >
                      {tAuth('backToLoginBtn')}
                    </Button>
                  </div>
                ) : rejectedAccount ? (
                  /* Rejected Account Notice Card */
                  <div className="p-5 rounded-2xl bg-red-50/90 border border-red-300 text-slate-800 space-y-4 animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-red-900">
                          {tAuth('accountRejectedTitle')}
                        </h3>
                        <p className="text-xs text-red-800 mt-1 leading-relaxed">
                          {tAuth('accountRejectedDesc')}
                        </p>
                      </div>
                    </div>

                    {rejectedAccount.reason && (
                      <div className="p-3 bg-white/90 rounded-xl border border-red-200 text-xs text-red-800">
                        <strong className="block mb-1">{tAuth('rejectionReasonLabel')}</strong>
                        <p>{rejectedAccount.reason}</p>
                      </div>
                    )}

                    <a
                      href={`https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(isRtl ? `السلام عليكم، تم رفض حسابي على وَصْلِتي (${rejectedAccount.user.displayName}). أرجو التوضيح.` : `Hello, my registration was rejected (${rejectedAccount.user.displayName}). Please advise.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-sm text-sm transition-colors"
                    >
                      <span>{tAuth('whatsappInquiryBtn')}</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => setRejectedAccount(null)}
                    >
                      {tAuth('backToLoginBtn')}
                    </Button>
                  </div>
                ) : (
                  /* Standard Sign In Form */
                  <>
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                        {tAuth('loginTitle')}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {tAuth('loginSubtitle')}
                      </p>
                    </div>

                    {statusNotice && (
                      <div
                        className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
                        role="status"
                      >
                        <svg className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">{statusNotice}</span>
                      </div>
                    )}

                    {signInError && (
                      <div
                        className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
                        role="alert"
                      >
                        <svg className="w-5 h-5 shrink-0 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">{signInError}</span>
                      </div>
                    )}

                    <form onSubmit={handleSignIn} className="space-y-4">
                      <Input
                        label={tAuth('identifier')}
                        placeholder={tAuth('identifierPlaceholder')}
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        required
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        leftIcon={
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        }
                      />

                      <Input
                        type="password"
                        label={tAuth('password')}
                        placeholder={tAuth('passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        leftIcon={
                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        }
                      />

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-[#1e6bb8] focus:ring-[#1e6bb8]"
                          />
                          <span className="text-xs sm:text-sm font-medium text-slate-700">
                            {tAuth('rememberMe')}
                          </span>
                        </label>
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        fullWidth
                        isLoading={isSubmitting || authLoading}
                        className="font-bold py-3 text-sm shadow-md"
                      >
                        {tAuth('loginButton')}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: SIGN UP                                                  */}
            {/* ============================================================== */}
            {tab === 'signup' && (
              <div>
                {/* Reactivation Notice Card */}
                {reactivationNotice ? (
                  <div className="p-5 rounded-2xl bg-emerald-50/90 border border-emerald-300 text-slate-800 space-y-4 animate-in fade-in" data-testid="reactivation-notice-card">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-emerald-900">
                          {tAuth('accountArchivedOnHold')}
                        </h3>
                        <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                          {isRtl
                            ? 'تم العثور على ملفك الطبي السابق وهو معلق في الأرشيف المؤقت. لاستعادة بياناتك السريرية وتفعيل حسابك، يرجى مراسلة إدارة المركز عبر واتساب.'
                            : 'Your medical record is currently on hold in the archive. To restore your data and reactivate your account, please message the Admin on WhatsApp.'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 p-3 rounded-xl border border-emerald-200/80 text-xs space-y-1.5">
                      {reactivationNotice.name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRtl ? 'اسم المريض:' : 'Patient Name:'}</span>
                          <span className="font-bold text-slate-800">{reactivationNotice.name}</span>
                        </div>
                      )}
                      {reactivationNotice.phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isRtl ? 'رقم الهاتف:' : 'Phone Number:'}</span>
                          <span className="font-mono text-slate-700" dir="ltr">{reactivationNotice.phone}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'حالة السجل:' : 'Record Status:'}</span>
                        <span className="font-semibold text-emerald-700">{isRtl ? 'معلق في الأرشيف المؤقت' : 'On hold in temporary archive'}</span>
                      </div>
                    </div>

                    <a
                      href={getReactivationWhatsAppUrl(reactivationNotice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-md text-sm transition-all transform active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                      <span>{tAuth('contactAdminWhatsApp')}</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => {
                        setReactivationNotice(null);
                        setTab('signin');
                      }}
                    >
                      {tAuth('backToLoginBtn')}
                    </Button>
                  </div>
                ) : doctorSuccessUser ? (
                  <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-slate-800 space-y-4 animate-in fade-in text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-emerald-950">
                        {tAuth('doctorRegSuccessTitle')}
                      </h3>
                      <p className="text-xs text-emerald-900 mt-2 leading-relaxed">
                        {tAuth('doctorRegSuccessDesc')}
                      </p>
                    </div>

                    <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 text-xs text-right space-y-1">
                      <div><strong>{isRtl ? 'الطبيب:' : 'Doctor:'}</strong> {doctorSuccessUser.displayName}</div>
                      <div><strong>{isRtl ? 'المستشفى:' : 'Hospital:'}</strong> {doctorSuccessUser.hospital}</div>
                      <div><strong>{isRtl ? 'الهاتف:' : 'Phone:'}</strong> <span dir="ltr">{doctorSuccessUser.phone}</span></div>
                    </div>

                    <a
                      href={getDoctorWhatsAppUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl shadow-md text-sm transition-transform active:scale-95"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                      <span>{tAuth('whatsappInquiryBtn')}</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => {
                        setDoctorSuccessUser(null);
                        setTab('signin');
                      }}
                    >
                      {tAuth('backToLoginBtn')}
                    </Button>
                  </div>
                ) : patientSuccessUser ? (
                  /* Patient Registration Success Screen */
                  <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-slate-800 space-y-4 animate-in fade-in text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-emerald-950">
                        {isRtl ? 'تم تفعيل الحساب وتسجيل المريض بنجاح ✓' : 'Account Activated & Patient Enrolled ✓'}
                      </h3>
                      <p className="text-xs text-emerald-900 mt-2 leading-relaxed">
                        {isRtl
                          ? 'تم تفعيل حسابك مباشرة وإدراجك رسمياً في سجلات وحدة الغسيل الكلوي. يمكنك الآن تسجيل الدخول فوراً.'
                          : 'Your account has been activated and enrolled in the dialysis registry. You can log in immediately.'}
                      </p>
                    </div>

                    <div className="bg-white/90 p-3.5 rounded-xl border border-emerald-200 text-xs text-right space-y-1.5">
                      <div><strong>{isRtl ? 'اسم المريض:' : 'Patient Name:'}</strong> {patientSuccessUser.displayName}</div>
                      <div><strong>{isRtl ? 'اسم المستخدم (الهاتف):' : 'Username (Phone):'}</strong> <span dir="ltr" className="font-mono font-bold text-[#1e6bb8]">{patientSuccessUser.phone}</span></div>
                      <div><strong>{isRtl ? 'جدول الغسيل:' : 'Schedule:'}</strong> {patientSuccessUser.patientProfile?.dialysisSchedule === 'SMW' ? tAuth('scheduleSMWLabel') : tAuth('scheduleSTTLabel')}</div>
                      <div><strong>{isRtl ? 'الوزن الجاف:' : 'Dry Weight:'}</strong> {patientSuccessUser.patientProfile?.dryWeightKg} {isRtl ? 'كجم' : 'kg'}</div>
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      onClick={() => {
                        const targetId = patientSuccessUser.phone || patientSuccessUser.username;
                        setPatientSuccessUser(null);
                        setTab('signin');
                        setIdentifier(targetId);
                        setPassword('');
                      }}
                      className="font-bold py-3 text-sm shadow-md"
                    >
                      {isRtl ? 'تسجيل الدخول الآن ➔' : 'Sign In Now ➔'}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Role Selector Tabs (Doctor vs Patient) */}
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        {tAuth('selectRole')}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSignupRole('doctor');
                            setRegError('');
                          }}
                          className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 ${
                            signupRole === 'doctor'
                              ? 'border-[#1e6bb8] bg-blue-50/60 ring-2 ring-[#1e6bb8]/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900">{isRtl ? 'كادر طبي / إداري' : 'Clinical Staff'}</span>
                            <span className="text-lg">🩺</span>
                          </div>
                          <span className="text-[11px] text-slate-500 leading-tight">
                            {isRtl ? 'أطباء، هيئة تمريض، إداريو الوحدة' : 'Doctors, nurses, unit admins'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSignupRole('patient');
                            setRegError('');
                          }}
                          className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 ${
                            signupRole === 'patient'
                              ? 'border-[#1e6bb8] bg-blue-50/60 ring-2 ring-[#1e6bb8]/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900">{tAuth('rolePatient')}</span>
                            <span className="text-lg">💧</span>
                          </div>
                          <span className="text-[11px] text-slate-500 leading-tight">
                            {tAuth('rolePatientDesc')}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Registration Error Banner */}
                    {regError && (
                      <div
                        className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-in fade-in"
                        role="alert"
                      >
                        <svg className="w-4 h-4 shrink-0 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">{regError}</span>
                      </div>
                    )}

                    {/* -------------------------------------------------------- */}
                    {/* DOCTOR REGISTRATION FORM                                 */}
                    {/* -------------------------------------------------------- */}
                    {signupRole === 'doctor' && (
                      <form onSubmit={handleDoctorRegister} className="space-y-3.5">
                        {/* Staff Sub-Role Selector */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            {isRtl ? 'المسمى والتصنيف الوظيفي:' : 'Staff Classification:'}
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setStaffRole('doctor');
                                setDocSpecialty('');
                              }}
                              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                staffRole === 'doctor'
                                  ? 'border-[#1e6bb8] bg-blue-50 text-[#1e6bb8] ring-2 ring-[#1e6bb8]/20 font-black'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span>👨‍⚕️</span>
                              <span>{isRtl ? 'طبيب' : 'Doctor'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStaffRole('nurse');
                                setDocSpecialty('');
                              }}
                              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                staffRole === 'nurse'
                                  ? 'border-[#1e6bb8] bg-blue-50 text-[#1e6bb8] ring-2 ring-[#1e6bb8]/20 font-black'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span>👩‍⚕️</span>
                              <span>{isRtl ? 'تمريض' : 'Nurse'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStaffRole('staff');
                                setDocSpecialty('');
                              }}
                              className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                staffRole === 'staff'
                                  ? 'border-[#1e6bb8] bg-blue-50 text-[#1e6bb8] ring-2 ring-[#1e6bb8]/20 font-black'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span>📋</span>
                              <span>{isRtl ? 'إداري' : 'Admin'}</span>
                            </button>
                          </div>
                        </div>

                        <Input
                          label={tAuth('fullName')}
                          placeholder={tAuth('fullNamePlaceholder')}
                          value={docFullName}
                          onChange={(e) => setDocFullName(e.target.value)}
                          required
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input
                            label={tAuth('phoneNumber')}
                            placeholder={tAuth('phonePlaceholder')}
                            value={docPhone}
                            onChange={(e) => setDocPhone(e.target.value)}
                            required
                            type="tel"
                          />
                          <Input
                            label={tAuth('email')}
                            placeholder={tAuth('emailPlaceholder')}
                            value={docEmail}
                            onChange={(e) => setDocEmail(e.target.value)}
                            type="email"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input
                            label={tAuth('specialty')}
                            placeholder={tAuth('specialtyPlaceholder')}
                            value={docSpecialty}
                            onChange={(e) => setDocSpecialty(e.target.value)}
                            required
                          />
                          <Input
                            label={tAuth('hospital')}
                            placeholder={tAuth('hospitalPlaceholder')}
                            value={docHospital}
                            onChange={(e) => setDocHospital(e.target.value)}
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input
                            type="password"
                            label={tAuth('password')}
                            placeholder={tAuth('passwordPlaceholder')}
                            value={docPassword}
                            onChange={(e) => setDocPassword(e.target.value)}
                            required
                          />
                          <Input
                            type="password"
                            label={tAuth('confirmPassword')}
                            placeholder={tAuth('confirmPasswordPlaceholder')}
                            value={docConfirmPassword}
                            onChange={(e) => setDocConfirmPassword(e.target.value)}
                            required
                          />
                        </div>

                        {/* Medical ID Card Photo Upload */}
                        <div className="pt-1">
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            {tAuth('medicalIdUpload')}
                          </label>
                          {docIdCardDataUrl ? (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={docIdCardDataUrl}
                                  alt="Medical ID"
                                  className="w-12 h-12 object-cover rounded-lg border border-slate-300"
                                />
                                <div className="text-xs truncate">
                                  <p className="font-semibold text-slate-800 truncate">{docIdCardName || 'ID_Card.jpg'}</p>
                                  <p className="text-emerald-600 font-medium text-[11px]">{isRtl ? 'تم تحميل الصورة بنجاح' : 'Uploaded successfully'}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setDocIdCardDataUrl(undefined);
                                  setDocIdCardName('');
                                }}
                                className="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1"
                              >
                                {tAuth('removePhoto')}
                              </button>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-slate-300 hover:border-[#1e6bb8] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/20 transition-all">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleIdCardChange}
                                className="hidden"
                              />
                              <svg className="w-8 h-8 text-slate-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="text-xs text-slate-600 font-semibold text-center">
                                {tAuth('uploadPrompt')}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {isRtl ? 'الحد الأقصى 5 ميجابايت' : 'Max 5MB'}
                              </span>
                            </label>
                          )}
                        </div>

                        <Button
                          type="submit"
                          variant="primary"
                          size="lg"
                          fullWidth
                          isLoading={isSubmitting}
                          className="mt-3 font-bold shadow-md"
                        >
                          {tAuth('registerDoctorSubmit')}
                        </Button>
                      </form>
                    )}

                    {/* -------------------------------------------------------- */}
                    {/* PATIENT REGISTRATION FORM (3 STEPS)                       */}
                    {/* -------------------------------------------------------- */}
                    {signupRole === 'patient' && (
                      <div>
                        {/* Stepper indicator */}
                        <div className="flex items-center justify-between mb-5 px-2">
                          {[
                            { num: 1, label: tAuth('patientStep1Title') },
                            { num: 2, label: tAuth('patientStep2Title') },
                            { num: 3, label: tAuth('patientStep3Title') },
                          ].map((s) => (
                            <div key={s.num} className="flex flex-col items-center">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                                  patientStep === s.num
                                    ? 'bg-[#1e6bb8] text-white shadow-md ring-4 ring-blue-100'
                                    : patientStep > s.num
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {patientStep > s.num ? '✓' : s.num}
                              </div>
                              <span className="text-[10px] text-slate-600 font-medium mt-1">
                                {s.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        <form onSubmit={handlePatientStepNext} className="space-y-3.5">
                          {/* Step 1: Personal Info */}
                          {patientStep === 1 && (
                            <div className="space-y-3 animate-in fade-in">
                              <Input
                                label={tAuth('fullName')}
                                placeholder={tAuth('patientNamePlaceholder')}
                                value={patFullName}
                                onChange={(e) => setPatFullName(e.target.value)}
                                required
                              />

                              <Input
                                label={tAuth('phoneNumber')}
                                placeholder={tAuth('phonePlaceholder')}
                                value={patPhone}
                                onChange={(e) => setPatPhone(e.target.value)}
                                required
                                type="tel"
                              />

                              <div className="grid grid-cols-2 gap-3">
                                <Input
                                  label={tAuth('ageLabel')}
                                  placeholder="54"
                                  type="number"
                                  value={patAge}
                                  onChange={(e) => setPatAge(e.target.value)}
                                />

                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    {tAuth('genderLabel')}
                                  </label>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setPatGender('male')}
                                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                                        patGender === 'male'
                                          ? 'border-[#1e6bb8] bg-blue-50 text-[#1e6bb8]'
                                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      {tAuth('genderMale')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPatGender('female')}
                                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                                        patGender === 'female'
                                          ? 'border-[#1e6bb8] bg-blue-50 text-[#1e6bb8]'
                                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      {tAuth('genderFemale')}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Step 2: Nephrology Profile */}
                          {patientStep === 2 && (
                            <div className="space-y-3 animate-in fade-in">
                              {/* Strict 2-Option Schedule Selector */}
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                  {tAuth('scheduleLabel')}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPatSchedule('SMW')}
                                    className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-0.5 ${
                                      patSchedule === 'SMW'
                                        ? 'border-[#1e6bb8] bg-blue-50/80 ring-2 ring-[#1e6bb8]/20'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                  >
                                    <span className="text-xs font-bold text-slate-900">
                                      {tAuth('scheduleSMWLabel')}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {isRtl ? 'جلسات: السبت، الإثنين، الأربعاء' : 'Sat / Mon / Wed sessions'}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setPatSchedule('STT')}
                                    className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-0.5 ${
                                      patSchedule === 'STT'
                                        ? 'border-[#1e6bb8] bg-blue-50/80 ring-2 ring-[#1e6bb8]/20'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                  >
                                    <span className="text-xs font-bold text-slate-900">
                                      {tAuth('scheduleSTTLabel')}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {isRtl ? 'جلسات: الأحد، الثلاثاء، الخميس' : 'Sun / Tue / Thu sessions'}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Input
                                  label={tAuth('dryWeightKgLabel')}
                                  placeholder={tAuth('dryWeightPlaceholder')}
                                  type="number"
                                  step="0.1"
                                  value={patDryWeight}
                                  onChange={(e) => setPatDryWeight(e.target.value)}
                                  required
                                />

                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    {tAuth('vascularAccessLabel')}
                                  </label>
                                  <select
                                    value={patAccessType}
                                    onChange={(e) => setPatAccessType(e.target.value as DialysisAccessType)}
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
                                  >
                                    <option value="AVF">{isRtl ? 'وصلة وريدية شريانية (AVF)' : 'AV Fistula (AVF)'}</option>
                                    <option value="AVG">{isRtl ? 'وصلة صناعية (AVG)' : 'AV Graft (AVG)'}</option>
                                    <option value="Permcath">{isRtl ? 'قسطرة مستديمة (Permcath)' : 'Permcath'}</option>
                                    <option value="Mahurkar">{isRtl ? 'قسطرة مؤقتة (Mahurkar)' : 'Mahurkar'}</option>
                                  </select>
                                </div>
                              </div>

                              <Input
                                label={tAuth('hospital')}
                                placeholder={tAuth('hospitalPlaceholder')}
                                value={patDialysisCenter}
                                onChange={(e) => setPatDialysisCenter(e.target.value)}
                              />
                            </div>
                          )}

                          {/* Step 3: Password */}
                          {patientStep === 3 && (
                            <div className="space-y-3 animate-in fade-in">
                              <Input
                                type="password"
                                label={tAuth('password')}
                                placeholder={tAuth('passwordPlaceholder')}
                                value={patPassword}
                                onChange={(e) => setPatPassword(e.target.value)}
                                required
                              />

                              <Input
                                type="password"
                                label={tAuth('confirmPassword')}
                                placeholder={tAuth('confirmPasswordPlaceholder')}
                                value={patConfirmPassword}
                                onChange={(e) => setPatConfirmPassword(e.target.value)}
                                required
                              />

                              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-[11px] text-slate-600 leading-relaxed">
                                {isRtl
                                  ? '💡 سيتم استخدام رقم هاتفك المحمول كاسم مستخدم لحسابك تلقائياً.'
                                  : '💡 Your phone number will automatically be used as your login username.'}
                              </div>
                            </div>
                          )}

                          {/* Stepper Navigation Buttons */}
                          <div className="flex items-center gap-2 pt-2">
                            {patientStep > 1 && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => {
                                  setPatientStep((prev) => (prev - 1) as 1 | 2 | 3);
                                  setRegError('');
                                }}
                                className="w-1/3"
                              >
                                {tAuth('prevStep')}
                              </Button>
                            )}

                            <Button
                              type="submit"
                              variant="primary"
                              size="md"
                              fullWidth={patientStep === 1}
                              isLoading={isSubmitting}
                              className={patientStep > 1 ? 'w-2/3 font-bold shadow-md' : 'font-bold shadow-md'}
                            >
                              {patientStep === 3 ? tAuth('registerPatientSubmit') : tAuth('nextStep')}
                            </Button>
                          </div>
                        </form>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400 py-3">
        {tAuth('copyright')}
      </footer>
    </div>
  );
}
