import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Remedial, RemedialStatus } from '../types';

export function useRemedials(options?: { siteId?: string; status?: RemedialStatus }) {
  const { profile } = useAuth();
  const [remedials, setRemedials] = useState<Remedial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetch() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      let q = supabase.from('remedials').select('*').eq('company_id', profile.company_id);
      if (options?.siteId) q = q.eq('site_id', options.siteId);
      if (options?.status) q = q.eq('status', options.status);
      q = q.order('created_at', { ascending: false });
      const { data } = await q;
      if (data) {
        setRemedials(data as Remedial[]);
        db.remedials.bulkPut(data as Remedial[]).catch(() => {});
      }
    } catch {
      let d = await db.remedials.where('company_id').equals(profile.company_id).toArray().catch(() => [] as Remedial[]);
      if (options?.siteId) d = d.filter(r => r.site_id === options.siteId);
      if (options?.status) d = d.filter(r => r.status === options.status);
      setRemedials(d);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetch(); }, [profile?.id, options?.siteId, options?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return { remedials, isLoading, refetch: fetch };
}
