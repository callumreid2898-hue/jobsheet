import { supabase } from './supabaseClient';
import { db } from './db';

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

async function updateQueueLength() {
  const count = await db.sync_queue.count();
  const failed = await db.sync_queue.where('attempts').aboveOrEqual(5).count();
  setState({ queueLength: count, failedCount: failed });
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (state.isSyncing) return { synced: 0, failed: 0 };
  if (!navigator.onLine) {
    await updateQueueLength();
    return { synced: 0, failed: 0 };
  }

  setState({ isSyncing: true });
  let synced = 0;
  let failed = 0;

  try {
    // Process items ordered by created_at
    const items = await db.sync_queue.orderBy('created_at').toArray();

    for (const item of items) {
      if (item.attempts >= 5) {
        failed++;
        continue;
      }

      try {
        if (item.operation === 'upsert') {
          const { error } = await supabase
            .from(item.table)
            .upsert(item.payload as Record<string, unknown>);
          if (error) throw new Error(error.message);

        } else if (item.operation === 'delete') {
          const { error } = await supabase
            .from(item.table)
            .delete()
            .eq('id', item.payload['id'] as string);
          if (error) throw new Error(error.message);

        } else if (item.operation === 'storage_upload') {
          const photoId = item.payload['blob_key'] as string;
          const storagePath = item.payload['storage_path'] as string;
          const bucket = item.payload['bucket'] as string;

          const photo = await db.photos.get(photoId);
          if (!photo?.blob) throw new Error('Local blob not found');

          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(storagePath, photo.blob, { upsert: true });
          if (uploadError) throw new Error(uploadError.message);

          // Update photos row with storage_path, clear blob
          await db.photos.update(photoId, { storage_path: storagePath, blob: undefined });
          await supabase
            .from('photos')
            .update({ storage_path: storagePath })
            .eq('id', photoId);
        }

        // Success — remove from queue
        await db.sync_queue.delete(item.id);
        synced++;

        // After a jobsheet is synced and submitted, trigger PDF generation
        if (item.table === 'jobsheets' && item.operation === 'upsert') {
          const payload = item.payload as Record<string, unknown>;
          if (payload['submitted_at']) {
            triggerPDFGeneration(payload['id'] as string).catch(() => {/* silent */});
          }
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.sync_queue.update(item.id, {
          attempts: item.attempts + 1,
          last_error: message,
        });
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
  return { synced, failed };
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

  // Initial sync on startup if online
  if (navigator.onLine) {
    flushQueue().catch(() => {/* silent */});
  }

  // Sync whenever connection is restored
  window.addEventListener('online', () => {
    flushQueue().catch(() => {/* silent */});
  });

  // Update queue length counter whenever Dexie changes
  // (lightweight polling every 5s for queue display)
  setInterval(() => {
    updateQueueLength().catch(() => {/* silent */});
  }, 5000);

  updateQueueLength().catch(() => {/* silent */});
}
