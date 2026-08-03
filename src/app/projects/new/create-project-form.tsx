"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProjectAction,
  sendStudentProjectVerificationCodeAction,
  verifyStudentProjectEmailCodeAction
} from "@/app/actions/projects";
import {
  academicPrograms,
  allowedAttachmentMimeTypes,
  maxAttachmentBytes,
  projectTypeCategories
} from "@/lib/project-request-validation";
import { STUDENT_EMAIL_SUFFIX, isValidStudentEmail, normalizeEmail } from "@/lib/student-registration";
import type { VerifiedStudentIdentity } from "@/lib/student-project-verification-data";

function SubmitButton({ children, disabled, value }: { children: string; disabled?: boolean; value: "draft" | "submit" }) {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      name="intent"
      value={value}
      disabled={disabled || status.pending}
      className={
        value === "submit"
          ? "rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          : "rounded border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:text-slate-400"
      }
    >
      {status.pending ? "Saving..." : children}
    </button>
  );
}

function ActionButton({ children }: { children: string }) {
  const status = useFormStatus();

  return (
    <button
      disabled={status.pending}
      className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      {status.pending ? "Working..." : children}
    </button>
  );
}

export function CreateProjectForm({
  studentEmail,
  verifiedStudent,
  message,
  error
}: {
  studentEmail?: string;
  verifiedStudent: VerifiedStudentIdentity | null;
  message?: string;
  error?: string;
}) {
  const [projectType, setProjectType] = useState("CSR Trip");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [enteredEmail, setEnteredEmail] = useState(studentEmail ?? verifiedStudent?.email ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const normalizedEmail = useMemo(() => normalizeEmail(enteredEmail), [enteredEmail]);
  const emailError = enteredEmail && !isValidStudentEmail(enteredEmail)
    ? `Use a Chulalongkorn student email ending with ${STUDENT_EMAIL_SUFFIX}.`
    : "";
  const dateError = startDate && endDate && startDate > endDate ? "Start Date must not be later than End Date." : "";
  const fileError = files.find((file) => file.size > maxAttachmentBytes)
    ? "Each attachment must be 50 MB or smaller."
    : files.find((file) => !allowedAttachmentMimeTypes.includes((file.type || "application/octet-stream") as never))
      ? "One or more selected files use an unsupported file type."
      : "";

  return (
    <div className="space-y-5">
      {message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-semibold text-slate-950">Student</h3>
        <p className="mt-1 text-sm text-slate-500">
          Verify your own Chulalongkorn student email address before submitting a project.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <form action={sendStudentProjectVerificationCodeAction} className="contents">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Student Email</span>
              <input
                name="studentEmail"
                type="email"
                value={enteredEmail}
                onChange={(event) => setEnteredEmail(event.target.value)}
                placeholder={`xxxxxxxxxx${STUDENT_EMAIL_SUFFIX}`}
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
              {emailError ? <span className="mt-1 block text-sm text-red-700">{emailError}</span> : null}
              {!emailError && normalizedEmail ? <span className="mt-1 block text-xs text-slate-500">Using {normalizedEmail}</span> : null}
            </label>
            <div className="flex items-end">
              <ActionButton>Send Verification Code</ActionButton>
            </div>
          </form>
        </div>
        <form action={verifyStudentProjectEmailCodeAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="studentEmail" value={normalizedEmail} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Verification Code</span>
            <input
              name="verificationCode"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <ActionButton>Verify</ActionButton>
          </div>
        </form>
        {verifiedStudent ? (
          <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <h4 className="font-semibold text-emerald-900">Verified Student</h4>
            <dl className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <dt className="text-emerald-700">Student ID</dt>
                <dd className="font-medium text-emerald-950">{verifiedStudent.studentId}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Name</dt>
                <dd className="font-medium text-emerald-950">{verifiedStudent.firstName} {verifiedStudent.lastName}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Email</dt>
                <dd className="font-medium text-emerald-950">{verifiedStudent.email}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Status</dt>
                <dd className="font-medium text-emerald-950">Verified</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      <form action={createProjectAction} encType="multipart/form-data" className="space-y-4 rounded border border-slate-200 bg-white p-5 shadow-panel">
        <input type="hidden" name="studentEmail" value={normalizedEmail} />
        {verifiedStudent ? <input type="hidden" name="verificationId" value={verifiedStudent.verificationId} /> : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Title</span>
          <input name="title" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Abstract</span>
          <textarea name="abstract" rows={5} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Academic Program</span>
            <select name="academicProgram" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
              <option value="">Select an academic program</option>
              {academicPrograms.map((program) => <option key={program} value={program}>{program}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Project Type</span>
            <select
              name="projectTypeCategory"
              value={projectType}
              onChange={(event) => setProjectType(event.target.value)}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              {projectTypeCategories.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>
        {projectType === "Other" ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Specify Project Type</span>
            <input name="projectTypeCustom" required maxLength={120} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start Date</span>
            <input name="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">End Date</span>
            <input name="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {dateError ? <p className="text-sm text-red-700">{dateError}</p> : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Attachment</span>
          <input
            name="attachments"
            type="file"
            multiple
            accept={allowedAttachmentMimeTypes.join(",")}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {files.length > 0 ? (
          <ul className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} ({Math.ceil(file.size / 1024)} KB)</li>)}
          </ul>
        ) : null}
        {fileError ? <p className="text-sm text-red-700">{fileError}</p> : null}
        <div className="flex justify-end gap-2">
          <SubmitButton value="draft" disabled={Boolean(emailError || dateError || fileError)}>Save Draft</SubmitButton>
          <SubmitButton value="submit" disabled={Boolean(!verifiedStudent || emailError || dateError || fileError)}>
            Submit Project
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

