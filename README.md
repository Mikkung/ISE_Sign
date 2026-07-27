# ISE Project Approval

Internal web application for student project submission, staff review, dynamic approvals, reminders, audit history, and authenticated electronic certification.

## Architecture

- Next.js 16 App Router with TypeScript.
- Tailwind CSS with ISE maroon accent `#8B2332`.
- Supabase PostgreSQL, Auth, Storage, and Row Level Security.
- Server Components for read-heavy pages.
- Server Actions and protected API routes for mutations and scheduled reminder processing.
- Pure TypeScript workflow, reminder, and certification rules with Vitest coverage.

Without Supabase environment variables, the app builds and renders empty database-backed pages. Real project data, authentication, uploads, notifications, reminders, audit logs, and certificates require Supabase configuration.

## Main Routes

- `/dashboard`
- `/projects`
- `/projects/new`
- `/projects/[projectId]`
- `/projects/[projectId]/edit`
- `/projects/[projectId]/documents`
- `/projects/[projectId]/workflow`
- `/projects/[projectId]/history`
- `/staff/review`
- `/staff/review/[projectId]`
- `/approvals`
- `/approvals/[assignmentId]`
- `/notifications`
- `/admin/users`
- `/admin/project-types`
- `/admin/workflow-templates`
- `/admin/reminder-rules`
- `/admin/reports`
- `/admin/audit-logs`

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add Supabase values to `.env.local` before testing authenticated workflows.

## Validation

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Current recovered validation status:

- Typecheck passes.
- ESLint passes with the ESLint CLI.
- Vitest collects 27 tests across 3 files and passes.
- Next.js production build passes.

## Supabase Setup

Apply migrations in order:

```bash
supabase db push
supabase db seed
```

Migration files:

1. `supabase/migrations/001_approval_workflow_schema.sql`
2. `supabase/migrations/002_storage_policies.sql`

The seed inserts lookup data and only inserts profile records for Auth users that already exist with matching emails.

## Environment Variables

See `.env.example` for the full list. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SCHEDULER_SECRET`, or SMTP credentials to browser code.

## Documentation

- [Database setup](docs/database-setup.md)
- [Reminder scheduler](docs/reminder-scheduler.md)
- [Role and permission matrix](docs/role-permission-matrix.md)
- [Workflow status diagram](docs/workflow-status-diagram.md)
- [Testing instructions](docs/testing.md)
