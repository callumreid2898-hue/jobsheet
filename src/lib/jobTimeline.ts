import type { AuditLog, Job, Jobsheet, JobStatus, Profile } from '../types';
import { jobStatusColors } from '../components/ui/statusColors';

export interface TimelineEvent {
  key: string;        // audit action, used to de-duplicate
  at: string;         // ISO timestamp
  label: string;
  by: string | null;  // who did it, when known
}

function labelFor(action: string): string {
  if (action === 'job_created') return 'Job created';
  if (action === 'job_assigned') return 'Engineer assigned';
  if (action === 'jobsheet_submitted') return 'Jobsheet submitted';
  if (action.startsWith('job_status:')) {
    const status = action.slice('job_status:'.length) as JobStatus;
    return `Status: ${jobStatusColors[status]?.label ?? status.replace(/_/g, ' ')}`;
  }
  return action.replace(/_/g, ' ');
}

/**
 * The job's history, oldest first. audit_log rows (00012 trigger, jobsheet
 * submission) say who did what; the job's own timestamps fill in anything the
 * log doesn't have (older jobs, or offline when the log can't be read).
 */
export function buildTimeline(
  job: Job, jobsheet: Jobsheet | null, audit: AuditLog[], profiles: Profile[],
): TimelineEvent[] {
  const nameByUser = new Map(profiles.map(p => [p.user_id, p.full_name]));
  const events: TimelineEvent[] = audit.map(a => ({
    key: a.action,
    at: a.created_at,
    label: labelFor(a.action),
    by: nameByUser.get(a.user_id) ?? null,
  }));

  const logged = new Set(events.map(e => e.key));
  const derived: [string, string | null][] = [
    ['job_created', job.created_at],
    ['job_status:travelling', job.travelling_at],
    ['job_status:on_site', job.on_site_at],
    ['jobsheet_submitted', jobsheet?.submitted_at ?? null],
  ];
  for (const [key, at] of derived) {
    if (at && !logged.has(key)) events.push({ key, at, label: labelFor(key), by: null });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
