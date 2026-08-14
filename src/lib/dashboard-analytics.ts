import { createSupabaseServerClient } from "./supabase/server";
import type { CompletionRule, ProjectStatus, UserRole, WorkflowAssigneeRole } from "./types";

const bangkokOffsetMs = 7 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type DashboardRange = "7d" | "30d" | "90d" | "12m" | "all" | "custom";
export type TrendGrouping = "day" | "week" | "month";
export type DashboardStage = "requester" | "staff" | "faculty" | "admin" | "configuration";

export interface DashboardFilters {
  range: DashboardRange;
  from: string | null;
  to: string | null;
  academicProgram: string;
  projectType: string;
  status: string;
}

export interface DashboardFilterOptions {
  academicPrograms: string[];
  projectTypes: string[];
  statuses: string[];
}

export interface KpiMetric {
  label: string;
  value: string;
  helper: string;
  absoluteChange?: number | null;
  percentChange?: number | null;
}

export interface TrendPoint {
  label: string;
  submitted: number;
  completed: number;
}

export interface StageCount {
  stage: DashboardStage;
  label: string;
  count: number;
}

export interface DurationMetric {
  stage: "requester" | "staff" | "faculty" | "admin";
  label: string;
  medianHours: number | null;
  averageHours: number | null;
  p90Hours: number | null;
  sampleCount: number;
  excludedCount: number;
  requesterPreparationMedianHours?: number | null;
  requesterRevisionMedianHours?: number | null;
}

export interface BottleneckMetric {
  stage: DashboardStage | null;
  label: string;
  activeProjectCount: number;
  totalWaitingHours: number;
  medianWaitingHours: number | null;
  oldestWaitingHours: number | null;
}

export interface LongestWaitingProject {
  projectId: string;
  projectCode: string;
  title: string;
  currentStage: DashboardStage;
  currentStageLabel: string;
  waitingFor: string;
  currentResponsible: string;
  waitingSince: string | null;
  waitingHours: number | null;
  dueAt: string | null;
  overdue: boolean;
}

export interface ApproverResponseMetric {
  approverId: string;
  approverName: string;
  role: UserRole;
  completedDecisions: number;
  medianResponseHours: number | null;
  averageResponseHours: number | null;
  oldestCurrentAssignmentHours: number | null;
  activeAssignmentCount: number;
}

export interface DashboardAnalytics {
  filters: DashboardFilters;
  filterOptions: DashboardFilterOptions;
  role: UserRole | null;
  periodLabel: string;
  kpis: KpiMetric[];
  trend: TrendPoint[];
  stageCounts: StageCount[];
  durationMetrics: DurationMetric[];
  bottleneck: BottleneckMetric;
  longestWaitingProjects: LongestWaitingProject[];
  approverResponseMetrics: ApproverResponseMetric[];
  accessibleProjectCount: number;
  summaryText: string;
}

type WorkflowAssignmentRow = {
  id: string;
  approver_id: string;
  status: string;
  assigned_at: string | null;
  first_opened_at: string | null;
  completed_at: string | null;
  cancelled_at?: string | null;
  invalidated_at: string | null;
  due_at: string | null;
  profile?: {
    id: string;
    display_name: string | null;
    email: string | null;
    role: UserRole;
  } | null;
};

type WorkflowStepRow = {
  id: string;
  name: string;
  step_order: number | null;
  status: string;
  completion_rule: CompletionRule;
  activated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  assignee_role?: WorkflowAssigneeRole | null;
  workflow_assignments?: WorkflowAssignmentRow[] | null;
};

type RevisionRow = {
  created_at: string | null;
  resolved_at: string | null;
};

type ProjectAnalyticsRow = {
  id: string;
  code: string;
  title: string;
  status: ProjectStatus;
  academic_program: string | null;
  project_type_category: string | null;
  project_type_custom: string | null;
  due_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  requester_first_name: string | null;
  requester_last_name: string | null;
  student?: { display_name: string | null; email: string | null } | null;
  workflow_steps?: WorkflowStepRow[] | null;
  revision_requests?: RevisionRow[] | null;
};

type ApprovalActionAnalyticsRow = {
  id: string;
  approver_id: string;
  created_at: string | null;
  workflow_step_id: string;
  assignment_id: string | null;
  approver?: { id: string; display_name: string | null; email: string | null; role: UserRole } | null;
  assignment?: { assigned_at: string | null; completed_at: string | null; invalidated_at: string | null } | null;
  step?: { activated_at: string | null; started_at: string | null; completion_rule: CompletionRule | null } | null;
};

export const stageLabels: Record<DashboardStage, string> = {
  requester: "Waiting for Requester",
  staff: "Waiting for Staff",
  faculty: "Waiting for Faculty Approver",
  admin: "Waiting for Admin",
  configuration: "Workflow Configuration Required"
};

export function getDashboardFilters(searchParams: Record<string, string | string[] | undefined> = {}): DashboardFilters {
  const value = (key: string) => {
    const raw = searchParams[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const range = value("range");

  return {
    range: ["7d", "30d", "90d", "12m", "all", "custom"].includes(range ?? "")
      ? (range as DashboardRange)
      : "30d",
    from: value("from") || null,
    to: value("to") || null,
    academicProgram: value("academicProgram") || "all",
    projectType: value("projectType") || "all",
    status: value("status") || "all"
  };
}

function bangkokDate(date: Date) {
  return new Date(date.getTime() + bangkokOffsetMs);
}

function bangkokParts(date: Date) {
  const local = bangkokDate(date);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate()
  };
}

function bangkokMidnightUtc(year: number, month: number, date: number) {
  return new Date(Date.UTC(year, month, date) - bangkokOffsetMs);
}

export function startOfBangkokDay(date: Date) {
  const parts = bangkokParts(date);
  return bangkokMidnightUtc(parts.year, parts.month, parts.date);
}

function parseBangkokDate(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  const [year, month, date] = value.split("-").map(Number);
  return bangkokMidnightUtc(year, month - 1, date);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

function addMonthsBangkok(date: Date, months: number) {
  const parts = bangkokParts(date);
  return bangkokMidnightUtc(parts.year, parts.month + months, parts.date);
}

export function getSelectedPeriod(filters: DashboardFilters, now = new Date()) {
  const todayStart = startOfBangkokDay(now);
  const end = filters.range === "custom"
    ? addDays(parseBangkokDate(filters.to, todayStart), 1)
    : now;
  let start: Date | null;

  switch (filters.range) {
    case "7d":
      start = addDays(todayStart, -6);
      break;
    case "30d":
      start = addDays(todayStart, -29);
      break;
    case "90d":
      start = addDays(todayStart, -89);
      break;
    case "12m":
      start = addMonthsBangkok(todayStart, -12);
      break;
    case "custom":
      start = parseBangkokDate(filters.from, addDays(todayStart, -29));
      break;
    case "all":
      start = null;
      break;
  }

  return { start, end };
}

function inPeriod(value: string | null, start: Date | null, end: Date) {
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  return (start === null || timestamp >= start.getTime()) && timestamp < end.getTime();
}

function hoursBetween(start: string | null | undefined, end: string | Date | null | undefined) {
  if (!start || !end) {
    return null;
  }
  const startTime = new Date(start).getTime();
  const endTime = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return null;
  }
  return (endTime - startTime) / (60 * 60 * 1000);
}

export function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

export function formatDuration(hours: number | null) {
  if (hours === null) {
    return "-";
  }
  if (hours < 48) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function compareMetric(current: number, previous: number) {
  return {
    absoluteChange: current - previous,
    percentChange: previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100
  };
}

function projectType(row: ProjectAnalyticsRow) {
  return row.project_type_category === "Other"
    ? row.project_type_custom ?? "Other"
    : row.project_type_category ?? "Project";
}

function requesterName(row: ProjectAnalyticsRow) {
  const verified = [row.requester_first_name, row.requester_last_name].filter(Boolean).join(" ").trim();
  return verified || row.student?.display_name || row.student?.email || "Requester";
}

function isTerminalProject(row: ProjectAnalyticsRow) {
  return ["completed", "rejected", "cancelled", "draft"].includes(row.status);
}

function activeAssignments(step: WorkflowStepRow) {
  return (step.workflow_assignments ?? []).filter((assignment) =>
    ["waiting", "opened"].includes(assignment.status) && !assignment.invalidated_at && !assignment.completed_at
  );
}

function workflowStageForStep(step: WorkflowStepRow): "staff" | "faculty" | "admin" {
  if (step.assignee_role === "admin") {
    return "admin";
  }

  if (step.assignee_role === "approver") {
    return "faculty";
  }

  if (step.assignee_role === "staff") {
    return "staff";
  }

  const roles = new Set((step.workflow_assignments ?? []).map((assignment) => assignment.profile?.role));
  if (roles.has("admin")) {
    return "admin";
  }
  if (roles.has("approver")) {
    return "faculty";
  }
  return "staff";
}

function stageForActiveProject(row: ProjectAnalyticsRow, now = new Date()): LongestWaitingProject | null {
  if (isTerminalProject(row)) {
    return null;
  }

  const unresolvedRevision = (row.revision_requests ?? []).find((revision) => !revision.resolved_at);
  if (row.status === "revision_required" || unresolvedRevision) {
    const waitingSince = unresolvedRevision?.created_at ?? row.updated_at ?? row.submitted_at ?? row.created_at;
    return {
      projectId: row.id,
      projectCode: row.code,
      title: row.title,
      currentStage: "requester",
      currentStageLabel: stageLabels.requester,
      waitingFor: "Requester",
      currentResponsible: requesterName(row),
      waitingSince,
      waitingHours: hoursBetween(waitingSince, now),
      dueAt: row.due_at,
      overdue: Boolean(row.due_at && new Date(row.due_at) < now)
    };
  }

  const steps = [...(row.workflow_steps ?? [])].sort((a, b) => (a.activated_at ?? a.started_at ?? "").localeCompare(b.activated_at ?? b.started_at ?? ""));
  const activeStep = steps.find((step) => step.status === "in_progress");

  if (activeStep) {
    const assignments = activeAssignments(activeStep);
    const currentStage: DashboardStage = workflowStageForStep(activeStep);
    const waitingSince = activeStep.activated_at ?? activeStep.started_at ?? assignments[0]?.assigned_at ?? row.submitted_at ?? row.updated_at;
    const poolName = `${stageLabels[currentStage].replace("Waiting for ", "")} Pool`;
    const individual = activeStep.completion_rule === "any"
      ? `${poolName}${assignments.length > 0 ? ` (${assignments.length})` : ""}`
      : assignments.map((assignment) => assignment.profile?.display_name ?? assignment.profile?.email).filter(Boolean).join(", ");
    const dueAt = activeStep.due_at ?? assignments.map((assignment) => assignment.due_at).filter(Boolean).sort()[0] ?? row.due_at;

    return {
      projectId: row.id,
      projectCode: row.code,
      title: row.title,
      currentStage,
      currentStageLabel: activeStep.name,
      waitingFor: activeStep.name,
      currentResponsible: individual || poolName,
      waitingSince,
      waitingHours: hoursBetween(waitingSince, now),
      dueAt,
      overdue: Boolean(dueAt && new Date(dueAt) < now)
    };
  }

  const hasSteps = (row.workflow_steps ?? []).length > 0;
  const waitingSince = row.submitted_at ?? row.updated_at ?? row.created_at;
  const firstStep = [...(row.workflow_steps ?? [])].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))[0];
  const stage: DashboardStage = hasSteps && firstStep ? workflowStageForStep(firstStep) : "configuration";
  return {
    projectId: row.id,
    projectCode: row.code,
    title: row.title,
    currentStage: stage,
    currentStageLabel: firstStep?.name ?? stageLabels[stage],
    waitingFor: firstStep?.name ?? "Workflow Configuration",
    currentResponsible: stage === "configuration" ? "Staff/Admin" : `${stageLabels[stage].replace("Waiting for ", "")} Pool`,
    waitingSince,
    waitingHours: hoursBetween(waitingSince, now),
    dueAt: row.due_at,
    overdue: Boolean(row.due_at && new Date(row.due_at) < now)
  };
}

function filterRows(rows: ProjectAnalyticsRow[], filters: DashboardFilters) {
  return rows.filter((row) => {
    if (filters.academicProgram !== "all" && row.academic_program !== filters.academicProgram) {
      return false;
    }
    if (filters.projectType !== "all" && projectType(row) !== filters.projectType) {
      return false;
    }
    if (filters.status !== "all" && row.status !== filters.status) {
      return false;
    }
    return true;
  });
}

function bucketKey(date: Date, grouping: TrendGrouping) {
  const parts = bangkokParts(date);
  if (grouping === "month") {
    return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}`;
  }
  if (grouping === "week") {
    const dayStart = bangkokMidnightUtc(parts.year, parts.month, parts.date);
    const weekStart = addDays(dayStart, -((bangkokDate(dayStart).getUTCDay() + 6) % 7));
    const weekParts = bangkokParts(weekStart);
    return `${weekParts.year}-${String(weekParts.month + 1).padStart(2, "0")}-${String(weekParts.date).padStart(2, "0")}`;
  }
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}`;
}

function chooseGrouping(range: DashboardRange): TrendGrouping {
  if (range === "90d") {
    return "week";
  }
  if (range === "12m" || range === "all") {
    return "month";
  }
  return "day";
}

export function getRequestTrend(rows: ProjectAnalyticsRow[], filters: DashboardFilters, now = new Date()): TrendPoint[] {
  const period = getSelectedPeriod(filters, now);
  const grouping = chooseGrouping(filters.range);
  const datedRows = rows.filter((row) => row.submitted_at || row.completed_at);
  const earliest = datedRows
    .flatMap((row) => [row.submitted_at, row.completed_at])
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .sort((a, b) => a - b)[0];
  let cursor = period.start ?? (earliest ? startOfBangkokDay(new Date(earliest)) : startOfBangkokDay(now));
  const end = period.end;
  const points = new Map<string, TrendPoint>();

  while (cursor < end) {
    const key = bucketKey(cursor, grouping);
    points.set(key, { label: key, submitted: 0, completed: 0 });
    cursor = grouping === "month" ? addMonthsBangkok(cursor, 1) : addDays(cursor, grouping === "week" ? 7 : 1);
  }

  for (const row of rows) {
    if (inPeriod(row.submitted_at, period.start, end)) {
      const key = bucketKey(new Date(row.submitted_at as string), grouping);
      const point = points.get(key);
      if (point) point.submitted += 1;
    }
    if (inPeriod(row.completed_at, period.start, end)) {
      const key = bucketKey(new Date(row.completed_at as string), grouping);
      const point = points.get(key);
      if (point) point.completed += 1;
    }
  }

  return [...points.values()];
}

export function getCurrentStageCounts(rows: ProjectAnalyticsRow[], now = new Date()): StageCount[] {
  const counts: Record<DashboardStage, number> = { requester: 0, staff: 0, faculty: 0, admin: 0, configuration: 0 };

  for (const row of rows) {
    const current = stageForActiveProject(row, now);
    if (current) {
      counts[current.currentStage] += 1;
    }
  }

  return (Object.keys(counts) as DashboardStage[]).map((stage) => ({
    stage,
    label: stageLabels[stage],
    count: counts[stage]
  }));
}

export function getStageDurationMetrics(rows: ProjectAnalyticsRow[], now = new Date()): DurationMetric[] {
  const requesterPreparation: number[] = [];
  const requesterRevision: number[] = [];
  let requesterExcluded = 0;
  const staff: number[] = [];
  const faculty: number[] = [];
  const admin: number[] = [];
  let staffExcluded = 0;
  let facultyExcluded = 0;
  let adminExcluded = 0;

  for (const row of rows) {
    const preparation = hoursBetween(row.created_at, row.submitted_at);
    if (preparation === null && row.submitted_at) requesterExcluded += 1;
    if (preparation !== null) requesterPreparation.push(preparation);

    for (const revision of row.revision_requests ?? []) {
      const duration = hoursBetween(revision.created_at, revision.resolved_at ?? row.cancelled_at ?? now);
      if (duration === null) requesterExcluded += 1;
      else requesterRevision.push(duration);
    }

    for (const step of row.workflow_steps ?? []) {
      const start = step.activated_at ?? step.started_at;
      const end = step.completed_at ?? row.cancelled_at ?? (step.status === "in_progress" ? now : null);
      const duration = hoursBetween(start, end);
      const stage = workflowStageForStep(step);
      const target = stage === "faculty" ? faculty : stage === "admin" ? admin : staff;
      if (duration === null) {
        if (stage === "faculty") facultyExcluded += 1;
        else if (stage === "admin") adminExcluded += 1;
        else staffExcluded += 1;
      } else {
        target.push(duration);
      }
    }
  }

  const requesterTotal = [...requesterPreparation, ...requesterRevision];
  const metric = (
    stage: "requester" | "staff" | "faculty" | "admin",
    label: string,
    values: number[],
    excludedCount: number,
    extra: Partial<DurationMetric> = {}
  ): DurationMetric => ({
    stage,
    label,
    medianHours: median(values),
    averageHours: average(values),
    p90Hours: percentile(values, 90),
    sampleCount: values.length,
    excludedCount,
    ...extra
  });

  return [
    metric("requester", "Requester", requesterTotal, requesterExcluded, {
      requesterPreparationMedianHours: median(requesterPreparation),
      requesterRevisionMedianHours: median(requesterRevision)
    }),
    metric("staff", "Staff Steps", staff, staffExcluded),
    metric("faculty", "Faculty Approver Steps", faculty, facultyExcluded),
    metric("admin", "Admin Steps", admin, adminExcluded)
  ];
}

export function getCurrentBottleneck(rows: ProjectAnalyticsRow[], now = new Date()): BottleneckMetric {
  const active = rows.map((row) => stageForActiveProject(row, now)).filter(Boolean) as LongestWaitingProject[];
  const grouped = new Map<DashboardStage, number[]>();

  for (const item of active) {
    if (item.waitingHours === null) continue;
    grouped.set(item.currentStage, [...(grouped.get(item.currentStage) ?? []), item.waitingHours]);
  }

  let selected: DashboardStage | null = null;
  let selectedTotal = -1;
  for (const [stage, values] of grouped) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > selectedTotal) {
      selected = stage;
      selectedTotal = total;
    }
  }

  const values = selected ? grouped.get(selected) ?? [] : [];
  return {
    stage: selected,
    label: selected ? stageLabels[selected] : "No active bottleneck",
    activeProjectCount: selected ? active.filter((item) => item.currentStage === selected).length : 0,
    totalWaitingHours: selectedTotal > 0 ? selectedTotal : 0,
    medianWaitingHours: median(values),
    oldestWaitingHours: values.length > 0 ? Math.max(...values) : null
  };
}

export function getLongestWaitingProjects(rows: ProjectAnalyticsRow[], now = new Date(), limit = 10) {
  return rows
    .map((row) => stageForActiveProject(row, now))
    .filter(Boolean)
    .sort((a, b) => (b?.waitingHours ?? -1) - (a?.waitingHours ?? -1))
    .slice(0, limit) as LongestWaitingProject[];
}

export function getApproverResponseMetrics(
  actions: ApprovalActionAnalyticsRow[],
  projects: ProjectAnalyticsRow[],
  role: UserRole | null,
  currentUserId: string | null,
  now = new Date()
): ApproverResponseMetric[] {
  if (role === "student") {
    return [];
  }

  const visibleActions = role === "approver" && currentUserId
    ? actions.filter((action) => action.approver_id === currentUserId)
    : actions;
  const metrics = new Map<string, ApproverResponseMetric & { durations: number[]; activeDurations: number[] }>();

  for (const action of visibleActions) {
    const approverId = action.approver_id;
    const displayName = action.approver?.display_name ?? action.approver?.email ?? "Approver";
    const start = action.step?.activated_at ?? action.step?.started_at ?? action.assignment?.assigned_at;
    const end = action.created_at ?? action.assignment?.completed_at;
    const duration = hoursBetween(start, end);
    if (duration === null || action.assignment?.invalidated_at) {
      continue;
    }
    const entry = metrics.get(approverId) ?? {
      approverId,
      approverName: displayName,
      role: action.approver?.role ?? "approver",
      completedDecisions: 0,
      medianResponseHours: null,
      averageResponseHours: null,
      oldestCurrentAssignmentHours: null,
      activeAssignmentCount: 0,
      durations: [],
      activeDurations: []
    };
    entry.completedDecisions += 1;
    entry.durations.push(duration);
    metrics.set(approverId, entry);
  }

  for (const project of projects) {
    for (const step of project.workflow_steps ?? []) {
      if (step.completion_rule === "any") {
        continue;
      }
      for (const assignment of activeAssignments(step)) {
        if (role === "approver" && currentUserId && assignment.approver_id !== currentUserId) {
          continue;
        }
        const duration = hoursBetween(step.activated_at ?? step.started_at ?? assignment.assigned_at, now);
        const approverId = assignment.approver_id;
        const entry = metrics.get(approverId) ?? {
          approverId,
          approverName: assignment.profile?.display_name ?? assignment.profile?.email ?? "Approver",
          role: assignment.profile?.role ?? "approver",
          completedDecisions: 0,
          medianResponseHours: null,
          averageResponseHours: null,
          oldestCurrentAssignmentHours: null,
          activeAssignmentCount: 0,
          durations: [],
          activeDurations: []
        };
        entry.activeAssignmentCount += 1;
        if (duration !== null) {
          entry.activeDurations.push(duration);
        }
        metrics.set(approverId, entry);
      }
    }
  }

  return [...metrics.values()].map((entry) => ({
    approverId: entry.approverId,
    approverName: entry.approverName,
    role: entry.role,
    completedDecisions: entry.completedDecisions,
    medianResponseHours: median(entry.durations),
    averageResponseHours: average(entry.durations),
    oldestCurrentAssignmentHours: entry.activeDurations.length > 0 ? Math.max(...entry.activeDurations) : null,
    activeAssignmentCount: entry.activeAssignmentCount
  }));
}

export function getDashboardSummary(rows: ProjectAnalyticsRow[], filters: DashboardFilters, now = new Date()): KpiMetric[] {
  const { start, end } = getSelectedPeriod(filters, now);
  const duration = start ? end.getTime() - start.getTime() : null;
  const previousStart = start && duration ? new Date(start.getTime() - duration) : null;
  const submitted = rows.filter((row) => inPeriod(row.submitted_at, start, end)).length;
  const previousSubmitted = previousStart && start
    ? rows.filter((row) => inPeriod(row.submitted_at, previousStart, start)).length
    : 0;
  const completed = rows.filter((row) => inPeriod(row.completed_at, start, end)).length;
  const endToEnd = rows
    .map((row) => inPeriod(row.completed_at, start, end) ? hoursBetween(row.submitted_at, row.completed_at) : null)
    .filter((value): value is number => value !== null);
  const active = rows.filter((row) => !isTerminalProject(row) && row.submitted_at).length;
  const overdue = rows.filter((row) => {
    const current = stageForActiveProject(row, now);
    return current?.overdue === true;
  }).length;
  const submittedCohort = rows.filter((row) => inPeriod(row.submitted_at, start, end));
  const completedCohort = submittedCohort.filter((row) => row.completed_at).length;
  const completionRate = submittedCohort.length === 0 ? 0 : (completedCohort / submittedCohort.length) * 100;

  return [
    {
      label: "Requests Received",
      value: String(submitted),
      helper: "Projects whose submitted date is inside the selected period.",
      ...compareMetric(submitted, previousSubmitted)
    },
    {
      label: "Completed Projects",
      value: String(completed),
      helper: "Projects completed inside the selected period."
    },
    {
      label: "Median End-to-End Time",
      value: formatDuration(median(endToEnd)),
      helper: "Completed projects only: submitted_at to completed_at."
    },
    {
      label: "Active Requests",
      value: String(active),
      helper: "Submitted projects that are not completed, rejected, cancelled, or draft."
    },
    {
      label: "Currently Overdue",
      value: String(overdue),
      helper: "Only projects, steps, or assignments with an explicit due date in the past."
    },
    {
      label: "Completion Rate",
      value: `${Math.round(completionRate)}%`,
      helper: "Completed projects divided by projects submitted in the selected period."
    }
  ];
}

function periodLabel(filters: DashboardFilters) {
  if (filters.range === "custom") {
    return `${filters.from ?? "Start"} to ${filters.to ?? "Today"} (Asia/Bangkok)`;
  }
  return {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "12m": "Last 12 months",
    all: "All time",
    custom: "Custom range"
  }[filters.range];
}

function emptyDashboardAnalytics(
  filters: DashboardFilters,
  summaryText: string,
  role: UserRole | null = null
): DashboardAnalytics {
  return {
    filters,
    filterOptions: { academicPrograms: [], projectTypes: [], statuses: [] },
    role,
    periodLabel: periodLabel(filters),
    kpis: getDashboardSummary([], filters),
    trend: getRequestTrend([], filters),
    stageCounts: getCurrentStageCounts([]),
    durationMetrics: getStageDurationMetrics([]),
    bottleneck: getCurrentBottleneck([]),
    longestWaitingProjects: [],
    approverResponseMetrics: [],
    accessibleProjectCount: 0,
    summaryText
  };
}

export async function getDashboardAnalytics(searchParams: Record<string, string | string[] | undefined> = {}): Promise<DashboardAnalytics> {
  const filters = getDashboardFilters(searchParams);
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return emptyDashboardAnalytics(filters, "No Supabase connection is configured.");
  }

  let user: { id: string } | null = null;
  let role: UserRole | null = null;

  try {
    const userResult = await supabase.auth.getUser();
    user = userResult.data.user;

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
      role = (profile?.role ?? null) as UserRole | null;
    }
  } catch (error) {
    console.error("Dashboard analytics auth lookup failed", {
      message: error instanceof Error ? error.message : "Unknown dashboard auth error"
    });
    return emptyDashboardAnalytics(filters, "Dashboard analytics could not connect to Supabase. Refresh and try again.");
  }

  const { data: projectData, error } = await supabase
    .from("projects")
    .select(`
      id,
      code,
      title,
      status,
      academic_program,
      project_type_category,
      project_type_custom,
      due_at,
      created_at,
      updated_at,
      submitted_at,
      completed_at,
      cancelled_at,
      requester_first_name,
      requester_last_name,
      student:profiles!projects_student_id_fkey(display_name, email),
      workflow_steps(
        id,
        name,
        step_order,
        assignee_role,
        status,
        completion_rule,
        activated_at,
        started_at,
        completed_at,
        due_at,
        workflow_assignments(
          id,
          approver_id,
          status,
          assigned_at,
          first_opened_at,
          completed_at,
          invalidated_at,
          due_at,
          profile:profiles!workflow_assignments_approver_id_fkey(id, display_name, email, role)
        )
      ),
      revision_requests(created_at, resolved_at)
    `)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Dashboard analytics project query failed", {
      code: error.code,
      message: error.message
    });
    return emptyDashboardAnalytics(filters, "Dashboard analytics could not load projects from Supabase. Refresh and try again.", role);
  }

  const allRows = (projectData ?? []) as unknown as ProjectAnalyticsRow[];
  const rows = filterRows(allRows, filters);
  const { start, end } = getSelectedPeriod(filters);
  const periodRows = rows.filter((row) =>
    filters.range === "all" || inPeriod(row.submitted_at, start, end) || inPeriod(row.completed_at, start, end) || !isTerminalProject(row)
  );

  const { data: actionData, error: actionError } = await supabase
    .from("approval_actions")
    .select(`
      id,
      approver_id,
      created_at,
      workflow_step_id,
      assignment_id,
      approver:profiles!approval_actions_approver_id_fkey(id, display_name, email, role),
      assignment:workflow_assignments!approval_actions_assignment_id_fkey(assigned_at, completed_at, invalidated_at),
      step:workflow_steps!approval_actions_workflow_step_id_fkey(activated_at, started_at, completion_rule)
    `)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (actionError) {
    console.error("Dashboard analytics approval action query failed", {
      code: actionError.code,
      message: actionError.message
    });
    return emptyDashboardAnalytics(filters, "Dashboard analytics could not load approval metrics from Supabase. Refresh and try again.", role);
  }

  const filterOptions = {
    academicPrograms: [...new Set(allRows.map((row) => row.academic_program).filter(Boolean) as string[])].sort(),
    projectTypes: [...new Set(allRows.map(projectType).filter(Boolean))].sort(),
    statuses: [...new Set(allRows.map((row) => row.status))].sort()
  };
  const trend = getRequestTrend(periodRows, filters);

  return {
    filters,
    filterOptions,
    role,
    periodLabel: periodLabel(filters),
    kpis: getDashboardSummary(periodRows, filters),
    trend,
    stageCounts: getCurrentStageCounts(rows),
    durationMetrics: getStageDurationMetrics(rows),
    bottleneck: getCurrentBottleneck(rows),
    longestWaitingProjects: getLongestWaitingProjects(rows),
    approverResponseMetrics: getApproverResponseMetrics(
      (actionData ?? []) as unknown as ApprovalActionAnalyticsRow[],
      rows,
      role,
      user?.id ?? null
    ),
    accessibleProjectCount: allRows.length,
    summaryText: trend.length === 0
      ? "No request trend data is available for the selected filters."
      : `Trend includes ${trend.reduce((sum, point) => sum + point.submitted, 0)} submitted requests and ${trend.reduce((sum, point) => sum + point.completed, 0)} completions.`
  };
}
