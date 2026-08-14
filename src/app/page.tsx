import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto flex max-w-3xl flex-col gap-8 rounded border border-slate-200 bg-white p-8 shadow-panel">
        <div>
          <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Create, submit, and track project requests</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Verified requesters can create a project request with an email code. Staff, approvers, and admins can use their existing sign-in.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/login?next=/projects/new"
            className="rounded bg-ise-maroon px-4 py-3 text-center text-sm font-semibold text-white hover:bg-ise-maroonDark"
          >
            Create a Project Request
          </Link>
          <Link
            href="/login"
            className="rounded border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-800 hover:border-ise-maroon"
          >
            Sign In / Track My Projects
          </Link>
        </div>
        <div className="border-t border-slate-200 pt-5">
          <p className="text-sm font-semibold text-slate-900">Staff / Approver</p>
          <Link href="/login" className="mt-3 inline-flex text-sm font-semibold text-ise-maroon hover:underline">
            Staff Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}
