'use client';

import { useEffect, useState } from 'react';
import {
  enablePushNotifications,
  hasActivePushSubscription,
  isIosNotInstalled,
  isPushSupported,
} from '@/lib/push-client';

type View = 'hidden' | 'offer' | 'ios' | 'blocked';

/**
 * Patient dashboard card: turns on phone alerts (Web Push) for this device.
 * Hidden once alerts are on. An existing grant is refreshed silently on mount.
 */
export function PushAlertsCard({ language }: { language: 'ar' | 'en' }) {
  const isAr = language === 'ar';
  const [view, setView] = useState<View>('hidden');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (isIosNotInstalled()) {
        if (!cancelled) setView('ios');
        return;
      }
      if (!isPushSupported()) return;
      if (Notification.permission === 'denied') {
        if (!cancelled) setView('blocked');
        return;
      }
      if (Notification.permission === 'granted') {
        // keep the server copy fresh (new language, rotated endpoint)
        const r = await enablePushNotifications(language, false);
        if (!cancelled && r !== 'enabled' && !(await hasActivePushSubscription())) setView('offer');
        return;
      }
      if (!cancelled) setView('offer');
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [language]);

  if (view === 'hidden') return null;

  const onEnable = async () => {
    setBusy(true);
    const r = await enablePushNotifications(language, true);
    setBusy(false);
    if (r === 'enabled') setView('hidden');
    else if (r === 'denied') setView('blocked');
  };

  return (
    <section
      data-testid="push-alerts-card"
      className="rounded-3xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3"
    >
      <span className="text-2xl" aria-hidden="true">🔔</span>
      <div className="min-w-0 flex-1">
        {view === 'offer' && (
          <>
            <p className="font-bold text-slate-800 text-sm">
              {isAr ? 'تنبيهات الهاتف' : 'Phone alerts'}
            </p>
            <p className="text-slate-600 text-xs mt-1 leading-snug">
              {isAr
                ? 'استقبل تذكير يوم الغسيل الكلوي على هاتفك حتى لو كان التطبيق مغلقًا.'
                : 'Get your dialysis-day reminder on your phone, even when the app is closed.'}
            </p>
            <button
              type="button"
              onClick={() => void onEnable()}
              disabled={busy}
              data-testid="enable-push-btn"
              className="mt-3 min-h-[44px] px-4 rounded-xl bg-[#1e6bb8] text-white text-sm font-bold disabled:opacity-60 cursor-pointer"
            >
              {busy ? (isAr ? 'جاري التفعيل...' : 'Turning on...') : isAr ? 'تفعيل تنبيهات الهاتف' : 'Turn on phone alerts'}
            </button>
          </>
        )}
        {view === 'ios' && (
          <p className="text-slate-700 text-xs leading-snug">
            {isAr
              ? 'على الآيفون: مشاركة ← إضافة إلى الشاشة الرئيسية، ثم افتح التطبيق من الأيقونة لتفعيل التنبيهات.'
              : 'On iPhone: Share → Add to Home Screen, then open the app from the icon to enable alerts.'}
          </p>
        )}
        {view === 'blocked' && (
          <p className="text-slate-700 text-xs leading-snug">
            {isAr
              ? 'التنبيهات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح أو الهاتف لاستقبال تذكير يوم الغسيل.'
              : 'Notifications are blocked for this site. Allow them in your browser or phone settings to get dialysis-day reminders.'}
          </p>
        )}
      </div>
    </section>
  );
}
