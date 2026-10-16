-- ============================================================
-- Phase 4 Migration: GuardianFSM data-model expansion
-- ============================================================

-- 1. Relax CHECK constraints (include legacy values during migration window)
alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check check (
  type in ('reactive_callout','ppm_service','install','remedial_works','survey','service','reactive')
);
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (
  status in ('unassigned','scheduled','travelling','on_site','completed',
             'awaiting_review','reviewed','invoiced','cancelled','in_progress','submitted')
);

-- 2. Data migrations
update jobs set type = 'ppm_service'       where type = 'service';
update jobs set type = 'reactive_callout'  where type = 'reactive';
update jobs set status = 'unassigned'      where status = 'scheduled' and assigned_engineer_id is null;
update jobs set status = 'on_site'         where status = 'in_progress';
update jobs set status = 'awaiting_review' where status = 'submitted';

-- 3. Tighten to new values only
alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check check (
  type in ('reactive_callout','ppm_service','install','remedial_works','survey')
);
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (
  status in ('unassigned','scheduled','travelling','on_site','completed',
             'awaiting_review','reviewed','invoiced','cancelled')
);

-- 4. New timestamp columns on jobs
alter table jobs add column if not exists travelling_at  timestamptz;
alter table jobs add column if not exists on_site_at     timestamptz;
alter table jobs add column if not exists completed_at   timestamptz;

-- 5. Site fire & security fields
alter table sites add column if not exists arc_name    text;
alter table sites add column if not exists arc_account text;
alter table sites add column if not exists police_urn  text;
alter table sites add column if not exists hazards     text;
alter table sites add column if not exists keyholders  jsonb not null default '[]';

-- 6. System technical fields
alter table systems add column if not exists zones_count    int;
alter table systems add column if not exists loops_count    int;
alter table systems add column if not exists num_cameras    int;
alter table systems add column if not exists retention_days int;
alter table systems add column if not exists grade          text;

-- 7. Customer additions
alter table customers add column if not exists billing_address text;
alter table customers add column if not exists notes           text;
alter table customers add column if not exists updated_at      timestamptz not null default now();
drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at
  before update on customers for each row execute procedure update_updated_at_column();

-- 8. job_lines
create table if not exists job_lines (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  line_type   text not null check (line_type in ('labour','part','other')),
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0,
  vat_rate    numeric(5,4)  not null default 0.20,
  sort_order  int  not null default 0,
  created_at  timestamptz   not null default now()
);
create index if not exists job_lines_job_idx on job_lines(job_id, sort_order);
alter table job_lines enable row level security;
drop policy if exists "jl_sel" on job_lines;
drop policy if exists "jl_ins" on job_lines;
drop policy if exists "jl_upd" on job_lines;
drop policy if exists "jl_del" on job_lines;
create policy "jl_sel" on job_lines for select    using (company_id = get_my_company_id());
create policy "jl_ins" on job_lines for insert    with check (company_id = get_my_company_id() and get_my_role()='manager');
create policy "jl_upd" on job_lines for update    using (company_id = get_my_company_id() and get_my_role()='manager');
create policy "jl_del" on job_lines for delete    using (company_id = get_my_company_id() and get_my_role()='manager');
grant select,insert,update,delete on job_lines to authenticated;

-- 9. invoices
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  site_id      uuid not null references sites(id)     on delete cascade,
  job_id       uuid references jobs(id)   on delete set null,
  quote_id     uuid references quotes(id) on delete set null,
  reference    text not null,
  status       text not null default 'draft'
    check (status in ('draft','sent','paid','overdue','void')),
  notes        text,
  issued_date  date,
  due_date     date,
  paid_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inv_company_status_idx on invoices(company_id, status);
create index if not exists inv_due_idx            on invoices(company_id, due_date);
drop trigger if exists invoices_updated_at on invoices;
create trigger invoices_updated_at
  before update on invoices for each row execute procedure update_updated_at_column();
alter table invoices enable row level security;
drop policy if exists "inv_sel" on invoices;
drop policy if exists "inv_ins" on invoices;
drop policy if exists "inv_upd" on invoices;
create policy "inv_sel" on invoices for select using (company_id = get_my_company_id());
create policy "inv_ins" on invoices for insert with check (company_id = get_my_company_id() and get_my_role()='manager');
create policy "inv_upd" on invoices for update using (company_id = get_my_company_id() and get_my_role()='manager');
grant select,insert,update on invoices to authenticated;

-- 10. invoice_lines
create table if not exists invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0,
  vat_rate    numeric(5,4)  not null default 0.20,
  sort_order  int  not null default 0,
  created_at  timestamptz   not null default now()
);
create index if not exists invl_invoice_idx on invoice_lines(invoice_id, sort_order);
alter table invoice_lines enable row level security;
drop policy if exists "invl_sel" on invoice_lines;
drop policy if exists "invl_ins" on invoice_lines;
drop policy if exists "invl_del" on invoice_lines;
create policy "invl_sel" on invoice_lines for select using (company_id = get_my_company_id());
create policy "invl_ins" on invoice_lines for insert with check (company_id = get_my_company_id() and get_my_role()='manager');
create policy "invl_del" on invoice_lines for delete using (company_id = get_my_company_id() and get_my_role()='manager');
grant select,insert,delete on invoice_lines to authenticated;
