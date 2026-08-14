"use client";

import { useFormStatus } from "react-dom";

export function StudentCodeSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white transition hover:bg-ise-maroonDark disabled:cursor-not-allowed disabled:bg-ise-maroon disabled:opacity-60"
    >
      {pending ? "Sending..." : "Send Verification Code"}
    </button>
  );
}
