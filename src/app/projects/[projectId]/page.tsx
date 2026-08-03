import Link from "next/link";
import { notFound } from "next/navigation";
import { addSharedCommentAction, submitProjectAction } from "@/app/actions/projects";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { getProject } from "@/lib/data";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ise-maroon">{project.code}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{project.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.abstract}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded border border-slate-200 bg-white p-4 shadow-panel lg:col-span-2">
          <h3 className="font-semibold text-slate-950">Project information</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Student</dt>
              <dd className="font-medium text-slate-900">{project.student.displayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Type</dt>
              <dd className="font-medium text-slate-900">{project.projectType}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Program</dt>
              <dd className="font-medium text-slate-900">{project.academicProgram}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Start Date</dt>
              <dd className="font-medium text-slate-900">{project.startDate ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">End Date</dt>
              <dd className="font-medium text-slate-900">{project.endDate ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Current owner</dt>
              <dd className="font-medium text-slate-900">{project.currentResponsible ?? "-"}</dd>
            </div>
          </dl>
          {project.verifiedRequester ? (
            <div className="mt-5 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <h4 className="font-semibold text-emerald-950">Verified Requester Identity</h4>
              <dl className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <dt className="text-emerald-700">Student ID</dt>
                  <dd className="font-medium text-emerald-950">{project.verifiedRequester.studentId}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Student Name</dt>
                  <dd className="font-medium text-emerald-950">
                    {project.verifiedRequester.firstName} {project.verifiedRequester.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Student Email</dt>
                  <dd className="font-medium text-emerald-950">{project.verifiedRequester.email}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Verified At</dt>
                  <dd className="font-medium text-emerald-950">{new Date(project.verifiedRequester.verifiedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>
        <section className="rounded border border-slate-200 bg-white p-4 shadow-panel">
          <h3 className="font-semibold text-slate-950">Actions</h3>
          <div className="mt-4 grid gap-2">
            <Link href={`/projects/${project.id}/edit`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              Edit details
            </Link>
            <Link href={`/projects/${project.id}/documents`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              Documents and versions
            </Link>
            <Link href={`/projects/${project.id}/workflow`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              Approval workflow
            </Link>
            <Link href={`/projects/${project.id}/history`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              Audit history
            </Link>
            {project.status === "completed" ? (
              <Link href={`/projects/${project.id}/certificate`} className="rounded border border-emerald-300 px-3 py-2 text-center text-sm font-semibold text-emerald-700">
                Final certificate
              </Link>
            ) : null}
            {["draft", "revision_required"].includes(project.status) ? (
              <form action={submitProjectAction.bind(null, project.id)}>
                <button className="w-full rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Submit project</button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-950">Approval workflow</h3>
        <WorkflowTimeline steps={project.workflow} />
      </section>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-panel">
        <h3 className="font-semibold text-slate-950">Shared comments</h3>
        <form action={addSharedCommentAction.bind(null, project.id)} className="mt-3 flex gap-2">
          <input
            name="body"
            required
            placeholder="Add a shared response"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Add</button>
        </form>
        <div className="mt-4 space-y-3">
          {project.comments.filter((comment) => comment.visibility === "shared").length === 0 ? (
            <p className="text-sm text-slate-500">No shared comments yet.</p>
          ) : (
            project.comments
              .filter((comment) => comment.visibility === "shared")
              .map((comment) => (
                <div key={comment.id} className="rounded border border-slate-200 p-3">
                  <p className="text-sm text-slate-900">{comment.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {comment.author.displayName} · {new Date(comment.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  );
}
