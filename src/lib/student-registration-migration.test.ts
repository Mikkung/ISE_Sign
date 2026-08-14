import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/003_student_self_registration.sql"), "utf8");
const projectVerificationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/004_project_requester_verification.sql"),
  "utf8"
);
const authenticatedStudentProjectMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/005_authenticated_student_project_requester.sql"),
  "utf8"
);
const projectsActionSource = readFileSync(join(process.cwd(), "src/app/actions/projects.ts"), "utf8");
const createProjectPageSource = readFileSync(join(process.cwd(), "src/app/projects/new/page.tsx"), "utf8");
const createProjectFormSource = readFileSync(join(process.cwd(), "src/app/projects/new/create-project-form.tsx"), "utf8");
const originalSchema = readFileSync(join(process.cwd(), "supabase/migrations/001_approval_workflow_schema.sql"), "utf8");

describe("student self-registration migration", () => {
  it("creates an admin-managed allowlist for non-student provisioning", () => {
    expect(migration).toContain("create table if not exists public.auth_registration_allowlist");
    expect(migration).toContain("intended_role public.app_role not null");
    expect(migration).toContain("intended_role in ('staff', 'approver', 'admin')");
    expect(migration).toContain("alter table public.auth_registration_allowlist enable row level security");
    expect(migration).toContain("using (public.is_admin())");
  });

  it("keeps the allowlist closed to anonymous users", () => {
    expect(migration).toContain("revoke all on public.auth_registration_allowlist from anon");
    expect(migration).toContain("revoke all on public.auth_registration_allowlist from public");
    expect(migration).toContain("grant select, insert, update, delete on public.auth_registration_allowlist to authenticated");
  });

  it("adds a before-user-created hook with exact student-domain enforcement", () => {
    expect(migration).toContain("create or replace function public.hook_restrict_student_self_registration(event jsonb)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("public.is_exact_student_chula_email(normalized_email)");
    expect(migration).toContain("Self-registration is available only for Chulalongkorn University student email accounts.");
    expect(migration).toContain("grant execute on function public.hook_restrict_student_self_registration(jsonb) to supabase_auth_admin");
    expect(migration).toContain(
      "revoke execute on function public.hook_restrict_student_self_registration(jsonb) from anon, authenticated, public"
    );
  });

  it("uses an exact SQL email check that rejects deceptive domains", () => {
    expect(migration).toContain("^[^[:space:]@]+@student\\.chula\\.ac\\.th$");
    expect(migration).toContain("regexp_split_to_array(lower(btrim(candidate)), '@')");
  });

  it("creates student profiles without trusting role metadata or overwriting existing profiles", () => {
    expect(migration).toContain("create or replace function public.handle_new_auth_user()");
    expect(migration).toContain("new.raw_user_meta_data ->> 'display_name'");
    expect(migration).toContain("'student'");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toContain("new.raw_user_meta_data ->> 'role'");
  });

  it("preserves the existing no-self-role-update profile policy", () => {
    expect(originalSchema).toContain('create policy "profiles admin manage" on public.profiles for all');
    expect(originalSchema).not.toMatch(/profiles[^"]*self[^"]*update/i);
  });
});

describe("student OTP project submission migration", () => {
  it("replaces project submission checks to use the authenticated directory snapshot", () => {
    expect(authenticatedStudentProjectMigration).toContain("create or replace function public.validate_project_submission_requester()");
    expect(authenticatedStudentProjectMigration).toContain("Authenticated requester identity is required before submission.");
    expect(authenticatedStudentProjectMigration).toContain("Authenticated requester does not match the project owner.");
    expect(authenticatedStudentProjectMigration).toContain("directory_row public.student_directory%rowtype");
    expect(authenticatedStudentProjectMigration).toContain("new.student_id is null");
    expect(authenticatedStudentProjectMigration).toContain("directory_row.first_name <> new.requester_first_name");
    expect(authenticatedStudentProjectMigration).toContain("directory_row.last_name <> new.requester_last_name");
    expect(authenticatedStudentProjectMigration).not.toContain("student_email_verifications%rowtype");
    expect(authenticatedStudentProjectMigration).not.toContain("new.student_email_verification_id is null");
  });

  it("keeps requester snapshots immutable after submission", () => {
    expect(projectVerificationMigration).toContain("prevent_project_requester_identity_changes");
    expect(projectVerificationMigration).toContain("Requester identity cannot be changed after submission.");
  });
});

describe("authenticated student project creation source", () => {
  it("does not depend on project-level verification code actions or query params", () => {
    expect(projectsActionSource).not.toContain("sendStudentProjectVerificationCodeAction");
    expect(projectsActionSource).not.toContain("verifyStudentProjectEmailCodeAction");
    expect(createProjectPageSource).not.toContain("verificationId");
    expect(createProjectFormSource).not.toContain("verificationId");
    expect(createProjectFormSource).not.toContain('name="studentEmail"');
  });

  it("writes the requester snapshot from server-side authenticated identity", () => {
    expect(projectsActionSource).toContain("requireAuthenticatedStudentRequester");
    expect(projectsActionSource).toContain("student_id: user.id");
    expect(projectsActionSource).toContain("student_directory_id: requester.directoryId");
    expect(projectsActionSource).toContain("student_email_verification_id: null");
    expect(projectsActionSource).toContain("requester_student_id: requester.studentId");
    expect(projectsActionSource).toContain("requester_email: requester.email");
    expect(projectsActionSource).toContain("requester_auth_user_id: user.id");
  });

  it("validates submit attachments before creating the project and cleans up failed creation side effects", () => {
    const attachmentValidationIndex = projectsActionSource.indexOf("validateProjectAttachments");
    const projectInsertIndex = projectsActionSource.indexOf(".from(\"projects\")\n      .insert");

    expect(attachmentValidationIndex).toBeGreaterThan(-1);
    expect(projectInsertIndex).toBeGreaterThan(-1);
    expect(attachmentValidationIndex).toBeLessThan(projectInsertIndex);
    expect(projectsActionSource).toContain("cleanupFailedNewProject");
    expect(projectsActionSource).toContain(".storage.from(\"project-documents\").remove");
    expect(projectsActionSource).toContain(".from(\"projects\").delete()");
  });
});

describe("project requester verification migration", () => {
  it("creates a student directory with exact email and prefix constraints", () => {
    expect(projectVerificationMigration).toContain("create table if not exists public.student_directory");
    expect(projectVerificationMigration).toContain("student_directory_email_exact_domain");
    expect(projectVerificationMigration).toContain("student_directory_email_prefix_matches_id");
    expect(projectVerificationMigration).toContain("split_part(email, '@', 1) = student_id");
  });

  it("creates a private hashed verification table", () => {
    expect(projectVerificationMigration).toContain("create table if not exists public.student_email_verifications");
    expect(projectVerificationMigration).toContain("code_hash text not null");
    expect(projectVerificationMigration).toContain("attempt_count integer not null default 0");
    expect(projectVerificationMigration).toContain("max_attempts integer not null default 5");
    expect(projectVerificationMigration).toContain("expires_at timestamptz not null");
    expect(projectVerificationMigration).toContain("session_fingerprint text");
    expect(projectVerificationMigration).toContain("revoke all on public.student_email_verifications from authenticated");
  });

  it("adds project fields and immutable requester snapshot columns", () => {
    expect(projectVerificationMigration).toContain("add column if not exists project_type_category text");
    expect(projectVerificationMigration).toContain("add column if not exists start_date date");
    expect(projectVerificationMigration).toContain("add column if not exists end_date date");
    expect(projectVerificationMigration).toContain("add column if not exists requester_student_id text");
    expect(projectVerificationMigration).toContain("add column if not exists requester_verified_at timestamptz");
    expect(projectVerificationMigration).toContain("prevent_project_requester_identity_changes");
    expect(projectVerificationMigration).toContain("Requester identity cannot be changed after submission.");
  });

  it("enforces verified requester identity before submission", () => {
    expect(projectVerificationMigration).toContain("validate_project_submission_requester");
    expect(projectVerificationMigration).toContain("Verified requester identity is required before submission.");
    expect(projectVerificationMigration).toContain("A valid unconsumed student email verification is required before submission.");
  });
});
