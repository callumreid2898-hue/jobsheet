-- ============================================================
-- 00005_contracts.sql
-- Maintenance contracts and scheduled visits
-- ============================================================

-- ── Contracts ─────────────────────────────────────────────────────────────────
create table if not exists contracts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  site_id          uuid not null references sites(id) on delete cascade,
  system_id        uuid references systems(id) on delete set null,
  customer_id      uuid not null references customers(id) on delete cascade,
  reference        text,
  system_type      text not null check (system_type in (
                     'fire_alarm','emergency_lighting','cctv',
                     'intruder','access_control')),
  visit_frequency  text not null check (visit_frequency in (
                     'monthly','quarterly','biannual','annual')),
  next_visit_due   date,
  status           text not null default 'active'
                     check (status in ('active','paused','expired')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists contracts_company_status_idx on contracts(company_id, status);
create index if not exists contracts_site_idx           on contracts(site_id);
create index if not exists contracts_next_visit_idx     on contracts(company_id, next_visit_due);

drop trigger if exists contracts_updated_at on contracts;
create trigger contracts_updated_at
  before update on contracts
  for each row execute procedure update_updated_at_column();

-- ── Contract Visits ───────────────────────────────────────────────────────────
create table if not exists contract_visits (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references contracts(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  job_id         uuid references jobs(id) on delete set null,
  scheduled_date date not null,
  status         text not null default 'pending'
                   check (status in ('pending','scheduled','complete')),
  created_at     timestamptz not null default now()
);

create index if not exists contract_visits_contract_date_idx
  on contract_visits(contract_id, scheduled_date);
create index if not exists contract_visits_company_status_idx
  on contract_visits(company_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table contracts       enable row level security;
alter table contract_visits enable row level security;

-- contracts: all company members read; managers insert/update
drop policy if exists "contracts_select" on contracts;
create policy "contracts_select" on contracts
  for select using (company_id = get_my_company_id());

drop policy if exists "contracts_insert_manager" on contracts;
create policy "contracts_insert_manager" on contracts
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "contracts_update_manager" on contracts;
create policy "contracts_update_manager" on contracts
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- contract_visits: all company members read; managers insert/update
drop policy if exists "contract_visits_select" on contract_visits;
create policy "contract_visits_select" on contract_visits
  for select using (company_id = get_my_company_id());

drop policy if exists "contract_visits_insert_manager" on contract_visits;
create policy "contract_visits_insert_manager" on contract_visits
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "contract_visits_update_manager" on contract_visits;
create policy "contract_visits_update_manager" on contract_visits
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update on contracts       to authenticated;
grant select, insert, update on contract_visits to authenticated;
