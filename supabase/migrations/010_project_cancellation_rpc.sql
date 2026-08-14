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

  select id, title, status, student_id
    into v_project
    from public.projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'Project not found.';
  end if;

  if v_project.status = 'cancelled'::public.project_status then
    raise exception 'This project has already been cancelled.';
  end if;

  if v_project.status = 'completed'::public.project_status then
    raise exception 'This completed project cannot be cancelled.';
  end if;

  if v_project.status = 'rejected'::public.project_status then
    raise exception 'This rejected project cannot be cancelled.';
  end if;

  if v_actor_role = 'student'::public.app_role and v_project.student_id <> v_user_id then
    raise exception 'You are not authorized to cancel this project.';
  end if;

  if v_actor_role not in ('student', 'admin') then
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
      else 'project.cancelled_by_student'
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
