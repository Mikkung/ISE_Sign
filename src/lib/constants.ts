import type { ProjectStatus, WorkflowStepStatus } from "@/lib/types";

export const ISE_MAROON = "#8B2332";

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "ฉบับร่าง",
  submitted: "ส่งคำขอแล้ว",
  staff_review: "รอตรวจสอบ",
  revision_required: "ขอแก้ไข",
  staff_approved: "ผ่านการตรวจเอกสาร",
  approval_pending: "รออนุมัติ",
  partially_approved: "อนุมัติบางส่วน",
  rejected: "ไม่อนุมัติ",
  approved: "อนุมัติแล้ว",
  completed: "เสร็จสมบูรณ์",
  cancelled: "ยกเลิก"
};

export const workflowStatusLabels: Record<WorkflowStepStatus, string> = {
  not_started: "ยังไม่เริ่ม",
  waiting: "รอเริ่ม",
  in_progress: "กำลังดำเนินการ",
  revision_required: "ขอแก้ไข",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  skipped: "ข้าม",
  completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด"
};

export const certificationStatement =
  "I confirm that I have reviewed the project information and attached documents and approve this request in my official capacity.";
