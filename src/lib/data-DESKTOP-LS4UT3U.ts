import { demoProfiles, demoProjects } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, Project, ProjectComment, ProjectDocument, WorkflowStep } from "@/lib/types";

type ProjectListRow = {
  id: string;
  code: string;
  title: string;
  abstract: string | null;
  status: Project["status"];
  project_type: { name: string } | { name: string }[] | null;
  academic_program: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  updated_at: string;
  current_responsible?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  email: string;
  role: Profile["role"];
  position: string | null;
};

type DocumentRow = {
  id: string;
  document_type: string;
  document_versions: {
    id: string;
    document_id: string;
    version_number: number;
    original_file_name: string;
    mime_type: string;
    file_size: number;
    sha256_hash: string;
    active_version: boolean;
    revision_note: string | null;
    uploaded_at: string;
    uploaded_by_profile: ProfileRow | ProfileRow[] | null;
  }[];
};

type CommentRow = {
  id: string;
  visibility: ProjectComment["visibility"];
  body: string;
  created_at: string;
  workflow_step_id: string | null;
  resolved: boolean;
  edited: boolean;
  author: ProfileRow | ProfileRow[] | null;
};

type WorkflowStepRow = {
  id: string;
  step_name: string;
  step_order: number;
  mode: WorkflowStep["mode"];
  status: WorkflowStep["status"];
  completion_rule: WorkflowStep["completionRule"];
  minimum_approvals: number | null;
  certification_required: boolean;
  comments_required: boolean;
  revision_allowed: boolean;
  due_at: string | null;
  workflow_step_approvers: {
    id: string;
    status: string;
    assigned_at: string | null;
    first_opened_at: string | null;
    last_opened_at: string | null;
    due_at: string | null;
    completed_at: string | null;
    reminder_count: number;
    escalation_level: number;
    profile: ProfileRow | ProfileRow[] | null;
  }[];
};

type ProjectDetailRow = ProjectListRow & {
  student: ProfileRow | ProfileRow[] | null;
  assigned_staff: ProfileRow | ProfileRow[] | null;
  project_documents: DocumentRow[];
  project_comments: CommentRow[];
  workflow_instances: {
    workflow_steps: WorkflowStepRow[];
  }[];
};

function projectTypeName(projectType: ProjectListRow["project_type"]): string {
  if (Array.isArray(projectType)) {
    return projectType[0]?.name ?? "Project";
  }

  return projectType?.name ?? "Project";
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapProfile(row: ProfileRow | ProfileRow[] | null | undefined): Profile {
  const profile = firstOrNull(row ?? null);

  if (!profile) {
    return demoProfiles[0];
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
    role: profile.role,
    position: profile.position ?? undefined
  };
}

function mapDocuments(rows: DocumentRow[] | undefined): ProjectDocument[] {
  return (rows ?? []).map((document) => {
    const versions = [...document.document_versions]
      .sort((a, b) => b.version_number - a.version_number)
      .map((version) => ({
        id: version.id,
        documentId: version.document_id,
        versionNumber: version.version_number,
        originalFileName: version.original_file_name,
        mimeType: version.mime_type,
        fileSize: version.file_size,
        sha256Hash: version.sha256_hash,
        active: version.active_version,
        revisionNote: version.revision_note ?? undefined,
        uploadedAt: version.uploaded_at,
        uploadedBy: mapProfile(version.uploaded_by_profile)
      }));

    return {
      id: document.id,
      documentType: document.document_type,
      latestVersion: versions.find((version) => version.active) ?? versions[0],
      versions
    };
  });
}

function mapWorkflowSteps(rows: WorkflowStepRow[] | undefined): WorkflowStep[] {
  return (rows ?? [])
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      id: step.id,
      name: step.step_name,
      order: step.step_order,
      mode: step.mode,
      status: step.status,
      completionRule: step.completion_rule,
      minimumApprovals: step.minimum_approvals,
      certificationRequired: step.certification_required,
      commentsRequired: step.comments_required,
      revisionAllowed: step.revision_allowed,
      dueAt: step.due_at ?? undefined,
      approvers: step.workflow_step_approvers.map((assignment) => ({
        id: assignment.id,
        profile: mapProfile(assignment.profile),
        status: assignment.status as "waiting" | "opened" | "approved" | "rejected" | "revision_requested" | "invalidated",
        assignedAt: assignment.assigned_at ?? undefined,
        firstOpenedAt: assignment.first_opened_at ?? undefined,
        lastOpenedAt: assignment.last_opened_at ?? undefined,
        dueAt: assignment.due_at ?? undefined,
        completedAt: assignment.completed_at ?? undefined,
        reminderCount: assignment.reminder_count,
        escalationLevel: assignment.escalation_level
      }))
    }));
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return demoProjects;
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, code, title, abstract, status, project_type:project_types(name), academic_program, submitted_at, completed_at, due_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return demoProjects;
  }

  return (data as ProjectListRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    abstract: row.abstract ?? "",
    status: row.status,
    projectType: projectTypeName(row.project_type),
    academicProgram: row.academic_program ?? "-",
    student: demoProjects[0].student,
    members: [],
    currentStep: row.status,
    currentResponsible: "-",
    dueAt: row.due_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    lastActivityAt: row.updated_at,
    nextAction: "เปิดรายละเอียด",
    documents: [],
    comments: [],
    workflow: []
  }));
}

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return demoProjects.find((project) => project.id === projectId || project.code === projectId) ?? null;
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      id, code, title, abstract, status, project_type:project_types(name), academic_program,
      submitted_at, completed_at, due_at, updated_at, current_responsible,
      student:profiles!projects_student_id_fkey(id, display_name, email, role, position),
      assigned_staff:profiles!projects_assigned_staff_id_fkey(id, display_name, email, role, position),
      project_documents(
        id, document_type,
        document_versions(
          id, document_id, version_number, original_file_name, mime_type, file_size,
          sha256_hash, active_version, revision_note, uploaded_at,
          uploaded_by_profile:profiles!document_versions_uploaded_by_fkey(id, display_name, email, role, position)
        )
      ),
      project_comments(
        id, visibility, body, created_at, workflow_step_id, resolved, edited,
        author:profiles!project_comments_author_id_fkey(id, display_name, email, role, position)
      ),
      workflow_instances(
        workflow_steps(
          id, step_name, step_order, mode, status, completion_rule, minimum_approvals,
          certification_required, comments_required, revision_allowed, due_at,
          workflow_step_approvers(
            id, status, assigned_at, first_opened_at, last_opened_at, due_at, completed_at, reminder_count, escalation_level,
            profile:profiles!workflow_step_approvers_approver_id_fkey(id, display_name, email, role, position)
          )
        )
      )
    `
    )
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as ProjectDetailRow;
  const workflow = mapWorkflowSteps(row.workflow_instances[0]?.workflow_steps);

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    abstract: row.abstract ?? "",
    status: row.status,
    projectType: projectTypeName(row.project_type),
    academicProgram: row.academic_program ?? "-",
    student: mapProfile(row.student),
    members: [],
    assignedStaff: mapProfile(row.assigned_staff),
    currentStep: workflow.find((step) => step.status === "in_progress")?.name ?? row.status,
    currentResponsible: row.current_responsible ?? undefined,
    dueAt: row.due_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    lastActivityAt: row.updated_at,
    nextAction: row.status === "revision_required" ? "อัปโหลดเอกสารแก้ไข" : "ตรวจสอบรายละเอียด",
    documents: mapDocuments(row.project_documents),
    comments: row.project_comments.map((comment) => ({
      id: comment.id,
      visibility: comment.visibility,
      body: comment.body,
      author: mapProfile(comment.author),
      createdAt: comment.created_at,
      workflowStepId: comment.workflow_step_id ?? undefined,
      resolved: comment.resolved,
      edited: comment.edited
    })),
    workflow
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return demoProfiles;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, position")
    .order("display_name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as ProfileRow[]).map(mapProfile);
}

export async function listApproverProfiles(): Promise<Profile[]> {
  const profiles = await listProfiles();
  return profiles.filter((profile) => ["approver", "staff", "admin"].includes(profile.role));
}

export async function listProjectTypes(): Promise<{ id: string; name: string; description?: string }[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [
      { id: "senior-project", name: "Senior Project", description: "Final-year student project" },
      { id: "capstone", name: "Capstone", description: "Capstone design project" }
    ];
  }

  const { data, error } = await supabase
    .from("project_types")
    .select("id, name, description")
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined
  }));
}

export async function getDefaultReminderRule() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      unopenedAfterDays: 2,
      noActionAfterDays: 4,
      staffNoticeAfterDays: 7,
      escalationAfterDays: 10,
      repeatEscalationEveryDays: 3,
      dueSoonBeforeDays: 1
    };
  }

  const { data, error } = await supabase
    .from("reminder_rules")
    .select(
      "unopened_after_days, no_action_after_days, staff_notice_after_days, escalation_after_days, repeat_escalation_every_days, due_soon_before_days"
    )
    .eq("is_default", true)
    .single();

  if (error || !data) {
    return {
      unopenedAfterDays: 2,
      noActionAfterDays: 4,
      staffNoticeAfterDays: 7,
      escalationAfterDays: 10,
      repeatEscalationEveryDays: 3,
      dueSoonBeforeDays: 1
    };
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

export type ApprovalQueueItem = {
  id: string;
  status: string;
  dueAt?: string;
  project: Pick<Project, "id" | "code" | "title" | "documents">;
  step: Pick<WorkflowStep, "id" | "name" | "completionRule" | "minimumApprovals">;
  approver: Profile;
};

type ApprovalAssignmentRow = {
  id: string;
  status: string;
  due_at: string | null;
  profile: ProfileRow | ProfileRow[] | null;
  workflow_steps:
    | {
        id: string;
        step_name: string;
        completion_rule: WorkflowStep["completionRule"];
        minimum_approvals: number | null;
        workflow_instances:
          | {
              project_id: string;
              projects:
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })[]
                | null;
            }
          | {
              project_id: string;
              projects:
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })[]
                | null;
            }[]
          | null;
      }
    | {
        id: string;
        step_name: string;
        completion_rule: WorkflowStep["completionRule"];
        minimum_approvals: number | null;
        workflow_instances:
          | {
              project_id: string;
              projects:
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })[]
                | null;
            }
          | {
              project_id: string;
              projects:
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })
                | (ProjectListRow & {
                    project_documents: DocumentRow[];
                  })[]
                | null;
            }[]
          | null;
      }[]
    | null;
};

export async function listApprovalAssignments(): Promise<ApprovalQueueItem[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return demoProjects.flatMap((project) =>
      project.workflow.flatMap((step) =>
        step.approvers.map((assignment) => ({
          id: assignment.id,
          status: assignment.status,
          dueAt: assignment.dueAt,
          project: {
            id: project.id,
            code: project.code,
            title: project.title,
            documents: project.documents
          },
          step: {
            id: step.id,
            name: step.name,
            completionRule: step.completionRule,
            minimumApprovals: step.minimumApprovals
          },
          approver: assignment.profile
        }))
      )
    );
  }

  const { data, error } = await supabase
    .from("workflow_step_approvers")
    .select(
      `
      id, status, due_at,
      profile:profiles!workflow_step_approvers_approver_id_fkey(id, display_name, email, role, position),
      workflow_steps(
        id, step_name, completion_rule, minimum_approvals,
        workflow_instances(
          project_id,
          projects(
            id, code, title, abstract, status, project_type:project_types(name), academic_program,
            submitted_at, completed_at, due_at, updated_at,
            project_documents(
              id, document_type,
              document_versions(
                id, document_id, version_number, original_file_name, mime_type, file_size,
                sha256_hash, active_version, revision_note, uploaded_at,
                uploaded_by_profile:profiles!document_versions_uploaded_by_fkey(id, display_name, email, role, position)
              )
            )
          )
        )
      )
    `
    )
    .is("invalidated_at", null)
    .order("due_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as ApprovalAssignmentRow[]).flatMap((assignment) => {
    const step = firstOrNull(assignment.workflow_steps);
    const instance = firstOrNull(step?.workflow_instances ?? null);
    const project = firstOrNull(instance?.projects ?? null);

    if (!step || !project) {
      return [];
    }

    return [
      {
        id: assignment.id,
        status: assignment.status,
        dueAt: assignment.due_at ?? undefined,
        project: {
          id: project.id,
          code: project.code,
          title: project.title,
          documents: mapDocuments(project.project_documents)
        },
        step: {
          id: step.id,
          name: step.step_name,
          completionRule: step.completion_rule,
          minimumApprovals: step.minimum_approvals
        },
        approver: mapProfile(assignment.profile)
      }
    ];
  });
}

export async function getApprovalAssignment(assignmentId: string): Promise<ApprovalQueueItem | null> {
  const assignments = await listApprovalAssignments();
  return assignments.find((assignment) => assignment.id === assignmentId) ?? null;
}
