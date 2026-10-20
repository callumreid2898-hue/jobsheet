import { useCachedQuery } from './useCachedQuery';
import type { Profile, UserRole } from '../types';

/** Company members. Removed (inactive) members are left out unless includeInactive is set. */
export function useProfiles(options?: { role?: UserRole; includeInactive?: boolean }) {
  const { rows, isLoading, refetch } = useCachedQuery<Profile>({
    table: 'profiles', eq: { role: options?.role }, order: { column: 'full_name' },
  });
  // Rows cached before 00013 have no `active`; treat them as active
  const profiles = options?.includeInactive ? rows : rows.filter(p => p.active !== false);
  return { profiles, isLoading, refetch };
}
