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
  v_was_submitted boolean := false;
  v_now timestamptz := now();
  v_before_state jsonb := '[]'::jsonb;
  v_after_state jsonb := '[]'::jsonb;
  v_change_type text := 'workflow.updated_by_student';
  v_signer_only boolean := false;
  v_offset integer := 0;
  v_row record;
  v_step_id uuid;
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

  if v_project.status::text not in ('draft', 'submitted', 'approval_pending') then
    raise exception 'This workflow can no longer be edited.';
  end if;

  select count(*)
    into v_action_count
    from public.approval_actions
    where project_id = p_project_id;

  if v_action_count > 0 then
    raise exception 'The workflow can no longer be edited because approval has already started.';
  end if;

  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 2 then
    raise exception 'The workflow must include Staff Review followed by Faculty Approval.';
  end if;

  drop table if exists pg_temp.student_workflow_input;
  create temporary table student_workflow_input (
    final_order integer not null,
    step_id uuid,
    role_type text not null,
    step_name text not null,
    completion_rule text not null,
    minimum_approvals integer,
    due_at timestamptz,
    approver_ids_json jsonb not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_assignments;
  create temporary table student_workflow_assignments (
    final_order integer not null,
    approver_id uuid not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_existing;
  create temporary table student_workflow_existing (
    id uuid not null,
    step_order integer not null,
    certification_required boolean not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_step_map;
  create temporary table student_workflow_step_map (
    final_order integer not null,
    workflow_step_id uuid not null
  ) on commit drop;

  drop table if exists pg_temp.student_workflow_notify_assignments;
  create temporary table student_workflow_notify_assignments (
    assignment_id uuid not null
  ) on commit drop;

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
    step_name,
    completion_rule,
    minimum_approvals,
    due_at,
    approver_ids_json
  )
  select
    ordinality::integer,
    case
      when nullif(step ->> 'id', '') is null then null
      else (step ->> 'id')::uuid
    end,
    lower(coalesce(step ->> 'role', '')),
    case
      when nullif(btrim(coalesce(step ->> 'name', '')), '') is not null
        then left(btrim(step ->> 'name'), 160)
      when lower(coalesce(step ->> 'role', '')) = 'staff'
        then 'Staff Review'
      when lower(coalesce(step ->> 'role', '')) = 'approver'
        then 'Faculty Approval'
      else 'Workflow Step'
    end,
    lower(coalesce(step ->> 'completionRule', '')),
    case
      when nullif(step ->> 'minimumApprovals', '') is null then null
      else (step ->> 'minimumApprovals')::integer
    end,
    case
      when nullif(step ->> 'dueAt', '') is null then null
      else (step ->> 'dueAt')::timestamptz
    end,
    coalesce(step -> 'approverIds', '[]'::jsonb)
  from jsonb_array_elements(p_steps) with ordinality as payload(step, ordinality);

  if exists (
    select 1 from pg_temp.student_workflow_input
    where role_type not in ('staff', 'approver')
      or completion_rule not in ('all', 'any', 'minimum')
      or jsonb_typeof(approver_ids_json) <> 'array'
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  if not exists (select 1 from pg_temp.student_workflow_input where role_type = 'staff') then
    raise exception 'At least one Staff Review step is required.';
  end if;

  if not exists (select 1 from pg_temp.student_workflow_input where role_type = 'approver') then
    raise exception 'At least one Faculty Approval step is required.';
  end if;

  if (
    select min(final_order) from pg_temp.student_workflow_input where role_type = 'approver'
  ) < (
    select min(final_order) from pg_temp.student_workflow_input where role_type = 'staff'
  ) then
    raise exception 'Faculty Approval cannot occur before Staff Review.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    cross join lateral jsonb_array_elements_text(input.approver_ids_json) approver(approver_id)
    where not (approver.approver_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  insert into pg_temp.student_workflow_assignments (final_order, approver_id)
  select input.final_order, approver.approver_id::uuid
  from pg_temp.student_workflow_input input
  cross join lateral jsonb_array_elements_text(input.approver_ids_json) approver(approver_id);

  if exists (
    select 1
    from pg_temp.student_workflow_assignments
    group by final_order, approver_id
    having count(*) > 1
  ) then
    raise exception 'The workflow could not be saved because a step has duplicate approvers.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    left join pg_temp.student_workflow_assignments assignment on assignment.final_order = input.final_order
    where assignment.approver_id is null
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
      or profile.id = v_user_id
      or profile.role::text <> input.role_type
  ) then
    if exists (
      select 1
      from pg_temp.student_workflow_assignments assignment
      join pg_temp.student_workflow_input input on input.final_order = assignment.final_order
      left join public.profiles profile on profile.id = assignment.approver_id
      where input.role_type = 'staff'
        and (profile.id is null or profile.is_active is false or profile.id = v_user_id or profile.role::text <> 'staff')
    ) then
      raise exception 'The selected Staff member is no longer available.';
    end if;

    raise exception 'The selected Faculty Approver is no longer available.';
  end if;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    where input.completion_rule = 'minimum'
      and (
        input.minimum_approvals is null
        or input.minimum_approvals < 1
        or input.minimum_approvals > (
          select count(*)
          from pg_temp.student_workflow_assignments assignment
          where assignment.final_order = input.final_order
        )
      )
  ) then
    raise exception 'The workflow has an invalid minimum approval count.';
  end if;

  if exists (
    select 1
    from (
      select step_id
      from pg_temp.student_workflow_input
      where step_id is not null
      group by step_id
      having count(*) > 1
    ) duplicated
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  insert into pg_temp.student_workflow_existing (id, step_order, certification_required)
  select id, step_order, certification_required
  from public.workflow_steps
  where project_id = p_project_id;

  if exists (
    select 1
    from pg_temp.student_workflow_input input
    where input.step_id is not null
      and not exists (
        select 1 from pg_temp.student_workflow_existing existing where existing.id = input.step_id
      )
  ) then
    raise exception 'The workflow could not be saved. Reload the latest workflow and try again.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'name', step.name,
        'order', step.step_order,
        'completionRule', step.completion_rule,
        'minimumApprovals', step.minimum_approvals,
        'approverIds', coalesce(assignment.approver_ids, '[]'::jsonb)
      )
      order by step.step_order
    ),
    '[]'::jsonb
  )
    into v_before_state
    from public.workflow_steps step
    left join lateral (
      select jsonb_agg(workflow_assignment.approver_id order by workflow_assignment.approver_id) as approver_ids
      from public.workflow_assignments workflow_assignment
      where workflow_assignment.workflow_step_id = step.id
    ) assignment on true
    where step.project_id = p_project_id;

  v_was_submitted := v_project.status::text in ('submitted', 'approval_pending');

  select
    (select count(*) from pg_temp.student_workflow_existing) > 0
    and p_intent is distinct from 'restore_default'
    and (select count(*) from pg_temp.student_workflow_existing) = (select count(*) from pg_temp.student_workflow_input)
    and not exists (
      select 1
      from pg_temp.student_workflow_input input
      left join pg_temp.student_workflow_existing existing
        on existing.id = input.step_id
        and existing.step_order = input.final_order
        and existing.certification_required = (input.role_type = 'approver')
      where input.step_id is null or existing.id is null
    )
    into v_signer_only;

  if (select count(*) from pg_temp.student_workflow_existing) = 0 then
    v_change_type := 'workflow.created_by_student';
  elsif v_signer_only then
    v_change_type := 'workflow.approvers_changed_by_student';
  elsif p_intent = 'restore_default' then
    v_change_type := 'workflow.restored_to_default';
  else
    v_change_type := 'workflow.updated_by_student';
  end if;

  if v_signer_only then
    update public.workflow_steps step
      set name = input.step_name,
          status = case
            when v_was_submitted and input.final_order = 1 then 'in_progress'::public.workflow_step_status
            when v_was_submitted then 'waiting'::public.workflow_step_status
            else 'not_started'::public.workflow_step_status
          end,
          completion_rule = input.completion_rule::public.completion_rule,
          minimum_approvals = case when input.completion_rule = 'minimum' then input.minimum_approvals else null end,
          certification_required = input.role_type = 'approver',
          revision_allowed = true,
          due_at = input.due_at,
          activated_at = case
            when v_was_submitted and input.final_order = 1 then coalesce(step.activated_at, v_now)
            else null
          end,
          started_at = case
            when v_was_submitted and input.final_order = 1 then coalesce(step.started_at, v_now)
            else null
          end,
          completed_at = null,
          updated_at = v_now
      from pg_temp.student_workflow_input input
      where step.id = input.step_id
        and step.project_id = p_project_id;

    delete from public.workflow_assignments assignment
      using public.workflow_steps step
      where assignment.workflow_step_id = step.id
        and step.project_id = p_project_id
        and not exists (
          select 1
          from pg_temp.student_workflow_input input
          join pg_temp.student_workflow_assignments wanted
            on wanted.final_order = input.final_order
          where input.step_id = step.id
            and wanted.approver_id = assignment.approver_id
        );

    update public.workflow_assignments assignment
      set due_at = input.due_at,
          status = case
            when v_was_submitted and input.final_order = 1 and assignment.status in ('waiting', 'opened') then assignment.status
            else 'waiting'
          end,
          updated_at = v_now
      from public.workflow_steps step
      join pg_temp.student_workflow_input input on input.step_id = step.id
      join pg_temp.student_workflow_assignments wanted on wanted.final_order = input.final_order
      where assignment.workflow_step_id = step.id
        and assignment.approver_id = wanted.approver_id
        and step.project_id = p_project_id;

    with inserted as (
      insert into public.workflow_assignments (
        id,
        workflow_step_id,
        approver_id,
        status,
        due_at,
        created_by
      )
      select gen_random_uuid(),
        input.step_id,
        wanted.approver_id,
        'waiting',
        input.due_at,
        v_user_id
      from pg_temp.student_workflow_input input
      join pg_temp.student_workflow_assignments wanted on wanted.final_order = input.final_order
      where not exists (
        select 1
        from public.workflow_assignments assignment
        where assignment.workflow_step_id = input.step_id
          and assignment.approver_id = wanted.approver_id
          and assignment.invalidated_at is null
      )
      returning id, workflow_step_id
    )
    insert into pg_temp.student_workflow_notify_assignments (assignment_id)
    select inserted.id
    from inserted
    join public.workflow_steps step on step.id = inserted.workflow_step_id
    where v_was_submitted and step.step_order = 1;
  else
    select coalesce(max(step_order), 0) + jsonb_array_length(p_steps) + 100
      into v_offset
      from public.workflow_steps
      where project_id = p_project_id;

    update public.workflow_steps
      set step_order = step_order + v_offset,
          updated_at = v_now
      where project_id = p_project_id;

    delete from public.workflow_steps step
      where step.project_id = p_project_id
        and not exists (
          select 1
          from pg_temp.student_workflow_input input
          where input.step_id = step.id
        );

    for v_row in
      select * from pg_temp.student_workflow_input order by final_order
    loop
      if v_row.step_id is not null then
        update public.workflow_steps
          set name = v_row.step_name,
              step_order = v_row.final_order,
              mode = 'parallel'::public.step_mode,
              status = case
                when v_was_submitted and v_row.final_order = 1 then 'in_progress'::public.workflow_step_status
                when v_was_submitted then 'waiting'::public.workflow_step_status
                else 'not_started'::public.workflow_step_status
              end,
              completion_rule = v_row.completion_rule::public.completion_rule,
              minimum_approvals = case when v_row.completion_rule = 'minimum' then v_row.minimum_approvals else null end,
              certification_required = v_row.role_type = 'approver',
              revision_allowed = true,
              due_at = v_row.due_at,
              activated_at = case when v_was_submitted and v_row.final_order = 1 then v_now else null end,
              started_at = case when v_was_submitted and v_row.final_order = 1 then v_now else null end,
              completed_at = null,
              updated_at = v_now
          where id = v_row.step_id
            and project_id = p_project_id;
        v_step_id := v_row.step_id;
      else
        v_step_id := gen_random_uuid();
        insert into public.workflow_steps (
          id,
          project_id,
          name,
          step_order,
          mode,
          status,
          completion_rule,
          minimum_approvals,
          certification_required,
          revision_allowed,
          due_at,
          activated_at,
          started_at,
          created_by
        ) values (
          v_step_id,
          p_project_id,
          v_row.step_name,
          v_row.final_order,
          'parallel',
          case
            when v_was_submitted and v_row.final_order = 1 then 'in_progress'::public.workflow_step_status
            when v_was_submitted then 'waiting'::public.workflow_step_status
            else 'not_started'::public.workflow_step_status
          end,
          v_row.completion_rule::public.completion_rule,
          case when v_row.completion_rule = 'minimum' then v_row.minimum_approvals else null end,
          v_row.role_type = 'approver',
          true,
          v_row.due_at,
          case when v_was_submitted and v_row.final_order = 1 then v_now else null end,
          case when v_was_submitted and v_row.final_order = 1 then v_now else null end,
          v_user_id
        );
      end if;

      insert into pg_temp.student_workflow_step_map (final_order, workflow_step_id)
      values (v_row.final_order, v_step_id);
    end loop;

    delete from public.workflow_assignments assignment
      using public.workflow_steps step
      where assignment.workflow_step_id = step.id
        and step.project_id = p_project_id;

    with inserted as (
      insert into public.workflow_assignments (
        id,
        workflow_step_id,
        approver_id,
        status,
        due_at,
        created_by
      )
      select gen_random_uuid(),
        step_map.workflow_step_id,
        assignment.approver_id,
        'waiting',
        input.due_at,
        v_user_id
      from pg_temp.student_workflow_assignments assignment
      join pg_temp.student_workflow_input input on input.final_order = assignment.final_order
      join pg_temp.student_workflow_step_map step_map on step_map.final_order = assignment.final_order
      returning id, workflow_step_id
    )
    insert into pg_temp.student_workflow_notify_assignments (assignment_id)
    select inserted.id
    from inserted
    join public.workflow_steps step on step.id = inserted.workflow_step_id
    where v_was_submitted and step.step_order = 1;
  end if;

  if v_was_submitted then
    update public.projects
      set status = 'approval_pending'::public.project_status,
          updated_at = v_now
      where id = p_project_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'name', step.name,
        'roleType', case when step.certification_required then 'approver' else 'staff' end,
        'order', step.step_order,
        'completionRule', step.completion_rule,
        'minimumApprovals', step.minimum_approvals,
        'approverIds', coalesce(assignment.approver_ids, '[]'::jsonb)
      )
      order by step.step_order
    ),
    '[]'::jsonb
  )
    into v_after_state
    from public.workflow_steps step
    left join lateral (
      select jsonb_agg(workflow_assignment.approver_id order by workflow_assignment.approver_id) as approver_ids
      from public.workflow_assignments workflow_assignment
      where workflow_assignment.workflow_step_id = step.id
    ) assignment on true
    where step.project_id = p_project_id;

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
    v_change_type,
    case when v_signer_only then 'Student changed workflow approvers.' else 'Student changed workflow structure.' end,
    v_before_state,
    v_after_state,
    v_user_id
  );

  return jsonb_build_object(
    'changeType', v_change_type,
    'signerOnly', v_signer_only,
    'beforeState', v_before_state,
    'afterState', v_after_state,
    'notifyAssignmentIds', coalesce(
      (
        select jsonb_agg(assignment_id)
        from pg_temp.student_workflow_notify_assignments
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.save_student_project_workflow(uuid, jsonb, text) to authenticated;
