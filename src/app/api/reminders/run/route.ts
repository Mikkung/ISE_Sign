import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/email";
import {
  defaultReminderPolicy,
  filterAlreadyLoggedCommands,
  reminderCommandsForAssignment
} from "@/lib/reminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationChannel, ReminderEventType, ReminderPolicy } from "@/lib/types";

type ReminderPolicyRow = {
  unopened_after_days: number;
  no_action_after_days: number;
  staff_notice_after_days: number;
  escalation_after_days: number;
  repeat_escalation_every_days: number;
  due_soon_before_days: number;
} | null;
type ReminderRecipient = {
  id: string;
  display_name?: string | null;
  email?: string | null;
};
type ReminderAssignmentRow = {
  id: string;
  approver_id: string;
  assigned_at: string;
  first_opened_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  last_reminder_at: string | null;
  last_reminder_type: ReminderEventType | null;
  reminder_count: number | null;
  escalation_level: number | null;
  status: string;
  approver: ReminderRecipient | null;
  step: {
    id: string;
    name: string | null;
    status: string;
    due_at: string | null;
    project: {
      id: string;
      title: string | null;
      assigned_staff: ReminderRecipient | null;
    } | null;
  } | null;
};
type DedupeLogRow = { dedupe_key: string };

function policyFromRow(row: ReminderPolicyRow): ReminderPolicy {
  if (!row) {
    return defaultReminderPolicy;
  }

  return {
    unopenedAfterDays: row.unopened_after_days,
    noActionAfterDays: row.no_action_after_days,
    staffNoticeAfterDays: row.staff_notice_after_days,
    escalationAfterDays: row.escalation_after_days,
    repeatEscalationEveryDays: row.repeat_escalation_every_days,
    dueSoonBeforeDays: row.due_soon_before_days
  };
}

function commandSubject(type: ReminderEventType): string {
  switch (type) {
    case "initial_notification":
      return "New approval assignment";
    case "unopened_reminder":
      return "Approval assignment has not been opened";
    case "no_action_reminder":
      return "Approval assignment is waiting for a decision";
    case "due_soon":
      return "Approval assignment is approaching its due date";
    case "overdue":
      return "Approval assignment is overdue";
    case "staff_notice":
      return "Assigned approval needs staff attention";
    case "escalation":
    case "repeat_escalation":
      return "Approval assignment escalation";
  }
}

function recipientForCommand(row: ReminderAssignmentRow, type: ReminderEventType) {
  const staff = row.step?.project?.assigned_staff;

  if (["staff_notice", "escalation", "repeat_escalation"].includes(type) && staff?.id) {
    return staff;
  }

  return row.approver;
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.SCHEDULER_SECRET || token !== process.env.SCHEDULER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      processed: 0,
      warning: "Supabase service role configuration is missing; reminder run was not executed."
    });
  }

  const { data: policyRow, error: policyError } = await supabase
    .from("reminder_rules")
    .select("unopened_after_days, no_action_after_days, staff_notice_after_days, escalation_after_days, repeat_escalation_every_days, due_soon_before_days")
    .eq("is_default", true)
    .maybeSingle();

  if (policyError) {
    return NextResponse.json({ error: policyError.message }, { status: 500 });
  }

  const { data: assignments, error } = await supabase
    .from("workflow_assignments")
    .select(`
      id,
      approver_id,
      assigned_at,
      first_opened_at,
      completed_at,
      due_at,
      last_reminder_at,
      last_reminder_type,
      reminder_count,
      escalation_level,
      status,
      approver:profiles!workflow_assignments_approver_id_fkey(id, display_name, email),
      step:workflow_steps!workflow_assignments_workflow_step_id_fkey(
        id,
        name,
        status,
        due_at,
        project:projects!workflow_steps_project_id_fkey(
          id,
          title,
          assigned_staff:profiles!projects_assigned_staff_id_fkey(id, display_name, email)
        )
      )
    `)
    .is("completed_at", null)
    .in("status", ["waiting", "opened"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const policy = policyFromRow(policyRow as ReminderPolicyRow);
  const candidateRows = ((assignments ?? []) as unknown as ReminderAssignmentRow[]).filter((row) => row.step?.status === "in_progress" && row.step.project);
  const commandsByAssignment = candidateRows.map((row) => {
    const commands = reminderCommandsForAssignment(
      {
        assignmentId: row.id,
        projectId: row.step?.project?.id ?? "",
        stepId: row.step?.id ?? "",
        approverId: row.approver_id,
        assignedAt: new Date(row.assigned_at),
        firstOpenedAt: row.first_opened_at ? new Date(row.first_opened_at) : null,
        completedAt: row.completed_at ? new Date(row.completed_at) : null,
        dueAt: row.due_at || row.step?.due_at ? new Date(row.due_at ?? row.step?.due_at ?? "") : null,
        lastReminderAt: row.last_reminder_at ? new Date(row.last_reminder_at) : null,
        lastReminderType: row.last_reminder_type,
        reminderCount: row.reminder_count ?? 0,
        escalationLevel: row.escalation_level ?? 0
      },
      policy,
      now
    );

    return { row, commands };
  });
  const allDedupeKeys = commandsByAssignment.flatMap(({ commands }) =>
    commands.map((command) => command.dedupeKey)
  );
  const { data: existingLogs } =
    allDedupeKeys.length > 0
      ? await supabase.from("notification_logs").select("dedupe_key").in("dedupe_key", allDedupeKeys)
      : { data: [] };
  const existingDedupeKeys = ((existingLogs ?? []) as DedupeLogRow[]).map((log) => log.dedupe_key);
  const emailProvider = createEmailProvider();
  let processed = 0;
  let emailSent = 0;
  let emailSkipped = 0;
  let emailFailed = 0;

  for (const { row, commands } of commandsByAssignment) {
    const pendingCommands = filterAlreadyLoggedCommands(commands, existingDedupeKeys);
    const completedTypes = new Set<ReminderEventType>();

    for (const command of pendingCommands) {
      const recipient = recipientForCommand(row, command.type);

      if (!recipient?.id) {
        continue;
      }

      const subject = commandSubject(command.type);
      let status = "sent";
      let sentAt: string | null = now.toISOString();
      let errorMessage: string | null = null;

      if (command.channel === "email") {
        if (!recipient.email) {
          status = "skipped";
          sentAt = null;
          errorMessage = "Recipient has no email address.";
          emailSkipped += 1;
        } else {
          try {
            const result = await emailProvider.send({
              to: recipient.email,
              subject,
              text: command.message,
              html: `<p>${command.message}</p>`
            });
            status = result.sent ? "sent" : "skipped";
            sentAt = result.sent ? now.toISOString() : null;
            errorMessage = result.warning ?? null;
            emailSent += result.sent ? 1 : 0;
            emailSkipped += result.sent ? 0 : 1;
          } catch (sendError) {
            status = "failed";
            sentAt = null;
            errorMessage = sendError instanceof Error ? sendError.message : "Email delivery failed.";
            emailFailed += 1;
          }
        }
      }

      const { data: log } = await supabase
        .from("notification_logs")
        .upsert(
          {
            recipient_id: recipient.id,
            project_id: row.step?.project?.id,
            assignment_id: row.id,
            channel: command.channel as NotificationChannel,
            type: command.type,
            subject,
            body: command.message,
            status,
            error: errorMessage,
            sent_at: sentAt,
            dedupe_key: command.dedupeKey
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      await supabase.from("reminder_events").upsert(
        {
          assignment_id: row.id,
          event_type: command.type,
          channel: command.channel,
          notification_log_id: log?.id ?? null,
          dedupe_key: command.dedupeKey
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

      completedTypes.add(command.type);
      processed += 1;
    }

    if (completedTypes.size > 0) {
      const escalationBump = [...completedTypes].some((type) =>
        ["escalation", "repeat_escalation"].includes(type)
      )
        ? 1
        : 0;

      await supabase
        .from("workflow_assignments")
        .update({
          last_reminder_at: now.toISOString(),
          last_reminder_type: [...completedTypes][0],
          reminder_count: (row.reminder_count ?? 0) + completedTypes.size,
          escalation_level: (row.escalation_level ?? 0) + escalationBump
        })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    processed,
    assignmentsChecked: candidateRows.length,
    emailSent,
    emailSkipped,
    emailFailed
  });
}
