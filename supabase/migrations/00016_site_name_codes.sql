-- ============================================================
-- 00016_site_name_codes.sql
-- Sites get a name (shown as their title) and their Emtec job codes:
--   * sites.name: e.g. "250 St Vincent St (250 SVS)"; existing rows, and inserts
--     without one, take their address
--   * sites.job_codes: e.g. {FS1178, FS1178/4}; a site can have several
-- sites.address stays required; '' where it isn't known.
-- Existing RLS on sites covers the new columns.
-- Requires 00001–00015.
-- ============================================================

alter table sites add column if not exists name text;
update sites set name = address where name is null;
alter table sites alter column name set not null;

-- Inserts without a name (older app versions, seed data) take the address
create or replace function sites_default_name()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.name is null or btrim(new.name) = '' then new.name := new.address; end if;
  return new;
end;
$$;

revoke execute on function sites_default_name() from public, anon, authenticated;

drop trigger if exists sites_default_name on sites;
create trigger sites_default_name
  before insert or update of name on sites
  for each row execute procedure sites_default_name();

alter table sites add column if not exists job_codes text[] not null default '{}';
