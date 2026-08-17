import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ resetSent?: string }>;
}) {
  const { resetSent } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Reset your password</h1>
        {resetSent ? (
          <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            If an account exists for this email, a password reset link has been sent.
          </p>
        ) : null}
        <form action={requestPasswordResetAction} className="mt-5 space-y-4">
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
          <button className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark">
            Send reset link
          </button>
        </form>
        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-ise-maroon hover:underline">
          Back to Sign in
        </Link>
      </section>
    </main>
  );
}
