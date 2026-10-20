import type { Job, JobStatus } from '../types';

/**
 * Moves an engineer may make. Must match set_job_status() in 00010_security.sql.
 * on_site/completed → awaiting_review happens only by submitting the jobsheet.
 */
export const ENGINEER_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  unassigned:      [],
  scheduled:       ['travelling', 'on_site'],
  travelling:      ['on_site'],
  on_site:         ['awaiting_review'],
  completed:       ['awaiting_review'],
  awaiting_review: [],
  reviewed:        [],
  invoiced:        [],
  cancelled:       [],
};

export function canEngineerMove(from: JobStatus, to: JobStatus): boolean {
  return ENGINEER_TRANSITIONS[from].includes(to);
}

export type EngineerAction =
  | { kind: 'status'; to: JobStatus; label: string }
  | { kind: 'fill'; label: string };

/** Next-step buttons for an engineer, primary action first. */
export function engineerActions(status: JobStatus): EngineerAction[] {
  switch (status) {
    case 'scheduled':
      return [
        { kind: 'status', to: 'on_site', label: 'On site' },
        { kind: 'status', to: 'travelling', label: 'Travelling' },
      ];
    case 'travelling':
      return [{ kind: 'status', to: 'on_site', label: 'Arrived on site' }];
    case 'on_site':
    case 'completed':
      return [{ kind: 'fill', label: 'Fill in jobsheet' }];
    default:
      return [];
  }
}

/** The job as the server will have it after set_job_status (timestamps are only set once). */
export function applyStatus(job: Job, to: JobStatus, now = new Date().toISOString()): Job {
  return {
    ...job,
    status: to,
    travelling_at: to === 'travelling' ? job.travelling_at ?? now : job.travelling_at,
    on_site_at: to === 'on_site' ? job.on_site_at ?? now : job.on_site_at,
    completed_at: to === 'completed' || to === 'awaiting_review' ? job.completed_at ?? now : job.completed_at,
  };
}
