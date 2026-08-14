import { getStudentIdFromEmail, validateStudentDirectoryRecord } from "./project-request-validation";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { validateStudentEmail } from "./student-registration";

export interface AuthenticatedStudentIdentity {
  directoryId: string;
  authUserId: string;
  studentId: string;
  email: string;
  firstName: string;
  lastName: string;
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

