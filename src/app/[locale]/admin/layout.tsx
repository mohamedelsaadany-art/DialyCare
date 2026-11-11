'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import LanguageToggle from '@/components/ui/LanguageToggle';
import Button from '@/components/ui/Button';
import {
  DashboardIcon,
  PatientsIcon,
  RemindersIcon,
  NotificationsIcon,
  TipsIcon,
  SettingsIcon,
  SearchIcon,
  MenuIcon,
  CloseIcon,
  LogoutIcon,
  DialyCareLogo,
} from './admin-icons';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, logout, isAdmin } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');

  const isRtl = locale === 'ar';

  // Navigation Items
  const navItems = [
    {
      href: `/${locale}/admin`,
      exact: true,
      label: tNav('dashboard') || (isRtl ? 'لوحة المعلومات' : 'Dashboard'),
      icon: DashboardIcon,
    },
    {
      href: `/${locale}/admin/patients`,
      exact: false,
      label: tNav('patients') || (isRtl ? 'المرضى' : 'Patients'),
      icon: PatientsIcon,
    },
    {
      href: `/${locale}/admin/reminders`,
      exact: false,
      label: tNav('reminders') || (isRtl ? 'التذكيرات' : 'Reminders'),
      icon: RemindersIcon,
    },
    {
      href: `/${locale}/admin/notifications`,
      exact: false,
      label: tNav('notifications') || (isRtl ? 'الإشعارات' : 'Notifications'),
      icon: NotificationsIcon,
    },
    {
      href: `/${locale}/admin/tips`,
      exact: false,
      label: tNav('coachingTips') || (isRtl ? 'النصائح التوعوية' : 'Coaching Tips'),
      icon: TipsIcon,
    },
    {
      href: `/${locale}/admin/settings`,
      exact: false,
      label: tNav('settings') || (isRtl ? 'الإعدادات' : 'Settings'),
      icon: SettingsIcon,
    },
  ];

  // Auth gate: redirect to login if user is not logged in or not admin
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push(`/${locale}/login`);
    }
  }, [loading, user, isAdmin, router, locale]);

  // Close mobile sidebar on route change during render
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMobileMenuOpen(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <LoadingSpinner size="xl" color="primary" />
        <p className="text-slate-600 font-medium text-sm animate-pulse">
          {tCommon('loading') || 'Loading Clinical Admin Portal...'}
        </p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {isRtl ? 'غير مصرح بالدخول' : 'Access Restricted'}
        </h2>
        <p className="text-slate-600 max-w-sm mb-6 text-sm">
          {isRtl
            ? 'هذه المنطقة مخصصة فقط للأطباء والمسؤولين. يرجى تسجيل الدخول بحساب مسؤول.'
            : 'This portal requires clinician or administrator credentials. Please sign in.'}
        </p>
        <Button variant="primary" onClick={() => router.push(`/${locale}/login`)}>
          {tCommon('login') || 'Sign In to Portal'}
        </Button>
      </div>
    );
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/${locale}/admin/patients?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push(`/${locale}/login`);
  };

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs h-16 flex items-center px-4 sm:px-6">
        <div className="flex items-center justify-between w-full gap-4">
          {/* Left section: Hamburger (mobile) + Brand logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden min-w-[48px] min-h-[48px] flex items-center justify-center p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              <MenuIcon className="w-6 h-6" />
            </button>

            <Link href={`/${locale}/admin`} className="flex items-center gap-2.5 group">
              <DialyCareLogo className="w-9 h-9 shrink-0 transition-transform group-hover:scale-105" />
              <div className="flex flex-col">
                <span className="font-bold text-slate-900 text-lg leading-tight tracking-tight">
                  Dialy<span className="text-[#1e6bb8]">Care</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 tracking-wider uppercase">
                  {isRtl ? 'بوابة الفريق الطبي' : 'Clinical Admin'}
                </span>
              </div>
            </Link>
          </div>

          {/* Middle section: Global search bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center flex-1 max-w-md mx-6"
          >
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث عن مريض بالاسم...' : 'Search patients, records...'}
                className="w-full pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]/20 focus:border-[#1e6bb8] transition-colors"
              />
              <SearchIcon className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-2.5 text-slate-400 w-4 h-4 pointer-events-none" />
            </div>
          </form>

          {/* Right section: Language Toggle + Admin Info + Logout */}
          <div className="flex items-center gap-3 shrink-0">
            <LanguageToggle variant="badge" />

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 rounded-xl border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-[#1e6bb8] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                {user.displayName ? user.displayName.slice(0, 2) : 'AD'}
              </div>
              <div className="flex flex-col text-start">
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {user.displayName || user.username}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {isRtl ? 'طبيب مسؤول' : 'Administrator'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="min-w-[48px] min-h-[48px] flex items-center justify-center p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title={tCommon('logout') || 'Sign Out'}
              aria-label={tCommon('logout') || 'Sign Out'}
            >
              <LogoutIcon className="w-5 h-5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex w-full">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-e border-slate-200/80 shrink-0 p-4 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            {isRtl ? 'القائمة الرئيسية' : 'Clinical Navigation'}
          </div>

          <nav className="space-y-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3.5 py-2.5 min-h-[48px] rounded-xl font-medium text-sm transition-all duration-150
                    ${
                      isActive
                        ? 'bg-[#1e6bb8] text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Doctor Quick Clinical Shortcuts */}
          <div className="pt-4 mt-4 border-t border-slate-200/80 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">
              {isRtl ? 'التسجيل السريري للطبيب' : 'Doctor Clinical Tools'}
            </div>
            <Link
              href={`/${locale}/admin/patients#admin-clinical-section`}
              className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px] rounded-xl text-xs font-bold bg-blue-50/80 text-[#1e6bb8] hover:bg-blue-100 border border-blue-200/70 transition-colors"
            >
              <span aria-hidden="true">🩺🔬</span>
              <span>{isRtl ? 'تسجيل الغسيل والتحاليل' : 'Record Dialysis & Labs'}</span>
            </Link>
            <Link
              href={`/${locale}/admin/patients#admin-medications-section`}
              className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px] rounded-xl text-xs font-bold bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/70 transition-colors"
            >
              <span aria-hidden="true">💊</span>
              <span>{isRtl ? 'أدوية المرضى' : 'Patient Medications'}</span>
            </Link>
          </div>

          {/* Quick System Badge at Bottom */}
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl mt-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-800">
                {isRtl ? 'النظام متصل ونشط' : 'Clinical Engine Active'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              {isRtl ? 'مزامنة بيانات المرضى والالتزام' : 'Live patient adherence sync'}
            </p>
          </div>
        </aside>

        {/* Mobile Slide-in Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer */}
            <div
              className={`
                relative flex-1 flex flex-col max-w-xs w-full bg-white p-5 shadow-2xl z-10
                animate-in slide-in-from-${isRtl ? 'right' : 'left'} duration-200
              `}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <DialyCareLogo className="w-8 h-8" />
                  <span className="font-bold text-slate-900 text-base">DialyCare</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-w-[48px] min-h-[48px] flex items-center justify-center p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                  aria-label="Close Navigation Menu"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Search */}
              <form onSubmit={handleSearchSubmit} className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isRtl ? 'بحث عن مريض...' : 'Search patients...'}
                    className="w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                  />
                  <SearchIcon className="absolute left-2.5 rtl:left-auto rtl:right-2.5 top-2.5 text-slate-400 w-4 h-4 pointer-events-none" />
                </div>
              </form>

              <nav className="space-y-1.5 flex-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 min-h-[48px] rounded-xl font-medium text-sm
                        ${
                          isActive
                            ? 'bg-[#1e6bb8] text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-slate-100 space-y-1.5">
                <Link
                  href={`/${locale}/admin/patients#admin-clinical-section`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px] rounded-xl text-xs font-bold bg-blue-50 text-[#1e6bb8] border border-blue-200/70"
                >
                  <span aria-hidden="true">🩺🔬</span>
                  <span>{isRtl ? 'تسجيل الغسيل والتحاليل' : 'Record Dialysis & Labs'}</span>
                </Link>
                <Link
                  href={`/${locale}/admin/patients#admin-medications-section`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px] rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                >
                  <span aria-hidden="true">💊</span>
                  <span>{isRtl ? 'أدوية المرضى' : 'Patient Medications'}</span>
                </Link>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#1e6bb8] text-white flex items-center justify-center font-bold text-xs uppercase">
                    {user.displayName ? user.displayName.slice(0, 2) : 'AD'}
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900">{user.displayName || user.username}</p>
                    <p className="text-slate-500">{isRtl ? 'طبيب مسؤول' : 'Administrator'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-w-[48px] min-h-[48px] flex items-center justify-center p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                  aria-label="Logout"
                >
                  <LogoutIcon className="w-5 h-5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
