insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'user-signatures',
  'user-signatures',
  false,
  1048576,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.user_signature_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint user_signature_assets_user_id_fkey references public.profiles(id) on delete cascade,
  method text not null check (method in ('drawn', 'typed', 'uploaded')),
  storage_bucket text not null default 'user-signatures',
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  file_size bigint not null check (file_size > 0 and file_size <= 1048576),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  is_default boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.approval_signature_stamps (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null constraint approval_signature_stamps_assignment_id_fkey references public.workflow_assignments(id) on delete restrict,
  approval_action_id uuid not null constraint approval_signature_stamps_approval_action_id_fkey references public.approval_actions(id) on delete restrict,
  signer_id uuid not null constraint approval_signature_stamps_signer_id_fkey references public.profiles(id) on delete restrict,
  source_document_version_id uuid not null constraint approval_signature_stamps_source_document_version_id_fkey references public.project_document_versions(id) on delete restrict,
  signed_document_version_id uuid not null constraint approval_signature_stamps_signed_document_version_id_fkey references public.project_document_versions(id) on delete restrict,
  signature_asset_id uuid not null constraint approval_signature_stamps_signature_asset_id_fkey references public.user_signature_assets(id) on delete restrict,
  page_number integer not null check (page_number > 0),
  x_ratio numeric(8, 7) not null check (x_ratio >= 0 and x_ratio <= 1),
  y_ratio numeric(8, 7) not null check (y_ratio >= 0 and y_ratio <= 1),
  width_ratio numeric(8, 7) not null check (width_ratio > 0 and width_ratio <= 1),
  height_ratio numeric(8, 7) not null check (height_ratio > 0 and height_ratio <= 1),
  printed_name text not null,
  role_at_signing text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint approval_signature_stamps_inside_page check (
    x_ratio + width_ratio <= 1 and y_ratio + height_ratio <= 1
  ),
  constraint approval_signature_stamps_distinct_versions check (
    source_document_version_id <> signed_document_version_id
  ),
  unique (assignment_id),
  unique (approval_action_id),
  unique (signed_document_version_id)
);

create unique index if not exists user_signature_assets_one_default_idx
  on public.user_signature_assets(user_id)
  where is_default and revoked_at is null;

create index if not exists user_signature_assets_user_idx
  on public.user_signature_assets(user_id, created_at);

create index if not exists approval_signature_stamps_signer_idx
  on public.approval_signature_stamps(signer_id, signed_at);

create index if not exists approval_signature_stamps_source_version_idx
  on public.approval_signature_stamps(source_document_version_id);

create index if not exists projects_submitted_at_idx
  on public.projects(submitted_at);

create index if not exists projects_completed_at_idx
  on public.projects(completed_at);

create index if not exists projects_status_submitted_idx
  on public.projects(status, submitted_at);

create index if not exists workflow_steps_project_status_activated_idx
  on public.workflow_steps(project_id, status, activated_at);

create index if not exists workflow_assignments_step_status_assigned_idx
  on public.workflow_assignments(workflow_step_id, status, assigned_at);

create index if not exists approval_actions_approver_created_idx
  on public.approval_actions(approver_id, created_at);

create index if not exists revision_requests_project_resolved_created_idx
  on public.revision_requests(project_id, resolved_at, created_at);

create trigger user_signature_assets_updated_at
  before update on public.user_signature_assets
  for each row execute function public.set_updated_at();

create trigger approval_signature_stamps_append_only
  before update or delete on public.approval_signature_stamps
  for each row execute function public.prevent_update_delete();

alter table public.user_signature_assets enable row level security;
alter table public.approval_signature_stamps enable row level security;

drop policy if exists "signature assets owner read" on public.user_signature_assets;
create policy "signature assets owner read"
on public.user_signature_assets
for select
using (user_id = auth.uid() and revoked_at is null);

drop policy if exists "signature assets owner insert" on public.user_signature_assets;
create policy "signature assets owner insert"
on public.user_signature_assets
for insert
with check (
  user_id = auth.uid()
  and storage_bucket = 'user-signatures'
  and storage_path like auth.uid()::text || '/%'
);

drop policy if exists "signature assets owner revoke" on public.user_signature_assets;
create policy "signature assets owner revoke"
on public.user_signature_assets
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "signature stamps project read" on public.approval_signature_stamps;
create policy "signature stamps project read"
on public.approval_signature_stamps
for select
using (
  exists (
    select 1
    from public.workflow_assignments wa
    join public.workflow_steps ws on ws.id = wa.workflow_step_id
    where wa.id = assignment_id
      and public.user_can_access_project(ws.project_id)
  )
);

drop policy if exists "signature stamps approver insert" on public.approval_signature_stamps;
create policy "signature stamps approver insert"
on public.approval_signature_stamps
for insert
with check (
  signer_id = auth.uid()
  and exists (
    select 1
    from public.workflow_assignments wa
    join public.workflow_steps ws on ws.id = wa.workflow_step_id
    join public.user_signature_assets usa on usa.id = signature_asset_id
    where wa.id = assignment_id
      and wa.approver_id = auth.uid()
      and wa.invalidated_at is null
      and usa.user_id = auth.uid()
      and public.user_can_access_project(ws.project_id)
  )
);

drop policy if exists "user signature storage read" on storage.objects;
create policy "user signature storage read"
on storage.objects
for select
using (
  bucket_id = 'user-signatures'
  and exists (
    select 1
    from public.user_signature_assets usa
    where usa.storage_bucket = storage.objects.bucket_id
      and usa.storage_path = storage.objects.name
      and usa.user_id = auth.uid()
      and usa.revoked_at is null
  )
);

drop policy if exists "user signature storage insert" on storage.objects;
create policy "user signature storage insert"
on storage.objects
for insert
with check (
  bucket_id = 'user-signatures'
  and storage.objects.name like auth.uid()::text || '/%'
);

drop policy if exists "user signature storage no update" on storage.objects;
create policy "user signature storage no update"
on storage.objects
for update
using (false)
with check (false);

drop policy if exists "user signature storage owner delete" on storage.objects;
create policy "user signature storage owner delete"
on storage.objects
for delete
using (
  bucket_id = 'user-signatures'
  and storage.objects.name like auth.uid()::text || '/%'
);
