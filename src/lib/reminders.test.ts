import { describe, expect, it } from "vitest";
import { defaultReminderPolicy, filterAlreadyLoggedCommands, reminderCommandsForAssignment } from "./reminders";
import type { ReminderAssignmentState } from "./types";

const baseAssignment: ReminderAssignmentState = {
  assignmentId: "assignment-1",
  projectId: "project-1",
  stepId: "step-1",
  approverId: "approver-1",
  assignedAt: new Date("2026-07-01T00:00:00Z"),
  firstOpenedAt: null,
  completedAt: null,
  dueAt: new Date("2026-07-04T00:00:00Z"),
  lastReminderAt: null,
  lastReminderType: null,
  reminderCount: 1,
  escalationLevel: 0
};

describe("reminders", () => {
  it("does not generate unopened reminders before the configured interval", () => {
    const commands = reminderCommandsForAssignment(
      baseAssignment,
      defaultReminderPolicy,
      new Date("2026-07-02T00:00:00Z")
    );

    expect(commands.some((command) => command.type === "unopened_reminder")).toBe(false);
  });

  it("generates unopened reminder after configured interval", () => {
    const commands = reminderCommandsForAssignment(
      baseAssignment,
      defaultReminderPolicy,
      new Date("2026-07-03T00:00:00Z")
    );

    expect(commands.some((command) => command.type === "unopened_reminder")).toBe(true);
  });

  it("does not generate reminders for completed assignments", () => {
    const commands = reminderCommandsForAssignment(
      { ...baseAssignment, completedAt: new Date("2026-07-02T00:00:00Z") },
      defaultReminderPolicy,
      new Date("2026-07-05T00:00:00Z")
    );

    expect(commands).toEqual([]);
  });

  it("does not generate reminders for inactive terminal assignments", () => {
    for (const status of ["rejected", "revision_requested", "invalidated", "cancelled"] as const) {
      const commands = reminderCommandsForAssignment(
        { ...baseAssignment, status },
        defaultReminderPolicy,
        new Date("2026-07-12T00:00:00Z")
      );

      expect(commands).toEqual([]);
    }
  });

  it("filters duplicate reminder dedupe keys", () => {
    const commands = reminderCommandsForAssignment(
      baseAssignment,
      defaultReminderPolicy,
      new Date("2026-07-03T00:00:00Z")
    );
    const existing = [commands[0].dedupeKey];

    expect(filterAlreadyLoggedCommands(commands, existing)).not.toContain(commands[0]);
  });

  it("prevents an immediate second scheduler pass from duplicating reminders", () => {
    const firstRun = reminderCommandsForAssignment(
      baseAssignment,
      defaultReminderPolicy,
      new Date("2026-07-03T00:00:00Z")
    );
    const secondRun = filterAlreadyLoggedCommands(
      reminderCommandsForAssignment(baseAssignment, defaultReminderPolicy, new Date("2026-07-03T00:00:00Z")),
      firstRun.map((command) => command.dedupeKey)
    );

    expect(firstRun.length).toBeGreaterThan(0);
    expect(secondRun).toEqual([]);
  });

  it("generates escalation once the SLA is exceeded", () => {
    const commands = reminderCommandsForAssignment(
      baseAssignment,
      defaultReminderPolicy,
      new Date("2026-07-12T00:00:00Z")
    );

    expect(commands.some((command) => command.type === "escalation")).toBe(true);
  });

  it("calculates repeat escalation stage after escalation has started", () => {
    const commands = reminderCommandsForAssignment(
      {
        ...baseAssignment,
        escalationLevel: 1,
        lastReminderAt: new Date("2026-07-09T00:00:00Z"),
        lastReminderType: "repeat_escalation"
      },
      defaultReminderPolicy,
      new Date("2026-07-12T00:00:00Z")
    );

    expect(commands.some((command) => command.type === "repeat_escalation")).toBe(true);
  });
});
