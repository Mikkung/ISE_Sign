import { createSupabaseAdminClient } from "./supabase/admin";
import type { TestDataProjectRow } from "./test-data-cleanup-shared";
import type { ProjectStatus } from "./types";

export function testDataToolsEnabled() {
  return process.env.ENABLE_TEST_DATA_TOOLS === "true";
}

export interface TestDataCleanupFilters {
  search?: string;
  status?: string;
  requester?: string;
  testLike?: boolean;
}

const testTitlePattern = /\b(test|testing|demo|sample)\b/i;

function includesCaseInsensitive(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

export async function listTestDataProjects(filters: TestDataCleanupFilters): Promise<TestDataProjectRow[]> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return [];
  }

  const { data: projectRows, error: projectError } = await admin
    .from("projects")
    .select(`
      id,
      code,
      title,
      academic_program,
      project_type_category,
      project_type_custom,
      status,
      created_at,
      submitted_at,
      student:profiles!projects_student_id_fkey(display_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(300);

  if (projectError) {
    throw new Error(projectError.message);
  }

  const projects = (projectRows ?? []) as unknown as Array<{
    id: string;
    code: string;
    title: string;
    academic_program: string | null;
    project_type_category: string | null;
    project_type_custom: string | null;
    status: ProjectStatus;
    created_at: string;
    submitted_at: string | null;
    student: { display_name: string | null; email: string | null } | null;
  }>;
  const projectIds = projects.map((project) => project.id);

  if (projectIds.length === 0) {
    return [];
  }

  const { data: documents } = await admin
    .from("project_documents")
    .select("id, project_id")
    .in("project_id", projectIds);
  const documentRows = (documents ?? []) as Array<{ id: string; project_id: string }>;
  const documentIds = documentRows.map((document) => document.id);

  const [{ data: versions }, { data: steps }, { data: comments }, { data: approvals }] = await Promise.all([
    documentIds.length > 0
      ? admin.from("project_document_versions").select("id, document_id, storage_bucket, storage_path").in("document_id", documentIds)
      : Promise.resolve({ data: [] }),
    admin.from("workflow_steps").select("id, project_id, status").in("project_id", projectIds),
    admin.from("project_comments").select("id, project_id").in("project_id", projectIds),
    admin.from("approval_actions").select("id, project_id").in("project_id", projectIds)
  ]);
  const stepRows = (steps ?? []) as Array<{ id: string; project_id: string; status: string }>;
  const stepIds = stepRows.map((step) => step.id);
  const { data: assignments } = stepIds.length > 0
    ? await admin.from("workflow_assignments").select("id, workflow_step_id").in("workflow_step_id", stepIds)
    : { data: [] };

  const documentsByProject = new Map<string, number>();
  const versionsByProject = new Map<string, number>();
  const storageByProject = new Map<string, number>();
  const stepsByProject = new Map<string, Array<{ id: string; status: string }>>();
  const assignmentsByProject = new Map<string, number>();
  const commentsByProject = new Map<string, number>();
  const approvalsByProject = new Map<string, number>();
  const documentProjectById = new Map(documentRows.map((document) => [document.id, document.project_id]));
  const stepProjectById = new Map(stepRows.map((step) => [step.id, step.project_id]));

  for (const document of documentRows) {
    documentsByProject.set(document.project_id, (documentsByProject.get(document.project_id) ?? 0) + 1);
  }

  for (const version of (versions ?? []) as Array<{ document_id: string; storage_bucket: string; storage_path: string }>) {
    const projectId = documentProjectById.get(version.document_id);
    if (!projectId) continue;
    versionsByProject.set(projectId, (versionsByProject.get(projectId) ?? 0) + 1);
    if (version.storage_bucket === "project-documents" && version.storage_path.startsWith(`${projectId}/`)) {
      storageByProject.set(projectId, (storageByProject.get(projectId) ?? 0) + 1);
    }
  }

  for (const step of stepRows) {
    stepsByProject.set(step.project_id, [...(stepsByProject.get(step.project_id) ?? []), { id: step.id, status: step.status }]);
  }

  for (const assignment of (assignments ?? []) as Array<{ workflow_step_id: string }>) {
    const projectId = stepProjectById.get(assignment.workflow_step_id);
    if (!projectId) continue;
    assignmentsByProject.set(projectId, (assignmentsByProject.get(projectId) ?? 0) + 1);
  }

  for (const comment of (comments ?? []) as Array<{ project_id: string }>) {
    commentsByProject.set(comment.project_id, (commentsByProject.get(comment.project_id) ?? 0) + 1);
  }

  for (const approval of (approvals ?? []) as Array<{ project_id: string }>) {
    approvalsByProject.set(approval.project_id, (approvalsByProject.get(approval.project_id) ?? 0) + 1);
  }

  return projects
    .map((project) => {
      const workflowSteps = stepsByProject.get(project.id) ?? [];
      const activeWorkflowCount = workflowSteps.filter((step) => ["waiting", "in_progress", "overdue"].includes(step.status)).length;
      const workflowStatus = workflowSteps.length === 0
        ? "No workflow"
        : activeWorkflowCount > 0
          ? `${activeWorkflowCount} active step${activeWorkflowCount === 1 ? "" : "s"}`
          : "No active steps";
      return {
        id: project.id,
        code: project.code,
        title: project.title,
        requester: project.student?.display_name ?? "Unknown requester",
        requesterEmail: project.student?.email ?? "",
        program: project.academic_program ?? "-",
        projectType: project.project_type_custom || project.project_type_category || "-",
        status: project.status,
        createdAt: project.created_at,
        submittedAt: project.submitted_at,
        documentCount: documentsByProject.get(project.id) ?? 0,
        documentVersionCount: versionsByProject.get(project.id) ?? 0,
        workflowStepCount: workflowSteps.length,
        assignmentCount: assignmentsByProject.get(project.id) ?? 0,
        approvalActionCount: approvalsByProject.get(project.id) ?? 0,
        commentCount: commentsByProject.get(project.id) ?? 0,
        storageObjectCount: storageByProject.get(project.id) ?? 0,
        workflowStatus
      };
    })
    .filter((project) => {
      if (filters.status && project.status !== filters.status) return false;
      if (filters.testLike && !testTitlePattern.test(project.title)) return false;
      if (filters.search && ![project.title, project.code, project.id].some((value) => includesCaseInsensitive(value, filters.search!))) return false;
      if (filters.requester && ![project.requester, project.requesterEmail].some((value) => includesCaseInsensitive(value, filters.requester!))) return false;
      return true;
    });
}

export async function resolveProjectStoragePaths(projectIds: string[]) {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Server-side Supabase service access is not configured.");
  }

  const { data: documents, error: documentError } = await admin
    .from("project_documents")
    .select("id, project_id")
    .in("project_id", projectIds);

  if (documentError) {
    throw new Error(documentError.message);
  }

  const documentRows = (documents ?? []) as Array<{ id: string; project_id: string }>;
  const documentProjectById = new Map(documentRows.map((document) => [document.id, document.project_id]));
  const documentIds = documentRows.map((document) => document.id);

  if (documentIds.length === 0) {
    return [];
  }

  const { data: versions, error: versionError } = await admin
    .from("project_document_versions")
    .select("document_id, storage_bucket, storage_path")
    .in("document_id", documentIds);

  if (versionError) {
    throw new Error(versionError.message);
  }

  return [...new Set(((versions ?? []) as Array<{ document_id: string; storage_bucket: string; storage_path: string }>)
    .filter((version) => {
      const projectId = documentProjectById.get(version.document_id);
      return projectId && version.storage_bucket === "project-documents" && version.storage_path.startsWith(`${projectId}/`);
    })
    .map((version) => version.storage_path))];
}
