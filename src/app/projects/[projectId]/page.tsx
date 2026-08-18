import Link from "next/link";
import { notFound } from "next/navigation";
import { addSharedCommentAction, cancelProjectAction, submitProjectAction, uploadCompletedDocumentAction } from "@/app/actions/projects";
import { ApprovalStatusCard } from "@/components/approval-status-card";
import { ProjectCancelDialog } from "@/components/project-cancel-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { getCompletedDocument } from "@/lib/completed-documents";
import { getProject } from "@/lib/data";
import { getProjectEditabilityForUser } from "@/lib/project-editability.server";
import { cancellableProjectStatuses } from "@/lib/project-cancellation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export default async function ProjectDetailPage({
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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: profile } = user && supabase
    ? await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = profile?.role as UserRole | undefined;
  const editability = user && profile && role
    ? await getProjectEditabilityForUser(supabase!, {
        projectId: project.id,
        userId: user.id,
        role,
        isActive: profile.is_active !== false,
        studentId: project.student.id,
        status: project.status
      })
    : null;
  const { data: canManageProject } = supabase && user && ["staff", "admin"].includes(role ?? "")
    ? await supabase.rpc("staff_can_manage_project", { p_project_id: project.id })
    : { data: false };
  const canCancel =
    Boolean(profile?.is_active !== false) &&
    cancellableProjectStatuses.includes(project.status) &&
    (role === "admin" || project.student.id === user?.id);
  const completedDocument = getCompletedDocument(project);
  const canUploadCompletedDocument = project.status === "completed" && profile?.is_active !== false && canManageProject === true;

  return (
    <div className="space-y-6">
      <Link href="/projects" className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to Projects
      </Link>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ise-maroon">{project.code}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{project.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.abstract}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <ApprovalStatusCard project={project} viewerRole={role} />
      <section className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-950">Final Document</h3>
            {project.status === "completed" ? (
              completedDocument ? (
                <p className="mt-1 text-sm text-emerald-700">Available</p>
              ) : (
                <p className="mt-1 text-sm text-amber-700">Pending External Processing</p>
              )
            ) : (
              <p className="mt-1 text-sm text-slate-500">Available after approval completion and external processing.</p>
            )}
          </div>
          {completedDocument ? (
            <div className="flex gap-2">
              <Link
                href={`/api/documents/${completedDocument.latestVersion.id}/download`}
                className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                View
              </Link>
              <Link
                href={`/api/documents/${completedDocument.latestVersion.id}/download`}
                className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white"
              >
                Download
              </Link>
            </div>
          ) : null}
        </div>
        {completedDocument ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">{completedDocument.latestVersion.originalFileName}</p>
            <p className="mt-1 text-slate-500">
              Uploaded: {new Date(completedDocument.latestVersion.uploadedAt).toLocaleString()} · v{completedDocument.latestVersion.versionNumber}
            </p>
          </div>
        ) : project.status === "completed" ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            The approval process is complete. The final document will be available here after external processing is completed.
          </p>
        ) : null}
        {canUploadCompletedDocument ? (
          <form action={uploadCompletedDocumentAction.bind(null, project.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {completedDocument ? "Upload New Version" : "Upload Completed Document"}
              </label>
              <input
                name="file"
                type="file"
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                This document will be provided to the requester as the final completed document.
              </p>
            </div>
            <button className="self-end rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">
              {completedDocument ? "Upload New Version" : "Upload Completed Document"}
            </button>
          </form>
        ) : null}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded border border-slate-200 bg-white p-4 shadow-panel lg:col-span-2">
          <h3 className="font-semibold text-slate-950">Project information</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Requester</dt>
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
                  <dt className="text-emerald-700">Requester Type</dt>
                  <dd className="font-medium capitalize text-emerald-950">{project.verifiedRequester.type ?? "requester"}</dd>
                </div>
                {project.verifiedRequester.studentId ? (
                  <div>
                    <dt className="text-emerald-700">Student ID</dt>
                    <dd className="font-medium text-emerald-950">{project.verifiedRequester.studentId}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-emerald-700">Requester Name</dt>
                  <dd className="font-medium text-emerald-950">{project.verifiedRequester.name}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Requester Email</dt>
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
            {editability?.allowed ? (
              <Link href={`/projects/${project.id}/edit`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
                Edit Project
              </Link>
            ) : editability && !["not_owner", "not_authorized", "inactive_profile"].includes(editability.reason) ? (
              <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-600">
                Editing locked - {editability.reason === "approval_started" ? "approval has started" : project.status.replace(/_/g, " ")}
              </p>
            ) : null}
            <Link href={`/projects/${project.id}/documents`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              Documents and versions
            </Link>
            <Link href={`/projects/${project.id}/workflow`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              {project.student.id === user?.id ? "Edit Approval Workflow" : "Approval workflow"}
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
            {canCancel ? <ProjectCancelDialog action={cancelProjectAction.bind(null, project.id)} /> : null}
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
