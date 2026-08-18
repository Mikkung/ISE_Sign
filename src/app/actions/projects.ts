"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDocumentHash, createVerificationCode } from "@/lib/certificates";
import { completedDocumentType } from "@/lib/completed-documents";
import { certificationStatement } from "@/lib/constants";
import { validateCancellationReason } from "@/lib/project-cancellation";
import { getStaleProjectEditMessage } from "@/lib/project-editability";
import { getProjectEditabilityForUser, getStudentWorkflowEditabilityForUser } from "@/lib/project-editability.server";
import {
  buildDefaultWorkflowPlan,
  defaultFacultyApprovalStepName,
  defaultStaffReviewStepName
} from "@/lib/default-workflow";
import {
  allowedAttachmentMimeTypes,
  getProjectAttachments,
  maxAttachmentBytes,
  normalizeProjectType,
  projectAttachmentFieldName,
  projectRequestSchema,
  validateProjectAttachments,
  validateProjectAttachmentMetadata,
} from "@/lib/project-request-validation";
import { getPdfPageCount, resolveAutomaticSignaturePlacement, stampPdfWithSignature } from "@/lib/pdf-signing";
import { parseVisualApprovalForm, signatureStoragePath } from "@/lib/signatures";
import { getAuthenticatedRequesterIdentity } from "@/lib/student-directory";
import {
  defaultStudentWorkflow,
  validateStudentWorkflow,
  type StudentWorkflowStepInput,
  type WorkflowProfileOption
} from "@/lib/student-workflow";
import { buildStudentWorkflowRpcSteps } from "@/lib/student-workflow-persistence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApprovalDecision, CompletionRule, ProjectStatus, StepMode, UserRole } from "@/lib/types";
import {
  planWorkflowAfterDecision,
  type WorkflowExecutionAssignmentStatus,
  type WorkflowExecutionStep
} from "@/lib/workflow-execution";

const uuidSchema = z.string().uuid();
const workflowStepSchema = z.object({
  name: z.string().trim().min(2),
  role: z.enum(["staff", "approver", "admin"]).default("staff"),
  mode: z.enum(["sequential", "parallel"]),
  completionRule: z.enum(["all", "any", "minimum"]),
  minimumApprovals: z.coerce.number().int().min(1).optional(),
  requiresSignature: z.coerce.boolean().optional(),
  dueAt: z.string().optional(),
  reason: z.string().trim().optional()
});
const decisionSchema = z.enum(["approved", "rejected", "revision_requested"]);
const roleSchema = z.enum(["student", "staff", "approver", "admin"]);
const requesterIdentityErrorMessage =
  "We could not confirm your verified requester identity for this project. Sign in again and retry.";
const projectCreateErrorMessage = "Project could not be created. Check your details and try again.";
const directProjectUploadErrorMessage = "Project upload could not be prepared. Check your files and try again.";

function newProjectUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/new?${search.toString()}`;
}

function projectDocumentsUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/${projectId}/documents?${search.toString()}`;
}

function projectEditUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/${projectId}/edit?${search.toString()}`;
}

function staffReviewUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/staff/review/${projectId}?${search.toString()}`;
}

function workflowUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/${projectId}/workflow?${search.toString()}`;
}

function projectUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/${projectId}?${search.toString()}`;
}

function approvalUrl(assignmentId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/approvals/${assignmentId}?${search.toString()}`;
}

function isRequesterIdentityDatabaseError(message: string) {
  return [
    "Authenticated requester identity is required before submission.",
    "Authenticated student directory record is invalid or inactive.",
    "Authenticated requester does not match the project owner.",
    "Requester email is invalid.",
    "Verified requester identity is required before submission.",
    "Verified student directory record is invalid or inactive.",
    "A valid unconsumed student email verification is required before submission."
  ].some((knownMessage) => message.includes(knownMessage));
}

type ApprovalAssignmentRow = {
  id: string;
  status: string;
  approver_id: string;
  workflow_step_id: string;
  step: {
    id: string;
    project_id: string;
    name: string;
    status: string;
    certification_required: boolean;
    revision_allowed: boolean;
    project?: {
      code: string | null;
      title: string | null;
      status: string | null;
    } | null;
  } | null;
};
type ActiveAssignmentNotificationRow = {
  id: string;
  approver_id: string;
  step: {
    name: string | null;
    project: { title: string | null } | null;
  } | null;
};
type ActivatableStepRow = {
  id: string;
  step_order: number;
  workflow_assignments?: Array<{ id: string }> | null;
};
type DefaultWorkflowResult =
  | {
      ok: true;
      created: boolean;
      staffAssignmentCount: number;
      facultyAssignmentCount: number;
    }
  | {
      ok: false;
      message: string;
    };

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

const projectAttachmentMetadataSchema = z.object({
  clientFileId: z.string().min(1).max(240),
  name: z.string().min(1).max(255),
  size: z.coerce.number().int().positive(),
  type: z.string().min(1).max(180)
});

const preparedProjectAttachmentSchema = projectAttachmentMetadataSchema.extend({
  documentId: uuidSchema,
  storagePath: z.string().min(1).max(700)
});

const directProjectUploadSchema = z.object({
  title: z.string(),
  abstract: z.string().optional(),
  academicProgram: z.string().optional(),
  projectTypeCategory: z.string(),
  projectTypeCustom: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  intent: z.enum(["draft", "submit"]),
  files: z.array(projectAttachmentMetadataSchema).max(12)
});

const finalizeProjectUploadSchema = directProjectUploadSchema.extend({
  projectId: uuidSchema,
  files: z.array(preparedProjectAttachmentSchema).max(12)
});

function parseDirectProjectPayload(input: z.infer<typeof directProjectUploadSchema>) {
  return projectRequestSchema.safeParse({
    title: input.title,
    abstract: input.abstract,
    academicProgram: input.academicProgram,
    projectTypeCategory: input.projectTypeCategory,
    projectTypeCustom: input.projectTypeCustom,
    startDate: input.startDate,
    endDate: input.endDate,
    intent: input.intent
  });
}

function isExpectedProjectStoragePath(input: {
  projectId: string;
  documentId: string;
  storagePath: string;
}) {
  return input.storagePath.startsWith(`${input.projectId}/${input.documentId}/v1-`);
}

async function requireSupabase() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}

async function requireCurrentUser(supabase: Awaited<ReturnType<typeof requireSupabase>>) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication is required.");
  }

  return user;
}

async function requireAuthenticatedStudentRequester(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  failureUrl: string
) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    redirect(failureUrl);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    redirect(failureUrl);
  }

  const requester = await getAuthenticatedRequesterIdentity();

  if (!requester) {
    redirect(failureUrl);
  }

  return { user, requester };
}

async function getCurrentProfile(supabase: Awaited<ReturnType<typeof requireSupabase>>) {
  const user = await requireCurrentUser(supabase);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, position, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Your authenticated user does not have a public profile yet.");
  }

  return {
    user,
    profile: data as {
      id: string;
      display_name: string;
      email: string;
      role: UserRole;
      position: string | null;
      is_active: boolean | null;
    }
  };
}

function requireRole(role: UserRole, allowed: UserRole[]) {
  if (!allowed.includes(role)) {
    throw new Error("You are not authorized to perform this action.");
  }
}

async function assertProjectAccess(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const { data, error } = await supabase.rpc("user_can_access_project", { p_project_id: projectId });

  if (error || data !== true) {
    throw new Error(error?.message ?? "You are not authorized to access this project.");
  }
}

async function assertStaffCanManageProject(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const { data, error } = await supabase.rpc("staff_can_manage_project", { p_project_id: projectId });

  if (error || data !== true) {
    throw new Error(error?.message ?? "You are not authorized to manage this project.");
  }
}

async function audit(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata
  });
}

async function uploadProjectAttachment(input: {
  supabase: Awaited<ReturnType<typeof requireSupabase>>;
  userId: string;
  projectId: string;
  file: File;
  documentType?: string;
}) {
  const documentType = input.documentType ?? "Attachment";

  if (input.file.size <= 0) {
    throw new Error("Attachment cannot be empty.");
  }

  if (input.file.size > maxAttachmentBytes) {
    throw new Error("Attachment must be 50 MB or smaller.");
  }

  const mimeType = input.file.type || "application/octet-stream";

  if (!allowedAttachmentMimeTypes.includes(mimeType as (typeof allowedAttachmentMimeTypes)[number])) {
    throw new Error("Attachment file type is not allowed.");
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256Hash = createDocumentHash(bytes);
  const documentId = randomUUID();
  const { error: documentError } = await input.supabase
    .from("project_documents")
    .insert({ id: documentId, project_id: input.projectId, document_type: documentType });

  if (documentError) {
    throw new Error(documentError.message);
  }

  const storagePath = `${input.projectId}/${documentId}/v1-${randomUUID()}-${sanitizeFilename(input.file.name)}`;
  const { error: uploadError } = await input.supabase.storage
    .from("project-documents")
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: versionError } = await input.supabase.from("project_document_versions").insert({
    document_id: documentId,
    version_number: 1,
    storage_bucket: "project-documents",
    storage_path: storagePath,
    original_file_name: input.file.name,
    mime_type: mimeType,
    file_size: input.file.size,
    sha256_hash: sha256Hash,
    active: true,
    uploaded_by: input.userId
  });

  if (versionError) {
    await input.supabase.storage.from("project-documents").remove([storagePath]);
    throw new Error(versionError.message);
  }

  return { documentId, sha256Hash, storagePath };
}

async function cleanupFailedNewProject(input: {
  projectId: string;
  storagePaths: string[];
  supabase: Awaited<ReturnType<typeof requireSupabase>>;
  userId: string;
}) {
  try {
    if (input.storagePaths.length > 0) {
      await input.supabase.storage.from("project-documents").remove(input.storagePaths);
    }

    const admin = createSupabaseAdminClient();

    if (admin) {
      await admin.from("projects").delete().eq("id", input.projectId).eq("student_id", input.userId);
    } else {
      await input.supabase.from("projects").delete().eq("id", input.projectId).eq("student_id", input.userId);
    }
  } catch (cleanupError) {
    console.error("Project creation cleanup failed", {
      projectId: input.projectId,
      message: cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error"
    });
  }
}

async function getLatestActiveDocumentVersion(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const { data: documents, error: documentError } = await supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", projectId);

  if (documentError) {
    throw new Error(documentError.message);
  }

  const documentIds = (documents ?? []).map((document) => document.id as string);

  if (documentIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("project_document_versions")
    .select("id, document_id, version_number, sha256_hash, storage_bucket, storage_path, original_file_name, mime_type, file_size")
    .in("document_id", documentIds)
    .eq("active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as
    | {
        id: string;
        document_id: string;
        version_number: number;
        sha256_hash: string;
        storage_bucket: string;
        storage_path: string;
        original_file_name: string;
        mime_type: string;
        file_size: number;
      }
    | null;
}

async function ensureCertificate(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, completed_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!project?.completed_at) {
    return;
  }

  const documentVersion = await getLatestActiveDocumentVersion(supabase, projectId);

  if (!documentVersion) {
    return;
  }

  const certificateClient = createSupabaseAdminClient() ?? supabase;

  await certificateClient.from("certificates").upsert(
    {
      project_id: projectId,
      document_version_id: documentVersion.id,
      document_sha256_hash: documentVersion.sha256_hash,
      verification_code: createVerificationCode(projectId, project.completed_at),
      generated_at: project.completed_at
    },
    { onConflict: "project_id" }
  );
}

async function recomputeWorkflowState(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const workflowClient = createSupabaseAdminClient() ?? supabase;
  const { data, error } = await workflowClient
    .from("workflow_steps")
    .select("id, step_order, name, status, activated_at, started_at, completion_rule, minimum_approvals, workflow_assignments(id, status)")
    .eq("project_id", projectId)
    .order("step_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const steps = (data ?? []) as Array<{
    id: string;
    step_order: number;
    name: string;
    status: string;
    activated_at: string | null;
    started_at: string | null;
    completion_rule: CompletionRule;
    minimum_approvals: number | null;
    workflow_assignments: Array<{ id: string; status: string }>;
  }>;

  const plan = planWorkflowAfterDecision(steps.map((step) => ({
    id: step.id,
    order: step.step_order,
    status: step.status as WorkflowExecutionStep["status"],
    completionRule: step.completion_rule,
    minimumApprovals: step.minimum_approvals,
    assignments: step.workflow_assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status as WorkflowExecutionAssignmentStatus
    }))
  })));
  const now = new Date().toISOString();

  for (const update of plan.stepUpdates) {
    const payload: Record<string, string | null> = { status: update.status, updated_at: now };
    if (update.completed) {
      payload.completed_at = now;
    }
    if (update.active) {
      const step = steps.find((candidate) => candidate.id === update.id);
      payload.activated_at = step?.activated_at ?? now;
      payload.started_at = step?.started_at ?? now;
    }

    const { error: stepUpdateError } = await workflowClient
      .from("workflow_steps")
      .update(payload)
      .eq("id", update.id);

    if (stepUpdateError) {
      throw new Error(stepUpdateError.message);
    }
  }

  if (plan.invalidateAssignmentIds.length > 0) {
    const { error: invalidateError } = await workflowClient
      .from("workflow_assignments")
      .update({ status: "invalidated", invalidated_at: now })
      .in("id", plan.invalidateAssignmentIds);

    if (invalidateError) {
      throw new Error(invalidateError.message);
    }
  }

  if (plan.projectStatus === "completed") {
    const { error: projectUpdateError } = await workflowClient
      .from("projects")
      .update({ status: "completed", completed_at: now, current_responsible: null, updated_at: now })
      .eq("id", projectId);

    if (projectUpdateError) {
      throw new Error(projectUpdateError.message);
    }

    await ensureCertificate(workflowClient, projectId);
    return;
  }

  if (plan.projectStatus === "rejected" || plan.projectStatus === "revision_required") {
    const { error: projectUpdateError } = await workflowClient
      .from("projects")
      .update(
        plan.projectStatus === "rejected"
          ? { status: "rejected", rejected_at: now, current_responsible: null, updated_at: now }
          : { status: "revision_required", current_responsible: "Requester revision", updated_at: now }
      )
      .eq("id", projectId);

    if (projectUpdateError) {
      throw new Error(projectUpdateError.message);
    }

    return;
  }

  const currentResponsible = plan.activeStepId
    ? `Waiting for ${steps.find((step) => step.id === plan.activeStepId)?.name ?? "next step"}`
    : null;
  const { error: projectUpdateError } = await workflowClient
    .from("projects")
    .update({
      status: "approval_pending",
      current_responsible: currentResponsible,
      updated_at: now
    })
    .eq("id", projectId);

  if (projectUpdateError) {
    throw new Error(projectUpdateError.message);
  }

  if (plan.activeStepId) {
    await notifyActiveStep(workflowClient, projectId, plan.activeStepId);
  }
}

async function createInAppNotification(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  recipientId: string,
  projectId: string | null,
  assignmentId: string | null,
  type: string,
  subject: string,
  body: string,
  dedupeKey: string
) {
  const existing = await supabase
    .from("notification_logs")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing.data) {
    return;
  }

  const { error } = await supabase.from("notification_logs").insert({
    recipient_id: recipientId,
    project_id: projectId,
    assignment_id: assignmentId,
    channel: "in_app",
    type,
    subject,
    body,
    status: "sent",
    sent_at: new Date().toISOString(),
    dedupe_key: dedupeKey
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

async function notifyActiveStep(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string,
  stepId: string
) {
  const { data, error } = await supabase
    .from("workflow_assignments")
    .select("id, approver_id, step:workflow_steps!workflow_assignments_workflow_step_id_fkey(name, project:projects!workflow_steps_project_id_fkey(title))")
    .eq("workflow_step_id", stepId)
    .in("status", ["waiting", "opened"]);

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all(
    ((data ?? []) as unknown as ActiveAssignmentNotificationRow[]).map((assignment) =>
      createInAppNotification(
        supabase,
        assignment.approver_id,
        projectId,
        assignment.id,
        "initial_notification",
        "New approval assignment",
        `Please review ${assignment.step?.project?.title ?? "the project"} at ${assignment.step?.name ?? "the active step"}.`,
        `${assignment.id}:initial_notification:in_app`
      )
    )
  );
}

async function notifyAssignmentsById(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string,
  assignmentIds: string[]
) {
  if (assignmentIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("workflow_assignments")
    .select("id, approver_id, step:workflow_steps!workflow_assignments_workflow_step_id_fkey(name, project:projects!workflow_steps_project_id_fkey(title))")
    .in("id", assignmentIds)
    .in("status", ["waiting", "opened"]);

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all(
    ((data ?? []) as unknown as ActiveAssignmentNotificationRow[]).map((assignment) =>
      createInAppNotification(
        supabase,
        assignment.approver_id,
        projectId,
        assignment.id,
        "initial_notification",
        "New approval assignment",
        `Please review ${assignment.step?.project?.title ?? "the project"} at ${assignment.step?.name ?? "the active step"}.`,
        `${assignment.id}:initial_notification:in_app`
      )
    )
  );
}

async function ensureDefaultProjectWorkflow({
  createdBy,
  projectId
}: {
  supabase: Awaited<ReturnType<typeof requireSupabase>>;
  projectId: string;
  createdBy: string;
}): Promise<DefaultWorkflowResult> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { ok: false, message: "Default workflow setup is not configured." };
  }

  const { data: existingSteps, error: existingError } = await admin
    .from("workflow_steps")
    .select("id, step_order, status, workflow_assignments(id)")
    .eq("project_id", projectId)
    .order("step_order", { ascending: true });

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if ((existingSteps ?? []).length > 0) {
    const firstStep = existingSteps?.[0];
    const hasActiveStep = (existingSteps ?? []).some((step) => step.status === "in_progress");
    const hasEmptyStep = (existingSteps ?? []).some((step) => (step.workflow_assignments ?? []).length === 0);

    if (firstStep && !hasActiveStep && !hasEmptyStep) {
      const now = new Date().toISOString();
      await admin.from("workflow_steps").update({ status: "waiting" }).eq("project_id", projectId);
      await admin
        .from("workflow_steps")
        .update({ status: "in_progress", activated_at: now, started_at: now })
        .eq("id", firstStep.id);
      await admin
        .from("projects")
        .update({ status: "approval_pending", updated_at: now })
        .eq("id", projectId)
        .in("status", ["submitted", "approval_pending"]);
      await notifyActiveStep(admin as Awaited<ReturnType<typeof requireSupabase>>, projectId, firstStep.id as string);
    }

    return { ok: true, created: false, staffAssignmentCount: 0, facultyAssignmentCount: 0 };
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .in("role", ["staff", "approver"]);

  if (profilesError) {
    return { ok: false, message: profilesError.message };
  }

  const plan = buildDefaultWorkflowPlan(
    (profiles ?? []).map((profile) => ({
      id: profile.id as string,
      role: profile.role as UserRole,
      isActive: profile.is_active as boolean | null
    }))
  );

  if (!plan.ok) {
    return plan;
  }

  const now = new Date().toISOString();
  const createdStepIds: string[] = [];

  try {
    const staffStepId = randomUUID();
    const facultyStepId = randomUUID();
    const { error: staffStepError } = await admin.from("workflow_steps").insert({
      id: staffStepId,
      project_id: projectId,
      name: defaultStaffReviewStepName,
      step_order: 1,
      assignee_role: "staff",
      assignment_mode: "any_active_role",
      mode: "parallel",
      status: "in_progress",
      completion_rule: "any",
      minimum_approvals: null,
      certification_required: false,
      revision_allowed: true,
      activated_at: now,
      started_at: now,
      created_by: createdBy
    });

    if (staffStepError) {
      if (staffStepError.code === "23505") {
        return { ok: true, created: false, staffAssignmentCount: 0, facultyAssignmentCount: 0 };
      }

      throw new Error(staffStepError.message);
    }

    createdStepIds.push(staffStepId);

    const { error: facultyStepError } = await admin.from("workflow_steps").insert({
      id: facultyStepId,
      project_id: projectId,
      name: defaultFacultyApprovalStepName,
      step_order: 2,
      assignee_role: "approver",
      assignment_mode: "any_active_role",
      mode: "parallel",
      status: "waiting",
      completion_rule: "any",
      minimum_approvals: null,
      certification_required: true,
      revision_allowed: true,
      created_by: createdBy
    });

    if (facultyStepError) {
      throw new Error(facultyStepError.message);
    }

    createdStepIds.push(facultyStepId);

    const staffAssignments = plan.staffApproverIds.map((approverId) => ({
      id: randomUUID(),
      workflow_step_id: staffStepId,
      approver_id: approverId,
      created_by: createdBy
    }));
    const facultyAssignments = plan.facultyApproverIds.map((approverId) => ({
      id: randomUUID(),
      workflow_step_id: facultyStepId,
      approver_id: approverId,
      created_by: createdBy
    }));

    const { error: assignmentError } = await admin.from("workflow_assignments").insert([
      ...staffAssignments,
      ...facultyAssignments
    ]);

    if (assignmentError) {
      throw new Error(assignmentError.message);
    }

    const { error: projectError } = await admin
      .from("projects")
      .update({ status: "approval_pending", updated_at: now })
      .eq("id", projectId)
      .in("status", ["submitted", "approval_pending"]);

    if (projectError) {
      throw new Error(projectError.message);
    }

    await admin.from("workflow_change_log").insert({
      project_id: projectId,
      workflow_step_id: staffStepId,
      changed_by: createdBy,
      change_type: "default_workflow_created",
      reason: "Default Staff Review and Faculty Approval workflow created",
      after_state: {
        staffStepId,
        facultyStepId,
        staffAssignmentCount: staffAssignments.length,
        facultyAssignmentCount: facultyAssignments.length
      }
    });
    await notifyActiveStep(admin as Awaited<ReturnType<typeof requireSupabase>>, projectId, staffStepId);

    return {
      ok: true,
      created: true,
      staffAssignmentCount: staffAssignments.length,
      facultyAssignmentCount: facultyAssignments.length
    };
  } catch (error) {
    if (createdStepIds.length > 0) {
      await admin.from("workflow_steps").delete().in("id", createdStepIds);
    }

    return {
      ok: false,
      message: error instanceof Error ? error.message : "Default workflow setup failed."
    };
  }
}

export async function prepareProjectUploadAction(input: z.infer<typeof directProjectUploadSchema>) {
  const rawFileCount = Array.isArray((input as { files?: unknown })?.files) ? input.files.length : 0;
  console.info("prepareProjectUploadAction started", {
    hasAttachments: rawFileCount > 0,
    attachmentCount: rawFileCount
  });

  const parsedInput = directProjectUploadSchema.safeParse(input);

  if (!parsedInput.success) {
    return { ok: false as const, message: "Check the project details and selected files." };
  }

  const payloadResult = parseDirectProjectPayload(parsedInput.data);

  if (!payloadResult.success) {
    return { ok: false as const, message: payloadResult.error.issues[0]?.message ?? "Check the project details and try again." };
  }

  const attachmentValidation = validateProjectAttachmentMetadata({
    files: parsedInput.data.files,
    requireAttachment: parsedInput.data.intent === "submit"
  });

  if (!attachmentValidation.ok) {
    return { ok: false as const, message: attachmentValidation.message };
  }

  const supabase = await requireSupabase();
  await requireAuthenticatedStudentRequester(
    supabase,
    newProjectUrl({ error: requesterIdentityErrorMessage })
  );
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { ok: false as const, message: "Server-side storage upload access is not configured." };
  }

  const projectId = randomUUID();
  const files = [];

  for (const file of parsedInput.data.files) {
    const documentId = randomUUID();
    const storagePath = `${projectId}/${documentId}/v1-${randomUUID()}-${sanitizeFilename(file.name)}`;
    const { data, error } = await admin.storage.from("project-documents").createSignedUploadUrl(storagePath);

    if (error || !data?.token) {
      console.error("Project direct upload URL creation failed", {
        message: error?.message ?? "Signed upload token was not returned.",
        projectId,
        attachmentCount: parsedInput.data.files.length
      });
      return { ok: false as const, message: directProjectUploadErrorMessage };
    }

    files.push({
      clientFileId: file.clientFileId,
      documentId,
      storagePath,
      token: data.token,
      name: file.name,
      size: file.size,
      type: file.type
    });
  }

  return { ok: true as const, projectId, files };
}

export async function cleanupPreparedProjectUploadAction(input: { projectId: string; storagePaths: string[] }) {
  const parsedProjectId = uuidSchema.safeParse(input.projectId);
  const storagePaths = Array.isArray(input.storagePaths) ? [...new Set(input.storagePaths.map(String))] : [];

  if (!parsedProjectId.success || storagePaths.length === 0) {
    return { ok: true as const };
  }

  const supabase = await requireSupabase();
  await requireAuthenticatedStudentRequester(
    supabase,
    newProjectUrl({ error: requesterIdentityErrorMessage })
  );
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { ok: false as const, message: "Server-side cleanup access is not configured." };
  }

  const scopedPaths = storagePaths.filter((path) => path.startsWith(`${parsedProjectId.data}/`));

  if (scopedPaths.length === 0) {
    return { ok: true as const };
  }

  const { error } = await admin.storage.from("project-documents").remove(scopedPaths);

  if (error) {
    console.error("Prepared project upload cleanup failed", {
      projectId: parsedProjectId.data,
      objectCount: scopedPaths.length,
      message: error.message
    });
    return { ok: false as const, message: "Prepared upload cleanup failed." };
  }

  return { ok: true as const };
}

export async function finalizeProjectUploadAction(input: z.infer<typeof finalizeProjectUploadSchema>) {
  const rawFileCount = Array.isArray((input as { files?: unknown })?.files) ? input.files.length : 0;
  console.info("finalizeProjectUploadAction started", {
    hasAttachments: rawFileCount > 0,
    attachmentCount: rawFileCount
  });

  const parsedInput = finalizeProjectUploadSchema.safeParse(input);

  if (!parsedInput.success) {
    return { ok: false as const, message: "Check the project details and selected files." };
  }

  const payloadResult = parseDirectProjectPayload(parsedInput.data);

  if (!payloadResult.success) {
    return { ok: false as const, message: payloadResult.error.issues[0]?.message ?? "Check the project details and try again." };
  }

  const attachmentValidation = validateProjectAttachmentMetadata({
    files: parsedInput.data.files,
    requireAttachment: parsedInput.data.intent === "submit"
  });

  if (!attachmentValidation.ok) {
    return { ok: false as const, message: attachmentValidation.message };
  }

  const supabase = await requireSupabase();
  const { user, requester } = await requireAuthenticatedStudentRequester(
    supabase,
    newProjectUrl({ error: requesterIdentityErrorMessage })
  );
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { ok: false as const, message: "Server-side storage verification access is not configured." };
  }

  const payload = payloadResult.data;
  const projectType = normalizeProjectType({
    category: payload.projectTypeCategory,
    custom: payload.projectTypeCustom
  });
  const now = new Date().toISOString();
  const projectId = parsedInput.data.projectId;
  const uploadedStoragePaths = parsedInput.data.files.map((file) => file.storagePath);
  const verifiedFiles = [];

  try {
    for (const file of parsedInput.data.files) {
      if (!isExpectedProjectStoragePath({ projectId, documentId: file.documentId, storagePath: file.storagePath })) {
        throw new Error("Uploaded file path is not project-scoped.");
      }

      const { data: blob, error: downloadError } = await admin.storage.from("project-documents").download(file.storagePath);

      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "Uploaded file was not found in storage.");
      }

      const bytes = Buffer.from(await blob.arrayBuffer());

      if (bytes.byteLength !== file.size) {
        throw new Error("Uploaded file size did not match the authorized upload.");
      }

      if (blob.type && blob.type !== file.type) {
        throw new Error("Uploaded file MIME type did not match the authorized upload.");
      }

      verifiedFiles.push({
        ...file,
        sha256Hash: createDocumentHash(bytes)
      });
    }

    const { error } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        title: payload.title,
        abstract: payload.abstract ?? "",
        project_type_id: null,
        project_type_category: projectType.category,
        project_type_custom: projectType.custom,
        academic_program: payload.academicProgram ?? null,
        start_date: payload.startDate,
        end_date: payload.endDate,
        student_id: user.id,
        requester_id: user.id,
        status: "draft",
        student_directory_id: requester.directoryId,
        student_email_verification_id: null,
        requester_student_id: requester.studentId,
        requester_email: requester.email,
        requester_first_name: requester.firstName,
        requester_last_name: requester.lastName,
        requester_name: requester.displayName,
        requester_type: requester.requesterType,
        requester_organization: requester.organization,
        requester_verified_at: now,
        requester_auth_user_id: user.id
      });

    if (error) {
      throw new Error(error.message);
    }

    for (const file of verifiedFiles) {
      const { error: documentError } = await supabase
        .from("project_documents")
        .insert({ id: file.documentId, project_id: projectId, document_type: "Attachment" });

      if (documentError) {
        throw new Error(documentError.message);
      }

      const { error: versionError } = await supabase.from("project_document_versions").insert({
        document_id: file.documentId,
        version_number: 1,
        storage_bucket: "project-documents",
        storage_path: file.storagePath,
        original_file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        sha256_hash: file.sha256Hash,
        active: true,
        uploaded_by: user.id
      });

      if (versionError) {
        throw new Error(versionError.message);
      }

      await audit(supabase, user.id, "document.version_uploaded", "project", projectId, {
        documentId: file.documentId,
        sha256Hash: file.sha256Hash,
        storagePath: file.storagePath
      });
    }

    if (payload.intent === "submit") {
      const { error: submitError } = await supabase
        .from("projects")
        .update({ status: "submitted", submitted_at: now, updated_at: now })
        .eq("id", projectId)
        .eq("status", "draft");

      if (submitError) {
        throw new Error(submitError.message);
      }

      const workflowResult = await ensureDefaultProjectWorkflow({ supabase, projectId, createdBy: user.id });

      if (!workflowResult.ok) {
        console.error("Default workflow creation failed", {
          projectId,
          message: workflowResult.message
        });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";

    await audit(supabase, user.id, "project.create_failed", "project", projectId, { reason });
    await cleanupFailedNewProject({ projectId, storagePaths: uploadedStoragePaths, supabase, userId: user.id });

    if (isRequesterIdentityDatabaseError(reason)) {
      return { ok: false as const, message: requesterIdentityErrorMessage };
    }

    console.error("Project direct upload finalization failed", { projectId, reason });
    return { ok: false as const, message: projectCreateErrorMessage };
  }

  await audit(supabase, user.id, payload.intent === "submit" ? "project.submitted" : "project.created", "project", projectId, {
    projectTypeCategory: projectType.category,
    projectTypeCustom: projectType.custom,
    requesterVerified: true
  });
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { ok: true as const, projectId, redirectTo: `/projects/${projectId}` };
}

export async function createProjectAction(formData: FormData) {
  const diagnosticAttachments = getProjectAttachments(formData);
  console.info("createProjectAction started", {
    hasAttachments: diagnosticAttachments.length > 0,
    attachmentCount: diagnosticAttachments.length,
    attachmentFieldName: projectAttachmentFieldName
  });
  const supabase = await requireSupabase();
  const { user, requester } = await requireAuthenticatedStudentRequester(
    supabase,
    newProjectUrl({ error: requesterIdentityErrorMessage })
  );
  const payloadResult = projectRequestSchema.safeParse(Object.fromEntries(formData));

  if (!payloadResult.success) {
    redirect(newProjectUrl({ error: payloadResult.error.issues[0]?.message ?? "Check the project details and try again." }));
  }

  const payload = payloadResult.data;
  const attachments = diagnosticAttachments;
  const attachmentValidation = validateProjectAttachments({
    files: attachments,
    requireAttachment: payload.intent === "submit"
  });

  if (!attachmentValidation.ok) {
    redirect(newProjectUrl({ error: attachmentValidation.message }));
  }

  const projectType = normalizeProjectType({
    category: payload.projectTypeCategory,
    custom: payload.projectTypeCustom
  });
  const now = new Date().toISOString();
  const projectId = randomUUID();
  const uploadedStoragePaths: string[] = [];

  try {
    const { error } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        title: payload.title,
        abstract: payload.abstract ?? "",
        project_type_id: null,
        project_type_category: projectType.category,
        project_type_custom: projectType.custom,
        academic_program: payload.academicProgram ?? null,
        start_date: payload.startDate,
        end_date: payload.endDate,
        student_id: user.id,
        requester_id: user.id,
        status: "draft",
        student_directory_id: requester.directoryId,
        student_email_verification_id: null,
        requester_student_id: requester.studentId,
        requester_email: requester.email,
        requester_first_name: requester.firstName,
        requester_last_name: requester.lastName,
        requester_name: requester.displayName,
        requester_type: requester.requesterType,
        requester_organization: requester.organization,
        requester_verified_at: now,
        requester_auth_user_id: user.id
      });

    if (error) {
      throw new Error(error.message);
    }

    for (const file of attachments) {
      const uploaded = await uploadProjectAttachment({ supabase, userId: user.id, projectId, file });
      uploadedStoragePaths.push(uploaded.storagePath);
      await audit(supabase, user.id, "document.version_uploaded", "project", projectId, uploaded);
    }

    if (payload.intent === "submit") {
      const { error: submitError } = await supabase
        .from("projects")
        .update({ status: "submitted", submitted_at: now, updated_at: now })
        .eq("id", projectId)
        .eq("status", "draft");

      if (submitError) {
        throw new Error(submitError.message);
      }

      const workflowResult = await ensureDefaultProjectWorkflow({ supabase, projectId, createdBy: user.id });

      if (!workflowResult.ok) {
        console.error("Default workflow creation failed", {
          projectId,
          message: workflowResult.message
        });
      }
    }
  } catch (uploadOrSubmitError) {
    const reason = uploadOrSubmitError instanceof Error ? uploadOrSubmitError.message : "Unknown error";

    await audit(supabase, user.id, "project.create_failed", "project", projectId, {
      reason
    });
    await cleanupFailedNewProject({ projectId, storagePaths: uploadedStoragePaths, supabase, userId: user.id });

    if (isRequesterIdentityDatabaseError(reason)) {
      redirect(newProjectUrl({ error: requesterIdentityErrorMessage }));
    }

    console.error("Project creation failed", { projectId, reason });
    redirect(newProjectUrl({ error: projectCreateErrorMessage }));
  }

  await audit(supabase, user.id, payload.intent === "submit" ? "project.submitted" : "project.created", "project", projectId, {
    projectTypeCategory: projectType.category,
    projectTypeCustom: projectType.custom,
    requesterVerified: true
  });
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, student_id, requester_id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  if (!project) {
    redirect(projectUrl(projectId, { error: "Project not found." }));
  }

  const editability = await getProjectEditabilityForUser(supabase, {
    projectId,
    userId: user.id,
    role: profile.role,
    isActive: profile.is_active !== false,
    studentId: ((project.requester_id as string | null) ?? (project.student_id as string)),
    status: project.status as ProjectStatus
  });

  if (!editability.allowed) {
    if (["not_owner", "not_authorized", "inactive_profile"].includes(editability.reason)) {
      redirect("/unauthorized");
    }

    redirect(projectEditUrl(projectId, { error: getStaleProjectEditMessage(editability.reason) }));
  }

  const payload = z
    .preprocess((value) => ({ ...(value as Record<string, unknown>), intent: "draft" }), projectRequestSchema)
    .parse(Object.fromEntries(formData));
  const projectType = normalizeProjectType({
    category: payload.projectTypeCategory,
    custom: payload.projectTypeCustom
  });
  const updateClient = createSupabaseAdminClient() ?? supabase;
  const { error } = await updateClient
    .from("projects")
    .update({
      title: payload.title,
      abstract: payload.abstract ?? "",
      academic_program: payload.academicProgram ?? null,
      project_type_category: projectType.category,
      project_type_custom: projectType.custom,
      start_date: payload.startDate,
      end_date: payload.endDate,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "project.updated", "project", projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function uploadDocumentVersionAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

  const { data: uploadProject, error: uploadProjectError } = await supabase
    .from("projects")
    .select("id, student_id, requester_id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (uploadProjectError) {
    throw new Error(uploadProjectError.message);
  }

  if (!uploadProject) {
    redirect(projectDocumentsUrl(projectId, { error: "Project not found." }));
  }

  const editability = await getProjectEditabilityForUser(supabase, {
    projectId,
    userId: user.id,
    role: profile.role,
    isActive: profile.is_active !== false,
    studentId: ((uploadProject.requester_id as string | null) ?? (uploadProject.student_id as string)),
    status: uploadProject.status as ProjectStatus
  });

  if (!editability.allowed) {
    redirect(projectDocumentsUrl(projectId, { error: getStaleProjectEditMessage(editability.reason) }));
  }

  const documentType = z.string().trim().min(2).parse(formData.get("documentType"));
  const revisionNote = z.string().trim().optional().parse(formData.get("revisionNote") || undefined);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A document file is required.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256Hash = createDocumentHash(bytes);
  const { data: document, error: documentError } = await supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("document_type", documentType)
    .maybeSingle();

  if (documentError) {
    throw new Error(documentError.message);
  }

  let documentId = document?.id as string | undefined;

  if (!documentId) {
    documentId = randomUUID();
    const { error } = await supabase
      .from("project_documents")
      .insert({ id: documentId, project_id: projectId, document_type: documentType });

    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: latestVersion, error: latestError } = await supabase
    .from("project_document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  const versionNumber = (latestVersion?.version_number ?? 0) + 1;
  const storagePath = `${projectId}/${documentId}/v${versionNumber}-${randomUUID()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  await supabase.from("project_document_versions").update({ active: false }).eq("document_id", documentId).eq("active", true);

  const { error } = await supabase.from("project_document_versions").insert({
    document_id: documentId,
    version_number: versionNumber,
    storage_bucket: "project-documents",
    storage_path: storagePath,
    original_file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    file_size: file.size,
    sha256_hash: sha256Hash,
    active: true,
    revision_note: revisionNote,
    uploaded_by: user.id
  });

  if (error) {
    await supabase.storage.from("project-documents").remove([storagePath]);
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "document.version_uploaded", "project", projectId, {
    documentId,
    versionNumber,
    sha256Hash
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents`);
}

export async function uploadCompletedDocumentAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);

  if (!["staff", "admin"].includes(profile.role)) {
    redirect(projectUrl(projectId, { error: "Only Staff or Admin can upload a completed document." }));
  }

  await assertStaffCanManageProject(supabase, projectId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, status, student_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  if (!project) {
    redirect(projectUrl(projectId, { error: "Project not found." }));
  }

  if (project.status !== "completed") {
    redirect(projectUrl(projectId, { error: "Completed documents can be uploaded only after approval is completed." }));
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect(projectUrl(projectId, { error: "Choose a completed document to upload." }));
  }

  if (file.size > maxAttachmentBytes) {
    redirect(projectUrl(projectId, { error: "Completed document must be 50 MB or smaller." }));
  }

  const mimeType = file.type || "application/octet-stream";

  if (!allowedAttachmentMimeTypes.includes(mimeType as (typeof allowedAttachmentMimeTypes)[number])) {
    redirect(projectUrl(projectId, { error: "Completed document file type is not allowed." }));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256Hash = createDocumentHash(bytes);
  const { data: existingDocument, error: existingDocumentError } = await supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("document_type", completedDocumentType)
    .maybeSingle();

  if (existingDocumentError) {
    throw new Error(existingDocumentError.message);
  }

  let documentId = existingDocument?.id as string | undefined;

  if (!documentId) {
    documentId = randomUUID();
    const { error } = await supabase
      .from("project_documents")
      .insert({ id: documentId, project_id: projectId, document_type: completedDocumentType });

    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: latestVersion, error: latestVersionError } = await supabase
    .from("project_document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    throw new Error(latestVersionError.message);
  }

  const versionNumber = (latestVersion?.version_number ?? 0) + 1;
  const storagePath = `${projectId}/${documentId}/completed-v${versionNumber}-${randomUUID()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: versionRow, error: versionError } = await supabase
    .from("project_document_versions")
    .insert({
      document_id: documentId,
      version_number: versionNumber,
      storage_bucket: "project-documents",
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: mimeType,
      file_size: file.size,
      sha256_hash: sha256Hash,
      active: true,
      uploaded_by: user.id
    })
    .select("id")
    .single();

  if (versionError) {
    await supabase.storage.from("project-documents").remove([storagePath]);
    throw new Error(versionError.message);
  }

  await supabase
    .from("project_document_versions")
    .update({ active: false })
    .eq("document_id", documentId)
    .eq("active", true)
    .neq("id", versionRow.id);

  await supabase.from("notification_logs").insert({
    recipient_id: project.student_id,
    project_id: projectId,
    channel: "in_app",
    type: "completed_document_available",
    subject: versionNumber === 1 ? "Completed document available" : "Updated completed document available",
    body: versionNumber === 1
      ? `Your completed document for ${project.title ?? "this project"} is now available.`
      : `An updated completed document for ${project.title ?? "this project"} is now available.`,
    status: "sent",
    sent_at: new Date().toISOString(),
    dedupe_key: `${projectId}:completed_document:v${versionNumber}:in_app`,
    metadata: {
      projectId,
      documentId,
      documentVersionId: versionRow.id,
      versionNumber
    },
    created_by: user.id
  });

  await audit(supabase, user.id, "document.completed_version_uploaded", "project", projectId, {
    documentId,
    documentVersionId: versionRow.id,
    versionNumber,
    sha256Hash
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath("/notifications");
  redirect(projectUrl(projectId, { message: "Completed document uploaded." }));
}

export async function submitProjectAction(projectId: string) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, requester } = await requireAuthenticatedStudentRequester(
    supabase,
    projectDocumentsUrl(projectId, { error: requesterIdentityErrorMessage })
  );
  await assertProjectAccess(supabase, projectId);

  const documentVersion = await getLatestActiveDocumentVersion(supabase, projectId);

  if (!documentVersion) {
    redirect(projectDocumentsUrl(projectId, { error: "Upload at least one active document version before submitting." }));
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, student_id, requester_id, status, submitted_at")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Project submission project lookup failed", { projectId, message: projectError.message, code: projectError.code });
    redirect(projectDocumentsUrl(projectId, { error: "Project could not be submitted. Check the documents and try again." }));
  }

  const requesterOwnerId = (project?.requester_id as string | null) ?? (project?.student_id as string | null);

  if (!project || requesterOwnerId !== user.id) {
    redirect(projectDocumentsUrl(projectId, { error: "You can only submit your own project." }));
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("projects")
    .update({
      status: "submitted",
      submitted_at: project.submitted_at ?? now,
      updated_at: now,
      requester_id: user.id,
      student_directory_id: requester.directoryId,
      student_email_verification_id: null,
      requester_student_id: requester.studentId,
      requester_email: requester.email,
      requester_first_name: requester.firstName,
      requester_last_name: requester.lastName,
      requester_name: requester.displayName,
      requester_type: requester.requesterType,
      requester_organization: requester.organization,
      requester_verified_at: now,
      requester_auth_user_id: user.id
    })
    .eq("id", projectId)
    .in("status", ["draft", "revision_required"]);

  if (error) {
    if (isRequesterIdentityDatabaseError(error.message)) {
      redirect(projectDocumentsUrl(projectId, { error: requesterIdentityErrorMessage }));
    }

    console.error("Project submission failed", { projectId, message: error.message, code: error.code });
    redirect(projectDocumentsUrl(projectId, { error: "Project could not be submitted. Check the documents and try again." }));
  }

  if (project.status === "revision_required") {
    await supabase
      .from("revision_requests")
      .update({ resolved_at: now, updated_at: now })
      .eq("project_id", projectId)
      .is("resolved_at", null);
  }

  const workflowResult = await ensureDefaultProjectWorkflow({ supabase, projectId, createdBy: user.id });

  if (!workflowResult.ok) {
    console.error("Default workflow creation failed", {
      projectId,
      message: workflowResult.message
    });
  }

  await audit(supabase, user.id, "project.submitted", "project", projectId, {
    documentVersionId: documentVersion.id
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

export async function cancelProjectAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  await getCurrentProfile(supabase);
  const reasonResult = validateCancellationReason(formData.get("reason"));

  if (!reasonResult.ok) {
    redirect(projectUrl(projectId, { error: reasonResult.message }));
  }

  const { error } = await supabase.rpc("cancel_project", {
    p_project_id: projectId,
    p_reason: reasonResult.reason
  });

  if (error) {
    const expectedMessages = new Set([
      "Authentication is required to cancel this project.",
      "Provide a cancellation reason.",
      "You are not authorized to cancel this project.",
      "Project not found.",
      "This project has already been cancelled.",
      "This completed project cannot be cancelled.",
      "This rejected project cannot be cancelled.",
      "The project changed while the cancellation was being processed."
    ]);

    console.error("Project cancellation failed", {
      projectId,
      code: error.code,
      message: error.message
    });

    if (error.message === "This project has already been cancelled.") {
      redirect(projectUrl(projectId, { message: error.message }));
    }

    redirect(projectUrl(projectId, {
      error: expectedMessages.has(error.message)
        ? error.message
        : "Project could not be cancelled. Reload the project and try again."
    }));
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/history`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(projectUrl(projectId, { message: "Project cancelled." }));
}

function studentWorkflowUrl(projectId: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/projects/${projectId}/workflow?${search.toString()}`;
}

function parseStudentWorkflowPayload(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as StudentWorkflowStepInput[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface StudentWorkflowSaveResult {
  changeType?: string;
  signerOnly?: boolean;
  beforeState?: unknown;
  afterState?: unknown;
  notifyAssignmentIds?: string[];
}

function safeStudentWorkflowSaveError(error: { code?: string; message?: string }) {
  const expectedMessages = [
    "Authentication is required to save this workflow.",
    "You can edit only your own project workflow.",
    "This workflow can no longer be edited.",
    "The workflow can no longer be edited because approval has already started.",
    "The workflow must contain at least one approval step.",
    "Each workflow step must choose Staff, Faculty Approver, or Admin.",
    "Each workflow step needs a valid assignment mode.",
    "A workflow step includes an invalid approver.",
    "The workflow has an invalid minimum approval count.",
    "The workflow could not be saved because a step has duplicate approvers.",
    "Each workflow step needs at least one active approver."
  ];

  if (error.message && expectedMessages.includes(error.message)) {
    return error.message;
  }

  if (error.code === "23505") {
    return "The workflow could not be saved. Reload the latest workflow and try again.";
  }

  if (error.message === "The workflow could not be saved. Reload the latest workflow and try again.") {
    return error.message;
  }

  return "The workflow could not be saved. Reload the latest workflow and try again.";
}

export async function saveStudentWorkflowAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);

  const admin = createSupabaseAdminClient();

  if (!admin) {
    redirect(studentWorkflowUrl(projectId, { error: "Workflow editing is not configured." }));
  }

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, status, student_id, requester_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  const workflowOwnerId = (project?.requester_id as string | null) ?? (project?.student_id as string | null);

  if (!project || workflowOwnerId !== user.id) {
    redirect(studentWorkflowUrl(projectId, { error: "You can edit only your own project workflow." }));
  }

  const workflowEditability = await getStudentWorkflowEditabilityForUser(admin, {
    projectId,
    userId: user.id,
    role: profile.role,
    isActive: profile.is_active !== false,
    studentId: workflowOwnerId,
    status: project.status as ProjectStatus
  });

  if (!workflowEditability.allowed) {
    redirect(studentWorkflowUrl(projectId, {
      error: workflowEditability.reason === "approval_started"
        ? "The workflow can no longer be edited because approval has started."
        : workflowEditability.message
    }));
  }

  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name, position, role, is_active")
    .in("role", ["staff", "approver", "admin"]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profiles = (profileRows ?? []).map((row) => ({
    id: row.id as string,
    displayName: String(row.display_name ?? "Approver"),
    position: row.position as string | null,
    role: row.role as UserRole,
    isActive: row.is_active !== false
  })) satisfies WorkflowProfileOption[];
  const intent = String(formData.get("intent") ?? "");
  const workflowJson = intent === "restore_default"
    ? defaultStudentWorkflow()
    : parseStudentWorkflowPayload(formData.get("workflowJson"));
  const validation = validateStudentWorkflow({
    requesterId: user.id,
    steps: workflowJson,
    profiles
  });

  if (!validation.ok) {
    redirect(studentWorkflowUrl(projectId, { error: validation.message }));
  }

  const rpcSteps = buildStudentWorkflowRpcSteps(workflowJson, validation.steps);
  console.info("Student workflow payload before RPC", {
    projectId,
    intent: intent || "save",
    submittedStepCount: workflowJson.length,
    rpcStepCount: rpcSteps.length,
    submittedStepsWithIds: workflowJson.filter((step) => Boolean(step.id)).length,
    rpcStepsWithIds: rpcSteps.filter((step) => Boolean(step.id)).length,
    rpcStepIdPresence: rpcSteps.map((step) => Boolean(step.id))
  });
  const { data: saveData, error: saveError } = await supabase.rpc("save_student_project_workflow", {
    p_project_id: projectId,
    p_steps: rpcSteps,
    p_intent: intent || "save"
  });

  if (saveError) {
    console.error("Student workflow save failed", {
      projectId,
      code: saveError.code,
      message: saveError.message
    });
    redirect(studentWorkflowUrl(projectId, { error: safeStudentWorkflowSaveError(saveError) }));
  }

  const saveResult = (saveData ?? {}) as StudentWorkflowSaveResult;
  const notifyAssignmentIds = Array.isArray(saveResult.notifyAssignmentIds)
    ? saveResult.notifyAssignmentIds.filter((assignmentId) => uuidSchema.safeParse(assignmentId).success)
    : [];

  await notifyAssignmentsById(admin as Awaited<ReturnType<typeof requireSupabase>>, projectId, notifyAssignmentIds);

  await audit(
    supabase,
    user.id,
    saveResult.changeType ?? "workflow.updated_by_student",
    "project",
    projectId,
    {
      projectId,
      signerOnly: saveResult.signerOnly === true,
      beforeState: saveResult.beforeState ?? [],
      afterState: saveResult.afterState ?? []
    }
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath("/dashboard");
  redirect(studentWorkflowUrl(projectId, { message: "Approval workflow saved." }));
}

export async function addSharedCommentAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const body = z.string().trim().min(1).parse(formData.get("body"));
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

  const { error } = await supabase.from("project_comments").insert({
    project_id: projectId,
    author_id: user.id,
    visibility: "shared",
    body
  });

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "comment.shared_added", "project", projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function staffReviewAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["staff", "admin"]);
  await assertStaffCanManageProject(supabase, projectId);

  const intent = z.enum(["start_review", "comment", "revision", "reject", "complete", "finalize"]).parse(formData.get("intent"));
  const sharedComment = z.string().trim().optional().parse(formData.get("sharedComment") || undefined);
  const internalComment = z.string().trim().optional().parse(formData.get("internalComment") || undefined);
  const revisionReason = z.string().trim().optional().parse(formData.get("revisionReason") || undefined);
  const now = new Date().toISOString();

  if (sharedComment) {
    await supabase.from("project_comments").insert({
      project_id: projectId,
      author_id: user.id,
      visibility: "shared",
      body: sharedComment
    });
  }

  if (internalComment) {
    await supabase.from("project_comments").insert({
      project_id: projectId,
      author_id: user.id,
      visibility: "internal",
      body: internalComment
    });
  }

  if (["complete", "revision", "reject"].includes(intent) && profile.role === "staff") {
    const { data: assignmentRow, error: assignmentError } = await supabase
      .from("workflow_assignments")
      .select("id, step:workflow_steps!inner(id, project_id, name, status, assignee_role)")
      .eq("approver_id", user.id)
      .in("status", ["waiting", "opened"])
      .eq("step.project_id", projectId)
      .eq("step.assignee_role", "staff")
      .eq("step.status", "in_progress")
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error("Staff review assignment lookup failed", {
        projectId,
        message: assignmentError.message,
        code: assignmentError.code
      });
      redirect(staffReviewUrl(projectId, { error: "Staff review assignment could not be loaded." }));
    }

    if (!assignmentRow) {
      redirect(staffReviewUrl(projectId, { error: "No active Staff approval assignment is available for your account." }));
    }

    const decision =
      intent === "complete" ? "approved" : intent === "reject" ? "rejected" : "revision_requested";
    const decisionComment = intent === "complete" ? undefined : revisionReason ?? sharedComment;
    const decisionResult = await recordApprovalDecision({
      assignmentId: assignmentRow.id as string,
      comment: decisionComment,
      confirmed: false,
      decision,
      profile,
      supabase,
      user
    });

    await audit(supabase, user.id, `staff_review.${intent}`, "project", projectId);
    revalidatePath(`/projects/${decisionResult.projectId}`);
    revalidatePath(`/staff/review/${projectId}`);
    revalidatePath("/staff/review");
    redirect(staffReviewUrl(projectId, { message: intent === "complete" ? "Staff approval recorded." : "Staff decision recorded." }));
  }

  if (intent === "complete") {
    redirect(staffReviewUrl(projectId, { error: "Only assigned Staff reviewers can approve the active step." }));
  }

  const updates: Record<string, unknown> = { updated_at: now };

  if (intent === "start_review") {
    updates.status = "approval_pending";
    updates.assigned_staff_id = user.id;
  }

  if (intent === "revision") {
    updates.status = "revision_required";
  }

  if (intent === "reject") {
    updates.status = "rejected";
    updates.rejected_at = now;
  }

  if (intent === "finalize") {
    updates.status = "completed";
    updates.completed_at = now;
  }

  if (intent !== "comment") {
    const { error } = await supabase.from("projects").update(updates).eq("id", projectId);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (intent === "finalize") {
    await ensureCertificate(supabase, projectId);
  }

  await audit(supabase, user.id, `staff_review.${intent}`, "project", projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/staff/review/${projectId}`);
  revalidatePath("/staff/review");
}

export async function addWorkflowStepAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const payloadResult = workflowStepSchema.safeParse(Object.fromEntries(formData));

  if (!payloadResult.success) {
    redirect(workflowUrl(projectId, { error: payloadResult.error.issues[0]?.message ?? "Check the workflow step details." }));
  }

  const payload = payloadResult.data;
  let approverIds = [...new Set(formData.getAll("approverIds").map(String).filter(Boolean))];
  const assignmentMode = approverIds.length > 0 ? "specific_users" : "any_active_role";
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertStaffCanManageProject(supabase, projectId);

  if (payload.completionRule === "minimum" && !payload.minimumApprovals) {
    redirect(workflowUrl(projectId, { error: "Minimum approval rule requires a threshold." }));
  }

  const { count: actionCount, error: actionCountError } = await supabase
    .from("approval_actions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (actionCountError) {
    throw new Error(actionCountError.message);
  }

  if ((actionCount ?? 0) > 0 && (!payload.reason || payload.reason.length < 5)) {
    redirect(workflowUrl(projectId, { error: "Adding workflow steps after approvals exist requires a reason." }));
  }

  const { data: approverRows, error: approverError } = approverIds.length > 0
    ? await supabase.from("profiles").select("id, role, is_active").in("id", approverIds)
    : await supabase.from("profiles").select("id, role, is_active").eq("role", payload.role).neq("role", "student");

  if (approverError) {
    throw new Error(approverError.message);
  }

  const validApprovers = (approverRows ?? []).filter((approver) =>
    approver.role === payload.role &&
    approver.role !== "student" &&
    approver.is_active !== false
  );

  if (approverIds.length > 0 && validApprovers.length !== approverIds.length) {
    redirect(workflowUrl(projectId, { error: "Selected approvers must be active users matching the step role." }));
  }

  if (approverIds.length === 0) {
    approverIds = validApprovers.map((approver) => approver.id as string);
  }

  if (approverIds.length === 0) {
    redirect(workflowUrl(projectId, { error: "Each workflow step needs at least one active approver." }));
  }

  const { data: latestStep, error: latestStepError } = await supabase
    .from("workflow_steps")
    .select("step_order")
    .eq("project_id", projectId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestStepError) {
    throw new Error(latestStepError.message);
  }

  const stepOrder = (latestStep?.step_order ?? 0) + 1;
  const stepId = randomUUID();
  const { error } = await supabase
    .from("workflow_steps")
    .insert({
      id: stepId,
      project_id: projectId,
      name: payload.name,
      step_order: stepOrder,
      assignee_role: payload.role,
      assignment_mode: assignmentMode,
      mode: payload.mode,
      status: "not_started",
      completion_rule: payload.completionRule,
      minimum_approvals: payload.completionRule === "minimum" ? payload.minimumApprovals : null,
      certification_required: payload.requiresSignature === true,
      due_at: payload.dueAt || null,
      created_by: user.id
    });

  if (error) {
    throw new Error(error.message);
  }

  if (approverIds.length > 0) {
    const assignments = approverIds.map((approverId) => ({
      id: randomUUID(),
      workflow_step_id: stepId,
      approver_id: approverId,
      due_at: payload.dueAt || null
    }));
    const { error: assignmentError } = await supabase.from("workflow_assignments").insert(assignments);

    if (assignmentError) {
      throw new Error(assignmentError.message);
    }
  }

  if ((actionCount ?? 0) > 0) {
    await supabase.from("workflow_change_log").insert({
      project_id: projectId,
      workflow_step_id: stepId,
      changed_by: user.id,
      change_type: "step_added_after_action",
      reason: payload.reason,
      after_state: payload
    });
  }

  await audit(supabase, user.id, "workflow.step_added", "project", projectId, { stepId });
  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath(`/projects/${projectId}`);
  redirect(workflowUrl(projectId, { message: "Step added." }));
}

export async function addApproverToStepAction(projectId: string, stepId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  uuidSchema.parse(stepId);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertStaffCanManageProject(supabase, projectId);

  const approverId = uuidSchema.parse(formData.get("approverId"));
  const reason = z.string().trim().optional().parse(formData.get("reason") || undefined);
  const dueAt = z.string().optional().parse(formData.get("dueAt") || undefined);

  const { data: step, error: stepError } = await supabase
    .from("workflow_steps")
    .select("status")
    .eq("id", stepId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (stepError) {
    throw new Error(stepError.message);
  }

  if (!step) {
    throw new Error("Workflow step not found.");
  }

  const { count: actionCount, error: actionCountError } = await supabase
    .from("approval_actions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (actionCountError) {
    throw new Error(actionCountError.message);
  }

  const requiresReason = (actionCount ?? 0) > 0 || !["not_started", "waiting"].includes(step.status);

  if (requiresReason && (!reason || reason.length < 5)) {
    throw new Error("Adding an approver after activation requires a reason.");
  }

  const assignmentId = randomUUID();
  const { error } = await supabase
    .from("workflow_assignments")
    .insert({
      id: assignmentId,
      workflow_step_id: stepId,
      approver_id: approverId,
      due_at: dueAt || null
    });

  if (error) {
    throw new Error(error.message);
  }

  if (requiresReason) {
    await supabase.from("workflow_change_log").insert({
      project_id: projectId,
      workflow_step_id: stepId,
      changed_by: user.id,
      change_type: "approver_added_after_activation",
      reason,
      after_state: { approverId, assignmentId }
    });
  }

  if (step.status === "in_progress") {
    await notifyActiveStep(supabase, projectId, stepId);
  }

  await audit(supabase, user.id, "workflow.approver_added", "project", projectId, {
    stepId,
    approverId
  });
  revalidatePath(`/projects/${projectId}/workflow`);
}

export async function activateWorkflowAction(projectId: string) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertStaffCanManageProject(supabase, projectId);

  const { data: steps, error } = await supabase
    .from("workflow_steps")
    .select("id, step_order, workflow_assignments(id)")
    .eq("project_id", projectId)
    .order("step_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!steps || steps.length === 0) {
    throw new Error("Add at least one workflow step before activation.");
  }

  const typedSteps = steps as ActivatableStepRow[];
  const emptyStep = typedSteps.find((step) => (step.workflow_assignments ?? []).length === 0);

  if (emptyStep) {
    throw new Error("Every workflow step needs at least one approver before activation.");
  }

  const firstStepId = typedSteps[0].id;

  const activatedAt = new Date().toISOString();
  await supabase.from("workflow_steps").update({ status: "waiting" }).eq("project_id", projectId);
  await supabase
    .from("workflow_steps")
    .update({ status: "in_progress", activated_at: activatedAt, started_at: activatedAt })
    .eq("id", firstStepId);
  const { error: projectError } = await supabase
    .from("projects")
    .update({ status: "approval_pending", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (projectError) {
    throw new Error(projectError.message);
  }

  await supabase.from("workflow_change_log").insert({
    project_id: projectId,
    workflow_step_id: firstStepId,
    changed_by: user.id,
    change_type: "workflow_activated",
    reason: "Workflow activated by staff",
    after_state: { firstStepId }
  });
  await notifyActiveStep(supabase, projectId, firstStepId);
  await audit(supabase, user.id, "workflow.activated", "project", projectId, { firstStepId });
  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath(`/projects/${projectId}`);
}

export async function markAssignmentOpenedAction(assignmentId: string) {
  uuidSchema.parse(assignmentId);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  const now = new Date().toISOString();
  const { data: assignment, error: readError } = await supabase
    .from("workflow_assignments")
    .select("first_opened_at")
    .eq("id", assignmentId)
    .eq("approver_id", user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const { error } = await supabase
    .from("workflow_assignments")
    .update({
      status: "opened",
      first_opened_at: assignment?.first_opened_at ?? now,
      last_opened_at: now
    })
    .eq("id", assignmentId)
    .eq("approver_id", user.id)
    .in("status", ["waiting", "opened"])
    .is("completed_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

async function createSignedDocumentVersionForApproval(input: {
  assignmentId: string;
  comment?: string;
  formData: FormData;
  profile: {
    display_name: string;
    position: string | null;
    role: UserRole;
  };
  supabase: Awaited<ReturnType<typeof requireSupabase>>;
  user: Awaited<ReturnType<typeof requireCurrentUser>>;
}) {
  const parsed = parseVisualApprovalForm(input.formData);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const { data: assignmentRow, error: assignmentError } = await input.supabase
    .from("workflow_assignments")
    .select("id, status, approver_id, workflow_step_id, step:workflow_steps!workflow_assignments_workflow_step_id_fkey(id, project_id, name, status, certification_required, project:projects!workflow_steps_project_id_fkey(code, title, status))")
    .eq("id", input.assignmentId)
    .maybeSingle();
  const assignment = assignmentRow as ApprovalAssignmentRow | null;

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!assignment?.step) {
    throw new Error("Approval assignment not found.");
  }

  if (assignment.approver_id !== input.user.id) {
    throw new Error("Only the assigned approver can sign this assignment.");
  }

  if (!["waiting", "opened"].includes(assignment.status) || assignment.step.status !== "in_progress") {
    throw new Error("This assignment is not active for signing.");
  }

  if (assignment.step.project?.status === "cancelled") {
    throw new Error("This project has been cancelled and can no longer be approved.");
  }

  const projectId = assignment.step.project_id;
  const sourceVersion = await getLatestActiveDocumentVersion(input.supabase, projectId);

  if (!sourceVersion) {
    throw new Error("No active document version is available for signing.");
  }

  if (sourceVersion.id !== parsed.sourceDocumentVersionId) {
    throw new Error("The document changed while this approval was open. Refresh and review the latest version.");
  }

  if (sourceVersion.mime_type !== "application/pdf") {
    throw new Error("Visual signature placement requires a PDF document.");
  }

  const existing = await input.supabase
    .from("approval_actions")
    .select("id")
    .eq("assignment_id", input.assignmentId)
    .maybeSingle();

  if (existing.data) {
    throw new Error("A decision has already been recorded for this assignment.");
  }

  const signatureAssetId = randomUUID();
  const extension = parsed.signature.mimeType === "image/png" ? "png" : "jpg";
  const signaturePath = signatureStoragePath(input.user.id, extension, signatureAssetId);
  const { error: signatureUploadError } = await input.supabase.storage
    .from("user-signatures")
    .upload(signaturePath, parsed.signature.bytes, {
      contentType: parsed.signature.mimeType,
      upsert: false
    });

  if (signatureUploadError) {
    throw new Error(signatureUploadError.message);
  }

  const { error: signatureAssetError } = await input.supabase.from("user_signature_assets").insert({
    id: signatureAssetId,
    user_id: input.user.id,
    method: parsed.method,
    storage_bucket: "user-signatures",
    storage_path: signaturePath,
    mime_type: parsed.signature.mimeType,
    file_size: parsed.signature.bytes.length,
    is_default: parsed.saveSignature,
    created_by: input.user.id
  });

  if (signatureAssetError) {
    await input.supabase.storage.from("user-signatures").remove([signaturePath]);
    throw new Error(signatureAssetError.message);
  }

  if (parsed.saveSignature) {
    await input.supabase
      .from("user_signature_assets")
      .update({ is_default: false })
      .eq("user_id", input.user.id)
      .neq("id", signatureAssetId);
  }

  const { data: sourceDownload, error: sourceDownloadError } = await input.supabase.storage
    .from(sourceVersion.storage_bucket)
    .download(sourceVersion.storage_path);

  if (sourceDownloadError || !sourceDownload) {
    throw new Error(sourceDownloadError?.message ?? "Could not load the active PDF document.");
  }

  const sourceBytes = Buffer.from(await sourceDownload.arrayBuffer());
  const pageCount = await getPdfPageCount(sourceBytes);
  const { data: existingStamps, error: existingStampsError } = await input.supabase
    .from("approval_signature_stamps")
    .select("page_number, x_ratio, y_ratio, width_ratio, height_ratio")
    .eq("signed_document_version_id", sourceVersion.id);

  if (existingStampsError) {
    throw new Error(existingStampsError.message);
  }

  const resolvedPlacement = resolveAutomaticSignaturePlacement({
    pageCount,
    signerRole: input.profile.position ?? input.profile.role,
    existingSignatureStamps: (existingStamps ?? []).map((stamp) => ({
      pageNumber: Number(stamp.page_number),
      xRatio: Number(stamp.x_ratio),
      yRatio: Number(stamp.y_ratio),
      widthRatio: Number(stamp.width_ratio),
      heightRatio: Number(stamp.height_ratio)
    })),
    preset: parsed.placementPreset,
    advancedPlacement: parsed.placement
  });
  const signedAt = new Date();
  const stamped = await stampPdfWithSignature({
    sourcePdf: sourceBytes,
    signatureImage: parsed.signature.bytes,
    signatureMimeType: parsed.signature.mimeType,
    placement: resolvedPlacement.placement,
    appendSignaturePage: resolvedPlacement.appendSignaturePage,
    projectCode: assignment.step.project?.code ?? undefined,
    projectTitle: assignment.step.project?.title ?? undefined,
    printedName: input.profile.display_name,
    roleAtSigning: input.profile.position ?? input.profile.role,
    stepName: assignment.step.name,
    signedAt
  });

  const { data: versions, error: versionsError } = await input.supabase
    .from("project_document_versions")
    .select("version_number")
    .eq("document_id", sourceVersion.document_id)
    .order("version_number", { ascending: false })
    .limit(1);

  if (versionsError) {
    throw new Error(versionsError.message);
  }

  const nextVersionNumber = ((versions?.[0]?.version_number as number | undefined) ?? sourceVersion.version_number) + 1;
  const signedStoragePath = `${projectId}/${sourceVersion.document_id}/v${nextVersionNumber}-${randomUUID()}-signed.pdf`;
  const { error: signedUploadError } = await input.supabase.storage
    .from(sourceVersion.storage_bucket)
    .upload(signedStoragePath, stamped.bytes, {
      contentType: "application/pdf",
      upsert: false
    });

  if (signedUploadError) {
    throw new Error(signedUploadError.message);
  }

  let signedVersionId: string | null = null;
  let approvalRecorded = false;

  try {
    const { data: signedVersion, error: signedVersionError } = await input.supabase
      .from("project_document_versions")
      .insert({
        document_id: sourceVersion.document_id,
        version_number: nextVersionNumber,
        original_file_name: sourceVersion.original_file_name.replace(/\.pdf$/i, "") + `-signed-v${nextVersionNumber}.pdf`,
        storage_bucket: sourceVersion.storage_bucket,
        storage_path: signedStoragePath,
        file_size: stamped.bytes.length,
        mime_type: "application/pdf",
        uploaded_by: input.user.id,
        active: false,
        sha256_hash: stamped.sha256Hash,
        revision_note: `Signed during ${assignment.step.name}`
      })
      .select("id")
      .single();

    if (signedVersionError) {
      await input.supabase.storage.from(sourceVersion.storage_bucket).remove([signedStoragePath]);
      throw new Error(signedVersionError.message);
    }

    signedVersionId = signedVersion.id as string;

    const { error: deactivateError } = await input.supabase
      .from("project_document_versions")
      .update({ active: false })
      .eq("id", sourceVersion.id);

    if (deactivateError) {
      throw new Error(deactivateError.message);
    }

    const { error: activateError } = await input.supabase
      .from("project_document_versions")
      .update({ active: true })
      .eq("id", signedVersionId);

    if (activateError) {
      await input.supabase.from("project_document_versions").update({ active: true }).eq("id", sourceVersion.id);
      throw new Error(activateError.message);
    }

    const result = await recordApprovalDecision({
      assignmentId: input.assignmentId,
      comment: input.comment,
      confirmed: true,
      decision: "approved",
      documentVersionOverride: {
        id: signedVersionId,
        sha256_hash: stamped.sha256Hash
      },
      profile: input.profile,
      supabase: input.supabase,
      user: input.user
    });
    approvalRecorded = true;

    const { error: stampError } = await input.supabase.from("approval_signature_stamps").insert({
      assignment_id: input.assignmentId,
      approval_action_id: result.approvalActionId,
      signer_id: input.user.id,
      source_document_version_id: sourceVersion.id,
      signed_document_version_id: signedVersionId,
      signature_asset_id: signatureAssetId,
      page_number: resolvedPlacement.placement.pageNumber,
      x_ratio: resolvedPlacement.placement.xRatio,
      y_ratio: resolvedPlacement.placement.yRatio,
      width_ratio: resolvedPlacement.placement.widthRatio,
      height_ratio: resolvedPlacement.placement.heightRatio,
      printed_name: input.profile.display_name,
      role_at_signing: input.profile.position ?? input.profile.role,
      signed_at: signedAt.toISOString(),
      created_by: input.user.id
    });

    if (stampError) {
      throw new Error(stampError.message);
    }

    await audit(input.supabase, input.user.id, "signature.created", "approval_assignment", input.assignmentId, {
      assignmentId: input.assignmentId,
      workflowStepId: result.workflowStepId,
      pageNumber: resolvedPlacement.placement.pageNumber,
      sourceDocumentVersionId: sourceVersion.id,
      signedDocumentVersionId: signedVersionId
    });
    if (parsed.saveSignature) {
      await audit(input.supabase, input.user.id, "signature.asset_saved", "approval_assignment", input.assignmentId, {
        assignmentId: input.assignmentId
      });
    }
    await audit(input.supabase, input.user.id, "signature.placement_confirmed", "approval_assignment", input.assignmentId, {
      assignmentId: input.assignmentId,
      workflowStepId: result.workflowStepId,
      pageNumber: resolvedPlacement.placement.pageNumber,
      sourceDocumentVersionId: sourceVersion.id
    });
    await audit(input.supabase, input.user.id, "document.signed_version_created", "project", projectId, {
      assignmentId: input.assignmentId,
      workflowStepId: result.workflowStepId,
      sourceDocumentVersionId: sourceVersion.id,
      signedDocumentVersionId: signedVersionId,
      sourceHash: sourceVersion.sha256_hash,
      signedHash: stamped.sha256Hash
    });
    await audit(input.supabase, input.user.id, "approval.signed_and_approved", "approval_assignment", input.assignmentId, {
      projectId,
      stepName: result.stepName,
      assignmentId: input.assignmentId,
      workflowStepId: result.workflowStepId,
      sourceDocumentVersionId: sourceVersion.id,
      signedDocumentVersionId: signedVersionId,
      sourceHash: sourceVersion.sha256_hash,
      signedHash: stamped.sha256Hash
    });

    return result.projectId;
  } catch (error) {
    if (!approvalRecorded && signedVersionId) {
      await input.supabase.from("project_document_versions").update({ active: false }).eq("id", signedVersionId);
      await input.supabase.from("project_document_versions").update({ active: true }).eq("id", sourceVersion.id);
      await input.supabase.storage.from(sourceVersion.storage_bucket).remove([signedStoragePath]);
    }
    if (!approvalRecorded && !signedVersionId) {
      await input.supabase.storage.from(sourceVersion.storage_bucket).remove([signedStoragePath]);
    }
    throw error;
  }
}

async function recordApprovalDecision(input: {
  assignmentId: string;
  comment?: string;
  confirmed: boolean;
  decision: ApprovalDecision;
  documentVersionOverride?: {
    id: string;
    sha256_hash: string;
  };
  profile: {
    display_name: string;
    position: string | null;
    role: UserRole;
  };
  supabase: Awaited<ReturnType<typeof requireSupabase>>;
  user: Awaited<ReturnType<typeof requireCurrentUser>>;
}) {
  const { data: assignmentRow, error: assignmentError } = await input.supabase
    .from("workflow_assignments")
    .select("id, status, approver_id, workflow_step_id, step:workflow_steps!workflow_assignments_workflow_step_id_fkey(id, project_id, name, status, certification_required, revision_allowed)")
    .eq("id", input.assignmentId)
    .maybeSingle();
  const assignment = assignmentRow as ApprovalAssignmentRow | null;

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!assignment) {
    throw new Error("Approval assignment not found.");
  }

  if (assignment.approver_id !== input.user.id) {
    throw new Error("Only the assigned approver can submit this decision.");
  }

  if (!["waiting", "opened"].includes(assignment.status)) {
    throw new Error("This assignment already has a submitted decision.");
  }

  if (!assignment.step || assignment.step.status !== "in_progress") {
    throw new Error("This workflow step is not active yet.");
  }

  if (input.decision === "revision_requested" && !assignment.step.revision_allowed) {
    throw new Error("Revision requests are not allowed for this workflow step.");
  }

  if (input.decision === "approved" && assignment.step.certification_required && !input.confirmed) {
    throw new Error("Confirm the electronic certification statement before approving.");
  }

  const projectId = assignment.step.project_id as string;
  const { data: decisionProject, error: decisionProjectError } = await input.supabase
    .from("projects")
    .select("status, student_id, requester_id")
    .eq("id", projectId)
    .maybeSingle();

  if (decisionProjectError) {
    throw new Error(decisionProjectError.message);
  }

  if (decisionProject?.status === "cancelled") {
    throw new Error("This project has been cancelled and can no longer be approved.");
  }

  const decisionProjectOwnerId = (decisionProject?.requester_id as string | null) ?? (decisionProject?.student_id as string | null);

  if (decisionProjectOwnerId === input.user.id) {
    throw new Error("Requesters cannot approve their own project.");
  }

  const documentVersion = input.documentVersionOverride ?? await getLatestActiveDocumentVersion(input.supabase, projectId);

  if (!documentVersion) {
    throw new Error("No active document version is available for review.");
  }

  const existing = await input.supabase
    .from("approval_actions")
    .select("id")
    .eq("assignment_id", input.assignmentId)
    .maybeSingle();

  if (existing.data) {
    throw new Error("A decision has already been recorded for this assignment.");
  }

  const headerStore = await headers();
  const now = new Date().toISOString();
  const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip");
  const userAgent = headerStore.get("user-agent");

  const { data: approvalAction, error } = await input.supabase.from("approval_actions").insert({
    assignment_id: input.assignmentId,
    project_id: projectId,
    workflow_step_id: assignment.workflow_step_id,
    approver_id: input.user.id,
    decision: input.decision,
    document_version_id: documentVersion.id,
    document_sha256_hash: documentVersion.sha256_hash,
    certification_statement_version: "v1",
    certification_statement: certificationStatement,
    certified_at: input.decision === "approved" ? now : null,
    approver_display_name: input.profile.display_name,
    approver_role_at_approval: input.profile.position ?? input.profile.role,
    ip_address: ipAddress,
    user_agent: userAgent,
    auth_provider: String(input.user.app_metadata.provider ?? "supabase"),
    comment: input.comment
  }).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  const assignmentStatus =
    input.decision === "approved" ? "approved" : input.decision === "rejected" ? "rejected" : "revision_requested";

  const { error: updateError } = await input.supabase
    .from("workflow_assignments")
    .update({ status: assignmentStatus, completed_at: now })
    .eq("id", input.assignmentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (input.comment) {
    await input.supabase.from("project_comments").insert({
      project_id: projectId,
      workflow_step_id: assignment.workflow_step_id,
      author_id: input.user.id,
      visibility: "shared",
      body: input.comment
    });
  }

  await recomputeWorkflowState(input.supabase, projectId);
  await audit(input.supabase, input.user.id, `approval.${input.decision}`, "approval_assignment", input.assignmentId, {
    projectId,
    stepName: assignment.step.name,
    documentVersionId: documentVersion.id,
    documentHash: documentVersion.sha256_hash
  });

  return { projectId, approvalActionId: approvalAction.id as string, workflowStepId: assignment.workflow_step_id, stepName: assignment.step.name };
}

export async function approvalDecisionAction(assignmentId: string, formData: FormData) {
  uuidSchema.parse(assignmentId);
  const decision = decisionSchema.parse(formData.get("decision")) as ApprovalDecision;
  const comment = z.string().trim().optional().parse(formData.get("comment") || undefined);
  const confirmed = formData.get("certify") === "on";
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);

  let projectId: string;

  try {
    if (decision === "approved") {
      projectId = await createSignedDocumentVersionForApproval({
        assignmentId,
        comment,
        formData,
        profile,
        supabase,
        user
      });
    } else {
      const result = await recordApprovalDecision({
        assignmentId,
        comment,
        confirmed,
        decision,
        profile,
        supabase,
        user
      });
      projectId = result.projectId;
    }
  } catch (error) {
    console.error("Approval decision failed", {
      assignmentId,
      decision,
      message: error instanceof Error ? error.message : "Unknown approval error"
    });
    redirect(approvalUrl(assignmentId, {
      error: error instanceof Error ? error.message : "Approval could not be recorded."
    }));
  }

  revalidatePath(`/approvals/${assignmentId}`);
  revalidatePath("/approvals");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/approvals?message=${encodeURIComponent("Approval decision recorded.")}`);
}

export async function createProjectTypeAction(formData: FormData) {
  const payload = z
    .object({
      name: z.string().trim().min(2),
      description: z.string().trim().optional()
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["admin"]);

  const { error } = await supabase.from("project_types").insert({
    name: payload.name,
    description: payload.description ?? null
  });

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "admin.project_type_created", "project_type", null, payload);
  revalidatePath("/admin/project-types");
}

export async function saveReminderPolicyAction(formData: FormData) {
  const payload = z
    .object({
      unopenedAfterDays: z.coerce.number().int().min(0),
      noActionAfterDays: z.coerce.number().int().min(0),
      staffNoticeAfterDays: z.coerce.number().int().min(0),
      escalationAfterDays: z.coerce.number().int().min(0),
      repeatEscalationEveryDays: z.coerce.number().int().min(1),
      dueSoonBeforeDays: z.coerce.number().int().min(0)
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["admin"]);

  const { data: existing } = await supabase.from("reminder_rules").select("id").eq("is_default", true).maybeSingle();
  const values = {
    unopened_after_days: payload.unopenedAfterDays,
    no_action_after_days: payload.noActionAfterDays,
    staff_notice_after_days: payload.staffNoticeAfterDays,
    escalation_after_days: payload.escalationAfterDays,
    repeat_escalation_every_days: payload.repeatEscalationEveryDays,
    due_soon_before_days: payload.dueSoonBeforeDays,
    updated_by: user.id
  };

  const { error } = existing
    ? await supabase.from("reminder_rules").update(values).eq("id", existing.id)
    : await supabase.from("reminder_rules").insert({ ...values, name: "Default ISE reminder policy", is_default: true });

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "admin.reminder_policy_saved", "reminder_policy", existing?.id ?? null, payload);
  revalidatePath("/admin/reminder-rules");
}

export async function updateProfileRoleAction(formData: FormData) {
  const payload = z
    .object({
      profileId: z.string().uuid(),
      role: roleSchema,
      position: z.string().trim().optional()
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["admin"]);

  const { error: roleError } = await supabase.rpc("set_profile_role", {
    target_user_id: payload.profileId,
    new_role: payload.role
  });

  if (roleError) {
    throw new Error(roleError.message);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ position: payload.position ?? null, updated_at: new Date().toISOString() })
    .eq("id", payload.profileId);

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "admin.profile_role_updated", "profile", payload.profileId, payload);
  revalidatePath("/admin/users");
}

export async function createWorkflowTemplateAction(formData: FormData) {
  const payload = z
    .object({
      name: z.string().trim().min(2),
      projectTypeId: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().uuid().optional()
      ),
      stepName: z.string().trim().min(2),
      mode: z.enum(["sequential", "parallel"]),
      completionRule: z.enum(["all", "any", "minimum"]),
      minimumApprovals: z.coerce.number().int().min(1).optional()
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["admin"]);

  const templateId = randomUUID();
  const { error } = await supabase
    .from("workflow_templates")
    .insert({
      id: templateId,
      name: payload.name,
      project_type_id: payload.projectTypeId || null,
      created_by: user.id
    });

  if (error) {
    throw new Error(error.message);
  }

  const { error: stepError } = await supabase.from("workflow_template_steps").insert({
    template_id: templateId,
    step_order: 1,
    name: payload.stepName,
    mode: payload.mode as StepMode,
    completion_rule: payload.completionRule,
    minimum_approvals: payload.completionRule === "minimum" ? payload.minimumApprovals : null
  });

  if (stepError) {
    throw new Error(stepError.message);
  }

  await audit(supabase, user.id, "admin.workflow_template_created", "workflow_template", templateId, payload);
  revalidatePath("/admin/workflow-templates");
}
