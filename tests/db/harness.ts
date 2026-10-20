// In-process Postgres (PGlite) with just enough of Supabase's auth/storage
// schemas to run the real migrations and exercise RLS as different users.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema storage;
  grant usage on schema auth, storage to anon, authenticated, service_role;

  create table auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb not null default '{}',
    raw_app_meta_data  jsonb not null default '{}'
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated;

  -- Same semantics as Supabase: every path segment except the file name.
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    _parts := string_to_array(name, '/');
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;
`;

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  return db;
}

/** Run `fn` as an authenticated user (by auth uid), or as anon when uid is null. */
export async function as<T>(db: PGlite, uid: string | null, fn: () => Promise<T>): Promise<T> {
  if (uid && !/^[0-9a-f-]{36}$/.test(uid)) throw new Error('bad uid');
  await db.exec(uid
    ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`
    : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
