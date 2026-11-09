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

  const notificationOptions: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'auto',
    ...options,
  };

  try {
    const notification = new window.Notification(title, notificationOptions);

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch (error) {
    // Mobile browsers (e.g. Android Chrome) disallow `new Notification()` and require ServiceWorkerRegistration.showNotification()
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, notificationOptions);
        })
        .catch((swError) => {
          console.error('Service worker notification failed:', swError);
        });
    } else {
      console.error('Failed to show local notification:', error);
    }
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
