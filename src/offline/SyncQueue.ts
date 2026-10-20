import { db } from '../lib/db';
import { getSyncIdentity, scheduleFlush } from '../lib/syncEngine';
import type { JobStatus, SyncOperation } from '../types';

export function syncKey(table: string, id: string): string {
  return `${table}:${id}`;
}

/**
 * Queues a write for the current user. Safe to call inside a Dexie transaction
 * that includes `db.sync_queue`. Triggers a debounced flush.
 */
export async function enqueueSync(item: {
  table: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  /** Row id; defaults to payload.id (or payload.blob_key for uploads). */
  entity_id?: string;
  /** Entity keys (see syncKey) that must reach the server first. */
  depends_on?: string[];
}): Promise<void> {
  const { userId, companyId } = getSyncIdentity();
  const entityId = item.entity_id
    ?? (item.payload['id'] as string | undefined)
    ?? (item.payload['blob_key'] as string | undefined)
    ?? crypto.randomUUID();

  await db.transaction('rw', db.sync_queue, async () => {
    const last = await db.sync_queue.orderBy('seq').last();
    await db.sync_queue.add({
      id: crypto.randomUUID(),
      table: item.table,
      operation: item.operation,
      payload: item.payload,
      created_at: new Date().toISOString(),
      attempts: 0,
      last_error: null,
      seq: (last?.seq ?? 0) + 1,
      user_id: userId,
      company_id: (item.payload['company_id'] as string | undefined) ?? companyId,
      status: 'pending',
      next_attempt_at: null,
      entity_key: syncKey(item.table, entityId),
      depends_on: item.depends_on ?? [],
    });
  });

  scheduleFlush();
}

/** Job status changes go through the set_job_status RPC (engineers can't update jobs directly). */
export function enqueueJobStatus(jobId: string, status: JobStatus, dependsOn: string[] = []): Promise<void> {
  return enqueueSync({
    table: 'jobs',
    operation: 'rpc',
    payload: { fn: 'set_job_status', args: { p_job_id: jobId, p_status: status } },
    entity_id: jobId,
    depends_on: dependsOn,
  });
}
