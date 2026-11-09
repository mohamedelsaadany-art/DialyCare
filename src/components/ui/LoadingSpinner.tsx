import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'slate' | 'emerald';
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
  xl: 'w-12 h-12 border-4',
};

const colorMap = {
  primary: 'border-blue-200 border-t-[#1e6bb8]',
  white: 'border-white/30 border-t-white',
  slate: 'border-slate-200 border-t-slate-700',
  emerald: 'border-emerald-200 border-t-emerald-600',
};

export function LoadingSpinner({
  size = 'md',
  color = 'primary',
  className = '',
  label = 'Loading...',
}: LoadingSpinnerProps) {
  return (
    <div className={`inline-flex items-center justify-center ${className}`} role="status">
      <div
        className={`rounded-full animate-spin ${sizeMap[size]} ${colorMap[color]}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
