import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { clearLocalData } from '../lib/db';
import { fetchOneCached } from '../lib/cachedQuery';
import { flushQueue, getVisibleQueue, setSyncIdentity } from '../lib/syncEngine';
import { resolveProfile } from './resolveProfile';
import type { AccessState, AuthContextValue, Profile, Company, UserRole } from '../types';

const AuthContext = createContext<AuthContextValue>({
  session: null, profile: null, company: null, isLoading: true,
  previewRole: null, setPreviewRole: () => {},
  signOut: async () => {}, access: 'none', refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [access, setAccess] = useState<AccessState>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const userIdRef = useRef<string | null>(null);

  async function doLoad(userId: string) {
    const res = await resolveProfile(userId);
    if (res.access === 'removed') {
      // Their company's data must not stay on this device. Unsent work can't
      // be sent any more (RLS rejects it); the manager reassigns their jobs.
      setSyncIdentity(null, null);
      await clearLocalData().catch(() => {});
    }
    setAccess(res.access);
    setProfile(res.profile);
    if (res.profile) {
      setSyncIdentity(userId, res.profile.company_id);
      setCompany(await fetchOneCached<Company>('companies', res.profile.company_id));
    } else {
      setCompany(null);
    }
  }

  const inflight = useRef<{ userId: string; done: Promise<void> } | null>(null);

  // getSession and the first auth event both ask for the same user at start-up: share one load
  const loadProfileAndCompany = useCallback((userId: string): Promise<void> => {
    if (inflight.current?.userId === userId) return inflight.current.done;
    const done = doLoad(userId).finally(() => {
      if (inflight.current?.done === done) inflight.current = null;
    });
    inflight.current = { userId, done };
    return done;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      userIdRef.current = s?.user.id ?? null;
      setSyncIdentity(s?.user.id ?? null, null);
      if (s?.user) {
        loadProfileAndCompany(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const changed = (s?.user.id ?? null) !== userIdRef.current;
      userIdRef.current = s?.user.id ?? null;
      setSyncIdentity(s?.user.id ?? null, null);
      if (s?.user) {
        // Token refreshes don't need a reload; a different user does
        if (changed) loadProfileAndCompany(s.user.id).catch(() => {});
      } else {
        setProfile(null);
        setCompany(null);
        setAccess('none');
        setPreviewRole(null);
      }
    });

    // Back online with no confirmed profile (or a stale one): check again
    const onOnline = () => {
      if (userIdRef.current) loadProfileAndCompany(userIdRef.current).catch(() => {});
    };
    window.addEventListener('online', onOnline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [loadProfileAndCompany]);

  const refreshProfile = useCallback(async () => {
    if (userIdRef.current) await loadProfileAndCompany(userIdRef.current);
  }, [loadProfileAndCompany]);

  // Sign-out wipes this device's data so the next user starts clean (shared devices).
  async function signOut() {
    if (navigator.onLine) await flushQueue().catch(() => {});
    const unsynced = (await getVisibleQueue().catch(() => [])).length;
    if (unsynced > 0 && !window.confirm(
      `${unsynced} change${unsynced !== 1 ? "s haven't" : " hasn't"} synced yet and will be lost if you sign out. Sign out anyway?`,
    )) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      window.alert("Couldn't sign out. Check your connection and try again.");
      return;
    }
    setSyncIdentity(null, null);
    await clearLocalData().catch(() => {});
    setSession(null);
    setProfile(null);
    setCompany(null);
    setAccess('none');
    setPreviewRole(null);
  }

  return (
    <AuthContext.Provider value={{
      session, profile, company, isLoading, previewRole, setPreviewRole, signOut, access, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
