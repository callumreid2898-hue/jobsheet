import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { mergeServerRows } from '../lib/syncEngine';
import { useAuth } from '../auth/AuthProvider';
import type { Job, JobStatus } from '../types';

interface UseJobsOptions {
  date?: string;
  engineerId?: string;
  status?: JobStatus;
}

export function useJobs(options?: UseJobsOptions) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchJobs() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);

    try {
      // Try Supabase first
      let query = supabase.from('jobs').select('*').eq('company_id', profile.company_id);
      if (options?.date) query = query.eq('scheduled_date', options.date);
      if (options?.engineerId) query = query.eq('assigned_engineer_id', options.engineerId);
      if (options?.status) query = query.eq('status', options.status);
      query = query.order('scheduled_date', { ascending: true });

      const { data, error: err } = await query;
      if (err) throw err;
      // Cache in Dexie; rows with unsynced local changes keep the local copy
      const result = await mergeServerRows('jobs', (data ?? []) as Job[]).catch(() => (data ?? []) as Job[]);
      setJobs(result);
    } catch {
      // Fallback to Dexie
      let collection = db.jobs.where('company_id').equals(profile.company_id);
      // Note: Dexie doesn't support complex multi-field filtering easily, apply JS filter
      let dexieJobs = await collection.toArray().catch(() => [] as Job[]);
      if (options?.date) dexieJobs = dexieJobs.filter(j => j.scheduled_date === options.date);
      if (options?.engineerId) dexieJobs = dexieJobs.filter(j => j.assigned_engineer_id === options.engineerId);
      if (options?.status) dexieJobs = dexieJobs.filter(j => j.status === options.status);
      setJobs(dexieJobs);
      void collection;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchJobs(); }, [profile?.id, options?.date, options?.engineerId, options?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return { jobs, isLoading, error, refetch: fetchJobs };
}
