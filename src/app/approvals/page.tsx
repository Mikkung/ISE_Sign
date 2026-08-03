import Link from "next/link";
import { listApprovalAssignments } from "@/lib/data";

export default async function ApprovalsPage() {
  const assignments = await listApprovalAssignments();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">My Approvals</h2>
        <p className="mt-1 text-sm text-slate-500">Open attachments, comment, request revision, or approve and certify.</p>
      </div>
      <div className="grid gap-3">
        {assignments.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No approval assignments.</div>
        ) : (
          assignments.map((assignment) => (
            <Link
              key={assignment.assignment.id}
              href={`/approvals/${assignment.assignment.id}`}
              className="rounded border border-slate-200 bg-white p-4 shadow-panel hover:border-ise-maroon"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{assignment.project.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {assignment.step.name} · {assignment.assignment.profile.displayName}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{assignment.assignment.status}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
