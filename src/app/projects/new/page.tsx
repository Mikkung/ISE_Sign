import Link from "next/link";
import { CreateProjectForm } from "./create-project-form";
import { getAuthenticatedRequesterIdentity } from "@/lib/student-directory";

export default async function NewProjectPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const requester = await getAuthenticatedRequesterIdentity();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/projects" className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to Projects
      </Link>
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Create Project</h2>
        <p className="mt-1 text-sm text-slate-500">
          Confirm your authenticated requester identity, add project details, attach supporting files, then save a draft or submit.
        </p>
      </div>
      <CreateProjectForm requester={requester} error={error} />
    </div>
  );
}
