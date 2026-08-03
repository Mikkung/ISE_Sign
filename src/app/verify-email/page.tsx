import Link from "next/link";
import { resendStudentConfirmationAction } from "@/app/actions/auth";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; registered?: string; resent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const message = params.registered
    ? "Registration complete. Check your Chula email to confirm your account before signing in."
    : "Confirm your email before signing in.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{message}</h1>
        {params.error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error}
          </p>
        ) : null}
        {params.resent ? (
          <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            If this email can register, another confirmation email will be sent.
          </p>
        ) : null}
        <form action={resendStudentConfirmationAction} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Student Email</span>
            <input
              name="email"
              type="email"
              defaultValue={params.email ?? ""}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">
            Resend Confirmation Email
          </button>
        </form>
        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-ise-maroon">
          Back to Sign In
        </Link>
      </section>
    </main>
  );
}
