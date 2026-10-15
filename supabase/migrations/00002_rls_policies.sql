-- ============================================================
-- 00002_rls_policies.sql
-- Row Level Security policies — multi-tenant isolation
-- ============================================================

-- ── Helper functions (SECURITY DEFINER so they bypass RLS) ────────────────────

create or replace function get_my_company_id()
returns uuid language sql stable security definer as $$
  select company_id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function get_my_role()
returns text language sql stable security definer as $$
  select role from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function get_my_profile_id()
returns uuid language sql stable security definer as $$
  select id from profiles where user_id = auth.uid() limit 1;
$$;

-- ── Enable RLS on all tables ──────────────────────────────────────────────────

alter table companies  enable row level security;
alter table profiles   enable row level security;
alter table customers  enable row level security;
alter table sites      enable row level security;
alter table systems    enable row level security;
alter table jobs       enable row level security;
alter table jobsheets  enable row level security;
alter table photos     enable row level security;
alter table remedials  enable row level security;
alter table audit_log  enable row level security;

-- ── companies ─────────────────────────────────────────────────────────────────
drop policy if exists "company_select_own" on companies;
create policy "company_select_own" on companies
  for select using (id = get_my_company_id());

drop policy if exists "company_update_manager" on companies;
create policy "company_update_manager" on companies
  for update using (id = get_my_company_id() and get_my_role() = 'manager');

-- ── profiles ──────────────────────────────────────────────────────────────────
drop policy if exists "profiles_select_own_company" on profiles;
create policy "profiles_select_own_company" on profiles
  for select using (company_id = get_my_company_id());

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (user_id = auth.uid());

-- ── customers ─────────────────────────────────────────────────────────────────
drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers
  for select using (company_id = get_my_company_id());

drop policy if exists "customers_insert_manager" on customers;
create policy "customers_insert_manager" on customers
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "customers_update_manager" on customers;
create policy "customers_update_manager" on customers
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── sites ─────────────────────────────────────────────────────────────────────
drop policy if exists "sites_select" on sites;
create policy "sites_select" on sites
  for select using (company_id = get_my_company_id());

drop policy if exists "sites_insert_manager" on sites;
create policy "sites_insert_manager" on sites
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "sites_update_manager" on sites;
create policy "sites_update_manager" on sites
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── systems ───────────────────────────────────────────────────────────────────
drop policy if exists "systems_select" on systems;
create policy "systems_select" on systems
  for select using (company_id = get_my_company_id());

drop policy if exists "systems_insert_manager" on systems;
create policy "systems_insert_manager" on systems
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "systems_update_manager" on systems;
create policy "systems_update_manager" on systems
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── jobs ──────────────────────────────────────────────────────────────────────
-- Engineers see only their assigned jobs; managers see all company jobs
drop policy if exists "jobs_select" on jobs;
create policy "jobs_select" on jobs
  for select using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'manager'
      or assigned_engineer_id = get_my_profile_id()
    )
  );

drop policy if exists "jobs_insert_manager" on jobs;
create policy "jobs_insert_manager" on jobs
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

-- Managers can update any company job; engineers can update only their own (for status)
drop policy if exists "jobs_update" on jobs;
create policy "jobs_update" on jobs
  for update using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'manager'
      or assigned_engineer_id = get_my_profile_id()
    )
  );

-- ── jobsheets ─────────────────────────────────────────────────────────────────
drop policy if exists "jobsheets_select" on jobsheets;
create policy "jobsheets_select" on jobsheets
  for select using (company_id = get_my_company_id());

drop policy if exists "jobsheets_insert" on jobsheets;
create policy "jobsheets_insert" on jobsheets
  for insert with check (company_id = get_my_company_id());

drop policy if exists "jobsheets_update" on jobsheets;
create policy "jobsheets_update" on jobsheets
  for update using (company_id = get_my_company_id());

-- ── photos ────────────────────────────────────────────────────────────────────
drop policy if exists "photos_select" on photos;
create policy "photos_select" on photos
  for select using (company_id = get_my_company_id());

drop policy if exists "photos_insert" on photos;
create policy "photos_insert" on photos
  for insert with check (company_id = get_my_company_id());

drop policy if exists "photos_delete" on photos;
create policy "photos_delete" on photos
  for delete using (company_id = get_my_company_id());

-- ── remedials ─────────────────────────────────────────────────────────────────
drop policy if exists "remedials_select" on remedials;
create policy "remedials_select" on remedials
  for select using (company_id = get_my_company_id());

drop policy if exists "remedials_insert" on remedials;
create policy "remedials_insert" on remedials
  for insert with check (company_id = get_my_company_id());

drop policy if exists "remedials_update_manager" on remedials;
create policy "remedials_update_manager" on remedials
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── audit_log ─────────────────────────────────────────────────────────────────
drop policy if exists "audit_select_manager" on audit_log;
create policy "audit_select_manager" on audit_log
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "audit_insert" on audit_log;
create policy "audit_insert" on audit_log
  for insert with check (company_id = get_my_company_id());
