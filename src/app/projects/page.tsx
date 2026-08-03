import Link from "next/link";
import { ProjectTable } from "@/components/project-table";
import { listProjectTypes, listProjectsFiltered } from "@/lib/data";

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; projectTypeId?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const [projects, projectTypes] = await Promise.all([listProjectsFiltered(filters), listProjectTypes()]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Projects</h2>
          <p className="mt-1 text-sm text-slate-500">Track status, attachments, comments, and approval results.</p>
        </div>
        <Link href="/projects/new" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">
          Create Project
        </Link>
      </div>
      <form className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-4">
        <select name="status" defaultValue={filters.status ?? "all"} className="rounded border border-slate-300 px-3 py-2 text-sm" aria-label="Status">
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="staff_review">Staff Review</option>
          <option value="approval_pending">Pending Approval</option>
          <option value="revision_required">Revision Requested</option>
          <option value="completed">Completed</option>
        </select>
        <select name="projectTypeId" defaultValue={filters.projectTypeId ?? "all"} className="rounded border border-slate-300 px-3 py-2 text-sm" aria-label="Project Type">
          <option value="all">All Types</option>
          {projectTypes.map((type) => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </select>
        <input name="q" defaultValue={filters.q ?? ""} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Search project title" />
        <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
          Filter
        </button>
      </form>
      <ProjectTable projects={projects} />
    </div>
  );
}
