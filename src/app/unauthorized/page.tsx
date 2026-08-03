import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-2xl rounded border border-slate-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-semibold text-ise-maroon">Access denied</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">You are not authorized to view this page.</h2>
      <p className="mt-3 text-sm text-slate-600">
        Your account is signed in, but your current role does not have permission for this route.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
