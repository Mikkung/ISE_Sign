import { notFound } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { getProject } from "@/lib/data";

export default async function EditProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Edit project</h2>
      <form action={updateProjectAction.bind(null, project.id)} className="space-y-4 rounded border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project title</span>
          <input
            name="title"
            required
            defaultValue={project.title}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Abstract</span>
          <textarea
            name="abstract"
            defaultValue={project.abstract}
            rows={5}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Academic program</span>
          <input
            name="academicProgram"
            required
            defaultValue={project.academicProgram}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">Save</button>
      </form>
    </div>
  );
}
