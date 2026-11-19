'use client';

import { useEffect, useState } from 'react';
import { enablePushNotifications, isIosNotInstalled } from '@/lib/push-client';

/** Fired by PatientNotificationPermissionBanner when the patient allows notifications. */
export const NOTIF_PERMISSION_GRANTED_EVENT = 'waslity:notif-permission-granted';

/**
 * Registers this device for Web Push (phone alerts while the app is closed).
 * Asking for permission stays with PatientNotificationPermissionBanner, so the
 * patient sees one alerts card, not two. This component subscribes silently
 * once permission is granted (on mount and right after the grant), and only
 * renders on iPhone/iPad Safari outside the installed app, where push cannot
 * work until the app is added to the home screen.
 */
export function PushAlertsCard({ language }: { language: 'ar' | 'en' }) {
  const isAr = language === 'ar';
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (isIosNotInstalled()) {
        setIosHint(true);
        return;
      }
      void enablePushNotifications(language, false);
    }, 0);
    const onGranted = () => void enablePushNotifications(language, false);
    window.addEventListener(NOTIF_PERMISSION_GRANTED_EVENT, onGranted);
    return () => {
      clearTimeout(t);
      window.removeEventListener(NOTIF_PERMISSION_GRANTED_EVENT, onGranted);
    };
  }, [language]);

  if (!iosHint) return null;

  return (
    <section
      data-testid="push-ios-hint"
      className="rounded-2xl border border-blue-200 bg-blue-50 p-3 px-4 flex items-start gap-3 text-xs text-slate-700 leading-snug"
    >
      <span className="text-lg" aria-hidden="true">📲</span>
      <p>
        {isAr
          ? 'لاستقبال تذكير يوم الغسيل على الآيفون: مشاركة ← إضافة إلى الشاشة الرئيسية، ثم افتح التطبيق من الأيقونة.'
          : 'To get dialysis-day alerts on iPhone: Share → Add to Home Screen, then open the app from the icon.'}
      </p>
    </section>
  );
}
