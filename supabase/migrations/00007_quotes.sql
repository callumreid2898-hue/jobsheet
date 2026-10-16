-- ============================================================
-- 00007_quotes.sql
-- Price list, quotes and quote line items
-- ============================================================

-- ── Price List Items ──────────────────────────────────────────────────────────
create table if not exists price_list_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  description  text not null,
  unit_price   numeric(10,2) not null default 0,
  vat_rate     numeric(5,4) not null default 0.20,
  created_at   timestamptz not null default now()
);

create index if not exists price_list_company_idx on price_list_items(company_id);

-- ── Quotes ────────────────────────────────────────────────────────────────────
create table if not exists quotes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  remedial_id  uuid references remedials(id) on delete set null,
  reference    text not null,
  status       text not null default 'draft'
                 check (status in ('draft','sent','accepted','rejected')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists quotes_company_status_idx on quotes(company_id, status);
create index if not exists quotes_site_idx           on quotes(site_id);
create index if not exists quotes_remedial_idx       on quotes(remedial_id);

drop trigger if exists quotes_updated_at on quotes;
create trigger quotes_updated_at
  before update on quotes
  for each row execute procedure update_updated_at_column();

-- ── Quote Lines ───────────────────────────────────────────────────────────────
create table if not exists quote_lines (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references quotes(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  description  text not null,
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(10,2) not null default 0,
  vat_rate     numeric(5,4) not null default 0.20,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists quote_lines_quote_idx on quote_lines(quote_id, sort_order);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table price_list_items enable row level security;
alter table quotes            enable row level security;
alter table quote_lines       enable row level security;

-- price_list_items: managers only
drop policy if exists "price_list_select" on price_list_items;
create policy "price_list_select" on price_list_items
  for select using (company_id = get_my_company_id());

drop policy if exists "price_list_insert_manager" on price_list_items;
create policy "price_list_insert_manager" on price_list_items
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "price_list_update_manager" on price_list_items;
create policy "price_list_update_manager" on price_list_items
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "price_list_delete_manager" on price_list_items;
create policy "price_list_delete_manager" on price_list_items
  for delete using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- quotes: managers insert/update/delete; all company members read
drop policy if exists "quotes_select" on quotes;
create policy "quotes_select" on quotes
  for select using (company_id = get_my_company_id());

drop policy if exists "quotes_insert_manager" on quotes;
create policy "quotes_insert_manager" on quotes
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "quotes_update_manager" on quotes;
create policy "quotes_update_manager" on quotes
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- quote_lines: managers insert/delete; all company members read
drop policy if exists "quote_lines_select" on quote_lines;
create policy "quote_lines_select" on quote_lines
  for select using (company_id = get_my_company_id());

drop policy if exists "quote_lines_insert_manager" on quote_lines;
create policy "quote_lines_insert_manager" on quote_lines
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "quote_lines_delete_manager" on quote_lines;
create policy "quote_lines_delete_manager" on quote_lines
  for delete using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on price_list_items to authenticated;
grant select, insert, update, delete on quotes           to authenticated;
grant select, insert, delete         on quote_lines      to authenticated;
