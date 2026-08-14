"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findActiveStudentByEmail } from "@/lib/student-directory";
import {
  STUDENT_EMAIL_ERROR,
  redirectPathForRole,
  validateStudentEmail
} from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

const studentLoginGenericError = "We could not send a verification code for this student email.";
const studentOtpError = "The verification code is invalid or expired.";
const studentOtpRateLimitMessage =
  "A verification code was recently requested. Use the latest code in your inbox or wait 60 seconds before requesting another one.";

function studentLoginUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/login?${search.toString()}`;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/login?error=Supabase%20is%20not%20configured");
  }

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    if (error?.message.toLowerCase().includes("confirm")) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }

    redirect("/login?error=Invalid%20email%20or%20password");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = profile?.role as UserRole | undefined;

  if (!profile || !role || profile.is_active === false) {
    await supabase.auth.signOut();
    redirect("/unauthorized");
  }

  if (role === "student") {
    await supabase.auth.signOut();
    redirect(
      studentLoginUrl({
        studentEmail: email,
        studentError: "Students sign in with an email verification code."
      })
    );
  }

  redirect(redirectPathForRole(role));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}

export async function sendStudentLoginCodeAction(formData: FormData) {
  const emailResult = validateStudentEmail(formData.get("email"));

  if (!emailResult.ok) {
    redirect(studentLoginUrl({ studentError: STUDENT_EMAIL_ERROR }));
  }

  const student = await findActiveStudentByEmail(emailResult.email);

  if (!student) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, studentError: studentLoginGenericError }));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, studentError: "Supabase is not configured." }));
  }

  const displayName = `${student.firstName} ${student.lastName}`.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email: emailResult.email,
    options: {
      shouldCreateUser: true,
      data: {
        display_name: displayName
      }
    }
  });

  if (error) {
    if (error.status === 429) {
      redirect(
        studentLoginUrl({
          studentEmail: emailResult.email,
          codeSent: "1",
          studentError: studentOtpRateLimitMessage
        })
      );
    }

    console.error("Student OTP send failed", {
      status: error.status,
      code: error.code,
      message: error.message
    });
    redirect(studentLoginUrl({ studentEmail: emailResult.email, studentError: studentLoginGenericError }));
  }

  redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1" }));
}

export async function verifyStudentLoginCodeAction(formData: FormData) {
  const emailResult = validateStudentEmail(formData.get("email"));
  const token = String(formData.get("token") ?? "").trim();

  if (!emailResult.ok) {
    redirect(studentLoginUrl({ studentError: STUDENT_EMAIL_ERROR }));
  }

  if (!/^\d{6}$/.test(token)) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError }));
  }

  const student = await findActiveStudentByEmail(emailResult.email);

  if (!student) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError }));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: "Supabase is not configured." }));
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: emailResult.email,
    token,
    type: "email"
  });

  if (error || !data.user || data.user.email?.toLowerCase() !== emailResult.email) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError }));
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: "Student sign-in is not configured." }));
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: emailResult.email,
      display_name: `${student.firstName} ${student.lastName}`.trim(),
      role: "student",
      is_active: true
    },
    { onConflict: "id" }
  );

  if (profileError) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError }));
  }

  redirect("/dashboard");
}
