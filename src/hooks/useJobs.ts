import { useCachedQuery } from './useCachedQuery';
import type { Job, JobStatus } from '../types';

interface UseJobsOptions {
  date?: string;
  engineerId?: string;
  status?: JobStatus;
}

export function useJobs(options?: UseJobsOptions) {
  // Rows with unsynced local changes keep the local copy (see mergeServerRows)
  const { rows: jobs, isLoading, refetch } = useCachedQuery<Job>({
    table: 'jobs',
    eq: { scheduled_date: options?.date, assigned_engineer_id: options?.engineerId, status: options?.status },
    order: { column: 'scheduled_date' },
  });
  return { jobs, isLoading, refetch };
}
