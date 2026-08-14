import type { CompletionRule, UserRole, WorkflowAssignmentMode, WorkflowAssigneeRole } from "./types";

export type WorkflowStepRole = WorkflowAssigneeRole;
export type WorkflowSelectionMode = WorkflowAssignmentMode;

export interface WorkflowProfileOption {
  id: string;
  displayName: string;
  position: string | null;
  role: UserRole;
  isActive: boolean;
}

export interface StudentWorkflowStepInput {
  id?: string;
  name: string;
  role: WorkflowStepRole;
  selectionMode: WorkflowSelectionMode;
  approverIds: string[];
  completionRule: CompletionRule;
  minimumApprovals: number | null;
  requiresSignature: boolean;
  dueAt: string | null;
}

export interface ResolvedStudentWorkflowStep {
  name: string;
  role: WorkflowStepRole;
  assignmentMode: WorkflowSelectionMode;
  approverIds: string[];
  completionRule: CompletionRule;
  minimumApprovals: number | null;
  requiresSignature: boolean;
  dueAt: string | null;
}

export function activeOptionsForRole(profiles: WorkflowProfileOption[], role: WorkflowStepRole) {
  return profiles.filter((profile) => profile.isActive && profile.role === role);
}

export function labelForWorkflowRole(role: WorkflowStepRole) {
  switch (role) {
    case "staff":
      return "Staff";
    case "approver":
      return "Faculty Approver";
    case "admin":
      return "Admin";
  }
}

export function validateStudentWorkflow(input: {
  requesterId: string;
  steps: StudentWorkflowStepInput[];
  profiles: WorkflowProfileOption[];
}) {
  if (input.steps.length < 1) {
    return { ok: false as const, message: "The workflow must contain at least one approval step." };
  }

  const resolved: ResolvedStudentWorkflowStep[] = [];

  for (const [index, step] of input.steps.entries()) {
    if (!["staff", "approver", "admin"].includes(step.role)) {
      return { ok: false as const, message: `Step ${index + 1} has an invalid approver role.` };
    }

    if (!step.name.trim()) {
      return { ok: false as const, message: `Step ${index + 1} needs a step name.` };
    }

    const roleOptions = activeOptionsForRole(input.profiles, step.role).filter((profile) => profile.id !== input.requesterId);
    const profileMap = new Map(roleOptions.map((profile) => [profile.id, profile]));
    const approverIds = step.selectionMode === "any_active_role" ? roleOptions.map((profile) => profile.id) : step.approverIds;
    const uniqueApproverIds = [...new Set(approverIds)];

    if (uniqueApproverIds.length !== approverIds.length) {
      return { ok: false as const, message: `Step ${index + 1} has duplicate approvers.` };
    }

    if (uniqueApproverIds.length === 0) {
      return { ok: false as const, message: `Step ${index + 1} needs at least one active ${labelForWorkflowRole(step.role)}.` };
    }

    for (const approverId of uniqueApproverIds) {
      if (!profileMap.has(approverId)) {
        return { ok: false as const, message: `Step ${index + 1} includes an invalid approver.` };
      }
    }

    if (step.completionRule === "minimum") {
      if (!step.minimumApprovals || step.minimumApprovals < 1 || step.minimumApprovals > uniqueApproverIds.length) {
        return { ok: false as const, message: `Step ${index + 1} has an invalid minimum approval count.` };
      }
    }

    resolved.push({
      name: step.name.trim(),
      role: step.role,
      assignmentMode: step.selectionMode,
      approverIds: uniqueApproverIds,
      completionRule: step.completionRule,
      minimumApprovals: step.completionRule === "minimum" ? step.minimumApprovals : null,
      requiresSignature: step.requiresSignature,
      dueAt: step.dueAt
    });
  }

  return { ok: true as const, steps: resolved };
}

export function defaultStudentWorkflow(): StudentWorkflowStepInput[] {
  return [
    {
      name: "Staff Review",
      role: "staff",
      selectionMode: "any_active_role",
      approverIds: [],
      completionRule: "any",
      minimumApprovals: null,
      requiresSignature: false,
      dueAt: null
    },
    {
      name: "Faculty Approval",
      role: "approver",
      selectionMode: "any_active_role",
      approverIds: [],
      completionRule: "any",
      minimumApprovals: null,
      requiresSignature: true,
      dueAt: null
    }
  ];
}
