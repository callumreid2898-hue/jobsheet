-- ============================================================
-- 00009_schema_drift.sql
-- Bring the schema in line with what the client already writes:
--   * jobs.scheduled_time / duration_minutes (planner + CreateJobPage)
--   * template_id CHECKs widened to all bundled templates
-- Requires 00005–00008 to have been applied first.
-- ============================================================

-- ── jobs.scheduled_time ──────────────────────────────────────────────────────
-- Stored as 'HH:mm' text (not `time`) because the client compares and displays
-- the raw value; `time` would round-trip as 'HH:mm:ss'.
alter table jobs add column if not exists scheduled_time text;
alter table jobs drop constraint if exists jobs_scheduled_time_format;
alter table jobs add constraint jobs_scheduled_time_format
  check (scheduled_time is null or scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Planned duration, used by planner clash detection.
alter table jobs add column if not exists duration_minutes int;
alter table jobs drop constraint if exists jobs_duration_minutes_positive;
alter table jobs add constraint jobs_duration_minutes_positive
  check (duration_minutes is null or duration_minutes > 0);

-- ── template_id CHECKs ───────────────────────────────────────────────────────
-- Keep this list identical to src/templates/*.json (enforced by
-- tests/unit/templateIds.test.ts).
alter table jobs drop constraint if exists jobs_template_id_check;
alter table jobs add constraint jobs_template_id_check check (template_id in (
  'reactive_callout','fire_alarm_service','emergency_lighting_test','cctv_maintenance',
  'cctv_handover','corrective_maintenance','fire_alarm_inspection'));

alter table jobsheets drop constraint if exists jobsheets_template_id_check;
alter table jobsheets add constraint jobsheets_template_id_check check (template_id in (
  'reactive_callout','fire_alarm_service','emergency_lighting_test','cctv_maintenance',
  'cctv_handover','corrective_maintenance','fire_alarm_inspection'));
