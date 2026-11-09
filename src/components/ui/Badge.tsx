import React from 'react';
import type { BadgeVariant } from '@/lib/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
  success: {
    container: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  warning: {
    container: 'bg-amber-50 text-amber-900 border-amber-200',
    dot: 'bg-amber-500',
  },
  danger: {
    container: 'bg-red-50 text-red-800 border-red-200',
    dot: 'bg-red-500',
  },
  info: {
    container: 'bg-blue-50 text-[#1e6bb8] border-blue-200',
    dot: 'bg-[#1e6bb8]',
  },
  neutral: {
    container: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
};

const sizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs px-2.5 py-0.5 gap-1 font-medium',
  md: 'text-sm px-3 py-1 gap-1.5 font-medium',
  lg: 'text-base px-3.5 py-1.5 gap-2 font-semibold',
};

export function Badge({
  children,
  className = '',
  variant = 'info',
  size = 'md',
  dot = false,
  ...props
}: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={`
        inline-flex items-center rounded-full border shrink-0
        ${styles.container}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
