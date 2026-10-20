import { useCachedQuery } from './useCachedQuery';
import type { Contract, ContractStatus } from '../types';

export function useContracts(options?: { siteId?: string; status?: ContractStatus }) {
  const { rows: contracts, isLoading, refetch } = useCachedQuery<Contract>({
    table: 'contracts',
    eq: { site_id: options?.siteId, status: options?.status },
    order: { column: 'created_at', ascending: false },
  });
  return { contracts, isLoading, refetch };
}
