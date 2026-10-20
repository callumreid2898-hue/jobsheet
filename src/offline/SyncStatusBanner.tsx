import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useOnline } from '../lib/useOnline';
import { useSync } from './useSync';

export function SyncStatusBanner() {
  const isOnline = useOnline();
  const { queueLength, isSyncing, failedCount, lastSyncedAt } = useSync();
  const syncPath = useLocation().pathname.startsWith('/manager') ? '/manager/sync' : '/sync';
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (lastSyncedAt && queueLength === 0 && !isSyncing) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncedAt, queueLength, isSyncing]);

  // Nothing to show when everything is fine
  if (isOnline && queueLength === 0 && failedCount === 0 && !isSyncing && !showSuccess) {
    return null;
  }

  let bgColor = 'bg-gray-600';
  let message = '';

  if (!isOnline) {
    bgColor = 'bg-amber-500';
    message = queueLength > 0
      ? `Offline — ${queueLength} item${queueLength !== 1 ? 's' : ''} queued`
      : 'Offline';
  } else if (failedCount > 0) {
    bgColor = 'bg-red-500';
    message = `Sync failed — ${failedCount} item${failedCount !== 1 ? 's' : ''} couldn't sync. Tap to review`;
  } else if (isSyncing) {
    bgColor = 'bg-blue-600';
    message = 'Syncing…';
  } else if (showSuccess) {
    bgColor = 'bg-green-500';
    message = 'All synced ✓';
  } else if (queueLength > 0) {
    bgColor = 'bg-amber-500';
    message = `${queueLength} item${queueLength !== 1 ? 's' : ''} queued for sync`;
  }

  if (!message) return null;

  return (
    <Link
      to={syncPath}
      className={`block ${bgColor} text-white text-xs font-medium text-center py-1.5 px-4 transition-all duration-300`}
      role="status"
      aria-live="polite"
    >
      {message}
    </Link>
  );
}
