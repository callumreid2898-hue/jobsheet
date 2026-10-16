-- ============================================================
-- seed.sql — Demo data for ACME Fire & Security
-- Idempotent: uses ON CONFLICT DO UPDATE / DO NOTHING
-- Run after migrations: supabase db reset (which runs seed)
-- ============================================================

-- Fixed UUIDs for deterministic seed
-- Company
-- '11111111-1111-1111-1111-111111111111'

-- Auth users (inserted directly for dev — production uses invite flow)
-- Manager:   auth id = '22222222-2222-2222-2222-222222222222'
--            profile id = '33333333-3333-3333-3333-333333333333'
-- Engineer1: auth id = '44444444-4444-4444-4444-444444444444'
--            profile id = '55555555-5555-5555-5555-555555555555'
-- Engineer2: auth id = '66666666-6666-6666-6666-666666666666'
--            profile id = '77777777-7777-7777-7777-777777777777'

-- ── Company ───────────────────────────────────────────────────────────────────
insert into companies (id, name, accreditation_number, address)
values (
  '11111111-1111-1111-1111-111111111111',
  'ACME Fire & Security',
  'NSI-NACOSS-12345',
  '10 Commerce Way, Birmingham, B1 1AA'
)
on conflict (id) do update set
  name = excluded.name,
  accreditation_number = excluded.accreditation_number;

-- ── Auth users (dev only — insert directly into auth.users) ──────────────────
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  raw_app_meta_data
)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'manager@acme.test',
    crypt('Password1!', gen_salt('bf')),
    now(),
    jsonb_build_object('company_id','11111111-1111-1111-1111-111111111111','role','manager','full_name','Alice Manager'),
    now(), now(), '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'eng1@acme.test',
    crypt('Password1!', gen_salt('bf')),
    now(),
    jsonb_build_object('company_id','11111111-1111-1111-1111-111111111111','role','engineer','full_name','Bob Engineer'),
    now(), now(), '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'eng2@acme.test',
    crypt('Password1!', gen_salt('bf')),
    now(),
    jsonb_build_object('company_id','11111111-1111-1111-1111-111111111111','role','engineer','full_name','Carol Engineer'),
    now(), now(), '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb
  )
on conflict (id) do nothing;

-- ── Auth identities (required for magic-link lookup) ─────────────────────────
-- Inserting directly into auth.users bypasses the normal identity creation.
-- Without this, magic link returns "Database error finding user".
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'manager@acme.test',
    jsonb_build_object('sub','22222222-2222-2222-2222-222222222222','email','manager@acme.test','email_verified',true),
    'email', now(), now(), now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '44444444-4444-4444-4444-444444444444',
    'eng1@acme.test',
    jsonb_build_object('sub','44444444-4444-4444-4444-444444444444','email','eng1@acme.test','email_verified',true),
    'email', now(), now(), now()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '66666666-6666-6666-6666-666666666666',
    'eng2@acme.test',
    jsonb_build_object('sub','66666666-6666-6666-6666-666666666666','email','eng2@acme.test','email_verified',true),
    'email', now(), now(), now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'other@other.test',
    jsonb_build_object('sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','email','other@other.test','email_verified',true),
    'email', now(), now(), now()
  )
on conflict (id) do nothing;

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- The handle_new_user() trigger fires on auth.users insert and creates profiles
-- with random UUIDs. We need fixed UUIDs so that jobs.assigned_engineer_id
-- references work. Delete any trigger-created rows first, then insert with
-- the fixed IDs. This block is safe to re-run.
delete from profiles where user_id in (
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '66666666-6666-6666-6666-666666666666'
);

insert into profiles (id, user_id, company_id, role, full_name, email)
values
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','manager','Alice Manager','manager@acme.test'),
  ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','engineer','Bob Engineer','eng1@acme.test'),
  ('77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','engineer','Carol Engineer','eng2@acme.test')
on conflict (id) do nothing;

-- ── Second company (for RLS cross-tenant tests) ───────────────────────────────
insert into companies (id, name, accreditation_number)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Other Co Ltd', 'SSAIB-99999')
on conflict (id) do nothing;

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  raw_app_meta_data
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'other@other.test',
  crypt('Password1!', gen_salt('bf')),
  now(),
  jsonb_build_object('company_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','role','manager','full_name','Other Manager'),
  now(), now(), '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb
)
on conflict (id) do nothing;

delete from profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

insert into profiles (id, user_id, company_id, role, full_name, email)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','manager','Other Manager','other@other.test')
on conflict (id) do nothing;

-- ── Customers ─────────────────────────────────────────────────────────────────
insert into customers (id, company_id, name, contact_name, contact_email, contact_phone)
values
  ('c1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Riverside Shopping Centre','John Smith','j.smith@riverside.co.uk','01234 567890'),
  ('c1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','City Council Offices','Sarah Jones','s.jones@citycouncil.gov.uk','01234 567891'),
  ('c1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Metro Hotel Group','Mike Wilson','m.wilson@metrohotel.co.uk','01234 567892')
on conflict (id) do nothing;

-- ── Sites ─────────────────────────────────────────────────────────────────────
insert into sites (id, company_id, customer_id, address, contact_name, contact_phone, access_notes)
values
  ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000001','Riverside Shopping Centre, Main Building, High St, Birmingham B2 4RU','John Smith','01234 567890','Key with security desk, sign in at reception. Panel in basement plant room.'),
  ('a1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000001','Riverside Shopping Centre, Car Park, Level 3, High St, Birmingham B2 4RU','John Smith','01234 567890','Access via stairwell B. NVR in camera room, code 1234.'),
  ('a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000002','City Council Offices, 1 Council Square, Birmingham B3 1AA','Sarah Jones','01234 567891','Sign in at reception. Escort required to plant room. Panel in basement.'),
  ('a1000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000003','Metro Hotel, Reception Building, 5 Station Rd, Birmingham B4 7AB','Mike Wilson','01234 567892','Report to duty manager. PIR system, panel at rear of reception desk.'),
  ('a1000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000003','Metro Hotel, Back Office, 5 Station Rd, Birmingham B4 7AB','Mike Wilson','01234 567892','Emergency lighting throughout back office and corridor. Test monthly.')
on conflict (id) do nothing;

-- ── Systems ───────────────────────────────────────────────────────────────────
insert into systems (id, site_id, company_id, type, make, model, panel_location)
values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','fire_alarm','Morley','IAS 8000','Basement plant room, south wall'),
  ('b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','cctv','Hikvision','DS-7716NI-I4','Camera room, Level 3'),
  ('b1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','fire_alarm','Advanced','MxPro 5','Basement, north wall'),
  ('b1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','emergency_lighting','Thorn','Aqua Pro','Throughout building - see logbook'),
  ('b1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','intruder','Galaxy','Dimension G3','Rear of reception desk'),
  ('b1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','emergency_lighting','Thorn','Excel','Back office and corridor')
on conflict (id) do nothing;

-- ── Jobs (scheduled for today) ────────────────────────────────────────────────
insert into jobs (id, company_id, site_id, system_id, type, template_id, assigned_engineer_id, scheduled_date, status, notes)
values
  (
    'd1000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'a1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'service', 'fire_alarm_service',
    '55555555-5555-5555-5555-555555555555',
    current_date, 'scheduled',
    'Annual service. Zone 1-4 this visit. Please check battery voltages carefully - reported low on last visit.'
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'a1000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000003',
    'reactive', 'reactive_callout',
    '55555555-5555-5555-5555-555555555555',
    current_date, 'scheduled',
    'Customer reports panel showing zone 3 fault. Investigate and rectify.'
  ),
  (
    'd1000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'a1000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000004',
    'service', 'emergency_lighting_test',
    '77777777-7777-7777-7777-777777777777',
    current_date, 'scheduled',
    'Annual duration test. All fittings must be tested.'
  ),
  (
    'd1000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'a1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000002',
    'service', 'cctv_maintenance',
    '77777777-7777-7777-7777-777777777777',
    current_date, 'scheduled',
    'Routine CCTV maintenance. Check HDD retention - should be 31 days minimum.'
  ),
  (
    'd1000000-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    'a1000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000006',
    'service', 'emergency_lighting_test',
    '55555555-5555-5555-5555-555555555555',
    current_date, 'scheduled',
    'Monthly flick test for back office emergency lighting.'
  )
on conflict (id) do nothing;
