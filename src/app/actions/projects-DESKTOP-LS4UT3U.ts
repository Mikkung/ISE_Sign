"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { certificationStatement } from "@/lib/constants";
import { createDocumentHash } from "@/lib/certificates";

const projectSchema = z.object({
  title: z.string().min(3),
  abstract: z.string().optional(),
  projectType: z.string().min(1),
  academicProgram: z.string().min(1),
  intent: z.enum(["draft", "submit"])
});

const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3),
  abstract: z.string().optional(),
  academicProgram: z.string().min(1)
});

const staffReviewSchema = z.object({
  projectId: z.string().uuid(),
  sharedComment: z.string().optional(),
  internalComment: z.string().optional(),
  revisionReason: z.string().optional(),
  action: z.enum(["request_revision", "reject", "confirm_complete"])
});

const workflowStepSchema = z.object({
  projectId: z.string().uuid(),
  stepName: z.string().min(2),
  mode: z.enum(["sequential", "parallel"]),
  completionRule: z.enum(["all", "any", "minimum"]),
  minimumApprovals: z.coerce.number().int().positive().optional(),
  dueAt: z.string().optional(),
  approverIds: z.string().min(1)
});

const approvalDecisionSchema = z.object({
  assignmentId: z.string().uuid(),
  action: z.enum(["approved", "rejected", "revision_requested"]),
  comment: z.string().optional(),
  confirmed: z.string().optional()
});

async function requireUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase environment variables are required for this action.");
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication is required.");
  }

  return { supabase, user };
}

async function getRole(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  if (!supabase) {
    throw new Error("Supabase client is required.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role, display_name, position")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("Profile is required before performing this action.");
  }

  return data;
}

async function writeAuditLog(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  input: {
    actorId: string;
    actorRole: string;
    actionType: string;
    entityType: string;
    entityId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("activity_logs").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action_type: input.actionType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    reason: input.reason,
    metadata: input.metadata ?? {}
  });
}

export async function createProjectAction(formData: FormData) {
  const payload = projectSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  const { data: projectType } = await supabase
    .from("project_types")
    .select("id")
    .eq("name", payload.projectType)
    .maybeSingle();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title: payload.title,
      abstract: payload.abstract,
      project_type_id: projectType?.id,
      academic_program: payload.academicProgram,
      student_id: user.id,
      status: payload.intent === "submit" ? "submitted" : "draft",
      submitted_at: payload.intent === "submit" ? new Date().toISOString() : null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: payload.intent === "submit" ? "project_submitted" : "project_created",
    entityType: "project",
    entityId: data.id,
    metadata: { title: payload.title }
  });

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProjectAction(formData: FormData) {
  const payload = updateProjectSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  const { error } = await supabase
    .from("projects")
    .update({
      title: payload.title,
      abstract: payload.abstract,
      academic_program: payload.academicProgram
    })
    .eq("id", payload.projectId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: "project_edited",
    entityType: "project",
    entityId: payload.projectId
  });

  revalidatePath(`/projects/${payload.projectId}`);
  redirect(`/projects/${payload.projectId}`);
}

export async function submitProjectAction(projectId: string) {
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  const { error } = await supabase
    .from("projects")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: "project_submitted",
    entityType: "project",
    entityId: projectId
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadDocumentVersionAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const documentType = String(formData.get("documentType") || "Project Document");
  const revisionNote = String(formData.get("revisionNote") || "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A document file is required.");
  }

  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createDocumentHash(bytes);

  const documentQuery = await supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("document_type", documentType)
    .maybeSingle();

  if (documentQuery.error) {
    throw new Error(documentQuery.error.message);
  }

  let documentRecord = documentQuery.data;

  if (!documentRecord) {
    const { data, error } = await supabase
      .from("project_documents")
      .insert({
        project_id: projectId,
        document_type: documentType,
        created_by: user.id
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    documentRecord = data;
  }

  const { data: latestVersion } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentRecord.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latestVersion?.version_number ?? 0) + 1;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${projectId}/${documentRecord.id}/v${versionNumber}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  await supabase
    .from("document_versions")
    .update({ active_version: false })
    .eq("document_id", documentRecord.id);

  const { error: versionError } = await supabase.from("document_versions").insert({
    document_id: documentRecord.id,
    version_number: versionNumber,
    original_file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || "application/octet-stream",
    uploaded_by: user.id,
    active_version: true,
    sha256_hash: hash,
    revision_note: revisionNote,
    created_by: user.id
  });

  if (versionError) {
    throw new Error(versionError.message);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: versionNumber === 1 ? "document_uploaded" : "document_version_created",
    entityType: "project",
    entityId: projectId,
    metadata: { documentType, versionNumber, sha256Hash: hash }
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents`);
}

export async function staffReviewAction(formData: FormData) {
  const payload = staffReviewSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  if (!["staff", "admin"].includes(profile.role)) {
    throw new Error("Only staff or admins can perform staff review actions.");
  }

  if (payload.sharedComment) {
    await supabase.from("project_comments").insert({
      project_id: payload.projectId,
      author_id: user.id,
      author_role: profile.role,
      visibility: "shared",
      body: payload.sharedComment,
      created_by: user.id
    });
  }

  if (payload.internalComment) {
    await supabase.from("project_comments").insert({
      project_id: payload.projectId,
      author_id: user.id,
      author_role: profile.role,
      visibility: "internal",
      body: payload.internalComment,
      created_by: user.id
    });
  }

  const statusByAction = {
    request_revision: "revision_required",
    reject: "rejected",
    confirm_complete: "staff_approved"
  } as const;

  if (payload.action === "request_revision" && !payload.revisionReason?.trim()) {
    throw new Error("Revision reason is required.");
  }

  const { error } = await supabase
    .from("projects")
    .update({ status: statusByAction[payload.action], assigned_staff_id: user.id })
    .eq("id", payload.projectId);

  if (error) {
    throw new Error(error.message);
  }

  if (payload.action === "request_revision") {
    await supabase.from("revision_requests").insert({
      project_id: payload.projectId,
      requested_by: user.id,
      reason: payload.revisionReason,
      created_by: user.id
    });
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType:
      payload.action === "request_revision"
        ? "revision_requested"
        : payload.action === "reject"
          ? "rejection_recorded"
          : "staff_review_completed",
    entityType: "project",
    entityId: payload.projectId,
    reason: payload.revisionReason
  });

  revalidatePath(`/staff/review/${payload.projectId}`);
  revalidatePath(`/projects/${payload.projectId}`);
}

export async function addWorkflowStepAction(formData: FormData) {
  const payload = workflowStepSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  if (!["staff", "admin"].includes(profile.role)) {
    throw new Error("Only staff or admins can configure workflows.");
  }

  const approverIds = payload.approverIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (approverIds.length === 0) {
    throw new Error("At least one approver is required.");
  }

  if (payload.completionRule === "minimum" && !payload.minimumApprovals) {
    throw new Error("Minimum approval count is required.");
  }

  const instanceQuery = await supabase
    .from("workflow_instances")
    .select("id, activated_at")
    .eq("project_id", payload.projectId)
    .maybeSingle();

  if (instanceQuery.error) {
    throw new Error(instanceQuery.error.message);
  }

  let instance = instanceQuery.data;

  if (!instance) {
    const { data, error } = await supabase
      .from("workflow_instances")
      .insert({
        project_id: payload.projectId,
        status: "not_started",
        created_by: user.id
      })
      .select("id, activated_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    instance = data;
  }

  const { count } = await supabase
    .from("workflow_steps")
    .select("id", { count: "exact", head: true })
    .eq("workflow_instance_id", instance.id);

  const { data: step, error: stepError } = await supabase
    .from("workflow_steps")
    .insert({
      workflow_instance_id: instance.id,
      step_name: payload.stepName,
      step_order: (count ?? 0) + 1,
      mode: payload.mode,
      status: "not_started",
      completion_rule: payload.completionRule,
      minimum_approvals: payload.completionRule === "minimum" ? payload.minimumApprovals : null,
      due_at: payload.dueAt || null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (stepError) {
    throw new Error(stepError.message);
  }

  const approverRows = approverIds.map((approverId) => ({
    workflow_step_id: step.id,
    approver_id: approverId,
    status: "waiting",
    due_at: payload.dueAt || null,
    created_by: user.id
  }));

  const { error: approverError } = await supabase.from("workflow_step_approvers").insert(approverRows);

  if (approverError) {
    throw new Error(approverError.message);
  }

  await supabase.from("workflow_change_logs").insert({
    workflow_instance_id: instance.id,
    project_id: payload.projectId,
    actor_id: user.id,
    change_type: "step_added",
    new_value: { ...payload, approverIds },
    created_by: user.id
  });

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: "workflow_configured",
    entityType: "project",
    entityId: payload.projectId,
    metadata: { stepId: step.id, approverIds }
  });

  revalidatePath(`/projects/${payload.projectId}/workflow`);
}

export async function activateWorkflowAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  if (!["staff", "admin"].includes(profile.role)) {
    throw new Error("Only staff or admins can activate workflows.");
  }

  const { data: instance, error } = await supabase
    .from("workflow_instances")
    .select("id, workflow_steps(id, step_order)")
    .eq("project_id", projectId)
    .single();

  if (error || !instance) {
    throw new Error(error?.message ?? "Workflow is required.");
  }

  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("id, step_order")
    .eq("workflow_instance_id", instance.id)
    .order("step_order", { ascending: true });

  if (!steps || steps.length === 0) {
    throw new Error("Workflow cannot activate without steps.");
  }

  const firstStep = steps[0];
  const now = new Date().toISOString();

  await supabase
    .from("workflow_instances")
    .update({ status: "in_progress", activated_at: now })
    .eq("id", instance.id);

  await supabase
    .from("workflow_steps")
    .update({ status: "waiting" })
    .eq("workflow_instance_id", instance.id);

  await supabase
    .from("workflow_steps")
    .update({ status: "in_progress", started_at: now })
    .eq("id", firstStep.id);

  await supabase
    .from("workflow_step_approvers")
    .update({ assigned_at: now, first_notification_at: now })
    .eq("workflow_step_id", firstStep.id)
    .is("assigned_at", null);

  await supabase
    .from("projects")
    .update({ status: "approval_pending", current_responsible: "ผู้อนุมัติ" })
    .eq("id", projectId);

  await supabase.from("workflow_change_logs").insert({
    workflow_instance_id: instance.id,
    project_id: projectId,
    actor_id: user.id,
    change_type: "workflow_activated",
    created_by: user.id
  });

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType: "workflow_activated",
    entityType: "project",
    entityId: projectId
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/workflow`);
}

export async function approvalDecisionAction(formData: FormData) {
  const payload = approvalDecisionSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const profile = await getRole(supabase, user.id);

  if (payload.action === "approved" && payload.confirmed !== "on") {
    throw new Error("Certification confirmation is required.");
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("workflow_step_approvers")
    .select(
      "id, approver_id, workflow_step_id, completed_at, workflow_steps(id, workflow_instance_id, step_order, completion_rule, minimum_approvals, workflow_instances(project_id))"
    )
    .eq("id", payload.assignmentId)
    .single();

  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message ?? "Assignment not found.");
  }

  if (assignment.approver_id !== user.id) {
    throw new Error("You can only decide your own assignment.");
  }

  if (assignment.completed_at) {
    throw new Error("This assignment already has a decision.");
  }

  const workflowStep = Array.isArray(assignment.workflow_steps)
    ? assignment.workflow_steps[0]
    : assignment.workflow_steps;
  const workflowInstance = Array.isArray(workflowStep.workflow_instances)
    ? workflowStep.workflow_instances[0]
    : workflowStep.workflow_instances;
  const projectId = workflowInstance.project_id;

  const { data: documentVersion, error: documentError } = await supabase
    .from("document_versions")
    .select("id, sha256_hash, project_documents!inner(project_id)")
    .eq("active_version", true)
    .eq("project_documents.project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (documentError || !documentVersion) {
    throw new Error(documentError?.message ?? "Active document version is required.");
  }

  const documentProject = Array.isArray(documentVersion.project_documents)
    ? documentVersion.project_documents[0]
    : documentVersion.project_documents;

  if (documentProject.project_id !== projectId) {
    throw new Error("Document version does not belong to this project.");
  }

  const now = new Date().toISOString();
  const { data: action, error: actionError } = await supabase
    .from("approval_actions")
    .insert({
      project_id: projectId,
      workflow_step_id: workflowStep.id,
      assignment_id: payload.assignmentId,
      approver_id: user.id,
      approver_display_name: profile.display_name,
      approver_role_at_time: profile.position ?? profile.role,
      action: payload.action,
      document_version_id: documentVersion.id,
      document_sha256_hash: documentVersion.sha256_hash,
      certification_statement_version: payload.action === "approved" ? "v1" : null,
      comment: payload.comment,
      auth_provider: "supabase",
      created_by: user.id
    })
    .select("id")
    .single();

  if (actionError) {
    throw new Error(actionError.message);
  }

  if (payload.action === "approved") {
    const { error: certificationError } = await supabase.from("electronic_certifications").insert({
      approval_action_id: action.id,
      project_id: projectId,
      workflow_step_id: workflowStep.id,
      document_version_id: documentVersion.id,
      user_id: user.id,
      display_name: profile.display_name,
      role_at_time: profile.position ?? profile.role,
      statement: certificationStatement,
      statement_version: "v1",
      document_sha256_hash: documentVersion.sha256_hash,
      certified_at: now,
      auth_provider: "supabase",
      created_by: user.id
    });

    if (certificationError) {
      throw new Error(certificationError.message);
    }
  }

  await supabase
    .from("workflow_step_approvers")
    .update({
      status:
        payload.action === "approved"
          ? "approved"
          : payload.action === "rejected"
            ? "rejected"
            : "revision_requested",
      completed_at: now
    })
    .eq("id", payload.assignmentId);

  if (payload.comment) {
    await supabase.from("project_comments").insert({
      project_id: projectId,
      workflow_step_id: workflowStep.id,
      author_id: user.id,
      author_role: profile.role,
      visibility: "shared",
      body: payload.comment,
      locked_at: now,
      created_by: user.id
    });
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    actorRole: profile.role,
    actionType:
      payload.action === "approved"
        ? "approval_certified"
        : payload.action === "rejected"
          ? "rejection_recorded"
          : "revision_requested",
    entityType: "project",
    entityId: projectId,
    metadata: { assignmentId: payload.assignmentId, documentVersionId: documentVersion.id }
  });

  revalidatePath(`/approvals/${payload.assignmentId}`);
  revalidatePath(`/projects/${projectId}`);
}
