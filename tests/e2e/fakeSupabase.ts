import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * An in-memory fake of Supabase's REST/RPC/auth/storage endpoints, so e2e tests
 * never contact a real project. Supports eq filters, single-object Accept,
 * upsert by id, PATCH, set_job_status and storage uploads.
 */

function supabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const env = readFileSync('.env.local', 'utf8');
  const m = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error('VITE_SUPABASE_URL not set');
  return m[1].trim();
}

export const SB_URL = supabaseUrl();
const STORAGE_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;

export const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

export type Row = Record<string, unknown>;
export interface Write { method: string; table: string; body: unknown; prefer: string }
export interface Upload { bucket: string; path: string; body: string }

export type RpcHandler = (args: Row, db: Record<string, Row[]>) => { status?: number; body: unknown };

/**
 * `rpcs` adds or overrides RPC handlers (set_job_status is built in). Unknown
 * RPCs and Edge Functions return 404, as when they aren't deployed.
 */
export async function fakeSupabase(page: Page, db: Record<string, Row[]>, rpcs: Record<string, RpcHandler> = {}) {
  const writes: Write[] = [];
  const uploads: Upload[] = [];

  const filterRows = (rows: Row[], params: URLSearchParams) => rows.filter(r =>
    [...params.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3)));

  await page.route(`${SB_URL}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.startsWith('/auth/v1/')) return json(200, {});

    // Uploads: POST /storage/v1/object/{bucket}/{path}. Downloads/signing aren't faked.
    const upload = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (upload && req.method() === 'POST') {
      uploads.push({ bucket: upload[1], path: decodeURIComponent(upload[2]), body: (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1') });
      return json(200, { Key: `${upload[1]}/${upload[2]}` });
    }
    if (path.startsWith('/storage/v1/')) return json(400, { error: 'not found', message: 'Object not found' });

    if (path.startsWith('/functions/v1/')) return json(404, { error: 'Requested function was not found' });

    if (path === '/rest/v1/rpc/set_job_status' && !rpcs.set_job_status) {
      const { p_job_id, p_status } = req.postDataJSON();
      writes.push({ method: 'RPC', table: 'set_job_status', body: { p_job_id, p_status }, prefer: '' });
      const job = db.jobs.find(j => j.id === p_job_id)!;
      job.status = p_status;
      return json(200, job);
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length);
      const args = (req.postDataJSON() ?? {}) as Row;
      writes.push({ method: 'RPC', table: fn, body: args, prefer: '' });
      const handler = rpcs[fn];
      if (!handler) return json(404, { code: 'PGRST202', message: `Could not find the function ${fn}` });
      const res = handler(args, db);
      return json(res.status ?? 200, res.body);
    }

    const table = path.replace('/rest/v1/', '');
    const rows = (db[table] ??= []);
    const method = req.method();

    if (method === 'GET' || method === 'HEAD') {
      const found = filterRows(rows, url.searchParams);
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        return found.length === 1
          ? json(200, found[0])
          : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      }
      return json(200, found);
    }

    if (method === 'POST') {
      const body = req.postDataJSON();
      writes.push({ method, table, body, prefer: req.headers()['prefer'] ?? '' });
      const ignore = (req.headers()['prefer'] ?? '').includes('ignore-duplicates');
      for (const row of Array.isArray(body) ? body : [body]) {
        const i = rows.findIndex(r => r.id === row.id);
        if (i === -1) rows.push(row);
        else if (!ignore) rows[i] = { ...rows[i], ...row };
      }
      return route.fulfill({ status: 201, body: '' });
    }

    if (method === 'PATCH') {
      const body = req.postDataJSON();
      writes.push({ method, table, body, prefer: '' });
      for (const r of filterRows(rows, url.searchParams)) Object.assign(r, body);
      return route.fulfill({ status: 204, body: '' });
    }

    return json(200, {});
  });

  return { db, writes, uploads };
}

/** Puts a session for `userId` in localStorage before the app loads. */
export async function signIn(page: Page, userId: string, email: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, role: 'authenticated', exp })}.sig`;
  const session = {
    access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh',
    user: {
      id: userId, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, [STORAGE_KEY, JSON.stringify(session)] as const);
}
