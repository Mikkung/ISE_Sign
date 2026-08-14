import { formatDuration, type LongestWaitingProject } from "@/lib/dashboard-analytics";

export function LongestWaitingTable({ projects }: { projects: LongestWaitingProject[] }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">Longest-Waiting Active Requests</h3>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {["All", "Requester", "Staff", "Faculty", "Admin", "Overdue only"].map((label) => (
            <span key={label} className="rounded border border-slate-200 px-2 py-1">{label}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Project Code</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Current Stage</th>
              <th className="px-2 py-2">Waiting For</th>
              <th className="px-2 py-2">Current Responsible</th>
              <th className="px-2 py-2">Waiting Since</th>
              <th className="px-2 py-2">Waiting Time</th>
              <th className="px-2 py-2">Due Date</th>
              <th className="px-2 py-2">Overdue Status</th>
              <th className="px-2 py-2">Open Project</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.length === 0 ? (
              <tr><td colSpan={10} className="px-2 py-4 text-slate-500">No active waiting projects.</td></tr>
            ) : projects.map((project) => (
              <tr key={project.projectId}>
                <td className="px-2 py-2 font-medium text-slate-900">{project.projectCode}</td>
                <td className="px-2 py-2">{project.title}</td>
                <td className="px-2 py-2">{project.currentStageLabel}</td>
                <td className="px-2 py-2">{project.waitingFor}</td>
                <td className="px-2 py-2">{project.currentResponsible}</td>
                <td className="px-2 py-2">{project.waitingSince ? new Date(project.waitingSince).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }) : "-"}</td>
                <td className="px-2 py-2">{formatDuration(project.waitingHours)}</td>
                <td className="px-2 py-2">{project.dueAt ? new Date(project.dueAt).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" }) : "-"}</td>
                <td className="px-2 py-2">{project.overdue ? "Overdue" : "On track"}</td>
                <td className="px-2 py-2"><a className="font-semibold text-ise-maroon" href={`/projects/${project.projectId}`}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
