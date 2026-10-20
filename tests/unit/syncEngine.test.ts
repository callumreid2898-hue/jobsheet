import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Every Supabase call is recorded; `respond` decides the result.
type Call = { table: string; op: string; row?: unknown; opts?: unknown; id?: unknown };
const sb = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (_c: Call): { error: { message: string } | null; status: number } => ({ error: null, status: 200 }),
}));

vi.mock('../../src/lib/supabaseClient', () => {
  const result = (c: Call) => {
    sb.calls.push(c);
    return Promise.resolve(sb.respond(c));
  };
  return {
    supabase: {
      from: (table: string) => ({
        upsert: (row: unknown, opts?: unknown) => result({ table, op: 'upsert', row, opts }),
        update: (row: unknown) => ({ eq: (_col: string, id: unknown) => result({ table, op: 'update', row, id }) }),
        delete: () => ({ eq: (_col: string, id: unknown) => result({ table, op: 'delete', id }) }),
      }),
      rpc: (fn: string, args: unknown) => result({ table: 'rpc', op: fn, row: args }),
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, blob: unknown, opts?: unknown) => {
            const res = await result({ table: `storage:${bucket}`, op: 'upload', row: path, opts, id: blob });
            return { data: res.error ? null : { path }, error: res.error ? { ...res.error, status: res.status } : null };
          },
        }),
      },
    },
  };
});

// The PDF step is tested on its own (pdf.test.ts); here only its queue behaviour matters.
const pdfGen = vi.hoisted(() => ({ fn: (_id: string): Promise<string> => Promise.resolve('report.pdf') }));
vi.mock('../../src/pdf/generatePDF', () => ({
  generateAndUploadPDF: (id: string) => pdfGen.fn(id),
}));

import { db } from '../../src/lib/db';
import {
  flushQueue, setSyncIdentity, subscribeToSync, isTransient, backoffDelay, type SyncState,
} from '../../src/lib/syncEngine';
import { enqueueSync, enqueueJobStatus, syncKey } from '../../src/offline/SyncQueue';
import { saveLocalBlob } from '../../src/lib/media';
import type { SyncQueueItem } from '../../src/types';

const USER_A = 'user-a';
const USER_B = 'user-b';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, writable: true, configurable: true });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  setOnline(true);
  setSyncIdentity(null, null);
  await db.sync_queue.clear();
  await db.blobs.clear();
  pdfGen.fn = () => Promise.resolve('report.pdf');
  sb.calls = [];
  sb.respond = () => ({ error: null, status: 200 });
  setSyncIdentity(USER_A, 'co-a');
  vi.clearAllTimers(); // drop the flush that signing in schedules
});

afterEach(() => {
  vi.useRealTimers();
});

const queue = () => db.sync_queue.orderBy('seq').toArray();

describe('subscribeToSync', () => {
  it('immediately calls listener with current state on subscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSync(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ isSyncing: false });
    unsubscribe();
  });

  it('unsubscribe stops listener from receiving updates', async () => {
    const listener = vi.fn();
    subscribeToSync(listener)();
    listener.mockClear();
    await flushQueue();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports queue length and failed count for the current user', async () => {
    await enqueueSync({ table: 'jobs', operation: 'update', payload: { id: 'j1', notes: 'x' } });
    sb.respond = () => ({ error: { message: 'denied' }, status: 403 });
    let last: SyncState | null = null;
    const unsub = subscribeToSync(s => { last = s; });
    await flushQueue();
    unsub();
    expect(last).toMatchObject({ queueLength: 1, failedCount: 1, isSyncing: false });
  });
});

describe('enqueueSync', () => {
  it('stamps user, company, a monotonic seq and the entity key', async () => {
    await enqueueSync({ table: 'jobsheets', operation: 'insert', payload: { id: 'js1', company_id: 'co-a' } });
    await enqueueJobStatus('j1', 'on_site');
    const [a, b] = await queue();
    expect(a).toMatchObject({ user_id: USER_A, company_id: 'co-a', status: 'pending', entity_key: 'jobsheets:js1' });
    expect(b).toMatchObject({ user_id: USER_A, company_id: 'co-a', entity_key: 'jobs:j1', operation: 'rpc' });
    expect(b.seq).toBeGreaterThan(a.seq);
  });

  it('triggers a flush when online', async () => {
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r1' } });
    expect(sb.calls).toHaveLength(0);
    await vi.runOnlyPendingTimersAsync();
    await vi.waitFor(async () => expect(await db.sync_queue.count()).toBe(0));
    expect(sb.calls).toHaveLength(1);
  });

  it('several quick enqueues are sent in one debounced flush', async () => {
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r1' } });
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r2' } });
    await vi.runOnlyPendingTimersAsync();
    await vi.waitFor(async () => expect(await db.sync_queue.count()).toBe(0));
    expect(sb.calls.map(c => (c.row as { id: string }).id)).toEqual(['r1', 'r2']);
  });
});

describe('flushQueue operations', () => {
  it('success deletes the item', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    expect(await flushQueue()).toEqual({ synced: 1, failed: 0 });
    expect(await db.sync_queue.count()).toBe(0);
  });

  it('insert ignores duplicates so a retried insert is harmless', async () => {
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r1' } });
    await flushQueue();
    expect(sb.calls[0]).toMatchObject({ op: 'upsert', opts: { onConflict: 'id', ignoreDuplicates: true } });
  });

  it('update sends only the patch, keyed by id', async () => {
    await enqueueSync({ table: 'jobs', operation: 'update', payload: { id: 'j1', assigned_engineer_id: 'p2' } });
    await flushQueue();
    expect(sb.calls[0]).toEqual({ table: 'jobs', op: 'update', row: { assigned_engineer_id: 'p2' }, id: 'j1' });
  });

  it('job status goes through set_job_status', async () => {
    await enqueueJobStatus('j1', 'awaiting_review');
    await flushQueue();
    expect(sb.calls[0]).toEqual({ table: 'rpc', op: 'set_job_status', row: { p_job_id: 'j1', p_status: 'awaiting_review' } });
  });

  it('does nothing without a signed-in user', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    setSyncIdentity(null, null);
    expect(await flushQueue()).toEqual({ synced: 0, failed: 0 });
    expect(sb.calls).toHaveLength(0);
  });

  it('returns early when offline', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    setOnline(false);
    expect(await flushQueue()).toEqual({ synced: 0, failed: 0 });
    expect(sb.calls).toHaveLength(0);
  });
});

describe('flushQueue errors', () => {
  it('a permanent (4xx) failure marks the item failed with last_error', async () => {
    await enqueueJobStatus('j1', 'invoiced');
    sb.respond = () => ({ error: { message: 'engineers cannot move a job' }, status: 403 });
    expect(await flushQueue()).toEqual({ synced: 0, failed: 1 });
    const [item] = await queue();
    expect(item).toMatchObject({ status: 'failed', attempts: 1, last_error: 'engineers cannot move a job', next_attempt_at: null });
  });

  it('a transient failure stays pending with a backoff', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    sb.respond = () => ({ error: { message: 'Failed to fetch' }, status: 0 });
    await flushQueue();
    const [item] = await queue();
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
    expect(Date.parse(item.next_attempt_at!)).toBeGreaterThan(Date.now());

    // Not retried until the backoff has passed
    sb.calls = [];
    await flushQueue();
    expect(sb.calls).toHaveLength(0);

    await db.sync_queue.update(item.id, { next_attempt_at: new Date(Date.now() - 1).toISOString() });
    sb.respond = () => ({ error: null, status: 201 });
    expect(await flushQueue()).toEqual({ synced: 1, failed: 0 });
  });

  it('transient errors never become permanent failures', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    sb.respond = () => ({ error: { message: 'Bad gateway' }, status: 502 });
    for (let i = 0; i < 7; i++) {
      await db.sync_queue.toCollection().modify({ next_attempt_at: null });
      await flushQueue();
    }
    const [item] = await queue();
    expect(item).toMatchObject({ status: 'pending', attempts: 7 });
  });

  it('already-failed items are counted but not resent', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'j1' } });
    await db.sync_queue.toCollection().modify({ status: 'failed' });
    expect(await flushQueue()).toEqual({ synced: 0, failed: 1 });
    expect(sb.calls).toHaveLength(0);
  });

  it('classifies statuses', () => {
    expect([0, undefined, 401, 408, 429, 500, 503].every(isTransient)).toBe(true);
    expect([400, 403, 404, 409, 422].some(isTransient)).toBe(false);
    expect(backoffDelay(1)).toBe(5_000);
    expect(backoffDelay(2)).toBe(10_000);
    expect(backoffDelay(50)).toBe(15 * 60_000);
  });
});

describe('flushQueue ordering', () => {
  it('sends items in seq order regardless of created_at', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'first' } });
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'second' } });
    const [a] = await queue();
    await db.sync_queue.update(a.id, { created_at: '2999-01-01T00:00:00Z' });
    await flushQueue();
    expect(sb.calls.map(c => (c.row as { id: string }).id)).toEqual(['first', 'second']);
  });

  it('children wait while their parent is unsent', async () => {
    const jsKey = syncKey('jobsheets', 'js1');
    await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: { id: 'js1' } });
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r1' }, depends_on: [jsKey] });
    await enqueueJobStatus('j1', 'awaiting_review', [jsKey]);
    await enqueueSync({ table: 'jobs', operation: 'update', payload: { id: 'j1', notes: 'later' } });
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'unrelated' } });

    sb.respond = c => (c.table === 'jobsheets'
      ? { error: { message: 'timeout' }, status: 504 }
      : { error: null, status: 200 });
    await flushQueue();

    // Only the parent was tried, plus the unrelated row. The later write to j1 waits behind the status change.
    expect(sb.calls.map(c => c.table)).toEqual(['jobsheets', 'jobs']);
    expect((sb.calls[1].row as { id: string }).id).toBe('unrelated');
    expect(await db.sync_queue.count()).toBe(4);

    // Parent recovers, everything follows in order
    await db.sync_queue.toCollection().modify({ next_attempt_at: null });
    sb.respond = () => ({ error: null, status: 200 });
    sb.calls = [];
    expect(await flushQueue()).toEqual({ synced: 4, failed: 0 });
    expect(sb.calls.map(c => `${c.table}:${c.op}`)).toEqual([
      'jobsheets:upsert', 'remedials:upsert', 'rpc:set_job_status', 'jobs:update',
    ]);
  });

  it('a failed parent keeps its children queued', async () => {
    await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: { id: 'js1' } });
    await enqueueSync({ table: 'remedials', operation: 'insert', payload: { id: 'r1' }, depends_on: ['jobsheets:js1'] });
    sb.respond = () => ({ error: { message: 'rls' }, status: 403 });
    await flushQueue();
    sb.calls = [];
    sb.respond = () => ({ error: null, status: 200 });
    await flushQueue();
    expect(sb.calls).toHaveLength(0);
    expect((await queue()).map(i => i.status)).toEqual(['failed', 'pending']);
  });
});

describe('flushQueue users', () => {
  it("skips another user's items", async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'mine' } });
    setSyncIdentity(USER_B, 'co-b');
    vi.clearAllTimers();
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'theirs' } });
    vi.clearAllTimers();

    expect(await flushQueue()).toEqual({ synced: 1, failed: 0 });
    expect(sb.calls.map(c => (c.row as { id: string }).id)).toEqual(['theirs']);
    const left: SyncQueueItem[] = await queue();
    expect(left.map(i => i.user_id)).toEqual([USER_A]);
  });

  it('ignores pre-v5 items with no owner', async () => {
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: { id: 'legacy' } });
    await db.sync_queue.toCollection().modify({ user_id: null });
    expect(await flushQueue()).toEqual({ synced: 0, failed: 0 });
    expect(sb.calls).toHaveLength(0);
  });
});

describe('photos, signatures and the PDF', () => {
  const PATH = 'co-a/js1/p1.jpg';
  const jsKey = syncKey('jobsheets', 'js1');
  const uploadKey = syncKey('storage', PATH);

  // What FillJobsheetPage queues on submit, minus remedials and the status change
  async function queueSubmission() {
    await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: { id: 'js1' } });
    await enqueueSync({
      table: 'storage', operation: 'storage_upload',
      payload: { bucket: 'photos', storage_path: PATH, blob_key: PATH },
      entity_id: PATH, depends_on: [jsKey],
    });
    await enqueueSync({ table: 'photos', operation: 'insert', payload: { id: 'p1', storage_path: PATH }, depends_on: [uploadKey] });
    await enqueueSync({
      table: 'pdf', operation: 'generate_pdf', payload: { jobsheet_id: 'js1' },
      entity_id: 'js1', depends_on: [jsKey, uploadKey, syncKey('photos', 'p1')],
    });
  }

  it('uploads the local file to its path, then the photo row, then makes the PDF', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    await saveLocalBlob(PATH, 'js1', blob);
    const pdfCalls: string[] = [];
    pdfGen.fn = async id => { pdfCalls.push(id); return 'report.pdf'; };
    await queueSubmission();

    expect(await flushQueue()).toEqual({ synced: 4, failed: 0 });
    expect(sb.calls.map(c => `${c.table}:${c.op}`)).toEqual(['jobsheets:upsert', 'storage:photos:upload', 'photos:upsert']);
    expect(sb.calls[1]).toMatchObject({ row: PATH, opts: { upsert: true, contentType: 'image/jpeg' } });
    expect((sb.calls[1].id as Blob).size).toBe(blob.size);
    expect(pdfCalls).toEqual(['js1']);
    // Kept for the PDF; generateAndUploadPDF removes it
    expect(await db.blobs.get(PATH)).toBeDefined();
  });

  it('a missing local file fails the upload and holds back the photo row and the PDF', async () => {
    let pdfCalled = false;
    pdfGen.fn = async () => { pdfCalled = true; return ''; };
    await queueSubmission();

    expect(await flushQueue()).toEqual({ synced: 1, failed: 1 });
    expect(pdfCalled).toBe(false);
    const left = await queue();
    expect(left.map(i => [i.operation, i.status])).toEqual([
      ['storage_upload', 'failed'], ['insert', 'pending'], ['generate_pdf', 'pending'],
    ]);
    expect(left[0].last_error).toMatch(/no longer on this device/);
  });

  it('a storage outage keeps the upload pending and the PDF waiting', async () => {
    await saveLocalBlob(PATH, 'js1', new Blob(['x']));
    let pdfCalled = false;
    pdfGen.fn = async () => { pdfCalled = true; return ''; };
    sb.respond = c => (c.table.startsWith('storage:') ? { error: { message: 'Bad gateway' }, status: 502 } : { error: null, status: 200 });
    await queueSubmission();

    await flushQueue();
    expect(pdfCalled).toBe(false);
    expect((await queue()).map(i => i.status)).toEqual(['pending', 'pending', 'pending']);
  });

  it('PDF errors: network failures retry, render failures need attention', async () => {
    await enqueueSync({ table: 'pdf', operation: 'generate_pdf', payload: { jobsheet_id: 'js1' }, entity_id: 'js1' });
    pdfGen.fn = () => Promise.reject(new TypeError('Failed to fetch'));
    await flushQueue();
    expect((await queue())[0]).toMatchObject({ status: 'pending', last_error: 'Failed to fetch' });

    await db.sync_queue.toCollection().modify({ next_attempt_at: null });
    pdfGen.fn = () => Promise.reject(Object.assign(new Error("Couldn't render the report"), { status: 422 }));
    await flushQueue();
    expect((await queue())[0]).toMatchObject({ status: 'failed', attempts: 2 });
  });
});
