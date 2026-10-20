import { supabase } from './supabaseClient';
import { db } from './db';
import { getLocalBlob } from './media';
import type { SyncQueueItem } from '../types';

type SyncListener = (state: SyncState) => void;

export interface SyncState {
  isSyncing: boolean;
  queueLength: number;
  failedCount: number;
  lastSyncedAt: string | null;
}

let state: SyncState = {
  isSyncing: false,
  queueLength: 0,
  failedCount: 0,
  lastSyncedAt: null,
};

const listeners = new Set<SyncListener>();

export function subscribeToSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}

// ─── Identity ────────────────────────────────────────────────────────────────
// Set by AuthProvider. Queue items are stamped with the user and only flushed
// under that user's session.

let identity: { userId: string | null; companyId: string | null } = { userId: null, companyId: null };

export function getSyncIdentity() {
  return identity;
}

export function setSyncIdentity(userId: string | null, companyId: string | null) {
  if (userId !== identity.userId) {
    identity = { userId, companyId };
    if (userId) scheduleFlush(0);
    else updateQueueLength().catch(() => {/* silent */});
  } else if (companyId) {
    identity = { userId, companyId };
  }
}

/** Items the current user can see on the Sync screen: their own, plus pre-v5 items with no owner. */
export async function getVisibleQueue(): Promise<SyncQueueItem[]> {
  const items = await db.sync_queue.orderBy('seq').toArray();
  return items.filter(i => i.user_id === null || i.user_id === identity.userId);
}

/**
 * Caches freshly fetched rows in Dexie and returns what to show. Rows with an
 * unsent local change keep the local copy, so a read racing the flush doesn't
 * undo an optimistic write.
 *
 * With `matches` (the query's filter), rows created or changed locally but not
 * yet sent are added to the result if they match, and dropped if they no longer do.
 */
export async function mergeServerRows<T extends { id: string }>(
  table: string, rows: T[], matches?: (row: T) => boolean,
): Promise<T[]> {
  const prefix = `${table}:`;
  const queued = await db.sync_queue.where('entity_key').startsWith(prefix).toArray();
  const pending = new Set(queued.map(i => i.entity_key.slice(prefix.length)));
  const local = new Map(
    (await db.table(table).bulkGet([...pending]) as (T | undefined)[]).flatMap(r => (r ? [[r.id, r] as const] : [])),
  );
  await db.table(table).bulkPut(rows.filter(r => !pending.has(r.id)));
  const merged = rows.map(r => local.get(r.id) ?? r);
  if (!matches) return merged;
  const onServer = new Set(rows.map(r => r.id));
  const localOnly = [...local.values()].filter(r => !onServer.has(r.id));
  return [...merged, ...localOnly].filter(matches);
}

async function updateQueueLength() {
  const items = identity.userId ? await getVisibleQueue() : [];
  setState({
    queueLength: items.length,
    failedCount: items.filter(i => i.status === 'failed').length,
  });
}

// ─── Error classification ────────────────────────────────────────────────────

class SyncError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Network failures (status 0/undefined), 5xx, auth expiry, timeouts and rate limits are retried. */
export function isTransient(status: number | undefined): boolean {
  return !status || status >= 500 || status === 401 || status === 408 || status === 429;
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;

export function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);
}

function check(res: { error: { message: string } | null; status?: number }) {
  if (res.error) throw new SyncError(res.error.message, res.status);
}

async function send(item: SyncQueueItem) {
  const p = item.payload;

  switch (item.operation) {
    case 'upsert':
      check(await supabase.from(item.table).upsert(p));
      break;

    case 'insert':
      check(await supabase.from(item.table).upsert(p, { onConflict: 'id', ignoreDuplicates: true }));
      break;

    case 'update': {
      const { id, ...patch } = p;
      check(await supabase.from(item.table).update(patch).eq('id', id as string));
      break;
    }

    case 'delete':
      check(await supabase.from(item.table).delete().eq('id', p['id'] as string));
      break;

    case 'rpc':
      check(await supabase.rpc(p['fn'] as string, p['args'] as Record<string, unknown>));
      break;

    case 'storage_upload': {
      const storagePath = p['storage_path'] as string;
      const blob = await getLocalBlob(p['blob_key'] as string);
      if (!blob) throw new SyncError('The file is no longer on this device', 404);

      const { error } = await supabase.storage
        .from(p['bucket'] as string)
        .upload(storagePath, blob, { upsert: true, contentType: blob.type || undefined });
      if (error) throw new SyncError(error.message, statusOf(error));
      // The blob stays until the PDF is made, so it can be embedded without a download
      break;
    }

    case 'generate_pdf': {
      const { generateAndUploadPDF } = await import('../pdf/generatePDF');
      try {
        await generateAndUploadPDF(p['jobsheet_id'] as string);
      } catch (err) {
        throw new SyncError(err instanceof Error ? err.message : String(err), statusOf(err));
      }
      break;
    }
  }
}

/** HTTP status carried by Supabase/storage errors (and PDFError); undefined means a network failure. */
function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown } | null;
  const raw = e?.status ?? e?.statusCode;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

// ─── Flush ───────────────────────────────────────────────────────────────────

let rerunRequested = false;
let currentFlush: Promise<unknown> | null = null;

/** Flushes now, waiting for a flush that's already running first (so new items are included). */
export async function flushNow(): Promise<void> {
  if (currentFlush) await currentFlush.catch(() => {});
  await flushQueue();
}

export function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (state.isSyncing) {
    rerunRequested = true;
    return Promise.resolve({ synced: 0, failed: 0 });
  }
  const run = doFlush();
  currentFlush = run;
  run.finally(() => { if (currentFlush === run) currentFlush = null; }).catch(() => {});
  return run;
}

async function doFlush(): Promise<{ synced: number; failed: number }> {
  const userId = identity.userId;
  if (!navigator.onLine || !userId) {
    await updateQueueLength();
    return { synced: 0, failed: 0 };
  }

  setState({ isSyncing: true });
  rerunRequested = false;
  let synced = 0;
  let failed = 0;

  try {
    const items = (await db.sync_queue.orderBy('seq').toArray()).filter(i => i.user_id === userId);
    // Entities with an unsent earlier item. Later writes to them, and their children, wait.
    const blocked = new Set<string>();
    const now = Date.now();

    for (const item of items) {
      const isBlocked = blocked.has(item.entity_key) || item.depends_on.some(k => blocked.has(k));
      const isWaiting = item.next_attempt_at !== null && Date.parse(item.next_attempt_at) > now;

      if (item.status === 'failed') failed++;
      if (item.status === 'failed' || isBlocked || isWaiting) {
        blocked.add(item.entity_key);
        continue;
      }

      try {
        await send(item);

        // Success — remove from queue
        await db.sync_queue.delete(item.id);
        synced++;

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = err instanceof SyncError ? err.status : undefined;
        const attempts = item.attempts + 1;
        const transient = isTransient(status);
        await db.sync_queue.update(item.id, {
          attempts,
          last_error: message,
          status: transient ? 'pending' : 'failed',
          next_attempt_at: transient ? new Date(Date.now() + backoffDelay(attempts)).toISOString() : null,
        });
        blocked.add(item.entity_key);
        failed++;
      }
    }

    setState({
      isSyncing: false,
      lastSyncedAt: synced > 0 ? new Date().toISOString() : state.lastSyncedAt,
    });
  } catch {
    setState({ isSyncing: false });
  }

  await updateQueueLength();
  if (rerunRequested) scheduleFlush();
  return { synced, failed };
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced flush, used after every enqueue. */
export function scheduleFlush(delayMs = 500) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue().catch(() => {/* silent */});
  }, delayMs);
}

/** Sync screen: send an item again now, claiming pre-v5 items for the current user. */
export async function retryItem(id: string) {
  const item = await db.sync_queue.get(id);
  if (!item) return;
  await db.sync_queue.update(id, {
    status: 'pending',
    next_attempt_at: null,
    user_id: item.user_id ?? identity.userId,
  });
  await flushQueue();
}

/**
 * Drops an item. A discarded insert also removes the local row, which never
 * reached the server; a discarded update is replaced by the server copy on the next read.
 */
export async function discardItem(id: string) {
  const item = await db.sync_queue.get(id);
  await db.sync_queue.delete(id);
  if (item?.operation === 'insert' && db.tables.some(t => t.name === item.table)) {
    await db.table(item.table).delete(item.payload['id'] as string).catch(() => {});
  }
  await updateQueueLength();
}

let started = false;

export function startSyncEngine() {
  if (started) return;
  started = true;

  // Older builds cached Supabase API responses in Workbox; Dexie is the offline store now.
  if (typeof caches !== 'undefined') caches.delete('supabase-cache').catch(() => {/* silent */});

  // Ask the browser not to evict Dexie under storage pressure (iOS especially)
  navigator.storage?.persist?.().catch(() => {/* silent */});

  // The first flush runs when AuthProvider sets the identity.

  // Sync whenever connection is restored
  window.addEventListener('online', () => {
    flushQueue().catch(() => {/* silent */});
  });

  // ...and when the app comes back to the foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushQueue().catch(() => {/* silent */});
  });

  // Retry backed-off items and keep the queue counter fresh
  setInterval(() => {
    flushQueue().catch(() => {/* silent */});
  }, 30_000);
}
