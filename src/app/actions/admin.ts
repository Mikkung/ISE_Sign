"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveProjectStoragePaths,
  testDataToolsEnabled
} from "@/lib/test-data-cleanup";
import { testDataCleanupConfirmation } from "@/lib/test-data-cleanup-shared";

const projectTypeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional()
});

const reminderRuleSchema = z.object({
  unopenedAfterDays: z.coerce.number().int().min(0),
  noActionAfterDays: z.coerce.number().int().min(0),
  staffNoticeAfterDays: z.coerce.number().int().min(0),
  escalationAfterDays: z.coerce.number().int().min(0),
  repeatEscalationEveryDays: z.coerce.number().int().positive(),
  dueSoonBeforeDays: z.coerce.number().int().min(0)
});

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase environment variables are required.");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication is required.");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || profile?.role !== "admin") {
    throw new Error("Admin role is required.");
  }

  return { supabase, user };
}

function adminTestDataUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/admin/test-data?${search.toString()}`;
}

export async function createProjectTypeAction(formData: FormData) {
  const payload = projectTypeSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase.from("project_types").insert({
    name: payload.name,
    description: payload.description,
    created_by: user.id
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/project-types");
}

export async function updateDefaultReminderRuleAction(formData: FormData) {
  const payload = reminderRuleSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("reminder_rules")
    .update({
      unopened_after_days: payload.unopenedAfterDays,
      no_action_after_days: payload.noActionAfterDays,
      staff_notice_after_days: payload.staffNoticeAfterDays,
      escalation_after_days: payload.escalationAfterDays,
      repeat_escalation_every_days: payload.repeatEscalationEveryDays,
      due_soon_before_days: payload.dueSoonBeforeDays,
      created_by: user.id
    })
    .eq("is_default", true);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/reminder-rules");
}

export async function deleteSelectedTestProjectsAction(formData: FormData) {
  if (!testDataToolsEnabled()) {
    redirect("/unauthorized");
  }

  const { supabase } = await requireAdmin();
  const confirmation = String(formData.get("confirmation") ?? "");
  const selectedProjectIds = [...new Set(formData.getAll("projectIds").map((value) => String(value)))];
  const projectIds = z.array(z.string().uuid()).max(100).safeParse(selectedProjectIds);

  if (!projectIds.success || projectIds.data.length === 0) {
    redirect(adminTestDataUrl({ error: "Select at least one project." }));
  }

  if (confirmation !== testDataCleanupConfirmation) {
    redirect(adminTestDataUrl({ error: "Type DELETE TEST PROJECTS to confirm deletion." }));
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    redirect(adminTestDataUrl({ error: "Server-side cleanup access is not configured." }));
  }

  let storagePaths: string[];

  try {
    storagePaths = await resolveProjectStoragePaths(projectIds.data);
  } catch (error) {
    console.error("Test project cleanup storage preview failed", {
      message: error instanceof Error ? error.message : "Unknown storage preview error"
    });
    redirect(adminTestDataUrl({ error: "Project storage paths could not be resolved." }));
  }

  if (storagePaths.length > 0) {
    const { error: storageError } = await admin.storage.from("project-documents").remove(storagePaths);

    if (storageError) {
      console.error("Test project cleanup storage deletion failed", {
        message: storageError.message,
        objectCount: storagePaths.length
      });
      redirect(adminTestDataUrl({
        error: `Storage cleanup failed before database deletion. ${storagePaths.length} object(s) were left in place for retry.`
      }));
    }
  }

  const { data, error } = await supabase.rpc("admin_delete_test_projects", {
    p_project_ids: projectIds.data
  });

  if (error) {
    console.error("Test project database cleanup failed", {
      code: error.code,
      message: error.message,
      selectedProjectCount: projectIds.data.length,
      storageObjectCount: storagePaths.length
    });
    redirect(adminTestDataUrl({
      error: storagePaths.length > 0
        ? "Storage objects were removed, but database cleanup failed. Retry database cleanup or restore files from backups if needed."
        : "Database cleanup failed. No storage objects were removed."
    }));
  }

  const result = data as { deletedCount?: number } | null;
  const deletedCount = Number(result?.deletedCount ?? 0);

  revalidatePath("/admin/test-data");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/admin/reports");
  redirect(adminTestDataUrl({ message: `${deletedCount} test project${deletedCount === 1 ? "" : "s"} deleted.` }));
}
