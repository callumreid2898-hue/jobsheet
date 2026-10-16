import type { ReactNode } from 'react';

interface RecordHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  onBack?: () => void;
}

export function RecordHeader({ title, subtitle, badge, actions, backHref, onBack }: RecordHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4 bg-white border-b border-slate-200">
      <div className="flex items-start gap-3 min-w-0">
        {(backHref || onBack) && (
          <a
            href={backHref}
            onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }}
            className="mt-0.5 text-slate-400 hover:text-slate-700 shrink-0"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 truncate">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
