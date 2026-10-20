import { supabase } from './supabaseClient';
import { db } from './db';
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
      const photoId = p['blob_key'] as string;
      const storagePath = p['storage_path'] as string;
      const bucket = p['bucket'] as string;

      const photo = await db.photos.get(photoId);
      if (!photo?.blob) throw new SyncError('Local blob not found', 404);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, photo.blob, { upsert: true });
      if (uploadError) {
        throw new SyncError(uploadError.message, (uploadError as { status?: number }).status);
      }

      // Update photos row with storage_path, clear blob
      await db.photos.update(photoId, { storage_path: storagePath, blob: undefined });
      await supabase
        .from('photos')
        .update({ storage_path: storagePath })
        .eq('id', photoId);
      break;
    }
  }
}

// ─── Flush ───────────────────────────────────────────────────────────────────

let rerunRequested = false;

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (state.isSyncing) {
    rerunRequested = true;
    return { synced: 0, failed: 0 };
  }
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

        // After a jobsheet is synced and submitted, trigger PDF generation
        if (item.table === 'jobsheets' && item.payload['submitted_at']) {
          triggerPDFGeneration(item.payload['id'] as string).catch(() => {/* silent */});
        }

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

export async function discardItem(id: string) {
  await db.sync_queue.delete(id);
  await updateQueueLength();
}

async function triggerPDFGeneration(jobsheetId: string) {
  try {
    const { generateAndUploadPDF } = await import('../pdf/generatePDF');
    const jobsheet = await db.jobsheets.get(jobsheetId);
    if (!jobsheet) return;

    const job = await db.jobs.get(jobsheet.job_id);
    if (!job) return;

    const site = await db.sites.get(job.site_id);
    if (!site) return;

    const customer = await db.customers.get(site.customer_id);
    if (!customer) return;

    const profile = await db.profiles.where('company_id').equals(jobsheet.company_id).first();
    if (!profile) return;

    const company = await db.companies.get(jobsheet.company_id);
    if (!company) return;

    const photos = await db.photos.where('jobsheet_id').equals(jobsheetId).toArray();
    const remedials = await db.remedials.where('jobsheet_id').equals(jobsheetId).toArray();

    // Dynamically import template
    const templateModule = await import(`../templates/${jobsheet.template_id}.json`);
    const template = templateModule.default;

    await generateAndUploadPDF(jobsheet, job, site, customer, company, profile, photos, remedials, template);
  } catch {
    // PDF generation failed silently — manager will see "generating..." state
  }
}

let started = false;

export function startSyncEngine() {
  if (started) return;
  started = true;

  // Older builds cached Supabase API responses in Workbox; Dexie is the offline store now.
  if (typeof caches !== 'undefined') caches.delete('supabase-cache').catch(() => {/* silent */});

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
