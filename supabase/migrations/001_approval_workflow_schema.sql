create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'staff', 'approver', 'admin');
create type public.project_status as enum (
  'draft',
  'submitted',
  'staff_review',
  'revision_required',
  'staff_approved',
  'approval_pending',
  'partially_approved',
  'rejected',
  'approved',
  'completed',
  'cancelled'
);
create type public.workflow_step_status as enum (
  'not_started',
  'waiting',
  'in_progress',
  'revision_required',
  'approved',
  'rejected',
  'skipped',
  'completed',
  'overdue'
);
create type public.step_mode as enum ('sequential', 'parallel');
create type public.completion_rule as enum ('all', 'any', 'minimum');
create type public.approval_decision as enum ('approved', 'rejected', 'revision_requested');
create type public.comment_visibility as enum ('shared', 'internal');
create type public.notification_channel as enum ('in_app', 'email');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizational_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  parent_id uuid references public.organizational_units(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null unique,
  role public.app_role not null default 'student',
  unit_id uuid references public.organizational_units(id),
  position text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.user_unit_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.organizational_units(id) on delete cascade,
  role_in_unit text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (user_id, unit_id)
);

create table public.project_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('ISE-' || to_char(now(), 'YYYY') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  title text not null,
  abstract text,
  status public.project_status not null default 'draft',
  project_type_id uuid references public.project_types(id),
  academic_program text not null,
  organizational_unit_id uuid references public.organizational_units(id),
  student_id uuid not null references public.profiles(id),
  assigned_staff_id uuid references public.profiles(id),
  current_responsible text,
  due_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (project_id, user_id)
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_type text not null,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (project_id, document_type)
);

create table public.project_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  original_file_name text not null,
  storage_bucket text not null default 'project-documents',
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type text not null,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  active boolean not null default true,
  sha256_hash text not null check (sha256_hash ~ '^[0-9a-f]{64}$'),
  revision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (document_id, version_number)
);

create unique index project_document_versions_one_active_idx
  on public.project_document_versions(document_id)
  where active;

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_step_id uuid,
  author_id uuid not null references public.profiles(id),
  visibility public.comment_visibility not null default 'shared',
  body text not null,
  attachment_path text,
  resolved boolean not null default false,
  edited boolean not null default false,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type_id uuid references public.project_types(id),
  organizational_unit_id uuid references public.organizational_units(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  name text not null,
  step_order integer not null check (step_order > 0),
  mode public.step_mode not null,
  completion_rule public.completion_rule not null,
  minimum_approvals integer check (minimum_approvals is null or minimum_approvals > 0),
  certification_required boolean not null default true,
  comments_required boolean not null default false,
  revision_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (template_id, step_order),
  constraint workflow_template_minimum_rule_valid check (
    completion_rule <> 'minimum' or minimum_approvals is not null
  )
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  step_order integer not null check (step_order > 0),
  mode public.step_mode not null,
  status public.workflow_step_status not null default 'not_started',
  completion_rule public.completion_rule not null,
  minimum_approvals integer check (minimum_approvals is null or minimum_approvals > 0),
  certification_required boolean not null default true,
  comments_required boolean not null default false,
  revision_allowed boolean not null default true,
  due_at timestamptz,
  activated_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (project_id, step_order),
  constraint workflow_step_minimum_rule_valid check (
    completion_rule <> 'minimum' or minimum_approvals is not null
  )
);

alter table public.project_comments
  add constraint project_comments_workflow_step_fk
  foreign key (workflow_step_id) references public.workflow_steps(id) on delete set null;

create table public.workflow_assignments (
  id uuid primary key default gen_random_uuid(),
  workflow_step_id uuid not null references public.workflow_steps(id) on delete cascade,
  approver_id uuid not null references public.profiles(id),
  status text not null default 'waiting' check (status in ('waiting', 'opened', 'approved', 'rejected', 'revision_requested', 'invalidated', 'cancelled')),
  assigned_at timestamptz not null default now(),
  first_notification_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  due_at timestamptz,
  last_reminder_at timestamptz,
  last_reminder_type text,
  reminder_count integer not null default 0 check (reminder_count >= 0),
  escalation_level integer not null default 0 check (escalation_level >= 0),
  completed_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create unique index workflow_assignments_active_unique_idx
  on public.workflow_assignments(workflow_step_id, approver_id)
  where invalidated_at is null;

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.workflow_assignments(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id),
  approver_id uuid not null references public.profiles(id),
  decision public.approval_decision not null,
  document_version_id uuid not null references public.project_document_versions(id),
  document_sha256_hash text not null check (document_sha256_hash ~ '^[0-9a-f]{64}$'),
  certification_statement_version text,
  certification_statement text,
  certified_at timestamptz,
  approver_display_name text not null,
  approver_role_at_approval text not null,
  ip_address inet,
  user_agent text,
  auth_provider text,
  comment text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create unique index approval_actions_one_per_assignment_idx
  on public.approval_actions(assignment_id);

create table public.approval_action_invalidations (
  id uuid primary key default gen_random_uuid(),
  approval_action_id uuid not null unique references public.approval_actions(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id),
  invalidated_by uuid references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  document_version_id uuid not null references public.project_document_versions(id),
  document_sha256_hash text not null check (document_sha256_hash ~ '^[0-9a-f]{64}$'),
  verification_code text not null unique,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.workflow_change_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  changed_by uuid references public.profiles(id),
  change_type text not null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  workflow_step_id uuid references public.workflow_steps(id),
  reason text not null,
  restart_step_ids uuid[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  assignment_id uuid references public.workflow_assignments(id) on delete set null,
  channel public.notification_channel not null,
  type text not null,
  subject text not null default '',
  body text not null default '',
  provider text,
  status text not null check (status in ('sent', 'skipped', 'failed', 'logged')),
  sent_at timestamptz,
  dedupe_key text,
  error text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create unique index notification_logs_dedupe_idx
  on public.notification_logs(dedupe_key)
  where dedupe_key is not null;

create table public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unopened_after_days integer not null default 2 check (unopened_after_days >= 0),
  no_action_after_days integer not null default 4 check (no_action_after_days >= 0),
  staff_notice_after_days integer not null default 7 check (staff_notice_after_days >= 0),
  escalation_after_days integer not null default 10 check (escalation_after_days >= 0),
  repeat_escalation_every_days integer not null default 3 check (repeat_escalation_every_days > 0),
  due_soon_before_days integer not null default 1 check (due_soon_before_days >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id)
);

create unique index reminder_rules_one_default_idx
  on public.reminder_rules(is_default)
  where is_default;

create table public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.workflow_assignments(id) on delete cascade,
  event_type text not null,
  channel public.notification_channel not null default 'in_app',
  notification_log_id uuid references public.notification_logs(id) on delete set null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index profiles_role_idx on public.profiles(role);
create index profiles_unit_idx on public.profiles(unit_id);
create index memberships_user_idx on public.user_unit_memberships(user_id);
create index memberships_unit_idx on public.user_unit_memberships(unit_id);
create index projects_student_idx on public.projects(student_id);
create index projects_status_idx on public.projects(status);
create index projects_staff_idx on public.projects(assigned_staff_id);
create index projects_unit_idx on public.projects(organizational_unit_id);
create index projects_due_idx on public.projects(due_at);
create index project_members_user_idx on public.project_members(user_id);
create index documents_project_idx on public.project_documents(project_id);
create index document_versions_document_idx on public.project_document_versions(document_id);
create index comments_project_idx on public.project_comments(project_id);
create index workflow_steps_project_idx on public.workflow_steps(project_id);
create index workflow_assignments_step_idx on public.workflow_assignments(workflow_step_id);
create index workflow_assignments_approver_idx on public.workflow_assignments(approver_id);
create index approval_actions_project_idx on public.approval_actions(project_id);
create index notification_logs_recipient_idx on public.notification_logs(recipient_id, created_at);
create index reminder_events_assignment_idx on public.reminder_events(assignment_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create trigger organizational_units_updated_at before update on public.organizational_units for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_unit_memberships_updated_at before update on public.user_unit_memberships for each row execute function public.set_updated_at();
create trigger project_types_updated_at before update on public.project_types for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger project_members_updated_at before update on public.project_members for each row execute function public.set_updated_at();
create trigger project_documents_updated_at before update on public.project_documents for each row execute function public.set_updated_at();
create trigger project_document_versions_updated_at before update on public.project_document_versions for each row execute function public.set_updated_at();
create trigger project_comments_updated_at before update on public.project_comments for each row execute function public.set_updated_at();
create trigger workflow_templates_updated_at before update on public.workflow_templates for each row execute function public.set_updated_at();
create trigger workflow_template_steps_updated_at before update on public.workflow_template_steps for each row execute function public.set_updated_at();
create trigger workflow_steps_updated_at before update on public.workflow_steps for each row execute function public.set_updated_at();
create trigger workflow_assignments_updated_at before update on public.workflow_assignments for each row execute function public.set_updated_at();
create trigger revision_requests_updated_at before update on public.revision_requests for each row execute function public.set_updated_at();
create trigger reminder_rules_updated_at before update on public.reminder_rules for each row execute function public.set_updated_at();
create trigger system_settings_updated_at before update on public.system_settings for each row execute function public.set_updated_at();

create or replace function public.prevent_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger approval_actions_append_only before update or delete on public.approval_actions for each row execute function public.prevent_update_delete();
create trigger approval_action_invalidations_append_only before update or delete on public.approval_action_invalidations for each row execute function public.prevent_update_delete();
create trigger certificates_append_only before update or delete on public.certificates for each row execute function public.prevent_update_delete();
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.prevent_update_delete();
create trigger workflow_change_log_append_only before update or delete on public.workflow_change_log for each row execute function public.prevent_update_delete();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.email, 'New user'),
    coalesce(new.email, new.id::text),
    'student'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.user_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        public.is_admin()
        or p.student_id = auth.uid()
        or p.assigned_staff_id = auth.uid()
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = auth.uid()
        )
        or exists (
          select 1 from public.workflow_steps ws
          join public.workflow_assignments wa on wa.workflow_step_id = ws.id
          where ws.project_id = p.id
            and wa.approver_id = auth.uid()
            and wa.invalidated_at is null
        )
        or (
          public.current_user_role() = 'staff'
          and exists (
            select 1
            from public.user_unit_memberships uum
            where uum.user_id = auth.uid()
              and (p.organizational_unit_id is null or uum.unit_id = p.organizational_unit_id)
          )
        )
      )
  )
$$;

create or replace function public.staff_can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        public.is_admin()
        or (
          public.current_user_role() = 'staff'
          and (
            p.assigned_staff_id = auth.uid()
            or exists (
              select 1
              from public.user_unit_memberships uum
              where uum.user_id = auth.uid()
                and (p.organizational_unit_id is null or uum.unit_id = p.organizational_unit_id)
            )
          )
        )
      )
  )
$$;

create or replace function public.set_profile_role(target_user_id uuid, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin role is required';
  end if;

  update public.profiles
  set role = new_role,
      updated_at = now()
  where id = target_user_id;
end;
$$;

alter table public.organizational_units enable row level security;
alter table public.profiles enable row level security;
alter table public.user_unit_memberships enable row level security;
alter table public.project_types enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_documents enable row level security;
alter table public.project_document_versions enable row level security;
alter table public.project_comments enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_template_steps enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_assignments enable row level security;
alter table public.approval_actions enable row level security;
alter table public.approval_action_invalidations enable row level security;
alter table public.certificates enable row level security;
alter table public.workflow_change_log enable row level security;
alter table public.revision_requests enable row level security;
alter table public.notification_logs enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.reminder_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy "profiles self staff admin read" on public.profiles for select using (
  id = auth.uid() or public.current_user_role() in ('staff', 'admin')
);
create policy "profiles admin manage" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "units authenticated read" on public.organizational_units for select using (auth.uid() is not null);
create policy "units admin manage" on public.organizational_units for all using (public.is_admin()) with check (public.is_admin());

create policy "memberships self staff admin read" on public.user_unit_memberships for select using (
  user_id = auth.uid() or public.current_user_role() in ('staff', 'admin')
);
create policy "memberships admin manage" on public.user_unit_memberships for all using (public.is_admin()) with check (public.is_admin());

create policy "project types authenticated read" on public.project_types for select using (auth.uid() is not null);
create policy "project types admin manage" on public.project_types for all using (public.is_admin()) with check (public.is_admin());

create policy "projects permitted read" on public.projects for select using (public.user_can_access_project(id));
create policy "students create own projects" on public.projects for insert with check (
  student_id = auth.uid() and public.current_user_role() = 'student'
);
create policy "students edit allowed own projects" on public.projects for update using (
  student_id = auth.uid() and status in ('draft', 'revision_required')
) with check (
  student_id = auth.uid() and status in ('draft', 'submitted', 'revision_required')
);
create policy "staff manage permitted projects" on public.projects for update using (
  public.staff_can_manage_project(id)
) with check (
  public.staff_can_manage_project(id)
);
create policy "admin manage projects" on public.projects for all using (public.is_admin()) with check (public.is_admin());

create policy "project members project read" on public.project_members for select using (public.user_can_access_project(project_id));
create policy "project members staff manage" on public.project_members for all using (public.staff_can_manage_project(project_id)) with check (public.staff_can_manage_project(project_id));

create policy "documents project read" on public.project_documents for select using (public.user_can_access_project(project_id));
create policy "documents project insert" on public.project_documents for insert with check (public.user_can_access_project(project_id));
create policy "documents staff update" on public.project_documents for update using (public.staff_can_manage_project(project_id)) with check (public.staff_can_manage_project(project_id));

create policy "versions project read" on public.project_document_versions for select using (
  exists (
    select 1 from public.project_documents pd
    where pd.id = document_id and public.user_can_access_project(pd.project_id)
  )
);
create policy "versions permitted insert" on public.project_document_versions for insert with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.project_documents pd
    where pd.id = document_id and public.user_can_access_project(pd.project_id)
  )
);
create policy "versions project update" on public.project_document_versions for update using (
  exists (
    select 1 from public.project_documents pd
    where pd.id = document_id and public.user_can_access_project(pd.project_id)
  )
) with check (
  exists (
    select 1 from public.project_documents pd
    where pd.id = document_id and public.user_can_access_project(pd.project_id)
  )
);

create policy "comments visibility read" on public.project_comments for select using (
  public.user_can_access_project(project_id)
  and (visibility = 'shared' or public.current_user_role() in ('staff', 'approver', 'admin'))
);
create policy "comments permitted insert" on public.project_comments for insert with check (
  author_id = auth.uid()
  and public.user_can_access_project(project_id)
  and (visibility = 'shared' or public.current_user_role() in ('staff', 'approver', 'admin'))
);
create policy "comments author update unlocked" on public.project_comments for update using (
  author_id = auth.uid() and locked_at is null
) with check (
  author_id = auth.uid() and locked_at is null
);

create policy "workflow templates read" on public.workflow_templates for select using (auth.uid() is not null);
create policy "workflow templates admin manage" on public.workflow_templates for all using (public.is_admin()) with check (public.is_admin());
create policy "workflow template steps read" on public.workflow_template_steps for select using (auth.uid() is not null);
create policy "workflow template steps admin manage" on public.workflow_template_steps for all using (public.is_admin()) with check (public.is_admin());

create policy "workflow steps project read" on public.workflow_steps for select using (public.user_can_access_project(project_id));
create policy "workflow steps staff manage" on public.workflow_steps for all using (public.staff_can_manage_project(project_id)) with check (public.staff_can_manage_project(project_id));

create policy "workflow assignments read" on public.workflow_assignments for select using (
  approver_id = auth.uid()
  or exists (
    select 1 from public.workflow_steps ws
    where ws.id = workflow_step_id and public.user_can_access_project(ws.project_id)
  )
);
create policy "workflow assignments staff manage" on public.workflow_assignments for all using (
  exists (
    select 1 from public.workflow_steps ws
    where ws.id = workflow_step_id and public.staff_can_manage_project(ws.project_id)
  )
) with check (
  exists (
    select 1 from public.workflow_steps ws
    where ws.id = workflow_step_id and public.staff_can_manage_project(ws.project_id)
  )
);
create policy "workflow assignments self open" on public.workflow_assignments for update using (
  approver_id = auth.uid() and status in ('waiting', 'opened')
) with check (
  approver_id = auth.uid()
);

create policy "approval actions project read" on public.approval_actions for select using (public.user_can_access_project(project_id));
create policy "approval actions self insert" on public.approval_actions for insert with check (
  approver_id = auth.uid()
  and exists (
    select 1 from public.workflow_assignments wa
    join public.workflow_steps ws on ws.id = wa.workflow_step_id
    where wa.id = assignment_id
      and wa.approver_id = auth.uid()
      and wa.invalidated_at is null
      and wa.completed_at is null
      and ws.status = 'in_progress'
  )
);

create policy "approval invalidations project read" on public.approval_action_invalidations for select using (public.user_can_access_project(project_id));
create policy "approval invalidations staff insert" on public.approval_action_invalidations for insert with check (public.staff_can_manage_project(project_id));

create policy "certificates project read" on public.certificates for select using (public.user_can_access_project(project_id));
create policy "certificates staff insert" on public.certificates for insert with check (public.staff_can_manage_project(project_id));

create policy "workflow change log read" on public.workflow_change_log for select using (public.user_can_access_project(project_id));
create policy "workflow change log staff insert" on public.workflow_change_log for insert with check (public.staff_can_manage_project(project_id));

create policy "revision requests read" on public.revision_requests for select using (public.user_can_access_project(project_id));
create policy "revision requests permitted insert" on public.revision_requests for insert with check (
  requested_by = auth.uid() and public.current_user_role() in ('staff', 'approver', 'admin') and public.user_can_access_project(project_id)
);
create policy "revision requests staff update" on public.revision_requests for update using (public.staff_can_manage_project(project_id)) with check (public.staff_can_manage_project(project_id));

create policy "notification logs own staff read" on public.notification_logs for select using (
  recipient_id = auth.uid() or public.current_user_role() in ('staff', 'admin')
);
create policy "notification logs staff insert" on public.notification_logs for insert with check (
  recipient_id = auth.uid() or public.current_user_role() in ('staff', 'admin')
);

create policy "reminder rules read" on public.reminder_rules for select using (auth.uid() is not null);
create policy "reminder rules admin manage" on public.reminder_rules for all using (public.is_admin()) with check (public.is_admin());
create policy "reminder events project read" on public.reminder_events for select using (
  exists (
    select 1 from public.workflow_assignments wa
    join public.workflow_steps ws on ws.id = wa.workflow_step_id
    where wa.id = assignment_id and public.user_can_access_project(ws.project_id)
  )
);
create policy "reminder events staff insert" on public.reminder_events for insert with check (public.current_user_role() in ('staff', 'admin'));

create policy "audit logs admin staff read" on public.audit_logs for select using (public.current_user_role() in ('staff', 'admin'));
create policy "audit logs authenticated insert" on public.audit_logs for insert with check (auth.uid() is not null);

create policy "settings admin read" on public.system_settings for select using (public.is_admin());
create policy "settings admin manage" on public.system_settings for all using (public.is_admin()) with check (public.is_admin());

insert into public.reminder_rules (
  name,
  unopened_after_days,
  no_action_after_days,
  staff_notice_after_days,
  escalation_after_days,
  repeat_escalation_every_days,
  due_soon_before_days,
  is_default
)
values ('Default ISE reminder policy', 2, 4, 7, 10, 3, 1, true);

insert into public.project_types (name, description)
values
  ('Senior Project', 'Final-year student project'),
  ('Capstone', 'Capstone design or applied engineering project'),
  ('Research Proposal', 'Research or thesis proposal')
on conflict (name) do nothing;

insert into public.organizational_units (name, code)
values
  ('ISE', 'ISE'),
  ('Academic Affairs', 'AA'),
  ('Finance', 'FIN'),
  ('Information and Communication Engineering', 'ICE'),
  ('Aerospace Engineering', 'AERO')
on conflict (code) do nothing;

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
