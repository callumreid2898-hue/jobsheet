import { useCachedQuery } from './useCachedQuery';
import type { InvoiceLine } from '../types';

export function useInvoiceLines(invoiceId: string | undefined) {
  const { rows: lines, isLoading, refetch } = useCachedQuery<InvoiceLine>(
    { table: 'invoice_lines', eq: { invoice_id: invoiceId }, order: { column: 'sort_order' } },
    { enabled: !!invoiceId },
  );
  return { lines, isLoading, refetch };
}
