import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { InvoiceLine } from '../types';

export function useInvoiceLines(invoiceId: string | undefined) {
  const { profile } = useAuth();
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchLines() {
    if (!profile || !invoiceId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const result = (data ?? []) as InvoiceLine[];
      setLines(result);
      await db.invoice_lines.bulkPut(result).catch(() => {});
    } catch {
      const d = await db.invoice_lines.where('invoice_id').equals(invoiceId).toArray().catch(() => [] as InvoiceLine[]);
      setLines(d.sort((a, b) => a.sort_order - b.sort_order));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLines();
  }, [profile?.id, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { lines, isLoading, refetch: fetchLines };
}
