"use client";

import { useFormStatus } from "react-dom";

export function WorkflowSubmitButton({
  children,
  pendingLabel,
  variant = "primary"
}: {
  children: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        variant === "primary"
          ? "rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          : "rounded border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:text-slate-400"
      }
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
