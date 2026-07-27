import { createProjectAction } from "@/app/actions/projects";
import { listProjectTypes } from "@/lib/data";

const fallbackTypes = ["Senior Project", "Capstone", "Research Proposal"];

export default async function NewProjectPage() {
  const projectTypes = await listProjectTypes();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Create project</h2>
        <p className="mt-1 text-sm text-slate-500">
          Save a draft first, then upload documents and submit when ready.
        </p>
      </div>
      <form action={createProjectAction} className="space-y-4 rounded border border-slate-200 bg-white p-5 shadow-panel">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project title</span>
          <input name="title" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Abstract</span>
          <textarea name="abstract" rows={5} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Project type</span>
            <select
              name={projectTypes.length > 0 ? "projectTypeId" : "projectType"}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              {projectTypes.length > 0
                ? projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))
                : fallbackTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Academic program</span>
            <input name="academicProgram" defaultValue="ICE" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="submit" name="intent" value="draft" className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold">
            Save draft
          </button>
          <button type="submit" name="intent" value="submit" className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">
            Submit request
          </button>
        </div>
      </form>
    </div>
  );
}
