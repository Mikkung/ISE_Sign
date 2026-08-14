import { getStudentIdFromEmail, validateStudentDirectoryRecord } from "./project-request-validation";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { getEmailDomain, STUDENT_EMAIL_DOMAIN, validateRequesterEmail, validateStudentEmail } from "./student-registration";
import type { UserRole } from "./types";

export interface AuthenticatedStudentIdentity {
  directoryId: string;
  authUserId: string;
  studentId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type RequesterType = "student" | "staff" | "faculty" | "external" | "other";

export interface AuthenticatedRequesterIdentity {
  authUserId: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  requesterType: RequesterType;
  role: UserRole;
  directoryId: string | null;
  studentId: string | null;
  organization: string | null;
}

export async function findActiveStudentByEmail(email: string): Promise<Omit<AuthenticatedStudentIdentity, "authUserId"> | null> {
  const emailResult = validateStudentEmail(email);

  if (!emailResult.ok) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const studentId = getStudentIdFromEmail(emailResult.email);
  const { data, error } = await admin
    .from("student_directory")
    .select("id, student_id, email, first_name, last_name, is_active")
    .eq("email", emailResult.email)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (!validateStudentDirectoryRecord({ studentId: data.student_id, email: data.email, isActive: data.is_active })) {
    return null;
  }

  return {
    directoryId: data.id,
    studentId: data.student_id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name
  };
}

function splitDisplayName(displayName: string | null | undefined, email: string) {
  const fallback = email.split("@")[0] || "Requester";
  const normalized = (displayName ?? "").trim() || fallback;
  const [first, ...rest] = normalized.split(/\s+/);

  return {
    displayName: normalized,
    firstName: first || normalized,
    lastName: rest.join(" ") || null
  };
}

function requesterTypeForProfile(input: { role: UserRole; email: string; hasStudentMatch: boolean }): RequesterType {
  if (input.hasStudentMatch) {
    return "student";
  }

  if (input.role === "approver") {
    return "faculty";
  }

  if (input.role === "staff" || input.role === "admin") {
    return "staff";
  }

  return getEmailDomain(input.email)?.endsWith("chula.ac.th") || getEmailDomain(input.email) === STUDENT_EMAIL_DOMAIN
    ? "other"
    : "external";
}

export async function getAuthenticatedRequesterIdentity(): Promise<AuthenticatedRequesterIdentity | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const emailResult = validateRequesterEmail(user?.email);

  if (!user || !emailResult.ok) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, position, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    return null;
  }

  const student = await findActiveStudentByEmail(emailResult.email);
  const profileName = splitDisplayName(profile.display_name as string | null, emailResult.email);

  if (student) {
    return {
      authUserId: user.id,
      email: student.email,
      displayName: `${student.firstName} ${student.lastName}`.trim(),
      firstName: student.firstName,
      lastName: student.lastName,
      requesterType: "student",
      role: profile.role as UserRole,
      directoryId: student.directoryId,
      studentId: student.studentId,
      organization: "Chulalongkorn University"
    };
  }

  return {
    authUserId: user.id,
    email: emailResult.email,
    displayName: profileName.displayName,
    firstName: profileName.firstName,
    lastName: profileName.lastName,
    requesterType: requesterTypeForProfile({
      role: profile.role as UserRole,
      email: emailResult.email,
      hasStudentMatch: false
    }),
    role: profile.role as UserRole,
    directoryId: null,
    studentId: null,
    organization: (profile.position as string | null) ?? null
  };
}

export async function getAuthenticatedStudentIdentity(): Promise<AuthenticatedStudentIdentity | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const student = await findActiveStudentByEmail(user.email);

  if (!student) {
    return null;
  }

  return {
    ...student,
    authUserId: user.id
  };
}
