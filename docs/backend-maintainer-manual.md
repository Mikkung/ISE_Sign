# คู่มือ Backend และ System Maintainer

## 1. System Overview

ระบบ Task Tracking and Staff Performance Assessment ตาม requirement ควรเป็น Next.js web app ที่เชื่อมกับ Supabase สำหรับ Auth, Database และ RLS

ความหมาย:

- Next.js ดูแลหน้าเว็บและ API routes
- Supabase เก็บข้อมูลและจัดการ login
- RLS คือกฎความปลอดภัยระดับแถวใน database
- migration คือประวัติการเปลี่ยน schema ที่ต้องใช้ตามลำดับ

หมายเหตุสำคัญ: workspace ปัจจุบันไม่ใช่ repo Task Tracking จึงควรใช้คู่มือนี้เป็น operating guide และตรวจชื่อไฟล์จริงใน repo ที่ถูกต้อง

## 2. Folder Structure

โครงสร้างที่ควรพบใน repo จริง:

- `app/`: routes และ API
- `components/`: UI components เช่น AppShell, TaskModal, GanttChart
- `utils/`: business logic เช่น assessment, AI summary, attendance import
- `supabase/migrations/`: SQL migrations
- `docs/`: เอกสารระบบ
- `types.ts`: shared TypeScript types ถ้ามี
- `middleware.ts`: route guard หรือ maintenance mode ถ้ามี

## 3. Environment Variables

ตัวแปรที่ควรตรวจ:

- `NEXT_PUBLIC_SUPABASE_URL`: URL ของ Supabase ใช้ฝั่ง browser ได้
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon key ใช้ฝั่ง browser ได้ แต่ยังอยู่ใต้ RLS
- `MAINTENANCE_MODE`: เปิด/ปิด maintenance mode
- `TYPHOON_API_KEY`: server-only ห้าม expose
- `TYPHOON_BASE_URL`: endpoint ของ Typhoon
- `TYPHOON_MODEL`: model name

คำอธิบาย: ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` จะถูกส่งไป browser ได้ ส่วน API key จริงต้อง server-only

## 4. Local Development

คำสั่งหลัก:

```bash
npm install
npm run dev
npm run build
npm run lint
```

Windows/OneDrive notes:

- path ที่มีช่องว่างอาจทำให้บาง script ทำงานยาก
- `next-env.d.ts` อาจถูก Next.js เปลี่ยนระหว่าง dev/build
- CRLF warning จาก git มักเป็น line ending warning ไม่ใช่ logic error

## 5. Git Workflow

Workflow ที่แนะนำ:

1. สร้าง feature branch
2. จำกัด scope ให้เล็ก
3. รัน build/lint
4. ตรวจ `git diff --stat`
5. commit
6. push
7. เปิด PR
8. merge ตามลำดับ dependency

ตัวอย่าง branch จาก requirement:

- `phase8-attendance-leave-schema`
- `phase8-attendance-import-ui`
- `phase8-attendance-dashboard-ui`
- `phase9-task-source-user-added`

## 6. Database Schema Overview

ตารางสำคัญที่ควรมี:

- `profiles`: ผู้ใช้และ role, โดย `profiles.id = auth.uid()`
- `teams`: ทีม
- `tasks`: งาน ใช้ `assignee` ไม่ใช่ `assignee_id`
- `assessment_periods`: รอบประเมิน
- `attribute_criteria`: เกณฑ์คุณลักษณะ
- `assessment_task_snapshots`: snapshot งานในรอบ
- `task_self_evaluations`: คะแนนงานจาก employee
- `attribute_self_evaluations`: คะแนน attribute จาก employee
- `self_evaluation_submissions`: สถานะ submit
- `task_manager_evaluations`: คะแนนงานจาก manager
- `attribute_manager_evaluations`: คะแนน attribute จาก manager
- `manager_evaluation_submissions`: สถานะ submit ของ manager
- `manager_evaluation_assignments`: mapping manager-employee
- `peer_review_imports`: import run
- `peer_review_results`: raw peer review
- `peer_review_summaries`: summary peer review
- `assessment_ai_summaries`: AI summary
- `attendance_import_runs`: import run attendance/leave
- `attendance_records`: attendance data
- `leave_records`: leave data
- `employee_source_mappings`: mapping source employee กับ profile/display name

ความเสี่ยง: ถ้า schema จริงต่างจากนี้ ต้อง update เอกสารและ tests ทันที

## 7. Task Model

ข้อสำคัญ:

- `tasks.assignee = profiles.display_name`
- `employee_id = profiles.display_name`
- ห้ามสร้าง `assignee_id` ถ้า requirement ยังยืนยันว่าไม่ใช้
- `parent_id` ใช้ทำ child task
- `task_source` แยก AS original กับ user added
- `counts_toward_assessment` คุมการนับคะแนน
- `include_in_ai_summary` คุมการเข้า AI
- `weight` ใช้กับ official scoring

ความหมาย: user-added tasks ช่วยเล่า context แต่ไม่ควรทำให้คะแนน official เปลี่ยน

## 8. Assessment Scoring

แนวคิด:

1. เลือก official/evaluable tasks
2. ใช้ score level 1-5
3. แปลงเป็น score value
4. คูณ task weight
5. รวมกับ attribute score ตาม factor

ต้องระวัง:

- leaf task logic
- parent/child task
- snapshot stale
- `counts_toward_assessment=false`

ถ้า user-added child task ทำให้ parent AS หายจาก evaluation แปลว่า logic มีความเสี่ยง ต้องแก้ใน phase แยก

## 9. AI Summary

ตำแหน่งที่ควรตรวจ:

- `app/api/assessment/ai-summary/route.ts`
- `utils/aiSummary.ts`

AI input ควรแยก:

- official tasks = หลัก
- user-added tasks = supplementary evidence
- peer review = supporting insight
- attendance/leave = ใช้เมื่อออกแบบแล้วเท่านั้น

Failure modes:

- missing env
- API quota
- timeout
- malformed response
- sensitive data leak

## 10. Attendance/Leave

Import:

- CSV/XLSX
- validate headers
- create import run
- store parsed rows
- map employee
- store `raw_row`

Dashboard:

- transform records
- apply filters
- read thresholds from config

Power Automate future support: อาจใช้ดึงข้อมูลอัตโนมัติ แต่ app-native dashboard ปลอดภัยกว่า Power BI Publish to web เพราะควบคุม auth/RLS ได้

## 11. RLS/Security

RLS คือการบังคับสิทธิ์ใน database

Role model:

- admin: จัดการระบบ
- manager: ดูข้อมูลทีม/ข้อมูลประเมินที่เกี่ยวข้อง
- user: ดูข้อมูลของตนเอง

ข้อควรระวัง:

- anon key ไม่ใช่ secret แต่ต้องพึ่ง RLS
- service role เป็น secret ห้ามใช้ฝั่ง browser
- error `42501` แปลว่าสิทธิ์ไม่พอ
- manager all-data access สำหรับ HR dashboard เป็น MVP risk
- `raw_row` อาจมีข้อมูลส่วนบุคคล

## 12. Migration Operations

หลักการ:

- อ่าน migration ก่อน apply
- อย่าแก้ migration ที่ apply แล้ว
- production ควร backup ก่อน
- rollback ใช้ใน dev เท่านั้น ยกเว้นมีแผนชัดเจน

SQL ตัวอย่าง:

```sql
select column_name
from information_schema.columns
where table_name = 'tasks'
  and column_name in ('task_source', 'counts_toward_assessment', 'include_in_ai_summary');
```

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

```sql
select *
from pg_policies
where schemaname = 'public';
```

## 13. Maintenance Mode

`MAINTENANCE_MODE` ใช้ปิดระบบชั่วคราว

ค่าปกติควรเป็น false

คำเตือน: อย่าเปลี่ยนเป็น true โดยไม่ตั้งใจ เพราะผู้ใช้จะเข้าใช้งานไม่ได้

## 14. Troubleshooting Runbook

| อาการ | แนวทาง |
|---|---|
| build fails | อ่าน error แรก ตรวจ import/type/env |
| route not found | ตรวจ path ใน `app/` |
| menu missing | ตรวจ role และ AppShell |
| Supabase 42501 | ตรวจ RLS policy |
| missing column | ตรวจ migration applied หรือยัง |
| import validates old columns | ตรวจ parser/config |
| dashboard no data | ตรวจ import run/filter |
| AI summary fails | ตรวจ Typhoon env/log |
| user-added task affects score | ตรวจ `counts_toward_assessment` |
| Gantt overflow | ตรวจ component CSS |
| Vercel failed | อ่าน build log |
| Git certificate error | ตรวจ network/cert |
| `next-env.d.ts` changing | restore ถ้าเป็น generated route import |
| package-lock ignored | ตรวจ `.gitignore` |
| CRLF warning | line ending warning |

## 15. Prompting Codex Safely

เวลาสั่ง Codex:

- ระบุว่า documentation only หรือ code change
- ระบุว่าอย่าเปลี่ยน `MAINTENANCE_MODE`
- ระบุว่าอย่าสร้าง `assignee_id`
- ระบุว่า `tasks.assignee` คือ field ที่ใช้
- ระบุ branch/phase
- ขอ build/lint result
- ขอ files changed
- ถ้าเป็น DB ให้ขอ precheck/postcheck/rollback docs
- อย่าให้ apply migration อัตโนมัติถ้ายังไม่ได้ review
- ให้ตรวจ `git diff --stat` ก่อน commit

