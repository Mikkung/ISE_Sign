import { notFound } from "next/navigation";
import { uploadDocumentVersionAction } from "@/app/actions/projects";
import { getProject } from "@/lib/data";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">เอกสารและประวัติเวอร์ชัน</h2>
      <div className="rounded border border-slate-200 bg-white p-4">
        <form action={uploadDocumentVersionAction} className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="documentType" defaultValue="Project Proposal" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="file" type="file" required className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
          <input name="revisionNote" placeholder="หมายเหตุการแก้ไข" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white">อัปโหลดเวอร์ชันใหม่</button>
        </form>
      </div>
      <div className="space-y-3">
        {project.documents.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">ยังไม่มีเอกสาร</div>
        ) : (
          project.documents.map((document) => (
            <div key={document.id} className="rounded border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">{document.documentType}</h3>
              {document.latestVersion ? (
                <p className="mt-1 break-all text-sm text-slate-500">
                  เวอร์ชันปัจจุบัน {document.latestVersion.versionNumber} · SHA-256 {document.latestVersion.sha256Hash}
                </p>
              ) : null}
              <ol className="mt-3 space-y-2">
                {document.versions.map((version) => (
                  <li key={version.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                    v{version.versionNumber} · {version.originalFileName} · {version.uploadedBy.displayName}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
