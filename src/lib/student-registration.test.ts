import { describe, expect, it } from "vitest";
import {
  isConfirmedStudentUser,
  isValidStudentEmail,
  normalizeEmail,
  redirectPathForRole,
  validateStudentEmail
} from "./student-registration";

describe("student self-registration validation", () => {
  it("accepts valid lowercase student email", () => {
    expect(isValidStudentEmail("user@student.chula.ac.th")).toBe(true);
  });

  it("normalizes and accepts uppercase domain", () => {
    expect(validateStudentEmail("USER@STUDENT.CHULA.AC.TH")).toEqual({
      ok: true,
      email: "user@student.chula.ac.th"
    });
  });

  it("normalizes leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@student.chula.ac.th  ")).toBe("user@student.chula.ac.th");
    expect(isValidStudentEmail("  user@student.chula.ac.th  ")).toBe(true);
  });

  it("rejects non-student email", () => {
    expect(isValidStudentEmail("user@chula.ac.th")).toBe(false);
  });

  it("rejects deceptive suffix domain", () => {
    expect(isValidStudentEmail("user@student.chula.ac.th.example.com")).toBe(false);
  });

  it("rejects subdomain variants", () => {
    expect(isValidStudentEmail("user@subdomain.student.chula.ac.th")).toBe(false);
  });

  it("rejects empty or null email", () => {
    expect(isValidStudentEmail("")).toBe(false);
    expect(isValidStudentEmail(null)).toBe(false);
  });

  it("rejects malformed email", () => {
    expect(isValidStudentEmail("@student.chula.ac.th")).toBe(false);
    expect(isValidStudentEmail("user@@student.chula.ac.th")).toBe(false);
    expect(isValidStudentEmail("user@student.chula.ac.th extra-text")).toBe(false);
    expect(isValidStudentEmail("user@student-chula.ac.th")).toBe(false);
  });

  it("ignores form-supplied role when deciding redirect helpers", () => {
    expect(redirectPathForRole("admin")).toBe("/dashboard");
    expect(redirectPathForRole("student")).toBe("/dashboard");
  });

  it("requires confirmed student profile for student access", () => {
    expect(
      isConfirmedStudentUser({
        email: "user@student.chula.ac.th",
        emailConfirmedAt: "2026-08-03T00:00:00Z",
        profile: { role: "student", isActive: true }
      })
    ).toBe(true);
  });

  it("rejects unconfirmed student access", () => {
    expect(
      isConfirmedStudentUser({
        email: "user@student.chula.ac.th",
        emailConfirmedAt: null,
        profile: { role: "student", isActive: true }
      })
    ).toBe(false);
  });

  it("rejects privileged or inactive profiles for student access", () => {
    expect(
      isConfirmedStudentUser({
        email: "user@student.chula.ac.th",
        emailConfirmedAt: "2026-08-03T00:00:00Z",
        profile: null
      })
    ).toBe(false);
    expect(
      isConfirmedStudentUser({
        email: "user@student.chula.ac.th",
        emailConfirmedAt: "2026-08-03T00:00:00Z",
        profile: { role: "admin", isActive: true }
      })
    ).toBe(false);
    expect(
      isConfirmedStudentUser({
        email: "user@student.chula.ac.th",
        emailConfirmedAt: "2026-08-03T00:00:00Z",
        profile: { role: "student", isActive: false }
      })
    ).toBe(false);
  });

  it("preserves existing staff, approver, and admin redirect behavior", () => {
    expect(redirectPathForRole("staff")).toBe("/staff/review");
    expect(redirectPathForRole("approver")).toBe("/approvals");
    expect(redirectPathForRole("admin")).toBe("/dashboard");
  });
});
