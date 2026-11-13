'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { triggerPwaInstall } from './ServiceWorkerRegister';

const STORAGE_KEY = 'dialycare_pwa_prompt_dismissed';

// Empty subscriber for hydration-safe client mounting check (React 19 compliant)
const emptySubscribe = () => () => {};

export function InstallPwaPrompt() {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [manualGuideType, setManualGuideType] = useState<'ios' | 'browser' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check if already running in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);

    if (isStandalone) {
      return;
    }

    // 2. Check if user previously dismissed the prompt
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage access might fail in privacy-focused contexts
    }

    if (dismissed === 'true') {
      return;
    }

    // Show prompt after a short delay so page finishes initial load smoothly
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1200);

    // 3. Listen for app installed event
    const handleInstalled = () => {
      setIsVisible(false);
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Ignore localStorage write failures
      }
    };

    // 4. Listen for prompt availability event
    const handleInstallPromptAvailable = () => {
      if (dismissed !== 'true') {
        setIsVisible(true);
      }
    };

    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('dialycare:app-installed', handleInstalled);
    window.addEventListener('dialycare:install-prompt', handleInstallPromptAvailable);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('dialycare:app-installed', handleInstalled);
      window.removeEventListener('dialycare:install-prompt', handleInstallPromptAvailable);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore localStorage write failures in private browsing
    }
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);

    // Detect iOS devices
    const isIos =
      typeof navigator !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: boolean }).MSStream;

    // Check if browser native install prompt is available
    if (window.__dialycareDeferredPrompt) {
      const accepted = await triggerPwaInstall();
      if (accepted) {
        setIsVisible(false);
        try {
          localStorage.setItem(STORAGE_KEY, 'true');
        } catch {
          // Ignore
        }
      }
      // Note: If user cancelled native prompt, do not show manual Safari guide
    } else if (isIos) {
      setManualGuideType('ios');
    } else {
      // Browser does not support or fire beforeinstallprompt (e.g. desktop Firefox/Safari)
      setManualGuideType('browser');
    }

    setIsInstalling(false);
  };

  if (!isMounted || !isVisible) {
    return null;
  }

  return (
    <aside
      aria-label="PWA Installation Banner"
      className="fixed bottom-4 start-4 end-4 sm:start-auto sm:end-6 sm:bottom-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl bg-white border border-blue-100 shadow-2xl p-4 sm:p-5 text-slate-800">
        {/* Medical gradient accent top bar */}
        <div className="absolute top-0 start-0 end-0 h-1.5 bg-gradient-to-r from-[#1e6bb8] via-[#38bdf8] to-[#10b981]" />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 end-3 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1e6bb8]"
          aria-label="Dismiss install prompt / إغلاق"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Main Content */}
        <div className="flex items-start gap-3.5 pe-6">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden shadow-md border border-blue-100 bg-gradient-to-br from-[#1e6bb8] to-[#0f3e6d] flex items-center justify-center">
            <Image
              src="/icons/icon-192.png"
              alt="DialyCare Icon"
              width={48}
              height={48}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
              وَصْلِتي | Waslity
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
              📲 Install Waslity on your phone for easy daily access and reminders / ثبت تطبيق وَصْلِتي على هاتفك لسهولة المتابعة اليومية والتنبيهات
            </p>
          </div>
        </div>

        {/* Manual Installation Guide for iOS / Fallback browsers */}
        {manualGuideType === 'ios' && (
          <div className="mt-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold mb-1">To Install / للتثبيت:</p>
            <p className="mb-0.5">
              1. Tap the Share button in Safari / اضغط على زر المشاركة (Share) في أسفل المتصفح.
            </p>
            <p>2. Choose &quot;Add to Home Screen&quot; / اختر &quot;إضافة إلى الصفحة الرئيسية&quot;.</p>
          </div>
        )}

        {manualGuideType === 'browser' && (
          <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
            <p className="font-semibold mb-1">How to Install / كيفية التثبيت:</p>
            <p>
              Tap browser menu (⋮ or ⋯) and select &quot;Install App&quot; or &quot;Add to Home screen&quot; / اضغط على قائمة المتصفح واختر &quot;تثبيت التطبيق&quot;.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-3.5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
          >
            Not now / ليس الآن
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e6bb8] hover:bg-[#155392] active:bg-[#124275] rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1e6bb8]"
          >
            {isInstalling ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>Install / تثبيت</span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default InstallPwaPrompt;
