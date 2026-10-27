-- ============================================================
-- 00015_jobsheet_prefill.sql
-- Details the manager fills in when sending out a job, which pre-fill the
-- engineer's jobsheet (src/lib/jobsheetPrefill.ts):
--   * sites.client_no: the site's client number, the default for its jobs
--   * jobs.client_no / jobs.call_no: shown on the jobsheet header
--   * jobs.reported_fault: optional; the engineer can edit it on the sheet
-- Existing RLS on sites and jobs covers the new columns.
-- Requires 00001–00014.
-- ============================================================

alter table sites add column if not exists client_no text;

alter table jobs add column if not exists client_no text;
alter table jobs add column if not exists call_no text;
alter table jobs add column if not exists reported_fault text;
