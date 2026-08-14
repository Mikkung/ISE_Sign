import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildStudentWorkflowRpcSteps,
  getStudentWorkflowChangeKind,
  simulateSignerOnlyWorkflowSave,
  type ExistingStudentWorkflowStep,
  type StudentWorkflowRpcStep
} from "./student-workflow-persistence";
import type { ResolvedStudentWorkflowStep, StudentWorkflowStepInput } from "./student-workflow";

const staffStep: ExistingStudentWorkflowStep = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Staff Review",
  step_order: 1,
  completion_rule: "any",
  minimum_approvals: null,
  assignee_role: "staff",
  assignment_mode: "any_active_role",
  certification_required: false,
  workflow_assignments: [
    { id: "staff-assignment-1", approver_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { id: "staff-assignment-2", approver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
  ]
};

const facultyStep: ExistingStudentWorkflowStep = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Faculty Approval",
  step_order: 2,
  completion_rule: "any",
  minimum_approvals: null,
  assignee_role: "approver",
  assignment_mode: "any_active_role",
  certification_required: true,
  workflow_assignments: [
    { id: "faculty-assignment-1", approver_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    { id: "faculty-assignment-2", approver_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }
  ]
};

const existing = [staffStep, facultyStep];
const genericWorkflowMigration = readFileSync(join(process.cwd(), "supabase/migrations/012_generic_ordered_workflow.sql"), "utf8");
const preserveWorkflowStepsMigration = readFileSync(join(process.cwd(), "supabase/migrations/013_preserve_student_workflow_steps.sql"), "utf8");
const preserveWorkflowIdsMigration = readFileSync(join(process.cwd(), "supabase/migrations/014_preserve_student_workflow_ids.sql"), "utf8");
const studentWorkflowPageSource = readFileSync(join(process.cwd(), "src/app/projects/[projectId]/workflow/page.tsx"), "utf8");
const studentWorkflowEditorSource = readFileSync(join(process.cwd(), "src/components/student-workflow-editor.tsx"), "utf8");
const projectActionsSource = readFileSync(join(process.cwd(), "src/app/actions/projects.ts"), "utf8");

function requested(overrides: Partial<StudentWorkflowRpcStep>[] = []): StudentWorkflowRpcStep[] {
  const base: StudentWorkflowRpcStep[] = [
    {
      id: staffStep.id,
      name: "Staff Review",
      role: "staff",
      assignmentMode: "any_active_role",
      approverIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      completionRule: "any",
      minimumApprovals: null,
      requiresSignature: false,
      dueAt: null
    },
    {
      id: facultyStep.id,
      name: "Faculty Approval",
      role: "approver",
      assignmentMode: "any_active_role",
      approverIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      completionRule: "any",
      minimumApprovals: null,
      requiresSignature: true,
      dueAt: null
    }
  ];

  return base.map((step, index) => ({ ...step, ...overrides[index] }));
}

describe("student workflow persistence planning", () => {
  it("migrates workflow saves to explicit generic role and assignment semantics", () => {
    expect(genericWorkflowMigration).toContain("add column if not exists assignee_role");
    expect(genericWorkflowMigration).toContain("add column if not exists assignment_mode");
    expect(genericWorkflowMigration).toContain("role_type not in ('staff', 'approver', 'admin')");
    expect(genericWorkflowMigration).toContain("'The workflow must contain at least one approval step.'");
    expect(genericWorkflowMigration).not.toContain("Faculty Approval cannot occur before Staff Review");
    expect(genericWorkflowMigration).not.toContain("At least one Staff Review step is required");
  });

  it("keeps workflow change history immutable when removed steps are deleted", () => {
    expect(preserveWorkflowStepsMigration).toContain("alter table public.workflow_change_log drop constraint");
    expect(preserveWorkflowStepsMigration).toContain("Not an operational foreign key because workflow_change_log is immutable append-only history.");
    expect(preserveWorkflowStepsMigration).not.toMatch(/\bupdate\s+public\.workflow_change_log\b/i);
    expect(preserveWorkflowStepsMigration).not.toMatch(/\bdelete\s+from\s+public\.workflow_change_log\b/i);
    expect(preserveWorkflowStepsMigration).not.toMatch(/disable\s+trigger\s+workflow_change_log_append_only/i);
  });

  it("updates retained workflow steps and deletes only submitted removals", () => {
    expect(preserveWorkflowIdsMigration).toMatch(/update\s+public\.workflow_steps\s+step[\s\S]*where\s+step\.id\s+=\s+input\.step_id[\s\S]*and\s+step\.project_id\s+=\s+p_project_id/i);
    expect(preserveWorkflowIdsMigration).toMatch(/delete\s+from\s+public\.workflow_steps\s+step[\s\S]*step\.project_id\s+=\s+p_project_id[\s\S]*not\s+exists/i);
    expect(preserveWorkflowIdsMigration).not.toMatch(/delete\s+from\s+public\.workflow_steps\s+step\s+where\s+step\.project_id\s+=\s+p_project_id\s*;/i);
  });

  it("guards against accidental workflow step ID loss before structural deletion", () => {
    expect(preserveWorkflowIdsMigration).toContain("v_input_existing_id_count = 0");
    expect(preserveWorkflowIdsMigration).toContain("v_input_step_count <= v_existing_step_count");
    expect(preserveWorkflowIdsMigration).toContain("set step_id = step.id");
    expect(preserveWorkflowIdsMigration).toContain("and step.step_order = input.final_order");
  });

  it("preserves existing workflow step IDs from page data through editor updates", () => {
    expect(studentWorkflowPageSource).toContain("id: step.id");
    expect(studentWorkflowEditorSource).toContain("{ ...step, ...patch }");
    expect(studentWorkflowEditorSource).toContain("<input type=\"hidden\" name=\"workflowJson\" value={workflowJson} />");
  });

  it("logs safe workflow payload diagnostics before the RPC call", () => {
    expect(projectActionsSource).toContain("Student workflow payload before RPC");
    expect(projectActionsSource).toContain("submittedStepsWithIds");
    expect(projectActionsSource).toContain("rpcStepIdPresence");
  });

  it("preserves workflow step rows when only the Staff signer changes", () => {
    const saved = simulateSignerOnlyWorkflowSave(existing, requested([
      { approverIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] },
      {}
    ]));

    expect(saved).toHaveLength(2);
    expect(saved[0].id).toBe(staffStep.id);
    expect(saved[0].step_order).toBe(1);
    expect(saved[1].id).toBe(facultyStep.id);
    expect(saved[1].step_order).toBe(2);
    expect(saved[0].workflow_assignments).toEqual([
      { id: "staff-assignment-2", approver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
    ]);
    expect(saved[1].workflow_assignments).toEqual(facultyStep.workflow_assignments);
  });

  it("preserves workflow step rows when only the Faculty signer changes", () => {
    const saved = simulateSignerOnlyWorkflowSave(existing, requested([
      {},
      { approverIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] }
    ]));

    expect(saved[0].id).toBe(staffStep.id);
    expect(saved[0].step_order).toBe(1);
    expect(saved[1].id).toBe(facultyStep.id);
    expect(saved[1].step_order).toBe(2);
    expect(saved[0].workflow_assignments).toEqual(staffStep.workflow_assignments);
    expect(saved[1].workflow_assignments).toEqual([
      { id: "faculty-assignment-1", approver_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }
    ]);
  });

  it("treats Staff pool to specific signer as signer-only", () => {
    expect(getStudentWorkflowChangeKind(existing, requested([
      { approverIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] },
      {}
    ]))).toBe("signer_only");
  });

  it("treats Staff specific signer back to pool as signer-only", () => {
    const oneStaff = [{
      ...staffStep,
      workflow_assignments: [{ id: "staff-assignment-1", approver_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]
    }, facultyStep];

    const saved = simulateSignerOnlyWorkflowSave(oneStaff, requested());

    expect(saved[0].workflow_assignments).toEqual([
      { id: "staff-assignment-1", approver_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { id: `new:${staffStep.id}:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, approver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
    ]);
  });

  it("treats Faculty pool to one Faculty Approver as signer-only", () => {
    expect(getStudentWorkflowChangeKind(existing, requested([
      {},
      { approverIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"] }
    ]))).toBe("signer_only");
  });

  it("allows completion rule changes without structural replacement", () => {
    const saved = simulateSignerOnlyWorkflowSave(existing, requested([
      { completionRule: "all" },
      {}
    ]));

    expect(saved[0].id).toBe(staffStep.id);
    expect(saved[0].step_order).toBe(1);
    expect(saved[0].completion_rule).toBe("all");
  });

  it("allows due date changes without structural replacement", () => {
    const saved = simulateSignerOnlyWorkflowSave(existing, requested([
      { dueAt: "2026-09-01" },
      {}
    ]));

    expect(saved[0].id).toBe(staffStep.id);
    expect(saved[0].step_order).toBe(1);
    expect(saved[0].due_at).toBe("2026-09-01");
  });

  it("routes added, removed, reordered, and restored steps through structural replacement", () => {
    expect(getStudentWorkflowChangeKind(existing, [
      requested()[0],
      {
        id: null,
        name: "Extra Staff Review",
        role: "staff",
        assignmentMode: "specific_users",
        approverIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        completionRule: "any",
        minimumApprovals: null,
        requiresSignature: false,
        dueAt: null
      },
      requested()[1]
    ])).toBe("structural");

    expect(getStudentWorkflowChangeKind(existing, [requested()[0]])).toBe("structural");
    expect(getStudentWorkflowChangeKind(existing, [requested()[1], requested()[0]])).toBe("structural");
    expect(getStudentWorkflowChangeKind(existing, requested(), "restore_default")).toBe("structural");
  });

  it("keeps final signer-only orders contiguous without duplicate step orders", () => {
    const saved = simulateSignerOnlyWorkflowSave(existing, requested([
      { name: "Staff Review Updated" },
      { name: "Faculty Approval Updated" }
    ]));

    expect(saved.map((step) => step.step_order)).toEqual([1, 2]);
    expect(new Set(saved.map((step) => step.step_order)).size).toBe(2);
  });

  it("preserves existing step IDs in the normalized RPC payload", () => {
    const submitted: StudentWorkflowStepInput[] = [
      {
        id: staffStep.id,
        name: "Staff Review",
        role: "staff",
        selectionMode: "specific_users",
        approverIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        completionRule: "any",
        minimumApprovals: null,
        requiresSignature: false,
        dueAt: null
      }
    ];
    const resolved: ResolvedStudentWorkflowStep[] = [
      {
        name: "Staff Review",
        role: "staff",
        assignmentMode: "specific_users",
        approverIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        completionRule: "any",
        minimumApprovals: null,
        requiresSignature: false,
        dueAt: null
      }
    ];

    expect(buildStudentWorkflowRpcSteps(submitted, resolved)[0].id).toBe(staffStep.id);
  });
});
