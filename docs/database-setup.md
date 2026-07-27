# Database Setup

## Schema Summary

The database uses UUID primary keys, timestamp columns, foreign keys, indexes for common filters, append-only approval/audit records, and RLS on every business table.

Core tables:

- `profiles`
- `organizational_units`
- `user_unit_memberships`
- `project_types`
- `projects`
- `project_members`
- `project_documents`
- `project_document_versions`
- `project_comments`
- `workflow_templates`
- `workflow_template_steps`
- `workflow_steps`
- `workflow_assignments`
- `approval_actions`
- `approval_action_invalidations`
- `certificates`
- `workflow_change_log`
- `revision_requests`
- `notification_logs`
- `reminder_rules`
- `reminder_events`
- `audit_logs`
- `system_settings`

## Auth Mapping

`profiles.id` references `auth.users.id`. The migration creates `public.handle_new_auth_user()` and the `on_auth_user_created` trigger. New users are inserted as `student` by default; roles from client-provided metadata are not trusted. Admin promotion uses the server-side/SQL-controlled `public.set_profile_role()` RPC.

## Migration Order

1. `001_approval_workflow_schema.sql`
2. `002_storage_policies.sql`

Use:

```bash
supabase db push
```

For a hosted project, link first:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## Seed Data

`supabase/seed.sql` inserts project types, organizational units, and optional local profile/project records. It selects profile IDs from existing `auth.users` rows, so it remains runnable before those users exist.

## RLS Summary

- Students read and edit only their own/member projects in permitted states.
- Students cannot read `internal` comments.
- Staff manage assigned projects or projects in permitted organizational units.
- Approvers read assigned projects and insert decisions only for their own active assignments.
- Approval actions, approval invalidations, certificates, workflow change logs, and audit logs are append-only.
- Admins can access all records.
- Scheduler work uses the service role only inside `/api/reminders/run`.

## Manual Validation Pending

Local Supabase execution was not run in this recovery pass because `supabase` and `docker` were not available on PATH. Run migrations against a disposable local project or a reviewed hosted project before production use.
