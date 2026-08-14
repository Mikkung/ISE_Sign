# คู่มือผู้ใช้งาน

## 1. ภาพรวมระบบ

ระบบ Task Tracking and Staff Performance Assessment ใช้สำหรับติดตามงาน ประเมินตนเอง ประเมินโดยหัวหน้า และใช้ข้อมูลสนับสนุน เช่น AI summary, peer review, attendance และ leave

หมายเหตุสำคัญ: เอกสารนี้จัดทำจาก requirement ที่ให้มา แต่ source code ของระบบ Task Tracking ไม่อยู่ใน workspace ปัจจุบัน จึงควรตรวจทานกับหน้าจอจริงอีกครั้งก่อนเผยแพร่ให้ผู้ใช้

## 2. การเข้าสู่ระบบและเมนู

1. เปิด URL ของระบบ
2. เข้าสู่ระบบด้วยบัญชีที่องค์กรกำหนด
3. ระบบจะแสดงเมนูตาม role
4. ถ้าเห็นหน้า Maintenance แปลว่าระบบอยู่ระหว่างปิดปรับปรุง

Role หลัก:

- `user`: พนักงานหรือ staff ทั่วไป
- `manager`: หัวหน้าหรือผู้ประเมิน
- `admin`: ผู้ดูแลระบบ

## 3. การติดตามงาน

มุมมองที่อาจมีในระบบ:

- List: รายการงาน
- Board: งานตามสถานะ
- Calendar: งานตามวันที่
- Gantt: งานตาม timeline

ฟิลด์สำคัญของงาน:

- Task name: ชื่องาน
- Assignee: ผู้รับผิดชอบ โดยระบบนี้ใช้ `tasks.assignee`
- Work type: ประเภทงาน
- Status: สถานะ
- Progress: ความคืบหน้า
- Due date: กำหนดส่ง
- Weight: น้ำหนักคะแนน
- Parent/Child task: งานหลักและงานย่อย
- AS Original badge: งานทางการจาก AS
- Added Task badge: งานที่ผู้ใช้เพิ่มเอง

## 4. Original AS Tasks กับ Added Tasks

Original AS Task คือ งานทางการที่ใช้ในการประเมิน

Added Task คือ งานที่ผู้ใช้เพิ่มเองเพื่อแตกงานหรือบันทึกรายละเอียดเพิ่มเติม

ข้อควรรู้:

- Added Task ไม่ควรเพิ่มคะแนน official score โดยตรง
- Added Task ใช้เป็นหลักฐานประกอบ AI summary ได้
- `counts_toward_assessment=false` แปลว่าไม่นับเข้าคะแนนโดยตรง
- `include_in_ai_summary=true` แปลว่า AI สามารถใช้เป็นข้อมูลประกอบได้

## 5. การเพิ่ม Child Task

1. เปิดหน้ารายการงาน
2. กด Add Task
3. เลือก parent จาก Original AS Task
4. ใส่ชื่องาน สถานะ วันที่ และ progress
5. บันทึก
6. ตรวจว่ามี badge `Added Task`
7. โดยทั่วไป weight ของ Added Task ควรเป็น 0

## 6. การแก้ Original AS Task

ถ้าระบบเตือนเมื่อแก้งาน AS เดิม ให้ระวังเป็นพิเศษ เพราะงานนี้มีผลต่อการประเมินทางการ

คำแนะนำ:

- ถ้าเป็นรายละเอียดงานย่อย ให้เพิ่ม Added Task แทน
- อย่าเปลี่ยนชื่อหรือ weight ของ AS task เว้นแต่ admin หรือเจ้าของระบบสั่ง

## 7. การกรองงาน

ตัวกรองที่ควรใช้:

- All Tasks
- Original AS Tasks
- Added Tasks
- Team
- Name
- Status
- Date range

ถ้าหางานไม่เจอ ให้ตรวจ filter ก่อน

## 8. Self Evaluation

1. เปิดหน้า Self Evaluation
2. เลือกรอบประเมิน
3. ตรวจรายการ official AS tasks
4. ใส่ score level 1-5
5. ใส่ evidence หรือ comment ถ้ามี
6. ใส่ attribute scores
7. Save Draft
8. Submit เมื่อพร้อม

ความหมายของคะแนน:

- 1 น้อยที่สุด
- 2 น้อย
- 3 ปานกลาง
- 4 มาก
- 5 มากที่สุด

ถ้าถูก return:

1. อ่านเหตุผลที่ถูกส่งกลับ
2. แก้ข้อมูล
3. Submit อีกครั้ง

## 9. Manager Evaluation

1. เปิดเมนู Manager Evaluation
2. เลือกรอบประเมิน
3. เลือกพนักงาน
4. อ่าน self-evaluation
5. ตรวจ official AS tasks
6. ดู Added Tasks เป็นบริบท
7. ดู peer review หรือ attendance/leave ถ้ามี
8. ใส่คะแนน manager
9. Save หรือ Submit
10. Return for revision ถ้าต้องการให้แก้ไข

คะแนนสุดท้ายควรใช้ดุลยพินิจของ manager ไม่ใช่ AI เพียงอย่างเดียว

## 10. AI Summary

AI Summary เป็นข้อมูลประกอบ ไม่ใช่ผู้ตัดสินคะแนน

AI อาจสรุปจาก:

- official tasks
- added tasks
- peer review
- attendance/leave ถ้าระบบรวมข้อมูลนี้แล้ว

ถ้า AI ผิด:

1. ตรวจข้อมูลต้นทาง
2. regenerate ถ้าจำเป็น
3. ใช้ human judgment
4. ไม่ใส่ข้อมูลอ่อนไหวเกินจำเป็น

## 11. Attendance/Leave Dashboard

สำหรับ manager/admin เท่านั้นใน MVP

ข้อมูลที่อาจแสดง:

- Late count
- Total late minutes
- Average late minutes
- Leave days by type
- Filter by Round, Team, Name, Date range
- Last updated

ถ้า dashboard ว่าง ให้ติดต่อ admin เพื่อตรวจว่า import ล่าสุดสำเร็จหรือไม่

## 12. ปัญหาที่พบบ่อย

| ปัญหา | วิธีตรวจ |
|---|---|
| ไม่เห็น task | ตรวจ filter และสิทธิ์ |
| แก้ task ไม่ได้ | ตรวจสถานะงานและ role |
| ไม่เห็น assessment period | รอบอาจยังไม่เปิด |
| Submit disabled | ตรวจ required fields |
| AI summary fails | แจ้ง admin ตรวจ Typhoon env |
| Dashboard ไม่มีข้อมูล | ตรวจ import run |
| ข้อมูล attendance ไม่อัปเดต | ให้ admin import ใหม่ |

