import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  academicPrograms,
  getProjectAttachments,
  isDateOnly,
  maxAttachmentBytes,
  missingSubmissionAttachmentMessage,
  normalizeProjectType,
  projectAttachmentFieldName,
  projectRequestSchema,
  validateProjectAttachmentMetadata,
  validateProjectAttachments,
  validateStudentDirectoryRecord
} from "./project-request-validation";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("English UI source", () => {
  it("does not contain Thai system text in production source files", () => {
    const files = [
      ...walk(join(process.cwd(), "src/app")),
      ...walk(join(process.cwd(), "src/components")),
      ...walk(join(process.cwd(), "src/lib"))
    ].filter((file) => !file.endsWith(".test.ts"));

    const thaiCharacterPattern = /[\u0E00-\u0E7F]/;
    const offenders = files.filter((file) => thaiCharacterPattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("project request validation", () => {
  it("accepts allowed academic programs and optional empty value", () => {
    for (const program of academicPrograms) {
      expect(projectRequestSchema.safeParse(basePayload({ academicProgram: program })).success).toBe(true);
    }

    expect(projectRequestSchema.safeParse(basePayload({ academicProgram: "" })).success).toBe(true);
  });

  it("rejects arbitrary academic programs", () => {
    expect(projectRequestSchema.safeParse(basePayload({ academicProgram: "BBA" })).success).toBe(false);
  });

  it("validates listed project types and requires custom text for Other", () => {
    expect(normalizeProjectType({ category: "Open House" })).toEqual({
      category: "Open House",
      custom: null,
      displayName: "Open House"
    });
    expect(() => normalizeProjectType({ category: "Other", custom: "  " })).toThrow("Specify Project Type");
    expect(normalizeProjectType({ category: "Other", custom: " Student Forum " })).toEqual({
      category: "Other",
      custom: "Student Forum",
      displayName: "Student Forum"
    });
    expect(() => normalizeProjectType({ category: "Anything Else" })).toThrow("Project Type");
  });

  it("validates date-only ranges without timezone conversion", () => {
    expect(isDateOnly("2026-08-03")).toBe(true);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "2026-08-03", endDate: "2026-08-04" })).success).toBe(true);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "2026-08-05", endDate: "2026-08-04" })).success).toBe(false);
    expect(projectRequestSchema.safeParse(basePayload({ startDate: "", endDate: "2026-08-04" })).success).toBe(false);
  });

  it("validates student directory prefix, domain, and active status", () => {
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@student.chula.ac.th", isActive: true })).toBe(true);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6630000000@student.chula.ac.th", isActive: true })).toBe(false);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@chula.ac.th", isActive: true })).toBe(false);
    expect(validateStudentDirectoryRecord({ studentId: "6631234567", email: "6631234567@student.chula.ac.th", isActive: false })).toBe(false);
  });

  it("uses attachments as the project attachment field name", () => {
    expect(projectAttachmentFieldName).toBe("attachments");
  });

  it("allows Save Draft with no attachment", () => {
    expect(validateProjectAttachments({ files: [], requireAttachment: false })).toEqual({ ok: true, files: [] });
  });

  it("returns a normal validation result for Submit Project with no attachment", () => {
    expect(() => validateProjectAttachments({ files: [], requireAttachment: true })).not.toThrow();
    expect(validateProjectAttachments({ files: [], requireAttachment: true })).toEqual({
      ok: false,
      message: missingSubmissionAttachmentMessage
    });
  });

  it("allows Submit Project with one valid attachment", () => {
    const file = validAttachment("proposal.pdf", "application/pdf");
    expect(validateProjectAttachments({ files: [file], requireAttachment: true })).toEqual({ ok: true, files: [file] });
  });

  it("ignores empty File placeholders when extracting attachments", () => {
    const formData = new FormData();
    formData.append(projectAttachmentFieldName, new File([], "", { type: "application/octet-stream" }));

    expect(getProjectAttachments(formData)).toEqual([]);
  });

  it("rejects oversized attachments", () => {
    const file = fileLike({ name: "large.pdf", type: "application/pdf", size: maxAttachmentBytes + 1 });
    expect(validateProjectAttachments({ files: [file], requireAttachment: true })).toEqual({
      ok: false,
      message: "Each attachment must be 50 MB or smaller."
    });
  });

  it("rejects unsupported attachment MIME types", () => {
    const file = validAttachment("script.js", "text/javascript");
    expect(validateProjectAttachments({ files: [file], requireAttachment: true })).toEqual({
      ok: false,
      message: "One or more selected files use an unsupported file type."
    });
  });

  it("accepts multiple valid attachments", () => {
    const files = [
      validAttachment("proposal.pdf", "application/pdf"),
      validAttachment("budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ];

    expect(validateProjectAttachments({ files, requireAttachment: true })).toEqual({ ok: true, files });
  });

  it("validates direct-upload file metadata with the same size and MIME rules", () => {
    expect(validateProjectAttachmentMetadata({
      files: [{ name: "proposal.pdf", size: 320_000, type: "application/pdf" }],
      requireAttachment: true
    })).toEqual({
      ok: true,
      files: [{ name: "proposal.pdf", size: 320_000, type: "application/pdf" }]
    });

    expect(validateProjectAttachmentMetadata({
      files: [{ name: "large.pdf", size: maxAttachmentBytes + 1, type: "application/pdf" }],
      requireAttachment: true
    })).toEqual({
      ok: false,
      message: "Each attachment must be 50 MB or smaller."
    });
  });

  it("keeps create-project files out of the form Server Action request", () => {
    const formSource = readFileSync(join(process.cwd(), "src/app/projects/new/create-project-form.tsx"), "utf8");

    expect(formSource).toContain("uploadToSignedUrl");
    expect(formSource).toContain("prepareProjectUploadAction");
    expect(formSource).toContain("finalizeProjectUploadAction");
    expect(formSource).not.toContain("action={createProjectAction}");
  });
});

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Project title",
    abstract: "Abstract",
    academicProgram: "ICE",
    projectTypeCategory: "CSR Trip",
    projectTypeCustom: "",
    startDate: "2026-08-03",
    endDate: "2026-08-04",
    intent: "submit",
    ...overrides
  };
}

function validAttachment(name: string, type: string) {
  return new File(["content"], name, { type });
}

function fileLike(input: { name: string; type: string; size: number }) {
  return {
    name: input.name,
    type: input.type,
    size: input.size,
    arrayBuffer: async () => new ArrayBuffer(0)
  } as File;
}
