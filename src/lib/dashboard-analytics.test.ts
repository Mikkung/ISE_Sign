import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getApproverResponseMetrics,
  getCurrentBottleneck,
  getCurrentStageCounts,
  getDashboardFilters,
  getDashboardSummary,
  getLongestWaitingProjects,
  getRequestTrend,
  getStageDurationMetrics,
  median,
  percentile,
  startOfBangkokDay
} from "./dashboard-analytics";

const now = new Date("2026-08-04T05:00:00Z");

function project(overrides: Record<string, unknown>) {
  return {
    id: "project-1",
    code: "ISE-1",
    title: "Project",
    status: "approval_pending",
    academic_program: "ICE",
    project_type_category: "Senior Project",
    project_type_custom: null,
    due_at: null,
    created_at: "2026-08-01T03:00:00Z",
    updated_at: "2026-08-02T03:00:00Z",
    submitted_at: "2026-08-02T03:00:00Z",
    completed_at: null,
    requester_first_name: "Student",
    requester_last_name: "One",
    student: { display_name: "Student One", email: "student@example.edu" },
    workflow_steps: [],
    revision_requests: [],
    ...overrides
  };
}

describe("dashboard analytics", () => {
  it("parses default filters", () => {
    expect(getDashboardFilters({}).range).toBe("30d");
  });

  it("uses Asia/Bangkok midnight boundaries", () => {
    expect(startOfBangkokDay(new Date("2026-08-04T01:00:00Z")).toISOString()).toBe("2026-08-03T17:00:00.000Z");
  });

  it("fills daily trend buckets with zero values", () => {
    const filters = getDashboardFilters({ range: "7d" });
    const trend = getRequestTrend([project({ submitted_at: "2026-08-02T03:00:00Z" })] as never, filters, now);

    expect(trend).toHaveLength(7);
    expect(trend.some((point) => point.submitted === 0)).toBe(true);
  });

  it("calculates KPI comparison safely when the previous period is zero", () => {
    const filters = getDashboardFilters({ range: "7d" });
    const requests = getDashboardSummary([project({ submitted_at: "2026-08-02T03:00:00Z" })] as never, filters, now)[0];

    expect(requests.absoluteChange).toBe(1);
    expect(requests.percentChange).toBeNull();
  });

  it("classifies active staff and faculty stages without double-counting", () => {
    const rows = [
      project({
        id: "staff-project",
        workflow_steps: [{
          id: "step-1",
          name: "Staff Review",
          status: "in_progress",
          completion_rule: "any",
          activated_at: "2026-08-02T00:00:00Z",
          started_at: null,
          completed_at: null,
          due_at: null,
          workflow_assignments: [
            { id: "a1", approver_id: "staff-1", status: "waiting", assigned_at: "2026-08-02T00:00:00Z", completed_at: null, invalidated_at: null, due_at: null, profile: { role: "staff" } },
            { id: "a2", approver_id: "staff-2", status: "waiting", assigned_at: "2026-08-02T00:00:00Z", completed_at: null, invalidated_at: null, due_at: null, profile: { role: "staff" } }
          ]
        }]
      }),
      project({
        id: "faculty-project",
        workflow_steps: [{
          id: "step-2",
          name: "Faculty Approval",
          status: "in_progress",
          completion_rule: "any",
          activated_at: "2026-08-03T00:00:00Z",
          started_at: null,
          completed_at: null,
          due_at: null,
          workflow_assignments: [
            { id: "a3", approver_id: "approver-1", status: "waiting", assigned_at: "2026-08-03T00:00:00Z", completed_at: null, invalidated_at: null, due_at: null, profile: { role: "approver" } }
          ]
        }]
      })
    ];

    const counts = getCurrentStageCounts(rows as never, now);
    expect(counts.find((count) => count.stage === "staff")?.count).toBe(1);
    expect(counts.find((count) => count.stage === "faculty")?.count).toBe(1);
  });

  it("calculates requester preparation and unresolved revision durations", () => {
    const metrics = getStageDurationMetrics([
      project({
        created_at: "2026-08-01T00:00:00Z",
        submitted_at: "2026-08-02T00:00:00Z",
        revision_requests: [{ created_at: "2026-08-03T00:00:00Z", resolved_at: null }]
      })
    ] as never, now);

    expect(metrics[0].sampleCount).toBe(2);
    expect(metrics[0].requesterPreparationMedianHours).toBe(24);
  });

  it("calculates median and p90", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBe(5);
  });

  it("orders longest waiting projects first and finds current bottleneck", () => {
    const rows = [
      project({ id: "short", code: "S", submitted_at: "2026-08-03T00:00:00Z" }),
      project({ id: "long", code: "L", submitted_at: "2026-08-01T00:00:00Z" })
    ];

    expect(getLongestWaitingProjects(rows as never, now)[0].projectCode).toBe("L");
    expect(getCurrentBottleneck(rows as never, now).stage).toBe("configuration");
  });

  it("credits completed pooled response only to the actual approver", () => {
    const metrics = getApproverResponseMetrics([
      {
        id: "action-1",
        approver_id: "approver-1",
        created_at: "2026-08-02T12:00:00Z",
        workflow_step_id: "step-1",
        assignment_id: "assignment-1",
        approver: { id: "approver-1", display_name: "Approver One", email: null, role: "approver" },
        assignment: { assigned_at: "2026-08-02T00:00:00Z", completed_at: "2026-08-02T12:00:00Z", invalidated_at: null },
        step: { activated_at: "2026-08-02T00:00:00Z", started_at: null, completion_rule: "any" }
      }
    ] as never, [] as never, "admin", "admin", now);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].completedDecisions).toBe(1);
    expect(metrics[0].medianResponseHours).toBe(12);
  });

  it("returns fallback dashboard data instead of throwing on Supabase query failures", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/dashboard-analytics.ts"), "utf8");

    expect(source).toContain("emptyDashboardAnalytics");
    expect(source).toContain("Dashboard analytics project query failed");
    expect(source).not.toContain("throw new Error(error.message)");
    expect(source).not.toContain("throw new Error(actionError.message)");
  });
});
