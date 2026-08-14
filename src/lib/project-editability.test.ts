import { describe, expect, it } from "vitest";
import { getProjectEditability, getStaleProjectEditMessage, getStudentWorkflowEditability, type ProjectEditabilityInput } from "./project-editability";
import type { ProjectStatus } from "./types";

const base: ProjectEditabilityInput = {
  role: "student",
  userId: "student-1",
  isActive: true,
  studentId: "student-1",
  status: "draft",
  validApprovalActionCount: 0
};

function canEdit(status: ProjectStatus, validApprovalActionCount = 0) {
  return getProjectEditability({ ...base, status, validApprovalActionCount });
}

describe("project editability", () => {
  it("allows a Student to edit their own draft", () => {
    expect(canEdit("draft").allowed).toBe(true);
  });

  it("allows submitted, staff review, and approval pending before approval starts", () => {
    expect(canEdit("submitted").allowed).toBe(true);
    expect(canEdit("staff_review").allowed).toBe(true);
    expect(canEdit("approval_pending").allowed).toBe(true);
  });

  it("locks after Staff or Faculty approval action exists", () => {
    expect(canEdit("staff_review", 1)).toMatchObject({ allowed: false, reason: "approval_started" });
    expect(canEdit("approval_pending", 1)).toMatchObject({ allowed: false, reason: "approval_started" });
  });

  it("locks statuses that imply approval has progressed", () => {
    expect(canEdit("staff_approved").allowed).toBe(false);
    expect(canEdit("partially_approved").allowed).toBe(false);
    expect(canEdit("approved").allowed).toBe(false);
  });

  it("locks terminal states with specific reasons", () => {
    expect(canEdit("completed")).toMatchObject({ allowed: false, reason: "completed" });
    expect(canEdit("cancelled")).toMatchObject({ allowed: false, reason: "cancelled" });
    expect(canEdit("rejected")).toMatchObject({ allowed: false, reason: "rejected" });
  });

  it("allows revision-required editing even when prior approval actions exist", () => {
    expect(canEdit("revision_required", 2).allowed).toBe(true);
  });

  it("prevents a Student from editing another Student's project", () => {
    expect(getProjectEditability({ ...base, studentId: "student-2" })).toMatchObject({
      allowed: false,
      reason: "not_owner"
    });
  });

  it("preserves authorized Admin editing before approval starts", () => {
    expect(getProjectEditability({ ...base, role: "admin", userId: "admin-1", studentId: "student-1" }).allowed).toBe(true);
  });

  it("preserves Staff editing only for the existing submitted and staff-review path", () => {
    expect(getProjectEditability({ ...base, role: "staff", userId: "staff-1", staffCanManage: true, status: "draft" })).toMatchObject({
      allowed: false,
      reason: "not_authorized"
    });
    expect(getProjectEditability({ ...base, role: "staff", userId: "staff-1", staffCanManage: true, status: "submitted" }).allowed).toBe(true);
    expect(getProjectEditability({ ...base, role: "staff", userId: "staff-1", staffCanManage: true, status: "staff_review" }).allowed).toBe(true);
    expect(getProjectEditability({ ...base, role: "staff", userId: "staff-1", staffCanManage: true, status: "revision_required" })).toMatchObject({
      allowed: false,
      reason: "not_authorized"
    });
  });

  it("does not let Admin or Staff silently edit after approval starts", () => {
    expect(getProjectEditability({ ...base, role: "admin", userId: "admin-1", validApprovalActionCount: 1 })).toMatchObject({
      allowed: false,
      reason: "approval_started"
    });
    expect(getProjectEditability({ ...base, role: "staff", userId: "staff-1", staffCanManage: true, validApprovalActionCount: 1 })).toMatchObject({
      allowed: false,
      reason: "approval_started"
    });
  });

  it("uses a safe stale-save message instead of a runtime error", () => {
    expect(getStaleProjectEditMessage("approval_started")).toBe(
      "This project changed while you were editing it. Approval has started, so further edits are locked."
    );
  });

  it("keeps the Student workflow editor locked after any valid approval action", () => {
    expect(getStudentWorkflowEditability({ ...base, status: "approval_pending", validApprovalActionCount: 0 }).allowed).toBe(true);
    expect(getStudentWorkflowEditability({ ...base, status: "revision_required", validApprovalActionCount: 1 })).toMatchObject({
      allowed: false,
      reason: "approval_started"
    });
  });
});
