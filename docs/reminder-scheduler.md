# Reminder Scheduler

The application exposes a protected scheduler endpoint:

```text
POST /api/reminders/run
Authorization: Bearer $SCHEDULER_SECRET
```

The route requires `SCHEDULER_SECRET` and uses the Supabase service-role client server-side only. It reads active `workflow_assignments`, applies `reminder_rules`, writes `notification_logs` and `reminder_events`, and deduplicates by `dedupe_key`.

Default policy:

- Initial assignment notification.
- Reminder after 2 days without opening.
- Reminder after 4 days without action.
- Staff notification after 7 days.
- Escalation after 10 days.
- Repeat escalation every 3 days after escalation.

Completed, rejected, cancelled, invalidated, and inactive future-step assignments are excluded by the scheduler query and reminder logic.

## Local Manual Trigger

```bash
curl -X POST http://localhost:3000/api/reminders/run \
  -H "Authorization: Bearer your-scheduler-secret"
```

## Vercel Cron

Add a cron entry that calls `/api/reminders/run` daily or every 6 hours. Configure `SCHEDULER_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables.

## Email Behavior

Email is implemented in `src/lib/email.ts` with `nodemailer`. If SMTP variables are absent, in-app notification logs remain preserved and email attempts are marked skipped rather than corrupting workflow state. Microsoft Teams notifications are not implemented.
