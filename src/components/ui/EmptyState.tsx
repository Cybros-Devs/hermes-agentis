import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`ui-card-enter flex flex-col items-center justify-center text-center px-5 py-8 gap-2.5 ${className}`}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="w-9 h-9 rounded-full border border-white/12 bg-white/[0.04] flex items-center justify-center text-[#6EE7B7]"
        >
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-[38ch]">
        <p className="text-xs sm:text-sm font-medium text-white">{title}</p>
        {description && (
          <p className="text-[11.5px] text-emerald-100/55 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
