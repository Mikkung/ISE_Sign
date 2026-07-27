"use client";

import { useRef, useState } from "react";

interface ApprovalDecisionFormProps {
  action: (formData: FormData) => void;
  projectTitle: string;
  documentVersion: number | string;
  approverName: string;
  approverRole: string;
  certificationStatement: string;
}

export function ApprovalDecisionForm({
  action,
  projectTitle,
  documentVersion,
  approverName,
  approverRole,
  certificationStatement
}: ApprovalDecisionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-4">
      <textarea
        name="comment"
        placeholder="Comment"
        rows={4}
        className="w-full rounded border border-slate-300 px-3 py-2"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="revision_requested"
          className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
        >
          Request revision
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white"
        >
          Approve and Certify
        </button>
      </div>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Confirm electronic certification</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Project</dt>
                <dd className="font-medium text-slate-900">{projectTitle}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Active document version</dt>
                <dd className="font-medium text-slate-900">{documentVersion}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Approver</dt>
                <dd className="font-medium text-slate-900">
                  {approverName} ({approverRole})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Date and time</dt>
                <dd className="font-medium text-slate-900">{new Date().toLocaleString()}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {certificationStatement}
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input name="certify" type="checkbox" required className="mt-1" />
              I confirm this authenticated approval is my electronic certification for the active document version.
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                name="decision"
                value="approved"
                className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white"
              >
                Submit certification
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
