import { z } from "zod";
import { STUDENT_EMAIL_DOMAIN, isValidStudentEmail, normalizeEmail } from "./student-registration";

export const academicPrograms = ["ADME", "AERO", "ICE", "ROBOTICS&AI", "SEMI", "NANO"] as const;
export const projectTypeCategories = [
  "CSR Trip",
  "Open House",
  "First Meet",
  "Sports Competition",
  "Academic Competition",
  "Other"
] as const;
export const allowedAttachmentMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg"
] as const;
export const maxAttachmentBytes = 52_428_800;
export const projectAttachmentFieldName = "attachments";
export const missingSubmissionAttachmentMessage =
  "Add at least one attachment before submitting the project. You can save it as a draft without an attachment.";

export type AcademicProgram = (typeof academicPrograms)[number];
export type ProjectTypeCategory = (typeof projectTypeCategories)[number];
export interface ProjectAttachmentMetadata {
  name: string;
  size: number;
  type: string;
}
export type ProjectAttachmentValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };
export type ProjectAttachmentMetadataValidationResult =
  | { ok: true; files: ProjectAttachmentMetadata[] }
  | { ok: false; message: string };

export const projectRequestSchema = z
  .object({
    title: z.string().trim().min(3, "Project title must be at least 3 characters."),
    abstract: z.string().trim().optional(),
    academicProgram: z
      .preprocess((value) => (value === "" ? undefined : value), z.enum(academicPrograms).optional()),
    projectTypeCategory: z.enum(projectTypeCategories, {
      errorMap: () => ({ message: "Project Type is required." })
    }),
    projectTypeCustom: z.string().trim().max(120, "Specify Project Type must be 120 characters or fewer.").optional(),
    startDate: z.string().trim().min(1, "Start Date is required."),
    endDate: z.string().trim().min(1, "End Date is required."),
    intent: z.enum(["draft", "submit"])
  })
  .superRefine((value, ctx) => {
    if (value.projectTypeCategory === "Other" && !value.projectTypeCustom?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectTypeCustom"],
        message: "Specify Project Type is required when Other is selected."
      });
    }

    if (!isDateOnly(value.startDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "Start Date must be a valid date." });
    }

    if (!isDateOnly(value.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End Date must be a valid date." });
    }

    if (isDateOnly(value.startDate) && isDateOnly(value.endDate) && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Start Date must not be later than End Date."
      });
    }

  });

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeOptionalAcademicProgram(value: FormDataEntryValue | null): AcademicProgram | null {
  const program = typeof value === "string" ? value.trim() : "";
  return academicPrograms.includes(program as AcademicProgram) ? (program as AcademicProgram) : null;
}

export function normalizeProjectType(input: {
  category: string;
  custom?: string | null;
}): { category: ProjectTypeCategory; custom: string | null; displayName: string } {
  const category = input.category as ProjectTypeCategory;

  if (!projectTypeCategories.includes(category)) {
    throw new Error("Project Type is required.");
  }

  const custom = input.custom?.trim() ?? "";

  if (category === "Other") {
    if (!custom) {
      throw new Error("Specify Project Type is required when Other is selected.");
    }

    if (custom.length > 120) {
      throw new Error("Specify Project Type must be 120 characters or fewer.");
    }

    return { category, custom, displayName: custom };
  }

  return { category, custom: null, displayName: category };
}

export function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

export function getProjectAttachments(formData: FormData): File[] {
  return formData
    .getAll(projectAttachmentFieldName)
    .filter(isUploadedFile)
    .filter((file) => file.size > 0);
}

export function validateProjectAttachments(input: {
  files: File[];
  requireAttachment: boolean;
}): ProjectAttachmentValidationResult {
  if (input.requireAttachment && input.files.length === 0) {
    return { ok: false, message: missingSubmissionAttachmentMessage };
  }

  if (input.files.some((file) => file.size > maxAttachmentBytes)) {
    return { ok: false, message: "Each attachment must be 50 MB or smaller." };
  }

  if (
    input.files.some(
      (file) => !allowedAttachmentMimeTypes.includes((file.type || "application/octet-stream") as (typeof allowedAttachmentMimeTypes)[number])
    )
  ) {
    return { ok: false, message: "One or more selected files use an unsupported file type." };
  }

  return { ok: true, files: input.files };
}

export function validateProjectAttachmentMetadata(input: {
  files: ProjectAttachmentMetadata[];
  requireAttachment: boolean;
}): ProjectAttachmentMetadataValidationResult {
  const files = input.files.map((file) => ({
    name: file.name,
    size: Number(file.size),
    type: file.type || "application/octet-stream"
  }));

  if (input.requireAttachment && files.length === 0) {
    return { ok: false, message: missingSubmissionAttachmentMessage };
  }

  if (files.some((file) => !file.name.trim() || !Number.isFinite(file.size) || file.size <= 0)) {
    return { ok: false, message: "One or more selected files are invalid." };
  }

  if (files.some((file) => file.size > maxAttachmentBytes)) {
    return { ok: false, message: "Each attachment must be 50 MB or smaller." };
  }

  if (
    files.some(
      (file) => !allowedAttachmentMimeTypes.includes((file.type || "application/octet-stream") as (typeof allowedAttachmentMimeTypes)[number])
    )
  ) {
    return { ok: false, message: "One or more selected files use an unsupported file type." };
  }

  return { ok: true, files };
}

export function getStudentIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${STUDENT_EMAIL_DOMAIN}`) ? normalized.slice(0, -STUDENT_EMAIL_DOMAIN.length - 1) : "";
}

export function validateStudentDirectoryRecord(input: {
  studentId: string;
  email: string;
  isActive?: boolean | null;
}): boolean {
  return (
    Boolean(input.isActive) &&
    isValidStudentEmail(input.email) &&
    normalizeEmail(input.email) === `${input.studentId.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`
  );
}
