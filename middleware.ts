import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { isConfirmedStudentUser, redirectPathForRole } from "@/lib/student-registration";
import type { UserRole } from "@/lib/types";

const publicPrefixes = ["/login", "/register/student", "/verify-email", "/auth/callback", "/unauthorized"];
const publicApiPrefixes = ["/api/reminders/run"];

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    publicApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function allowedRoles(pathname: string): UserRole[] | null {
  if (pathname.startsWith("/admin")) {
    return ["admin"];
  }

  if (pathname.startsWith("/staff")) {
    return ["staff", "admin"];
  }

  if (pathname.startsWith("/approvals")) {
    return ["approver", "staff", "admin"];
  }

  if (pathname === "/projects/new") {
    return ["student", "staff", "approver", "admin"];
  }

  if (pathname.includes("/workflow")) {
    return ["student", "staff", "admin"];
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    const role = profile?.role as UserRole | undefined;
    const url = request.nextUrl.clone();

    if (!profile || !role || profile.is_active === false) {
      url.pathname = "/unauthorized";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (
      role === "student" &&
      !isConfirmedStudentUser({
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        profile: { role, isActive: profile?.is_active }
      })
    ) {
      url.pathname = "/login";
      url.searchParams.set("studentEmail", user.email ?? "");
      url.searchParams.set("studentError", "Requesters sign in with an email verification code.");
      return NextResponse.redirect(url);
    }

    url.pathname = redirectPathForRole(role ?? "student");
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role as UserRole | undefined;

    if (!profile || !role || profile.is_active === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (
      role === "student" &&
      !isConfirmedStudentUser({
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        profile: { role, isActive: profile?.is_active }
      }) &&
      !isPublicPath(pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("studentEmail", user.email ?? "");
      url.searchParams.set("studentError", "Requesters sign in with an email verification code.");
      return NextResponse.redirect(url);
    }

    const roles = allowedRoles(pathname);

    if (roles) {
      if (!role || !roles.includes(role)) {
        const url = request.nextUrl.clone();
        url.pathname = "/unauthorized";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
