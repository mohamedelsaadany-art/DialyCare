'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { PatientAvatarSvg } from '@/components/avatar/PatientAvatarPresets';
import { getPatientAvatar } from '@/lib/data-store';

interface PatientLayoutProps {
  children: React.ReactNode;
}

function PatientBottomNav() {
  const pathname = usePathname();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const tNav = useTranslations('nav');

  const navItems = [
    {
      href: `/${locale}/patient`,
      label: tNav('home') || (isAr ? 'الرئيسية' : 'Home'),
      emoji: '🏠',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      exact: true,
    },
    {
      href: `/${locale}/patient/reminders`,
      label: tNav('reminders') || (isAr ? 'التنبيهات' : 'Reminders'),
      emoji: '🔔',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      exact: false,
    },
    {
      href: `/${locale}/patient/log`,
      label: tNav('logs') || (isAr ? 'السجل' : 'Log'),
      emoji: '📝',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      exact: false,
    },
    {
      href: `/${locale}/patient/tips`,
      label: tNav('coachingTips') || (isAr ? 'النصائح' : 'Tips'),
      emoji: '💡',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      exact: false,
    },
    {
      href: `/${locale}/patient/profile`,
      label: tNav('profile') || (isAr ? 'حسابي' : 'Profile'),
      emoji: '👤',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      exact: false,
    },
  ];

  const isTabActive = (itemHref: string, exact: boolean) => {
    const normalizedPath = pathname?.replace(/\/$/, '') || '';
    const normalizedHref = itemHref.replace(/\/$/, '');
    if (exact) {
      return normalizedPath === normalizedHref;
    }
    return normalizedPath.startsWith(normalizedHref);
  };

  return (
    <nav
      role="navigation"
      aria-label={isAr ? 'التنقل الرئيسي' : 'Main navigation'}
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-md mx-auto px-2 flex items-center justify-around">
        {navItems.map((item) => {
          const active = isTabActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 px-1 min-h-[58px]
                transition-all duration-150 relative select-none rounded-xl
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e6bb8]
                ${
                  active
                    ? 'text-[#1e6bb8] font-bold'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }
              `}
            >
              <div
                className={`
                  p-1 rounded-xl transition-all duration-150 flex items-center justify-center
                  ${active ? 'bg-blue-50 text-[#1e6bb8] scale-105' : 'text-slate-500'}
                `}
              >
                <span className="text-xl leading-none" role="img" aria-hidden="true">
                  {item.emoji}
                </span>
              </div>
              <span className="text-[11px] tracking-tight mt-0.5 leading-tight font-semibold">
                {item.label}
              </span>
              {active && (
                <span
                  className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#1e6bb8]"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function PatientLayout({ children }: PatientLayoutProps) {
  const { user, loading, isStaff } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const isAr = locale === 'ar';

  const tCommon = useTranslations('common');

  const [headerAvatarId, setHeaderAvatarId] = useState<string>('male_mature_1');

  useEffect(() => {
    if (!loading) {
      if (!user || user.status !== 'active') {
        router.push(`/${locale}/login`);
      } else if (isStaff) {
        router.push(`/${locale}/admin`);
      }
    }
  }, [user, loading, isStaff, locale, router]);

  useEffect(() => {
    const updateAvatar = () => {
      const pId = user?.uid || 'patient-1';
      const current = getPatientAvatar(pId);
      if (current) {
        setHeaderAvatarId(current);
      }
    };
    updateAvatar();
    window.addEventListener('dialycare_avatar_updated', updateAvatar);
    window.addEventListener('dialycare_patient_updated', updateAvatar);
    return () => {
      window.removeEventListener('dialycare_avatar_updated', updateAvatar);
      window.removeEventListener('dialycare_patient_updated', updateAvatar);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <LoadingSpinner size="xl" color="primary" />
        <p className="text-slate-600 font-medium text-base">
          {tCommon('loading') || (isAr ? 'جاري التحميل...' : 'Loading Waslity...')}
        </p>
      </div>
    );
  }

  if (!user || isStaff || user.status !== 'active') {
    return null;
  }

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased selection:bg-blue-100 selection:text-blue-900"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <Link
            href={`/${locale}/patient`}
            className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e6bb8] rounded-xl min-h-[48px]"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1e6bb8] to-[#2196f3] flex items-center justify-center text-white font-black text-xl shadow-sm">
              {isAr ? 'و' : 'W'}
            </div>
            <div className="flex flex-col">
              <span className="font-black text-base tracking-tight text-slate-900 leading-tight">
                {tCommon('appName') || (isAr ? 'وَصْلِتي' : 'Waslity')}
              </span>
              <span className="text-[11px] font-medium text-slate-500 leading-none">
                {isAr ? 'إحنا وصلتك' : 'We are your connection'}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <LanguageToggle variant="badge" />

            {/* Quick Profile & Avatar Indicator */}
            <Link
              href={`/${locale}/patient/profile`}
              aria-label={isAr ? 'الملف الشخصي وإعدادات المظهر' : 'Patient profile and avatar settings'}
              title={isAr ? 'الملف الشخصي' : 'Patient Profile'}
              className="w-11 h-11 min-h-[48px] min-w-[48px] rounded-2xl bg-slate-100 hover:bg-slate-200 p-1 flex items-center justify-center border border-slate-200 shadow-2xs transition-transform active:scale-95"
            >
              <div className="w-8 h-8 rounded-xl overflow-hidden bg-white">
                <PatientAvatarSvg presetId={headerAvatarId} />
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 pb-28">
        {children}
      </main>

      {/* Fixed Bottom Navigation Bar wrapped in Suspense */}
      <Suspense
        fallback={
          <div className="fixed bottom-0 inset-x-0 h-[58px] bg-white border-t border-slate-200/90 shadow-sm" />
        }
      >
        <PatientBottomNav />
      </Suspense>
    </div>
  );
}
