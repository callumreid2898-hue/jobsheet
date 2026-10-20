import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { db, clearLocalData } from '../lib/db';
import { flushQueue, getVisibleQueue, setSyncIdentity } from '../lib/syncEngine';
import type { AuthContextValue, Profile, Company, UserRole } from '../types';

const AuthContext = createContext<AuthContextValue>({
  session: null, profile: null, company: null, isLoading: true,
  previewRole: null, setPreviewRole: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);

  async function loadProfileAndCompany(userId: string) {
    // Try Dexie first (offline)
    let p = await db.profiles.where('user_id').equals(userId).first().catch(() => null);
    if (!p) {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      if (data) {
        p = data as Profile;
        await db.profiles.put(p).catch(() => {});
      }
    }
    setProfile(p ?? null);

    if (p) {
      setSyncIdentity(userId, p.company_id);
      let c = await db.companies.get(p.company_id).catch(() => null);
      if (!c) {
        const { data } = await supabase.from('companies').select('*').eq('id', p.company_id).single();
        if (data) {
          c = data as Company;
          await db.companies.put(c).catch(() => {});
        }
      }
      setCompany(c ?? null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setSyncIdentity(s?.user.id ?? null, null);
      if (s?.user) {
        loadProfileAndCompany(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSyncIdentity(s?.user.id ?? null, null);
      if (s?.user) {
        loadProfileAndCompany(s.user.id).catch(() => {});
      } else {
        setProfile(null);
        setCompany(null);
        setPreviewRole(null);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setPreviewRole(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, company, isLoading, previewRole, setPreviewRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
