import Link from "next/link";
import { notFound } from "next/navigation";
import { staffReviewAction } from "@/app/actions/projects";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProject } from "@/lib/data";

export default async function StaffReviewDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{project.title}</h2>
          <p className="mt-1 text-sm text-slate-500">ตรวจเอกสารและกำหนดลำดับการอนุมัติ</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <section className="grid gap-4 lg:grid-cols-3">
        <form action={staffReviewAction.bind(null, project.id)} className="space-y-3 rounded border border-slate-200 bg-white p-4 lg:col-span-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">ความคิดเห็นร่วม</span>
            <textarea name="sharedComment" rows={4} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">ความคิดเห็นภายใน</span>
            <textarea name="internalComment" rows={4} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">เหตุผลเมื่อขอแก้ไข</span>
            <textarea name="revisionReason" rows={3} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="intent" value="revision" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">ขอแก้ไข</button>
            <button name="intent" value="reject" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">ไม่อนุมัติ</button>
            <button name="intent" value="complete" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">ยืนยันความครบถ้วน</button>
          </div>
        </form>
        <aside className="rounded border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">ขั้นตอนถัดไป</h3>
          <p className="mt-2 text-sm text-slate-600">{project.nextAction}</p>
          <Link href={`/projects/${project.id}/workflow`} className="mt-4 block rounded bg-ise-maroon px-3 py-2 text-center text-sm font-semibold text-white">
            ตั้งค่า workflow
          </Link>
        </aside>
      </section>
    </div>
  );
}
