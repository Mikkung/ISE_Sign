import type { ProjectStatus, UserRole } from "./types";

export type ProjectEditabilityReason =
  | "editable"
  | "approval_started"
  | "completed"
  | "cancelled"
  | "rejected"
  | "not_owner"
  | "not_authorized"
  | "inactive_profile";

export interface ProjectEditability {
  allowed: boolean;
  reason: ProjectEditabilityReason;
  message: string;
}

export interface ProjectEditabilityInput {
  role: UserRole;
  userId: string;
  isActive: boolean;
  studentId: string;
  status: ProjectStatus;
  validApprovalActionCount: number;
  staffCanManage?: boolean;
}

const preApprovalEditableStatuses = new Set<ProjectStatus>([
  "draft",
  "submitted",
  "staff_review",
  "approval_pending"
]);
const adminEditableStatuses = new Set<ProjectStatus>([
  "draft",
  "submitted",
  "staff_review",
  "revision_required"
]);
const staffEditableStatuses = new Set<ProjectStatus>([
  "submitted",
  "staff_review"
]);
const progressedApprovalStatuses = new Set<ProjectStatus>([
  "staff_approved",
  "approval_pending",
  "partially_approved",
  "approved"
]);

function locked(reason: ProjectEditabilityReason, message: string): ProjectEditability {
  return { allowed: false, reason, message };
}

export function getProjectEditabilityMessage(reason: ProjectEditabilityReason) {
  switch (reason) {
    case "completed":
      return "This project is completed and can no longer be edited.";
    case "cancelled":
      return "This project has been cancelled and can no longer be edited.";
    case "rejected":
      return "This project has been rejected and can no longer be edited.";
    case "approval_started":
      return "This project can no longer be edited because approval has already started.";
    case "inactive_profile":
      return "Your account is not active.";
    case "not_owner":
      return "You can edit only your own project.";
    case "not_authorized":
      return "You are not authorized to edit this project.";
    case "editable":
      return "Project editing is available.";
  }
}

export function getStaleProjectEditMessage(reason: ProjectEditabilityReason) {
  if (reason === "approval_started") {
    return "This project changed while you were editing it. Approval has started, so further edits are locked.";
  }

  return getProjectEditabilityMessage(reason);
}

export function getProjectEditability(input: ProjectEditabilityInput): ProjectEditability {
  if (!input.isActive) {
    return locked("inactive_profile", getProjectEditabilityMessage("inactive_profile"));
  }

  if (input.status === "completed") {
    return locked("completed", getProjectEditabilityMessage("completed"));
  }

  if (input.status === "cancelled") {
    return locked("cancelled", getProjectEditabilityMessage("cancelled"));
  }

  if (input.status === "rejected") {
    return locked("rejected", getProjectEditabilityMessage("rejected"));
  }

  const isRequesterOwner = input.studentId === input.userId;
  const isAuthorizedAdmin = input.role === "admin";
  const isAuthorizedStaff = input.role === "staff" && input.staffCanManage === true;

  if (!isRequesterOwner && !isAuthorizedAdmin && !isAuthorizedStaff) {
    return locked(input.role === "student" ? "not_owner" : "not_authorized", getProjectEditabilityMessage(input.role === "student" ? "not_owner" : "not_authorized"));
  }

  if (input.status === "revision_required" && (isRequesterOwner || isAuthorizedAdmin)) {
    return { allowed: true, reason: "editable", message: getProjectEditabilityMessage("editable") };
  }

  if (input.validApprovalActionCount > 0) {
    return locked("approval_started", getProjectEditabilityMessage("approval_started"));
  }

  if (isRequesterOwner && preApprovalEditableStatuses.has(input.status)) {
    return { allowed: true, reason: "editable", message: getProjectEditabilityMessage("editable") };
  }

  if (isAuthorizedAdmin && adminEditableStatuses.has(input.status)) {
    return { allowed: true, reason: "editable", message: getProjectEditabilityMessage("editable") };
  }

  if (isAuthorizedStaff && staffEditableStatuses.has(input.status)) {
    return { allowed: true, reason: "editable", message: getProjectEditabilityMessage("editable") };
  }

  if (progressedApprovalStatuses.has(input.status)) {
    return locked("approval_started", getProjectEditabilityMessage("approval_started"));
  }

  return locked("not_authorized", getProjectEditabilityMessage("not_authorized"));
}

export function getStudentWorkflowEditability(input: ProjectEditabilityInput): ProjectEditability {
  if (!input.isActive) {
    return locked("inactive_profile", getProjectEditabilityMessage("inactive_profile"));
  }

  if (input.status === "completed") {
    return locked("completed", getProjectEditabilityMessage("completed"));
  }

  if (input.status === "cancelled") {
    return locked("cancelled", getProjectEditabilityMessage("cancelled"));
  }

  if (input.status === "rejected") {
    return locked("rejected", getProjectEditabilityMessage("rejected"));
  }

  if (input.studentId !== input.userId) {
    return locked(input.role === "student" ? "not_owner" : "not_authorized", getProjectEditabilityMessage(input.role === "student" ? "not_owner" : "not_authorized"));
  }

  if (input.validApprovalActionCount > 0) {
    return locked("approval_started", getProjectEditabilityMessage("approval_started"));
  }

  if (preApprovalEditableStatuses.has(input.status) || input.status === "revision_required") {
    return { allowed: true, reason: "editable", message: getProjectEditabilityMessage("editable") };
  }

  return locked("approval_started", getProjectEditabilityMessage("approval_started"));
}
