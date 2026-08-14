import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  activateWorkflowAction,
  addApproverToStepAction,
  addWorkflowStepAction,
  saveStudentWorkflowAction
} from "@/app/actions/projects";
import { StudentWorkflowEditor } from "@/components/student-workflow-editor";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProject, listProfiles } from "@/lib/data";
import { getStudentWorkflowEditabilityForUser } from "@/lib/project-editability.server";
import { defaultStudentWorkflow, type StudentWorkflowStepInput, type WorkflowProfileOption, type WorkflowStepRole } from "@/lib/student-workflow";
import type { UserRole } from "@/lib/types";
import { WorkflowSubmitButton } from "./workflow-submit-button";

export default async function ProjectWorkflowPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { projectId } = await params;
  const { error, message } = await searchParams;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId);

  if (!isUuid) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/unauthorized");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role as UserRole | undefined;

  if (!profile || profile.is_active === false || !role) {
    redirect("/unauthorized");
  }

  const project = await getProject(projectId);

  if (!project) {
    const admin = createSupabaseAdminClient();
    const { data: existingProject } = admin
      ? await admin.from("projects").select("id").eq("id", projectId).maybeSingle()
      : { data: null };

    if (existingProject) {
      redirect("/unauthorized");
    }

    notFound();
  }

  if (role === "student") {
    if (project.student.id !== user.id) {
      redirect("/unauthorized");
    }

    const admin = createSupabaseAdminClient();
    const { data: profileRows } = admin
      ? await admin
          .from("profiles")
          .select("id, display_name, position, role, is_active")
          .in("role", ["staff", "approver", "admin"])
      : { data: [] };
    const workflowEditability = admin
      ? await getStudentWorkflowEditabilityForUser(admin, {
          projectId: project.id,
          userId: user.id,
          role,
          isActive: profile.is_active !== false,
          studentId: project.student.id,
          status: project.status
        })
      : { allowed: false, message: "Workflow editing is not configured." };
    const options = (profileRows ?? []).map((row) => ({
      id: row.id as string,
      displayName: String(row.display_name ?? "Approver"),
      position: row.position as string | null,
      role: row.role as UserRole,
      isActive: row.is_active !== false
    })) satisfies WorkflowProfileOption[];
    const activeCount = (stepRole: WorkflowStepRole) =>
      options.filter((option) => option.isActive && option.role === stepRole).length;
    const initialSteps: StudentWorkflowStepInput[] = project.workflow.length === 0
      ? defaultStudentWorkflow()
      : project.workflow.map((step) => {
          const stepRole: WorkflowStepRole = step.assigneeRole;
          const approverIds = step.approvers.map((approver) => approver.profile.id);
          const isPool = step.assignmentMode === "any_active_role" || (step.completionRule === "any" && approverIds.length === activeCount(stepRole));
          return {
            id: step.id,
            name: step.name,
            role: stepRole,
            selectionMode: isPool ? "any_active_role" : "specific_users",
            approverIds: isPool ? [] : approverIds,
            completionRule: step.completionRule,
            minimumApprovals: step.minimumApprovals,
            requiresSignature: step.certificationRequired,
            dueAt: step.dueAt ? step.dueAt.slice(0, 10) : null
          };
        });
    const locked = !workflowEditability.allowed;

    return (
      <div className="space-y-5">
        <Link href={`/projects/${project.id}`} className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
          ← Back to Project
        </Link>
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Edit Approval Workflow</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure ordered approval steps for your project before approval begins.
          </p>
        </div>
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {message ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}
        <StudentWorkflowEditor
          action={saveStudentWorkflowAction.bind(null, project.id)}
          initialSteps={initialSteps}
          profiles={options}
          locked={locked}
          lockReason={locked ? workflowEditability.message : undefined}
        />
        <WorkflowTimeline steps={project.workflow} />
      </div>
    );
  }

  if (!["staff", "admin"].includes(role)) {
    redirect("/unauthorized");
  }

  const { data: canManage, error: canManageError } = await supabase.rpc("staff_can_manage_project", {
    p_project_id: projectId
  });

  if (canManageError || canManage !== true) {
    redirect("/unauthorized");
  }

  const profiles = await listProfiles();
  const approvers = profiles.filter((profile) => ["approver", "staff", "admin"].includes(profile.role));

  return (
    <div className="space-y-5">
      <Link href={`/projects/${project.id}`} className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to Project
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Approval workflow</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure sequential or parallel steps, completion rules, due dates, and reminders.
          </p>
        </div>
        {project.workflow.length > 0 && !["approval_pending", "partially_approved", "completed"].includes(project.status) ? (
          <form action={activateWorkflowAction.bind(null, project.id)}>
            <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Activate workflow</button>
          </form>
        ) : null}
      </div>
      <div className="rounded border border-slate-200 bg-white p-4">
        {error ? (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        <form action={addWorkflowStepAction.bind(null, project.id)} className="grid gap-3 lg:grid-cols-6">
          <input name="name" placeholder="Step name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="role" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="staff">Staff</option>
            <option value="approver">Faculty Approver</option>
            <option value="admin">Admin</option>
          </select>
          <select name="mode" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="sequential">Sequential step</option>
            <option value="parallel">Parallel step</option>
          </select>
          <select name="completionRule" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All must approve</option>
            <option value="any">Any one may approve</option>
            <option value="minimum">Minimum approvals</option>
          </select>
          <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm">
            <input name="requiresSignature" type="checkbox" value="true" />
            Signature
          </label>
          <input name="minimumApprovals" type="number" min={1} placeholder="Minimum" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="dueAt" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <WorkflowSubmitButton pendingLabel="Adding...">Add step</WorkflowSubmitButton>
          <select name="approverIds" multiple className="rounded border border-slate-300 px-3 py-2 text-sm lg:col-span-3">
            {approvers.map((approver) => (
              <option key={approver.id} value={approver.id}>
                {approver.displayName} ({approver.position ?? approver.role})
              </option>
            ))}
          </select>
          <input
            name="reason"
            placeholder="Reason required after approvals exist"
            className="rounded border border-slate-300 px-3 py-2 text-sm lg:col-span-3"
          />
        </form>
      </div>
      <WorkflowTimeline steps={project.workflow} />
      {project.workflow.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">Add approver to an existing step</h3>
          {project.workflow.map((step) => (
            <form
              key={step.id}
              action={addApproverToStepAction.bind(null, project.id, step.id)}
              className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-5"
            >
              <div className="text-sm font-semibold text-slate-950">{step.name}</div>
              <select name="approverId" required className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select approver</option>
                {approvers.map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.displayName}
                  </option>
                ))}
              </select>
              <input name="dueAt" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="reason" placeholder="Reason" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <WorkflowSubmitButton pendingLabel="Adding..." variant="secondary">Add approver</WorkflowSubmitButton>
            </form>
          ))}
        </section>
      ) : null}
    </div>
  );
}
