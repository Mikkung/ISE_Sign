import { redirect } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isConfirmedStudentUser, redirectPathForRole } from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
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
      redirect(`/verify-email?email=${encodeURIComponent(user.email ?? "")}`);
    }

    redirect(redirectPathForRole(role));
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sign in</h1>
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
          <button className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark">
            Sign in
          </button>
        </form>
        <Link href="/register/student" className="mt-5 inline-flex text-sm font-semibold text-ise-maroon">
          Register with Student Email
        </Link>
      </section>
    </main>
  );
}
