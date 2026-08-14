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

## Student OTP Sign-In

Students prove email ownership during sign-in with Supabase email OTP. Project creation does not send a second application-level code.

Security behavior:

- The server validates the exact `@student.chula.ac.th` domain before sending OTP.
- The server checks `student_directory` with the service-role client before sending OTP.
- The student directory row must be active.
- `student_id` must match the email local part.
- Supabase sends the six-digit OTP through the Email Magic Link template when it contains `{{ .Token }}`.
- The server re-checks `student_directory` after OTP verification.
- The server upserts `public.profiles` with `role = 'student'`.
- Project creation derives requester identity from the authenticated user and active directory row.

The legacy `student_email_verifications` table remains in the database from migration 004 but is no longer used by the project creation flow.

## SMTP

Student OTP email delivery uses Supabase Auth SMTP configuration.

Required environment:

```text
EMAIL_FROM
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_SECURE
```

Configure the Supabase Magic Link template to include `{{ .Token }}` so students receive a six-digit OTP.

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

1. Apply migrations.
2. Import a controlled student directory row.
3. Confirm Supabase Auth SMTP can deliver OTP email to the controlled student address.
4. Sign in as that student through `/login`.
5. Open `/projects/new`.
6. Confirm the read-only Authenticated Student section shows Student ID, First Name, Last Name, and Email.
7. Select an Academic Program.
8. Select a listed Project Type.
9. Test `Other` and enter a custom value.
10. Enter Start Date and End Date.
11. Select an attachment.
12. Submit the project.
13. Confirm requester snapshot fields are stored on `projects`.
14. Confirm Staff Review shows Student ID, Student Name, Student Email, Verification Status, and Verified At.
15. Confirm audit logs include project submission events.
16. Remove temporary test data when finished.
