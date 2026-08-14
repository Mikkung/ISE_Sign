import Link from "next/link";
import { notFound } from "next/navigation";
import { staffReviewAction } from "@/app/actions/projects";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProject } from "@/lib/data";

export default async function StaffReviewDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { projectId } = await params;
  const { error, message } = await searchParams;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{project.title}</h2>
          <p className="mt-1 text-sm text-slate-500">Review attachments and configure the approval workflow.</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <section className="grid gap-4 lg:grid-cols-3">
        <form action={staffReviewAction.bind(null, project.id)} className="space-y-3 rounded border border-slate-200 bg-white p-4 lg:col-span-2">
          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}
          <section className="rounded border border-slate-200 bg-slate-50 p-4 text-sm">
            <h3 className="font-semibold text-slate-950">Verified Requester Identity</h3>
            <dl className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-slate-500">Requester Type</dt>
                <dd className="font-medium capitalize text-slate-900">{project.verifiedRequester?.type ?? "-"}</dd>
              </div>
              {project.verifiedRequester?.studentId ? (
                <div>
                  <dt className="text-slate-500">Student ID</dt>
                  <dd className="font-medium text-slate-900">{project.verifiedRequester.studentId}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">Requester Name</dt>
                <dd className="font-medium text-slate-900">{project.verifiedRequester?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Requester Email</dt>
                <dd className="font-medium text-slate-900">{project.verifiedRequester?.email ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Verification Status</dt>
                <dd className="font-medium text-slate-900">{project.verifiedRequester ? "Verified" : "Not Verified"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Verified At</dt>
                <dd className="font-medium text-slate-900">
                  {project.verifiedRequester ? new Date(project.verifiedRequester.verifiedAt).toLocaleString() : "-"}
                </dd>
              </div>
            </dl>
          </section>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Shared Comment</span>
            <textarea name="sharedComment" rows={4} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Internal Comment</span>
            <textarea name="internalComment" rows={4} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Revision Reason</span>
            <textarea name="revisionReason" rows={3} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="intent" value="revision" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Request Revision</button>
            <button name="intent" value="reject" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Reject</button>
            <button name="intent" value="complete" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Approve Active Step</button>
          </div>
        </form>
        <aside className="rounded border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Next Step</h3>
          <p className="mt-2 text-sm text-slate-600">{project.nextAction}</p>
          <Link href={`/projects/${project.id}/workflow`} className="mt-4 block rounded bg-ise-maroon px-3 py-2 text-center text-sm font-semibold text-white">
            Configure Approval Workflow
          </Link>
        </aside>
      </section>
    </div>
  );
}
