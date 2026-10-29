-- ============================================================
-- emtec_staff_invites.sql — adds Emtec staff to the Team page as pending invites
-- (from EMTEC_Staff.xlsx). Not destructive; safe to run again.
--
-- Each person joins the company with this role the first time they sign in
-- with that email (claim_invite, 00010). Someone already in the company
-- (same email, gmail/googlemail treated alike, or same name) is skipped.
-- Apprentices and the commissioning engineer are engineers; the administrator
-- is a manager. Where the sheet gave two emails, the first (work) one is used.
--
-- Run in the Supabase dashboard SQL editor, after migrations 00005–00016.
-- Then send each person a login: Authentication → Users → Invite user
-- (or deploy the invite-user Edge Function).
-- ============================================================

do $$
declare
  company_name constant text := 'Emtec Fire';  -- ← your company's name in the app
  v_company uuid;
  n int;
begin
  select id into v_company from companies where name = company_name;
  if v_company is null then
    raise exception 'No company named "%". Companies here: %',
      company_name, (select string_agg('"' || name || '"', ', ') from companies);
  end if;

  create temp table emtec_staff (full_name text, email text, role text) on commit drop;
  insert into emtec_staff (full_name, email, role) values
    ('Aidan Butler', 'aidan.butler@emtecgroup.co.uk', 'engineer'),  -- Engineer
    ('Scott Smith', 'scott.smith@emtecgroup.co.uk', 'engineer'),  -- Commissioning Engineer
    ('Harry Javidan-Tabrizi', 'harry.javidan-tabrizi@emtecgroup.co.uk', 'engineer'),  -- Engineer
    ('Caelan Coleman', 'caelan_coleman@yahoo.co.uk', 'engineer'),  -- Engineer
    ('Callum Reid', 'callumreid2898@gmail.com', 'engineer'),  -- Engineer
    ('Chris Mitchell', 'christopher.mitchell@emtecgroup.co.uk', 'engineer'),  -- Engineer
    ('Lewis Sloan', 'lewissloan2004@gmail.com', 'engineer'),  -- Apprentice – Stage 3
    ('Liam Walker', 'liamwalker1203@outlook.com', 'engineer'),  -- Apprentice – Stage 2
    ('Deniz Phillips', 'denizphillips364@gmail.com', 'engineer'),  -- Apprentice – Stage 1
    ('Connor', 'cocoheaney595@gmail.com', 'engineer'),  -- Apprentice – Stage 1
    ('Ross Sloan', 'ross.sloan@emtecgroup.co.uk', 'manager'),  -- Manager
    ('Shane Garrioch', 'shane.garrioch@emtecgroup.co.uk', 'manager'),  -- Manager
    -- ('Reuben Christmas', 'reuben.christmas@emtecgroup.co.uk', 'manager'),  -- no role on the staff sheet: uncomment with the right role
    ('Stephanie Lister', 'stephanie.lister@emtecgroup.co.uk', 'manager'); -- Administrator

  -- gmail.com and googlemail.com are the same mailbox
  create temp table emtec_staff_new on commit drop as
  select s.* from emtec_staff s
  where not exists (
    select 1 from profiles p
    where p.company_id = v_company
      and (replace(lower(p.email), '@googlemail.com', '@gmail.com') = replace(s.email, '@googlemail.com', '@gmail.com')
           or lower(p.full_name) = lower(s.full_name))
  );

  -- Re-running replaces their pending invites rather than adding more
  delete from invites i using emtec_staff_new s
  where i.company_id = v_company and i.accepted_at is null and lower(i.email) = s.email;

  insert into invites (company_id, email, role, full_name, expires_at)
  select v_company, email, role, full_name, now() + interval '60 days' from emtec_staff_new;
  get diagnostics n = row_count;

  raise notice 'Invited % people to "%" (% already in the company)', n, company_name,
    (select count(*) from emtec_staff) - n;
end $$;
