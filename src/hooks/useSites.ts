import { useCachedQuery } from './useCachedQuery';
import type { Site } from '../types';

export function useSites() {
  const { rows: sites, isLoading, refetch } = useCachedQuery<Site>({ table: 'sites', order: { column: 'address' } });
  return { sites, isLoading, refetch };
}
