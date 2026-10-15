import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Dexie db before importing syncEngine
vi.mock('../../src/lib/db', () => ({
  db: {
    sync_queue: {
      count: vi.fn().mockResolvedValue(0),
      where: vi.fn().mockReturnThis(),
      aboveOrEqual: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
    },
    photos: {
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    },
    jobsheets: {
      get: vi.fn().mockResolvedValue(null),
    },
    jobs: { get: vi.fn().mockResolvedValue(null) },
    sites: { get: vi.fn().mockResolvedValue(null) },
    customers: { get: vi.fn().mockResolvedValue(null) },
    profiles: { where: vi.fn().mockReturnThis(), equals: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) },
    companies: { get: vi.fn().mockResolvedValue(null) },
    remedials: { where: vi.fn().mockReturnThis(), equals: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock Supabase
vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

describe('subscribeToSync', () => {
  beforeEach(async () => {
    // Re-import module to reset module-level state between test groups
    vi.resetModules();
  });

  it('immediately calls listener with current state on subscribe', async () => {
    const { subscribeToSync } = await import('../../src/lib/syncEngine');
    const listener = vi.fn();
    const unsubscribe = subscribeToSync(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0];
    expect(state).toMatchObject({
      isSyncing: false,
      queueLength: 0,
      failedCount: 0,
      lastSyncedAt: null,
    });

    unsubscribe();
  });

  it('unsubscribe stops listener from receiving updates', async () => {
    const { subscribeToSync, flushQueue } = await import('../../src/lib/syncEngine');
    const listener = vi.fn();
    const unsubscribe = subscribeToSync(listener);
    unsubscribe();

    listener.mockClear();
    await flushQueue();

    // Listener should not have been called after unsubscribe
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners all receive state updates', async () => {
    const { subscribeToSync } = await import('../../src/lib/syncEngine');
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsub1 = subscribeToSync(listener1);
    const unsub2 = subscribeToSync(listener2);

    // Both should have been called on subscribe
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});

describe('flushQueue', () => {
  it('returns early when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { flushQueue } = await import('../../src/lib/syncEngine');

    const result = await flushQueue();
    expect(result).toEqual({ synced: 0, failed: 0 });

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('returns zero counts when queue is empty', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    vi.resetModules();
    const { flushQueue } = await import('../../src/lib/syncEngine');

    const result = await flushQueue();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('skips items with 5 or more attempts', async () => {
    vi.resetModules();

    // Override the toArray mock to return a stuck item
    const { db } = await import('../../src/lib/db');
    vi.mocked(db.sync_queue.orderBy('').toArray).mockResolvedValueOnce([
      {
        id: 'item-1',
        table: 'jobs',
        operation: 'upsert',
        payload: { id: 'job-1', status: 'submitted' },
        created_at: new Date().toISOString(),
        attempts: 5,
        last_error: 'Network error',
      },
    ]);

    const { flushQueue } = await import('../../src/lib/syncEngine');
    const result = await flushQueue();

    // Item has 5 attempts so should be counted as failed, not processed
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
  });
});
