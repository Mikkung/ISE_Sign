import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isConfirmedStudentUser, redirectPathForRole } from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createSupabaseServerClient();

  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login?error=Invalid%20confirmation%20link", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=Invalid%20confirmation%20link", url.origin));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role as UserRole | undefined;

  if (!profile || !role || profile.is_active === false) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", url.origin));
  }

  if (
    role === "student" &&
    !isConfirmedStudentUser({
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at,
      profile: { role, isActive: profile?.is_active }
    })
  ) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(`/verify-email?email=${encodeURIComponent(user.email ?? "")}`, url.origin));
  }

  return NextResponse.redirect(new URL(redirectPathForRole(role), url.origin));
}
