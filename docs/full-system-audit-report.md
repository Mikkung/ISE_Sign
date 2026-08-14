# รายงานตรวจสอบระบบฉบับเต็ม

## 1. ขอบเขตการตรวจสอบ

เอกสารนี้จัดทำตามคำขอสำหรับระบบ **Task Tracking and Staff Performance Assessment** แต่ repository ที่เปิดอยู่ในเครื่องนี้คือ `ise-project-approval` ไม่ใช่ repository ที่มีโครงสร้างไฟล์ตามที่ระบุในคำขอ

ไฟล์สำคัญที่คำขอให้ตรวจ แต่ไม่พบใน workspace นี้:

- `app/page.tsx`
- `components/AppShell.tsx`
- `components/TaskModal.tsx`
- `components/GanttChart.tsx`
- `utils/evaluationTasks.ts`
- `utils/taskProgress.ts`
- `utils/taskGrouping.ts`
- `utils/taskSource.ts`
- `utils/aiSummary.ts`
- `utils/assessment.ts`
- `app/api/assessment/ai-summary/route.ts`
- `app/admin/attendance-import/page.tsx`
- `app/admin/attendance-dashboard/page.tsx`
- `app/manager/attendance-dashboard/page.tsx`

ความหมาย: รายงานนี้ไม่สามารถยืนยัน behavior ของระบบ Task Tracking จริงจาก source code ได้ใน workspace ปัจจุบัน จึงบันทึกผลตรวจเป็น “ไม่พบไฟล์ใน repository นี้” แทนการคาดเดา

## 2. Git และสถานะ repository

repository ปัจจุบันมีชื่อ package ว่า `ise-project-approval` และเป็นระบบอนุมัติโครงการ ISE ไม่ใช่ระบบ Task Tracking / Staff Performance Assessment

สิ่งที่พบใน repository ปัจจุบัน:

- Next.js App Router
- Supabase Auth, Database, Storage, RLS
- ระบบโครงการ นักศึกษา เอกสาร workflow approval certificate dashboard audit logs
- migration ใน `supabase/migrations/001` ถึง `007`
- เอกสารเดิมบางส่วนใน `docs/`

ข้อสังเกตสำคัญ:

- มี uncommitted changes อยู่จำนวนมากจากงานก่อนหน้า
- ไม่ได้แก้ app logic สำหรับงานเอกสารนี้
- ไม่ได้สร้าง migration ใหม่สำหรับงานเอกสารนี้
- ไม่ได้เปลี่ยน `MAINTENANCE_MODE`

## 3. Build และ Static Checks

คำสั่งที่รันใน repository ปัจจุบัน:

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npm run build` | ผ่าน |
| `npm run lint` | ผ่าน |

หมายเหตุ: ผล build/lint นี้เป็นของ repository `ise-project-approval` ไม่ใช่ระบบ Task Tracking ที่ระบุในคำขอ

## 4. Route/Page Audit

สถานะ route ที่คำขอระบุ เมื่อตรวจใน workspace ปัจจุบัน:

| Route | ไฟล์ที่คาดหวัง | สถานะ |
|---|---|---|
| `/` | `app/page.tsx` | ไม่พบ มี `src/app/page.tsx` ของระบบ ISE |
| `/admin/assessment-periods` | `app/admin/assessment-periods/page.tsx` | ไม่พบ |
| `/admin/assessment-periods/[period_id]/submissions` | path ตาม route | ไม่พบ |
| `/admin/assessment-periods/[period_id]/manager-evaluations` | path ตาม route | ไม่พบ |
| `/manager/evaluations` | `app/manager/evaluations/page.tsx` | ไม่พบ |
| `/manager/evaluations/[period_id]` | path ตาม route | ไม่พบ |
| `/employee/assessment` | `app/employee/assessment/page.tsx` | ไม่พบ |
| `/employee/assessment/[period_id]` | path ตาม route | ไม่พบ |
| `/admin/attendance-import` | `app/admin/attendance-import/page.tsx` | ไม่พบ |
| `/admin/attendance-dashboard` | `app/admin/attendance-dashboard/page.tsx` | ไม่พบ |
| `/manager/attendance-dashboard` | `app/manager/attendance-dashboard/page.tsx` | ไม่พบ |
| `/maintenance` | `app/maintenance/page.tsx` | ไม่พบ |

ความหมาย: route audit สำหรับระบบ Task Tracking ยังต้องรันใน repository ที่ถูกต้อง

## 5. Database Migration Audit

ตรวจพบ migration ใน repository ปัจจุบัน:

- `001_approval_workflow_schema.sql`
- `002_storage_policies.sql`
- `003_student_self_registration.sql`
- `004_project_requester_verification.sql`
- `005_authenticated_student_project_requester.sql`
- `006_visual_signature_placement.sql`
- `007_project_cancellation_metadata.sql`

รายการ migration ที่คำขอให้ตรวจสำหรับ Task Tracking:

| Feature | สถานะใน workspace นี้ | ต้อง manual apply หรือไม่ | SQL ตรวจสอบเมื่ออยู่ใน repo จริง |
|---|---|---|---|
| Phase 1 task weight/progress columns | ไม่พบ | ต้องตรวจใน repo จริง | `select column_name from information_schema.columns where table_name='tasks';` |
| Phase 2 assessment tables | ไม่พบ | ต้องตรวจใน repo จริง | `select table_name from information_schema.tables where table_name like '%evaluation%';` |
| Phase 2.2 scoring/submission status | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `assessment_periods`, `self_evaluation_submissions` |
| Phase 3 manager evaluation tables | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `manager_evaluation_submissions` |
| Phase 4 peer review tables | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `peer_review_imports`, `peer_review_results` |
| Phase 4.1 manager assignment tables | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `manager_evaluation_assignments` |
| Phase 5 AI summary table | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `assessment_ai_summaries` |
| Phase 7 RLS/security migration | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `pg_policies` |
| Phase 8 Attendance/Leave schema | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `attendance_records`, `leave_records` |
| Phase 8 Leave source column fix | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ source columns |
| Phase 8 Attendance source column fix | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ source columns |
| Phase 9 task source flags | ไม่พบ | ต้องตรวจใน repo จริง | ตรวจ `task_source`, `counts_toward_assessment`, `include_in_ai_summary` |

## 6. Task Source Feature Audit

ไม่สามารถยืนยันจาก code ใน workspace นี้ได้ เพราะไม่พบ `tasks` migration และไม่พบ `utils/taskSource.ts`

พฤติกรรมที่ควรตรวจใน repo จริง:

- `tasks.task_source` ต้องมีค่าแยก `as_original` และ `user_added`
- `tasks.counts_toward_assessment` ต้องควบคุมว่างานใดนับคะแนนจริง
- `tasks.include_in_ai_summary` ต้องควบคุมว่างานใดเข้า AI summary
- งาน AS เดิมควร default เป็น official task
- งานที่ user เพิ่มควร default `counts_toward_assessment=false`
- งานที่ user เพิ่มควรใช้เป็นหลักฐานประกอบ AI ได้

ความเสี่ยง: ถ้า child task ที่ user เพิ่มถูกนับคะแนนโดยตรง อาจทำให้คะแนน official assessment ผิด

## 7. Assessment Logic Audit

ไม่พบไฟล์ `utils/assessment.ts` และ migration assessment ใน workspace นี้

สิ่งที่ต้องตรวจใน repo จริง:

- score level 1-5
- default score values: 5=100, 4=83.33, 3=66.66, 2=50, 1=33.33
- `workload_factor`
- `attribute_factor`
- leaf/evaluable task logic
- snapshot behavior
- submit/return/resubmit flow
- manager evaluation flow
- export summary flow

ความหมาย: snapshot คือสำเนาของ task ณ รอบประเมิน ถ้า snapshot เก่า คะแนนอาจไม่ตรงกับ task ปัจจุบัน

## 8. AI Summary Audit

ไม่พบ `utils/aiSummary.ts` และ `app/api/assessment/ai-summary/route.ts`

สิ่งที่ต้องตรวจใน repo จริง:

- env: `TYPHOON_API_KEY`, `TYPHOON_BASE_URL`, `TYPHOON_MODEL`
- official AS task input
- user-added task supporting evidence
- peer review input
- attendance/leave evidence ว่ารวมแล้วหรือยัง
- AI summary ต้องเป็น reference only ไม่แก้คะแนน

ความเสี่ยง: AI summary อาจมีข้อมูลส่วนบุคคล จึงควรจำกัดข้อมูลที่ส่งออกและไม่ใส่ raw sensitive fields

## 9. Attendance/Leave Import Audit

ไม่พบ Attendance/Leave import code ใน workspace นี้

Attendance source columns ที่ควรตรวจ:

`emp_id`, `date`, `emp_name`, `checkin_time`, `checkout_time`, `latetime`, `latecheck`, `reason`, `location`, `coords`, `timestamp_id`, `timestamp`, `session_id`, `source_email`, `device_id`, `attendance_status`, `attendance_remark`, `finalized_at`, `leave_type`

Leave source columns ที่ควรตรวจ:

`ID`, `Name`, `LeaveType`, `Month`, `StartDate`, `EndDate`, `Days`, `Status`, `ApprovedDate`, `Round`

ความหมาย: ต้องมี mapping ชัดเจนจากไฟล์ import ไปยัง `attendance_records` และ `leave_records`

## 10. Attendance/Leave Dashboard Audit

ไม่พบ route dashboard ที่ระบุ:

- `/admin/attendance-dashboard`
- `/manager/attendance-dashboard`

สิ่งที่ต้องตรวจใน repo จริง:

- duplicate menu item ถูกแก้แล้วหรือไม่
- มีปุ่ม Back to Main App หรือไม่
- ใช้ `utils/attendanceDashboardConfig.ts`
- manager เห็นข้อมูลทั้งหมดใน MVP หรือไม่
- user/employee เข้าไม่ได้หรือไม่
- filter ครบ Round, Team, Name, Date range, Leave type/Month

## 11. RLS/Security Audit

ไม่พบ migration RLS ของ Task Tracking ใน workspace นี้

สมมติฐานที่ต้องยืนยันใน repo จริง:

- `profiles.id = auth.uid()`
- role มาจาก `profiles.role`
- roles คือ `admin`, `manager`, `user`
- `tasks.assignee` ใช้ชื่อ ไม่ใช่ `assignee_id`
- `employee_id = profiles.display_name`
- manager เห็น Attendance/Leave ทั้งหมดใน MVP
- user ไม่เห็น Attendance/Leave dashboard

ความเสี่ยงสำคัญ: manager all-data access ใน HR dashboard เป็นความเสี่ยงด้าน privacy หากใช้ production จริง ควรวางแผนกรองตามทีมในอนาคต

## 12. Open Risks และ Recommended Next Actions

| Risk | Severity | Current behavior | Recommended action | Required before production |
|---|---|---|---|---|
| เปิดผิด repository | High | Workspace เป็น ISE approval ไม่ใช่ Task Tracking | เปิด repo ที่ถูกต้องแล้วรัน audit ใหม่ | Yes |
| ไม่สามารถยืนยัน task/assessment logic | High | ไม่พบไฟล์ที่เกี่ยวข้อง | ตรวจ `utils/assessment.ts`, migrations จริง | Yes |
| ไม่สามารถยืนยัน Attendance/Leave schema | High | ไม่พบ route/import/dashboard | ตรวจ Phase 8 files ใน repo จริง | Yes |
| RLS ของ Task Tracking ยังไม่ได้ตรวจ | High | ไม่พบ migration ที่เกี่ยวข้อง | ตรวจ policy ใน Supabase/repo จริง | Yes |
| AI summary privacy ยังไม่ได้ยืนยัน | Medium | ไม่พบ API route | ตรวจ prompt/input construction | Yes |

