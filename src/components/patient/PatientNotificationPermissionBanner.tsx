'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { requestNotificationPermission, showLocalNotification } from '@/lib/notifications';
import Button from '@/components/ui/Button';

export interface PatientNotificationPermissionBannerProps {
  compact?: boolean;
  onPermissionGranted?: () => void;
}

export function PatientNotificationPermissionBanner({
  compact = false,
  onPermissionGranted,
}: PatientNotificationPermissionBannerProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'default';
    if (!('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('WASLITY_NOTIF_BANNER_DISMISSED') === 'true';
  });
  const [testSent, setTestSent] = useState<boolean>(false);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);

  // Listen for permission changes or tab re-focus to keep status fresh
  useEffect(() => {
    const checkStatus = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(window.Notification.permission);
      }
    };
    window.addEventListener('focus', checkStatus);
    return () => window.removeEventListener('focus', checkStatus);
  }, []);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const res = await requestNotificationPermission();
      setPermission(res);

      if (res === 'granted') {
        showLocalNotification(
          isAr ? 'وَصْلِتي (Waslity)' : 'Waslity',
          isAr
            ? 'تم تفعيل التنبيهات بنجاح! ستصلك هنا مواعيد الأدوية ورابط الفوسفات وجلسات الغسيل.'
            : 'Device notifications enabled! You will receive your medication & dialysis alerts here.'
        );
        if (onPermissionGranted) {
          onPermissionGranted();
        }
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSendTestNotification = () => {
    showLocalNotification(
      isAr ? '🔔 تنبيه تجريبي — وَصْلِتي' : '🔔 Test Alert — Waslity',
      isAr
        ? 'تنبيهات الهاتف تعمل بنجاح! هذا مثال على التنبيهات التي ستصلك لمواعيد الجلسات والأدوية.'
        : 'Phone notifications are working! This is how your dialysis and medication alerts will appear.'
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 4000);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('WASLITY_NOTIF_BANNER_DISMISSED', 'true');
    }
  };

  // If unsupported or dismissed, don't render prompt (unless in compact mode where we show badge)
  if (permission === 'unsupported' || (isDismissed && permission !== 'denied' && !compact)) {
    return null;
  }

  // 1. Permission GRANTED: show compact reassuring badge with test notification button
  if (permission === 'granted') {
    return (
      <div
        data-testid="notification-granted-badge"
        className="flex items-center justify-between p-3 px-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs shadow-xs animate-in fade-in"
      >
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>{isAr ? 'تنبيهات الهاتف مفعلة وجاهزة' : 'Device notifications active'}</span>
        </div>

        <button
          type="button"
          onClick={handleSendTestNotification}
          className="text-[11px] font-bold text-emerald-700 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg px-2.5 py-1 transition-colors min-h-[32px] flex items-center gap-1 active:scale-95 cursor-pointer"
        >
          {testSent ? (
            <span>{isAr ? '✓ تم الإرسال!' : '✓ Sent!'}</span>
          ) : (
            <span>{isAr ? '🔔 تجربة إشعار فوري' : '🔔 Test Alert'}</span>
          )}
        </button>
      </div>
    );
  }

  // 2. Permission DENIED: Show troubleshooting guide explaining why browser blocked it and how to fix it
  if (permission === 'denied') {
    return (
      <div
        data-testid="notification-denied-guide"
        className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border-2 border-amber-300 text-slate-800 space-y-3 shadow-xs animate-in fade-in"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-lg">
            ⚠️
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900 leading-snug">
              {isAr ? 'تنبيهات الهاتف محظورة في متصفحك' : 'Device notifications are blocked'}
            </h4>
            <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
              {isAr
                ? 'المتصفح يمنع وصول الإشعارات إلى جهازك افتراضياً. لتصلك مواعيد الأدوية والجلسات، يرجى السماح بالإشعارات من إعدادات المتصفح:'
                : 'Your browser is currently blocking notifications. To receive medication and dialysis alerts, please enable notifications in your browser settings:'}
            </p>
          </div>
        </div>

        <div className="bg-white/90 p-3 rounded-xl border border-amber-200 text-xs text-slate-700 space-y-1.5 font-medium">
          <p className="font-bold text-slate-900">
            {isAr ? 'خطوات التفعيل السريعة:' : 'Quick activation steps:'}
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>
              {isAr
                ? 'اضغط على أيقونة القفل أو الإعدادات 🔒 بجوار عنوان الموقع (URL) بأعلى الشاشة.'
                : 'Tap the lock/settings icon 🔒 next to the website URL at the top.'}
            </li>
            <li>
              {isAr
                ? 'اختر "الأذونات" (Permissions) ⬅ "الإشعارات" (Notifications).'
                : 'Select "Permissions" ⬅ "Notifications".'}
            </li>
            <li>
              {isAr
                ? 'اختر "السماح" (Allow) ثم اضغط على زر التحقق بالأسفل.'
                : 'Select "Allow" and then click the check button below.'}
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                setPermission(window.Notification.permission);
              }
            }}
            className="flex-1 bg-white hover:bg-slate-50 text-xs font-bold py-2 min-h-[44px]"
          >
            {isAr ? '🔄 فحص الإذن مرة أخرى' : '🔄 Re-check Permission'}
          </Button>
        </div>
      </div>
    );
  }

  // 3. Permission DEFAULT: Inviting interactive prompt to request notification permissions
  return (
    <div
      data-testid="notification-permission-prompt"
      className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 border border-blue-200 text-slate-800 space-y-3 shadow-xs animate-in fade-in"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#1e6bb8] text-white flex items-center justify-center shrink-0 text-xl shadow-xs">
          🔔
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black text-slate-900 leading-snug">
            {isAr ? 'تفعيل تنبيهات الهاتف ومواعيد الأدوية' : 'Enable Device Notifications'}
          </h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {isAr
              ? 'احرص على ألا يفوتك موعد غسيل كلوي أو جرعة رابط الفوسفات! اسمح بإشعارات الهاتف لتصلك التنبيهات في مواعيدها مباشرة على شاشتك.'
              : 'Never miss a dialysis session or phosphate binder dose! Enable phone notifications to receive timely alerts directly on your screen.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleRequestPermission}
          isLoading={isRequesting}
          className="flex-1 bg-[#1e6bb8] hover:bg-[#175492] text-white font-bold text-xs py-2.5 min-h-[44px] shadow-xs"
        >
          {isAr ? '🔔 تفعيل التنبيهات الآن' : '🔔 Allow Notifications'}
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 min-h-[44px] cursor-pointer"
        >
          {isAr ? 'لاحقاً' : 'Later'}
        </button>
      </div>
    </div>
  );
}

export default PatientNotificationPermissionBanner;
