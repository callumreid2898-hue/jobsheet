import { useCachedQuery } from './useCachedQuery';
import type { Remedial, RemedialStatus } from '../types';

export function useRemedials(options?: { siteId?: string; status?: RemedialStatus }) {
  const { rows: remedials, isLoading, refetch } = useCachedQuery<Remedial>({
    table: 'remedials',
    eq: { site_id: options?.siteId, status: options?.status },
    order: { column: 'created_at', ascending: false },
  });
  return { remedials, isLoading, refetch };
}
