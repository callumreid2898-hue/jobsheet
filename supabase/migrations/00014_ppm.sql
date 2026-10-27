-- ============================================================
-- 00014_ppm.sql
-- PPM engine (audit batch 9):
--   * contracts.start_date / end_date
--   * one visit per contract per date
--   * next_due_date(): the date maths (mirrors advanceDue() in src/lib/contracts.ts)
--   * generate_visit_job(): creates (or reuses) a visit and its PPM job
--   * jobs trigger: a finished job completes its visit and moves the contract on;
--     a cancelled job puts the visit back to pending
-- Requires 00001–00013.
-- ============================================================

alter table contracts add column if not exists start_date date;
alter table contracts add column if not exists end_date date;
alter table contracts drop constraint if exists contracts_dates_order;
alter table contracts add constraint contracts_dates_order
  check (start_date is null or end_date is null or end_date >= start_date);

-- Duplicate visits (same contract and date) could be created before. Drop a
-- job-less duplicate if there's one with a job, or an older job-less one.
-- (Visits never had jobs before this migration, so two with jobs can't happen.)
delete from contract_visits v
where v.job_id is null
  and exists (
    select 1 from contract_visits o
    where o.contract_id = v.contract_id and o.scheduled_date = v.scheduled_date and o.id <> v.id
      and (o.job_id is not null or (o.created_at, o.id) < (v.created_at, v.id))
  );

create unique index if not exists contract_visits_contract_date_key
  on contract_visits (contract_id, scheduled_date);

-- A job belongs to at most one visit.
create unique index if not exists contract_visits_job_key
  on contract_visits (job_id) where job_id is not null;

-- ── Date maths ───────────────────────────────────────────────────────────────
-- The visit after one due on p_from. With an anchor (start date) visits keep the
-- anchor's day of month; Postgres clamps month ends (31 Jan + 1 month = 28/29 Feb).
create or replace function next_due_date(p_from date, p_frequency text, p_anchor date default null)
returns date language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_step int := case p_frequency
    when 'monthly' then 1 when 'quarterly' then 3 when 'biannual' then 6 when 'annual' then 12 end;
  v_next date;
begin
  if v_step is null then
    raise exception 'unknown visit frequency %', p_frequency using errcode = '22023';
  end if;
  if p_anchor is null or p_anchor > p_from then
    return (p_from + make_interval(months => v_step))::date;
  end if;
  for k in 1..1200 loop
    v_next := (p_anchor + make_interval(months => v_step * k))::date;
    if v_next > p_from then return v_next; end if;
  end loop;
  return (p_from + make_interval(months => v_step))::date;
end;
$$;

-- ── generate_visit_job ───────────────────────────────────────────────────────
-- Manager action: the visit for p_date (default: the contract's next due date)
-- gets a PPM job. Calling it again for the same visit returns the same job.
create or replace function generate_visit_job(
  p_contract_id uuid,
  p_date        date default null,
  p_engineer_id uuid default null,
  p_template_id text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c        contracts;
  v_date   date;
  v_visit  contract_visits;
  v_job    uuid;
begin
  if get_my_role() is distinct from 'manager' then
    raise exception 'only managers can create PPM jobs' using errcode = '42501';
  end if;
  select * into c from contracts where id = p_contract_id and company_id = get_my_company_id() for update;
  if not found then
    raise exception 'contract not found' using errcode = 'P0002';
  end if;
  if c.status <> 'active' then
    raise exception 'the contract is %', c.status using errcode = '42501';
  end if;
  v_date := coalesce(p_date, c.next_visit_due);
  if v_date is null then
    raise exception 'the contract has no next visit date' using errcode = '22023';
  end if;
  if p_engineer_id is not null and not exists (
    select 1 from profiles where id = p_engineer_id and company_id = c.company_id and active
  ) then
    raise exception 'engineer not found' using errcode = 'P0002';
  end if;

  insert into contract_visits (contract_id, company_id, scheduled_date)
  values (c.id, c.company_id, v_date)
  on conflict (contract_id, scheduled_date) do nothing;
  select * into v_visit from contract_visits
  where contract_id = c.id and scheduled_date = v_date for update;

  if v_visit.status = 'complete' then
    raise exception 'that visit is already complete' using errcode = '42501';
  end if;
  if v_visit.job_id is not null then
    return v_visit.job_id;
  end if;

  insert into jobs (company_id, site_id, system_id, type, template_id, assigned_engineer_id,
                    scheduled_date, status, notes)
  values (
    c.company_id, c.site_id, c.system_id, 'ppm_service',
    coalesce(p_template_id, case c.system_type
      when 'fire_alarm'         then 'fire_alarm_service'
      when 'emergency_lighting' then 'emergency_lighting_test'
      when 'cctv'               then 'cctv_maintenance'
      else 'corrective_maintenance' end),
    p_engineer_id, v_date,
    case when p_engineer_id is null then 'unassigned' else 'scheduled' end,
    'PPM visit' || coalesce(' · ' || c.reference, '')
  )
  returning id into v_job;

  update contract_visits set job_id = v_job, status = 'scheduled' where id = v_visit.id;
  return v_job;
end;
$$;

revoke execute on function generate_visit_job(uuid, date, uuid, text) from public, anon;
grant execute on function generate_visit_job(uuid, date, uuid, text) to authenticated;

-- ── Job status → visit and contract ──────────────────────────────────────────
-- Runs for engineers too (via set_job_status), so it is SECURITY DEFINER.
create or replace function sync_contract_visit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v contract_visits;
  c contracts;
  v_next date;
begin
  select * into v from contract_visits where job_id = new.id for update;
  if not found then return new; end if;

  if new.status in ('completed', 'awaiting_review', 'reviewed', 'invoiced') and v.status <> 'complete' then
    update contract_visits set status = 'complete' where id = v.id;
    select * into c from contracts where id = v.contract_id for update;
    -- Only move forward: a late job for an old visit doesn't pull the date back
    if c.next_visit_due is null or c.next_visit_due <= v.scheduled_date then
      v_next := next_due_date(v.scheduled_date, c.visit_frequency, c.start_date);
      update contracts
      set next_visit_due = case when c.end_date is not null and v_next > c.end_date then null else v_next end
      where id = c.id;
    end if;
  elsif new.status = 'cancelled' and v.status <> 'complete' then
    -- The visit still needs doing: free it for a new job
    update contract_visits set status = 'pending', job_id = null where id = v.id;
  end if;
  return new;
end;
$$;

revoke execute on function sync_contract_visit() from public, anon, authenticated;

drop trigger if exists jobs_sync_contract_visit on jobs;
create trigger jobs_sync_contract_visit
  after update of status on jobs
  for each row when (new.status is distinct from old.status)
  execute procedure sync_contract_visit();
