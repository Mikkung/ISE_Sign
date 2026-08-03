import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommentVisibility,
  CompletionRule,
  Project,
  ProjectComment,
  ProjectDocument,
  ProjectDocumentVersion,
  ProjectStatus,
  ReminderPolicy,
  StepMode,
  UserRole,
  WorkflowApprover,
  WorkflowStep,
  WorkflowStepStatus
} from "@/lib/types";

export interface ProjectTypeRecord {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: string;
  metadata: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  type: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  projectTitle: string | null;
}

export interface WorkflowTemplateRecord {
  id: string;
  name: string;
  projectTypeName: string | null;
  active: boolean;
  steps: Array<{
    name: string;
    mode: StepMode;
    completionRule: CompletionRule;
    minimumApprovals: number | null;
  }>;
}

export interface ApprovalAssignmentDetail {
  project: Project;
  step: WorkflowStep;
  assignment: WorkflowApprover;
}

type UnitRow = { name: string | null } | null;
type ProfileRow = {
  id?: string;
  display_name?: string | null;
  displayName?: string | null;
  email?: string | null;
  role?: UserRole | null;
  unit?: UnitRow;
  unit_name?: string | null;
  position?: string | null;
} | null;
type DocumentVersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string;
  active: boolean;
  revision_note: string | null;
  uploaded_at: string;
  uploaded_by_profile: ProfileRow;
};
type DocumentRow = {
  id: string;
  document_type: string;
  project_document_versions?: DocumentVersionRow[] | null;
};
type CommentRow = {
  id: string;
  visibility: CommentVisibility;
  body: string;
  author: ProfileRow;
  created_at: string;
  workflow_step_id: string | null;
  resolved: boolean;
  edited: boolean;
};
type AssignmentRow = {
  id: string;
  profile: ProfileRow;
  status: WorkflowApprover["status"];
  assigned_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  reminder_count: number | null;
  escalation_level: number | null;
};
type StepRow = {
  id: string;
  name: string;
  step_order: number;
  mode: StepMode;
  status: WorkflowStepStatus;
  completion_rule: CompletionRule;
  minimum_approvals: number | null;
  certification_required: boolean;
  comments_required: boolean;
  revision_allowed: boolean;
  due_at: string | null;
  workflow_assignments?: AssignmentRow[] | null;
};
type ProjectRow = {
  id: string;
  code: string;
  title: string;
  abstract: string | null;
  status: ProjectStatus;
  academic_program: string | null;
  project_type_category: string | null;
  project_type_custom: string | null;
  start_date: string | null;
  end_date: string | null;
  requester_student_id: string | null;
  requester_email: string | null;
  requester_first_name: string | null;
  requester_last_name: string | null;
  requester_verified_at: string | null;
  requester_auth_user_id: string | null;
  due_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  updated_at: string;
  project_type: { name: string | null } | null;
  student: ProfileRow;
  assigned_staff: ProfileRow;
  project_documents?: DocumentRow[] | null;
  project_comments?: CommentRow[] | null;
  workflow_steps?: StepRow[] | null;
};
type NotificationLogRow = {
  id: string;
  type: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  project: { title: string | null } | null;
};
type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { display_name: string | null; email: string | null } | null;
};
type WorkflowTemplateRow = {
  id: string;
  name: string;
  active: boolean;
  project_type: { name: string | null } | null;
  workflow_template_steps?: Array<{
    name: string;
    mode: StepMode;
    completion_rule: CompletionRule;
    minimum_approvals: number | null;
    step_order: number;
  }> | null;
};

const projectSelect = `
  id,
  code,
  title,
  abstract,
  status,
  academic_program,
  project_type_category,
  project_type_custom,
  start_date,
  end_date,
  requester_student_id,
  requester_email,
  requester_first_name,
  requester_last_name,
  requester_verified_at,
  requester_auth_user_id,
  due_at,
  submitted_at,
  completed_at,
  updated_at,
  project_type:project_types(name),
  student:profiles!projects_student_id_fkey(
    id,
    display_name,
    email,
    role,
    position,
    unit:organizational_units(name)
  ),
  assigned_staff:profiles!projects_assigned_staff_id_fkey(
    id,
    display_name,
    email,
    role,
    position,
    unit:organizational_units(name)
  ),
  project_documents(
    id,
    document_type,
    project_document_versions(
      id,
      document_id,
      version_number,
      original_file_name,
      mime_type,
      file_size,
      sha256_hash,
      active,
      revision_note,
      uploaded_at,
      uploaded_by_profile:profiles!project_document_versions_uploaded_by_fkey(
        id,
        display_name,
        email,
        role,
        position,
        unit:organizational_units(name)
      )
    )
  ),
  project_comments(
    id,
    visibility,
    body,
    created_at,
    workflow_step_id,
    resolved,
    edited,
    author:profiles!project_comments_author_id_fkey(
      id,
      display_name,
      email,
      role,
      position,
      unit:organizational_units(name)
    )
  ),
  workflow_steps(
    id,
    name,
    step_order,
    mode,
    status,
    completion_rule,
    minimum_approvals,
    certification_required,
    comments_required,
    revision_allowed,
    due_at,
    workflow_assignments(
      id,
      status,
      assigned_at,
      first_opened_at,
      last_opened_at,
      due_at,
      completed_at,
      reminder_count,
      escalation_level,
      profile:profiles!workflow_assignments_approver_id_fkey(
        id,
        display_name,
        email,
        role,
        position,
        unit:organizational_units(name)
      )
    )
  )
`;

function emptyProfile(): import("@/lib/types").Profile {
  return {
    id: "unknown",
    displayName: "Unknown user",
    email: "",
    role: "student" as UserRole,
    unitName: undefined,
    position: undefined
  };
}

function mapProfile(row: ProfileRow) {
  if (!row) {
    return emptyProfile();
  }

  return {
    id: row.id ?? "unknown",
    displayName: row.display_name ?? row.displayName ?? row.email ?? "Unknown user",
    email: row.email ?? "",
    role: (row.role ?? "student") as UserRole,
    unitName: row.unit?.name ?? row.unit_name ?? undefined,
    position: row.position ?? undefined
  };
}

function mapDocumentVersion(row: DocumentVersionRow): ProjectDocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNumber: row.version_number,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    sha256Hash: row.sha256_hash,
    active: row.active,
    revisionNote: row.revision_note ?? undefined,
    uploadedAt: row.uploaded_at,
    uploadedBy: mapProfile(row.uploaded_by_profile)
  };
}

function mapDocument(row: DocumentRow): ProjectDocument {
  const versions = [...(row.project_document_versions ?? [])]
    .map(mapDocumentVersion)
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const latestVersion = versions.find((version) => version.active) ?? versions[0];

  return {
    id: row.id,
    documentType: row.document_type,
    latestVersion,
    versions
  };
}

function mapComment(row: CommentRow): ProjectComment {
  return {
    id: row.id,
    visibility: row.visibility as CommentVisibility,
    body: row.body,
    author: mapProfile(row.author),
    createdAt: row.created_at,
    workflowStepId: row.workflow_step_id ?? undefined,
    resolved: row.resolved,
    edited: row.edited
  };
}

function mapAssignment(row: AssignmentRow): WorkflowApprover {
  return {
    id: row.id,
    profile: mapProfile(row.profile),
    status: row.status,
    assignedAt: row.assigned_at ?? undefined,
    firstOpenedAt: row.first_opened_at ?? undefined,
    lastOpenedAt: row.last_opened_at ?? undefined,
    dueAt: row.due_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    reminderCount: row.reminder_count ?? 0,
    escalationLevel: row.escalation_level ?? 0
  };
}

function mapStep(row: StepRow): WorkflowStep {
  return {
    id: row.id,
    name: row.name,
    order: row.step_order,
    mode: row.mode as StepMode,
    status: row.status as WorkflowStepStatus,
    completionRule: row.completion_rule as CompletionRule,
    minimumApprovals: row.minimum_approvals,
    certificationRequired: row.certification_required,
    commentsRequired: row.comments_required,
    revisionAllowed: row.revision_allowed,
    dueAt: row.due_at ?? undefined,
    approvers: [...(row.workflow_assignments ?? [])].map(mapAssignment)
  };
}

export function mapProject(row: ProjectRow): Project {
  const documents = [...(row.project_documents ?? [])]
    .map(mapDocument)
    .filter((document) => Boolean(document.latestVersion));
  const workflow = [...(row.workflow_steps ?? [])]
    .map(mapStep)
    .sort((a, b) => a.order - b.order);
  const activeStep = workflow.find((step) => step.status === "in_progress");
  const activeAssignee = activeStep?.approvers.find((approver) =>
    ["waiting", "opened"].includes(approver.status)
  );

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    abstract: row.abstract ?? "",
    status: row.status as ProjectStatus,
    projectType: row.project_type_category === "Other"
      ? row.project_type_custom ?? "Other"
      : row.project_type_category ?? row.project_type?.name ?? "Project",
    projectTypeCategory: row.project_type_category ?? undefined,
    projectTypeCustom: row.project_type_custom ?? undefined,
    academicProgram: row.academic_program ?? "-",
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    verifiedRequester:
      row.requester_student_id &&
      row.requester_email &&
      row.requester_first_name &&
      row.requester_last_name &&
      row.requester_verified_at &&
      row.requester_auth_user_id
        ? {
            studentId: row.requester_student_id,
            email: row.requester_email,
            firstName: row.requester_first_name,
            lastName: row.requester_last_name,
            verifiedAt: row.requester_verified_at,
            authUserId: row.requester_auth_user_id
          }
        : undefined,
    student: mapProfile(row.student),
    members: [],
    assignedStaff: row.assigned_staff ? mapProfile(row.assigned_staff) : undefined,
    currentStep: activeStep?.name ?? row.status,
    currentResponsible: activeAssignee?.profile.displayName ?? row.assigned_staff?.display_name ?? "-",
    dueAt: row.due_at ?? activeStep?.dueAt ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    lastActivityAt: row.updated_at,
    nextAction: activeStep ? `Waiting for ${activeStep.name}` : nextActionForStatus(row.status),
    documents,
    comments: [...(row.project_comments ?? [])]
      .map(mapComment)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    workflow
  };
}

function nextActionForStatus(status: ProjectStatus): string {
  switch (status) {
    case "draft":
      return "Upload documents and submit";
    case "submitted":
    case "staff_review":
      return "Staff review";
    case "revision_required":
      return "Student revision";
    case "staff_approved":
    case "approval_pending":
    case "partially_approved":
      return "Approval workflow";
    case "completed":
      return "Certificate available";
    case "rejected":
      return "Rejected";
    default:
      return "Open details";
  }
}

export async function listProjects(): Promise<Project[]> {
  return listProjectsFiltered();
}

export async function listProjectsFiltered(filters: {
  status?: string;
  projectTypeId?: string;
  q?: string;
} = {}): Promise<Project[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("projects")
    .select(projectSelect)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.projectTypeId && filters.projectTypeId !== "all") {
    query = query.eq("project_type_id", filters.projectTypeId);
  }

  if (filters.q?.trim()) {
    query = query.ilike("title", `%${filters.q.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as ProjectRow[]).map(mapProject);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId);
  const query = supabase.from("projects").select(projectSelect);
  const { data, error } = isUuid
    ? await query.eq("id", projectId).maybeSingle()
    : await query.eq("code", projectId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapProject(data as unknown as ProjectRow) : null;
}

export async function listProjectTypes(): Promise<ProjectTypeRecord[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("project_types")
    .select("id, name, description, active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listProfiles() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, position, unit:organizational_units(name)")
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as ProfileRow[]).map(mapProfile);
}

export async function listApprovalAssignments(): Promise<ApprovalAssignmentDetail[]> {
  const projects = await listProjects();

  return projects.flatMap((project) =>
    project.workflow.flatMap((step) =>
      step.approvers
        .filter((assignment) =>
          step.status === "in_progress" && ["waiting", "opened"].includes(assignment.status)
        )
        .map((assignment) => ({ project, step, assignment }))
    )
  );
}

export async function getApprovalAssignment(assignmentId: string): Promise<ApprovalAssignmentDetail | null> {
  const assignments = await listApprovalAssignments();
  return assignments.find((item) => item.assignment.id === assignmentId) ?? null;
}

export async function listNotifications(): Promise<NotificationRecord[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("notification_logs")
    .select("id, type, channel, subject, body, status, created_at, sent_at, project:projects(title)")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as NotificationLogRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    projectTitle: row.project?.title ?? null
  }));
}

export async function listAuditLogs(): Promise<AuditLogRecord[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor:profiles(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    actor: row.actor?.display_name ?? row.actor?.email ?? "System"
  }));
}

export async function listProjectAuditLogs(projectId: string): Promise<AuditLogRecord[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor:profiles(display_name, email)")
    .eq("entity_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    actor: row.actor?.display_name ?? row.actor?.email ?? "System"
  }));
}

export async function getReminderPolicy(): Promise<ReminderPolicy> {
  const { defaultReminderPolicy } = await import("@/lib/reminders");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return defaultReminderPolicy;
  }

  const { data, error } = await supabase
    .from("reminder_rules")
    .select("unopened_after_days, no_action_after_days, staff_notice_after_days, escalation_after_days, repeat_escalation_every_days, due_soon_before_days")
    .eq("is_default", true)
    .maybeSingle();

  if (error || !data) {
    return defaultReminderPolicy;
  }

  return {
    unopenedAfterDays: data.unopened_after_days,
    noActionAfterDays: data.no_action_after_days,
    staffNoticeAfterDays: data.staff_notice_after_days,
    escalationAfterDays: data.escalation_after_days,
    repeatEscalationEveryDays: data.repeat_escalation_every_days,
    dueSoonBeforeDays: data.due_soon_before_days
  };
}

export async function getDefaultReminderRule(): Promise<ReminderPolicy> {
  const { defaultReminderPolicy } = await import("@/lib/reminders");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return defaultReminderPolicy;
  }

  const { data, error } = await supabase
    .from("reminder_rules")
    .select("unopened_after_days, no_action_after_days, staff_notice_after_days, escalation_after_days, repeat_escalation_every_days, due_soon_before_days")
    .eq("is_default", true)
    .maybeSingle();

  if (error || !data) {
    return defaultReminderPolicy;
  }

  return {
    unopenedAfterDays: data.unopened_after_days,
    noActionAfterDays: data.no_action_after_days,
    staffNoticeAfterDays: data.staff_notice_after_days,
    escalationAfterDays: data.escalation_after_days,
    repeatEscalationEveryDays: data.repeat_escalation_every_days,
    dueSoonBeforeDays: data.due_soon_before_days
  };
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplateRecord[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workflow_templates")
    .select("id, name, active, project_type:project_types(name), workflow_template_steps(name, mode, completion_rule, minimum_approvals, step_order)")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as WorkflowTemplateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    projectTypeName: row.project_type?.name ?? null,
    steps: [...(row.workflow_template_steps ?? [])]
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        name: step.name,
        mode: step.mode,
        completionRule: step.completion_rule,
        minimumApprovals: step.minimum_approvals
      }))
  }));
}
