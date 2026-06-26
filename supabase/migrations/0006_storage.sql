-- 0006_storage.sql
-- Private media bucket. Path convention: {org_id}/{claim_id}/{...}
-- RLS keys off the first path segment (org_id) via storage.foldername().

insert into storage.buckets (id, name, public)
values ('resto-media','resto-media', false)
on conflict (id) do nothing;

create policy resto_media_obj_select on storage.objects for select
  using (bucket_id = 'resto-media'
         and (storage.foldername(name))[1]::uuid in (select resto_user_org_ids()));

create policy resto_media_obj_insert on storage.objects for insert
  with check (bucket_id = 'resto-media'
         and (storage.foldername(name))[1]::uuid in (select resto_user_org_ids()));

create policy resto_media_obj_update on storage.objects for update
  using (bucket_id = 'resto-media'
         and (storage.foldername(name))[1]::uuid in (select resto_user_org_ids()));

create policy resto_media_obj_delete on storage.objects for delete
  using (bucket_id = 'resto-media'
         and (storage.foldername(name))[1]::uuid in (select resto_user_org_ids()));
