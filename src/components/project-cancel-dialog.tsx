"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function ConfirmCancellationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
    >
      {pending ? "Cancelling..." : "Confirm Cancellation"}
    </button>
  );
}

export function ProjectCancelDialog({ action }: { action: (formData: FormData) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-3 py-2 text-center text-sm font-semibold text-red-700"
      >
        Cancel Project
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Cancel this project?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will stop all pending review and approval actions. The project record and audit history will be preserved.
            </p>
            <form action={action} className="mt-4 space-y-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Cancellation reason</span>
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  rows={4}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  placeholder="Reason for cancellation"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  Keep Project
                </button>
                <ConfirmCancellationButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
