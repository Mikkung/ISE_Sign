import type { CompletionRule, ProjectStatus, WorkflowStepStatus } from "./types";

export type WorkflowExecutionAssignmentStatus =
  | "waiting"
  | "opened"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "invalidated"
  | "cancelled";

export interface WorkflowExecutionAssignment {
  id: string;
  status: WorkflowExecutionAssignmentStatus;
}

export interface WorkflowExecutionStep {
  id: string;
  order: number;
  status: WorkflowStepStatus;
  completionRule: CompletionRule;
  minimumApprovals: number | null;
  assignments: WorkflowExecutionAssignment[];
}

export interface WorkflowExecutionPlan {
  stepUpdates: Array<{
    id: string;
    status: WorkflowStepStatus;
    completed?: boolean;
    active?: boolean;
  }>;
  invalidateAssignmentIds: string[];
  projectStatus: ProjectStatus;
  activeStepId: string | null;
  terminal: boolean;
}

const pendingAssignmentStatuses = new Set<WorkflowExecutionAssignmentStatus>(["waiting", "opened"]);
const inactiveAssignmentStatuses = new Set<WorkflowExecutionAssignmentStatus>(["invalidated", "cancelled"]);

function validAssignments(step: WorkflowExecutionStep) {
  return step.assignments.filter((assignment) => !inactiveAssignmentStatuses.has(assignment.status));
}

export function isWorkflowExecutionStepSatisfied(step: WorkflowExecutionStep) {
  const assignments = validAssignments(step);
  const approved = assignments.filter((assignment) => assignment.status === "approved").length;

  switch (step.completionRule) {
    case "all":
      return assignments.length > 0 && approved === assignments.length;
    case "any":
      return approved >= 1;
    case "minimum":
      return approved >= (step.minimumApprovals ?? assignments.length);
  }
}

export function planWorkflowAfterDecision(steps: WorkflowExecutionStep[]): WorkflowExecutionPlan {
  const orderedSteps = [...steps].sort((left, right) => left.order - right.order);
  const rejectedStep = orderedSteps.find((step) =>
    validAssignments(step).some((assignment) => assignment.status === "rejected")
  );
  const revisionStep = orderedSteps.find((step) =>
    validAssignments(step).some((assignment) => assignment.status === "revision_requested")
  );

  if (rejectedStep || revisionStep) {
    const step = rejectedStep ?? revisionStep;
    const status = rejectedStep ? "rejected" : "revision_required";

    return {
      stepUpdates: step ? [{ id: step.id, status }] : [],
      invalidateAssignmentIds: [],
      projectStatus: status,
      activeStepId: null,
      terminal: true
    };
  }

  const stepUpdates: WorkflowExecutionPlan["stepUpdates"] = [];
  const invalidateAssignmentIds: string[] = [];
  let activeStepId: string | null = null;

  for (const step of orderedSteps) {
    if (isWorkflowExecutionStepSatisfied(step)) {
      stepUpdates.push({ id: step.id, status: "completed", completed: true });

      if (step.completionRule !== "all") {
        invalidateAssignmentIds.push(
          ...step.assignments
            .filter((assignment) => pendingAssignmentStatuses.has(assignment.status))
            .map((assignment) => assignment.id)
        );
      }

      continue;
    }

    if (!activeStepId) {
      activeStepId = step.id;
      stepUpdates.push({ id: step.id, status: "in_progress", active: true });
    } else {
      stepUpdates.push({ id: step.id, status: "waiting" });
    }
  }

  return {
    stepUpdates,
    invalidateAssignmentIds,
    projectStatus: activeStepId ? "approval_pending" : "completed",
    activeStepId,
    terminal: !activeStepId
  };
}
