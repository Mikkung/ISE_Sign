"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  STUDENT_EMAIL_ERROR,
  isConfirmedStudentUser,
  redirectPathForRole,
  sanitizeFullName,
  validateStudentEmail,
  validateStudentPassword
} from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

const resendCooldownSeconds = 60;

function encodeError(message: string) {
  return encodeURIComponent(message);
}

async function getEmailRedirectTo() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const forwardedHost = headerStore.get("x-forwarded-host");
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "https";
  const host = forwardedHost ?? headerStore.get("host");
  const base = origin ?? (host ? `${forwardedProto}://${host}` : "http://localhost:3000");
  const parsed = new URL(base);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.host) {
    return "http://localhost:3000/auth/callback";
  }

  return new URL("/auth/callback", parsed.origin).toString();
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

  if (
    role === "student" &&
    !isConfirmedStudentUser({
      email: data.user.email,
      emailConfirmedAt: data.user.email_confirmed_at,
      profile: { role, isActive: profile?.is_active }
    })
  ) {
    await supabase.auth.signOut();
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
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

export async function registerStudentAction(formData: FormData) {
  const fullName = sanitizeFullName(formData.get("fullName"));
  const emailResult = validateStudentEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(`/register/student?error=${encodeError("Supabase is not configured")}`);
  }

  if (fullName.length < 2 || fullName.length > 120) {
    redirect(`/register/student?error=${encodeError("Enter a valid full name.")}`);
  }

  if (!emailResult.ok) {
    redirect(`/register/student?error=${encodeError(STUDENT_EMAIL_ERROR)}`);
  }

  const passwordResult = validateStudentPassword(password);

  if (!passwordResult.ok) {
    redirect(`/register/student?error=${encodeError(passwordResult.error)}`);
  }

  if (password !== confirmPassword) {
    redirect(`/register/student?error=${encodeError("Password and confirmation password do not match.")}`);
  }

  const { error } = await supabase.auth.signUp({
    email: emailResult.email,
    password,
    options: {
      emailRedirectTo: await getEmailRedirectTo(),
      data: {
        display_name: fullName
      }
    }
  });

  if (error) {
    redirect(`/register/student?error=${encodeError("Registration could not be completed. Check your details and try again.")}`);
  }

  await supabase.auth.signOut();
  redirect(`/verify-email?email=${encodeURIComponent(emailResult.email)}&registered=1`);
}

export async function resendStudentConfirmationAction(formData: FormData) {
  const emailResult = validateStudentEmail(formData.get("email"));
  const cookieStore = await cookies();
  const lastSent = Number(cookieStore.get("student_signup_resend_at")?.value ?? 0);
  const now = Date.now();

  if (!emailResult.ok) {
    redirect(`/verify-email?error=${encodeError(STUDENT_EMAIL_ERROR)}`);
  }

  if (now - lastSent < resendCooldownSeconds * 1000) {
    redirect(`/verify-email?email=${encodeURIComponent(emailResult.email)}&resent=1`);
  }

  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.resend({
      type: "signup",
      email: emailResult.email,
      options: {
        emailRedirectTo: await getEmailRedirectTo()
      }
    });
  }

  cookieStore.set("student_signup_resend_at", String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: resendCooldownSeconds,
    path: "/verify-email"
  });

  redirect(`/verify-email?email=${encodeURIComponent(emailResult.email)}&resent=1`);
}
