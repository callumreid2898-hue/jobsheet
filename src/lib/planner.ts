import type { Job } from '../types';
import { isPlannable, statusAfterAssign } from './jobStatus';

// Planner maths: time slots, clashes, and what a drop changes.

export const DEFAULT_DURATION_MINUTES = 60;

/** Minutes since midnight for 'HH:mm', or null. */
export function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** [start, end) in minutes, or null for jobs without a time. */
export function jobInterval(job: Pick<Job, 'scheduled_time' | 'duration_minutes'>): [number, number] | null {
  const start = toMinutes(job.scheduled_time);
  if (start === null) return null;
  return [start, start + (job.duration_minutes ?? DEFAULT_DURATION_MINUTES)];
}

/**
 * Other jobs for the same engineer on the same day whose times overlap `job`.
 * Cancelled jobs and jobs without a time never clash.
 */
export function findClashes(
  job: Pick<Job, 'id' | 'assigned_engineer_id' | 'scheduled_date' | 'scheduled_time' | 'duration_minutes'>,
  jobs: Job[],
): Job[] {
  const a = jobInterval(job);
  if (!a || !job.assigned_engineer_id) return [];
  return jobs.filter(other => {
    if (other.id === job.id || other.status === 'cancelled') return false;
    if (other.assigned_engineer_id !== job.assigned_engineer_id || other.scheduled_date !== job.scheduled_date) return false;
    const b = jobInterval(other);
    return !!b && a[0] < b[1] && b[0] < a[1];
  });
}

/** Ids of every job that clashes with another (for highlighting). */
export function clashingIds(jobs: Job[]): Set<string> {
  const out = new Set<string>();
  for (const job of jobs) {
    if (job.status === 'cancelled') continue;
    if (findClashes(job, jobs).length > 0) out.add(job.id);
  }
  return out;
}

export interface PlannerMove {
  engineerId: string | null;
  date: string | null;  // null = keep
  time: string | null;  // null = keep
}

/** The patch a drop makes, or null if it changes nothing or the job can't be moved. */
export function movePatch(job: Job, move: PlannerMove): Partial<Job> | null {
  if (!isPlannable(job.status)) return null;
  const patch: Partial<Job> = {};
  if (job.assigned_engineer_id !== move.engineerId) patch.assigned_engineer_id = move.engineerId;
  if (move.date && move.date !== job.scheduled_date) patch.scheduled_date = move.date;
  if (move.time && move.time !== job.scheduled_time) patch.scheduled_time = move.time;
  // Also repairs older jobs assigned in the planner whose status stayed 'unassigned'
  const status = statusAfterAssign(job.status, move.engineerId);
  if (status !== job.status) patch.status = status;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Unassigned jobs dated before `today` that nobody picked up. */
export function overdueUnassigned(jobs: Job[], today: string): Job[] {
  return jobs.filter(j => j.status === 'unassigned' && j.assigned_engineer_id === null && j.scheduled_date < today);
}
