-- ============================================================
-- 00004_functions_triggers.sql
-- Auth triggers and utility functions
-- ============================================================

-- ── Auto-create profile on first sign-in ──────────────────────────────────────
-- The magic-link invite flow embeds company_id, role, full_name in user metadata.
-- This trigger fires after a new auth.users row is inserted.

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_role       text;
  v_full_name  text;
begin
  v_company_id := (new.raw_user_meta_data->>'company_id')::uuid;
  v_role       := coalesce(new.raw_user_meta_data->>'role', 'engineer');
  v_full_name  := coalesce(new.raw_user_meta_data->>'full_name', new.email);

  -- Skip if no company_id in metadata (e.g. Supabase dashboard users)
  if v_company_id is null then
    return new;
  end if;

  insert into public.profiles (user_id, company_id, role, full_name, email)
  values (new.id, v_company_id, v_role, v_full_name, new.email)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Invite user function (called by manager UI) ───────────────────────────────
-- Creates an auth user invite with company_id + role in metadata.
-- Requires service_role key — call via Supabase Admin API from the frontend
-- using supabase.auth.admin.inviteUserByEmail (with the service key) or
-- via a Supabase Edge Function. For the PoC, use the dashboard to invite users.

-- ── Audit log helper ──────────────────────────────────────────────────────────
create or replace function log_audit_event(
  p_company_id  uuid,
  p_user_id     uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid
)
returns void language plpgsql security definer as $$
begin
  insert into audit_log (company_id, user_id, action, entity_type, entity_id)
  values (p_company_id, p_user_id, p_action, p_entity_type, p_entity_id);
end;
$$;

-- ── Jobsheet submitted trigger (auto-log) ────────────────────────────────────
create or replace function log_jobsheet_submitted()
returns trigger language plpgsql security definer as $$
begin
  if new.submitted_at is not null and old.submitted_at is null then
    insert into audit_log (company_id, user_id, action, entity_type, entity_id)
    select
      new.company_id,
      p.user_id,
      'jobsheet_submitted',
      'jobsheets',
      new.id
    from profiles p
    where p.company_id = new.company_id
      and p.role = 'engineer'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists jobsheet_submitted_log on jobsheets;
create trigger jobsheet_submitted_log
  after update on jobsheets
  for each row execute procedure log_jobsheet_submitted();
