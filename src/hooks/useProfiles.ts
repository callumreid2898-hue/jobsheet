import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Profile, UserRole } from '../types';

export function useProfiles(options?: { role?: UserRole }) {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setIsLoading(false); return; }
    async function fetch() {
      try {
        let q = supabase.from('profiles').select('*').eq('company_id', profile!.company_id);
        if (options?.role) q = q.eq('role', options.role);
        const { data } = await q;
        if (data) {
          setProfiles(data as Profile[]);
          db.profiles.bulkPut(data as Profile[]).catch(() => {});
        }
      } catch {
        let d = await db.profiles.where('company_id').equals(profile!.company_id).toArray().catch(() => [] as Profile[]);
        if (options?.role) d = d.filter(p => p.role === options.role);
        setProfiles(d);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [profile?.id, options?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  return { profiles, isLoading };
}
