-- ============================================================
-- 00012_job_activity.sql
-- Job activity log (audit batch 7): every job creation, status change and
-- (re)assignment is written to audit_log, for the job's History tab.
--   action = 'job_created' | 'job_status:<status>' | 'job_assigned'
-- Requires 00001–00011.
-- ============================================================

create or replace function log_job_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
begin
  -- Service-role and seed writes have no user; audit_log.user_id is required
  if v_user is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into audit_log (company_id, user_id, action, entity_type, entity_id)
    values (new.company_id, v_user, 'job_created', 'jobs', new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into audit_log (company_id, user_id, action, entity_type, entity_id)
    values (new.company_id, v_user, 'job_status:' || new.status, 'jobs', new.id);
  end if;
  if new.assigned_engineer_id is distinct from old.assigned_engineer_id then
    insert into audit_log (company_id, user_id, action, entity_type, entity_id)
    values (new.company_id, v_user, 'job_assigned', 'jobs', new.id);
  end if;
  return new;
end;
$$;

revoke execute on function log_job_activity() from public, anon, authenticated;

drop trigger if exists job_activity_log on jobs;
create trigger job_activity_log
  after insert or update of status, assigned_engineer_id on jobs
  for each row execute procedure log_job_activity();
