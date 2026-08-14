do $$
declare
  v_constraint_name text;
begin
  select fk.conname
    into v_constraint_name
    from pg_constraint fk
    join pg_attribute attribute
      on attribute.attrelid = fk.conrelid
      and attribute.attnum = any(fk.conkey)
    where fk.conrelid = 'public.workflow_change_log'::regclass
      and fk.confrelid = 'public.workflow_steps'::regclass
      and fk.contype = 'f'
      and attribute.attname = 'workflow_step_id'
    limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.workflow_change_log drop constraint %I', v_constraint_name);
  end if;
end $$;

comment on column public.workflow_change_log.workflow_step_id is
  'Historical workflow step UUID captured for audit context. Not an operational foreign key because workflow_change_log is immutable append-only history.';

create or replace function public.save_student_project_workflow(
  p_project_id uuid,
  p_steps jsonb,
  p_intent text default 'save'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project record;
  v_action_count integer := 0;
  v_now timestamptz := now();
  v_before_state jsonb := '[]'::jsonb;
  v_after_state jsonb := '[]'::jsonb;
  v_notify_assignment_ids jsonb := '[]'::jsonb;
  v_offset integer := 10000;
  v_existing_step_count integer := 0;
  v_input_step_count integer := 0;
  v_input_existing_id_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save this workflow.';
  end if;

  select id, status, student_id
    into v_project
    from public.projects
    where id = p_project_id
    for update;

  if not found or v_project.student_id <> v_user_id then
    raise exception 'You can edit only your own project workflow.';
  end if;

  if v_project.status::text not in ('draft', 'submitted', 'approval_pending', 'revision_required') then
    raise exception 'This workflow can no longer be edited.';
  end if;

  select count(*)
    into v_action_count
    from public.approval_actions
    where project_id = p_project_id;

  if v_action_count > 0 then
    raise exception 'The workflow can no longer be edited because approval has already started.';
  end if;

  if coalesce(jsonb_typeof(p_steps), '') <> 'array' or jsonb_array_length(p_steps) < 1 then
    raise exception 'The workflow must contain at least one approval step.';
  end if;

  drop table if exists pg_temp.student_workflow_input;
  create temporary table student_workflow_input (
    final_order integer not null,
    step_id uuid,
    role_type text not null,
    assignment_mode text not null,
    step_name text not null,
    completion_rule text not null,
    minimum_approvals integer,
    requires_signature boolean not null,
    due_at timestamptz,
    approver_ids_json jsonb not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_assignments;
  create temporary table student_workflow_assignments (
    final_order integer not null,
    approver_id uuid not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_step_map;
  create temporary table student_workflow_step_map (
    final_order integer not null,
    workflow_step_id uuid not null
  ) on commit drop;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', step.id,
      'name', step.name,
      'order', step.step_order,
      'role', step.assignee_role,
      'assignmentMode', step.assignment_mode,
      'requiresSignature', step.certification_required,
      'approverIds', coalesce((
        select jsonb_agg(assignment.approver_id order by assignment.approver_id)
        from public.workflow_assignments assignment
        where assignment.workflow_step_id = step.id
      ), '[]'::jsonb)
    )
    order by step.step_order
  ), '[]'::jsonb)
    into v_before_state
    from public.workflow_steps step
    where step.project_id = p_project_id;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) step
    where step ? 'id'
      and nullif(step ->> 'id', '') is not null
      and not ((step ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  insert into pg_temp.student_workflow_input (
    final_order,
    step_id,
    role_type,
    assignment_mode,
    step_name,
    completion_rule,
    minimum_approvals,
    requires_signature,
    due_at,
    approver_ids_json
  )
  select
    ordinality::integer,
    case when nullif(step ->> 'id', '') is null then null else (step ->> 'id')::uuid end,
    lower(coalesce(step ->> 'role', '')),
    case
      when coalesce(step ->> 'assignmentMode', step ->> 'selectionMode', '') in ('any_active_role', 'pool') then 'any_active_role'
      when coalesce(step ->> 'assignmentMode', step ->> 'selectionMode', '') in ('specific_users', 'specific') then 'specific_users'
      else ''
    end,
    case
      when nullif(btrim(coalesce(step ->> 'name', '')), '') is not null then left(btrim(step ->> 'name'), 160)
      when lower(coalesce(step ->> 'role', '')) = 'staff' then 'Staff Review'
      when lower(coalesce(step ->> 'role', '')) = 'approver' then 'Faculty Approval'
      else 'Workflow Step'
    end,
    lower(coalesce(step ->> 'completionRule', '')),
    case
      when nullif(step ->> 'minimumApprovals', '') is null then null
      else (step ->> 'minimumApprovals')::integer
    end,
    coalesce(
      (step ->> 'requiresSignature')::boolean,
      (step ->> 'certificationRequired')::boolean,
      false
    ),
    case when nullif(step ->> 'dueAt', '') is null then null else (step ->> 'dueAt')::timestamptz end,
    case when jsonb_typeof(step -> 'approverIds') = 'array' then step -> 'approverIds' else '[]'::jsonb end
  from jsonb_array_elements(p_steps) with ordinality as item(step, ordinality);

  if exists (select 1 from pg_temp.student_workflow_input where role_type not in ('staff', 'approver', 'admin')) then
    raise exception 'Each workflow step must choose Staff, Faculty Approver, or Admin.';
  end if;

  if exists (select 1 from pg_temp.student_workflow_input where assignment_mode not in ('any_active_role', 'specific_users')) then
    raise exception 'Each workflow step needs a valid assignment mode.';
  end if;

  if exists (select 1 from pg_temp.student_workflow_input where completion_rule not in ('any', 'all', 'minimum')) then
    raise exception 'The workflow has an invalid completion rule.';
  end if;

  select count(*)
    into v_existing_step_count
    from public.workflow_steps
    where project_id = p_project_id;

  select count(*),
         count(*) filter (where step_id is not null)
    into v_input_step_count,
         v_input_existing_id_count
    from pg_temp.student_workflow_input;

  if v_existing_step_count > 0
    and v_input_step_count = v_existing_step_count
    and (
      coalesce(p_intent, 'save') = 'restore_default'
      or v_input_existing_id_count = 0
    )
  then
    update pg_temp.student_workflow_input input
      set step_id = step.id
      from public.workflow_steps step
      where input.step_id is null
        and step.project_id = p_project_id
        and step.step_order = input.final_order;

    select count(*) filter (where step_id is not null)
      into v_input_existing_id_count
      from pg_temp.student_workflow_input;
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    where input.step_id is not null
      and not exists (
        select 1
        from public.workflow_steps existing
        where existing.id = input.step_id
          and existing.project_id = p_project_id
      )
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  if v_existing_step_count > 0
    and coalesce(p_intent, 'save') <> 'restore_default'
    and v_input_existing_id_count = 0
  then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  if v_existing_step_count > 0
    and v_input_step_count <= v_existing_step_count
    and exists (select 1 from pg_temp.student_workflow_input where step_id is null)
  then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    cross join lateral jsonb_array_elements(input.approver_ids_json) approver(value)
    where input.assignment_mode = 'specific_users'
      and not ((approver.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'A workflow step includes an invalid approver.';
  end if;

  insert into pg_temp.student_workflow_assignments (final_order, approver_id)
  select input.final_order, profile.id
  from pg_temp.student_workflow_input input
  join public.profiles profile on profile.role::text = input.role_type
  where input.assignment_mode = 'any_active_role'
    and profile.is_active is not false
    and profile.role::text in ('staff', 'approver', 'admin')
    and profile.id <> v_project.student_id;

  insert into pg_temp.student_workflow_assignments (final_order, approver_id)
  select input.final_order, (approver.value #>> '{}')::uuid
  from pg_temp.student_workflow_input input
  cross join lateral jsonb_array_elements(input.approver_ids_json) approver(value)
  where input.assignment_mode = 'specific_users';

  if exists (
    select 1
    from (
      select final_order, approver_id, count(*) as duplicate_count
      from pg_temp.student_workflow_assignments
      group by final_order, approver_id
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'The workflow could not be saved because a step has duplicate approvers.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    left join pg_temp.student_workflow_assignments assignment on assignment.final_order = input.final_order
    group by input.final_order
    having count(assignment.approver_id) = 0
  ) then
    raise exception 'Each workflow step needs at least one active approver.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_assignments assignment
    join pg_temp.student_workflow_input input on input.final_order = assignment.final_order
    left join public.profiles profile on profile.id = assignment.approver_id
    where profile.id is null
      or profile.is_active is false
      or profile.role::text <> input.role_type
      or profile.role::text = 'student'
      or profile.id = v_project.student_id
  ) then
    raise exception 'A workflow step includes an invalid approver.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    join (
      select final_order, count(*) as approver_count
      from pg_temp.student_workflow_assignments
      group by final_order
    ) counts on counts.final_order = input.final_order
    where input.completion_rule = 'minimum'
      and (
        input.minimum_approvals is null
        or input.minimum_approvals < 1
        or input.minimum_approvals > counts.approver_count
      )
  ) then
    raise exception 'The workflow has an invalid minimum approval count.';
  end if;

  update public.workflow_steps step
    set step_order = input.final_order + v_offset,
        updated_at = v_now
    from pg_temp.student_workflow_input input
    where step.id = input.step_id
      and step.project_id = p_project_id;

  delete from public.workflow_assignments assignment
    using public.workflow_steps step
    where assignment.workflow_step_id = step.id
      and step.project_id = p_project_id;

  delete from public.workflow_steps step
    where step.project_id = p_project_id
      and not exists (
        select 1
        from pg_temp.student_workflow_input input
        where input.step_id = step.id
      );

  update public.workflow_steps step
    set name = input.step_name,
        step_order = input.final_order,
        assignee_role = input.role_type::public.app_role,
        assignment_mode = input.assignment_mode,
        mode = 'parallel'::public.step_mode,
        status = case
          when v_project.status::text in ('submitted', 'approval_pending', 'revision_required') and input.final_order = 1 then 'in_progress'::public.workflow_step_status
          when v_project.status::text in ('submitted', 'approval_pending', 'revision_required') then 'waiting'::public.workflow_step_status
          else 'not_started'::public.workflow_step_status
        end,
        completion_rule = input.completion_rule::public.completion_rule,
        minimum_approvals = case when input.completion_rule = 'minimum' then input.minimum_approvals else null end,
        certification_required = input.requires_signature,
        revision_allowed = true,
        due_at = input.due_at,
        completed_at = null,
        updated_at = v_now
    from pg_temp.student_workflow_input input
    where step.id = input.step_id
      and step.project_id = p_project_id;

  insert into pg_temp.student_workflow_step_map (final_order, workflow_step_id)
  select input.final_order, input.step_id
  from pg_temp.student_workflow_input input
  where input.step_id is not null;

  with inserted as (
    insert into public.workflow_steps (
      id,
      project_id,
      name,
      step_order,
      assignee_role,
      assignment_mode,
      mode,
      status,
      completion_rule,
      minimum_approvals,
      certification_required,
      revision_allowed,
      due_at,
      created_by
    )
    select
      gen_random_uuid(),
      p_project_id,
      input.step_name,
      input.final_order,
      input.role_type::public.app_role,
      input.assignment_mode,
      'parallel'::public.step_mode,
      case
        when v_project.status::text in ('submitted', 'approval_pending', 'revision_required') and input.final_order = 1 then 'in_progress'::public.workflow_step_status
        when v_project.status::text in ('submitted', 'approval_pending', 'revision_required') then 'waiting'::public.workflow_step_status
        else 'not_started'::public.workflow_step_status
      end,
      input.completion_rule::public.completion_rule,
      case when input.completion_rule = 'minimum' then input.minimum_approvals else null end,
      input.requires_signature,
      true,
      input.due_at,
      v_user_id
    from pg_temp.student_workflow_input input
    where input.step_id is null
    order by input.final_order
    returning step_order, id
  )
  insert into pg_temp.student_workflow_step_map (final_order, workflow_step_id)
  select inserted.step_order, inserted.id
  from inserted;

  insert into public.workflow_assignments (
    workflow_step_id,
    approver_id,
    status,
    due_at,
    created_by
  )
  select
    step_map.workflow_step_id,
    assignment.approver_id,
    'waiting',
    input.due_at,
    v_user_id
  from pg_temp.student_workflow_assignments assignment
  join pg_temp.student_workflow_step_map step_map on step_map.final_order = assignment.final_order
  join pg_temp.student_workflow_input input on input.final_order = assignment.final_order;

  if v_project.status::text in ('submitted', 'approval_pending', 'revision_required') then
    update public.projects
    set status = 'approval_pending',
        updated_at = v_now
    where id = p_project_id;

    select coalesce(jsonb_agg(assignment.id), '[]'::jsonb)
      into v_notify_assignment_ids
      from public.workflow_assignments assignment
      join public.workflow_steps step on step.id = assignment.workflow_step_id
      where step.project_id = p_project_id
        and step.step_order = 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', step.id,
      'name', step.name,
      'order', step.step_order,
      'role', step.assignee_role,
      'assignmentMode', step.assignment_mode,
      'requiresSignature', step.certification_required,
      'approverIds', coalesce((
        select jsonb_agg(assignment.approver_id order by assignment.approver_id)
        from public.workflow_assignments assignment
        where assignment.workflow_step_id = step.id
      ), '[]'::jsonb)
    )
    order by step.step_order
  ), '[]'::jsonb)
    into v_after_state
    from public.workflow_steps step
    where step.project_id = p_project_id;

  insert into public.workflow_change_log (
    project_id,
    changed_by,
    change_type,
    reason,
    before_state,
    after_state,
    created_by
  )
  values (
    p_project_id,
    v_user_id,
    case when p_intent = 'restore_default' then 'workflow.default_restored_by_student' else 'workflow.updated_by_student' end,
    null,
    v_before_state,
    v_after_state,
    v_user_id
  );

  return jsonb_build_object(
    'changeType', case when p_intent = 'restore_default' then 'workflow.default_restored_by_student' else 'workflow.updated_by_student' end,
    'signerOnly', false,
    'beforeState', v_before_state,
    'afterState', v_after_state,
    'notifyAssignmentIds', v_notify_assignment_ids
  );
end;
$$;

revoke all on function public.save_student_project_workflow(uuid, jsonb, text) from public;
revoke all on function public.save_student_project_workflow(uuid, jsonb, text) from anon;
grant execute on function public.save_student_project_workflow(uuid, jsonb, text) to authenticated;
