import {
  activeWorkflowStep,
  approvedAssignmentCount,
  completionRuleLabel,
  formatBangkokDateTime,
  nextWorkflowStepAfter,
  pendingAssignments,
  signatureRequirementLabel,
  waitingDurationLabel,
  waitingForSummary,
  waitingSince,
  workflowAssignmentStatusLabel,
  workflowRoleLabel
} from "@/lib/workflow-display";
import type { Project } from "@/lib/types";

export function ApprovalStatusCard({ project, viewerRole }: { project: Project; viewerRole?: string }) {
  const step = activeWorkflowStep(project);
  const waiting = pendingAssignments(step);
  const since = waitingSince(waiting);
  const nextStep = nextWorkflowStepAfter(project, step);
  const isRequester = viewerRole === "student";

  if (!step) {
    return (
      <section className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Approval Status</h3>
            <p className="mt-1 text-sm text-slate-500">No approval step is currently waiting for action.</p>
          </div>
          <span className="rounded bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {project.status === "completed" ? "Completed" : project.status.replace(/_/g, " ")}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded border border-ise-maroon/20 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Approval Status</h3>
          <p className="mt-1 text-sm font-medium text-ise-maroon">
            {isRequester ? "Your project is waiting for approval." : "Waiting for approval."}
          </p>
        </div>
        <span className="rounded bg-red-50 px-3 py-1 text-sm font-semibold text-ise-maroon">
          {signatureRequirementLabel(step)}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-slate-500">Current Step</dt>
          <dd className="mt-1 font-semibold text-slate-950">{step.name}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Waiting For</dt>
          <dd className="mt-1 font-semibold text-slate-950">{waitingForSummary(step)}</dd>
          <dd className="text-slate-500">{workflowRoleLabel(step.assigneeRole)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Waiting Since</dt>
          <dd className="mt-1 font-semibold text-slate-950">{formatBangkokDateTime(since)}</dd>
          <dd className="text-slate-500">{waitingDurationLabel(since)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">What Comes Next</dt>
          <dd className="mt-1 font-semibold text-slate-950">{nextStep ? nextStep.name : "Completion"}</dd>
          <dd className="text-slate-500">{completionRuleLabel(step)}</dd>
        </div>
      </dl>

      {step.approvers.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-950">
            {step.completionRule === "any"
              ? "Waiting for any one approval"
              : step.completionRule === "all"
                ? `Waiting for ${step.approvers.length - approvedAssignmentCount(step)} of ${step.approvers.length} approvals`
                : `Waiting for ${Math.max((step.minimumApprovals ?? 1) - approvedAssignmentCount(step), 0)} more approval(s)`}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {step.approvers.map((assignment) => (
              <div key={assignment.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">{assignment.profile.displayName}</p>
                <p className="text-xs text-slate-600">
                  {workflowRoleLabel(step.assigneeRole)} · {workflowAssignmentStatusLabel(assignment.status)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
