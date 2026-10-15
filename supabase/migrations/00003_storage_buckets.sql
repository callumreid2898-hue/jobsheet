-- ============================================================
-- 00003_storage_buckets.sql
-- Storage bucket creation and access policies
-- ============================================================

-- Create storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('pdfs',   'pdfs',   false, 20971520,
   array['application/pdf']),
  ('logos',  'logos',  false, 2097152,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  file_size_limit     = excluded.file_size_limit,
  allowed_mime_types  = excluded.allowed_mime_types;

-- ── Storage RLS policies ──────────────────────────────────────────────────────
-- Path convention: {bucket}/{company_id}/{...path}
-- We check that the first folder component matches the user's company_id.

-- photos bucket
drop policy if exists "photos_objects_company" on storage.objects;
create policy "photos_objects_company" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

-- pdfs bucket
drop policy if exists "pdfs_objects_company" on storage.objects;
create policy "pdfs_objects_company" on storage.objects
  for all using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  )
  with check (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

-- logos bucket
drop policy if exists "logos_objects_company" on storage.objects;
create policy "logos_objects_company" on storage.objects
  for all using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );
