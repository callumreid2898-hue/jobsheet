import { useCachedQuery } from './useCachedQuery';
import { FEATURES } from '../lib/features';
import type { Invoice, InvoiceStatus } from '../types';

export function useInvoices(options?: { status?: InvoiceStatus; customerId?: string; siteId?: string }) {
  const { rows: invoices, isLoading, refetch } = useCachedQuery<Invoice>({
    table: 'invoices',
    eq: { status: options?.status, customer_id: options?.customerId, site_id: options?.siteId },
    order: { column: 'created_at', ascending: false },
  }, { enabled: FEATURES.invoices });
  return { invoices, isLoading, refetch };
}
