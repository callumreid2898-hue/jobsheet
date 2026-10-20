-- ============================================================
-- 00013_team.sql
-- Onboarding and team management (audit batch 8):
--   * profiles.active: removing a member deactivates them (soft delete);
--     get_my_*() return nothing for inactive profiles, so RLS shuts them out
--   * a user can always read their own profile (to tell "removed" from "no access yet")
--   * create_company_and_manager(): first login with no profile and no invite
--   * remove_member() / restore_member() / set_member_role() for managers
-- Invites themselves are in 00010 (invites table, claim_invite()); the
-- invite-user Edge Function creates the auth account and sends the email.
-- Requires 00001–00012.
-- ============================================================

-- ── profiles.active ───────────────────────────────────────────────────────────
alter table profiles add column if not exists active boolean not null default true;

create or replace function get_my_company_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select company_id from profiles where user_id = auth.uid() and active limit 1;
$$;

create or replace function get_my_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where user_id = auth.uid() and active limit 1;
$$;

create or replace function get_my_profile_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from profiles where user_id = auth.uid() and active limit 1;
$$;

drop policy if exists "profiles_select_self" on profiles;
create policy "profiles_select_self" on profiles
  for select using (user_id = auth.uid());

-- ── create_company_and_manager ────────────────────────────────────────────────
create or replace function create_company_and_manager(p_company_name text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where user_id = v_uid) then
    raise exception 'you already belong to a company' using errcode = '42501';
  end if;
  if nullif(trim(p_company_name), '') is null then
    raise exception 'company name is required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_uid;
  -- Invited users join the inviting company instead (the app claims the invite first)
  if exists (select 1 from invites
             where lower(email) = lower(v_email) and accepted_at is null and expires_at > now()) then
    raise exception 'you have a pending invite; sign in again to accept it' using errcode = 'P0001';
  end if;

  insert into companies (name) values (trim(p_company_name)) returning id into v_company;
  insert into profiles (user_id, company_id, role, full_name, email)
  values (v_uid, v_company, 'manager', coalesce(nullif(trim(p_full_name), ''), v_email), v_email);
  return v_company;
end;
$$;

-- ── Member management (managers, own company) ────────────────────────────────
-- Returns the target profile, or raises if the caller can't manage it.
create or replace function managed_member(p_profile_id uuid)
returns profiles language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p profiles;
begin
  if get_my_role() is distinct from 'manager' then
    raise exception 'only managers can manage the team' using errcode = '42501';
  end if;
  select * into p from profiles where id = p_profile_id and company_id = get_my_company_id();
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

-- Deactivates a member and hands their unfinished jobs back to the planner.
-- Returns how many jobs were unassigned.
create or replace function remove_member(p_profile_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p profiles := managed_member(p_profile_id);
  n integer;
begin
  if p.user_id = auth.uid() then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  update profiles set active = false where id = p.id;
  update jobs set assigned_engineer_id = null, status = 'unassigned'
  where assigned_engineer_id = p.id
    and status in ('scheduled', 'travelling', 'on_site', 'completed');
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function restore_member(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p profiles := managed_member(p_profile_id);
begin
  update profiles set active = true where id = p.id;
end;
$$;

-- A company always keeps at least one active manager.
create or replace function set_member_role(p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p profiles := managed_member(p_profile_id);
begin
  if p_role not in ('engineer', 'manager') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;
  if p.role = 'manager' and p_role = 'engineer' and not exists (
    select 1 from profiles
    where company_id = p.company_id and role = 'manager' and active and id <> p.id
  ) then
    raise exception 'the company needs at least one manager' using errcode = '42501';
  end if;
  update profiles set role = p_role where id = p.id;
end;
$$;

revoke execute on function create_company_and_manager(text, text), managed_member(uuid),
  remove_member(uuid), restore_member(uuid), set_member_role(uuid, text) from public, anon;
grant execute on function create_company_and_manager(text, text),
  remove_member(uuid), restore_member(uuid), set_member_role(uuid, text) to authenticated;
revoke execute on function managed_member(uuid) from authenticated;
