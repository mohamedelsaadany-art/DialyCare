'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export interface LanguageToggleProps {
  className?: string;
  variant?: 'button' | 'badge';
}

export function LanguageToggle({ className = '', variant = 'button' }: LanguageToggleProps) {
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const targetLocale = currentLocale === 'ar' ? 'en' : 'ar';
  const label = currentLocale === 'ar' ? 'English' : 'العربية';

  const handleToggle = () => {
    // Set cookie for next-intl preference persistence
    document.cookie = `NEXT_LOCALE=${targetLocale};path=/;max-age=31536000;SameSite=Lax`;

    // Swap locale in current pathname cleanly
    let newPath = pathname;
    if (/^\/(?:en|ar)(?=\/|$)/.test(pathname)) {
      newPath = pathname.replace(/^\/(?:en|ar)/, `/${targetLocale}`) || `/${targetLocale}`;
    } else {
      newPath = `/${targetLocale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    }

    router.push(newPath);
    router.refresh();
  };

  if (variant === 'badge') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Switch to ${label}`}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-blue-50 text-[#1e6bb8] hover:bg-blue-100 text-xs font-bold
          border border-blue-200 transition-colors cursor-pointer select-none
          ${className}
        `}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={`Switch to ${label}`}
      className={`
        inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-[48px]
        rounded-xl bg-white/90 hover:bg-white text-slate-700 hover:text-[#1e6bb8]
        border border-slate-200 shadow-xs font-semibold text-sm
        transition-all duration-150 active:scale-95 cursor-pointer select-none
        ${className}
      `}
    >
      <svg
        className="w-4 h-4 text-slate-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default LanguageToggle;
