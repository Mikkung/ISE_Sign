# Authentication Flow

## Student Sign In

Students sign in at `/login` with Supabase email OTP.

Flow:

1. Enter a `@student.chula.ac.th` email address.
2. The server normalizes and validates the exact domain.
3. The server checks `public.student_directory` with the service-role client.
4. The directory row must be active, match the normalized email, and have `student_id` equal to the email local part.
5. The server calls `supabase.auth.signInWithOtp` with `shouldCreateUser: true`.
6. The student enters the six-digit OTP from email.
7. The server calls `supabase.auth.verifyOtp({ type: "email" })`.
8. The server re-checks `student_directory`.
9. The server upserts `public.profiles` with role `student`.
10. The student is redirected to `/dashboard`.

The UI does not ask students for a full name or password.

## Staff, Approver, And Admin Sign In

Staff, approvers, and admins continue to use email/password sign-in on `/login`.

If a student profile attempts password sign-in, the server signs out the session and redirects back to the student OTP section with:

```text
Students sign in with an email verification code.
```

## Supabase Dashboard Settings

Configure Supabase Auth email OTP delivery:

1. Go to `Authentication > Sign In / Providers > Email`.
2. Keep Email enabled.
3. Keep signups enabled because student OTP uses `shouldCreateUser: true`.
4. Configure the Magic Link email template to include:

```text
{{ .Token }}
```

5. Confirm SMTP is configured and can deliver to a controlled `@student.chula.ac.th` test account.

Do not expose the service-role key in client components or browser bundles.

## Project Creation

`/projects/new` no longer performs a second email verification.

Project creation derives requester identity from:

- the authenticated Supabase user
- the active `student_directory` row for that user email

The browser does not submit trusted student identity fields.

