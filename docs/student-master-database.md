# Student Master Database And Project Verification

Migration `004_project_requester_verification.sql` adds the project-request student verification model.

## Student Directory

Table:

```text
public.student_directory
```

Columns:

```text
id
student_id
email
first_name
last_name
is_active
created_at
updated_at
created_by
```

Rules:

- `student_id` is normalized lowercase text and unique.
- `email` is normalized lowercase and unique.
- `email` must end exactly with `@student.chula.ac.th`.
- The email prefix must match `student_id`.
- `first_name` and `last_name` are required.
- Students cannot browse the directory.
- Admins manage the directory through authenticated RLS or secure service-role operations.

Do not commit real student data to source control.

## CSV Import Format

Use this header:

```csv
student_id,email,first_name,last_name,is_active
```

Example template with fake data only:

```csv
student_id,email,first_name,last_name,is_active
6631234567,6631234567@student.chula.ac.th,First,Last,true
```

Recommended import process:

1. Validate the CSV locally before import.
2. Reject rows where the email prefix does not match `student_id`.
3. Reject rows outside `student.chula.ac.th`.
4. Import with Supabase Dashboard table import or a service-role admin script.
5. Review duplicate-row errors for `student_id` and `email`.
6. Keep a rejected-row report outside source control.
7. Re-run a spot check:

```sql
select student_id, email, first_name, last_name, is_active
from public.student_directory
where email = '6631234567@student.chula.ac.th';
```

## Verification Codes

Project submission uses application-level six-digit verification codes. It does not use Supabase login magic links and does not change the authenticated session.

Security behavior:

- Code is generated server-side using a cryptographically secure random source.
- Plaintext code is never stored.
- `student_email_verifications.code_hash` stores a salted HMAC.
- `STUDENT_VERIFICATION_PEPPER` is server-only.
- Code expires after 10 minutes.
- Code can be used only once.
- Maximum attempts: 5.
- New code cooldown: 60 seconds per user and email.
- Issuing a new code invalidates earlier unconsumed codes.
- Verification is bound to authenticated user ID, email, and the project creation browser session cookie.

Add this to `.env.local` and the deployment environment:

```text
STUDENT_VERIFICATION_PEPPER=replace-with-a-long-random-server-only-secret
```

Do not expose this variable with a `NEXT_PUBLIC_` prefix.

## SMTP

Verification email uses the existing SMTP abstraction.

Required environment:

```text
EMAIL_FROM
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_SECURE
```

The email subject is:

```text
Your ISE Project Verification Code
```

Do not test with a real student email address unless it is a controlled test account.

## New Project Fields

Migration 004 adds:

- `projects.academic_program`
- `projects.project_type_category`
- `projects.project_type_custom`
- `projects.start_date`
- `projects.end_date`
- `projects.student_directory_id`
- `projects.student_email_verification_id`
- requester snapshot fields

Allowed academic programs:

```text
ADME
AERO
ICE
ROBOTICS&AI
SEMI
NANO
```

Allowed project type categories:

```text
CSR Trip
Open House
First Meet
Sports Competition
Academic Competition
Other
```

`Other` requires `project_type_custom`.

## Migration

Local migration order currently includes:

```text
003_student_self_registration.sql
004_project_requester_verification.sql
```

Apply with:

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Do not run destructive reset commands against the remote project.

## Runtime Test

1. Add `STUDENT_VERIFICATION_PEPPER`.
2. Apply migrations.
3. Import a controlled student directory row.
4. Confirm SMTP can deliver to the controlled student address.
5. Sign in as that student.
6. Open `/projects/new`.
7. Select an Academic Program.
8. Select a listed Project Type.
9. Test `Other` and enter a custom value.
10. Enter Start Date and End Date.
11. Select an attachment.
12. Enter the signed-in student email.
13. Send the code.
14. Enter the code.
15. Confirm Student ID and full name display.
16. Submit the project.
17. Confirm requester snapshot fields are stored on `projects`.
18. Confirm Staff Review shows Student ID, Student Name, Student Email, Verification Status, and Verified At.
19. Confirm audit logs include student email verification and project submission events.
20. Remove temporary verification rows and test data when finished.

