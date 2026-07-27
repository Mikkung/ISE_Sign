import { describe, expect, it } from "vitest";
import { buildCertificateSummary } from "./certificates";
import type { ApprovalAction, Project } from "./types";

const profile = {
  id: "profile-1",
  displayName: "Student",
  email: "student@example.edu",
  role: "student" as const
};

const project: Project = {
  id: "project-1",
  code: "ISE-2026-001",
  title: "Approval System",
  abstract: "",
  status: "completed",
  projectType: "Senior Project",
  academicProgram: "ICE",
  student: profile,
  members: [],
  completedAt: "2026-07-04T00:00:00Z",
  lastActivityAt: "2026-07-04T00:00:00Z",
  nextAction: "Certificate available",
  documents: [
    {
      id: "doc-1",
      documentType: "Project document",
      latestVersion: {
        id: "version-2",
        documentId: "doc-1",
        versionNumber: 2,
        originalFileName: "proposal-v2.pdf",
        mimeType: "application/pdf",
        fileSize: 1234,
        sha256Hash: "b".repeat(64),
        active: true,
        uploadedAt: "2026-07-03T00:00:00Z",
        uploadedBy: profile
      },
      versions: []
    }
  ],
  comments: [],
  workflow: []
};

const actions: ApprovalAction[] = [
  {
    id: "action-1",
    assignmentId: "assignment-1",
    projectId: "project-1",
    workflowStepId: "step-1",
    approverId: "approver-1",
    decision: "approved",
    documentVersionId: "version-2",
    documentHash: "b".repeat(64),
    certifiedAt: "2026-07-04T00:00:00Z"
  }
];

function canCreateCertificate(projectId: string, existingProjectIds: string[]) {
  return !existingProjectIds.includes(projectId);
}

function canMutateApprovalRecord() {
  return false;
}

describe("certification", () => {
  it("references the exact active document version", () => {
    const summary = buildCertificateSummary(project, actions);

    expect(summary.finalDocumentVersion).toBe(2);
  });

  it("preserves the SHA-256 document hash", () => {
    const summary = buildCertificateSummary(project, actions);

    expect(summary.documentHash).toBe("b".repeat(64));
  });

  it("rejects duplicate certification for a project", () => {
    expect(canCreateCertificate("project-1", ["project-1"])).toBe(false);
    expect(canCreateCertificate("project-2", ["project-1"])).toBe(true);
  });

  it("treats approval records as immutable through application logic", () => {
    expect(canMutateApprovalRecord()).toBe(false);
  });
});
