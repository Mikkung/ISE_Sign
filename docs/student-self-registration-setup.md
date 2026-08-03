# Student Self-Registration Setup

This project supports public student self-registration only for verified Chulalongkorn University student email addresses ending exactly with:

```text
@student.chula.ac.th
```

The application enforces this in client validation, server actions, and migration `003_student_self_registration.sql`. Supabase still requires a manual Dashboard step to enable the Auth Hook.

References:

- Supabase Before User Created Hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Supabase Auth hooks overview: https://supabase.com/docs/guides/auth/auth-hooks
- Supabase Auth URL configuration: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp

## Migration 003

Apply the migration with:

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Do not run a remote reset command.

Migration `003_student_self_registration.sql` creates or updates:

- `public.auth_registration_allowlist`
- `public.is_exact_student_chula_email(candidate text)`
- `public.hook_restrict_student_self_registration(event jsonb)`
- `public.handle_new_auth_user()`
- RLS policies for the allowlist
- Grants for `supabase_auth_admin` and authenticated admin access through RLS

It does not modify migrations `001_approval_workflow_schema.sql` or `002_storage_policies.sql`.

## Enable Email Auth

In the Supabase Dashboard:

1. Open the project.
2. Go to `Authentication > Sign In / Providers`.
3. Open `Email`.
4. Enable `Email` provider.
5. Enable `Allow new users to sign up`.
6. Enable `Confirm Email`.
7. Save.

Student access in the app requires both Supabase email confirmation and a `public.profiles` row with `role = 'student'` and `is_active = true`.

## Configure Redirect URLs

In the Supabase Dashboard:

1. Go to `Authentication > URL Configuration`.
2. Set local `Site URL`:

```text
http://localhost:3000
```

3. Add local allowed redirect URL:

```text
http://localhost:3000/**
```

4. After deployment, add the production site URL and production callback wildcard for the deployed domain.

The registration action sends users to:

```text
/auth/callback
```

## Enable Before User Created Hook

In the Supabase Dashboard:

1. Go to `Authentication > Hooks`.
2. Add or edit the `Before User Created` hook.
3. Choose `Postgres function`.
4. Select:

```text
public.hook_restrict_student_self_registration
```

5. Save and enable the hook.

Required grants are included in migration 003. If you need to re-check them manually, use:

```sql
grant usage on schema public to supabase_auth_admin;
grant select, update on public.auth_registration_allowlist to supabase_auth_admin;
grant execute on function public.hook_restrict_student_self_registration(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_student_self_registration(jsonb) from anon, authenticated, public;
```

## Custom SMTP

Self-registration is not production-ready until Supabase can deliver confirmation email to arbitrary `@student.chula.ac.th` recipients.

In the Supabase Dashboard:

1. Go to `Authentication > SMTP Settings` or `Authentication > Configuration > Custom SMTP`.
2. Enable custom SMTP.
3. Configure:

```text
SMTP host
SMTP port
SMTP username
SMTP password
Sender email
Sender name
```

4. Review auth email rate limits.
5. Review the confirmation email template.
6. Review the reset-password email template.
7. Send a test email only to a controlled address.

Do not commit SMTP credentials.

## Staff, Approver, And Admin Provisioning

Non-student-domain accounts require an active allowlist row before Auth user creation. This prevents the hook from blocking legitimate staff, approver, and admin account provisioning while still blocking public external self-registration.

Create an allowlist row through a secure admin SQL session or service-role server operation:

```sql
insert into public.auth_registration_allowlist (email, intended_role, expires_at)
values ('staff.test@example.edu', 'staff', now() + interval '7 days');
```

After the Auth user exists and the profile trigger has created a student-safe default profile, assign the privileged role through the existing secure function:

```sql
select public.set_profile_role('00000000-0000-0000-0000-000000000000', 'staff');
select public.set_profile_role('00000000-0000-0000-0000-000000000000', 'approver');
select public.set_profile_role('00000000-0000-0000-0000-000000000000', 'admin');
```

Replace the UUID with the target profile ID. Do not change the profile primary key. Do not use `raw_user_meta_data.role`.

For a student test profile, the trigger should create the role automatically:

```sql
select id, email, role, is_active
from public.profiles
where email = 'student.test@student.chula.ac.th';
```

## Emergency Disable

If the hook blocks a legitimate incident response action:

1. Go to `Authentication > Hooks`.
2. Open `Before User Created`.
3. Disable the hook or remove the selected Postgres function.
4. Re-enable it after the provisioning issue is resolved.

Prefer Dashboard disablement over replacing the SQL function with a permissive implementation.

## Runtime Checklist

1. Open `/register/student`.
2. Try `user@chula.ac.th`; the form should show Thai validation and the server action should reject it.
3. Try `user@student.chula.ac.th.example.com`; it should be rejected.
4. Register with a controlled real `@student.chula.ac.th` test account.
5. Confirm no authenticated app access is granted before email confirmation.
6. Receive and open the confirmation email.
7. Confirm the link returns to `/auth/callback`.
8. Log in.
9. Confirm the profile row has `role = 'student'`, normalized email, and `is_active = true`.
10. Confirm redirect to `/dashboard`.
11. Confirm `/staff/review` and `/admin/users` redirect to `/unauthorized`.
12. Create a project as the student.

