'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { requestNotificationPermission, showLocalNotification } from '@/lib/notifications';
import { isIosNotInstalled } from '@/lib/push-client';
import { NOTIF_PERMISSION_GRANTED_EVENT } from '@/components/PushAlertsCard';

const SEEN_PREFIX = 'WASLITY_ENABLE_ALERTS_ASKED_';

/** True while the update banner or another dialog is on screen. */
function otherPopupOpen(): boolean {
  return (
    document.documentElement.dataset.waslityBanner === '1' ||
    Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'))
  );
}

/** Should this device be asked? Only when the browser can still show its permission prompt. */
export function shouldAskForAlerts(opts: {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  iosNotInstalled: boolean;
  alreadyAsked: boolean;
}): boolean {
  return opts.supported && opts.permission === 'default' && !opts.iosNotInstalled && !opts.alreadyAsked;
}

/**
 * One-time, one-tap pop-up asking a patient to turn on alerts. Made for
 * patients who aren't comfortable with phone settings: one big button that
 * opens the phone's own "Allow" prompt. Shown once per patient per device,
 * and only once no other pop-up (survey, update banner) is open.
 */
export function EnableAlertsPrompt({ uid, language }: { uid: string; language: 'ar' | 'en' }) {
  const isAr = language === 'ar';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;
    const key = SEEN_PREFIX + uid;
    let alreadyAsked = false;
    try {
      alreadyAsked = window.localStorage.getItem(key) === '1';
    } catch {
      // ignore
    }
    const supported = 'Notification' in window;
    const ask = shouldAskForAlerts({
      supported,
      permission: supported ? window.Notification.permission : 'unsupported',
      iosNotInstalled: isIosNotInstalled(),
      alreadyAsked,
    });
    if (!ask) return;

    const timer = setInterval(() => {
      if (otherPopupOpen()) return;
      clearInterval(timer);
      setOpen(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [uid]);

  const markAsked = () => {
    try {
      window.localStorage.setItem(SEEN_PREFIX + uid, '1');
    } catch {
      // ignore
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    markAsked();
    try {
      const res = await requestNotificationPermission();
      if (res === 'granted') {
        window.dispatchEvent(new Event(NOTIF_PERMISSION_GRANTED_EVENT));
        showLocalNotification(
          isAr ? 'وَصْلِتي' : 'Waslity',
          isAr ? 'تم تفعيل التنبيهات ✅' : 'Alerts are on ✅'
        );
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const handleLater = () => {
    markAsked();
    setOpen(false);
  };

  return (
    <Modal isOpen={open} onClose={handleLater} maxWidth="sm" hideHeader noBodyPadding>
      <div data-enable-alerts dir={isAr ? 'rtl' : 'ltr'} className="p-6 flex flex-col items-center text-center gap-4" data-testid="enable-alerts-prompt">
        <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center text-5xl" aria-hidden="true">
          🔔
        </div>
        <h2 className="text-xl font-black text-slate-900 leading-snug">
          {isAr ? 'فعّل التنبيهات' : 'Turn on alerts'}
        </h2>
        <p className="text-base text-slate-700 leading-relaxed">
          {isAr
            ? 'ليصلك تذكير يوم الغسيل ورسائل الطبيب على هاتفك.'
            : 'Get dialysis-day reminders and messages from your doctor on your phone.'}
        </p>
        <p className="text-sm text-slate-500">
          {isAr ? 'اضغط الزر، ثم اختر «سماح».' : 'Tap the button, then choose “Allow”.'}
        </p>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          data-testid="enable-alerts-button"
          className="w-full min-h-[64px] rounded-2xl bg-[#1e6bb8] hover:bg-[#185a9c] active:scale-[0.98] text-white text-xl font-black shadow-lg transition disabled:opacity-60 cursor-pointer"
        >
          {isAr ? '🔔 تفعيل التنبيهات' : '🔔 Turn on alerts'}
        </button>
        <button
          type="button"
          onClick={handleLater}
          className="min-h-[44px] px-4 text-sm font-semibold text-slate-500 underline cursor-pointer"
        >
          {isAr ? 'ليس الآن' : 'Not now'}
        </button>
      </div>
    </Modal>
  );
}

export default EnableAlertsPrompt;
