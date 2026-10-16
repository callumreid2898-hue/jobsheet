import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, heading, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 text-slate-300">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-700 mb-1">{heading}</h3>
      {description && (
        <p className="text-sm text-slate-500 mb-6 max-w-sm">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
