import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/StatusPill';
import { useAuth } from '../../auth/AuthProvider';
import { useJobs } from '../../hooks/useJobs';
import { db } from '../../lib/db';
import { enqueueJobStatus } from '../../offline/SyncQueue';
import type { Job, JobStatus } from '../../types';

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
  const today = new Date().toISOString().slice(0, 10);

  const { jobs, isLoading, refetch } = useJobs({
    date: today,
    engineerId: profile?.id,
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    function handleOnline()  { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function updateJobStatus(
    job: Job,
    status: JobStatus,
    timestampField: 'travelling_at' | 'on_site_at' | 'completed_at',
  ) {
    if (updatingId) return;
    setUpdatingId(job.id);
    try {
      const now = new Date().toISOString();
      const patch: Partial<Job> = { status, [timestampField]: now };
      await db.jobs.update(job.id, patch);
      await enqueueJobStatus(job.id, status);
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

      {!isOnline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          You are offline — status buttons are disabled until reconnected.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <EmptyState heading="No jobs today" description="You have no jobs scheduled for today." />
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const isUpdating = updatingId === job.id;
            const showStatusButtons = job.status === 'scheduled';
            const buttonsDisabled = !isOnline || isUpdating;

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

                {/* Status action buttons */}
                {showStatusButtons && (
                  <div className="flex gap-2 px-4 pb-4">
                    <StatusButton
                      label="Travelling"
                      disabled={buttonsDisabled}
                      onClick={() => updateJobStatus(job, 'travelling', 'travelling_at')}
                    />
                    <StatusButton
                      label="On Site"
                      disabled={buttonsDisabled}
                      onClick={() => updateJobStatus(job, 'on_site', 'on_site_at')}
                    />
                    <StatusButton
                      label="Complete"
                      disabled={buttonsDisabled}
                      onClick={() => updateJobStatus(job, 'completed', 'completed_at')}
                    />
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
