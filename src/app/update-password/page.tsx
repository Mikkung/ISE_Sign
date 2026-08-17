import Link from "next/link";
import { updatePasswordAction } from "@/app/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Reset link expired</h1>
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            className="mt-5 inline-flex rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark"
          >
            Request a new reset link
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Set a new password</h1>
        {error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <form action={updatePasswordAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">New Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Confirm Password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark">
            Update Password
          </button>
        </form>
      </section>
    </main>
  );
}
