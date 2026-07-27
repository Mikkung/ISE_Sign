import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Project } from "@/lib/types";

export function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-panel">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">โครงการ</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">สถานะ</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">ผู้รับผิดชอบ</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">กำหนด</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">ขั้นตอนถัดไป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((project) => (
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
              <td className="px-4 py-3 text-sm text-slate-700">{project.currentResponsible ?? "-"}</td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {project.dueAt ? new Date(project.dueAt).toLocaleDateString("th-TH") : "-"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{project.nextAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
