import { describe, expect, it } from "vitest";
import type { ApprovalAction, WorkflowStep } from "./types";
import {
  canActivateWorkflow,
  canAddApproverAfterActivation,
  canRecordDecision,
  canRemoveApprover,
  getActiveSteps,
  hasValidMinimumApprovalCount,
  invalidatedApprovalIdsForRestart,
  isStepComplete,
  shouldReturnRevisionToStaff,
  validApprovalCount
} from "./workflow";

const baseApprover = {
  id: "assignment-1",
  profile: {
    id: "profile-1",
    displayName: "Approver",
    email: "approver@example.edu",
    role: "approver" as const
  },
  reminderCount: 0,
  escalationLevel: 0
};

function step(overrides: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: "step-1",
    name: "Step",
    order: 1,
    assigneeRole: "approver",
    assignmentMode: "specific_users",
    mode: "sequential",
    status: "in_progress",
    completionRule: "all",
    minimumApprovals: null,
    certificationRequired: true,
    commentsRequired: false,
    revisionAllowed: true,
    approvers: [],
    ...overrides
  };
}

describe("workflow rules", () => {
  it("prevents activation without approvers", () => {
    expect(canActivateWorkflow([step({ approvers: [] })])).toBe(false);
  });

  it("starts only the first incomplete sequential step", () => {
    const steps = [
      step({
        id: "step-1",
        order: 1,
        mode: "sequential",
        approvers: [{ ...baseApprover, status: "waiting" }]
      }),
      step({
        id: "step-2",
        order: 2,
        mode: "sequential",
        approvers: [{ ...baseApprover, id: "assignment-2", status: "waiting" }]
      })
    ];

    expect(getActiveSteps(steps).map((activeStep) => activeStep.id)).toEqual(["step-1"]);
  });

  it("starts parallel assignments together inside a step", () => {
    const parallel = step({
      mode: "parallel",
      approvers: [
        { ...baseApprover, id: "a1", status: "waiting" },
        { ...baseApprover, id: "a2", status: "waiting" }
      ]
    });

    expect(getActiveSteps([parallel])[0].approvers).toHaveLength(2);
  });

  it("does not start the next step while an earlier parallel step is incomplete", () => {
    const steps = [
      step({
        id: "step-1",
        order: 1,
        mode: "parallel",
        approvers: [
          { ...baseApprover, id: "a1", status: "approved" },
          { ...baseApprover, id: "a2", status: "waiting" }
        ]
      }),
      step({
        id: "step-2",
        order: 2,
        mode: "sequential",
        approvers: [{ ...baseApprover, id: "a3", status: "waiting" }]
      })
    ];

    expect(getActiveSteps(steps).map((activeStep) => activeStep.id)).toEqual(["step-1"]);
  });

  it("evaluates all-approval completion", () => {
    expect(
      isStepComplete(
        step({
          completionRule: "all",
          approvers: [
            { ...baseApprover, id: "a1", status: "approved" },
            { ...baseApprover, id: "a2", status: "approved" }
          ]
        })
      )
    ).toBe(true);
  });

  it("evaluates any-one completion", () => {
    expect(
      isStepComplete(
        step({
          completionRule: "any",
          approvers: [
            { ...baseApprover, id: "a1", status: "approved" },
            { ...baseApprover, id: "a2", status: "waiting" }
          ]
        })
      )
    ).toBe(true);
  });

  it("evaluates minimum approval completion", () => {
    expect(
      isStepComplete(
        step({
          completionRule: "minimum",
          minimumApprovals: 2,
          approvers: [
            { ...baseApprover, id: "a1", status: "approved" },
            { ...baseApprover, id: "a2", status: "approved" },
            { ...baseApprover, id: "a3", status: "waiting" }
          ]
        })
      )
    ).toBe(true);
  });

  it("rejects invalid minimum approval counts", () => {
    expect(
      hasValidMinimumApprovalCount(
        step({
          completionRule: "minimum",
          minimumApprovals: 3,
          approvers: [
            { ...baseApprover, id: "a1", status: "approved" },
            { ...baseApprover, id: "a2", status: "approved" }
          ]
        })
      )
    ).toBe(false);

    expect(
      isStepComplete(
        step({
          completionRule: "minimum",
          minimumApprovals: 3,
          approvers: [
            { ...baseApprover, id: "a1", status: "approved" },
            { ...baseApprover, id: "a2", status: "approved" }
          ]
        })
      )
    ).toBe(false);
  });

  it("prevents duplicate decisions for an active assignment", () => {
    const actions: ApprovalAction[] = [
      {
        id: "action-1",
        assignmentId: "assignment-1",
        projectId: "project-1",
        workflowStepId: "step-1",
        approverId: "approver-1",
        decision: "approved",
        documentVersionId: "doc-v1",
        documentHash: "a".repeat(64)
      }
    ];

    expect(canRecordDecision("assignment-1", "opened", actions)).toBe(false);
    expect(canRecordDecision("assignment-2", "opened", actions)).toBe(true);
    expect(canRecordDecision("assignment-3", "approved", [])).toBe(false);
  });

  it("prevents removing an approver who already decided", () => {
    expect(canRemoveApprover({ ...baseApprover, status: "approved" })).toBe(false);
  });

  it("requires a reason when adding an approver after activation", () => {
    expect(canAddApproverAfterActivation("")).toBe(false);
    expect(canAddApproverAfterActivation("Additional specialist review")).toBe(true);
  });

  it("returns revision to staff when no approval exists", () => {
    expect(shouldReturnRevisionToStaff([])).toBe(true);
  });

  it("preserves history when a revision happens after approval", () => {
    const actions: ApprovalAction[] = [
      {
        id: "action-1",
        assignmentId: "assignment-1",
        projectId: "project-1",
        workflowStepId: "step-1",
        approverId: "approver-1",
        decision: "approved",
        documentVersionId: "doc-v1",
        documentHash: "a".repeat(64)
      }
    ];

    expect(shouldReturnRevisionToStaff(actions)).toBe(false);
    expect(actions).toHaveLength(1);
  });

  it("does not count invalidated approvals toward completion", () => {
    const actions: ApprovalAction[] = [
      {
        id: "action-1",
        assignmentId: "assignment-1",
        projectId: "project-1",
        workflowStepId: "step-1",
        approverId: "approver-1",
        decision: "approved",
        documentVersionId: "doc-v1",
        documentHash: "a".repeat(64),
        invalidatedAt: "2026-07-02T00:00:00Z"
      },
      {
        id: "action-2",
        assignmentId: "assignment-2",
        projectId: "project-1",
        workflowStepId: "step-2",
        approverId: "approver-2",
        decision: "approved",
        documentVersionId: "doc-v2",
        documentHash: "b".repeat(64)
      }
    ];

    expect(validApprovalCount(actions)).toBe(1);
  });

  it("invalidates only approvals in restarted steps", () => {
    const actions: ApprovalAction[] = [
      {
        id: "action-1",
        projectId: "project-1",
        workflowStepId: "step-1",
        approverId: "approver-1",
        decision: "approved",
        documentVersionId: "doc-v1",
        documentHash: "a".repeat(64)
      },
      {
        id: "action-2",
        projectId: "project-1",
        workflowStepId: "step-2",
        approverId: "approver-2",
        decision: "approved",
        documentVersionId: "doc-v1",
        documentHash: "a".repeat(64)
      }
    ];

    expect(invalidatedApprovalIdsForRestart(actions, ["step-2"])).toEqual(["action-2"]);
  });
});
