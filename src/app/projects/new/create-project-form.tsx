"use client";

import { type FormEvent, useState } from "react";
import {
  cleanupPreparedProjectUploadAction,
  finalizeProjectUploadAction,
  prepareProjectUploadAction
} from "@/app/actions/projects";
import {
  academicPrograms,
  allowedAttachmentMimeTypes,
  maxAttachmentBytes,
  projectAttachmentFieldName,
  projectTypeCategories
} from "@/lib/project-request-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthenticatedStudentIdentity } from "@/lib/student-directory";

function SubmitButton({
  children,
  disabled,
  loading,
  pendingLabel,
  value
}: {
  children: string;
  disabled?: boolean;
  loading: boolean;
  pendingLabel: string;
  value: "draft" | "submit";
}) {
  return (
    <button
      type="submit"
      name="intent"
      value={value}
      disabled={disabled || loading}
      className={
        value === "submit"
          ? "rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          : "rounded border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:text-slate-400"
      }
    >
      {loading ? pendingLabel : children}
    </button>
  );
}

function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addOneCalendarMonth(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const next = new Date(year, month, day);

  if (next.getDate() !== start.getDate()) {
    next.setDate(0);
  }

  return formatLocalDateInput(next);
}

export function CreateProjectForm({
  error,
  student
}: {
  error?: string;
  student: AuthenticatedStudentIdentity | null;
}) {
  const [projectType, setProjectType] = useState("CSR Trip");
  const [startDate, setStartDate] = useState(() => formatLocalDateInput(new Date()));
  const [endDate, setEndDate] = useState(() => addOneCalendarMonth(formatLocalDateInput(new Date())));
  const [endDateEdited, setEndDateEdited] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submittingIntent, setSubmittingIntent] = useState<"draft" | "submit" | null>(null);
  const [clientError, setClientError] = useState("");
  const dateError = startDate && endDate && startDate > endDate ? "Start Date must not be later than End Date." : "";
  const fileError = files.find((file) => file.size > maxAttachmentBytes)
    ? "Each attachment must be 50 MB or smaller."
    : files.find((file) => !allowedAttachmentMimeTypes.includes((file.type || "application/octet-stream") as never))
      ? "One or more selected files use an unsupported file type."
      : "";
  const fileDescriptions = [
    "attachment-help",
    files.length > 0 ? "attachment-list" : "",
    fileError ? "attachment-error" : ""
  ].filter(Boolean).join(" ");
  const submitDisabled = Boolean(!student || dateError || fileError || files.length === 0);
  const isSubmitting = submittingIntent !== null;

  function updateStartDate(value: string) {
    setStartDate(value);
    if (!endDateEdited && value) {
      setEndDate(addOneCalendarMonth(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent: "draft" | "submit" = submitter?.value === "submit" ? "submit" : "draft";

    setClientError("");

    if (!student) {
      setClientError("Your signed-in student email is not active in the Student Master Database.");
      return;
    }

    if (dateError || fileError) {
      setClientError(dateError || fileError);
      return;
    }

    if (intent === "submit" && files.length === 0) {
      setClientError("Add at least one attachment before submitting the project. You can save it as a draft without an attachment.");
      return;
    }

    setSubmittingIntent(intent);

    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get("title") ?? ""),
      abstract: String(formData.get("abstract") ?? ""),
      academicProgram: String(formData.get("academicProgram") ?? ""),
      projectTypeCategory: String(formData.get("projectTypeCategory") ?? ""),
      projectTypeCustom: String(formData.get("projectTypeCustom") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      intent,
      files: files.map((file, index) => ({
        clientFileId: `${index}:${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream"
      }))
    };

    let preparedProjectId = "";
    let preparedStoragePaths: string[] = [];

    try {
      const prepared = await prepareProjectUploadAction(payload);

      if (!prepared.ok) {
        setClientError(prepared.message);
        return;
      }

      preparedProjectId = prepared.projectId;
      preparedStoragePaths = prepared.files.map((file) => file.storagePath);

      if (prepared.files.length > 0) {
        const supabase = createSupabaseBrowserClient();
        const fileByClientId = new Map(payload.files.map((file, index) => [file.clientFileId, files[index]]));

        for (const upload of prepared.files) {
          const file = fileByClientId.get(upload.clientFileId);

          if (!file) {
            throw new Error("The selected file list changed before upload.");
          }

          const { error: uploadError } = await supabase.storage
            .from("project-documents")
            .uploadToSignedUrl(upload.storagePath, upload.token, file, {
              contentType: upload.type,
              upsert: false
            });

          if (uploadError) {
            throw new Error(uploadError.message);
          }
        }
      }

      const finalized = await finalizeProjectUploadAction({
        ...payload,
        projectId: prepared.projectId,
        files: prepared.files.map((file) => ({
          clientFileId: file.clientFileId,
          documentId: file.documentId,
          storagePath: file.storagePath,
          name: file.name,
          size: file.size,
          type: file.type
        }))
      });

      if (!finalized.ok) {
        setClientError(finalized.message);
        if (preparedStoragePaths.length > 0) {
          await cleanupPreparedProjectUploadAction({
            projectId: preparedProjectId,
            storagePaths: preparedStoragePaths
          });
        }
        return;
      }

      window.location.assign(finalized.redirectTo);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Project upload failed.";
      setClientError(message);

      if (preparedProjectId && preparedStoragePaths.length > 0) {
        await cleanupPreparedProjectUploadAction({
          projectId: preparedProjectId,
          storagePaths: preparedStoragePaths
        });
      }
    } finally {
      setSubmittingIntent(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-semibold text-slate-950">Authenticated Student</h3>
        {student ? (
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Student ID</dt>
              <dd className="font-medium text-slate-900">{student.studentId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">First Name</dt>
              <dd className="font-medium text-slate-900">{student.firstName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last Name</dt>
              <dd className="font-medium text-slate-900">{student.lastName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{student.email}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Your signed-in student email is not active in the Student Master Database.
          </p>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded border border-slate-200 bg-white p-5 shadow-panel">
        {error || clientError ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {clientError || error}
          </p>
        ) : null}
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
            <input name="startDate" type="date" value={startDate} onChange={(event) => updateStartDate(event.target.value)} required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">End Date</span>
            <input
              name="endDate"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDateEdited(true);
                setEndDate(event.target.value);
              }}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        {dateError ? <p className="text-sm text-red-700">{dateError}</p> : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Attachment</span>
          <input
            name={projectAttachmentFieldName}
            type="file"
            multiple
            accept={allowedAttachmentMimeTypes.join(",")}
            aria-describedby={fileDescriptions}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <p id="attachment-help" className="text-sm text-slate-500">
          At least one attachment is required when submitting a project. You can save a draft without an attachment.
        </p>
        {files.length > 0 ? (
          <ul id="attachment-list" className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {files.map((file) => {
              const mimeType = file.type || "application/octet-stream";
              const validationMessage = file.size > maxAttachmentBytes
                ? "File is larger than 50 MB."
                : !allowedAttachmentMimeTypes.includes(mimeType as (typeof allowedAttachmentMimeTypes)[number])
                  ? "Unsupported file type."
                  : "";

              return (
                <li key={`${file.name}-${file.size}`}>
                  <span>{file.name} ({Math.ceil(file.size / 1024)} KB)</span>
                  {validationMessage ? <span className="ml-2 text-red-700">{validationMessage}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {fileError ? <p id="attachment-error" className="text-sm text-red-700">{fileError}</p> : null}
        <div className="flex justify-end gap-2">
          <SubmitButton
            value="draft"
            pendingLabel="Saving..."
            loading={submittingIntent === "draft"}
            disabled={Boolean(!student || dateError || fileError || isSubmitting)}
          >
            Save Draft
          </SubmitButton>
          <SubmitButton
            value="submit"
            pendingLabel="Submitting..."
            loading={submittingIntent === "submit"}
            disabled={submitDisabled || isSubmitting}
          >
            Submit Project
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
