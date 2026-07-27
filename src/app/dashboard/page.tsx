import { AlertTriangle, CheckCircle2, Clock3, FileText } from "lucide-react";
import { ProjectTable } from "@/components/project-table";
import { StatCard } from "@/components/ui/stat-card";
import { listProjects } from "@/lib/data";

export default async function DashboardPage() {
  const projects = await listProjects();
  const count = (status: string) => projects.filter((project) => project.status === status).length;
  const overdue = projects.filter((project) => project.dueAt && new Date(project.dueAt) < new Date()).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">แดชบอร์ด</h2>
        <p className="mt-1 text-sm text-slate-500">ภาพรวมงานส่ง ตรวจสอบ อนุมัติ และรับรองโครงการ</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="โครงการทั้งหมด" value={projects.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="รอตรวจสอบ" value={count("staff_review") + count("submitted")} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="รออนุมัติ" value={count("approval_pending") + count("partially_approved")} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="เกินกำหนด" value={overdue} icon={<AlertTriangle className="h-5 w-5" />} />
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-950">คิวงานล่าสุด</h3>
        </div>
        <ProjectTable projects={projects} />
      </section>
    </div>
  );
}
