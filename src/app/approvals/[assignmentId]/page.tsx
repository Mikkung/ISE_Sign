import { notFound } from "next/navigation";
import { approvalDecisionAction, markAssignmentOpenedAction } from "@/app/actions/projects";
import { certificationStatement } from "@/lib/constants";
import { getApprovalAssignment } from "@/lib/data";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const match = await getApprovalAssignment(assignmentId);

  if (!match) {
    notFound();
  }

  await markAssignmentOpenedAction(match.assignment.id);
  const activeDocument = match.project.documents[0]?.latestVersion;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{match.project.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{match.step.name}</p>
      </div>
      <section className="rounded border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-950">Electronic Approval Certification</h3>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Approver</dt>
            <dd className="font-medium text-slate-900">{match.assignment.profile.displayName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{match.assignment.profile.position ?? "Approver"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Document Version</dt>
            <dd className="font-medium text-slate-900">
              {activeDocument ? `v${activeDocument.versionNumber} · ${activeDocument.originalFileName}` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Date and Time</dt>
            <dd className="font-medium text-slate-900">{new Date().toLocaleString("th-TH")}</dd>
          </div>
        </dl>
        {activeDocument ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Active document SHA-256</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">{activeDocument.sha256Hash}</p>
              </div>
              <a
                href={`/api/documents/${activeDocument.id}/download`}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
              >
                View/Download
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            No active document version is available. Certification cannot be submitted.
          </p>
        )}
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {certificationStatement}
        </p>
        {activeDocument ? (
          <form action={approvalDecisionAction.bind(null, match.assignment.id)} className="mt-4 space-y-4">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input name="certify" type="checkbox" className="mt-1" />
              I confirm that this action electronically approves and certifies document v{activeDocument.versionNumber} with hash {activeDocument.sha256Hash}. This is not a PKI digital signature.
            </label>
            <textarea name="comment" placeholder="Comment" rows={4} className="w-full rounded border border-slate-300 px-3 py-2" />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="revision_requested" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Request Revision</button>
              <button name="decision" value="rejected" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Reject</button>
              <button name="decision" value="approved" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Approve and Certify</button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
