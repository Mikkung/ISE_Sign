import type {
  ReminderAssignmentState,
  ReminderCommand,
  ReminderEventType,
  ReminderPolicy
} from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const defaultReminderPolicy: ReminderPolicy = {
  unopenedAfterDays: 2,
  noActionAfterDays: 4,
  staffNoticeAfterDays: 7,
  escalationAfterDays: 10,
  repeatEscalationEveryDays: 3,
  dueSoonBeforeDays: 1
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function shouldSendByInterval(
  assignment: ReminderAssignmentState,
  now: Date,
  eventType: ReminderEventType,
  minIntervalDays = 1
): boolean {
  if (!assignment.lastReminderAt) {
    return true;
  }

  if (assignment.lastReminderType !== eventType) {
    return true;
  }

  return daysBetween(assignment.lastReminderAt, now) >= minIntervalDays;
}

export function buildReminderDedupeKey(
  assignmentId: string,
  eventType: ReminderEventType,
  now: Date
): string {
  const dateKey = now.toISOString().slice(0, 10);
  return `${assignmentId}:${eventType}:${dateKey}`;
}

export function reminderCommandsForAssignment(
  assignment: ReminderAssignmentState,
  policy: ReminderPolicy,
  now = new Date()
): ReminderCommand[] {
  if (assignment.status && !["waiting", "opened"].includes(assignment.status)) {
    return [];
  }

  if (assignment.completedAt) {
    return [];
  }

  const ageDays = daysBetween(assignment.assignedAt, now);
  const commands: ReminderCommand[] = [];

  const push = (type: ReminderEventType, message: string, intervalDays = 1) => {
    if (!shouldSendByInterval(assignment, now, type, intervalDays)) {
      return;
    }

    commands.push({
      assignmentId: assignment.assignmentId,
      type,
      channel: "in_app",
      dedupeKey: `${buildReminderDedupeKey(assignment.assignmentId, type, now)}:in_app`,
      message
    });
    commands.push({
      assignmentId: assignment.assignmentId,
      type,
      channel: "email",
      dedupeKey: `${buildReminderDedupeKey(assignment.assignmentId, type, now)}:email`,
      message
    });
  };

  if (ageDays === 0 && assignment.reminderCount === 0) {
    push("initial_notification", "มีงานอนุมัติใหม่รอการดำเนินการ");
    return commands;
  }

  if (!assignment.firstOpenedAt && ageDays >= policy.unopenedAfterDays) {
    push("unopened_reminder", "ยังไม่ได้เปิดดูคำขออนุมัติที่ได้รับมอบหมาย");
  }

  if (assignment.firstOpenedAt && ageDays >= policy.noActionAfterDays) {
    push("no_action_reminder", "เปิดดูแล้วแต่ยังไม่ได้ดำเนินการอนุมัติ");
  }

  if (assignment.dueAt) {
    const daysUntilDue = daysBetween(now, assignment.dueAt);
    if (daysUntilDue <= policy.dueSoonBeforeDays && daysUntilDue >= 0) {
      push("due_soon", "คำขออนุมัติใกล้ครบกำหนด");
    }

    if (now > assignment.dueAt) {
      push("overdue", "คำขออนุมัติเกินกำหนดแล้ว");
    }
  }

  if (ageDays >= policy.staffNoticeAfterDays) {
    push("staff_notice", "แจ้งเจ้าหน้าที่ว่าคำขอยังไม่ถูกดำเนินการ");
  }

  if (ageDays >= policy.escalationAfterDays && assignment.escalationLevel === 0) {
    push("escalation", "ยกระดับคำขออนุมัติไปยังผู้กำกับดูแล");
  }

  if (assignment.escalationLevel > 0 && ageDays >= policy.escalationAfterDays) {
    push("repeat_escalation", "แจ้งเตือนซ้ำหลังการยกระดับ", policy.repeatEscalationEveryDays);
  }

  return commands;
}

export function filterAlreadyLoggedCommands(
  commands: ReminderCommand[],
  existingDedupeKeys: string[]
): ReminderCommand[] {
  const existing = new Set(existingDedupeKeys);
  return commands.filter((command) => !existing.has(command.dedupeKey));
}
