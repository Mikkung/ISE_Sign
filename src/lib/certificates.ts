import { createHash } from "crypto";
import { certificationStatement } from "@/lib/constants";
import type { ApprovalAction, Project } from "@/lib/types";

export function createDocumentHash(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createVerificationCode(projectId: string, completedAt: string): string {
  const digest = createHash("sha256").update(`${projectId}:${completedAt}`).digest("hex");
  return `ISE-${digest.slice(0, 10).toUpperCase()}`;
}

export function buildCertificateSummary(project: Project, actions: ApprovalAction[]) {
  const completedAt = project.completedAt ?? new Date().toISOString();
  return {
    projectId: project.code,
    projectTitle: project.title,
    studentName: project.student.displayName,
    submissionDate: project.submittedAt,
    completionDate: completedAt,
    finalDocumentVersion: project.documents[0]?.latestVersion.versionNumber ?? null,
    documentHash: project.documents[0]?.latestVersion.sha256Hash ?? null,
    approvalCount: actions.filter((action) => action.decision === "approved").length,
    certificationStatement,
    verificationCode: createVerificationCode(project.id, completedAt)
  };
}
