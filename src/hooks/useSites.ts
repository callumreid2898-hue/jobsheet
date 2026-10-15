import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Site } from '../types';

export function useSites() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setIsLoading(false); return; }
    async function fetch() {
      try {
        const { data } = await supabase.from('sites').select('*').eq('company_id', profile!.company_id).order('address');
        if (data) {
          setSites(data as Site[]);
          db.sites.bulkPut(data as Site[]).catch(() => {});
        }
      } catch {
        const dexieSites = await db.sites.where('company_id').equals(profile!.company_id).sortBy('address').catch(() => [] as Site[]);
        setSites(dexieSites);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sites, isLoading };
}
