import { notFound } from "next/navigation";
import { approvalDecisionAction } from "@/app/actions/projects";
import { certificationStatement } from "@/lib/constants";
import { getApprovalAssignment } from "@/lib/data";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const match = await getApprovalAssignment(assignmentId);

  if (!match) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{match.project.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{match.step.name}</p>
      </div>
      <section className="rounded border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-950">รับรองการอนุมัติทางอิเล็กทรอนิกส์</h3>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">ผู้อนุมัติ</dt>
            <dd className="font-medium text-slate-900">{match.assignment.profile.displayName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">บทบาท</dt>
            <dd className="font-medium text-slate-900">{match.assignment.profile.position ?? "Approver"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">เอกสารเวอร์ชัน</dt>
            <dd className="font-medium text-slate-900">{match.project.documents[0]?.latestVersion.versionNumber ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">วันที่และเวลา</dt>
            <dd className="font-medium text-slate-900">{new Date().toLocaleString("th-TH")}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {certificationStatement}
        </p>
        <form action={approvalDecisionAction.bind(null, match.assignment.id)} className="mt-4 space-y-4">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input name="certify" type="checkbox" className="mt-1" />
            ข้าพเจ้ายืนยันว่าการกดปุ่มนี้เป็นการรับรองการอนุมัติทางอิเล็กทรอนิกส์ ไม่ใช่ลายมือชื่อดิจิทัลแบบ PKI
          </label>
          <textarea name="comment" placeholder="ความคิดเห็น" rows={4} className="w-full rounded border border-slate-300 px-3 py-2" />
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="revision_requested" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">ขอแก้ไข</button>
            <button name="decision" value="rejected" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">ไม่อนุมัติ</button>
            <button name="decision" value="approved" className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">อนุมัติและรับรอง</button>
          </div>
        </form>
      </section>
    </div>
  );
}
