import { notFound, redirect } from "next/navigation";
import { deleteSelectedTestProjectsAction } from "@/app/actions/admin";
import { TestDataCleanupClient } from "@/components/admin/test-data-cleanup-client";
import { listTestDataProjects, testDataToolsEnabled } from "@/lib/test-data-cleanup";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

const statuses: ProjectStatus[] = [
  "draft",
  "submitted",
  "staff_review",
  "revision_required",
  "staff_approved",
  "approval_pending",
  "partially_approved",
  "rejected",
  "approved",
  "completed",
  "cancelled"
];

export default async function AdminTestDataPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    search?: string;
    status?: string;
    requester?: string;
    testLike?: string;
  }>;
}) {
  if (!testDataToolsEnabled()) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/unauthorized");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.is_active === false) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const projects = await listTestDataProjects({
    search: params.search,
    status: params.status,
    requester: params.requester,
    testLike: params.testLike === "1"
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Test Data Cleanup</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Permanently delete explicitly selected development test projects and associated project data. Students must use cancellation instead.
        </p>
      </div>

      {params.error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      ) : null}
      {params.message ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.message}</p>
      ) : null}

      <form className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-5">
        <input
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="Search title, code, or ID"
          className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
        />
        <select name="status" defaultValue={params.status ?? ""} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
          ))}
        </select>
        <input
          name="requester"
          defaultValue={params.requester ?? ""}
          placeholder="Requester"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm">
          <input name="testLike" type="checkbox" value="1" defaultChecked={params.testLike === "1"} />
          Test-like title
        </label>
        <div className="flex gap-2 md:col-span-5">
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Apply Filters</button>
          <a href="/admin/test-data" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Clear Filters</a>
        </div>
      </form>

      <TestDataCleanupClient action={deleteSelectedTestProjectsAction} projects={projects} />
    </div>
  );
}
