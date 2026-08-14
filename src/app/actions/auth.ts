"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findActiveStudentByEmail } from "@/lib/student-directory";
import {
  redirectPathForRole,
  validateRequesterEmail
} from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

const studentLoginGenericError = "We could not send a verification code for this email.";
const studentOtpError = "The verification code is invalid or expired.";
const studentOtpRateLimitMessage =
  "A verification code was recently requested. Use the latest code in your inbox or wait 60 seconds before requesting another one.";

function studentLoginUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/login?${search.toString()}`;
}

function safeNextPath(value: FormDataEntryValue | string | null) {
  const next = String(value ?? "").trim();
  return next.startsWith("/") && !next.startsWith("//") ? next : "";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
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
        studentError: "Requesters sign in with an email verification code."
      })
    );
  }

  redirect(next || redirectPathForRole(role));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}

export async function sendStudentLoginCodeAction(formData: FormData) {
  const emailResult = validateRequesterEmail(formData.get("email"));
  const next = safeNextPath(formData.get("next"));

  if (!emailResult.ok) {
    redirect(studentLoginUrl({ studentError: emailResult.error, ...(next ? { next } : {}) }));
  }

  const student = await findActiveStudentByEmail(emailResult.email);

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, studentError: "Supabase is not configured.", ...(next ? { next } : {}) }));
  }

  const displayName = student ? `${student.firstName} ${student.lastName}`.trim() : emailResult.email.split("@")[0];
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
          studentError: studentOtpRateLimitMessage,
          ...(next ? { next } : {})
        })
      );
    }

    console.error("Student OTP send failed", {
      status: error.status,
      code: error.code,
      message: error.message
    });
    redirect(studentLoginUrl({ studentEmail: emailResult.email, studentError: studentLoginGenericError, ...(next ? { next } : {}) }));
  }

  redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", ...(next ? { next } : {}) }));
}

export async function verifyStudentLoginCodeAction(formData: FormData) {
  const emailResult = validateRequesterEmail(formData.get("email"));
  const token = String(formData.get("token") ?? "").trim();
  const next = safeNextPath(formData.get("next"));

  if (!emailResult.ok) {
    redirect(studentLoginUrl({ studentError: emailResult.error, ...(next ? { next } : {}) }));
  }

  if (!/^\d{6}$/.test(token)) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError, ...(next ? { next } : {}) }));
  }

  const student = await findActiveStudentByEmail(emailResult.email);

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: "Supabase is not configured.", ...(next ? { next } : {}) }));
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: emailResult.email,
    token,
    type: "email"
  });

  if (error || !data.user || data.user.email?.toLowerCase() !== emailResult.email) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError, ...(next ? { next } : {}) }));
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: "Requester sign-in is not configured.", ...(next ? { next } : {}) }));
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role, display_name, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  const displayName = student
    ? `${student.firstName} ${student.lastName}`.trim()
    : String(existingProfile?.display_name ?? data.user.user_metadata?.display_name ?? emailResult.email.split("@")[0]);
  const role = (existingProfile?.role as UserRole | undefined) ?? "student";
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: emailResult.email,
      display_name: displayName,
      role,
      is_active: existingProfile?.is_active ?? true
    },
    { onConflict: "id" }
  );

  if (profileError) {
    await supabase.auth.signOut();
    redirect(studentLoginUrl({ studentEmail: emailResult.email, codeSent: "1", studentError: studentOtpError, ...(next ? { next } : {}) }));
  }

  redirect(next || redirectPathForRole(role));
}
