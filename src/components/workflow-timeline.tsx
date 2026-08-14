import { Check, Circle, Clock, GitBranch, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  completionRuleLabel,
  formatBangkokDateTime,
  signatureRequirementLabel,
  workflowAssignmentStatusLabel,
  workflowRoleLabel,
  workflowStepStatusLabel
} from "@/lib/workflow-display";
import type { WorkflowStep } from "@/lib/types";

function StepIcon({ status }: { status: WorkflowStep["status"] }) {
  if (["completed", "approved"].includes(status)) {
    return <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />;
  }

  if (status === "rejected") {
    return <X className="h-4 w-4 text-red-700" aria-hidden="true" />;
  }

  if (["in_progress", "revision_required", "overdue"].includes(status)) {
    return <Clock className="h-4 w-4 text-ise-maroon" aria-hidden="true" />;
  }

  return <Circle className="h-4 w-4 text-slate-400" aria-hidden="true" />;
}

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
        No approval workflow has been configured.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>Project Submitted</span>
        </div>
      </div>
      {steps
        .sort((a, b) => a.order - b.order)
        .map((step) => (
          <div key={step.id} className="rounded border border-slate-200 bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <StepIcon status={step.status} />
                  <h3 className="font-semibold text-slate-950">{step.name}</h3>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-500">
                  <span>{workflowStepStatusLabel(step.status)}</span>
                  <span>·</span>
                  <span>{workflowRoleLabel(step.assigneeRole)}</span>
                  <span>·</span>
                  <span>{signatureRequirementLabel(step)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {step.mode === "parallel" ? <GitBranch className="mr-1 inline h-4 w-4" aria-hidden="true" /> : null}
                  {completionRuleLabel(step)}
                </p>
              </div>
              <StatusBadge status={step.status} />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {step.approvers.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{assignment.profile.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {assignment.profile.position ?? workflowRoleLabel(step.assigneeRole)}
                      {assignment.completedAt ? ` · ${formatBangkokDateTime(assignment.completedAt)}` : ""}
                    </p>
                  </div>
                  {assignment.status === "approved" ? (
                    <span className="text-xs font-semibold text-emerald-700">Approved</span>
                  ) : (
                    <span className="text-xs font-medium text-slate-600">{workflowAssignmentStatusLabel(assignment.status)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Circle className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span>Completed</span>
        </div>
      </div>
    </div>
  );
}
