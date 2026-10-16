-- ============================================================
-- 00006_devices.sql
-- Device asset register and per-visit test history
-- ============================================================

-- ── Devices ───────────────────────────────────────────────────────────────────
create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  system_id     uuid references systems(id) on delete set null,
  type          text not null,   -- smoke_detector, heat_detector, call_point, etc.
  location      text,
  make          text,
  model         text,
  serial_number text,
  install_date  date,
  qr_code       text unique,     -- UUID payload embedded in QR
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists devices_site_idx    on devices(site_id);
create index if not exists devices_company_idx on devices(company_id);
create index if not exists devices_qr_idx      on devices(qr_code);

-- ── Device Tests ──────────────────────────────────────────────────────────────
create table if not exists device_tests (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references devices(id) on delete cascade,
  jobsheet_id  uuid references jobsheets(id) on delete set null,
  company_id   uuid not null references companies(id) on delete cascade,
  result       text not null check (result in ('pass','fail','not_tested')),
  note         text,
  tested_at    timestamptz not null default now()
);

create index if not exists device_tests_device_idx    on device_tests(device_id, tested_at desc);
create index if not exists device_tests_jobsheet_idx  on device_tests(jobsheet_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table devices      enable row level security;
alter table device_tests enable row level security;

-- devices: any company member can read and insert; managers can update
drop policy if exists "devices_select" on devices;
create policy "devices_select" on devices
  for select using (company_id = get_my_company_id());

drop policy if exists "devices_insert" on devices;
create policy "devices_insert" on devices
  for insert with check (company_id = get_my_company_id());

drop policy if exists "devices_update_manager" on devices;
create policy "devices_update_manager" on devices
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "devices_delete_manager" on devices;
create policy "devices_delete_manager" on devices
  for delete using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- device_tests: any company member can read and insert
drop policy if exists "device_tests_select" on device_tests;
create policy "device_tests_select" on device_tests
  for select using (company_id = get_my_company_id());

drop policy if exists "device_tests_insert" on device_tests;
create policy "device_tests_insert" on device_tests
  for insert with check (company_id = get_my_company_id());

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on devices      to authenticated;
grant select, insert                  on device_tests to authenticated;
