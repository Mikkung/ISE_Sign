import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canCancelProject, validateCancellationReason } from "./project-cancellation";

const cancellationRpcMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/010_project_cancellation_rpc.sql"),
  "utf8"
);
const originalSchema = readFileSync(
  join(process.cwd(), "supabase/migrations/001_approval_workflow_schema.sql"),
  "utf8"
);

describe("project cancellation rules", () => {
  it("allows a Student to cancel their own draft", () => {
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "draft" }).ok).toBe(true);
  });

  it("allows a Student to cancel their own submitted project", () => {
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "submitted" }).ok).toBe(true);
  });

  it("allows a Student to cancel during Staff Review and Faculty Approval", () => {
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "staff_review" }).ok).toBe(true);
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "approval_pending" }).ok).toBe(true);
  });

  it("denies cross-student cancellation", () => {
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u2", status: "submitted" }).ok).toBe(false);
  });

  it("does not allow completed or rejected projects to be cancelled", () => {
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "completed" }).ok).toBe(false);
    expect(canCancelProject({ role: "student", userId: "u1", studentId: "u1", status: "rejected" }).ok).toBe(false);
  });

  it("allows Admin to cancel any eligible active project", () => {
    expect(canCancelProject({ role: "admin", userId: "admin", studentId: "u1", status: "partially_approved" }).ok).toBe(true);
  });

  it("denies Staff and Faculty Approver cancellation", () => {
    expect(canCancelProject({ role: "staff", userId: "staff", studentId: "u1", status: "submitted" }).ok).toBe(false);
    expect(canCancelProject({ role: "approver", userId: "faculty", studentId: "u1", status: "approval_pending" }).ok).toBe(false);
  });

  it("treats repeated cancellation as idempotent", () => {
    expect(canCancelProject({ role: "admin", userId: "admin", studentId: "u1", status: "cancelled" })).toEqual({
      ok: true,
      alreadyCancelled: true
    });
  });

  it("requires a cancellation reason", () => {
    expect(validateCancellationReason("")).toEqual({ ok: false, message: "Provide a cancellation reason." });
    expect(validateCancellationReason("Changed scope").ok).toBe(true);
  });
});

describe("project cancellation RPC migration", () => {
  it("adds one authenticated security-definer RPC without changing general project RLS", () => {
    expect(cancellationRpcMigration).toContain("create or replace function public.cancel_project(");
    expect(cancellationRpcMigration).toContain("p_project_id uuid");
    expect(cancellationRpcMigration).toContain("p_reason text");
    expect(cancellationRpcMigration).toContain("security definer");
    expect(cancellationRpcMigration).toContain("set search_path = public");
    expect(cancellationRpcMigration).toContain("revoke all on function public.cancel_project(uuid, text) from public");
    expect(cancellationRpcMigration).toContain("revoke all on function public.cancel_project(uuid, text) from anon");
    expect(cancellationRpcMigration).toContain("grant execute on function public.cancel_project(uuid, text) to authenticated");
    expect(cancellationRpcMigration).not.toContain("create policy");
    expect(originalSchema).toContain("with check (\n  student_id = auth.uid() and status in ('draft', 'submitted', 'revision_required')\n)");
  });

  it("locks the project and scopes workflow and assignment updates", () => {
    expect(cancellationRpcMigration).toContain("for update");
    expect(cancellationRpcMigration).toContain("where step.project_id = p_project_id");
    expect(cancellationRpcMigration).toContain("where assignment.id in");
    expect(cancellationRpcMigration).toContain("where step.project_id = p_project_id");
    expect(cancellationRpcMigration).toContain("where id = p_project_id");
    expect(cancellationRpcMigration).toContain("status = 'cancelled'::public.project_status");
    expect(cancellationRpcMigration).toContain("status = 'skipped'::public.workflow_step_status");
    expect(cancellationRpcMigration).toContain("status = 'cancelled'");
  });

  it("preserves historical approvals and documents by not deleting them", () => {
    expect(cancellationRpcMigration).not.toMatch(/delete\s+from\s+public\.approval_actions/i);
    expect(cancellationRpcMigration).not.toMatch(/delete\s+from\s+public\.project_document_versions/i);
    expect(cancellationRpcMigration).not.toMatch(/delete\s+from\s+public\.project_documents/i);
    expect(cancellationRpcMigration).not.toMatch(/delete\s+from\s+public\.certificates/i);
  });
});
