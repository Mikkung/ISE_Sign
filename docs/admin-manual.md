# คู่มือผู้ดูแลระบบ

## 1. ภาพรวมบทบาท Admin

Admin ดูแลการตั้งค่ารอบประเมิน งาน ข้อมูลประเมิน การ import peer review การ import attendance/leave และตรวจ dashboard

หมายเหตุ: เอกสารนี้เป็นคู่มือตาม requirement ของระบบ Task Tracking แต่ source code จริงไม่อยู่ใน workspace ปัจจุบัน จึงควร verify กับระบบจริงก่อนใช้งาน production

## 2. การตั้ง Assessment Period

ขั้นตอน:

1. เปิด `/admin/assessment-periods`
2. สร้าง period ใหม่
3. ใส่ชื่อรอบ
4. ตั้งช่วง self evaluation
5. ตั้งช่วง manager evaluation
6. ตั้ง status

Status ที่ใช้:

- `draft`: เตรียมข้อมูล
- `self_open`: เปิดให้พนักงานประเมินตนเอง
- `self_closed`: ปิด self evaluation
- `manager_open`: เปิดให้ manager ประเมิน
- `manager_closed`: ปิด manager evaluation
- `completed`: จบรอบ

ความหมาย: อย่าเปิดรอบก่อนตรวจ tasks, weights และ snapshots

## 3. Score Configuration

ค่า default:

- 5 = 100
- 4 = 83.33
- 3 = 66.66
- 2 = 50
- 1 = 33.33

ตัวคูณ:

- `workload_factor`: น้ำหนักส่วนงาน
- `attribute_factor`: น้ำหนักส่วนพฤติกรรม/คุณลักษณะ

คำเตือน: อย่าเปลี่ยน config หลังมีคน submit แล้ว เพราะอาจทำให้คะแนนย้อนหลังไม่ตรงกัน

## 4. Task Weight และ Assessment Logic

หลักการ:

- Official AS Tasks เป็นฐานคะแนน
- Added Tasks เป็นหลักฐานประกอบ
- `counts_toward_assessment` ควบคุมว่างานใดนับคะแนน
- weight รวมควรใกล้ 100 ต่อพนักงาน

ถ้าคะแนนผิด:

1. ตรวจ task weight
2. ตรวจว่า Added Task ถูกนับหรือไม่
3. ตรวจ snapshot
4. ตรวจ score level values

## 5. Snapshot Management

Snapshot คือสำเนารายการงาน ณ รอบประเมิน

Workflow ที่แนะนำ:

1. เตรียม tasks
2. ตรวจ weights
3. สร้าง/open period
4. Sync snapshot
5. เปิด self evaluation

คำเตือน: ถ้าแก้ task หลัง sync snapshot อาจต้อง sync ใหม่ก่อนเปิดรอบ

## 6. Self-Evaluation Submission

Admin ควรตรวจ:

- submitted
- returned
- resubmitted
- missing submissions

ถ้าต้อง return:

1. เปิด submission
2. ใส่เหตุผล
3. ส่งกลับ
4. พนักงานแก้และ resubmit

## 7. Manager Assignment และ Manager Evaluation

1. กำหนด manager ให้ employee
2. เปิดรอบ manager evaluation
3. ตรวจว่า manager เห็นรายการที่ต้องประเมิน
4. manager submit
5. admin ตรวจ completeness

ถ้า manager ไม่เห็นข้อมูล ให้ตรวจ manager assignment และ role

## 8. Peer Review Import

ขั้นตอนทั่วไป:

1. เตรียม CSV ตาม template
2. Import
3. ตรวจ validation
4. ตรวจ summary
5. แจ้ง manager ให้ใช้เป็นข้อมูลประกอบ

ข้อควรระวัง: reviewer identity อาจเป็นข้อมูลอ่อนไหว ไม่ควรเผยเกินจำเป็น

## 9. AI Summary

ต้องมี env:

- `TYPHOON_API_KEY`
- `TYPHOON_BASE_URL`
- `TYPHOON_MODEL`

AI Summary ใช้ประกอบการพิจารณาเท่านั้น ไม่ควรใช้แทน manager judgment

ถ้า AI fail:

1. ตรวจ env
2. ตรวจ API quota
3. ตรวจ log
4. regenerate

## 10. Attendance/Leave Import

Route:

- `/admin/attendance-import`

Attendance required columns:

`emp_id`, `date`, `emp_name`, `checkin_time`, `checkout_time`, `latetime`, `latecheck`, `reason`, `location`, `coords`, `timestamp_id`, `timestamp`, `session_id`, `source_email`, `device_id`, `attendance_status`, `attendance_remark`, `finalized_at`, `leave_type`

Leave required columns:

`ID`, `Name`, `LeaveType`, `Month`, `StartDate`, `EndDate`, `Days`, `Status`, `ApprovedDate`, `Round`

ขั้นตอน:

1. เลือกไฟล์ CSV/XLSX
2. Preview
3. ตรวจ validation
4. Import
5. ตรวจ import run
6. ตรวจ dashboard

ความหมายของ `raw_row`: เก็บข้อมูลต้นฉบับเพื่อ audit แต่มีความเสี่ยงด้านข้อมูลส่วนบุคคล

## 11. Attendance/Leave Dashboard

Route:

- `/admin/attendance-dashboard`

ควรมี:

- Round filter
- Team filter
- Name filter
- Date range
- Leave type/month
- Back to Main App
- Last updated

Config:

- `utils/attendanceDashboardConfig.ts`

## 12. Timeline การทำงานของ Admin

ก่อนเปิดรอบ:

- ตรวจ tasks
- ตรวจ weights
- sync snapshot
- ตรวจ manager assignments

ระหว่าง self evaluation:

- ติดตาม submission
- return ถ้าต้องแก้

ระหว่าง manager evaluation:

- ตรวจ manager completion
- ตรวจ AI summary ถ้าใช้

หลังปิดรอบ:

- export summary
- archive
- backup

## 13. Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| Period ไม่แสดง | ตรวจ status/date |
| Tasks หาย | ตรวจ snapshot/filter/RLS |
| Weight รวมผิด | ตรวจ official AS tasks |
| Added task กระทบคะแนน | ตรวจ `counts_toward_assessment` |
| AI ไม่ generate | ตรวจ Typhoon env |
| Import missing columns | เทียบ header กับ template |
| Dashboard ว่าง | ตรวจ import run ล่าสุด |
| Manager unauthorized | ตรวจ role และ assignment |

