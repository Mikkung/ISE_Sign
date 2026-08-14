import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const createProjectForm = readFileSync(join(process.cwd(), "src/app/projects/new/create-project-form.tsx"), "utf8");
const approvalsPage = readFileSync(join(process.cwd(), "src/app/approvals/page.tsx"), "utf8");
const projectDetailPage = readFileSync(join(process.cwd(), "src/app/projects/[projectId]/page.tsx"), "utf8");
const approvalStatusCard = readFileSync(join(process.cwd(), "src/components/approval-status-card.tsx"), "utf8");
const projectTable = readFileSync(join(process.cwd(), "src/components/project-table.tsx"), "utf8");

describe("UAT UX polish source coverage", () => {
  it("defaults Create Project dates using local calendar-month semantics", () => {
    expect(createProjectForm).toContain("formatLocalDateInput(new Date())");
    expect(createProjectForm).toContain("addOneCalendarMonth(formatLocalDateInput(new Date()))");
    expect(createProjectForm).toContain("next.setDate(0)");
    expect(createProjectForm).toContain("endDateEdited");
    expect(createProjectForm).not.toContain("toISOString()");
  });

  it("shows explicit project back navigation and an approval status card", () => {
    expect(projectDetailPage).toContain("← Back to Projects");
    expect(projectDetailPage).toContain("<ApprovalStatusCard");
    expect(approvalStatusCard).toContain("Current Step");
    expect(approvalStatusCard).toContain("Waiting For");
    expect(approvalStatusCard).toContain("Waiting Since");
    expect(approvalStatusCard).toContain("What Comes Next");
  });

  it("splits My Approvals into action required and upcoming sections", () => {
    expect(approvalsPage).toContain("Action Required");
    expect(approvalsPage).toContain("Upcoming");
    expect(approvalsPage).toContain("Review & Sign");
    expect(approvalsPage).toContain("Review & Approve");
    expect(approvalsPage).toContain("Your action will be available after the previous step is completed.");
  });

  it("shows project list current step and waiting-for fields", () => {
    expect(projectTable).toContain("Current Step");
    expect(projectTable).toContain("Waiting For");
    expect(projectTable).toContain("signatureRequirementLabel");
    expect(projectTable).toContain("waitingForSummary");
  });
});
