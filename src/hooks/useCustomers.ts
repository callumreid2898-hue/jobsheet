import { useCachedQuery } from './useCachedQuery';
import type { Customer } from '../types';

export function useCustomers() {
  const { rows: customers, isLoading, refetch } = useCachedQuery<Customer>({ table: 'customers', order: { column: 'name' } });
  return { customers, isLoading, refetch };
}
