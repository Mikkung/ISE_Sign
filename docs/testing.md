# Testing Instructions

Run local checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Current automated tests collect 27 tests across:

- `src/lib/workflow.test.ts`
- `src/lib/reminders.test.ts`
- `src/lib/certificates.test.ts`

Automated coverage includes:

- Sequential step activation.
- Parallel approver activation.
- `all`, `any`, and `minimum` completion rules.
- Invalid minimum approval count.
- Duplicate decision prevention.
- Add-after-activation reason requirement.
- Decided approver removal prevention.
- Revision routing before and after approval.
- Approval invalidation selection and valid approval counting.
- Reminder interval timing.
- Completed and terminal assignments excluded from reminders.
- Reminder deduplication.
- Escalation and repeat escalation.
- Certificate document version and SHA-256 preservation.
- Duplicate certification rejection logic.
- Application-level approval record immutability.

Manual RLS tests to perform in Supabase:

1. Sign in as student A and confirm student B projects are not returned.
2. Sign in as a student and confirm `internal` comments are not returned.
3. Sign in as staff and confirm only assigned/unit projects are manageable.
4. Sign in as an assigned approver and confirm unrelated projects are not returned.
5. Attempt to update or delete `approval_actions` and confirm the append-only trigger rejects it.
6. Trigger `/api/reminders/run` twice and confirm duplicate `reminder_events.dedupe_key` rows are not created.
