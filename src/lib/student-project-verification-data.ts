import { cookies } from "next/headers";
import { hashSessionBinding, validateStudentDirectoryRecord } from "@/lib/project-request-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface VerifiedStudentIdentity {
  verificationId: string;
  studentId: string;
  email: string;
  firstName: string;
  lastName: string;
  verifiedAt: string;
}

export async function getVerifiedStudentIdentity(verificationId?: string | null): Promise<VerifiedStudentIdentity | null> {
  if (!verificationId || !process.env.STUDENT_VERIFICATION_PEPPER) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  if (!supabase || !admin) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const sessionId = (await cookies()).get("student_project_session_id")?.value;

  if (!sessionId) {
    return null;
  }

  const sessionFingerprint = hashSessionBinding(sessionId, process.env.STUDENT_VERIFICATION_PEPPER);
  const { data: verification } = await admin
    .from("student_email_verifications")
    .select("id, user_id, email, expires_at, verified_at, consumed_at, session_fingerprint")
    .eq("id", verificationId)
    .maybeSingle();

  if (
    !verification ||
    verification.user_id !== user.id ||
    verification.session_fingerprint !== sessionFingerprint ||
    !verification.verified_at ||
    verification.consumed_at ||
    new Date(verification.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  const studentId = String(verification.email).split("@")[0];
  const { data: student } = await admin
    .from("student_directory")
    .select("student_id, email, first_name, last_name, is_active")
    .eq("student_id", studentId)
    .eq("email", verification.email)
    .maybeSingle();

  if (!student || !validateStudentDirectoryRecord({ studentId: student.student_id, email: student.email, isActive: student.is_active })) {
    return null;
  }

  return {
    verificationId: verification.id,
    studentId: student.student_id,
    email: student.email,
    firstName: student.first_name,
    lastName: student.last_name,
    verifiedAt: verification.verified_at
  };
}

