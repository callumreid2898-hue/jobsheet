import { useCachedQuery } from './useCachedQuery';
import type { Device, DeviceTest } from '../types';

/** A site's devices. Nothing is fetched until the site is known (so it never shows the whole company's). */
export function useDevices(options: { siteId: string | undefined }) {
  const { rows: devices, isLoading, refetch } = useCachedQuery<Device>(
    { table: 'devices', eq: { site_id: options.siteId }, order: { column: 'created_at', ascending: false } },
    { enabled: !!options.siteId },
  );
  return { devices, isLoading, refetch };
}

/** The company's device tests, for coverage. Only fetched when there are devices to cover. */
export function useDeviceTests(enabled: boolean) {
  const { rows: tests, isLoading } = useCachedQuery<DeviceTest>(
    { table: 'device_tests', order: { column: 'tested_at', ascending: false } },
    { enabled },
  );
  return { tests, isLoading };
}
