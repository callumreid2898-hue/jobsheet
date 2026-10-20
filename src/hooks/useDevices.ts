import { useCachedQuery } from './useCachedQuery';
import type { Device } from '../types';

export function useDevices(options?: { siteId?: string }) {
  const { rows: devices, isLoading, refetch } = useCachedQuery<Device>({
    table: 'devices', eq: { site_id: options?.siteId }, order: { column: 'created_at', ascending: false },
  });
  return { devices, isLoading, refetch };
}
