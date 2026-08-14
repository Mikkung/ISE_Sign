import type {
  ApprovalAction,
  CompletionRule,
  Project,
  WorkflowApprover,
  WorkflowStep
} from "@/lib/types";

export function hasAnyApprovalAction(actions: ApprovalAction[]): boolean {
  return actions.length > 0;
}

export function canActivateWorkflow(steps: WorkflowStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.approvers.length > 0);
}

export function canRemoveApprover(approver: WorkflowApprover): boolean {
  return !["approved", "rejected", "revision_requested"].includes(approver.status);
}

export function canAddApproverAfterActivation(reason: string | null | undefined): boolean {
  return Boolean(reason && reason.trim().length >= 5);
}

export function hasValidMinimumApprovalCount(step: WorkflowStep): boolean {
  if (step.completionRule !== "minimum") {
    return true;
  }

  return Boolean(
    step.minimumApprovals &&
      step.minimumApprovals >= 1 &&
      step.minimumApprovals <= step.approvers.length
  );
}

export function isStepComplete(step: WorkflowStep): boolean {
  const approvals = step.approvers.filter((approver) => approver.status === "approved").length;
  const rejected = step.approvers.some((approver) => approver.status === "rejected");
  const revisionRequested = step.approvers.some(
    (approver) => approver.status === "revision_requested"
  );

  if (rejected || revisionRequested) {
    return false;
  }

  switch (step.completionRule satisfies CompletionRule) {
    case "all":
      return approvals === step.approvers.length && step.approvers.length > 0;
    case "any":
      return approvals >= 1;
    case "minimum":
      if (!hasValidMinimumApprovalCount(step)) {
        return false;
      }

      return approvals >= (step.minimumApprovals ?? step.approvers.length);
  }
}

export function canRecordDecision(
  assignmentId: string,
  assignmentStatus: WorkflowApprover["status"],
  actions: ApprovalAction[]
): boolean {
  return (
    ["waiting", "opened"].includes(assignmentStatus) &&
    !actions.some((action) => action.assignmentId === assignmentId && !action.invalidatedAt)
  );
}

export function getActiveSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const ordered = [...steps].sort((a, b) => a.order - b.order);

  for (const step of ordered) {
    if (step.status === "rejected" || step.status === "revision_required") {
      return [step];
    }

    if (isStepComplete(step)) {
      continue;
    }

    return [step];
  }

  return [];
}

export function nextProjectStatus(project: Pick<Project, "status" | "workflow">): Project["status"] {
  if (project.workflow.some((step) => step.status === "rejected")) {
    return "rejected";
  }

  if (project.workflow.some((step) => step.status === "revision_required")) {
    return "revision_required";
  }

  if (project.workflow.length > 0 && project.workflow.every(isStepComplete)) {
    return "completed";
  }

  return project.workflow.length > 0 ? "approval_pending" : project.status;
}

export function shouldReturnRevisionToFirstStep(actions: ApprovalAction[]): boolean {
  return !actions.some((action) => action.decision === "approved");
}

export const shouldReturnRevisionToStaff = shouldReturnRevisionToFirstStep;

export function validApprovalCount(actions: ApprovalAction[]): number {
  return actions.filter((action) => action.decision === "approved" && !action.invalidatedAt).length;
}

export function invalidatedApprovalIdsForRestart(
  actions: ApprovalAction[],
  restartStepIds: string[]
): string[] {
  const restartSet = new Set(restartStepIds);
  return actions
    .filter((action) => action.decision === "approved" && restartSet.has(action.workflowStepId))
    .map((action) => action.id);
}
