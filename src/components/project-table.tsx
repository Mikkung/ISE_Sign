import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { activeWorkflowStep, signatureRequirementLabel, waitingForSummary } from "@/lib/workflow-display";
import type { Project } from "@/lib/types";

export function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="rounded border border-slate-200 bg-white shadow-panel">
      <table className="hidden min-w-full divide-y divide-slate-200 md:table">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Project</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Current Step</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Waiting For</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Due</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Approval Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((project) => {
            const activeStep = activeWorkflowStep(project);
            const terminal = ["completed", "cancelled", "rejected"].includes(project.status);

            return (
              <tr key={project.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/projects/${project.id}`} className="font-semibold text-slate-950 hover:text-ise-maroon">
                    {project.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {project.code} · {project.academicProgram}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={project.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{terminal ? "-" : activeStep?.name ?? project.currentStep}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{terminal ? "-" : waitingForSummary(activeStep)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {project.dueAt ? new Date(project.dueAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" }) : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{activeStep ? signatureRequirementLabel(activeStep) : project.nextAction}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="divide-y divide-slate-100 md:hidden">
        {projects.map((project) => {
          const activeStep = activeWorkflowStep(project);
          const terminal = ["completed", "cancelled", "rejected"].includes(project.status);

          return (
            <Link key={project.id} href={`/projects/${project.id}`} className="block p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{project.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.code} · {project.academicProgram}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">Current Step</dt>
                  <dd className="font-medium text-slate-900">{terminal ? "-" : activeStep?.name ?? project.currentStep}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Waiting For</dt>
                  <dd className="font-medium text-slate-900">{terminal ? "-" : waitingForSummary(activeStep)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Approval Type</dt>
                  <dd className="font-medium text-slate-900">{activeStep ? signatureRequirementLabel(activeStep) : project.nextAction}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
