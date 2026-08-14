import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testDataToolsEnabled } from "./test-data-cleanup";
import { testDataCleanupConfirmation } from "./test-data-cleanup-shared";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/011_admin_test_project_cleanup.sql"), "utf8");
const adminActions = readFileSync(join(process.cwd(), "src/app/actions/admin.ts"), "utf8");
const adminPage = readFileSync(join(process.cwd(), "src/app/admin/test-data/page.tsx"), "utf8");
const clientComponent = readFileSync(join(process.cwd(), "src/components/admin/test-data-cleanup-client.tsx"), "utf8");
const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

describe("test data cleanup guardrails", () => {
  it("keeps the cleanup tool behind an explicit environment flag", () => {
    const previous = process.env.ENABLE_TEST_DATA_TOOLS;
    delete process.env.ENABLE_TEST_DATA_TOOLS;
    expect(testDataToolsEnabled()).toBe(false);
    process.env.ENABLE_TEST_DATA_TOOLS = "false";
    expect(testDataToolsEnabled()).toBe(false);
    process.env.ENABLE_TEST_DATA_TOOLS = "true";
    expect(testDataToolsEnabled()).toBe(true);
    if (previous === undefined) {
      delete process.env.ENABLE_TEST_DATA_TOOLS;
    } else {
      process.env.ENABLE_TEST_DATA_TOOLS = previous;
    }
    expect(envExample).toContain("ENABLE_TEST_DATA_TOOLS=false");
  });

  it("requires a strong typed confirmation phrase", () => {
    expect(testDataCleanupConfirmation).toBe("DELETE TEST PROJECTS");
    expect(clientComponent).toContain("DELETE TEST PROJECTS");
    expect(adminActions).toContain("testDataCleanupConfirmation");
  });

  it("guards the page and mutation server-side", () => {
    expect(adminPage).toContain("testDataToolsEnabled()");
    expect(adminPage).toContain('profile.role !== "admin"');
    expect(adminActions).toContain("if (!testDataToolsEnabled())");
    expect(adminActions).toContain("await requireAdmin()");
  });

  it("does not expose service-role admin access in the client component", () => {
    expect(clientComponent).not.toContain("createSupabaseAdminClient");
    expect(clientComponent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientComponent).not.toContain("@/lib/test-data-cleanup\"");
  });
});

describe("admin test project cleanup migration", () => {
  it("creates an authenticated Admin-only security-definer RPC", () => {
    expect(migration).toContain("create or replace function public.admin_delete_test_projects(");
    expect(migration).toContain("p_project_ids uuid[]");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("v_actor_role <> 'admin'::public.app_role");
    expect(migration).toContain("revoke all on function public.admin_delete_test_projects(uuid[]) from public");
    expect(migration).toContain("revoke all on function public.admin_delete_test_projects(uuid[]) from anon");
    expect(migration).toContain("grant execute on function public.admin_delete_test_projects(uuid[]) to authenticated");
  });

  it("deletes only explicitly selected project rows and project-scoped dependencies", () => {
    expect(migration).toContain("from unnest(p_project_ids)");
    expect(migration).toContain("join cleanup_selected_projects selected on selected.project_id = project.id");
    expect(migration).toContain("delete from public.projects project");
    expect(migration).toContain("where exists (select 1 from cleanup_projects selected where selected.id = project.id)");
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.student_directory/i);
    expect(migration).not.toMatch(/delete\s+from\s+auth\./i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.user_signature_assets/i);
  });

  it("handles restrictive append-only history tables explicitly", () => {
    expect(migration).toContain("disable trigger approval_signature_stamps_append_only");
    expect(migration).toContain("disable trigger approval_actions_append_only");
    expect(migration).toContain("disable trigger certificates_append_only");
    expect(migration).toContain("disable trigger audit_logs_append_only");
    expect(migration).toContain("enable trigger approval_signature_stamps_append_only");
    expect(migration).toContain("enable trigger audit_logs_append_only");
  });

  it("records one surviving Admin maintenance audit event", () => {
    expect(migration).toContain("'admin.test_projects_deleted'");
    expect(migration).toContain("'admin_maintenance'");
    expect(migration).toContain("'deletedProjectIds'");
    expect(migration).toContain("'performedBy'");
  });
});
