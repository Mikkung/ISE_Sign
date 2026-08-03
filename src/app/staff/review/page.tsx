import { ProjectTable } from "@/components/project-table";
import { listProjects } from "@/lib/data";

export default async function StaffReviewPage() {
  const projects = (await listProjects()).filter((project) =>
    ["submitted", "staff_review", "revision_required", "staff_approved"].includes(project.status)
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Staff Review</h2>
        <p className="mt-1 text-sm text-slate-500">Check completeness, request revision, assign approvers, and advance the approval workflow.</p>
      </div>
      <ProjectTable projects={projects} />
    </div>
  );
}
