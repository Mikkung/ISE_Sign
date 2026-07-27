import { notFound } from "next/navigation";
import { buildCertificateSummary } from "@/lib/certificates";
import { getProject } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApprovalAction } from "@/lib/types";

type ApprovalActionRow = {
  id: string;
  project_id: string;
  workflow_step_id: string;
  approver_id: string;
  decision: ApprovalAction["decision"];
  document_version_id: string;
  document_sha256_hash: string;
  certified_at: string | null;
  comment: string | null;
};

export default async function ProjectCertificatePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project || project.status !== "completed") {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: actions } = supabase
    ? await supabase
        .from("approval_actions")
        .select("id, project_id, workflow_step_id, approver_id, decision, document_version_id, document_sha256_hash, certified_at, comment")
        .eq("project_id", project.id)
    : { data: [] };
  const summary = buildCertificateSummary(
    project,
    ((actions ?? []) as ApprovalActionRow[]).map((action) => ({
      id: action.id,
      projectId: action.project_id,
      workflowStepId: action.workflow_step_id,
      approverId: action.approver_id,
      decision: action.decision,
      documentVersionId: action.document_version_id,
      documentHash: action.document_sha256_hash,
      certifiedAt: action.certified_at ?? undefined,
      comment: action.comment ?? undefined
    })) as ApprovalAction[]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm font-semibold text-ise-maroon">{summary.verificationCode}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Final certificate</h2>
      </div>
      <section className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Project</dt>
            <dd className="font-medium text-slate-900">{summary.projectTitle}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Student</dt>
            <dd className="font-medium text-slate-900">{summary.studentName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Submitted</dt>
            <dd className="font-medium text-slate-900">{summary.submissionDate ? new Date(summary.submissionDate).toLocaleString() : "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Completed</dt>
            <dd className="font-medium text-slate-900">{new Date(summary.completionDate).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Final document version</dt>
            <dd className="font-medium text-slate-900">{summary.finalDocumentVersion ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Approvals</dt>
            <dd className="font-medium text-slate-900">{summary.approvalCount}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Document SHA-256</p>
          <p className="mt-1 break-all font-mono text-sm text-slate-900">{summary.documentHash ?? "-"}</p>
        </div>
        <p className="mt-5 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {summary.certificationStatement}
        </p>
      </section>
    </div>
  );
}
