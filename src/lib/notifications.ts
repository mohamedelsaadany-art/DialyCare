/**
 * Push & local browser notification utilities for DialyCare.
 */

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Notifications are not supported in this browser environment.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return 'denied';
  }
}

/**
 * Synthesizes a gentle dual-tone chime (D5 -> A5) using Web Audio API
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // audio autoplay or context block ignored safely
  }
}

export function showLocalNotification(
  title: string,
  body: string,
  options?: NotificationOptions
): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  if (window.Notification.permission !== 'granted') {
    console.warn('Notification permission not granted.');
    return null;
  }

  // 1. Play audible notification sound
  playNotificationSound();

  // 2. Hardware vibration for mobile devices
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([200, 100, 200, 100, 300]);
    } catch {
      // ignore
    }
  }

  // 3. Dispatch in-app visual toast event so user sees it on screen immediately
  try {
    window.dispatchEvent(
      new CustomEvent('dialycare:notification-received', {
        detail: { title, body, options },
      })
    );
  } catch {
    // ignore
  }

  const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'auto',
    vibrate: [200, 100, 200, 100, 300],
    ...options,
  };

  // 4. Try Service Worker showNotification first (primary for Android Chrome / PWA)
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker
  ) {
    const triggerViaSw = (reg: ServiceWorkerRegistration) => {
      if (reg && typeof reg.showNotification === 'function') {
        reg.showNotification(title, notificationOptions).catch((err) => {
          console.warn('[Notifications] SW showNotification warning:', err);
        });
      }
    };

    if (typeof navigator.serviceWorker.getRegistration === 'function') {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) {
            triggerViaSw(reg);
          } else {
            navigator.serviceWorker.ready.then(triggerViaSw).catch(() => {});
          }
        })
        .catch(() => {
          navigator.serviceWorker.ready.then(triggerViaSw).catch(() => {});
        });
    } else {
      navigator.serviceWorker.ready.then(triggerViaSw).catch(() => {});
    }
  }

  // 5. Also attempt standard desktop Notification constructor
  try {
    const notification = new window.Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return notification;
  } catch {
    // On Android Chrome `new Notification()` throws Illegal Constructor; SW handled it above.
    return null;
  }
}

/**
 * Direct interactive test function for users to verify their device receives notifications
 */
export async function testNotificationTrigger(
  isAr: boolean = true
): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined') return { success: false, message: 'Server environment' };

  if (!('Notification' in window)) {
    return {
      success: false,
      message: isAr
        ? 'المتصفح الحالي لا يدعم إشعارات النظام.'
        : 'Notifications are not supported in this browser.',
    };
  }

  let perm = window.Notification.permission;
  if (perm === 'default') {
    perm = await requestNotificationPermission();
  }

  if (perm !== 'granted') {
    return {
      success: false,
      message: isAr
        ? 'تم حظر الإشعارات في متصفحك. يرجى تفعيل الإذن من إعدادات المتصفح.'
        : 'Notification permission is blocked. Please enable it in browser settings.',
    };
  }

  const title = isAr ? 'وَصْلِتي — تجربة إشعار ناجحة 🔔' : 'Waslity — Test Alert 🔔';
  const body = isAr
    ? 'هاتفك متصل بنجاح! إذا لم يظهر التنبيه كنافذة عائمة، اسحب شريط الإشعارات من أعلى الشاشة.'
    : 'Device connected! If banner does not float, pull down your notification shade.';

  showLocalNotification(title, body);

  return {
    success: true,
    message: isAr
      ? 'تم إرسال الإشعار بنجاح! تفقد شريط الإشعارات أعلى هاتفك الآن 📲'
      : 'Test alert sent! Check your notification tray now 📲',
  };
}

export function scheduleLocalReminder(
  title: string,
  body: string,
  timeMs: number,
  options?: NotificationOptions
): number {
  if (typeof window === 'undefined') {
    return -1;
  }

  // Handle both epoch timestamp (e.g. > year 2020: 1577836800000) and relative delay ms
  const now = Date.now();
  const rawDelay = timeMs > 1577836800000 ? Math.max(0, timeMs - now) : Math.max(0, timeMs);
  // Cap at max 32-bit signed int to prevent setTimeout immediate overflow
  const delay = Math.min(2147483647, rawDelay);

  const timerId = window.setTimeout(() => {
    showLocalNotification(title, body, options);
  }, delay);

  return timerId;
}

export function cancelScheduledReminder(timerId: number): void {
  if (typeof window !== 'undefined' && timerId >= 0) {
    window.clearTimeout(timerId);
  }
}
