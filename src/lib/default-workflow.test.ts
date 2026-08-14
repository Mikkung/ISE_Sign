import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkflowPlan,
  defaultFacultyApprovalStepName,
  defaultStaffReviewStepName
} from "./default-workflow";

describe("default approval workflow", () => {
  it("uses the required default step names", () => {
    expect(defaultStaffReviewStepName).toBe("Staff Review");
    expect(defaultFacultyApprovalStepName).toBe("Faculty Approval");
  });

  it("assigns all active Staff users to Step 1 and active Approvers to Step 2", () => {
    expect(
      buildDefaultWorkflowPlan([
        { id: "staff-1", role: "staff", isActive: true },
        { id: "staff-2", role: "staff", isActive: true },
        { id: "approver-1", role: "approver", isActive: true },
        { id: "admin-1", role: "admin", isActive: true },
        { id: "inactive-staff", role: "staff", isActive: false },
        { id: "inactive-approver", role: "approver", isActive: false }
      ])
    ).toEqual({
      ok: true,
      staffApproverIds: ["staff-1", "staff-2"],
      facultyApproverIds: ["approver-1"]
    });
  });

  it("does not create a partial plan when active Staff reviewers are missing", () => {
    expect(buildDefaultWorkflowPlan([{ id: "approver-1", role: "approver", isActive: true }])).toEqual({
      ok: false,
      message: "No active Staff reviewers are configured."
    });
  });

  it("does not create a partial plan when active Faculty Approvers are missing", () => {
    expect(buildDefaultWorkflowPlan([{ id: "staff-1", role: "staff", isActive: true }])).toEqual({
      ok: false,
      message: "No active Faculty Approvers are configured."
    });
  });

  it("uses the canonical workflow configuration URL in local navigation", () => {
    const staffReviewPage = readFileSync(join(process.cwd(), "src/app/staff/review/[projectId]/page.tsx"), "utf8");
    const projectPage = readFileSync(join(process.cwd(), "src/app/projects/[projectId]/page.tsx"), "utf8");

    expect(staffReviewPage).toContain("/workflow");
    expect(projectPage).toContain("/workflow");
    expect(`${staffReviewPage}\n${projectPage}`).not.toMatch(/approval-sequence|approval-sequences|workflow\/new/);
  });
});
