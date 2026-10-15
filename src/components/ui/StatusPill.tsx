import type { JobStatus } from '../../types';

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-700' },
  reviewed: { label: 'Reviewed', className: 'bg-green-100 text-green-700' },
};

export function StatusPill({ status }: { status: JobStatus }) {
  const config = statusConfig[status] ?? statusConfig.scheduled;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
