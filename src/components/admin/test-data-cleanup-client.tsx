"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { testDataCleanupConfirmation, type TestDataProjectRow } from "@/lib/test-data-cleanup-shared";

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
    >
      {pending ? "Deleting..." : "Confirm Permanent Deletion"}
    </button>
  );
}

export function TestDataCleanupClient({
  action,
  projects
}: {
  action: (formData: FormData) => void;
  projects: TestDataProjectRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedIds.includes(project.id)),
    [projects, selectedIds]
  );
  const totals = selectedProjects.reduce(
    (summary, project) => ({
      documents: summary.documents + project.documentCount,
      documentVersions: summary.documentVersions + project.documentVersionCount,
      workflowSteps: summary.workflowSteps + project.workflowStepCount,
      assignments: summary.assignments + project.assignmentCount,
      approvalActions: summary.approvalActions + project.approvalActionCount,
      comments: summary.comments + project.commentCount,
      storageObjects: summary.storageObjects + project.storageObjectCount
    }),
    {
      documents: 0,
      documentVersions: 0,
      workflowSteps: 0,
      assignments: 0,
      approvalActions: 0,
      comments: 0,
      storageObjects: 0
    }
  );
  const confirmationValid = confirmation === testDataCleanupConfirmation;

  function toggleProject(projectId: string) {
    setSelectedIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  }

  function selectAll() {
    setSelectedIds(projects.map((project) => project.id));
  }

  function clearSelection() {
    setSelectedIds([]);
    setConfirmation("");
    setDialogOpen(false);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-700">
          <span className="font-semibold text-slate-950">{selectedIds.length}</span> selected
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectAll} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">
            Select All
          </button>
          <button type="button" onClick={clearSelection} className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold">
            Clear Selection
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setDialogOpen(true)}
            className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            Delete Selected Test Projects
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Select</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Project Code / ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Requester</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Program</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Project Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Submitted</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Documents</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Workflow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                  No projects match the current filters.
                </td>
              </tr>
            ) : projects.map((project) => (
              <tr key={project.id}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                    className="h-4 w-4 rounded border-slate-300"
                    aria-label={`Select ${project.code}`}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="font-semibold text-slate-950">{project.code}</div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{project.id}</div>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-slate-950">{project.title}</td>
                <td className="px-4 py-3 text-sm">
                  <div>{project.requester}</div>
                  <div className="text-xs text-slate-500">{project.requesterEmail}</div>
                </td>
                <td className="px-4 py-3 text-sm">{project.program}</td>
                <td className="px-4 py-3 text-sm">{project.projectType}</td>
                <td className="px-4 py-3 text-sm">{project.status.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-sm">{new Date(project.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">{project.submittedAt ? new Date(project.submittedAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3 text-sm">
                  {project.documentCount} docs / {project.documentVersionCount} versions
                </td>
                <td className="px-4 py-3 text-sm">{project.workflowStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">
              Delete {selectedIds.length} selected test project{selectedIds.length === 1 ? "" : "s"} permanently?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This permanently removes the selected projects and their associated development data. This action cannot be undone.
            </p>
            <dl className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-4">
              <div><dt className="text-slate-500">Selected projects</dt><dd className="font-semibold">{selectedIds.length}</dd></div>
              <div><dt className="text-slate-500">Documents</dt><dd className="font-semibold">{totals.documents}</dd></div>
              <div><dt className="text-slate-500">Document versions</dt><dd className="font-semibold">{totals.documentVersions}</dd></div>
              <div><dt className="text-slate-500">Workflow steps</dt><dd className="font-semibold">{totals.workflowSteps}</dd></div>
              <div><dt className="text-slate-500">Assignments</dt><dd className="font-semibold">{totals.assignments}</dd></div>
              <div><dt className="text-slate-500">Approval actions</dt><dd className="font-semibold">{totals.approvalActions}</dd></div>
              <div><dt className="text-slate-500">Comments</dt><dd className="font-semibold">{totals.comments}</dd></div>
              <div><dt className="text-slate-500">Storage objects</dt><dd className="font-semibold">{totals.storageObjects}</dd></div>
            </dl>
            <form action={action} className="mt-4 space-y-4">
              {selectedIds.map((projectId) => (
                <input key={projectId} type="hidden" name="projectIds" value={projectId} />
              ))}
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Type DELETE TEST PROJECTS to confirm</span>
                <input
                  name="confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
                <DeleteButton enabled={confirmationValid} />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
