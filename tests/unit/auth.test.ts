import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake Supabase for the profile lookup: `profile` is the server's row for the
// user (or null), `down` makes reads fail, `claim` is what claim_invite() does.
const sb = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  down: false,
  claim: (): Record<string, unknown> | null => null,
  rpcs: [] as string[],
}));

vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (sb.down
            ? { data: null, error: { message: 'Failed to fetch' } }
            : { data: sb.profile, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string) => {
      sb.rpcs.push(fn);
      const claimed = sb.claim();
      if (claimed) sb.profile = claimed;
      return { data: !!claimed, error: null };
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

import { db } from '../../src/lib/db';
import { resolveProfile } from '../../src/auth/resolveProfile';

const USER = 'user-1';
const profile = (over: Record<string, unknown> = {}) => ({
  id: 'p1', user_id: USER, company_id: 'co', role: 'engineer', full_name: 'Eng', email: 'e@x', active: true, created_at: '', ...over,
});

beforeEach(async () => {
  await db.profiles.clear();
  sb.profile = null;
  sb.down = false;
  sb.claim = () => null;
  sb.rpcs = [];
});

describe('resolveProfile', () => {
  it('online: uses the server profile and caches it', async () => {
    sb.profile = profile();
    expect(await resolveProfile(USER)).toMatchObject({ access: 'ok', profile: { id: 'p1' } });
    expect(await db.profiles.get('p1')).toBeDefined();
    expect(sb.rpcs).toEqual([]);
  });

  it('online: a stale cached role is replaced by the server one', async () => {
    await db.profiles.put(profile({ role: 'manager' }) as never);
    sb.profile = profile({ role: 'engineer' });
    expect((await resolveProfile(USER)).profile?.role).toBe('engineer');
  });

  it('no profile: claims a pending invite', async () => {
    sb.claim = () => profile();
    expect(await resolveProfile(USER)).toMatchObject({ access: 'ok' });
    expect(sb.rpcs).toEqual(['claim_invite']);
  });

  it('no profile and no invite: onboarding', async () => {
    expect(await resolveProfile(USER)).toEqual({ access: 'none', profile: null });
  });

  it('an inactive profile is removed', async () => {
    sb.profile = profile({ active: false });
    expect(await resolveProfile(USER)).toEqual({ access: 'removed', profile: null });
  });

  it('gone from the server but cached here is removed (not onboarding)', async () => {
    await db.profiles.put(profile() as never);
    expect(await resolveProfile(USER)).toEqual({ access: 'removed', profile: null });
  });

  it('offline: the cached profile is used; with nothing cached it waits for a connection', async () => {
    sb.down = true;
    expect(await resolveProfile(USER)).toEqual({ access: 'offline', profile: null });
    await db.profiles.put(profile() as never);
    expect(await resolveProfile(USER)).toMatchObject({ access: 'ok', profile: { id: 'p1' } });
  });
});
