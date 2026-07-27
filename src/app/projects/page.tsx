import Link from "next/link";
import { ProjectTable } from "@/components/project-table";
import { listProjects } from "@/lib/data";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">โครงการ</h2>
          <p className="mt-1 text-sm text-slate-500">ติดตามสถานะ เอกสาร ความคิดเห็น และผลการอนุมัติ</p>
        </div>
        <Link href="/projects/new" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">
          สร้างโครงการ
        </Link>
      </div>
      <div className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-4">
        <select className="rounded border border-slate-300 px-3 py-2 text-sm" aria-label="สถานะ">
          <option>ทุกสถานะ</option>
          <option>รอตรวจสอบ</option>
          <option>รออนุมัติ</option>
          <option>เสร็จสมบูรณ์</option>
        </select>
        <select className="rounded border border-slate-300 px-3 py-2 text-sm" aria-label="ประเภทโครงการ">
          <option>ทุกประเภท</option>
          <option>Senior Project</option>
          <option>Capstone</option>
        </select>
        <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาชื่อโครงการ" />
        <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
          กรองข้อมูล
        </button>
      </div>
      <ProjectTable projects={projects} />
    </div>
  );
}
