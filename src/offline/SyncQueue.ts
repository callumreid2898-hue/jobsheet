import { db } from '../lib/db';
import type { SyncOperation } from '../types';

export async function enqueueSync(item: {
  table: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.sync_queue.add({
    id: crypto.randomUUID(),
    table: item.table,
    operation: item.operation,
    payload: item.payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });
}
