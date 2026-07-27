import { notFound } from "next/navigation";
import { getProject } from "@/lib/data";

export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const events = [
    ["Project created", project.student.displayName, project.lastActivityAt],
    ["Document uploaded", project.student.displayName, project.documents[0]?.latestVersion.uploadedAt],
    ["Workflow configured", project.assignedStaff?.displayName, project.submittedAt]
  ].filter((event) => event[2]);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">ประวัติการดำเนินการ</h2>
      <div className="rounded border border-slate-200 bg-white p-4">
        <ol className="space-y-4">
          {events.map(([action, actor, at]) => (
            <li key={`${action}-${at}`} className="border-l-2 border-ise-maroon pl-4">
              <p className="font-medium text-slate-950">{action}</p>
              <p className="text-sm text-slate-500">
                {actor} · {new Date(String(at)).toLocaleString("th-TH")}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
