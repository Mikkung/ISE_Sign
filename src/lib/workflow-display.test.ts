import { describe, expect, it } from "vitest";
import type { Project, WorkflowStep } from "./types";
import {
  activeWorkflowStep,
  completionRuleLabel,
  signatureRequirementLabel,
  waitingDurationLabel,
  waitingForSummary,
  workflowAssignmentStatusLabel,
  workflowRoleLabel
} from "./workflow-display";

const profile = {
  id: "profile-1",
  displayName: "MikTest",
  email: "mik@example.test",
  role: "staff" as const
};

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "step-1",
    name: "Review Approval",
    order: 1,
    assigneeRole: "staff",
    assignmentMode: "specific_users",
    mode: "parallel",
    status: "in_progress",
    completionRule: "any",
    minimumApprovals: null,
    certificationRequired: true,
    commentsRequired: false,
    revisionAllowed: true,
    approvers: [
      {
        id: "assignment-1",
        profile,
        status: "waiting",
        assignedAt: "2026-08-14T06:40:00.000Z",
        reminderCount: 0,
        escalationLevel: 0
      }
    ],
    ...overrides
  };
}

function project(workflow: WorkflowStep[]): Project {
  return {
    id: "project-1",
    code: "ISE-2026-TEST",
    title: "Project",
    abstract: "",
    status: "approval_pending",
    projectType: "CSR Trip",
    academicProgram: "ISE",
    student: profile,
    members: [],
    currentStep: "Review Approval",
    currentResponsible: "MikTest",
    lastActivityAt: "2026-08-14T06:40:00.000Z",
    nextAction: "Waiting for Review Approval",
    documents: [],
    comments: [],
    workflow
  };
}

describe("workflow display helpers", () => {
  it("summarizes the active generic workflow step without role-name inference", () => {
    const active = activeWorkflowStep(project([step()]));

    expect(active?.name).toBe("Review Approval");
    expect(waitingForSummary(active)).toBe("MikTest · Staff");
    expect(workflowRoleLabel(active!.assigneeRole)).toBe("Staff");
    expect(signatureRequirementLabel(active!)).toBe("Signature Required");
  });

  it("summarizes multiple waiting approvers compactly", () => {
    expect(waitingForSummary(step({
      approvers: [
        { id: "a1", profile, status: "waiting", reminderCount: 0, escalationLevel: 0 },
        { id: "a2", profile: { ...profile, id: "profile-2", displayName: "Somchai" }, status: "opened", reminderCount: 0, escalationLevel: 0 },
        { id: "a3", profile: { ...profile, id: "profile-3", displayName: "Nattapong" }, status: "waiting", reminderCount: 0, escalationLevel: 0 }
      ]
    }))).toBe("MikTest + 2 others");
  });

  it("labels completion rules, assignment states, and approval type textually", () => {
    expect(completionRuleLabel(step({ completionRule: "minimum", minimumApprovals: 2 }))).toBe("2 approvals required");
    expect(workflowAssignmentStatusLabel("revision_requested")).toBe("Revision Required");
    expect(signatureRequirementLabel(step({ certificationRequired: false }))).toBe("Approval Only");
  });

  it("formats waiting duration in human-readable units", () => {
    expect(waitingDurationLabel(new Date("2026-08-14T06:40:00.000Z"), new Date("2026-08-14T08:45:00.000Z"))).toBe("2 hrs");
  });
});
