import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
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
export const verificationCodeTtlMinutes = 10;
export const verificationCodeCooldownSeconds = 60;
export const verificationCodeMaxAttempts = 5;

export type AcademicProgram = (typeof academicPrograms)[number];
export type ProjectTypeCategory = (typeof projectTypeCategories)[number];

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
    studentEmail: z.string().trim().min(1, "Student Email is required."),
    verificationId: z.string().uuid().optional(),
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

    if (!isValidStudentEmail(value.studentEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentEmail"],
        message: "Enter a valid Chulalongkorn student email address."
      });
    }

    if (value.intent === "submit" && !value.verificationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verificationId"],
        message: "Verify your student email before submitting the project."
      });
    }
  });

export const studentProjectEmailSchema = z
  .string()
  .trim()
  .transform((value) => normalizeEmail(value))
  .refine((value) => isValidStudentEmail(value), "Enter a valid Chulalongkorn student email address.");

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the six-digit verification code.");

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

export function getStudentIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${STUDENT_EMAIL_DOMAIN}`) ? normalized.slice(0, -STUDENT_EMAIL_DOMAIN.length - 1) : "";
}

export function validateStudentEmailForSignedInAccount(input: {
  enteredEmail: unknown;
  signedInEmail?: string | null;
}): { ok: true; email: string; studentId: string } | { ok: false; error: string } {
  const parsed = studentProjectEmailSchema.safeParse(input.enteredEmail);

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid Chulalongkorn student email address." };
  }

  const signedInEmail = normalizeEmail(input.signedInEmail);

  if (parsed.data !== signedInEmail) {
    return { ok: false, error: "Please use the same student email address as your signed-in account." };
  }

  return { ok: true, email: parsed.data, studentId: getStudentIdFromEmail(parsed.data) };
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

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createVerificationSalt(): string {
  return randomUUID();
}

export function hashVerificationCode(code: string, salt: string, pepper: string): string {
  if (!pepper) {
    throw new Error("STUDENT_VERIFICATION_PEPPER is not configured.");
  }

  const digest = createHmac("sha256", pepper).update(`${salt}:${code}`).digest("hex");
  return `${salt}:${digest}`;
}

export function verifyVerificationCodeHash(input: {
  code: string;
  storedHash: string;
  pepper: string;
}): boolean {
  const [salt, expected] = input.storedHash.split(":");

  if (!salt || !expected) {
    return false;
  }

  const actual = hashVerificationCode(input.code, salt, input.pepper).split(":")[1];
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function hashSessionBinding(sessionId: string, pepper: string): string {
  if (!pepper) {
    throw new Error("STUDENT_VERIFICATION_PEPPER is not configured.");
  }

  return createHmac("sha256", pepper).update(sessionId).digest("hex");
}

export function buildStudentVerificationEmail(code: string): { subject: string; text: string; html: string } {
  const escapedCode = code.replace(/[^\d]/g, "");

  return {
    subject: "Your ISE Project Verification Code",
    text: `Your verification code is: ${escapedCode}\n\nThis code expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<p>Your verification code is: <strong>${escapedCode}</strong></p><p>This code expires in 10 minutes.</p><p>If you did not request this code, you can ignore this email.</p>`
  };
}

export function canSendVerificationCode(input: {
  lastSentAt?: string | null;
  now?: Date;
}): boolean {
  if (!input.lastSentAt) {
    return true;
  }

  const now = input.now ?? new Date();
  return now.getTime() - new Date(input.lastSentAt).getTime() >= verificationCodeCooldownSeconds * 1000;
}

export function getVerificationRecordState(input: {
  expiresAt: string;
  attemptCount: number;
  maxAttempts?: number | null;
  verifiedAt?: string | null;
  consumedAt?: string | null;
  now?: Date;
}): "ok" | "expired" | "max_attempts" | "already_verified" | "consumed" {
  const now = input.now ?? new Date();

  if (input.consumedAt) {
    return "consumed";
  }

  if (input.verifiedAt) {
    return "already_verified";
  }

  if (new Date(input.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }

  if (input.attemptCount >= (input.maxAttempts ?? verificationCodeMaxAttempts)) {
    return "max_attempts";
  }

  return "ok";
}
