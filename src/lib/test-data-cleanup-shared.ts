import type { ProjectStatus } from "./types";

export const testDataCleanupConfirmation = "DELETE TEST PROJECTS";

export interface TestDataProjectRow {
  id: string;
  code: string;
  title: string;
  requester: string;
  requesterEmail: string;
  program: string;
  projectType: string;
  status: ProjectStatus;
  createdAt: string;
  submittedAt: string | null;
  documentCount: number;
  documentVersionCount: number;
  workflowStepCount: number;
  assignmentCount: number;
  approvalActionCount: number;
  commentCount: number;
  storageObjectCount: number;
  workflowStatus: string;
}
