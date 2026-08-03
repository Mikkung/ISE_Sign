import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/003_student_self_registration.sql"), "utf8");
const projectVerificationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/004_project_requester_verification.sql"),
  "utf8"
);
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
