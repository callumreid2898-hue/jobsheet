import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../auth/AuthProvider';
import { useOnline } from '../../lib/useOnline';
import { useSync } from '../../offline/useSync';
import { discardItem, getVisibleQueue, retryItem } from '../../lib/syncEngine';
import { EmptyState } from '../../components/ui/EmptyState';
import type { SyncQueueItem } from '../../types';

const TABLE_LABELS: Record<string, string> = {
  jobs: 'Job',
  jobsheets: 'Jobsheet',
  remedials: 'Remedial',
  photos: 'Photo',
};

function describe(item: SyncQueueItem): string {
  const what = TABLE_LABELS[item.table] ?? item.table;
  if (item.operation === 'rpc' && item.payload['fn'] === 'set_job_status') {
    const status = (item.payload['args'] as Record<string, unknown>)['p_status'] as string;
    return `${what} status → ${status.replace(/_/g, ' ')}`;
  }
  if (item.table === 'jobsheets' && item.payload['submitted_at']) return 'Jobsheet submission';
  if (item.operation === 'insert') return `New ${what.toLowerCase()}`;
  if (item.operation === 'delete') return `Delete ${what.toLowerCase()}`;
  if (item.operation === 'storage_upload') {
    return String(item.payload['storage_path']).includes('/signatures/') ? 'Signature upload' : 'Photo upload';
  }
  if (item.operation === 'generate_pdf') return 'PDF report';
  return `${what} update`;
}

function statusLine(item: SyncQueueItem, waitingOn: boolean): { text: string; tone: string } {
  if (item.status === 'failed') return { text: 'Rejected by the server', tone: 'text-red-600' };
  if (item.user_id === null) return { text: 'From an earlier version — tap Retry to send', tone: 'text-amber-600' };
  if (waitingOn) return { text: 'Waiting for an earlier change', tone: 'text-slate-500' };
  if (item.next_attempt_at) {
    const time = new Date(item.next_attempt_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return { text: `Couldn't reach the server — retrying at ${time}`, tone: 'text-amber-600' };
  }
  return { text: 'Waiting to send', tone: 'text-slate-500' };
}

export function SyncIssuesPage() {
  const { session, signOut } = useAuth();
  const isOnline = useOnline();
  const { isSyncing, forceSync } = useSync();
  const items = useLiveQuery(() => getVisibleQueue(), [session?.user.id]) ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  async function retry(id: string) {
    setBusyId(id);
    try { await retryItem(id); } finally { setBusyId(null); }
  }

  async function discard(item: SyncQueueItem) {
    if (!window.confirm(`Discard "${describe(item)}"? It will never reach the server.`)) return;
    await discardItem(item.id);
  }

  // Items whose own row or parent has an earlier unsent item
  const earlier = new Set<string>();
  const waiting = new Set<string>();
  for (const item of items) {
    if (earlier.has(item.entity_key) || item.depends_on.some(k => earlier.has(k))) waiting.add(item.id);
    earlier.add(item.entity_key);
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">Sync</h1>
        <button
          onClick={forceSync}
          disabled={!isOnline || isSyncing || items.length === 0}
          className="text-sm font-medium text-blue-600 disabled:text-slate-300"
        >
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {!isOnline && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          You're offline. Changes will send when you reconnect.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState heading="All synced" description="Every change on this device has reached the server." />
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const { text, tone } = statusLine(item, waiting.has(item.id));
            const canRetry = item.status === 'failed' || item.user_id === null || item.next_attempt_at !== null;
            return (
              <li key={item.id} className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{describe(item)}</p>
                <p className={`text-xs mt-0.5 ${tone}`}>{text}</p>
                {item.last_error && (
                  <p className="text-xs text-slate-500 mt-1 break-words">{item.last_error}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Queued {new Date(item.created_at).toLocaleString('en-GB')}
                  {item.attempts > 0 && ` · ${item.attempts} attempt${item.attempts !== 1 ? 's' : ''}`}
                </p>
                <div className="flex gap-4 mt-2">
                  {canRetry && (
                    <button
                      onClick={() => retry(item.id)}
                      disabled={!isOnline || busyId === item.id}
                      className="text-sm font-medium text-blue-600 disabled:text-slate-300"
                    >
                      Retry
                    </button>
                  )}
                  <button onClick={() => discard(item)} className="text-sm font-medium text-red-600">
                    Discard
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 border-t border-slate-200 pt-4">
        {session?.user.email && (
          <p className="text-xs text-slate-500 mb-2">Signed in as {session.user.email}</p>
        )}
        <button
          onClick={() => { signOut().catch(() => {}); }}
          className="w-full bg-white border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
