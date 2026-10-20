import { useCachedQuery } from './useCachedQuery';
import type { Profile, UserRole } from '../types';

export function useProfiles(options?: { role?: UserRole }) {
  const { rows: profiles, isLoading, refetch } = useCachedQuery<Profile>({
    table: 'profiles', eq: { role: options?.role }, order: { column: 'full_name' },
  });
  return { profiles, isLoading, refetch };
}
