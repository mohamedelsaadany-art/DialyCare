'use client';

import React, { useState, useEffect } from 'react';
import { getNotifications } from '@/lib/data-store';
import { showLocalNotification, testNotificationTrigger } from '@/lib/notifications';

const UPDATE_DISMISS_KEY = 'WASLITY_UPDATE_BANNER_DISMISSED';

export function WaslityUpdateBanner() {
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isAr] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !window.location.pathname.startsWith('/en');
  });
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if dismissed recently (within 12 hours)
    const dismissedAt = window.localStorage.getItem(UPDATE_DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < 12 * 60 * 60 * 1000) {
        return;
      }
    }

    const checkForUpdateNotice = () => {
      try {
        const notifs = getNotifications();
        const updateNotif = notifs.find(
          (n) =>
            n &&
            n.type === 'broadcast' &&
            (n.id.includes('update') ||
              n.titleAr?.includes('تحديث') ||
              n.titleEn?.toLowerCase().includes('update'))
        );
        if (updateNotif) {
          setShowBanner(true);

          // Trigger native device notification if permissions granted and not alerted yet
          const alertedKey = `WASLITY_ALERTED_${updateNotif.id}`;
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            window.Notification.permission === 'granted' &&
            !window.localStorage.getItem(alertedKey)
          ) {
            window.localStorage.setItem(alertedKey, 'true');
            const title = isAr ? updateNotif.titleAr || updateNotif.titleEn : updateNotif.titleEn || updateNotif.titleAr;
            const message = isAr ? updateNotif.messageAr || updateNotif.messageEn : updateNotif.messageEn || updateNotif.messageAr;
            showLocalNotification(title, message);
          }
        }
      } catch {
        // ignore
      }
    };

    checkForUpdateNotice();

    // Listen for service worker new update event
    const handleSwUpdate = () => {
      setShowBanner(true);
    };

    window.addEventListener('dialycare:sw-updated', handleSwUpdate);
    window.addEventListener('dialycare_notifications_updated', checkForUpdateNotice);
    window.addEventListener('dialycare_cloud_sync_completed', checkForUpdateNotice);

    return () => {
      window.removeEventListener('dialycare:sw-updated', handleSwUpdate);
      window.removeEventListener('dialycare_notifications_updated', checkForUpdateNotice);
      window.removeEventListener('dialycare_cloud_sync_completed', checkForUpdateNotice);
    };
  }, []);

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) {
            if (key !== 'dialycare-v2-auth') {
              await caches.delete(key).catch(() => {});
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      window.localStorage.removeItem(UPDATE_DISMISS_KEY);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      window.localStorage.setItem(UPDATE_DISMISS_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  const handleTestNotification = async () => {
    const res = await testNotificationTrigger(isAr);
    setTestStatus(res.message);
    setTimeout(() => setTestStatus(null), 6000);
  };

  if (!showBanner) return null;

  return (
    <aside
      role="alert"
      aria-live="polite"
      dir={isAr ? 'rtl' : 'ltr'}
      className="sticky top-0 z-50 bg-gradient-to-r from-blue-700 via-sky-700 to-indigo-800 text-white px-4 py-3 shadow-md border-b-2 border-sky-400"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5 text-center sm:text-start">
          <span className="text-xl sm:text-2xl animate-bounce shrink-0" aria-hidden="true">
            🚀
          </span>
          <div>
            <p className="font-extrabold text-sm sm:text-base leading-snug">
              {isAr
                ? 'تحديث هام متاح لتطبيق وَصْلِتي!'
                : 'Important Update Available for Waslity!'}
            </p>
            <p className="text-xs text-sky-100 mt-0.5 leading-relaxed">
              {isAr
                ? 'يتوفر الآن إصدار جديد يدعم العمل بدون إنترنت، وأعلى معايير الأمان وسرعة مزامنة البيانات السريرية.'
                : 'A new release is available with offline support, top-tier security, and real-time clinical sync.'}
            </p>
            {testStatus && (
              <p className="text-xs font-bold text-amber-200 mt-1 bg-black/30 px-2 py-0.5 rounded-lg inline-block animate-in fade-in">
                {testStatus}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleTestNotification}
            title={isAr ? 'اضغط لتجربة وصول إشعار لهاتفك الآن' : 'Test phone notification now'}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-sky-500/80 hover:bg-sky-500 active:bg-sky-400 text-white font-bold text-xs sm:text-sm border border-sky-300/40 shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>🔔</span>
            <span>{isAr ? 'تجربة الإشعار لهاتفي' : 'Test Phone Alert'}</span>
          </button>

          <button
            type="button"
            onClick={handleApplyUpdate}
            disabled={isUpdating}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-sky-50 active:bg-sky-100 text-blue-900 font-black text-xs sm:text-sm shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-75"
          >
            <span className={`text-base ${isUpdating ? 'animate-spin' : ''}`}>🔄</span>
            <span>
              {isUpdating
                ? (isAr ? 'جارِ التحديث...' : 'Updating...')
                : (isAr ? 'تحديث التطبيق الآن' : 'Update App Now')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={isAr ? 'إغلاق التنبيه' : 'Dismiss notice'}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-sky-200 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default WaslityUpdateBanner;
