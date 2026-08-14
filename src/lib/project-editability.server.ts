import {
  getProjectEditability,
  getStudentWorkflowEditability,
  type ProjectEditability,
  type ProjectEditabilityInput
} from "./project-editability";
import type { ProjectStatus, UserRole } from "./types";

interface SupabaseErrorLike {
  message: string;
}

interface SupabaseQueryResult<T> {
  data: T | null;
  error: SupabaseErrorLike | null;
}

interface SupabaseSelectBuilder<T> extends PromiseLike<SupabaseQueryResult<T>> {
  eq(column: string, value: unknown): SupabaseSelectBuilder<T>;
  in(column: string, values: unknown[]): SupabaseSelectBuilder<T>;
}

interface SupabaseTableQuery {
  select(columns: string): SupabaseSelectBuilder<unknown>;
}

interface SupabaseEditabilityClient {
  from(table: string): SupabaseTableQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseQueryResult<unknown>>;
}

export async function countValidProjectApprovalActions(
  supabaseClient: unknown,
  projectId: string
) {
  const supabase = supabaseClient as SupabaseEditabilityClient;
  const actionsResult = await supabase
    .from("approval_actions")
    .select("id")
    .eq("project_id", projectId) as SupabaseQueryResult<Array<{ id: string }>>;

  if (actionsResult.error) {
    throw new Error(actionsResult.error.message);
  }

  const actionIds = (actionsResult.data ?? []).map((action) => action.id);

  if (actionIds.length === 0) {
    return 0;
  }

  const invalidationsResult = await supabase
    .from("approval_action_invalidations")
    .select("approval_action_id")
    .in("approval_action_id", actionIds) as SupabaseQueryResult<Array<{ approval_action_id: string }>>;

  if (invalidationsResult.error) {
    throw new Error(invalidationsResult.error.message);
  }

  const invalidatedActionIds = new Set((invalidationsResult.data ?? []).map((row) => row.approval_action_id));
  return actionIds.filter((actionId) => !invalidatedActionIds.has(actionId)).length;
}

export async function getProjectEditabilityForUser(
  supabaseClient: unknown,
  input: {
    projectId: string;
    userId: string;
    role: UserRole;
    isActive: boolean;
    studentId: string;
    status: ProjectStatus;
  }
): Promise<ProjectEditability> {
  const supabase = supabaseClient as SupabaseEditabilityClient;
  const [validApprovalActionCount, staffCanManage] = await Promise.all([
    countValidProjectApprovalActions(supabase, input.projectId),
    input.role === "staff"
      ? supabase.rpc("staff_can_manage_project", { p_project_id: input.projectId })
      : Promise.resolve({ data: false, error: null } satisfies SupabaseQueryResult<unknown>)
  ]);

  if (staffCanManage.error) {
    throw new Error(staffCanManage.error.message);
  }

  const editabilityInput: ProjectEditabilityInput = {
    role: input.role,
    userId: input.userId,
    isActive: input.isActive,
    studentId: input.studentId,
    status: input.status,
    validApprovalActionCount,
    staffCanManage: staffCanManage.data === true
  };

  return getProjectEditability(editabilityInput);
}

export async function getStudentWorkflowEditabilityForUser(
  supabaseClient: unknown,
  input: {
    projectId: string;
    userId: string;
    role: UserRole;
    isActive: boolean;
    studentId: string;
    status: ProjectStatus;
  }
): Promise<ProjectEditability> {
  const validApprovalActionCount = await countValidProjectApprovalActions(supabaseClient, input.projectId);
  const editabilityInput: ProjectEditabilityInput = {
    role: input.role,
    userId: input.userId,
    isActive: input.isActive,
    studentId: input.studentId,
    status: input.status,
    validApprovalActionCount
  };

  return getStudentWorkflowEditability(editabilityInput);
}
