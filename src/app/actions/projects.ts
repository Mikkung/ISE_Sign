"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDocumentHash, createVerificationCode } from "@/lib/certificates";
import { certificationStatement } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApprovalDecision, CompletionRule, StepMode, UserRole } from "@/lib/types";

const uuidSchema = z.string().uuid();
const projectSchema = z.object({
  title: z.string().trim().min(3),
  abstract: z.string().trim().optional(),
  projectTypeId: z.string().uuid().optional(),
  projectType: z.string().trim().optional(),
  academicProgram: z.string().trim().min(1),
  intent: z.enum(["draft", "submit"])
});
const workflowStepSchema = z.object({
  name: z.string().trim().min(2),
  mode: z.enum(["sequential", "parallel"]),
  completionRule: z.enum(["all", "any", "minimum"]),
  minimumApprovals: z.coerce.number().int().min(1).optional(),
  dueAt: z.string().optional(),
  reason: z.string().trim().optional()
});
const decisionSchema = z.enum(["approved", "rejected", "revision_requested"]);
const roleSchema = z.enum(["student", "staff", "approver", "admin"]);

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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
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

async function getCurrentProfile(supabase: Awaited<ReturnType<typeof requireSupabase>>) {
  const user = await requireCurrentUser(supabase);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, position")
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

async function resolveProjectTypeId(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  payload: z.infer<typeof projectSchema>
) {
  if (payload.projectTypeId) {
    return payload.projectTypeId;
  }

  if (!payload.projectType) {
    throw new Error("Project type is required.");
  }

  const { data, error } = await supabase
    .from("project_types")
    .select("id")
    .eq("name", payload.projectType)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Selected project type does not exist.");
  }

  return data.id as string;
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
    .select("id, document_id, version_number, sha256_hash, storage_bucket, storage_path")
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

  await supabase.from("certificates").upsert(
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

function isStepSatisfied(step: {
  completion_rule: CompletionRule;
  minimum_approvals: number | null;
  workflow_assignments: Array<{ id: string; status: string }>;
}) {
  const approved = step.workflow_assignments.filter((assignment) => assignment.status === "approved").length;

  switch (step.completion_rule) {
    case "all":
      return step.workflow_assignments.length > 0 && approved === step.workflow_assignments.length;
    case "any":
      return approved >= 1;
    case "minimum":
      return approved >= (step.minimum_approvals ?? step.workflow_assignments.length);
  }
}

async function recomputeWorkflowState(
  supabase: Awaited<ReturnType<typeof requireSupabase>>,
  projectId: string
) {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("id, step_order, completion_rule, minimum_approvals, workflow_assignments(id, status)")
    .eq("project_id", projectId)
    .order("step_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const steps = (data ?? []) as Array<{
    id: string;
    step_order: number;
    completion_rule: CompletionRule;
    minimum_approvals: number | null;
    workflow_assignments: Array<{ id: string; status: string }>;
  }>;

  const rejectedStep = steps.find((step) =>
    step.workflow_assignments.some((assignment) => assignment.status === "rejected")
  );
  const revisionStep = steps.find((step) =>
    step.workflow_assignments.some((assignment) => assignment.status === "revision_requested")
  );

  if (rejectedStep || revisionStep) {
    const terminalStep = rejectedStep ?? revisionStep;
    const status = rejectedStep ? "rejected" : "revision_required";
    await supabase.from("workflow_steps").update({ status }).eq("id", terminalStep?.id);
    await supabase.from("projects").update({ status, updated_at: new Date().toISOString() }).eq("id", projectId);
    return;
  }

  let activeStepId: string | null = null;
  let hasApprovedAssignment = false;
  let allComplete = steps.length > 0;

  for (const step of steps) {
    const complete = isStepSatisfied(step);
    hasApprovedAssignment ||= step.workflow_assignments.some((assignment) => assignment.status === "approved");

    if (complete) {
      await supabase.from("workflow_steps").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", step.id);

      if (step.completion_rule !== "all") {
        const staleAssignmentIds = step.workflow_assignments
          .filter((assignment) => ["waiting", "opened"].includes(assignment.status))
          .map((assignment) => assignment.id);

        if (staleAssignmentIds.length > 0) {
          await supabase
            .from("workflow_assignments")
            .update({ status: "invalidated", invalidated_at: new Date().toISOString() })
            .in("id", staleAssignmentIds);
        }
      }

      continue;
    }

    allComplete = false;

    if (!activeStepId) {
      activeStepId = step.id;
      await supabase.from("workflow_steps").update({ status: "in_progress" }).eq("id", step.id);
    } else {
      await supabase.from("workflow_steps").update({ status: "waiting" }).eq("id", step.id);
    }
  }

  if (allComplete) {
    const completedAt = new Date().toISOString();
    await supabase
      .from("projects")
      .update({ status: "completed", completed_at: completedAt, updated_at: completedAt })
      .eq("id", projectId);
    await ensureCertificate(supabase, projectId);
    return;
  }

  await supabase
    .from("projects")
    .update({
      status: hasApprovedAssignment ? "partially_approved" : "approval_pending",
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);
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
  await supabase.from("notification_logs").upsert(
    {
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
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );
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

export async function createProjectAction(formData: FormData) {
  const payload = projectSchema.parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  const projectTypeId = await resolveProjectTypeId(supabase, payload);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title: payload.title,
      abstract: payload.abstract ?? "",
      project_type_id: projectTypeId,
      academic_program: payload.academicProgram,
      student_id: user.id,
      status: payload.intent === "submit" ? "submitted" : "draft",
      submitted_at: payload.intent === "submit" ? now : null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, payload.intent === "submit" ? "project.submitted" : "project.created", "project", data.id);
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const payload = z
    .object({
      title: z.string().trim().min(3),
      abstract: z.string().trim().optional(),
      academicProgram: z.string().trim().min(1)
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("student_id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  const canEdit =
    profile.role === "admin" ||
    project?.student_id === user.id ||
    (profile.role === "staff" && ["submitted", "staff_review"].includes(project?.status ?? ""));

  if (!canEdit || !["draft", "revision_required", "submitted", "staff_review"].includes(project?.status ?? "")) {
    throw new Error("This project cannot be edited in its current state.");
  }

  const { error } = await supabase
    .from("projects")
    .update({
      title: payload.title,
      abstract: payload.abstract ?? "",
      academic_program: payload.academicProgram,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "project.updated", "project", projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function uploadDocumentVersionAction(projectId: string, formData: FormData) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

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
    const { data: createdDocument, error } = await supabase
      .from("project_documents")
      .insert({ project_id: projectId, document_type: documentType })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    documentId = createdDocument.id;
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

export async function submitProjectAction(projectId: string) {
  uuidSchema.parse(projectId);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertProjectAccess(supabase, projectId);

  const documentVersion = await getLatestActiveDocumentVersion(supabase, projectId);

  if (!documentVersion) {
    throw new Error("Upload at least one active document version before submitting.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("projects")
    .update({ status: "submitted", submitted_at: now, updated_at: now })
    .eq("id", projectId)
    .in("status", ["draft", "revision_required"]);

  if (error) {
    throw new Error(error.message);
  }

  await audit(supabase, user.id, "project.submitted", "project", projectId, {
    documentVersionId: documentVersion.id
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
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

  const updates: Record<string, unknown> = { updated_at: now };

  if (intent === "start_review") {
    updates.status = "staff_review";
    updates.assigned_staff_id = user.id;
  }

  if (intent === "revision") {
    updates.status = "revision_required";
  }

  if (intent === "reject") {
    updates.status = "rejected";
    updates.rejected_at = now;
  }

  if (intent === "complete") {
    updates.status = "staff_approved";
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
  const payload = workflowStepSchema.parse(Object.fromEntries(formData));
  const approverIds = formData.getAll("approverIds").map(String).filter(Boolean);
  const supabase = await requireSupabase();
  const { user } = await getCurrentProfile(supabase);
  await assertStaffCanManageProject(supabase, projectId);

  if (payload.completionRule === "minimum" && !payload.minimumApprovals) {
    throw new Error("Minimum approval rule requires a threshold.");
  }

  const { count: actionCount, error: actionCountError } = await supabase
    .from("approval_actions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (actionCountError) {
    throw new Error(actionCountError.message);
  }

  if ((actionCount ?? 0) > 0 && (!payload.reason || payload.reason.length < 5)) {
    throw new Error("Adding workflow steps after approvals exist requires a reason.");
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
  const { data: step, error } = await supabase
    .from("workflow_steps")
    .insert({
      project_id: projectId,
      name: payload.name,
      step_order: stepOrder,
      mode: payload.mode,
      status: "not_started",
      completion_rule: payload.completionRule,
      minimum_approvals: payload.completionRule === "minimum" ? payload.minimumApprovals : null,
      due_at: payload.dueAt || null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (approverIds.length > 0) {
    const assignments = approverIds.map((approverId) => ({
      workflow_step_id: step.id,
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
      workflow_step_id: step.id,
      changed_by: user.id,
      change_type: "step_added_after_action",
      reason: payload.reason,
      after_state: payload
    });
  }

  await audit(supabase, user.id, "workflow.step_added", "project", projectId, { stepId: step.id });
  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath(`/projects/${projectId}`);
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

  const { data: assignment, error } = await supabase
    .from("workflow_assignments")
    .insert({
      workflow_step_id: stepId,
      approver_id: approverId,
      due_at: dueAt || null
    })
    .select("id")
    .single();

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
      after_state: { approverId, assignmentId: assignment.id }
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

  await supabase.from("workflow_steps").update({ status: "waiting" }).eq("project_id", projectId);
  await supabase.from("workflow_steps").update({ status: "in_progress", activated_at: new Date().toISOString() }).eq("id", firstStepId);
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

  const { error } = await supabase
    .from("workflow_assignments")
    .update({ status: "opened", first_opened_at: now, last_opened_at: now })
    .eq("id", assignmentId)
    .eq("approver_id", user.id)
    .in("status", ["waiting", "opened"])
    .is("completed_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function approvalDecisionAction(assignmentId: string, formData: FormData) {
  uuidSchema.parse(assignmentId);
  const decision = decisionSchema.parse(formData.get("decision")) as ApprovalDecision;
  const comment = z.string().trim().optional().parse(formData.get("comment") || undefined);
  const confirmed = formData.get("certify") === "on";
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("workflow_assignments")
    .select("id, status, approver_id, workflow_step_id, step:workflow_steps!workflow_assignments_workflow_step_id_fkey(id, project_id, name, status, certification_required, revision_allowed)")
    .eq("id", assignmentId)
    .maybeSingle();
  const assignment = assignmentRow as ApprovalAssignmentRow | null;

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!assignment) {
    throw new Error("Approval assignment not found.");
  }

  if (assignment.approver_id !== user.id) {
    throw new Error("Only the assigned approver can submit this decision.");
  }

  if (!["waiting", "opened"].includes(assignment.status)) {
    throw new Error("This assignment already has a submitted decision.");
  }

  if (!assignment.step || assignment.step.status !== "in_progress") {
    throw new Error("This workflow step is not active yet.");
  }

  if (decision === "revision_requested" && !assignment.step.revision_allowed) {
    throw new Error("Revision requests are not allowed for this workflow step.");
  }

  if (decision === "approved" && assignment.step.certification_required && !confirmed) {
    throw new Error("Confirm the electronic certification statement before approving.");
  }

  const projectId = assignment.step.project_id as string;
  const documentVersion = await getLatestActiveDocumentVersion(supabase, projectId);

  if (!documentVersion) {
    throw new Error("No active document version is available for review.");
  }

  const existing = await supabase
    .from("approval_actions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (existing.data) {
    throw new Error("A decision has already been recorded for this assignment.");
  }

  const headerStore = await headers();
  const now = new Date().toISOString();
  const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip");
  const userAgent = headerStore.get("user-agent");

  const { error } = await supabase.from("approval_actions").insert({
    assignment_id: assignmentId,
    project_id: projectId,
    workflow_step_id: assignment.workflow_step_id,
    approver_id: user.id,
    decision,
    document_version_id: documentVersion.id,
    document_sha256_hash: documentVersion.sha256_hash,
    certification_statement_version: "v1",
    certification_statement: certificationStatement,
    certified_at: decision === "approved" ? now : null,
    approver_display_name: profile.display_name,
    approver_role_at_approval: profile.position ?? profile.role,
    ip_address: ipAddress,
    user_agent: userAgent,
    auth_provider: String(user.app_metadata.provider ?? "supabase"),
    comment
  });

  if (error) {
    throw new Error(error.message);
  }

  const assignmentStatus =
    decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "revision_requested";

  const { error: updateError } = await supabase
    .from("workflow_assignments")
    .update({ status: assignmentStatus, completed_at: now })
    .eq("id", assignmentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (comment) {
    await supabase.from("project_comments").insert({
      project_id: projectId,
      workflow_step_id: assignment.workflow_step_id,
      author_id: user.id,
      visibility: "shared",
      body: comment
    });
  }

  await recomputeWorkflowState(supabase, projectId);
  await audit(supabase, user.id, `approval.${decision}`, "approval_assignment", assignmentId, {
    projectId,
    documentVersionId: documentVersion.id,
    documentHash: documentVersion.sha256_hash
  });
  revalidatePath(`/approvals/${assignmentId}`);
  revalidatePath("/approvals");
  revalidatePath(`/projects/${projectId}`);
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
      projectTypeId: z.string().uuid().optional(),
      stepName: z.string().trim().min(2),
      mode: z.enum(["sequential", "parallel"]),
      completionRule: z.enum(["all", "any", "minimum"]),
      minimumApprovals: z.coerce.number().int().min(1).optional()
    })
    .parse(Object.fromEntries(formData));
  const supabase = await requireSupabase();
  const { user, profile } = await getCurrentProfile(supabase);
  requireRole(profile.role, ["admin"]);

  const { data: template, error } = await supabase
    .from("workflow_templates")
    .insert({
      name: payload.name,
      project_type_id: payload.projectTypeId || null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: stepError } = await supabase.from("workflow_template_steps").insert({
    template_id: template.id,
    step_order: 1,
    name: payload.stepName,
    mode: payload.mode as StepMode,
    completion_rule: payload.completionRule,
    minimum_approvals: payload.completionRule === "minimum" ? payload.minimumApprovals : null
  });

  if (stepError) {
    throw new Error(stepError.message);
  }

  await audit(supabase, user.id, "admin.workflow_template_created", "workflow_template", template.id, payload);
  revalidatePath("/admin/workflow-templates");
}
