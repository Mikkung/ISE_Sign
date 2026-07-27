import {
  Bell,
  ClipboardCheck,
  FileClock,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { href: "/projects", label: "โครงการ", icon: FileText },
  { href: "/staff/review", label: "ตรวจสอบ", icon: ClipboardCheck },
  { href: "/approvals", label: "งานอนุมัติ", icon: ShieldCheck },
  { href: "/notifications", label: "แจ้งเตือน", icon: Bell },
  { href: "/admin/users", label: "ผู้ใช้", icon: Users },
  { href: "/admin/reports", label: "รายงาน", icon: FileClock },
  { href: "/admin/reminder-rules", label: "ตั้งค่า", icon: Settings }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-sm font-semibold text-ise-maroon">ISE</p>
          <h1 className="text-lg font-semibold text-slate-950">Project Approval</h1>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
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
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ise-maroon">Internal System</p>
              <p className="text-sm text-slate-500">ระบบติดตาม ตรวจสอบ และรับรองโครงการนักศึกษา</p>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex items-center rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white hover:bg-ise-maroonDark"
            >
              สร้างโครงการ
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
