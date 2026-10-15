import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import type { AuthContextValue, Profile, Company } from '../types';

const AuthContext = createContext<AuthContextValue>({
  session: null, profile: null, company: null, isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      if (s?.user) {
        loadProfileAndCompany(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadProfileAndCompany(s.user.id).catch(() => {});
      } else {
        setProfile(null);
        setCompany(null);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setCompany(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, company, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
