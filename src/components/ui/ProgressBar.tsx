import React from 'react';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // Current value
  max?: number; // Max value (default 100)
  label?: string;
  showValue?: boolean;
  valueSuffix?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  primary: 'bg-[#1e6bb8]',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
};

const sizeStyles = {
  sm: 'h-2',
  md: 'h-3.5',
  lg: 'h-5',
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  valueSuffix = '%',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const percentage = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / safeMax) * 100)));

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`} {...props}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm font-medium text-slate-700">
          {label && <span>{label}</span>}
          {showValue && (
            <span className="text-slate-500 font-mono text-xs rtl:text-right">
              {valueSuffix === '%' ? `${percentage}%` : `${value} / ${max} ${valueSuffix}`}
            </span>
          )}
        </div>
      )}

      <div
        className={`w-full bg-slate-100 rounded-full overflow-hidden ${sizeStyles[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${variantStyles[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
