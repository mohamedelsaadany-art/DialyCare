'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { playNotificationSound } from '@/lib/notifications';

interface ToastData {
  id: string;
  title: string;
  body: string;
  url?: string;
}

export function InAppNotificationToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [isAr] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !window.location.pathname.startsWith('/en');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isEnglish = window.location.pathname.startsWith('/en') || document.documentElement.lang === 'en';

    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; body: string; options?: { data?: { url?: string } } }>;
      const detail = customEvent.detail;
      if (!detail) return;

      setToast({
        id: `toast-${Date.now()}`,
        title: detail.title || (isEnglish ? 'New Waslity Notification' : 'إشعار جديد من وَصْلِتي'),
        body: detail.body || '',
        url: detail.options?.data?.url,
      });

      playNotificationSound();
    };

    window.addEventListener('dialycare:notification-received', handleNotification);

    return () => {
      window.removeEventListener('dialycare:notification-received', handleNotification);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 10000); // 10s auto-dismiss
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border-2 border-sky-400 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40 flex items-center justify-center text-xl shrink-0 animate-bounce">
          🔔
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-black text-sm text-sky-300 truncate">
              {toast.title}
            </h4>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label={isAr ? 'إغلاق الإشعار' : 'Close notification'}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-200 mt-1 leading-relaxed line-clamp-3">
            {toast.body}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {toast.url ? (
              <Link
                href={toast.url}
                onClick={() => setToast(null)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-colors"
              >
                <span>{isAr ? 'فتح التنبيه 📲' : 'Open Alert 📲'}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  window.location.reload();
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
              >
                <span>{isAr ? 'تحديث التطبيق الآن 🔄' : 'Update App Now 🔄'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setToast(null)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InAppNotificationToast;
