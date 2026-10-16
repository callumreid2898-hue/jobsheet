import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Quote, QuoteStatus } from '../types';

export function useQuotes(options?: { siteId?: string; status?: QuoteStatus }) {
  const { profile } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetch() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      let q = supabase.from('quotes').select('*').order('created_at', { ascending: false });
      if (options?.siteId) q = q.eq('site_id', options.siteId);
      if (options?.status) q = q.eq('status', options.status);
      const { data } = await q;
      if (data) {
        setQuotes(data as Quote[]);
        db.quotes.bulkPut(data as Quote[]).catch(() => {});
      }
    } catch {
      let d = await db.quotes.where('company_id').equals(profile.company_id).toArray().catch(() => [] as Quote[]);
      if (options?.siteId) d = d.filter(q => q.site_id === options.siteId);
      if (options?.status) d = d.filter(q => q.status === options.status);
      setQuotes(d);
    } finally { setIsLoading(false); }
  }

  useEffect(() => { fetch(); }, [profile?.id, options?.siteId, options?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { quotes, isLoading, refetch: fetch };
}
