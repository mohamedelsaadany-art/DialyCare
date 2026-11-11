'use client';

import React, { useEffect, useCallback, useId } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  hideHeader?: boolean;
  noBodyPadding?: boolean;
  bodyClassName?: string;
  closeLabel?: string;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
  className = '',
  hideHeader = false,
  noBodyPadding = false,
  bodyClassName = '',
  closeLabel,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const showHeader = !hideHeader && Boolean(title || description);
  const isArabicLocale =
    typeof document !== 'undefined' &&
    (document.getElementById('dialycare-locale-root')?.getAttribute('lang') === 'ar' ||
      document.documentElement.lang === 'ar' ||
      document.documentElement.dir === 'rtl' ||
      (typeof window !== 'undefined' && /^\/ar(\/|$)/.test(window.location.pathname)));
  const resolvedCloseLabel =
    closeLabel || (isArabicLocale ? 'إغلاق النافذة' : 'Close dialog');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-6 [@media(max-height:520px)]:p-1.5 overflow-hidden overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={showHeader && title ? titleId : undefined}
      aria-describedby={showHeader && description ? descriptionId : undefined}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        className={`
          relative w-full ${maxWidthMap[maxWidth]}
          max-h-[92vh] sm:max-h-[90vh] supports-[height:100dvh]:max-h-[92dvh] supports-[height:100dvh]:sm:max-h-[90dvh]
          [@media(max-height:520px)]:max-h-[96vh] supports-[height:100dvh]:[@media(max-height:520px)]:max-h-[96dvh]
          bg-white rounded-2xl shadow-2xl border border-slate-100 z-10
          flex flex-col overflow-hidden
          transition-[opacity,transform] duration-200 animate-in zoom-in-95 fade-in
          ${className}
        `}
      >
        {/* Header */}
        {showHeader && (
          <div className="shrink-0 flex items-start justify-between gap-4 px-4 py-3.5 sm:px-6 sm:pt-5 sm:pb-4 [@media(max-height:520px)]:px-4 [@media(max-height:520px)]:py-2 border-b border-slate-100 bg-white">
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="text-lg sm:text-xl font-bold text-slate-900 leading-6 tracking-tight"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-xs sm:text-sm text-slate-500 [@media(max-height:520px)]:hidden"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer min-w-[48px] min-h-[48px] flex items-center justify-center shrink-0"
              aria-label={resolvedCloseLabel}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Content Body */}
        {noBodyPadding ? (
          children
        ) : (
          <div
            className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 text-slate-700 text-base ${bodyClassName}`}
          >
            {children}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <div className="shrink-0 px-4 py-3.5 sm:px-6 sm:py-4 [@media(max-height:520px)]:px-4 [@media(max-height:520px)]:py-2 border-t border-slate-100 bg-white flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
