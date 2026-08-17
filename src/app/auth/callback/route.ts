import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isConfirmedStudentUser, redirectPathForRole } from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next")) || "/dashboard";
  const supabase = await createSupabaseServerClient();

  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login?error=Recovery%20link%20is%20invalid%20or%20expired", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=Recovery%20link%20is%20invalid%20or%20expired", url.origin));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  if (next === "/update-password") {
    return NextResponse.redirect(new URL(next, url.origin));
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
    return NextResponse.redirect(
      new URL(
        `/login?studentEmail=${encodeURIComponent(user.email ?? "")}&studentError=${encodeURIComponent(
          "Requesters sign in with an email verification code."
        )}`,
        url.origin
      )
    );
  }

  return NextResponse.redirect(new URL(next || redirectPathForRole(role), url.origin));
}
