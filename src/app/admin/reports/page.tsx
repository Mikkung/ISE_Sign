import { listProjects } from "@/lib/data";

export default async function AdminReportsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">รายงาน</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">จำนวนคำขอ</p>
          <p className="mt-2 text-2xl font-semibold">{projects.length}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">เสร็จสมบูรณ์</p>
          <p className="mt-2 text-2xl font-semibold">{projects.filter((project) => project.status === "completed").length}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">ขอแก้ไข</p>
          <p className="mt-2 text-2xl font-semibold">{projects.filter((project) => project.status === "revision_required").length}</p>
        </div>
      </div>
    </div>
  );
}
