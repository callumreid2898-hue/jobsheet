import { useCachedQuery } from './useCachedQuery';
import type { System } from '../types';

export function useSystems(siteId?: string) {
  const { rows: systems, isLoading, refetch } = useCachedQuery<System>({ table: 'systems', eq: { site_id: siteId } });
  return { systems, isLoading, refetch };
}
