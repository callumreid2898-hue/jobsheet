import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { fetchCached, filters, type CachedQuery } from '../lib/cachedQuery';

/**
 * React wrapper for fetchCached. Waits for the signed-in profile; refetch() re-runs it.
 * With `enabled: false` nothing is fetched and the result is empty.
 */
export function useCachedQuery<T extends { id: string }>(q: CachedQuery<T>, { enabled = true } = {}) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // The query is rebuilt from its key, so a new object literal each render doesn't refetch
  const key = JSON.stringify([q.table, filters(q), q.order ?? null]);
  const latest = useRef(0);

  const refetch = useCallback(async () => {
    if (!profile || !enabled) { setRows([]); setIsLoading(false); return; }
    const run = ++latest.current;
    setIsLoading(true);
    const [table, eq, order] = JSON.parse(key) as [string, [string, string][], CachedQuery<T>['order'] | null];
    const res = await fetchCached<T>({ table, eq: Object.fromEntries(eq) as CachedQuery<T>['eq'], order: order ?? undefined });
    if (run !== latest.current) return; // a newer request superseded this one
    setRows(res.rows);
    setFromCache(res.fromCache);
    setIsLoading(false);
  }, [profile?.id, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refetch(); }, [refetch]);

  return { rows, fromCache, isLoading, refetch };
}
