import { projectStatusLabels, workflowStatusLabels } from "@/lib/constants";
import type { ProjectStatus, WorkflowStepStatus } from "@/lib/types";

type StatusBadgeProps = {
  status: ProjectStatus | WorkflowStepStatus;
};

const toneByStatus: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-50 text-blue-700",
  staff_review: "bg-amber-50 text-amber-800",
  revision_required: "bg-orange-50 text-orange-800",
  staff_approved: "bg-emerald-50 text-emerald-700",
  approval_pending: "bg-purple-50 text-purple-700",
  partially_approved: "bg-indigo-50 text-indigo-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-emerald-50 text-emerald-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
  not_started: "bg-slate-100 text-slate-600",
  waiting: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-800",
  skipped: "bg-slate-100 text-slate-500",
  overdue: "bg-red-50 text-red-700"
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label =
    projectStatusLabels[status as ProjectStatus] ?? workflowStatusLabels[status as WorkflowStepStatus];

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${toneByStatus[status]}`}>
      {label}
    </span>
  );
}
