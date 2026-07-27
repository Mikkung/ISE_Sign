export type UserRole = "student" | "staff" | "approver" | "admin";

export type ProjectStatus =
  | "draft"
  | "submitted"
  | "staff_review"
  | "revision_required"
  | "staff_approved"
  | "approval_pending"
  | "partially_approved"
  | "rejected"
  | "approved"
  | "completed"
  | "cancelled";

export type WorkflowStepStatus =
  | "not_started"
  | "waiting"
  | "in_progress"
  | "revision_required"
  | "approved"
  | "rejected"
  | "skipped"
  | "completed"
  | "overdue";

export type ApprovalDecision = "approved" | "rejected" | "revision_requested";
export type StepMode = "sequential" | "parallel";
export type CompletionRule = "all" | "any" | "minimum";
export type CommentVisibility = "shared" | "internal";
export type NotificationChannel = "in_app" | "email";
export type ReminderEventType =
  | "initial_notification"
  | "unopened_reminder"
  | "no_action_reminder"
  | "due_soon"
  | "overdue"
  | "staff_notice"
  | "escalation"
  | "repeat_escalation";

export interface Profile {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  unitName?: string;
  position?: string;
}

export interface ProjectDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  active: boolean;
  revisionNote?: string;
  uploadedAt: string;
  uploadedBy: Profile;
}

export interface ProjectDocument {
  id: string;
  documentType: string;
  latestVersion: ProjectDocumentVersion;
  versions: ProjectDocumentVersion[];
}

export interface ProjectComment {
  id: string;
  visibility: CommentVisibility;
  body: string;
  author: Profile;
  createdAt: string;
  workflowStepId?: string;
  resolved: boolean;
  edited: boolean;
}

export interface WorkflowApprover {
  id: string;
  profile: Profile;
  status: "waiting" | "opened" | "approved" | "rejected" | "revision_requested" | "invalidated";
  assignedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  dueAt?: string;
  completedAt?: string;
  reminderCount: number;
  escalationLevel: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  order: number;
  mode: StepMode;
  status: WorkflowStepStatus;
  completionRule: CompletionRule;
  minimumApprovals: number | null;
  certificationRequired: boolean;
  commentsRequired: boolean;
  revisionAllowed: boolean;
  dueAt?: string;
  approvers: WorkflowApprover[];
}

export interface ApprovalAction {
  id: string;
  assignmentId?: string;
  projectId: string;
  workflowStepId: string;
  approverId: string;
  decision: ApprovalDecision;
  documentVersionId: string;
  documentHash: string;
  certifiedAt?: string;
  comment?: string;
  invalidatedAt?: string;
}

export interface Project {
  id: string;
  code: string;
  title: string;
  abstract: string;
  status: ProjectStatus;
  projectType: string;
  academicProgram: string;
  student: Profile;
  members: Profile[];
  assignedStaff?: Profile;
  currentStep?: string;
  currentResponsible?: string;
  dueAt?: string;
  submittedAt?: string;
  completedAt?: string;
  lastActivityAt: string;
  nextAction: string;
  documents: ProjectDocument[];
  comments: ProjectComment[];
  workflow: WorkflowStep[];
}

export interface ReminderPolicy {
  unopenedAfterDays: number;
  noActionAfterDays: number;
  staffNoticeAfterDays: number;
  escalationAfterDays: number;
  repeatEscalationEveryDays: number;
  dueSoonBeforeDays: number;
}

export interface ReminderAssignmentState {
  assignmentId: string;
  projectId: string;
  stepId: string;
  approverId: string;
  status?: "waiting" | "opened" | "approved" | "rejected" | "revision_requested" | "invalidated" | "cancelled";
  assignedAt: Date;
  firstOpenedAt: Date | null;
  completedAt: Date | null;
  dueAt: Date | null;
  lastReminderAt: Date | null;
  lastReminderType: ReminderEventType | null;
  reminderCount: number;
  escalationLevel: number;
}

export interface ReminderCommand {
  assignmentId: string;
  type: ReminderEventType;
  channel: NotificationChannel;
  dedupeKey: string;
  message: string;
}
