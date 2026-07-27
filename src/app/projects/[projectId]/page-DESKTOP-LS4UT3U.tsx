import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { getProject } from "@/lib/data";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ise-maroon">{project.code}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{project.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.abstract}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded border border-slate-200 bg-white p-4 shadow-panel lg:col-span-2">
          <h3 className="font-semibold text-slate-950">ข้อมูลโครงการ</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">นักศึกษา</dt>
              <dd className="font-medium text-slate-900">{project.student.displayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">ประเภท</dt>
              <dd className="font-medium text-slate-900">{project.projectType}</dd>
            </div>
            <div>
              <dt className="text-slate-500">หลักสูตร</dt>
              <dd className="font-medium text-slate-900">{project.academicProgram}</dd>
            </div>
            <div>
              <dt className="text-slate-500">ผู้รับผิดชอบปัจจุบัน</dt>
              <dd className="font-medium text-slate-900">{project.currentResponsible ?? "-"}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded border border-slate-200 bg-white p-4 shadow-panel">
          <h3 className="font-semibold text-slate-950">การดำเนินการ</h3>
          <div className="mt-4 grid gap-2">
            <Link href={`/projects/${project.id}/documents`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              เอกสารและเวอร์ชัน
            </Link>
            <Link href={`/projects/${project.id}/workflow`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              ลำดับการอนุมัติ
            </Link>
            <Link href={`/projects/${project.id}/history`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              ประวัติการดำเนินการ
            </Link>
            <Link href={`/projects/${project.id}/certificate`} className="rounded border border-slate-300 px-3 py-2 text-center text-sm font-semibold">
              ใบรับรอง
            </Link>
          </div>
        </section>
      </div>
      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-950">ลำดับการอนุมัติ</h3>
        <WorkflowTimeline steps={project.workflow} />
      </section>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-panel">
        <h3 className="font-semibold text-slate-950">ความคิดเห็น</h3>
        <div className="mt-3 space-y-3">
          {project.comments.length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีความคิดเห็น</p>
          ) : (
            project.comments.map((comment) => (
              <div key={comment.id} className="rounded border border-slate-200 p-3">
                <p className="text-sm text-slate-900">{comment.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {comment.author.displayName} · {comment.visibility === "internal" ? "ความคิดเห็นภายใน" : "ความคิดเห็นร่วม"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
