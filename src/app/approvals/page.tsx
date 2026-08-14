import Link from "next/link";
import { listApprovalAssignments } from "@/lib/data";
import { formatBangkokDateTime, signatureRequirementLabel, waitingDurationLabel, workflowRoleLabel } from "@/lib/workflow-display";

export default async function ApprovalsPage() {
  const assignments = await listApprovalAssignments();
  const actionRequired = assignments.filter((assignment) => assignment.actionable);
  const upcoming = assignments.filter((assignment) => !assignment.actionable);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">My Approvals</h2>
        <p className="mt-1 text-sm text-slate-500">Open attachments, comment, request revision, or approve and certify.</p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Action Required</h3>
        <div className="grid gap-3">
          {actionRequired.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No approval assignments need action right now.</div>
          ) : (
            actionRequired.map((assignment) => (
              <Link
                key={assignment.assignment.id}
                href={`/approvals/${assignment.assignment.id}`}
                className="rounded border border-slate-200 bg-white p-4 shadow-panel hover:border-ise-maroon"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{assignment.project.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {assignment.step.name} · {workflowRoleLabel(assignment.step.assigneeRole)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requester: {assignment.project.student.displayName} · Waiting since {formatBangkokDateTime(assignment.assignment.assignedAt)}
                      {" "}({waitingDurationLabel(assignment.assignment.assignedAt ? new Date(assignment.assignment.assignedAt) : null)})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-ise-maroon">
                      {signatureRequirementLabel(assignment.step)}
                    </span>
                    <p className="mt-3 rounded bg-ise-maroon px-3 py-2 text-center text-sm font-semibold text-white">
                      {assignment.step.certificationRequired ? "Review & Sign" : "Review & Approve"}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Upcoming</h3>
        <div className="grid gap-3">
          {upcoming.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No upcoming approval assignments.</div>
          ) : (
            upcoming.map((assignment) => (
              <div key={assignment.assignment.id} className="rounded border border-slate-200 bg-white p-4 shadow-panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{assignment.project.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {assignment.step.name} · {workflowRoleLabel(assignment.step.assigneeRole)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Waiting for previous step: {assignment.blockingStep?.name ?? "Earlier workflow step"}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Your action will be available after the previous step is completed.</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Upcoming</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
