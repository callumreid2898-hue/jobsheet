import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Invoice, InvoiceStatus } from '../types';

export function useInvoices(options?: { status?: InvoiceStatus; customerId?: string; siteId?: string }) {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchInvoices() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (options?.status)     q = q.eq('status', options.status);
      if (options?.customerId) q = q.eq('customer_id', options.customerId);
      if (options?.siteId)     q = q.eq('site_id', options.siteId);
      const { data, error } = await q;
      if (error) throw error;
      const result = (data ?? []) as Invoice[];
      setInvoices(result);
      await db.invoices.bulkPut(result).catch(() => {});
    } catch {
      let d = await db.invoices.where('company_id').equals(profile.company_id).toArray().catch(() => [] as Invoice[]);
      if (options?.status)     d = d.filter(i => i.status === options.status);
      if (options?.customerId) d = d.filter(i => i.customer_id === options.customerId);
      if (options?.siteId)     d = d.filter(i => i.site_id === options.siteId);
      setInvoices(d);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchInvoices();
  }, [profile?.id, options?.status, options?.customerId, options?.siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { invoices, isLoading, refetch: fetchInvoices };
}
