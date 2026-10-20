-- ============================================================
-- 00011_media_pdf.sql
-- Photos, signatures and PDFs (audit batch 5):
--   * jobsheets.pdf_url -> pdf_path (storage path; clients sign it on demand)
--   * engineer_signature_url / customer_signature_url hold photos-bucket paths
--   * photos rows and the photos bucket scoped like jobsheets / pdfs
-- Requires 00001–00010.
-- ============================================================

-- ── jobsheets.pdf_path ────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'jobsheets' and column_name = 'pdf_url') then
    alter table jobsheets rename column pdf_url to pdf_path;
  end if;
end;
$$;

-- Old rows hold getPublicUrl() links, which never worked on the private bucket.
update jobsheets
set pdf_path = split_part(regexp_replace(pdf_path, '^.*/object/(public|sign|authenticated)/pdfs/', ''), '?', 1)
where pdf_path ~ '/object/(public|sign|authenticated)/pdfs/';

-- Same as 00010, with the renamed column.
create or replace function jobsheets_lock_after_submit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  mutable constant text[] := array['pdf_path', 'engineer_signature_url', 'customer_signature_url', 'updated_at'];
begin
  if current_user in ('anon', 'authenticated')
     and old.submitted_at is not null
     and get_my_role() is distinct from 'manager'
     and (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'submitted jobsheets are read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── photos rows ───────────────────────────────────────────────────────────────
drop policy if exists "photos_select" on photos;
create policy "photos_select" on photos
  for select using (
    company_id = get_my_company_id()
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet(jobsheet_id::text))
  );

drop policy if exists "photos_insert" on photos;
create policy "photos_insert" on photos
  for insert with check (
    company_id = get_my_company_id()
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet(jobsheet_id::text))
  );

drop policy if exists "photos_delete" on photos;
create policy "photos_delete" on photos
  for delete using (company_id = get_my_company_id() and get_my_role() = 'manager');

-- ── photos bucket ─────────────────────────────────────────────────────────────
-- Paths: {company_id}/{jobsheet_id}/{photo_id}.jpg
--        {company_id}/{jobsheet_id}/signatures/{engineer|customer}.png
drop policy if exists "photos_objects_company" on storage.objects;

drop policy if exists "photos_obj_select" on storage.objects;
create policy "photos_obj_select" on storage.objects
  for select using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

drop policy if exists "photos_obj_insert" on storage.objects;
create policy "photos_obj_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

-- Uploads use upsert, so a retried upload overwrites the same object.
drop policy if exists "photos_obj_update" on storage.objects;
create policy "photos_obj_update" on storage.objects
  for update using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (get_my_role() = 'manager' or is_my_assigned_jobsheet((storage.foldername(name))[2]))
  );

drop policy if exists "photos_obj_delete_manager" on storage.objects;
create policy "photos_obj_delete_manager" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'manager'
  );
