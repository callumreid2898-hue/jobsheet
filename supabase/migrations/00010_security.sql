-- ============================================================
-- 00010_security.sql
-- Security lockdown (audit batch 1):
--   * profiles: no self-insert, no client changes to role/company/user
--   * onboarding via server-side invites instead of user metadata
--   * audit_log RPC closed, trigger attribution fixed
--   * jobsheets scoped to the assigned engineer, read-only after submit
--   * job status changes by engineers only through set_job_status()
--   * financial tables manager-only
--   * storage: pdfs scoped to assigned jobsheet, deletes manager-only
--   * search_path pinned on SECURITY DEFINER functions, anon grants removed
-- Requires 00001–00009.
-- ============================================================

-- ── Helper functions ──────────────────────────────────────────────────────────
alter function get_my_company_id() set search_path = public, pg_temp;
alter function get_my_role()       set search_path = public, pg_temp;
alter function get_my_profile_id() set search_path = public, pg_temp;

create or replace function is_my_assigned_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from jobs
    where id = p_job_id
      and company_id = get_my_company_id()
      and assigned_engineer_id = get_my_profile_id()
  );
$$;

create or replace function is_job_in_my_company(p_job_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from jobs where id = p_job_id and company_id = get_my_company_id());
$$;

-- Takes text because it is fed a storage path segment.
create or replace function is_my_assigned_jobsheet(p_jobsheet_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from jobsheets js join jobs j on j.id = js.job_id
    where js.id::text = p_jobsheet_id
      and j.company_id = get_my_company_id()
      and j.assigned_engineer_id = get_my_profile_id()
  );
$$;

revoke execute on function get_my_company_id(), get_my_role(), get_my_profile_id(),
  is_my_assigned_job(uuid), is_job_in_my_company(uuid), is_my_assigned_jobsheet(text)
  from public, anon;
grant execute on function get_my_company_id(), get_my_role(), get_my_profile_id(),
  is_my_assigned_job(uuid), is_job_in_my_company(uuid), is_my_assigned_jobsheet(text)
  to authenticated;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- No public routes read tables directly; anything public goes through RPCs.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ── profiles ──────────────────────────────────────────────────────────────────
drop policy if exists "profiles_insert_own" on profiles;

revoke insert, update, delete on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

create or replace function profiles_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.role is distinct from old.role
          or new.company_id is distinct from old.company_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'role, company and user cannot be changed from the client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute procedure profiles_guard();

-- ── invites (replaces trusting raw_user_meta_data) ────────────────────────────
create table if not exists invites (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  email            text not null,
  role             text not null default 'engineer' check (role in ('engineer','manager')),
  full_name        text,
  invited_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '14 days',
  accepted_at      timestamptz,
  accepted_user_id uuid
);

-- One pending invite per email (a user can only belong to one company).
create unique index if not exists invites_pending_email_idx
  on invites (lower(email)) where accepted_at is null;

alter table invites enable row level security;

drop policy if exists "invites_select_manager" on invites;
create policy "invites_select_manager" on invites
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "invites_insert_manager" on invites;
create policy "invites_insert_manager" on invites
  for insert with check (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "invites_delete_manager" on invites;
create policy "invites_delete_manager" on invites
  for delete using (company_id = get_my_company_id() and get_my_role() = 'manager');

grant select, insert, delete on invites to authenticated;

-- Creates the profile for p_user_id from a pending, unexpired invite for p_email.
create or replace function claim_invite_for(p_user_id uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v invites%rowtype;
begin
  if p_user_id is null or p_email is null then return false; end if;
  if exists (select 1 from profiles where user_id = p_user_id) then return false; end if;

  select * into v from invites
  where lower(email) = lower(p_email) and accepted_at is null and expires_at > now()
  order by created_at desc
  limit 1
  for update;
  if not found then return false; end if;

  insert into profiles (user_id, company_id, role, full_name, email)
  values (p_user_id, v.company_id, v.role, coalesce(nullif(v.full_name, ''), p_email), p_email);

  update invites set accepted_at = now(), accepted_user_id = p_user_id where id = v.id;
  return true;
end;
$$;

revoke execute on function claim_invite_for(uuid, text) from public, anon, authenticated;

-- Metadata is client-controlled and is deliberately ignored.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform claim_invite_for(new.id, new.email);
  return new;
end;
$$;

-- For users whose auth account already existed when they were invited.
create or replace function claim_invite()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return claim_invite_for(auth.uid(), (select email from auth.users where id = auth.uid()));
end;
$$;

revoke execute on function claim_invite() from public, anon;
grant execute on function claim_invite() to authenticated;

-- ── audit_log ─────────────────────────────────────────────────────────────────
alter function log_audit_event(uuid, uuid, text, text, uuid) set search_path = public, pg_temp;
revoke execute on function log_audit_event(uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- Attribute to the caller, falling back to the assigned engineer (service-role writes).
create or replace function log_jobsheet_submitted()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.submitted_at is not null and (tg_op = 'INSERT' or old.submitted_at is null) then
    insert into audit_log (company_id, user_id, action, entity_type, entity_id)
    select new.company_id, coalesce(auth.uid(), p.user_id), 'jobsheet_submitted', 'jobsheets', new.id
    from jobs j
    left join profiles p on p.id = j.assigned_engineer_id
    where j.id = new.job_id
      and coalesce(auth.uid(), p.user_id) is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobsheet_submitted_log on jobsheets;
create trigger jobsheet_submitted_log
  after insert or update on jobsheets
  for each row execute procedure log_jobsheet_submitted();

-- ── jobsheets ─────────────────────────────────────────────────────────────────
drop policy if exists "jobsheets_select" on jobsheets;
create policy "jobsheets_select" on jobsheets
  for select using (
    company_id = get_my_company_id()
    and (get_my_role() = 'manager' or is_my_assigned_job(job_id))
  );

drop policy if exists "jobsheets_insert" on jobsheets;
create policy "jobsheets_insert" on jobsheets
  for insert with check (
    company_id = get_my_company_id()
    and ((get_my_role() = 'manager' and is_job_in_my_company(job_id)) or is_my_assigned_job(job_id))
  );

drop policy if exists "jobsheets_update" on jobsheets;
create policy "jobsheets_update" on jobsheets
  for update
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'manager' or is_my_assigned_job(job_id))
  )
  with check (
    company_id = get_my_company_id()
    and ((get_my_role() = 'manager' and is_job_in_my_company(job_id)) or is_my_assigned_job(job_id))
  );

-- After submission only the PDF and signature links may change (except by managers).
-- Named so it sorts before jobsheets_updated_at.
create or replace function jobsheets_lock_after_submit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  mutable constant text[] := array['pdf_url', 'engineer_signature_url', 'customer_signature_url', 'updated_at'];
begin
  if current_user in ('anon', 'authenticated')
     and old.submitted_at is not null
     and get_my_role() is distinct from 'manager'
     and (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'submitted jobsheets are read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists jobsheets_lock_after_submit on jobsheets;
create trigger jobsheets_lock_after_submit
  before update on jobsheets
  for each row execute procedure jobsheets_lock_after_submit();

-- ── jobs ──────────────────────────────────────────────────────────────────────
-- Engineers no longer update jobs directly; they call set_job_status().
drop policy if exists "jobs_update" on jobs;
drop policy if exists "jobs_update_manager" on jobs;
create policy "jobs_update_manager" on jobs
  for update using (company_id = get_my_company_id() and get_my_role() = 'manager');

create or replace function set_job_status(p_job_id uuid, p_status text)
returns jobs language plpgsql security definer set search_path = public, pg_temp as $$
declare
  j      jobs;
  v_role text := get_my_role();
  v_now  timestamptz := now();
begin
  select * into j from jobs where id = p_job_id and company_id = get_my_company_id() for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if p_status not in ('unassigned','scheduled','travelling','on_site','completed',
                      'awaiting_review','reviewed','invoiced','cancelled') then
    raise exception 'invalid job status %', p_status using errcode = '22023';
  end if;

  if j.status = p_status then
    return j;
  end if;

  if v_role = 'engineer' then
    if j.assigned_engineer_id is distinct from get_my_profile_id() then
      raise exception 'job is not assigned to you' using errcode = '42501';
    end if;
    if (j.status, p_status) not in (
         ('scheduled', 'travelling'), ('scheduled', 'on_site'),
         ('travelling', 'on_site'),
         ('on_site', 'completed'), ('on_site', 'awaiting_review'),
         ('completed', 'awaiting_review')) then
      raise exception 'engineers cannot move a job from % to %', j.status, p_status
        using errcode = '42501';
    end if;
  elsif v_role is distinct from 'manager' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update jobs set
    status        = p_status,
    travelling_at = case when p_status = 'travelling' then coalesce(travelling_at, v_now) else travelling_at end,
    on_site_at    = case when p_status = 'on_site' then coalesce(on_site_at, v_now) else on_site_at end,
    completed_at  = case when p_status in ('completed', 'awaiting_review')
                         then coalesce(completed_at, v_now) else completed_at end
  where id = p_job_id
  returning * into j;

  return j;
end;
$$;

revoke execute on function set_job_status(uuid, text) from public, anon;
grant execute on function set_job_status(uuid, text) to authenticated;

-- ── Financial tables: managers only ───────────────────────────────────────────
drop policy if exists "price_list_select" on price_list_items;
create policy "price_list_select" on price_list_items
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "quotes_select" on quotes;
create policy "quotes_select" on quotes
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "quote_lines_select" on quote_lines;
create policy "quote_lines_select" on quote_lines
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "jl_sel" on job_lines;
create policy "jl_sel" on job_lines
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "inv_sel" on invoices;
create policy "inv_sel" on invoices
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

drop policy if exists "invl_sel" on invoice_lines;
create policy "invl_sel" on invoice_lines
  for select using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── Storage ───────────────────────────────────────────────────────────────────
-- pdfs path: {company_id}/{jobsheet_id}/report.pdf
drop policy if exists "pdfs_objects_company" on storage.objects;

drop policy if exists "pdfs_select" on storage.objects;
create policy "pdfs_select" on storage.objects
  for select using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

drop policy if exists "pdfs_insert" on storage.objects;
create policy "pdfs_insert" on storage.objects
  for insert with check (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

-- Upload uses upsert, so the assigned engineer may overwrite their own report.
drop policy if exists "pdfs_update" on storage.objects;
create policy "pdfs_update" on storage.objects
  for update using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

drop policy if exists "pdfs_delete_manager" on storage.objects;
create policy "pdfs_delete_manager" on storage.objects
  for delete using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'manager'
  );

-- logos: readable by the company, writable by managers.
drop policy if exists "logos_objects_company" on storage.objects;

drop policy if exists "logos_select" on storage.objects;
create policy "logos_select" on storage.objects
  for select using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "logos_write_manager" on storage.objects;
create policy "logos_write_manager" on storage.objects
  for all using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'manager'
  )
  with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'manager'
  );
