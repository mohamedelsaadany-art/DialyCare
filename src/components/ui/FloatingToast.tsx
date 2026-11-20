'use client';

import React from 'react';

/**
 * A short confirmation that floats above the page (and above the bottom menu)
 * instead of being inserted into it, so tapping a button never pushes the
 * page down.
 */
export function FloatingToast({
  message,
  detail,
  onClose,
  tone = 'success',
}: {
  message: React.ReactNode;
  detail?: React.ReactNode;
  onClose?: () => void;
  tone?: 'success' | 'error';
}) {
  if (!message) return null;
  const color = tone === 'error' ? 'bg-red-600' : 'bg-emerald-600';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="floating-toast"
        className={`pointer-events-auto w-full max-w-md ${color} text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200`}
      >
        <div className="min-w-0">
          <p className="font-extrabold text-sm leading-snug">{message}</p>
          {detail && <p className="text-xs text-white/85 mt-0.5 leading-snug">{detail}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-w-[36px] min-h-[36px] rounded-lg hover:bg-white/15 flex items-center justify-center"
            aria-label="إغلاق"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default FloatingToast;
