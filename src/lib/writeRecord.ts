import { db } from './db';
import { flushNow } from './syncEngine';
import { showToast } from './toast';
import { enqueueSync, syncKey } from '../offline/SyncQueue';

// The write pattern for everything except the engineer's jobsheet flow:
// Dexie and the sync queue in one transaction, then an immediate flush.
// Going through the queue keeps writes to the same row in order and gives
// offline/retry handling for free.

/**
 * insert: a new row (retries ignore duplicates). Needs INSERT.
 * update: `row` is a patch `{ id, ...fields }`. Needs UPDATE.
 * delete: `row` is `{ id }`. Needs DELETE.
 */
export type WriteOp = 'insert' | 'update' | 'delete';

export interface Write {
  table: string;
  op: WriteOp;
  row: { id: string } & Record<string, unknown>;
  /** Extra entity keys (syncKey) that must reach the server first. */
  dependsOn?: string[];
}

/** saved: on the server. queued: on this device, will sync. failed: the server rejected it. */
export type WriteStatus = 'saved' | 'queued' | 'failed';

export interface WriteResult {
  status: WriteStatus;
  error: string | null;
}

export interface WriteOptions {
  /** Toast on queued/failed (default true). Saved writes never toast. */
  notify?: boolean;
}

/**
 * Writes several rows as one change, in order. Each write waits for the ones
 * before it, so children never reach the server before their parent.
 */
export async function writeRecords(writes: Write[], options: WriteOptions = {}): Promise<WriteResult> {
  if (writes.length === 0) return { status: 'saved', error: null };
  const tables = [...new Set(writes.map(w => db.table(w.table)))];
  const itemIds: string[] = [];

  await db.transaction('rw', [...tables, db.sync_queue], async () => {
    const earlier: string[] = [];
    for (const w of writes) {
      const table = db.table(w.table);
      if (w.op === 'insert') {
        await table.put(w.row);
      } else if (w.op === 'update') {
        const { id, ...patch } = w.row;
        await table.update(id, patch);
      } else {
        await table.delete(w.row.id);
      }
      itemIds.push(await enqueueSync({
        table: w.table,
        operation: w.op,
        payload: w.op === 'delete' ? { id: w.row.id } : w.row,
        depends_on: [...earlier, ...(w.dependsOn ?? [])],
      }));
      earlier.push(syncKey(w.table, w.row.id));
    }
  });

  if (navigator.onLine) await flushNow().catch(() => {});

  const left = (await db.sync_queue.bulkGet(itemIds)).filter(i => !!i);
  const failed = left.find(i => i!.status === 'failed');
  const result: WriteResult = failed
    ? { status: 'failed', error: failed.last_error }
    : left.length > 0
      ? { status: 'queued', error: left[0]!.last_error }
      : { status: 'saved', error: null };

  if (options.notify !== false) {
    if (result.status === 'failed') {
      showToast(`The server rejected this change: ${result.error ?? 'unknown error'}. It's kept on this device. See Sync to retry or discard.`, 'error', 8000);
    } else if (result.status === 'queued') {
      showToast("Saved on this device. It'll sync when the connection is back.", 'warning');
    }
  }
  return result;
}

export function writeRecord(
  table: string, op: WriteOp, row: Write['row'], options?: WriteOptions & { dependsOn?: string[] },
): Promise<WriteResult> {
  return writeRecords([{ table, op, row, dependsOn: options?.dependsOn }], options);
}
