import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import type { AccessState, Profile } from '../types';

type ProfileResult = { access: AccessState; profile: Profile | null };

/**
 * Works out who the user is. Online, the server is always asked (so a removed
 * or demoted user doesn't keep a stale cached profile):
 *   - active profile → ok
 *   - inactive profile, or none on the server but one cached here → removed
 *   - none at all → try to claim a pending invite, else onboarding ('none')
 * Offline (or the server can't be reached), the cached profile is used.
 */
export async function resolveProfile(userId: string): Promise<ProfileResult> {
  const cached = await db.profiles.where('user_id').equals(userId).first().catch(() => undefined);

  const fetchOwn = () => supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  let { data, error } = await fetchOwn();
  if (error) {
    // Can't reach the server: trust the cache (only active profiles are ever cached)
    return cached ? { access: 'ok', profile: cached } : { access: 'offline', profile: null };
  }

  if (!data) {
    // Invited after their login already existed, or the signup trigger didn't run
    const { data: claimed } = await supabase.rpc('claim_invite');
    if (claimed) ({ data, error } = await fetchOwn());
  }

  const p = data as Profile | null;
  if (p && p.active !== false) {
    await db.profiles.put(p).catch(() => {});
    return { access: 'ok', profile: p };
  }
  if (p || cached) return { access: 'removed', profile: null };
  return { access: 'none', profile: null };
}
