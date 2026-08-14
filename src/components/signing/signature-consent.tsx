"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface SignatureConsentProps {
  disabled: boolean;
  documentVersion: number;
  documentHash: string;
}

export function SignatureSubmitButton({ disabled, documentVersion, documentHash }: SignatureConsentProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="decision"
      value="approved"
      disabled={disabled || pending}
      className="rounded bg-ise-maroon px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      aria-describedby="signature-submit-context"
    >
      {pending ? "Signing..." : "Approve, Sign, and Certify"}
      <span id="signature-submit-context" className="sr-only">
        This certifies document version {documentVersion} with SHA-256 hash {documentHash}.
      </span>
    </button>
  );
}

export function SecondaryDecisionButton({
  name,
  value,
  children,
  className
}: {
  name: string;
  value: string;
  children: ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
      {children}
    </button>
  );
}
