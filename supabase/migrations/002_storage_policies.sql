insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-documents',
  'project-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


drop policy if exists
  "project document storage read"
on storage.objects;

create policy "project document storage read"
on storage.objects
for select
using (
  bucket_id = 'project-documents'
  and exists (
    select 1
    from public.project_document_versions as dv
    join public.project_documents as pd
      on pd.id = dv.document_id
    where dv.storage_path = storage.objects.name
      and public.user_can_access_project(pd.project_id)
  )
);


drop policy if exists
  "project document storage insert"
on storage.objects;

create policy "project document storage insert"
on storage.objects
for insert
with check (
  bucket_id = 'project-documents'
  and case
    when storage.objects.name ~ '^[0-9a-fA-F-]{36}/'
      then public.user_can_access_project(
        split_part(storage.objects.name, '/', 1)::uuid
      )
    else false
  end
);


drop policy if exists
  "project document storage no update"
on storage.objects;

create policy "project document storage no update"
on storage.objects
for update
using (false)
with check (false);


drop policy if exists
  "project document storage staff delete"
on storage.objects;

create policy "project document storage staff delete"
on storage.objects
for delete
using (
  bucket_id = 'project-documents'
  and public.current_user_role() in ('staff', 'admin')
  and exists (
    select 1
    from public.project_document_versions as dv
    join public.project_documents as pd
      on pd.id = dv.document_id
    where dv.storage_path = storage.objects.name
      and public.user_can_access_project(pd.project_id)
  )
);