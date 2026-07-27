import { notFound } from "next/navigation";
import { activateWorkflowAction, addWorkflowStepAction } from "@/app/actions/projects";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { getProject, listApproverProfiles } from "@/lib/data";

export default async function ProjectWorkflowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const approvers = await listApproverProfiles();

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">ตั้งค่าลำดับการอนุมัติ</h2>
        <p className="mt-1 text-sm text-slate-500">เพิ่มขั้นตอน ผู้อนุมัติ เงื่อนไขกำหนดเสร็จ และกฎแจ้งเตือน</p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-4">
        <form action={addWorkflowStepAction} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="stepName" placeholder="ชื่อขั้นตอน" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="mode" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="sequential">อนุมัติแบบลำดับ</option>
            <option value="parallel">อนุมัติแบบคู่ขนาน</option>
          </select>
          <select name="completionRule" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="all">ทุกคนต้องอนุมัติ</option>
            <option value="any">คนใดคนหนึ่งอนุมัติได้</option>
            <option value="minimum">จำนวนขั้นต่ำ</option>
          </select>
          <input name="minimumApprovals" type="number" min="1" placeholder="ขั้นต่ำ" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="dueAt" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="approverIds" multiple required className="rounded border border-slate-300 px-3 py-2 text-sm">
            {approvers.map((approver) => (
              <option key={approver.id} value={approver.id}>
                {approver.displayName}
              </option>
            ))}
          </select>
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">เพิ่มขั้นตอน</button>
        </form>
      </div>
      <form action={activateWorkflowAction} className="flex justify-end">
        <input type="hidden" name="projectId" value={project.id} />
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">เปิดใช้งาน workflow</button>
      </form>
      <WorkflowTimeline steps={project.workflow} />
    </div>
  );
}
