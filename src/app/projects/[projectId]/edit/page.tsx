import { notFound } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { getProject } from "@/lib/data";
import { academicPrograms, projectTypeCategories } from "@/lib/project-request-validation";

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
        <input type="hidden" name="studentEmail" value={project.verifiedRequester?.email ?? project.student.email} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Title</span>
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
          <span className="text-sm font-medium text-slate-700">Academic Program</span>
          <select name="academicProgram" defaultValue={project.academicProgram === "-" ? "" : project.academicProgram} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">Select an academic program</option>
            {academicPrograms.map((program) => <option key={program} value={program}>{program}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Type</span>
          <select name="projectTypeCategory" defaultValue={project.projectTypeCategory ?? "CSR Trip"} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            {projectTypeCategories.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Specify Project Type</span>
          <input name="projectTypeCustom" defaultValue={project.projectTypeCustom ?? ""} maxLength={120} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start Date</span>
            <input name="startDate" type="date" required defaultValue={project.startDate} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">End Date</span>
            <input name="endDate" type="date" required defaultValue={project.endDate} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">Save</button>
      </form>
    </div>
  );
}
