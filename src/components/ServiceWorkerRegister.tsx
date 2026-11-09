'use client';

import { useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __dialycareDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

/**
 * Programmatically triggers the browser's PWA install prompt if available.
 * Returns true if installation was accepted, false otherwise.
 * Safe to call from any component or user action.
 */
export async function triggerPwaInstall(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const deferred = window.__dialycareDeferredPrompt;
  if (!deferred) {
    return false;
  }

  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    window.__dialycareDeferredPrompt = null;
    if (choice.outcome === 'accepted') {
      window.dispatchEvent(new CustomEvent('dialycare:app-installed'));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[DialyCare PWA] Install prompt error:', err);
    return false;
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Register Service Worker with readyState check to avoid missing load event
    if ('serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((registration) => {
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (
                    installingWorker.state === 'installed' &&
                    navigator.serviceWorker.controller
                  ) {
                    console.log('[DialyCare SW] New update installed; ready on reload.');
                  }
                };
              }
            };
          })
          .catch((err) => {
            console.warn('[DialyCare SW] Registration failed:', err);
          });
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW, { once: true });
      }
    }

    // 2. Intercept beforeinstallprompt for one-tap install banner
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__dialycareDeferredPrompt = promptEvent;

      // Broadcast custom event so UI components know install is available
      window.dispatchEvent(
        new CustomEvent('dialycare:install-prompt', {
          detail: promptEvent,
        })
      );
    };

    // 3. Listen for programmatic trigger events from other components
    const handleTriggerRequest = async () => {
      await triggerPwaInstall();
    };

    // 4. Listen for native successful app installation
    const handleAppInstalled = () => {
      window.__dialycareDeferredPrompt = null;
      window.dispatchEvent(new CustomEvent('dialycare:app-installed'));
      console.log('[DialyCare PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('dialycare:trigger-install', handleTriggerRequest);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('dialycare:trigger-install', handleTriggerRequest);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null;
}

export default ServiceWorkerRegister;
