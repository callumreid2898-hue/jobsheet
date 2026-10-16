import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Contract, ContractStatus } from '../types';

export function useContracts(options?: { siteId?: string; status?: ContractStatus }) {
  const { profile } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetch() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      let q = supabase.from('contracts').select('*').order('created_at', { ascending: false });
      if (options?.siteId) q = q.eq('site_id', options.siteId);
      if (options?.status) q = q.eq('status', options.status);
      const { data } = await q;
      if (data) {
        setContracts(data as Contract[]);
        db.contracts.bulkPut(data as Contract[]).catch(() => {});
      }
    } catch {
      let d = await db.contracts.where('company_id').equals(profile.company_id).toArray().catch(() => [] as Contract[]);
      if (options?.siteId) d = d.filter(c => c.site_id === options.siteId);
      if (options?.status) d = d.filter(c => c.status === options.status);
      setContracts(d);
    } finally { setIsLoading(false); }
  }

  useEffect(() => { fetch(); }, [profile?.id, options?.siteId, options?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { contracts, isLoading, refetch: fetch };
}
