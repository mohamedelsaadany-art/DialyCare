import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Card({
  children,
  className = '',
  title,
  subtitle,
  actions,
  ...props
}: CardProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs transition-shadow duration-200 hover:shadow-sm ${className}`}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-start justify-between p-5 border-b border-slate-100 gap-4">
          <div className="space-y-1">
            {title && (
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              // div, not p: callers pass block content (e.g. radio groups), and <div> inside <p>
              // is invalid HTML that causes a React hydration error.
              <div className="text-sm text-slate-500 font-normal">
                {subtitle}
              </div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function CardHeader({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 border-b border-slate-100 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-lg font-bold text-slate-900 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm text-slate-500 font-normal ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`p-5 pt-0 flex items-center justify-between gap-3 border-t border-slate-100 mt-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
