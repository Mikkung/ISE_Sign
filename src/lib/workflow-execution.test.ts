import { describe, expect, it } from "vitest";
import { planWorkflowAfterDecision, type WorkflowExecutionStep } from "./workflow-execution";

function step(overrides: Partial<WorkflowExecutionStep> = {}): WorkflowExecutionStep {
  return {
    id: "step-1",
    order: 1,
    status: "in_progress",
    completionRule: "any",
    minimumApprovals: null,
    assignments: [{ id: "assignment-1", status: "waiting" }],
    ...overrides
  };
}

function approvedStep(overrides: Partial<WorkflowExecutionStep> = {}) {
  return step({
    assignments: [{ id: "assignment-1", status: "approved" }],
    ...overrides
  });
}

describe("generic workflow execution", () => {
  it("completes a one-step Staff workflow when any one assignee approves", () => {
    const plan = planWorkflowAfterDecision([approvedStep()]);

    expect(plan.projectStatus).toBe("completed");
    expect(plan.activeStepId).toBeNull();
    expect(plan.stepUpdates).toEqual([{ id: "step-1", status: "completed", completed: true }]);
  });

  it("completes a one-step Faculty workflow when any one assignee approves", () => {
    const plan = planWorkflowAfterDecision([approvedStep({ id: "faculty-step" })]);

    expect(plan.projectStatus).toBe("completed");
    expect(plan.stepUpdates).toContainEqual({ id: "faculty-step", status: "completed", completed: true });
  });

  it("uses the same terminal behavior for a one-step signed Staff approval", () => {
    const plan = planWorkflowAfterDecision([approvedStep({ id: "signed-staff-step" })]);

    expect(plan.projectStatus).toBe("completed");
    expect(plan.activeStepId).toBeNull();
  });

  it("uses the same terminal behavior for a one-step unsigned Faculty approval", () => {
    const plan = planWorkflowAfterDecision([approvedStep({ id: "unsigned-faculty-step" })]);

    expect(plan.projectStatus).toBe("completed");
    expect(plan.activeStepId).toBeNull();
  });

  it("advances Staff to Faculty and then completes", () => {
    const afterStaff = planWorkflowAfterDecision([
      approvedStep({ id: "staff-step", order: 1 }),
      step({ id: "faculty-step", order: 2, status: "waiting", assignments: [{ id: "faculty-assignment", status: "waiting" }] })
    ]);

    expect(afterStaff.projectStatus).toBe("approval_pending");
    expect(afterStaff.activeStepId).toBe("faculty-step");
    expect(afterStaff.stepUpdates).toContainEqual({ id: "staff-step", status: "completed", completed: true });
    expect(afterStaff.stepUpdates).toContainEqual({ id: "faculty-step", status: "in_progress", active: true });

    const afterFaculty = planWorkflowAfterDecision([
      approvedStep({ id: "staff-step", order: 1 }),
      approvedStep({ id: "faculty-step", order: 2, assignments: [{ id: "faculty-assignment", status: "approved" }] })
    ]);

    expect(afterFaculty.projectStatus).toBe("completed");
    expect(afterFaculty.activeStepId).toBeNull();
  });

  it("advances Faculty to Staff without assuming Staff must be first", () => {
    const afterFaculty = planWorkflowAfterDecision([
      approvedStep({ id: "faculty-step", order: 1 }),
      step({ id: "staff-step", order: 2, status: "waiting", assignments: [{ id: "staff-assignment", status: "waiting" }] })
    ]);

    expect(afterFaculty.projectStatus).toBe("approval_pending");
    expect(afterFaculty.activeStepId).toBe("staff-step");

    const afterStaff = planWorkflowAfterDecision([
      approvedStep({ id: "faculty-step", order: 1 }),
      approvedStep({ id: "staff-step", order: 2, assignments: [{ id: "staff-assignment", status: "approved" }] })
    ]);

    expect(afterStaff.projectStatus).toBe("completed");
  });

  it("advances one step at a time through Staff, Faculty, Staff", () => {
    const afterFirst = planWorkflowAfterDecision([
      approvedStep({ id: "staff-1", order: 1 }),
      step({ id: "faculty", order: 2, status: "waiting", assignments: [{ id: "faculty-a", status: "waiting" }] }),
      step({ id: "staff-2", order: 3, status: "waiting", assignments: [{ id: "staff-2-a", status: "waiting" }] })
    ]);
    expect(afterFirst.activeStepId).toBe("faculty");

    const afterSecond = planWorkflowAfterDecision([
      approvedStep({ id: "staff-1", order: 1 }),
      approvedStep({ id: "faculty", order: 2, assignments: [{ id: "faculty-a", status: "approved" }] }),
      step({ id: "staff-2", order: 3, status: "waiting", assignments: [{ id: "staff-2-a", status: "waiting" }] })
    ]);
    expect(afterSecond.activeStepId).toBe("staff-2");

    const afterThird = planWorkflowAfterDecision([
      approvedStep({ id: "staff-1", order: 1 }),
      approvedStep({ id: "faculty", order: 2, assignments: [{ id: "faculty-a", status: "approved" }] }),
      approvedStep({ id: "staff-2", order: 3, assignments: [{ id: "staff-2-a", status: "approved" }] })
    ]);
    expect(afterThird.projectStatus).toBe("completed");
  });

  it("invalidates remaining pending assignments when any one approval satisfies a step", () => {
    const plan = planWorkflowAfterDecision([
      step({
        completionRule: "any",
        assignments: [
          { id: "approved", status: "approved" },
          { id: "pending", status: "waiting" }
        ]
      })
    ]);

    expect(plan.projectStatus).toBe("completed");
    expect(plan.invalidateAssignmentIds).toEqual(["pending"]);
  });

  it("does not advance an all-approval step until every active assignee approves", () => {
    const waiting = planWorkflowAfterDecision([
      step({
        completionRule: "all",
        assignments: [
          { id: "approved", status: "approved" },
          { id: "pending", status: "waiting" }
        ]
      })
    ]);
    expect(waiting.projectStatus).toBe("approval_pending");
    expect(waiting.activeStepId).toBe("step-1");

    const complete = planWorkflowAfterDecision([
      step({
        completionRule: "all",
        assignments: [
          { id: "approved-1", status: "approved" },
          { id: "approved-2", status: "approved" }
        ]
      })
    ]);
    expect(complete.projectStatus).toBe("completed");
  });

  it("advances exactly when minimum approvals are reached", () => {
    const waiting = planWorkflowAfterDecision([
      step({
        completionRule: "minimum",
        minimumApprovals: 2,
        assignments: [
          { id: "approved", status: "approved" },
          { id: "pending", status: "waiting" },
          { id: "other", status: "waiting" }
        ]
      })
    ]);
    expect(waiting.projectStatus).toBe("approval_pending");

    const complete = planWorkflowAfterDecision([
      step({
        completionRule: "minimum",
        minimumApprovals: 2,
        assignments: [
          { id: "approved-1", status: "approved" },
          { id: "approved-2", status: "approved" },
          { id: "pending", status: "waiting" }
        ]
      })
    ]);
    expect(complete.projectStatus).toBe("completed");
    expect(complete.invalidateAssignmentIds).toEqual(["pending"]);
  });
});
