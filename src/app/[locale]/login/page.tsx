'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

export default function LoginPage() {
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const { user, login, loading: authLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect to appropriate role portal
  useEffect(() => {
    if (user && !authLoading) {
      if (user.role === 'admin') {
        router.push(`/${locale}/admin`);
      } else {
        router.push(`/${locale}/patient`);
      }
    }
  }, [user, authLoading, locale, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !password.trim()) {
      setErrorMsg(tAuth('invalidCredentials'));
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await login(username, password, rememberMe);
      if (success) {
        // Redirection will be handled by the useEffect above
      } else {
        setErrorMsg(tAuth('loginError'));
      }
    } catch {
      setErrorMsg(tAuth('loginError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillDemo = (type: 'admin' | 'patient') => {
    setErrorMsg('');
    if (type === 'admin') {
      setUsername('admin');
      setPassword('admin123');
    } else {
      setUsername('patient1');
      setPassword('patient123');
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50/60 via-slate-50 to-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header with Language Toggle */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1e6bb8] text-white flex items-center justify-center shadow-sm font-bold text-xl">
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

      {/* Main Login Card Container */}
      <main className="w-full max-w-md mx-auto my-auto py-8">
        <Card className="border-slate-200/90 shadow-lg">
          <div className="p-6 sm:p-8">
            {/* Medical Branding & Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100/70 text-[#1e6bb8] mb-4">
                <svg
                  className="w-9 h-9"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {tAuth('loginTitle')}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {tAuth('loginSubtitle')}
              </p>
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div
                className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3"
                role="alert"
              >
                <svg
                  className="w-5 h-5 shrink-0 text-red-500 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-medium">{errorMsg}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label={tAuth('username')}
                placeholder={tAuth('usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                }
              />

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 rounded-md border-slate-300 text-[#1e6bb8] focus:ring-[#1e6bb8] cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {tAuth('rememberMe')}
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isSubmitting || authLoading}
              >
                {tAuth('loginButton')}
              </Button>
            </form>

            {/* Quick Demo Fill Buttons for Reviewers */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center mb-3">
                {tAuth('demoCredentials')}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFillDemo('admin')}
                  className="text-xs font-medium"
                >
                  {tAuth('demoAdminBtn')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFillDemo('patient')}
                  className="text-xs font-medium"
                >
                  {tAuth('demoPatientBtn')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400 py-4">
        {tAuth('copyright')}
      </footer>
    </div>
  );
}
