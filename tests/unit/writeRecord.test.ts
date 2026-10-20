import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake Supabase: `rows` is the server; writes and reads are recorded; `respond`
// decides each write's result and `readError` makes reads fail.
type Row = Record<string, unknown>;
type Call = { table: string; op: string; row?: unknown };
const sb = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  calls: [] as Call[],
  respond: (_c: Call): { error: { message: string } | null; status: number } => ({ error: null, status: 200 }),
  readError: null as { message: string } | null,
}));

vi.mock('../../src/lib/supabaseClient', () => {
  const write = (c: Call) => {
    sb.calls.push(c);
    return Promise.resolve(sb.respond(c));
  };
  const select = (table: string) => {
    const eqs: [string, unknown][] = [];
    const run = () => {
      sb.calls.push({ table, op: 'select' });
      if (sb.readError) return { data: null, error: sb.readError, status: 0 };
      return { data: (sb.rows[table] ?? []).filter(r => eqs.every(([k, v]) => r[k] === v)), error: null, status: 200 };
    };
    const q = {
      eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; },
      order: () => q,
      maybeSingle: async () => { const r = run(); return r.error ? r : { ...r, data: r.data![0] ?? null }; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => select(table),
        upsert: (row: unknown) => write({ table, op: 'insert', row }),
        update: (row: unknown) => ({ eq: () => write({ table, op: 'update', row }) }),
        delete: () => ({ eq: () => write({ table, op: 'delete' }) }),
      }),
      rpc: (fn: string, row: unknown) => write({ table: 'rpc', op: fn, row }),
      storage: { from: () => ({}) },
    },
  };
});

vi.mock('../../src/auth/AuthProvider', () => ({
  useAuth: () => ({ profile: { id: 'p1', company_id: 'co', role: 'manager' } }),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useSites } from '../../src/hooks/useSites';
import { db } from '../../src/lib/db';
import { setSyncIdentity, discardItem } from '../../src/lib/syncEngine';
import { writeRecord, writeRecords } from '../../src/lib/writeRecord';
import { fetchCached, fetchOneCached } from '../../src/lib/cachedQuery';
import { subscribeToToasts, dismissToast } from '../../src/lib/toast';
import type { Toast } from '../../src/hooks/useToast';
import type { Site } from '../../src/types';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, writable: true, configurable: true });
}

let toasts: Toast[] = [];
subscribeToToasts(t => { toasts = t; });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  setOnline(true);
  await Promise.all([db.sync_queue.clear(), db.sites.clear(), db.customers.clear()]);
  sb.rows = {};
  sb.calls = [];
  sb.readError = null;
  sb.respond = () => ({ error: null, status: 200 });
  setSyncIdentity('mgr', 'co');
  vi.clearAllTimers();
  toasts.forEach(t => dismissToast(t.id));
});

afterEach(() => vi.useRealTimers());

const site = (id: string, extra: Row = {}) => ({ id, company_id: 'co', customer_id: 'c1', address: `${id} street`, ...extra });
const writes = () => sb.calls.filter(c => c.op !== 'select').map(c => `${c.table}:${c.op}`);

describe('writeRecords', () => {
  it('online: writes Dexie and the server, clears the queue, no toast', async () => {
    const res = await writeRecord('sites', 'insert', site('s1'));
    expect(res).toEqual({ status: 'saved', error: null });
    expect(await db.sites.get('s1')).toMatchObject({ address: 's1 street' });
    expect(writes()).toEqual(['sites:insert']);
    expect(await db.sync_queue.count()).toBe(0);
    expect(toasts).toEqual([]);
  });

  it('update sends only the patch and merges it into the local row', async () => {
    await db.sites.put(site('s1') as never);
    await writeRecord('sites', 'update', { id: 's1', hazards: 'Asbestos' });
    expect(sb.calls.at(-1)!.row).toEqual({ hazards: 'Asbestos' });
    expect(await db.sites.get('s1')).toMatchObject({ address: 's1 street', hazards: 'Asbestos' });
  });

  it('a server rejection is reported, kept locally and left on the Sync screen', async () => {
    sb.respond = () => ({ error: { message: 'new row violates row-level security' }, status: 403 });
    const res = await writeRecord('sites', 'insert', site('s1'));
    expect(res).toEqual({ status: 'failed', error: 'new row violates row-level security' });
    expect(await db.sites.get('s1')).toBeDefined();
    expect((await db.sync_queue.toArray()).map(i => i.status)).toEqual(['failed']);
    expect(toasts.map(t => t.kind)).toEqual(['error']);
  });

  it('a network failure is queued for retry', async () => {
    sb.respond = () => ({ error: { message: 'Failed to fetch' }, status: 0 });
    const res = await writeRecord('sites', 'insert', site('s1'));
    expect(res.status).toBe('queued');
    expect((await db.sync_queue.toArray()).map(i => i.status)).toEqual(['pending']);
    expect(toasts.map(t => t.kind)).toEqual(['warning']);
  });

  it('offline: nothing is sent; the write is queued', async () => {
    setOnline(false);
    expect((await writeRecord('sites', 'insert', site('s1'))).status).toBe('queued');
    expect(writes()).toEqual([]);
    expect(await db.sites.get('s1')).toBeDefined();
  });

  it('children wait for their parent: a rejected parent holds back the rest', async () => {
    sb.respond = c => (c.table === 'customers' ? { error: { message: 'denied' }, status: 403 } : { error: null, status: 200 });
    const res = await writeRecords([
      { table: 'customers', op: 'insert', row: { id: 'c1', name: 'New' } },
      { table: 'sites', op: 'insert', row: site('s1') },
    ]);
    expect(res.status).toBe('failed');
    expect(writes()).toEqual(['customers:insert']);
    expect((await db.sync_queue.orderBy('seq').toArray()).map(i => [i.table, i.status]))
      .toEqual([['customers', 'failed'], ['sites', 'pending']]);
  });

  it('a later edit to the same row waits behind an unsent earlier one', async () => {
    setOnline(false);
    await writeRecord('sites', 'insert', site('s1'));
    await writeRecord('sites', 'update', { id: 's1', hazards: 'x' });
    setOnline(true);
    await writeRecord('sites', 'update', { id: 's1', hazards: 'y' });
    expect(writes()).toEqual(['sites:insert', 'sites:update', 'sites:update']);
    expect(sb.calls.filter(c => c.op === 'update').map(c => (c.row as Row).hazards)).toEqual(['x', 'y']);
  });
});

describe('fetchCached', () => {
  it('caches server rows, filtered and ordered', async () => {
    sb.rows.sites = [site('b', { customer_id: 'c1' }), site('a', { customer_id: 'c1' }), site('z', { customer_id: 'c2' })];
    const res = await fetchCached<Site>({ table: 'sites', eq: { customer_id: 'c1' }, order: { column: 'address' } });
    expect(res.fromCache).toBe(false);
    expect(res.rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(await db.sites.count()).toBe(2);
  });

  it('falls back to Dexie when the read returns an error (it does not throw)', async () => {
    await db.sites.bulkPut([site('a'), site('b', { customer_id: 'c2' })] as never);
    sb.readError = { message: 'Failed to fetch' };
    const res = await fetchCached<Site>({ table: 'sites', eq: { customer_id: 'c1' } });
    expect(res).toMatchObject({ fromCache: true });
    expect(res.rows.map(r => r.id)).toEqual(['a']);
  });

  it('shows a row created here but not yet sent, and keeps an unsent local edit', async () => {
    setOnline(false);
    await writeRecord('sites', 'insert', site('new'));
    await db.sites.put(site('old') as never);
    await writeRecord('sites', 'update', { id: 'old', address: 'edited locally' });
    setOnline(true);
    sb.rows.sites = [site('old')];
    // The server read happens without flushing (e.g. another tab)
    const res = await fetchCached<Site>({ table: 'sites', order: { column: 'id' } });
    expect(res.rows.map(r => [r.id, r.address])).toEqual([['new', 'new street'], ['old', 'edited locally']]);
  });

  it('drops a locally changed row that no longer matches the filter', async () => {
    setOnline(false);
    await db.sites.put(site('s1') as never);
    await writeRecord('sites', 'update', { id: 's1', customer_id: 'c2' });
    setOnline(true);
    sb.rows.sites = [site('s1')]; // server still has c1
    expect((await fetchCached<Site>({ table: 'sites', eq: { customer_id: 'c1' } })).rows).toEqual([]);
  });

  it('fetchOneCached: server copy, local copy while an edit is unsent, local when offline', async () => {
    sb.rows.sites = [site('s1', { address: 'server' })];
    expect((await fetchOneCached<{ id: string; address: string }>('sites', 's1'))!.address).toBe('server');

    setOnline(false);
    await writeRecord('sites', 'update', { id: 's1', address: 'mine' });
    setOnline(true);
    expect((await fetchOneCached<{ id: string; address: string }>('sites', 's1'))!.address).toBe('mine');

    sb.readError = { message: 'offline' };
    expect((await fetchOneCached<{ id: string; address: string }>('sites', 's1'))!.address).toBe('mine');
    expect(await fetchOneCached('sites', 'missing')).toBeNull();
  });
});

describe('discardItem', () => {
  it('discarding a rejected create removes the local-only row', async () => {
    sb.respond = () => ({ error: { message: 'denied' }, status: 403 });
    await writeRecord('sites', 'insert', site('s1'));
    const [item] = await db.sync_queue.toArray();
    await discardItem(item.id);
    expect(await db.sites.get('s1')).toBeUndefined();
    expect(await db.sync_queue.count()).toBe(0);
  });
});

describe('hooks', () => {
  it('useSites shows the cached sites when the fetch fails', async () => {
    vi.useRealTimers();
    await db.sites.bulkPut([site('b'), site('a')] as never);
    sb.readError = { message: 'Failed to fetch' };
    const { result } = renderHook(() => useSites());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sites.map(s => s.id)).toEqual(['a', 'b']); // ordered by address
  });
});
