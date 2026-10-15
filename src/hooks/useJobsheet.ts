import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Jobsheet } from '../types';

export function useJobsheet(jobId: string) {
  const { profile } = useAuth();
  const [jobsheet, setJobsheet] = useState<Jobsheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !jobId) { setIsLoading(false); return; }
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      // Try Dexie
      let js = await db.jobsheets.where('job_id').equals(jobId).first().catch(() => null);
      if (js && !cancelled) { setJobsheet(js); setIsLoading(false); }

      // Fetch from Supabase
      try {
        const { data } = await supabase.from('jobsheets').select('*').eq('job_id', jobId).single();
        if (data && !cancelled) {
          js = data as Jobsheet;
          setJobsheet(js);
          await db.jobsheets.put(js).catch(() => {});
        }
      } catch {
        // use Dexie result
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load().catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [jobId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { jobsheet, isLoading, error, setJobsheet };
}
