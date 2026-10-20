import { supabase } from './supabaseClient';
import { db } from './db';
import { mergeServerRows } from './syncEngine';

// The read pattern: Supabase first (RLS scopes it, so no company_id filter),
// the Dexie cache when that fails. supabase-js reports failures as `{ error }`
// rather than throwing, so the error has to be checked.
// Dexie only ever holds the signed-in user's company (it's wiped on sign-out).

export interface CachedQuery<T> {
  table: string;
  /** Equality filters; undefined values are ignored. */
  eq?: { [K in keyof T & string]?: string | undefined };
  order?: { column: keyof T & string; ascending?: boolean };
}

export interface CachedResult<T> {
  rows: T[];
  /** True when the server couldn't be reached and the rows came from this device. */
  fromCache: boolean;
}

export function filters<T>(q: CachedQuery<T>): [string, string][] {
  return Object.entries(q.eq ?? {}).filter((e): e is [string, string] => e[1] !== undefined);
}

function matcher<T>(q: CachedQuery<T>): (row: T) => boolean {
  const f = filters(q);
  return row => f.every(([col, val]) => String((row as Record<string, unknown>)[col]) === val);
}

function sortRows<T>(rows: T[], order: CachedQuery<T>['order']): T[] {
  if (!order) return rows;
  const dir = order.ascending === false ? -1 : 1;
  const key = (r: T) => (r as Record<string, unknown>)[order.column];
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null) return y == null ? 0 : 1; // nulls last
    if (y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
  });
}

const isCached = (table: string) => db.tables.some(t => t.name === table);

export async function fetchCached<T extends { id: string }>(q: CachedQuery<T>): Promise<CachedResult<T>> {
  const matches = matcher(q);
  try {
    let query = supabase.from(q.table).select('*');
    for (const [col, val] of filters(q)) query = query.eq(col, val);
    if (q.order) query = query.order(q.order.column, { ascending: q.order.ascending ?? true });
    const { data, error } = await query;
    if (error) throw error;
    if (!isCached(q.table)) return { rows: sortRows(((data ?? []) as T[]).filter(matches), q.order), fromCache: false };
    const rows = await mergeServerRows(q.table, (data ?? []) as T[], matches);
    return { rows: sortRows(rows, q.order), fromCache: false };
  } catch {
    // Tables that aren't cached on the device (e.g. invites) just come back empty
    if (!isCached(q.table)) return { rows: [], fromCache: true };
    const local = await db.table(q.table).toArray().catch(() => [] as T[]) as T[];
    return { rows: sortRows(local.filter(matches), q.order), fromCache: true };
  }
}

/** One row by id: the server copy unless this device has an unsent change to it. */
export async function fetchOneCached<T extends { id: string }>(table: string, id: string): Promise<T | null> {
  try {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
      // Not on the server (yet): it may have been created here and not synced
      return (await db.table(table).get(id) as T | undefined) ?? null;
    }
    const [row] = await mergeServerRows(table, [data as T]);
    return row;
  } catch {
    return (await db.table(table).get(id).catch(() => undefined) as T | undefined) ?? null;
  }
}
