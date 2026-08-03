import { CreateProjectForm } from "./create-project-form";
import { getVerifiedStudentIdentity } from "@/lib/student-project-verification-data";

export default async function NewProjectPage({
  searchParams
}: {
  searchParams: Promise<{
    studentEmail?: string;
    verificationId?: string;
    verificationMessage?: string;
    studentEmailError?: string;
  }>;
}) {
  const params = await searchParams;
  const verifiedStudent = await getVerifiedStudentIdentity(params.verificationId);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Create Project</h2>
        <p className="mt-1 text-sm text-slate-500">
          Verify your student identity, add project details, attach supporting files, then save a draft or submit.
        </p>
      </div>
      <CreateProjectForm
        studentEmail={params.studentEmail}
        verifiedStudent={verifiedStudent}
        message={params.verificationMessage}
        error={params.studentEmailError}
      />
    </div>
  );
}

