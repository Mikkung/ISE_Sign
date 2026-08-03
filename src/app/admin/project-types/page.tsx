import { createProjectTypeAction } from "@/app/actions/admin";
import { listProjectTypes } from "@/lib/data";

export default async function AdminProjectTypesPage() {
  const projectTypes = await listProjectTypes();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Project Types</h2>
      <div className="rounded border border-slate-200 bg-white p-5">
        <form action={createProjectTypeAction} className="flex gap-2">
          <input name="name" placeholder="Project type name" className="flex-1 rounded border border-slate-300 px-3 py-2" />
          <input name="description" placeholder="Description" className="flex-1 rounded border border-slate-300 px-3 py-2" />
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Add</button>
        </form>
      </div>
      <div className="rounded border border-slate-200 bg-white">
        {projectTypes.map((projectType) => (
          <div key={projectType.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
            <p className="font-medium text-slate-950">{projectType.name}</p>
            <p className="text-sm text-slate-500">{projectType.description ?? "-"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
