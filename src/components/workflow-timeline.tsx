import { Check, Clock, GitBranch } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WorkflowStep } from "@/lib/types";

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
      {steps
        .sort((a, b) => a.order - b.order)
        .map((step) => (
          <div key={step.id} className="rounded border border-slate-200 bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {step.mode === "parallel" ? (
                    <GitBranch className="h-4 w-4 text-ise-maroon" aria-hidden="true" />
                  ) : (
                    <Clock className="h-4 w-4 text-ise-maroon" aria-hidden="true" />
                  )}
                  <h3 className="font-semibold text-slate-950">{step.name}</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {step.mode === "parallel" ? "Parallel approval" : "Sequential approval"} ·{" "}
                  {step.completionRule === "all"
                    ? "All approvers must approve"
                    : step.completionRule === "any"
                      ? "Any approver may approve"
                      : `At least ${step.minimumApprovals} approver(s) must approve`}
                </p>
              </div>
              <StatusBadge status={step.status} />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {step.approvers.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{assignment.profile.displayName}</p>
                    <p className="text-xs text-slate-500">{assignment.profile.position ?? assignment.profile.role}</p>
                  </div>
                  {assignment.status === "approved" ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-label="Approved" />
                  ) : (
                    <span className="text-xs text-slate-500">{assignment.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
