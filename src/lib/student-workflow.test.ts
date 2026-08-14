import { describe, expect, it } from "vitest";
import { defaultStudentWorkflow, validateStudentWorkflow, type WorkflowProfileOption } from "./student-workflow";

const profiles: WorkflowProfileOption[] = [
  { id: "staff-1", displayName: "Staff One", position: "Officer", role: "staff", isActive: true },
  { id: "staff-2", displayName: "Staff Two", position: "Officer", role: "staff", isActive: false },
  { id: "faculty-1", displayName: "Faculty One", position: "Lecturer", role: "approver", isActive: true },
  { id: "admin-1", displayName: "Admin One", position: "Director", role: "admin", isActive: true },
  { id: "student-1", displayName: "Student", position: null, role: "student", isActive: true }
];

describe("student workflow validation", () => {
  it("provides default Staff and Faculty steps", () => {
    expect(defaultStudentWorkflow().map((step) => step.role)).toEqual(["staff", "approver"]);
  });

  it("uses active Staff only for the Staff pool", () => {
    const result = validateStudentWorkflow({ requesterId: "student-1", steps: defaultStudentWorkflow(), profiles });
    expect(result.ok && result.steps[0].approverIds).toEqual(["staff-1"]);
  });

  it("uses active Faculty Approvers only for the Faculty pool", () => {
    const result = validateStudentWorkflow({ requesterId: "student-1", steps: defaultStudentWorkflow(), profiles });
    expect(result.ok && result.steps[1].approverIds).toEqual(["faculty-1"]);
  });

  it("allows single-step Staff, Faculty, or Admin workflows", () => {
    expect(validateStudentWorkflow({ requesterId: "student-1", steps: [defaultStudentWorkflow()[0]], profiles }).ok).toBe(true);
    expect(validateStudentWorkflow({ requesterId: "student-1", steps: [defaultStudentWorkflow()[1]], profiles }).ok).toBe(true);
    expect(validateStudentWorkflow({
      requesterId: "student-1",
      steps: [{ ...defaultStudentWorkflow()[0], role: "admin", name: "Admin Approval", requiresSignature: true }],
      profiles
    }).ok).toBe(true);
  });

  it("allows Faculty before Staff", () => {
    expect(validateStudentWorkflow({ requesterId: "student-1", steps: [...defaultStudentWorkflow()].reverse(), profiles }).ok).toBe(true);
  });

  it("prevents assigning requester or wrong-role profiles", () => {
    const steps = defaultStudentWorkflow();
    steps[0] = { ...steps[0], selectionMode: "specific_users", approverIds: ["student-1"] };
    expect(validateStudentWorkflow({ requesterId: "student-1", steps, profiles }).ok).toBe(false);
  });

  it("allows one specific Staff and one specific Faculty Approver", () => {
    const steps = [
      { ...defaultStudentWorkflow()[0], selectionMode: "specific_users" as const, approverIds: ["staff-1"] },
      { ...defaultStudentWorkflow()[1], selectionMode: "specific_users" as const, approverIds: ["faculty-1"] }
    ];
    expect(validateStudentWorkflow({ requesterId: "student-1", steps, profiles }).ok).toBe(true);
  });

  it("validates minimum approvals against selected count", () => {
    const steps = [
      { ...defaultStudentWorkflow()[0], selectionMode: "specific_users" as const, approverIds: ["staff-1"], completionRule: "minimum" as const, minimumApprovals: 2 },
      { ...defaultStudentWorkflow()[1], selectionMode: "specific_users" as const, approverIds: ["faculty-1"] }
    ];
    expect(validateStudentWorkflow({ requesterId: "student-1", steps, profiles }).ok).toBe(false);
  });
});
