import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Customer } from '../types';

export function useCustomers() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setIsLoading(false); return; }
    async function fetch() {
      try {
        const { data } = await supabase.from('customers').select('*').eq('company_id', profile!.company_id).order('name');
        if (data) {
          setCustomers(data as Customer[]);
          db.customers.bulkPut(data as Customer[]).catch(() => {});
        }
      } catch {
        const d = await db.customers.where('company_id').equals(profile!.company_id).sortBy('name').catch(() => [] as Customer[]);
        setCustomers(d);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { customers, isLoading };
}
