import { useEffect, useState } from 'react';
import { subscribeToSync, flushQueue, type SyncState } from '../lib/syncEngine';

export function useSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    queueLength: 0,
    failedCount: 0,
    lastSyncedAt: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeToSync(setSyncState);
    return unsubscribe;
  }, []);

  function forceSync() {
    flushQueue().catch(() => {/* silent */});
  }

  return {
    queueLength: syncState.queueLength,
    isSyncing: syncState.isSyncing,
    failedCount: syncState.failedCount,
    lastSyncedAt: syncState.lastSyncedAt,
    forceSync,
  };
}
