import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listProjectAuditLogs } from "@/lib/data";

export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const events = await listProjectAuditLogs(project.id);

  return (
    <div className="space-y-5">
      <Link href={`/projects/${project.id}`} className="inline-flex text-sm font-semibold text-ise-maroon hover:underline">
        ← Back to Project
      </Link>
      <h2 className="text-2xl font-semibold text-slate-950">Project History</h2>
      <div className="rounded border border-slate-200 bg-white p-4">
        <ol className="space-y-4">
          {events.length === 0 ? (
            <li className="text-sm text-slate-500">No audit events found for this project.</li>
          ) : events.map((event) => (
            <li key={event.id} className="border-l-2 border-ise-maroon pl-4">
              <p className="font-medium text-slate-950">{event.action}</p>
              <p className="text-sm text-slate-500">
                {event.actor} · {new Date(event.createdAt).toLocaleString("th-TH")}
              </p>
              {Object.keys(event.metadata).length > 0 ? (
                <dl className="mt-2 grid gap-1 rounded bg-slate-50 p-2 text-xs text-slate-600 md:grid-cols-2">
                  {Object.entries(event.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-medium text-slate-700">{key}</dt>
                      <dd className="break-all">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
