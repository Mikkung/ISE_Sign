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
      <h2 className="text-2xl font-semibold text-slate-950">แก้ไขโครงการ</h2>
      <form action={updateProjectAction} className="space-y-4 rounded border border-slate-200 bg-white p-5">
        <input type="hidden" name="projectId" value={project.id} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">ชื่อโครงการ</span>
          <input name="title" defaultValue={project.title} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">บทคัดย่อ</span>
          <textarea name="abstract" defaultValue={project.abstract} rows={5} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">หลักสูตร</span>
          <input name="academicProgram" defaultValue={project.academicProgram} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">บันทึก</button>
      </form>
    </div>
  );
}
