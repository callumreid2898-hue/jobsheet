import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { System } from '../types';

export function useSystems(siteId?: string) {
  const { profile } = useAuth();
  const [systems, setSystems] = useState<System[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setIsLoading(false); return; }
    async function fetch() {
      try {
        let query = supabase.from('systems').select('*').eq('company_id', profile!.company_id);
        if (siteId) query = query.eq('site_id', siteId);
        const { data } = await query;
        if (data) {
          setSystems(data as System[]);
          db.systems.bulkPut(data as System[]).catch(() => {});
        }
      } catch {
        let d = await db.systems.where('company_id').equals(profile!.company_id).toArray().catch(() => [] as System[]);
        if (siteId) d = d.filter(s => s.site_id === siteId);
        setSystems(d);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [profile?.id, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { systems, isLoading };
}
