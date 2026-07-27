import { notFound } from "next/navigation";
import { buildCertificateSummary } from "@/lib/certificates";
import { getProject } from "@/lib/data";

export default async function ProjectCertificatePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const certificate = buildCertificateSummary(project, []);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="no-print flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">ใบรับรองการอนุมัติ</h2>
          <p className="mt-1 text-sm text-slate-500">เอกสาร HTML ที่ปรับสำหรับการพิมพ์และบันทึกเป็น PDF</p>
        </div>
        <span className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Print-ready</span>
      </div>
      <article className="rounded border border-slate-200 bg-white p-8 shadow-panel print:border-0 print:shadow-none">
        <div className="border-b border-slate-200 pb-5">
          <p className="text-sm font-semibold text-ise-maroon">ISE Electronic Approval Certificate</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{certificate.projectTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">Verification code: {certificate.verificationCode}</p>
        </div>
        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Project ID</dt>
            <dd className="font-medium text-slate-950">{certificate.projectId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Student</dt>
            <dd className="font-medium text-slate-950">{certificate.studentName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Submitted</dt>
            <dd className="font-medium text-slate-950">{certificate.submissionDate ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Completed</dt>
            <dd className="font-medium text-slate-950">{certificate.completionDate}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-500">Document SHA-256</dt>
            <dd className="break-all font-medium text-slate-950">{certificate.documentHash ?? "-"}</dd>
          </div>
        </dl>
        <section className="mt-6">
          <h2 className="font-semibold text-slate-950">Approval workflow</h2>
          <ol className="mt-3 space-y-3">
            {project.workflow.map((step) => (
              <li key={step.id} className="rounded border border-slate-200 p-3">
                <p className="font-medium text-slate-950">{step.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {step.approvers.map((approver) => approver.profile.displayName).join(", ")}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <p className="mt-6 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This certificate records authenticated electronic approvals. It is not a qualified digital signature or PKI signature.
        </p>
      </article>
    </div>
  );
}
