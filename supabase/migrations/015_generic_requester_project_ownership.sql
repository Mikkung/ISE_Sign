alter table public.projects
  add column if not exists requester_id uuid references public.profiles(id),
  add column if not exists requester_name text,
  add column if not exists requester_type text,
  add column if not exists requester_organization text;

alter table public.projects
  drop constraint if exists projects_requester_email_exact_domain,
  drop constraint if exists projects_requester_email_prefix_matches_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_requester_type_allowed'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_requester_type_allowed
      check (
        requester_type is null
        or requester_type in ('student', 'staff', 'faculty', 'external', 'other')
      );
  end if;
end
$$;

update public.projects project
set requester_id = coalesce(project.requester_id, project.requester_auth_user_id, project.student_id),
    requester_auth_user_id = coalesce(project.requester_auth_user_id, project.requester_id, project.student_id),
    requester_name = coalesce(
      nullif(btrim(project.requester_name), ''),
      nullif(btrim(concat_ws(' ', project.requester_first_name, project.requester_last_name)), ''),
      profile.display_name,
      profile.email
    ),
    requester_email = coalesce(project.requester_email, profile.email),
    requester_type = coalesce(
      project.requester_type,
      case
        when project.requester_student_id is not null then 'student'
        when profile.role = 'approver'::public.app_role then 'faculty'
        when profile.role in ('staff'::public.app_role, 'admin'::public.app_role) then 'staff'
        else 'other'
      end
    ),
    requester_verified_at = coalesce(project.requester_verified_at, project.created_at)
from public.profiles profile
where profile.id = coalesce(project.requester_id, project.requester_auth_user_id, project.student_id)
  and (
    project.requester_id is null
    or project.requester_auth_user_id is null
    or project.requester_name is null
    or project.requester_email is null
    or project.requester_type is null
    or project.requester_verified_at is null
  );

create index if not exists projects_requester_idx on public.projects(requester_id);
create index if not exists projects_requester_type_idx on public.projects(requester_type);

create or replace function public.prevent_project_requester_identity_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.submitted_at is not null
    and (
      new.requester_id is distinct from old.requester_id
      or new.student_directory_id is distinct from old.student_directory_id
      or new.student_email_verification_id is distinct from old.student_email_verification_id
      or new.requester_student_id is distinct from old.requester_student_id
      or new.requester_email is distinct from old.requester_email
      or new.requester_first_name is distinct from old.requester_first_name
      or new.requester_last_name is distinct from old.requester_last_name
      or new.requester_name is distinct from old.requester_name
      or new.requester_type is distinct from old.requester_type
      or new.requester_organization is distinct from old.requester_organization
      or new.requester_verified_at is distinct from old.requester_verified_at
      or new.requester_auth_user_id is distinct from old.requester_auth_user_id
    )
  then
    raise exception 'Requester identity cannot be changed after submission.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_project_submission_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  directory_row public.student_directory%rowtype;
  v_owner_id uuid := coalesce(new.requester_id, new.student_id);
begin
  if new.requester_id is null then
    new.requester_id := new.student_id;
  end if;

  if new.requester_auth_user_id is null then
    new.requester_auth_user_id := new.requester_id;
  end if;

  if new.requester_name is null then
    new.requester_name := nullif(btrim(concat_ws(' ', new.requester_first_name, new.requester_last_name)), '');
  end if;

  if new.status in ('submitted', 'staff_review', 'staff_approved', 'approval_pending', 'partially_approved', 'approved', 'completed') then
    if new.start_date is null or new.end_date is null then
      raise exception 'Start Date and End Date are required before submission.';
    end if;

    if new.project_type_category is null then
      raise exception 'Project Type is required before submission.';
    end if;

    if v_owner_id is null
      or new.requester_id is null
      or new.requester_auth_user_id is null
      or new.requester_email is null
      or coalesce(nullif(btrim(new.requester_name), ''), nullif(btrim(concat_ws(' ', new.requester_first_name, new.requester_last_name)), '')) is null
      or new.requester_type is null
      or new.requester_verified_at is null
    then
      raise exception 'Authenticated requester identity is required before submission.';
    end if;

    if new.requester_auth_user_id <> new.requester_id then
      raise exception 'Authenticated requester does not match the project owner.';
    end if;

    if new.requester_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Requester email is invalid.';
    end if;

    if new.student_directory_id is not null then
      select *
      into directory_row
      from public.student_directory
      where id = new.student_directory_id;

      if not found
        or not directory_row.is_active
        or directory_row.student_id <> new.requester_student_id
        or directory_row.email <> new.requester_email
        or directory_row.first_name <> new.requester_first_name
        or directory_row.last_name <> new.requester_last_name
        or split_part(directory_row.email, '@', 1) <> directory_row.student_id
      then
        raise exception 'Authenticated student directory record is invalid or inactive.';
      end if;
    end if;
  end if;

  return new;
end;
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
        or p.requester_id = auth.uid()
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

drop policy if exists "students create own projects" on public.projects;
drop policy if exists "students edit allowed own projects" on public.projects;
drop policy if exists "requesters create own projects" on public.projects;
drop policy if exists "requesters edit allowed own projects" on public.projects;

create policy "requesters create own projects" on public.projects for insert with check (
  auth.uid() is not null
  and requester_id = auth.uid()
  and student_id = auth.uid()
  and requester_auth_user_id = auth.uid()
  and public.current_user_role() in ('student', 'staff', 'approver', 'admin')
);

create policy "requesters edit allowed own projects" on public.projects for update using (
  requester_id = auth.uid()
  and status in ('draft', 'revision_required')
) with check (
  requester_id = auth.uid()
  and status in ('draft', 'submitted', 'revision_required')
);

create or replace function public.cancel_project(
  p_project_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_actor_active boolean;
  v_project record;
  v_owner_id uuid;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_now timestamptz := now();
  v_cancelled_assignment_count integer := 0;
  v_cancelled_step_count integer := 0;
  v_certificate_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to cancel this project.';
  end if;

  if length(v_reason) < 5 then
    raise exception 'Provide a cancellation reason.';
  end if;

  select role, is_active
    into v_actor_role, v_actor_active
    from public.profiles
    where id = v_user_id;

  if v_actor_role is null or v_actor_active is false then
    raise exception 'You are not authorized to cancel this project.';
  end if;

  select id, title, status, student_id, requester_id
    into v_project
    from public.projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'Project not found.';
  end if;

  v_owner_id := coalesce(v_project.requester_id, v_project.student_id);

  if v_project.status = 'cancelled'::public.project_status then
    raise exception 'This project has already been cancelled.';
  end if;

  if v_project.status = 'completed'::public.project_status then
    raise exception 'This completed project cannot be cancelled.';
  end if;

  if v_project.status = 'rejected'::public.project_status then
    raise exception 'This rejected project cannot be cancelled.';
  end if;

  if v_actor_role <> 'admin'::public.app_role and v_owner_id <> v_user_id then
    raise exception 'You are not authorized to cancel this project.';
  end if;

  if v_project.status not in (
    'draft'::public.project_status,
    'submitted'::public.project_status,
    'staff_review'::public.project_status,
    'revision_required'::public.project_status,
    'staff_approved'::public.project_status,
    'approval_pending'::public.project_status,
    'partially_approved'::public.project_status
  ) then
    raise exception 'The project changed while the cancellation was being processed.';
  end if;

  select count(*)
    into v_certificate_count
    from public.certificates
    where project_id = p_project_id;

  if v_certificate_count > 0 then
    raise exception 'This completed project cannot be cancelled.';
  end if;

  create temporary table cancelled_project_assignments (
    assignment_id uuid not null,
    approver_id uuid not null
  ) on commit drop;

  insert into cancelled_project_assignments (assignment_id, approver_id)
  select assignment.id, assignment.approver_id
    from public.workflow_assignments assignment
    join public.workflow_steps step on step.id = assignment.workflow_step_id
    where step.project_id = p_project_id
      and assignment.status in ('waiting', 'opened')
      and assignment.completed_at is null
      and assignment.invalidated_at is null;

  update public.workflow_assignments assignment
    set status = 'cancelled',
        invalidated_at = v_now,
        invalidation_reason = 'Project cancelled',
        updated_at = v_now
    where assignment.id in (
      select cancelled.assignment_id
      from cancelled_project_assignments cancelled
    );

  get diagnostics v_cancelled_assignment_count = row_count;

  update public.workflow_steps step
    set status = 'skipped'::public.workflow_step_status,
        completed_at = v_now,
        updated_at = v_now
    where step.project_id = p_project_id
      and step.status not in (
        'completed'::public.workflow_step_status,
        'approved'::public.workflow_step_status,
        'rejected'::public.workflow_step_status,
        'skipped'::public.workflow_step_status
      );

  get diagnostics v_cancelled_step_count = row_count;

  update public.projects
    set status = 'cancelled'::public.project_status,
        cancelled_at = v_now,
        cancelled_by = v_user_id,
        cancellation_reason = v_reason,
        current_responsible = null,
        updated_at = v_now
    where id = p_project_id;

  insert into public.notification_logs (
    recipient_id,
    project_id,
    assignment_id,
    channel,
    type,
    subject,
    body,
    status,
    sent_at,
    dedupe_key,
    metadata,
    created_by
  )
  select
    cancelled.approver_id,
    p_project_id,
    cancelled.assignment_id,
    'in_app'::public.notification_channel,
    'project_cancelled',
    'Project cancelled',
    coalesce(v_project.title, 'Project') || ' was cancelled. Pending review and approval actions have stopped.',
    'sent',
    v_now,
    cancelled.assignment_id::text || ':project_cancelled:in_app',
    jsonb_build_object('projectId', p_project_id, 'cancelledAt', v_now),
    v_user_id
  from cancelled_project_assignments cancelled
  on conflict do nothing;

  insert into public.workflow_change_log (
    project_id,
    changed_by,
    change_type,
    reason,
    before_state,
    after_state,
    created_by
  ) values (
    p_project_id,
    v_user_id,
    'workflow.cancelled_due_to_project_cancellation',
    v_reason,
    jsonb_build_object('projectId', p_project_id, 'priorStatus', v_project.status, 'cancelledAt', v_now),
    jsonb_build_object(
      'projectStatus',
      'cancelled',
      'cancelledWorkflowStepCount',
      v_cancelled_step_count,
      'cancelledAssignmentCount',
      v_cancelled_assignment_count
    ),
    v_user_id
  );

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_by
  ) values (
    v_user_id,
    case
      when v_actor_role = 'admin'::public.app_role then 'project.cancelled_by_admin'
      else 'project.cancelled_by_requester'
    end,
    'project',
    p_project_id,
    jsonb_build_object(
      'projectId', p_project_id,
      'cancelledBy', v_user_id,
      'actorRole', v_actor_role,
      'reason', v_reason,
      'previousStatus', v_project.status,
      'cancelledAt', v_now,
      'affectedWorkflowStepCount', v_cancelled_step_count,
      'affectedAssignmentCount', v_cancelled_assignment_count
    ),
    v_user_id
  );

  return jsonb_build_object(
    'projectId', p_project_id,
    'cancelledAt', v_now,
    'previousStatus', v_project.status,
    'cancelledWorkflowStepCount', v_cancelled_step_count,
    'cancelledAssignmentCount', v_cancelled_assignment_count
  );
end;
$$;

revoke all on function public.cancel_project(uuid, text) from public;
revoke all on function public.cancel_project(uuid, text) from anon;
grant execute on function public.cancel_project(uuid, text) to authenticated;

grant execute on function public.prevent_project_requester_identity_changes() to authenticated;
grant execute on function public.validate_project_submission_requester() to authenticated;
revoke execute on function public.prevent_project_requester_identity_changes() from anon, public;
revoke execute on function public.validate_project_submission_requester() from anon, public;
