export const STUDENT_EMAIL_DOMAIN = "student.chula.ac.th";
export const STUDENT_EMAIL_SUFFIX = `@${STUDENT_EMAIL_DOMAIN}`;
export const STUDENT_EMAIL_ERROR =
  "Registration is available only for student email addresses ending with @student.chula.ac.th.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getEmailDomain(email: string): string | null {
  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  const parts = email.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return parts[1];
}

export function isValidStudentEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return getEmailDomain(email) === STUDENT_EMAIL_DOMAIN;
}

export function validateStudentEmail(value: unknown): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(value);

  if (!isValidStudentEmail(email)) {
    return { ok: false, error: STUDENT_EMAIL_ERROR };
  }

  return { ok: true, email };
}

export function redirectPathForRole(role: string | null | undefined): string {
  switch (role) {
    case "student":
      return "/dashboard";
    case "staff":
      return "/staff/review";
    case "approver":
      return "/approvals";
    case "admin":
      return "/dashboard";
    default:
      return "/unauthorized";
  }
}

export function isConfirmedStudentUser(input: {
  email?: string | null;
  emailConfirmedAt?: string | null;
  profile?: {
    role?: string | null;
    isActive?: boolean | null;
  } | null;
}): boolean {
  return Boolean(
    input.emailConfirmedAt &&
      isValidStudentEmail(input.email) &&
      input.profile?.role === "student" &&
      input.profile.isActive !== false
  );
}
