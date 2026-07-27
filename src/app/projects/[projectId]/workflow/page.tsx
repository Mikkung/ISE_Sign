import { notFound } from "next/navigation";
import {
  activateWorkflowAction,
  addApproverToStepAction,
  addWorkflowStepAction
} from "@/app/actions/projects";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { getProject, listProfiles } from "@/lib/data";

export default async function ProjectWorkflowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const profiles = await listProfiles();
  const approvers = profiles.filter((profile) => ["approver", "staff", "admin"].includes(profile.role));

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-5">
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
        <form action={addWorkflowStepAction.bind(null, project.id)} className="grid gap-3 lg:grid-cols-6">
          <input name="name" placeholder="Step name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="mode" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="sequential">Sequential step</option>
            <option value="parallel">Parallel step</option>
          </select>
          <select name="completionRule" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All must approve</option>
            <option value="any">Any one may approve</option>
            <option value="minimum">Minimum approvals</option>
          </select>
          <input name="minimumApprovals" type="number" min={1} placeholder="Minimum" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="dueAt" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Add step</button>
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
              <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Add approver</button>
            </form>
          ))}
        </section>
      ) : null}
    </div>
  );
}
