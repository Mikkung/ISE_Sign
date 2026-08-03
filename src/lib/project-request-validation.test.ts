import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  academicPrograms,
  buildStudentVerificationEmail,
  canSendVerificationCode,
  generateSixDigitCode,
  getVerificationRecordState,
  hashVerificationCode,
  isDateOnly,
  normalizeProjectType,
  projectRequestSchema,
  validateStudentDirectoryRecord,
  validateStudentEmailForSignedInAccount,
  verifyVerificationCodeHash
} from "./project-request-validation";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("English UI source", () => {
  it("does not contain Thai system text in production source files", () => {
    const files = [
      ...walk(join(process.cwd(), "src/app")),
      ...walk(join(process.cwd(), "src/components")),
      ...walk(join(process.cwd(), "src/lib"))
    ].filter((file) => !file.endsWith(".test.ts"));

    const thaiCharacterPattern = /[\u0E00-\u0E7F]/;
    const offenders = files.filter((file) => thaiCharacterPattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("project request validation", () => {
  it("accepts allowed academic programs and optional empty value", () => {
    for (const program of academicPrograms) {
      expect(projectRequestSchema.safeParse(basePayload({ academicProgram: program })).success).toBe(true);
    }

    expect(projectRequestSchema.safeParse(basePayload({ academicProgram: "" })).success).toBe(true);
  });

  it("rejects arbitrary academic programs", () => {
    expect(projectRequestSchema.safeParse(basePayload({ academicProgram: "BBA" })).success).toBe(false);
  });

  it("validates listed project types and requires custom text for Other", () => {
    expect(normalizeProjectType({ category: "Open House" })).toEqual({
      category: "Open House",
      custom: null,
      displayName: "Open House"
    });
    expect(() => normalizeProjectType({ category: "Other", custom: "  " })).toThrow("Specify Project Type");
    expect(normalizeProjectType({ category: "Other", custom: " Student Forum " })).toEqual({
      category: "Other",
      custom: "Student Forum",
      displayName: "Student Forum"
    });
    expect(() => normalizeProjectType({ category: "Anything Else" })).toThrow("Project Type");
  });

  it("validates date-only ranges without timezone conversion", () => {
    expect(isDateOnly("2026-08-03")).toBe(true);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "2026-08-03", endDate: "2026-08-04" })).success).toBe(true);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "2026-08-05", endDate: "2026-08-04" })).success).toBe(false);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "", endDate: "2026-08-04" })).success).toBe(false);
  });

  it("requires entered student email to match the authenticated account", () => {
    expect(
      validateStudentEmailForSignedInAccount({
        enteredEmail: "  6631234567@STUDENT.CHULA.AC.TH ",
        signedInEmail: "6631234567@student.chula.ac.th"
      })
    ).toEqual({ ok: true, email: "6631234567@student.chula.ac.th", studentId: "6631234567" });
    expect(
      validateStudentEmailForSignedInAccount({
        enteredEmail: "user@chula.ac.th",
        signedInEmail: "user@chula.ac.th"
      })
    ).toEqual({ ok: false, error: "Enter a valid Chulalongkorn student email address." });
    expect(
      validateStudentEmailForSignedInAccount({
        enteredEmail: "6631234567@student.chula.ac.th",
        signedInEmail: "6630000000@student.chula.ac.th"
      })
    ).toEqual({ ok: false, error: "Please use the same student email address as your signed-in account." });
  });

  it("validates student directory prefix, domain, and active status", () => {
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@student.chula.ac.th", isActive: true })).toBe(true);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6630000000@student.chula.ac.th", isActive: true })).toBe(false);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@chula.ac.th", isActive: true })).toBe(false);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@student.chula.ac.th", isActive: false })).toBe(false);
  });
});

describe("student verification codes", () => {
  it("generates a six-digit numeric code", () => {
    expect(generateSixDigitCode()).toMatch(/^\d{6}$/);
  });

  it("hashes verification codes without storing plaintext", () => {
    const hash = hashVerificationCode("123456", "salt", "pepper");
    expect(hash).not.toContain("123456");
    expect(verifyVerificationCodeHash({ code: "123456", storedHash: hash, pepper: "pepper" })).toBe(true);
    expect(verifyVerificationCodeHash({ code: "000000", storedHash: hash, pepper: "pepper" })).toBe(false);
  });

  it("builds an English email template with the code only in message content", () => {
    const message = buildStudentVerificationEmail("123456");
    expect(message.subject).toBe("Your ISE Project Verification Code");
    expect(message.text).toContain("This code expires in 10 minutes.");
    expect(message.html).toContain("123456");
  });

  it("enforces resend cooldown timing", () => {
    const now = new Date("2026-08-03T10:00:00Z");
    expect(canSendVerificationCode({ lastSentAt: null, now })).toBe(true);
    expect(canSendVerificationCode({ lastSentAt: "2026-08-03T09:59:30Z", now })).toBe(false);
    expect(canSendVerificationCode({ lastSentAt: "2026-08-03T09:59:00Z", now })).toBe(true);
  });

  it("rejects expired, over-attempt, verified, and consumed records", () => {
    const now = new Date("2026-08-03T10:00:00Z");
    expect(getVerificationRecordState({ expiresAt: "2026-08-03T10:01:00Z", attemptCount: 0, now })).toBe("ok");
    expect(getVerificationRecordState({ expiresAt: "2026-08-03T09:59:59Z", attemptCount: 0, now })).toBe("expired");
    expect(getVerificationRecordState({ expiresAt: "2026-08-03T10:01:00Z", attemptCount: 5, now })).toBe("max_attempts");
    expect(
      getVerificationRecordState({
        expiresAt: "2026-08-03T10:01:00Z",
        attemptCount: 0,
        verifiedAt: "2026-08-03T09:58:00Z",
        now
      })
    ).toBe("already_verified");
    expect(
      getVerificationRecordState({
        expiresAt: "2026-08-03T10:01:00Z",
        attemptCount: 0,
        consumedAt: "2026-08-03T09:58:00Z",
        now
      })
    ).toBe("consumed");
  });
});

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Project title",
    abstract: "Abstract",
    academicProgram: "ICE",
    projectTypeCategory: "CSR Trip",
    projectTypeCustom: "",
    startDate: "2026-08-03",
    endDate: "2026-08-04",
    studentEmail: "6631234567@student.chula.ac.th",
    verificationId: "00000000-0000-4000-8000-000000000000",
    intent: "submit",
    ...overrides
  };
}
