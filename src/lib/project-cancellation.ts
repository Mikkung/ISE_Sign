import type { ProjectStatus, UserRole } from "./types";

export const cancellableProjectStatuses: ProjectStatus[] = [
  "draft",
  "submitted",
  "staff_review",
  "revision_required",
  "staff_approved",
  "approval_pending",
  "partially_approved"
];

export const finalProjectStatuses: ProjectStatus[] = ["completed", "rejected", "cancelled"];

export function canCancelProject(input: {
  role: UserRole;
  userId: string;
  studentId: string;
  status: ProjectStatus;
}) {
  if (input.status === "cancelled") {
    return { ok: true as const, alreadyCancelled: true };
  }

  if (!cancellableProjectStatuses.includes(input.status)) {
    return { ok: false as const, message: "This project can no longer be cancelled." };
  }

  if (input.role === "admin") {
    return { ok: true as const, alreadyCancelled: false };
  }

  if (input.role === "student" && input.userId === input.studentId) {
    return { ok: true as const, alreadyCancelled: false };
  }

  return { ok: false as const, message: "You are not authorized to cancel this project." };
}

export function validateCancellationReason(value: FormDataEntryValue | null) {
  const reason = String(value ?? "").trim();

  if (reason.length < 5) {
    return { ok: false as const, message: "Provide a cancellation reason." };
  }

  return { ok: true as const, reason: reason.slice(0, 500) };
}
