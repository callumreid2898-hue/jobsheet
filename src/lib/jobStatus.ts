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

// ─── Manager ──────────────────────────────────────────────────────────────────

/** The planner (and reassigning) may only move jobs that haven't started. */
export function isPlannable(status: JobStatus): boolean {
  return status === 'unassigned' || status === 'scheduled';
}

/** Assigning an unassigned job schedules it; unassigning a scheduled job un-schedules it. */
export function statusAfterAssign(status: JobStatus, engineerId: string | null): JobStatus {
  if (status === 'unassigned' && engineerId) return 'scheduled';
  if (status === 'scheduled' && !engineerId) return 'unassigned';
  return status;
}

/** Jobs still in play (not cancelled or closed off). */
export function isActiveJob(status: JobStatus): boolean {
  return status !== 'cancelled' && status !== 'reviewed' && status !== 'invoiced';
}

export type ManagerAction = 'review' | 'invoice' | 'cancel';

/** Manager actions on the job page. Invoicing is done by creating an invoice. */
export function managerActions(status: JobStatus): ManagerAction[] {
  const out: ManagerAction[] = [];
  if (status === 'awaiting_review') out.push('review');
  if (status === 'reviewed') out.push('invoice');
  if (status !== 'invoiced' && status !== 'cancelled') out.push('cancel');
  return out;
}
