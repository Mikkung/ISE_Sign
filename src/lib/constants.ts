import type { ProjectStatus, WorkflowStepStatus } from "@/lib/types";

export const ISE_MAROON = "#8B2332";

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  staff_review: "Staff Review",
  revision_required: "Revision Requested",
  staff_approved: "Staff Approved",
  approval_pending: "Pending Approval",
  partially_approved: "Partially Approved",
  rejected: "Rejected",
  approved: "Approved",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const workflowStatusLabels: Record<WorkflowStepStatus, string> = {
  not_started: "Not Started",
  waiting: "Pending",
  in_progress: "In Progress",
  revision_required: "Revision Requested",
  approved: "Approved",
  rejected: "Rejected",
  skipped: "Skipped",
  completed: "Completed",
  overdue: "Overdue"
};

export const certificationStatement =
  "I confirm that I have reviewed the project information and attached documents and approve this request in my official capacity.";
