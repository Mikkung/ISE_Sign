import { notFound } from "next/navigation";
import Link from "next/link";
import { approvalDecisionAction, markAssignmentOpenedAction } from "@/app/actions/projects";
import { PdfSignatureEditor } from "@/components/signing/pdf-signature-editor";
import { certificationStatement } from "@/lib/constants";
import { getApprovalAssignment } from "@/lib/data";
import { getPdfPageCount } from "@/lib/pdf-signing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ApprovalDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { assignmentId } = await params;
  const { error } = await searchParams;
  const match = await getApprovalAssignment(assignmentId);

  if (!match) {
    notFound();
  }

  await markAssignmentOpenedAction(match.assignment.id);
  const activeDocument = match.project.documents[0]?.latestVersion;
  const isPdf = activeDocument?.mimeType === "application/pdf";
  const approverRole = match.assignment.profile.position ?? match.assignment.profile.role;
  const supabase = await createSupabaseServerClient();
  let savedSignatureDataUrl: string | null = null;
  let pageCount = 1;

  if (supabase) {
    const { data: savedSignature } = await supabase
      .from("user_signature_assets")
      .select("storage_bucket, storage_path, mime_type")
      .eq("user_id", match.assignment.profile.id)
      .eq("is_default", true)
      .is("revoked_at", null)
      .maybeSingle();

    if (savedSignature) {
      const { data: signatureFile } = await supabase.storage
        .from(savedSignature.storage_bucket)
        .download(savedSignature.storage_path);

      if (signatureFile) {
        const bytes = Buffer.from(await signatureFile.arrayBuffer());
        savedSignatureDataUrl = `data:${savedSignature.mime_type};base64,${bytes.toString("base64")}`;
      }
    }

    if (activeDocument && isPdf) {
      const { data: versionRow } = await supabase
        .from("project_document_versions")
        .select("storage_bucket, storage_path")
        .eq("id", activeDocument.id)
        .maybeSingle();

      if (versionRow) {
        const { data: pdfFile } = await supabase.storage
          .from(versionRow.storage_bucket)
          .download(versionRow.storage_path);

        if (pdfFile) {
          pageCount = await getPdfPageCount(Buffer.from(await pdfFile.arrayBuffer()));
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/approvals" className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to My Approvals
      </Link>
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{match.project.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{match.step.name}</p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      <section className="rounded border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-950">Electronic Approval Certification</h3>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Approver</dt>
            <dd className="font-medium text-slate-900">{match.assignment.profile.displayName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{approverRole}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Document Version</dt>
            <dd className="font-medium text-slate-900">
              {activeDocument ? `v${activeDocument.versionNumber} · ${activeDocument.originalFileName}` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Date and Time</dt>
            <dd className="font-medium text-slate-900">
              {new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}
            </dd>
          </div>
        </dl>
        {activeDocument ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Active document SHA-256</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">{activeDocument.sha256Hash}</p>
              </div>
              <a
                href={`/api/documents/${activeDocument.id}/download`}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
              >
                View/Download
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            No active document version is available. Certification cannot be submitted.
          </p>
        )}
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {certificationStatement} This application-level signature is not a PKI digital signature.
        </p>
      </section>

      {activeDocument && isPdf ? (
        <PdfSignatureEditor
          action={approvalDecisionAction.bind(null, match.assignment.id)}
          documentVersionId={activeDocument.id}
          documentVersionNumber={activeDocument.versionNumber}
          documentHash={activeDocument.sha256Hash}
          documentFileName={activeDocument.originalFileName}
          documentUrl={`/api/documents/${activeDocument.id}/download`}
          pageCount={pageCount}
          approverName={match.assignment.profile.displayName}
          approverRole={approverRole}
          stepName={match.step.name}
          savedSignatureDataUrl={savedSignatureDataUrl}
        />
      ) : activeDocument ? (
        <section className="rounded border border-slate-200 bg-white p-5">
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Visual signature placement requires a PDF document. Download the current document or request a PDF revision before final approval.
          </p>
          <form action={approvalDecisionAction.bind(null, match.assignment.id)} className="mt-4 space-y-4">
            <textarea name="comment" placeholder="Comment" rows={4} className="w-full rounded border border-slate-300 px-3 py-2" />
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="decision" value="revision_requested" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Request Revision</button>
              <button type="submit" name="decision" value="rejected" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Reject</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
