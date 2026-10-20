import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/StatusPill';
import { useAuth } from '../../auth/AuthProvider';
import { useJobs } from '../../hooks/useJobs';
import { changeJobStatus } from '../../offline/SyncQueue';
import { engineerActions, type EngineerAction } from '../../lib/jobStatus';
import { localISODate } from '../../lib/dates';
import type { Job } from '../../types';

const JOB_TYPE_LABELS: Record<string, string> = {
  reactive_callout: 'Reactive Callout',
  ppm_service:      'PPM Service',
  install:          'Install',
  remedial_works:   'Remedial Works',
  survey:           'Survey',
};

export function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const today = localISODate();

  const { jobs, isLoading, refetch } = useJobs({
    date: today,
    engineerId: profile?.id,
  });

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Status changes are queued, so they work offline too
  async function runAction(job: Job, action: EngineerAction) {
    if (action.kind === 'fill') {
      navigate(`/jobs/${job.id}/fill`);
      return;
    }
    if (updatingId) return;
    setUpdatingId(job.id);
    try {
      await changeJobStatus(job, action.to);
      await refetch();
    } finally {
      setUpdatingId(null);
    }
  }

  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-slate-900 mb-0.5">Today</h1>
      <p className="text-sm text-slate-500 mb-4">{dateLabel}</p>



      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <EmptyState heading="No jobs today" description="You have no jobs scheduled for today." />
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const isUpdating = updatingId === job.id;
            const actions = engineerActions(job.status);

            return (
              <div
                key={job.id}
                className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden"
              >
                {/* Card header — tap to navigate */}
                <div
                  className="flex items-center justify-between gap-3 px-4 py-4 cursor-pointer active:bg-slate-50"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {JOB_TYPE_LABELS[job.type] ?? job.type}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {job.scheduled_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={job.status} />
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Next-step buttons */}
                {actions.length > 0 && (
                  <div className="flex gap-2 px-4 pb-4">
                    {actions.map(action => (
                      <StatusButton
                        key={action.label}
                        label={action.label}
                        disabled={isUpdating}
                        onClick={() => runAction(job, action)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Small helper component ───────────────────────────────────────────────────

function StatusButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors
        ${disabled
          ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
          : 'border-[#0D3349] bg-[#0D3349] text-white active:bg-[#0a2537]'
        }`}
    >
      {label}
    </button>
  );
}
