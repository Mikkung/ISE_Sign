create or replace function public.admin_delete_test_projects(
  p_project_ids uuid[]
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
  v_now timestamptz := now();
  v_deleted_count integer := 0;
  v_document_count integer := 0;
  v_document_version_count integer := 0;
  v_workflow_step_count integer := 0;
  v_assignment_count integer := 0;
  v_approval_action_count integer := 0;
  v_comment_count integer := 0;
  v_notification_count integer := 0;
  v_revision_count integer := 0;
  v_certificate_count integer := 0;
  v_signature_stamp_count integer := 0;
  v_audit_count integer := 0;
  v_deleted_project_ids jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select role, is_active
    into v_actor_role, v_actor_active
    from public.profiles
    where id = v_user_id;

  if v_actor_role <> 'admin'::public.app_role or v_actor_active is false then
    raise exception 'Admin role is required.';
  end if;

  if p_project_ids is null or cardinality(p_project_ids) = 0 then
    raise exception 'Select at least one project.';
  end if;

  drop table if exists pg_temp.cleanup_selected_projects;
  drop table if exists pg_temp.cleanup_projects;
  drop table if exists pg_temp.cleanup_documents;
  drop table if exists pg_temp.cleanup_document_versions;
  drop table if exists pg_temp.cleanup_workflow_steps;
  drop table if exists pg_temp.cleanup_assignments;
  drop table if exists pg_temp.cleanup_approval_actions;
  drop table if exists pg_temp.cleanup_student_email_verifications;

  create temporary table cleanup_selected_projects (
    project_id uuid primary key
  ) on commit drop;

  insert into cleanup_selected_projects (project_id)
  select distinct project_id
  from unnest(p_project_ids) as selected(project_id)
  where project_id is not null;

  create temporary table cleanup_projects on commit drop as
  select project.id
  from public.projects project
  join cleanup_selected_projects selected on selected.project_id = project.id
  for update of project;

  if not exists (select 1 from cleanup_projects) then
    return jsonb_build_object(
      'deletedProjectIds', '[]'::jsonb,
      'deletedCount', 0,
      'performedBy', v_user_id,
      'performedAt', v_now
    );
  end if;

  create temporary table cleanup_documents on commit drop as
  select document.id, document.project_id
  from public.project_documents document
  join cleanup_projects project on project.id = document.project_id;

  create temporary table cleanup_document_versions on commit drop as
  select version.id, version.document_id
  from public.project_document_versions version
  join cleanup_documents document on document.id = version.document_id;

  create temporary table cleanup_workflow_steps on commit drop as
  select step.id, step.project_id
  from public.workflow_steps step
  join cleanup_projects project on project.id = step.project_id;

  create temporary table cleanup_assignments on commit drop as
  select assignment.id, assignment.workflow_step_id
  from public.workflow_assignments assignment
  join cleanup_workflow_steps step on step.id = assignment.workflow_step_id;

  create temporary table cleanup_approval_actions on commit drop as
  select action.id
  from public.approval_actions action
  join cleanup_projects project on project.id = action.project_id;

  create temporary table cleanup_student_email_verifications on commit drop as
  select verification.id
  from public.student_email_verifications verification
  join cleanup_projects project on project.id = verification.project_id;

  select count(*) into v_deleted_count from cleanup_projects;
  select count(*) into v_document_count from cleanup_documents;
  select count(*) into v_document_version_count from cleanup_document_versions;
  select count(*) into v_workflow_step_count from cleanup_workflow_steps;
  select count(*) into v_assignment_count from cleanup_assignments;
  select count(*) into v_approval_action_count from cleanup_approval_actions;
  select count(*) into v_comment_count from public.project_comments comment join cleanup_projects project on project.id = comment.project_id;
  select count(*) into v_notification_count from public.notification_logs notification join cleanup_projects project on project.id = notification.project_id;
  select count(*) into v_revision_count from public.revision_requests revision join cleanup_projects project on project.id = revision.project_id;
  select count(*) into v_certificate_count from public.certificates certificate join cleanup_projects project on project.id = certificate.project_id;
  select count(*) into v_signature_stamp_count
  from public.approval_signature_stamps stamp
  where exists (select 1 from cleanup_approval_actions action where action.id = stamp.approval_action_id)
     or exists (select 1 from cleanup_assignments assignment where assignment.id = stamp.assignment_id)
     or exists (select 1 from cleanup_document_versions version where version.id = stamp.source_document_version_id)
     or exists (select 1 from cleanup_document_versions version where version.id = stamp.signed_document_version_id);
  select count(*) into v_audit_count
  from public.audit_logs audit
  where exists (select 1 from cleanup_projects project where project.id = audit.entity_id)
     or exists (select 1 from cleanup_projects project where audit.metadata ->> 'projectId' = project.id::text);
  select jsonb_agg(id order by id) into v_deleted_project_ids from cleanup_projects;

  alter table public.approval_signature_stamps disable trigger approval_signature_stamps_append_only;
  alter table public.approval_action_invalidations disable trigger approval_action_invalidations_append_only;
  alter table public.approval_actions disable trigger approval_actions_append_only;
  alter table public.certificates disable trigger certificates_append_only;
  alter table public.audit_logs disable trigger audit_logs_append_only;
  alter table public.workflow_change_log disable trigger workflow_change_log_append_only;

  begin
    delete from public.approval_signature_stamps stamp
    where exists (select 1 from cleanup_approval_actions action where action.id = stamp.approval_action_id)
       or exists (select 1 from cleanup_assignments assignment where assignment.id = stamp.assignment_id)
       or exists (select 1 from cleanup_document_versions version where version.id = stamp.source_document_version_id)
       or exists (select 1 from cleanup_document_versions version where version.id = stamp.signed_document_version_id);

    delete from public.approval_action_invalidations invalidation
    where exists (select 1 from cleanup_projects project where project.id = invalidation.project_id)
       or exists (select 1 from cleanup_approval_actions action where action.id = invalidation.approval_action_id);

    delete from public.certificates certificate
    where exists (select 1 from cleanup_projects project where project.id = certificate.project_id)
       or exists (select 1 from cleanup_document_versions version where version.id = certificate.document_version_id);

    delete from public.approval_actions action
    where exists (select 1 from cleanup_projects project where project.id = action.project_id);

    delete from public.reminder_events reminder
    where exists (select 1 from cleanup_assignments assignment where assignment.id = reminder.assignment_id);

    delete from public.notification_logs notification
    where exists (select 1 from cleanup_projects project where project.id = notification.project_id)
       or exists (select 1 from cleanup_assignments assignment where assignment.id = notification.assignment_id);

    delete from public.revision_requests revision
    where exists (select 1 from cleanup_projects project where project.id = revision.project_id);

    delete from public.project_comments comment
    where exists (select 1 from cleanup_projects project where project.id = comment.project_id);

    delete from public.workflow_change_log log
    where exists (select 1 from cleanup_projects project where project.id = log.project_id);

    delete from public.audit_logs audit
    where exists (select 1 from cleanup_projects project where project.id = audit.entity_id)
       or exists (select 1 from cleanup_projects project where audit.metadata ->> 'projectId' = project.id::text);

    delete from public.projects project
    where exists (select 1 from cleanup_projects selected where selected.id = project.id);

    delete from public.student_email_verifications verification
    where exists (select 1 from cleanup_student_email_verifications selected where selected.id = verification.id);

    alter table public.approval_signature_stamps enable trigger approval_signature_stamps_append_only;
    alter table public.approval_action_invalidations enable trigger approval_action_invalidations_append_only;
    alter table public.approval_actions enable trigger approval_actions_append_only;
    alter table public.certificates enable trigger certificates_append_only;
    alter table public.audit_logs enable trigger audit_logs_append_only;
    alter table public.workflow_change_log enable trigger workflow_change_log_append_only;
  exception
    when others then
      alter table public.approval_signature_stamps enable trigger approval_signature_stamps_append_only;
      alter table public.approval_action_invalidations enable trigger approval_action_invalidations_append_only;
      alter table public.approval_actions enable trigger approval_actions_append_only;
      alter table public.certificates enable trigger certificates_append_only;
      alter table public.audit_logs enable trigger audit_logs_append_only;
      alter table public.workflow_change_log enable trigger workflow_change_log_append_only;
      raise;
  end;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_by
  ) values (
    v_user_id,
    'admin.test_projects_deleted',
    'admin_maintenance',
    null,
    jsonb_build_object(
      'deletedProjectIds', coalesce(v_deleted_project_ids, '[]'::jsonb),
      'deletedCount', v_deleted_count,
      'performedBy', v_user_id,
      'performedAt', v_now,
      'documents', v_document_count,
      'documentVersions', v_document_version_count,
      'workflowSteps', v_workflow_step_count,
      'assignments', v_assignment_count,
      'approvalActions', v_approval_action_count,
      'comments', v_comment_count,
      'notifications', v_notification_count,
      'revisions', v_revision_count,
      'certificates', v_certificate_count,
      'signatureStamps', v_signature_stamp_count,
      'projectAuditRowsDeleted', v_audit_count
    ),
    v_user_id
  );

  return jsonb_build_object(
    'deletedProjectIds', coalesce(v_deleted_project_ids, '[]'::jsonb),
    'deletedCount', v_deleted_count,
    'performedBy', v_user_id,
    'performedAt', v_now,
    'documents', v_document_count,
    'documentVersions', v_document_version_count,
    'workflowSteps', v_workflow_step_count,
    'assignments', v_assignment_count,
    'approvalActions', v_approval_action_count,
    'comments', v_comment_count,
    'notifications', v_notification_count,
    'revisions', v_revision_count,
    'certificates', v_certificate_count,
    'signatureStamps', v_signature_stamp_count,
    'projectAuditRowsDeleted', v_audit_count
  );
end;
$$;

revoke all on function public.admin_delete_test_projects(uuid[]) from public;
revoke all on function public.admin_delete_test_projects(uuid[]) from anon;
grant execute on function public.admin_delete_test_projects(uuid[]) to authenticated;
