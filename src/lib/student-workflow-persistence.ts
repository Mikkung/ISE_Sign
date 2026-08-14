import type { CompletionRule } from "./types";
import type { ResolvedStudentWorkflowStep, StudentWorkflowStepInput, WorkflowSelectionMode, WorkflowStepRole } from "./student-workflow";

export interface ExistingStudentWorkflowStep {
  id: string;
  name: string;
  step_order: number;
  completion_rule: CompletionRule;
  minimum_approvals: number | null;
  assignee_role?: WorkflowStepRole | null;
  assignment_mode?: WorkflowSelectionMode | null;
  certification_required: boolean;
  due_at?: string | null;
  workflow_assignments?: Array<{ id?: string; approver_id: string }> | null;
}

export interface StudentWorkflowRpcStep {
  id: string | null;
  name: string;
  role: WorkflowStepRole;
  assignmentMode: WorkflowSelectionMode;
  approverIds: string[];
  completionRule: CompletionRule;
  minimumApprovals: number | null;
  requiresSignature: boolean;
  dueAt: string | null;
}

export type StudentWorkflowChangeKind = "created" | "signer_only" | "structural";

export function buildStudentWorkflowRpcSteps(
  submittedSteps: StudentWorkflowStepInput[],
  resolvedSteps: ResolvedStudentWorkflowStep[]
): StudentWorkflowRpcStep[] {
  return resolvedSteps.map((step, index) => ({
    id: submittedSteps[index]?.id ?? null,
    name: step.name,
    role: step.role,
    assignmentMode: step.assignmentMode,
    approverIds: step.approverIds,
    completionRule: step.completionRule,
    minimumApprovals: step.minimumApprovals,
    requiresSignature: step.requiresSignature,
    dueAt: step.dueAt
  }));
}

export function getStudentWorkflowChangeKind(
  existingSteps: ExistingStudentWorkflowStep[],
  requestedSteps: StudentWorkflowRpcStep[],
  intent?: string
): StudentWorkflowChangeKind {
  if (existingSteps.length === 0) {
    return "created";
  }

  if (intent === "restore_default" || existingSteps.length !== requestedSteps.length) {
    return "structural";
  }

  const existingByOrder = [...existingSteps].sort((left, right) => left.step_order - right.step_order);

  for (const [index, requested] of requestedSteps.entries()) {
    const existing = existingByOrder[index];
    const sameExistingStep = requested.id && existing?.id === requested.id;
    const sameOrder = existing?.step_order === index + 1;
    const existingRole = existing?.assignee_role ?? (existing?.certification_required ? "approver" : "staff");
    const sameRoleType = existingRole === requested.role;

    if (!sameExistingStep || !sameOrder || !sameRoleType || existing?.certification_required !== requested.requiresSignature) {
      return "structural";
    }
  }

  return "signer_only";
}

export function summarizeStudentWorkflow(steps: ExistingStudentWorkflowStep[]) {
  return [...steps]
    .sort((left, right) => left.step_order - right.step_order)
    .map((step) => ({
      id: step.id,
      name: step.name,
      order: step.step_order,
      completionRule: step.completion_rule,
      minimumApprovals: step.minimum_approvals,
      approverIds: [...(step.workflow_assignments ?? []).map((assignment) => assignment.approver_id)].sort()
    }));
}

export function simulateSignerOnlyWorkflowSave(
  existingSteps: ExistingStudentWorkflowStep[],
  requestedSteps: StudentWorkflowRpcStep[]
) {
  if (getStudentWorkflowChangeKind(existingSteps, requestedSteps) !== "signer_only") {
    throw new Error("The requested workflow is not a signer-only edit.");
  }

  const existingByOrder = [...existingSteps].sort((left, right) => left.step_order - right.step_order);

  return existingByOrder.map((existing, index) => {
    const requested = requestedSteps[index];
    const retainedAssignments = new Map(
      (existing.workflow_assignments ?? []).map((assignment) => [assignment.approver_id, assignment])
    );

    return {
      id: existing.id,
      step_order: existing.step_order,
      name: requested.name,
      completion_rule: requested.completionRule,
      minimum_approvals: requested.completionRule === "minimum" ? requested.minimumApprovals : null,
      assignee_role: requested.role,
      assignment_mode: requested.assignmentMode,
      certification_required: requested.requiresSignature,
      due_at: requested.dueAt,
      workflow_assignments: requested.approverIds.map((approverId) => ({
        id: retainedAssignments.get(approverId)?.id ?? `new:${existing.id}:${approverId}`,
        approver_id: approverId
      }))
    };
  });
}
