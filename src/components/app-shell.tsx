import {
  Bell,
  ClipboardCheck,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  requiresTestDataTools?: boolean;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["student", "staff", "approver", "admin"] },
  { href: "/projects", label: "Projects", icon: FileText, roles: ["student", "staff", "admin"] },
  { href: "/staff/review", label: "Staff Review", icon: ClipboardCheck, roles: ["staff", "admin"] },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["approver", "staff", "admin"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["student", "staff", "approver", "admin"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/admin/reports", label: "Reports", icon: FileClock, roles: ["admin"] },
  { href: "/admin/test-data", label: "Test Data", icon: Trash2, roles: ["admin"], requiresTestDataTools: true },
  { href: "/admin/reminder-rules", label: "Settings", icon: Settings, roles: ["admin"] }
];

export async function AppShell({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user || !supabase) {
    return <>{children}</>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as UserRole | undefined) ?? "student";
  const visibleItems = navItems.filter((item) =>
    item.roles.includes(role) && (!item.requiresTestDataTools || process.env.ENABLE_TEST_DATA_TOOLS === "true")
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-sm font-semibold text-ise-maroon">ISE</p>
          <h1 className="text-lg font-semibold text-slate-950">Project Approval</h1>
          <p className="mt-2 text-xs text-slate-500">{profile?.display_name ?? profile?.email ?? user.email}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-slate-400">{role}</p>
        </div>
        <nav className="space-y-1 p-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-ise-mist hover:text-ise-maroon"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <form action={logoutAction} className="pt-2">
            <button className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-ise-mist hover:text-ise-maroon">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign Out
            </button>
          </form>
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ise-maroon">Internal System</p>
              <p className="text-sm text-slate-500">Track, review, approve, and certify student projects.</p>
            </div>
            <Link
              href="/projects/new"
              className={role === "student" ? "inline-flex items-center rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark" : "hidden"}
            >
              Create Project
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
