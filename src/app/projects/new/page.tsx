import { CreateProjectForm } from "./create-project-form";
import { getAuthenticatedStudentIdentity } from "@/lib/student-directory";

export default async function NewProjectPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const student = await getAuthenticatedStudentIdentity();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Create Project</h2>
        <p className="mt-1 text-sm text-slate-500">
          Confirm your authenticated student identity, add project details, attach supporting files, then save a draft or submit.
        </p>
      </div>
      <CreateProjectForm student={student} error={error} />
    </div>
  );
}
