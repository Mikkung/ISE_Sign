# Release and Testing Checklist

## 1. Before Running Codex

- [ ] git status สะอาด หรือทราบว่าไฟล์ใดเป็นงานค้าง
- [ ] อยู่ branch ที่ถูกต้อง
- [ ] pull main ล่าสุดแล้ว
- [ ] scope ชัดเจน
- [ ] ย้ำว่าไม่เปลี่ยน `MAINTENANCE_MODE`
- [ ] ย้ำว่าไม่สร้าง `assignee_id`
- [ ] ย้ำว่า documentation only ถ้าเป็นงานเอกสาร

## 2. After Codex

- [ ] รัน `git diff --stat`
- [ ] ตรวจว่าไม่มี unrelated files
- [ ] ตรวจ `next-env.d.ts`
- [ ] ตรวจ `package-lock.json`
- [ ] รัน `npm run build`
- [ ] รัน `npm run lint` ถ้ามี
- [ ] ตรวจ migration ว่าปลอดภัย
- [ ] ไม่มี SQL อันตราย เช่น hard delete production data

## 3. Before Applying Migration

- [ ] backup/export ถ้าเป็น production
- [ ] อ่าน migration ทั้งไฟล์
- [ ] ระบุ tables/columns ที่กระทบ
- [ ] มี precheck SQL
- [ ] มี postcheck SQL
- [ ] rollback มีเฉพาะ dev หรือมีแผน production ชัดเจน
- [ ] ยืนยันว่าไม่ได้แก้ migration ที่ apply แล้ว

## 4. After Applying Migration

- [ ] ตรวจ columns/tables ด้วย SQL
- [ ] ตรวจ RLS enabled
- [ ] ตรวจ policies
- [ ] ทดสอบ admin
- [ ] ทดสอบ manager
- [ ] ทดสอบ user
- [ ] ตรวจ logs

## 5. Before Commit

- [ ] build passed
- [ ] lint passed
- [ ] app tested
- [ ] git status reviewed
- [ ] commit message ชัดเจน
- [ ] ไม่มี secret ใน diff

## 6. Before Merge

- [ ] PR diff reviewed
- [ ] Vercel checks passed
- [ ] dependent branches merge ตามลำดับ
- [ ] migrations applied ใน environment ที่ถูกต้อง
- [ ] owner sign-off

## 7. Post-Deploy Smoke Test

- [ ] login
- [ ] task list
- [ ] Gantt
- [ ] create user-added child task
- [ ] self evaluation
- [ ] manager evaluation
- [ ] AI summary
- [ ] attendance import
- [ ] attendance dashboard
- [ ] leave dashboard
- [ ] logout

## 8. หากพบปัญหา

1. หยุด deploy ถ้ายังไม่ merge
2. เก็บ error log
3. ระบุ route/table/action ที่กระทบ
4. เปิด issue หรือให้ Codex ตรวจเฉพาะจุด
5. หลีกเลี่ยงการแก้หลาย feature พร้อมกัน

