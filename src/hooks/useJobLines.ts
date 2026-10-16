import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { JobLine } from '../types';

export function useJobLines(jobId: string | undefined) {
  const { profile } = useAuth();
  const [lines, setLines] = useState<JobLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchLines() {
    if (!profile || !jobId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_lines')
        .select('*')
        .eq('job_id', jobId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const result = (data ?? []) as JobLine[];
      setLines(result);
      await db.job_lines.bulkPut(result).catch(() => {});
    } catch {
      const d = await db.job_lines.where('job_id').equals(jobId).toArray().catch(() => [] as JobLine[]);
      setLines(d.sort((a, b) => a.sort_order - b.sort_order));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLines();
  }, [profile?.id, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { lines, isLoading, refetch: fetchLines };
}
