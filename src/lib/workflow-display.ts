import type { Project, WorkflowApprover, WorkflowAssigneeRole, WorkflowStep } from "./types";

const pendingStatuses = new Set(["waiting", "opened"]);

export function workflowRoleLabel(role: WorkflowAssigneeRole) {
  switch (role) {
    case "staff":
      return "Staff";
    case "approver":
      return "Faculty Approver";
    case "admin":
      return "Admin";
  }
}

export function workflowAssignmentStatusLabel(status: WorkflowApprover["status"]) {
  switch (status) {
    case "approved":
      return "Approved";
    case "opened":
      return "Opened";
    case "waiting":
      return "Waiting";
    case "rejected":
      return "Rejected";
    case "revision_requested":
      return "Revision Required";
    case "invalidated":
      return "Invalidated";
  }
}

export function workflowStepStatusLabel(status: WorkflowStep["status"]) {
  switch (status) {
    case "completed":
    case "approved":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "waiting":
      return "Waiting";
    case "not_started":
      return "Not Started";
    case "revision_required":
      return "Revision Required";
    case "rejected":
      return "Rejected";
    case "skipped":
      return "Skipped";
    case "overdue":
      return "Overdue";
  }
}

export function signatureRequirementLabel(step: WorkflowStep) {
  return step.certificationRequired ? "Signature Required" : "Approval Only";
}

export function completionRuleLabel(step: WorkflowStep) {
  switch (step.completionRule) {
    case "all":
      return "All assigned approvers must approve";
    case "any":
      return "Any one assigned approver may approve";
    case "minimum":
      return `${step.minimumApprovals ?? 1} approval${(step.minimumApprovals ?? 1) === 1 ? "" : "s"} required`;
  }
}

export function activeWorkflowStep(project: Project) {
  return project.workflow.find((step) => step.status === "in_progress") ?? null;
}

export function pendingAssignments(step: WorkflowStep | null) {
  return step?.approvers.filter((assignment) => pendingStatuses.has(assignment.status)) ?? [];
}

export function approvedAssignmentCount(step: WorkflowStep) {
  return step.approvers.filter((assignment) => assignment.status === "approved").length;
}

export function waitingSince(assignments: WorkflowApprover[]) {
  const timestamps = assignments
    .map((assignment) => assignment.assignedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.min(...timestamps));
}

export function formatBangkokDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

export function waitingDurationLabel(since: Date | null, now = new Date()) {
  if (!since) return "-";
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));

  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function waitingForSummary(step: WorkflowStep | null) {
  if (!step) return "-";
  const waiting = pendingAssignments(step);

  if (waiting.length === 0) {
    return "-";
  }

  const first = waiting[0];
  if (waiting.length === 1) {
    return `${first.profile.displayName} · ${workflowRoleLabel(step.assigneeRole)}`;
  }

  return `${first.profile.displayName} + ${waiting.length - 1} other${waiting.length === 2 ? "" : "s"}`;
}

export function nextWorkflowStepAfter(project: Project, step: WorkflowStep | null) {
  const ordered = [...project.workflow].sort((left, right) => left.order - right.order);
  const currentOrder = step?.order ?? 0;

  return ordered.find((candidate) =>
    candidate.order > currentOrder &&
    !["completed", "cancelled", "skipped", "rejected", "revision_required"].includes(candidate.status)
  ) ?? null;
}
