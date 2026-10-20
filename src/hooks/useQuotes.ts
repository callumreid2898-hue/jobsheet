import { useCachedQuery } from './useCachedQuery';
import type { Quote, QuoteStatus } from '../types';

export function useQuotes(options?: { siteId?: string; status?: QuoteStatus }) {
  const { rows: quotes, isLoading, refetch } = useCachedQuery<Quote>({
    table: 'quotes',
    eq: { site_id: options?.siteId, status: options?.status },
    order: { column: 'created_at', ascending: false },
  });
  return { quotes, isLoading, refetch };
}
