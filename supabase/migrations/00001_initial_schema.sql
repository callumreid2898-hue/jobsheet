-- ============================================================
-- 00001_initial_schema.sql
-- Core table definitions for Jobsheet PWA
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Companies ──────────────────────────────────────────────────────────────────
create table if not exists companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  logo_url             text,
  address              text,
  accreditation_number text,
  created_at           timestamptz not null default now()
);

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  role        text not null check (role in ('engineer','manager')),
  full_name   text not null,
  email       text not null,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

-- ── Customers ─────────────────────────────────────────────────────────────────
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  contact_name  text,
  contact_email text,
  contact_phone text,
  created_at    timestamptz not null default now()
);

-- ── Sites ─────────────────────────────────────────────────────────────────────
create table if not exists sites (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  address       text not null,
  contact_name  text,
  contact_phone text,
  access_notes  text,
  created_at    timestamptz not null default now()
);

-- ── Systems ───────────────────────────────────────────────────────────────────
create table if not exists systems (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references sites(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  type           text not null check (type in (
                   'fire_alarm','emergency_lighting','cctv',
                   'intruder','access_control')),
  make           text,
  model          text,
  panel_location text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ── Jobs ──────────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  site_id              uuid not null references sites(id) on delete cascade,
  system_id            uuid references systems(id) on delete set null,
  type                 text not null check (type in ('service','reactive','install')),
  template_id          text not null check (template_id in (
                         'reactive_callout','fire_alarm_service',
                         'emergency_lighting_test','cctv_maintenance')),
  assigned_engineer_id uuid references profiles(id) on delete set null,
  scheduled_date       date not null,
  status               text not null default 'scheduled'
                         check (status in ('scheduled','in_progress','submitted','reviewed')),
  notes                text,
  created_at           timestamptz not null default now()
);

create index if not exists jobs_company_date_idx on jobs(company_id, scheduled_date);
create index if not exists jobs_engineer_date_idx on jobs(assigned_engineer_id, scheduled_date);

-- ── Jobsheets ─────────────────────────────────────────────────────────────────
create table if not exists jobsheets (
  id                      uuid primary key default gen_random_uuid(),
  job_id                  uuid not null references jobs(id) on delete cascade,
  company_id              uuid not null references companies(id) on delete cascade,
  template_id             text not null check (template_id in (
                            'reactive_callout','fire_alarm_service',
                            'emergency_lighting_test','cctv_maintenance')),
  answers                 jsonb not null default '{}'::jsonb,
  time_on_site            timestamptz,
  time_off_site           timestamptz,
  engineer_signature_url  text,
  customer_signature_url  text,
  submitted_at            timestamptz,
  pdf_url                 text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (job_id)
);

-- ── Photos ────────────────────────────────────────────────────────────────────
create table if not exists photos (
  id            uuid primary key default gen_random_uuid(),
  jobsheet_id   uuid not null references jobsheets(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);

-- ── Remedials ─────────────────────────────────────────────────────────────────
create table if not exists remedials (
  id           uuid primary key default gen_random_uuid(),
  jobsheet_id  uuid not null references jobsheets(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  description  text not null,
  priority     text not null check (priority in ('urgent','recommended','advisory')),
  status       text not null default 'open' check (status in ('open','quoted','done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists remedials_site_status_idx on remedials(site_id, status);
create index if not exists remedials_company_status_idx on remedials(company_id, status);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobsheets_updated_at on jobsheets;
create trigger jobsheets_updated_at
  before update on jobsheets
  for each row execute procedure update_updated_at_column();

drop trigger if exists remedials_updated_at on remedials;
create trigger remedials_updated_at
  before update on remedials
  for each row execute procedure update_updated_at_column();

-- ── Role grants (PostgREST schema introspection requires these) ───────────────
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
