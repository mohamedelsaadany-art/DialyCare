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

  const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'auto',
    vibrate: [200, 100, 200],
    ...options,
  };

  // 1. In mobile browsers (e.g. Android Chrome, iOS Safari PWA), `new Notification()` throws an Illegal constructor TypeError.
  // Using ServiceWorkerRegistration.showNotification() is the official standard for mobile and service-worker environments.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        if (registration && typeof registration.showNotification === 'function') {
          registration.showNotification(title, notificationOptions);
        }
      })
      .catch((swError) => {
        console.warn('Service worker notification failed, attempting desktop fallback:', swError);
        try {
          const notification = new window.Notification(title, notificationOptions);
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        } catch {
          // ignore
        }
      });
    return null;
  }

  // 2. Desktop fallback if serviceWorker is absent
  try {
    const notification = new window.Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return notification;
  } catch (error) {
    console.error('Failed to show local notification:', error);
    return null;
  }
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
