"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
