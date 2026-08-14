import type { UserRole } from "@/lib/types";

export const defaultStaffReviewStepName = "Staff Review";
export const defaultFacultyApprovalStepName = "Faculty Approval";

export type WorkflowProfileCandidate = {
  id: string;
  role: UserRole;
  isActive?: boolean | null;
};

export type DefaultWorkflowPlan =
  | {
      ok: true;
      staffApproverIds: string[];
      facultyApproverIds: string[];
    }
  | {
      ok: false;
      message: string;
    };

export function buildDefaultWorkflowPlan(profiles: WorkflowProfileCandidate[]): DefaultWorkflowPlan {
  const activeProfiles = profiles.filter((profile) => profile.isActive !== false);
  const staffApproverIds = activeProfiles
    .filter((profile) => profile.role === "staff")
    .map((profile) => profile.id);
  const facultyApproverIds = activeProfiles
    .filter((profile) => profile.role === "approver")
    .map((profile) => profile.id);

  if (staffApproverIds.length === 0) {
    return { ok: false, message: "No active Staff reviewers are configured." };
  }

  if (facultyApproverIds.length === 0) {
    return { ok: false, message: "No active Faculty Approvers are configured." };
  }

  return { ok: true, staffApproverIds, facultyApproverIds };
}
