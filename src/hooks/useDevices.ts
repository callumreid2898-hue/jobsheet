import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Device } from '../types';

export function useDevices(options?: { siteId?: string }) {
  const { profile } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetch() {
    if (!profile) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      let q = supabase.from('devices').select('*').order('created_at', { ascending: false });
      if (options?.siteId) q = q.eq('site_id', options.siteId);
      const { data } = await q;
      if (data) {
        setDevices(data as Device[]);
        db.devices.bulkPut(data as Device[]).catch(() => {});
      }
    } catch {
      let d = await db.devices.where('company_id').equals(profile.company_id).toArray().catch(() => [] as Device[]);
      if (options?.siteId) d = d.filter(dev => dev.site_id === options.siteId);
      setDevices(d);
    } finally { setIsLoading(false); }
  }

  useEffect(() => { fetch(); }, [profile?.id, options?.siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { devices, isLoading, refetch: fetch };
}
