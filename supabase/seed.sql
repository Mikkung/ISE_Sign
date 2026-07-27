-- Safe local seed data.
-- Create Supabase Auth users first with these emails, then run this seed.
-- If the Auth users do not exist yet, this file remains runnable and inserts only lookup data.

insert into public.project_types (name, description)
values
  ('Senior Project', 'Final-year student project'),
  ('Capstone', 'Capstone design or applied engineering project'),
  ('Research Proposal', 'Research or thesis proposal')
on conflict (name) do update
set description = excluded.description;

insert into public.organizational_units (name, code)
values
  ('ISE', 'ISE'),
  ('Academic Affairs', 'AA'),
  ('Finance', 'FIN'),
  ('Information and Communication Engineering', 'ICE'),
  ('Aerospace Engineering', 'AERO')
on conflict (code) do update
set name = excluded.name;

insert into public.profiles (id, display_name, email, role, position)
select id, 'ศ.ดร. อนงค์ พิทักษ์', email, 'admin', 'System Admin'
from auth.users
where email = 'admin@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'นวพล ใจดี', email, 'student', null
from auth.users
where email = 'student1@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'มินตรา ศึกษา', email, 'student', null
from auth.users
where email = 'student2@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'กฤตภาส เจ้าหน้าที่', email, 'staff', 'Academic Staff'
from auth.users
where email = 'staff1@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'สุภาวดี งานวิชาการ', email, 'staff', 'Senior Staff'
from auth.users
where email = 'staff2@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'ดร. ปาลิดา ที่ปรึกษา', email, 'approver', 'Advisor'
from auth.users
where email = 'lecturer1@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'ดร. ธีรพงศ์ ผู้อำนวยการ', email, 'approver', 'Program Director'
from auth.users
where email = 'director@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

insert into public.profiles (id, display_name, email, role, position)
select id, 'วรรณา การเงิน', email, 'approver', 'Finance Officer'
from auth.users
where email = 'finance@example.edu'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    position = excluded.position;

with student as (
  select id from public.profiles where email = 'student1@example.edu'
),
staff as (
  select id from public.profiles where email = 'staff1@example.edu'
),
project_type as (
  select id from public.project_types where name = 'Senior Project'
)
insert into public.projects (
  code,
  title,
  abstract,
  status,
  project_type_id,
  academic_program,
  student_id,
  assigned_staff_id,
  current_responsible
)
select
  'ISE-2026-SEED-001',
  'ระบบตรวจวัดพลังงานสำหรับห้องเรียนอัจฉริยะ',
  'โครงการออกแบบแดชบอร์ดและอุปกรณ์ IoT สำหรับติดตามการใช้พลังงาน',
  'draft',
  project_type.id,
  'ICE',
  student.id,
  staff.id,
  'นวพล ใจดี'
from student, staff, project_type
on conflict (code) do nothing;
