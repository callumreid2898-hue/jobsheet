-- ============================================================
-- 00017_devices.sql
-- Devices and device tests (audit Batch 11):
--   * devices.status: 'active' or 'removed'. Removed devices keep their test
--     history but drop out of test coverage and the service sheet.
--   * device_tests: a test must be for one of the caller's company's devices,
--     and its jobsheet (when given) one the caller can see.
--   * one test per device per jobsheet (the service sheet saves them on submit).
-- Coverage (devices tested in the last 12 months) is worked out in the app
-- (src/lib/devices.ts), so it also works offline.
-- Requires 00001–00016.
-- ============================================================

alter table devices add column if not exists status text not null default 'active';
alter table devices drop constraint if exists devices_status_check;
alter table devices add constraint devices_status_check check (status in ('active', 'removed'));

drop policy if exists "device_tests_insert" on device_tests;
create policy "device_tests_insert" on device_tests
  for insert with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from devices d
      where d.id = device_tests.device_id and d.company_id = get_my_company_id()
    )
    and (
      device_tests.jobsheet_id is null
      or exists (select 1 from jobsheets j where j.id = device_tests.jobsheet_id)
    )
  );

create unique index if not exists device_tests_jobsheet_device_uniq
  on device_tests (jobsheet_id, device_id) where jobsheet_id is not null;
