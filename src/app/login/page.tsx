import { redirect } from "next/navigation";
import { loginAction, sendStudentLoginCodeAction, verifyStudentLoginCodeAction } from "@/app/actions/auth";
import { StudentCodeSubmitButton } from "@/app/login/student-code-submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isConfirmedStudentUser, redirectPathForRole } from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; studentError?: string; studentEmail?: string; codeSent?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (user && supabase) {
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    const role = profile?.role as UserRole | undefined;

    if (!profile || !role || profile.is_active === false) {
      redirect("/unauthorized");
    }

    if (
      role === "student" &&
      !isConfirmedStudentUser({
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        profile: { role, isActive: profile.is_active }
      })
    ) {
      await supabase.auth.signOut();
      redirect(
        `/login?studentEmail=${encodeURIComponent(user.email ?? "")}&studentError=${encodeURIComponent(
          "Students sign in with an email verification code."
        )}`
      );
    }

    redirect(redirectPathForRole(role));
  }

  const { error, studentError, studentEmail, codeSent } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-5xl rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sign In</h1>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Student Sign In</h2>
            <p className="mt-1 text-sm text-slate-500">Students sign in with a six-digit email verification code.</p>
            {studentError ? (
              <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {studentError}
              </p>
            ) : null}
            {codeSent ? (
              <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                If this student email can sign in, a six-digit code has been sent.
              </p>
            ) : null}
            <form action={sendStudentLoginCodeAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Student Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={studentEmail ?? ""}
                  placeholder="xxxxxxxxxx@student.chula.ac.th"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <StudentCodeSubmitButton />
            </form>
            {codeSent ? (
              <form action={verifyStudentLoginCodeAction} className="mt-5 space-y-4">
                <input type="hidden" name="email" value={studentEmail ?? ""} />
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Verification Code</span>
                  <input
                    name="token"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <button className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark">
                  Verify and Sign In
                </button>
              </form>
            ) : null}
          </section>

          <section className="rounded border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Staff, Approver, and Admin Sign In</h2>
            {error ? (
              <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <form action={loginAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <button className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-ise-maroon">
                Sign In
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
