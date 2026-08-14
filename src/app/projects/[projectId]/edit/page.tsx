import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { getProject } from "@/lib/data";
import { getProjectEditabilityForUser } from "@/lib/project-editability.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { academicPrograms, projectTypeCategories } from "@/lib/project-request-validation";
import type { UserRole } from "@/lib/types";

export default async function EditProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const project = await getProject(projectId);

  if (!project) {
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
  const role = profile?.role as UserRole | undefined;

  if (!profile || profile.is_active === false || !role) {
    redirect("/unauthorized");
  }

  const editability = await getProjectEditabilityForUser(supabase, {
    projectId: project.id,
    userId: user.id,
    role,
    isActive: profile.is_active !== false,
    studentId: project.student.id,
    status: project.status
  });

  if (!editability.allowed && ["not_owner", "not_authorized", "inactive_profile"].includes(editability.reason)) {
    redirect("/unauthorized");
  }

  if (!editability.allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <h2 className="text-2xl font-semibold text-slate-950">Project editing is locked</h2>
        <section className="rounded border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">{error ?? editability.message}</p>
          {editability.reason === "approval_started" ? (
            <p className="mt-2">Changes can be made again if an approver requests a revision.</p>
          ) : null}
          <Link href={`/projects/${project.id}`} className="mt-4 inline-flex rounded border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950">
            Back to Project
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Edit project</h2>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form action={updateProjectAction.bind(null, project.id)} className="space-y-4 rounded border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Title</span>
          <input
            name="title"
            required
            defaultValue={project.title}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Abstract</span>
          <textarea
            name="abstract"
            defaultValue={project.abstract}
            rows={5}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Academic Program</span>
          <select name="academicProgram" defaultValue={project.academicProgram === "-" ? "" : project.academicProgram} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">Select an academic program</option>
            {academicPrograms.map((program) => <option key={program} value={program}>{program}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Type</span>
          <select name="projectTypeCategory" defaultValue={project.projectTypeCategory ?? "CSR Trip"} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            {projectTypeCategories.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Specify Project Type</span>
          <input name="projectTypeCustom" defaultValue={project.projectTypeCustom ?? ""} maxLength={120} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start Date</span>
            <input name="startDate" type="date" required defaultValue={project.startDate} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">End Date</span>
            <input name="endDate" type="date" required defaultValue={project.endDate} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">Save</button>
      </form>
    </div>
  );
}
