import Link from "next/link";
import { notFound } from "next/navigation";
import { submitProjectAction, uploadDocumentVersionAction } from "@/app/actions/projects";
import { getCompletedDocument, isCompletedDocument } from "@/lib/completed-documents";
import { getProject } from "@/lib/data";
import { getProjectEditabilityForUser } from "@/lib/project-editability.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectDocument, UserRole } from "@/lib/types";

export default async function ProjectDocumentsPage({
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
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: profile } = user && supabase
    ? await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = profile?.role as UserRole | undefined;
  const editability = user && profile && role && supabase
    ? await getProjectEditabilityForUser(supabase, {
        projectId: project.id,
        userId: user.id,
        role,
        isActive: profile.is_active !== false,
        studentId: project.student.id,
        status: project.status
      })
    : null;
  const completedDocument = getCompletedDocument(project);
  const approvalDocuments = project.documents.filter((document) =>
    document.versions.some((version) => version.revisionNote?.startsWith("Signed during "))
  );
  const projectDocuments = project.documents.filter((document) =>
    !isCompletedDocument(document)
  );

  return (
    <div className="space-y-5">
      <Link href={`/projects/${project.id}`} className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to Project
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Documents and versions</h2>
          <p className="mt-1 text-sm text-slate-500">Each upload creates a retained version with a SHA-256 hash.</p>
        </div>
        {editability?.allowed && ["draft", "revision_required"].includes(project.status) ? (
          <form action={submitProjectAction.bind(null, project.id)}>
            <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Submit project</button>
          </form>
        ) : null}
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {editability?.allowed ? (
        <div className="rounded border border-slate-200 bg-white p-4">
          <form action={uploadDocumentVersionAction.bind(null, project.id)} className="grid gap-3 md:grid-cols-5">
            <input
              name="file"
              type="file"
              required
              className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              name="documentType"
              defaultValue="Project document"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="revisionNote"
              placeholder="Revision note"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">Upload version</button>
          </form>
        </div>
      ) : editability ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {editability.message}
        </p>
      ) : null}
      <DocumentGroup title="Project Documents" documents={projectDocuments} emptyMessage="No project documents have been uploaded." />
      <DocumentGroup title="Approval Documents" documents={approvalDocuments} emptyMessage="No signed approval documents have been generated yet." />
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-950">Completed Document</h3>
        {completedDocument ? (
          <DocumentCard document={completedDocument} showHistory={["staff", "admin"].includes(role ?? "")} />
        ) : (
          <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            {project.status === "completed"
              ? "External processing is in progress. The final completed document has not been uploaded yet."
              : "Available after approval completion and external processing."}
          </div>
        )}
      </section>
    </div>
  );
}

function DocumentGroup({
  documents,
  emptyMessage,
  title
}: {
  documents: ProjectDocument[];
  emptyMessage: string;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      {documents.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        documents.map((document) => <DocumentCard key={document.id} document={document} showHistory />)
      )}
    </section>
  );
}

function DocumentCard({
  document,
  showHistory
}: {
  document: ProjectDocument;
  showHistory: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-950">{document.documentType}</h4>
          <p className="mt-1 text-sm text-slate-500">
            Active version {document.latestVersion.versionNumber} · SHA-256 {document.latestVersion.sha256Hash}
          </p>
        </div>
        <Link
          href={`/api/documents/${document.latestVersion.id}/download`}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
        >
          Download active version
        </Link>
      </div>
      {showHistory ? (
        <ol className="mt-4 space-y-2 text-sm">
          {document.versions.map((version) => (
            <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-100 px-3 py-2">
              <span>
                v{version.versionNumber} {version.originalFileName} {version.active ? "(active)" : ""}
              </span>
              <Link href={`/api/documents/${version.id}/download`} className="font-semibold text-ise-maroon">
                Download
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
