import Link from "next/link";
import { StudentRegistrationForm } from "./student-registration-form";

export default async function StudentRegisterPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ise-maroon">ISE Project Approval</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Create Student Account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use a Chulalongkorn University student email address ending with @student.chula.ac.th.
        </p>
        <StudentRegistrationForm error={error} />
        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-ise-maroon">
          Already have an account? Sign in
        </Link>
      </section>
    </main>
  );
}
