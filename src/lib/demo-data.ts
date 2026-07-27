import type { Project, Profile } from "@/lib/types";

export const demoProfiles: Profile[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    displayName: "ศ.ดร. อนงค์ พิทักษ์",
    email: "admin@example.edu",
    role: "admin",
    unitName: "ISE"
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    displayName: "นวพล ใจดี",
    email: "student1@example.edu",
    role: "student",
    unitName: "ICE"
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    displayName: "มินตรา ศึกษา",
    email: "student2@example.edu",
    role: "student",
    unitName: "AERO"
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    displayName: "กฤตภาส เจ้าหน้าที่",
    email: "staff1@example.edu",
    role: "staff",
    unitName: "Academic Affairs"
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    displayName: "ดร. ปาลิดา ที่ปรึกษา",
    email: "lecturer1@example.edu",
    role: "approver",
    unitName: "ICE",
    position: "Advisor"
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    displayName: "ดร. ธีรพงศ์ ผู้อำนวยการ",
    email: "director@example.edu",
    role: "approver",
    unitName: "ISE",
    position: "Program Director"
  },
  {
    id: "77777777-7777-7777-7777-777777777777",
    displayName: "วรรณา การเงิน",
    email: "finance@example.edu",
    role: "approver",
    unitName: "Finance",
    position: "Finance Officer"
  }
];

const now = "2026-07-17T03:00:00.000Z";
const student = demoProfiles[1];
const staff = demoProfiles[3];
const advisor = demoProfiles[4];
const director = demoProfiles[5];
const finance = demoProfiles[6];

export const demoProjects: Project[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    code: "ISE-2026-001",
    title: "ระบบตรวจวัดพลังงานสำหรับห้องเรียนอัจฉริยะ",
    abstract: "โครงการออกแบบแดชบอร์ดและอุปกรณ์ IoT สำหรับติดตามการใช้พลังงาน",
    status: "draft",
    projectType: "Senior Project",
    academicProgram: "ICE",
    student,
    members: [],
    assignedStaff: staff,
    currentStep: "Draft",
    currentResponsible: student.displayName,
    lastActivityAt: now,
    nextAction: "ส่งคำขอ",
    documents: [],
    comments: [],
    workflow: []
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    code: "ISE-2026-002",
    title: "เครื่องมือวิเคราะห์เส้นทางขนส่งนักศึกษา",
    abstract: "วิเคราะห์ข้อมูลการเดินทางเพื่อเสนอเส้นทางรถรับส่งที่มีประสิทธิภาพ",
    status: "staff_review",
    projectType: "Capstone",
    academicProgram: "AERO",
    student: demoProfiles[2],
    members: [],
    assignedStaff: staff,
    currentStep: "Staff Review",
    currentResponsible: staff.displayName,
    dueAt: "2026-07-20T10:00:00.000Z",
    submittedAt: "2026-07-16T04:00:00.000Z",
    lastActivityAt: "2026-07-16T04:00:00.000Z",
    nextAction: "ตรวจความครบถ้วนของเอกสาร",
    documents: [],
    comments: [
      {
        id: "comment-1",
        visibility: "shared",
        body: "ได้รับเอกสารแล้ว อยู่ระหว่างตรวจสอบ",
        author: staff,
        createdAt: "2026-07-16T05:00:00.000Z",
        resolved: false,
        edited: false
      }
    ],
    workflow: []
  },
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    code: "ISE-2026-003",
    title: "แพลตฟอร์มวางแผนการใช้ห้องปฏิบัติการ",
    abstract: "ระบบจัดตารางทรัพยากรห้องปฏิบัติการและการอนุมัติการใช้งาน",
    status: "approval_pending",
    projectType: "Senior Project",
    academicProgram: "ICE",
    student,
    members: [],
    assignedStaff: staff,
    currentStep: "Advisor and Finance",
    currentResponsible: "ผู้อนุมัติ 2 คน",
    dueAt: "2026-07-18T10:00:00.000Z",
    submittedAt: "2026-07-10T04:00:00.000Z",
    lastActivityAt: "2026-07-12T04:00:00.000Z",
    nextAction: "รออนุมัติแบบคู่ขนาน",
    documents: [
      {
        id: "doc-1",
        documentType: "Project Proposal",
        latestVersion: {
          id: "doc-version-1",
          documentId: "doc-1",
          versionNumber: 2,
          originalFileName: "proposal-v2.pdf",
          mimeType: "application/pdf",
          fileSize: 428000,
          sha256Hash: "7f3d8bb8c7b7f4a531f5f5b8e1dd8cc459f8a8f6210a0b65df1c9ec3b8b12222",
          active: true,
          revisionNote: "แก้ไขวัตถุประสงค์ตามข้อเสนอแนะ",
          uploadedAt: "2026-07-12T04:00:00.000Z",
          uploadedBy: student
        },
        versions: []
      }
    ],
    comments: [],
    workflow: [
      {
        id: "step-1",
        name: "Advisor and Finance",
        order: 1,
        mode: "parallel",
        status: "in_progress",
        completionRule: "all",
        minimumApprovals: null,
        certificationRequired: true,
        commentsRequired: false,
        revisionAllowed: true,
        dueAt: "2026-07-18T10:00:00.000Z",
        approvers: [
          {
            id: "assignment-1",
            profile: advisor,
            status: "opened",
            assignedAt: "2026-07-12T04:00:00.000Z",
            firstOpenedAt: "2026-07-13T04:00:00.000Z",
            dueAt: "2026-07-18T10:00:00.000Z",
            reminderCount: 1,
            escalationLevel: 0
          },
          {
            id: "assignment-2",
            profile: finance,
            status: "waiting",
            assignedAt: "2026-07-12T04:00:00.000Z",
            dueAt: "2026-07-18T10:00:00.000Z",
            reminderCount: 2,
            escalationLevel: 0
          }
        ]
      },
      {
        id: "step-2",
        name: "Program Director",
        order: 2,
        mode: "sequential",
        status: "waiting",
        completionRule: "any",
        minimumApprovals: null,
        certificationRequired: true,
        commentsRequired: false,
        revisionAllowed: true,
        approvers: [
          {
            id: "assignment-3",
            profile: director,
            status: "waiting",
            reminderCount: 0,
            escalationLevel: 0
          }
        ]
      }
    ]
  }
];
