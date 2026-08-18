import type { Project, ProjectDocument } from "./types";

export const completedDocumentType = "Completed Document";

export function getCompletedDocument(project: Project): ProjectDocument | undefined {
  return project.documents.find((document) => document.documentType === completedDocumentType);
}

export function isCompletedDocument(document: ProjectDocument): boolean {
  return document.documentType === completedDocumentType;
}
