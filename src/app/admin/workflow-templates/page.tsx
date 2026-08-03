import { createWorkflowTemplateAction } from "@/app/actions/projects";
import { listProjectTypes, listWorkflowTemplates } from "@/lib/data";

export default async function AdminWorkflowTemplatesPage() {
  const [templates, projectTypes] = await Promise.all([listWorkflowTemplates(), listProjectTypes()]);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Workflow Templates</h2>
      <form action={createWorkflowTemplateAction} className="grid gap-3 rounded border border-slate-200 bg-white p-5 md:grid-cols-3">
        <input name="name" required placeholder="Template name" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <select name="projectTypeId" className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">Any project type</option>
          {projectTypes.map((type) => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </select>
        <input name="stepName" required placeholder="First step name" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <select name="mode" className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="sequential">Sequential</option>
          <option value="parallel">Parallel</option>
        </select>
        <select name="completionRule" className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All approve</option>
          <option value="any">Any one</option>
          <option value="minimum">Minimum</option>
        </select>
        <input name="minimumApprovals" type="number" min={1} placeholder="Minimum" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white md:col-span-3">Create template</button>
      </form>
      <div className="rounded border border-slate-200 bg-white">
        {templates.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No workflow templates found.</p>
        ) : (
          templates.map((template) => (
            <article key={template.id} className="border-b border-slate-100 p-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{template.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{template.projectTypeName ?? "Any project type"}</p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{template.active ? "active" : "inactive"}</span>
              </div>
              <ol className="mt-3 space-y-1 text-sm text-slate-700">
                {template.steps.map((step, index) => (
                  <li key={`${template.id}-${step.name}-${index}`}>
                    {index + 1}. {step.name} · {step.mode} · {step.completionRule}
                    {step.minimumApprovals ? ` (${step.minimumApprovals})` : ""}
                  </li>
                ))}
              </ol>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
