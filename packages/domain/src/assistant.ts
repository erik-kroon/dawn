import type { ReportSourceRef } from "./reports";

export type AssistantMessageRole = "user" | "assistant";

export type AssistantToolRisk = "read" | "suggest" | "draft" | "mutate" | "external_side_effect";

export type AssistantToolCallStatus = "completed" | "refused";

export type AssistantActionApprovalStatus = "pending" | "approved" | "rejected" | "executed";

export type AssistantThread = {
  id: string;
  teamId: string;
  title: string;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessage = {
  id: string;
  threadId: string;
  teamId: string;
  role: AssistantMessageRole;
  content: string;
  sourceRefs: ReportSourceRef[];
  createdAt: string;
};

export type AssistantToolCall = {
  id: string;
  threadId: string;
  messageId: string;
  teamId: string;
  toolName: string;
  risk: AssistantToolRisk;
  status: AssistantToolCallStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  sourceRefs: ReportSourceRef[];
  createdAt: string;
};

export type AssistantActionApproval = {
  id: string;
  threadId: string;
  requestedByMessageId: string;
  teamId: string;
  toolName: string;
  risk: AssistantToolRisk;
  status: AssistantActionApprovalStatus;
  input: Record<string, unknown>;
  preview: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  sourceRefs: ReportSourceRef[];
  requestedByActorId: string;
  approvedByActorId?: string | null;
  rejectedByActorId?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  executedAt?: string | null;
};
