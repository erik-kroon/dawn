import type { Permission } from "./identity";
import type { AssistantToolRisk } from "./assistant";

export type AutomationTriggerType = "outbox_event";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  eventType: string;
};

export type AutomationActionType =
  | "categorize_transaction"
  | "create_notification"
  | "create_invoice_draft"
  | "request_accounting_export";

export type AutomationApprovalPolicy = "require_approval" | "auto_approve";

export type AutomationRule = {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  approvalPolicy: AutomationApprovalPolicy;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRunStatus = "succeeded" | "failed" | "approval_required" | "skipped";

export type AutomationRun = {
  id: string;
  teamId: string;
  ruleId: string;
  sourceOutboxEventId: string;
  status: AutomationRunStatus;
  actionType: AutomationActionType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
};

export function automationActionPermission(actionType: AutomationActionType): Permission {
  if (actionType === "categorize_transaction") {
    return "transactions.categorize";
  }

  if (actionType === "create_invoice_draft") {
    return "invoices.write";
  }

  return "automations.run";
}

export function automationActionRisk(actionType: AutomationActionType): AssistantToolRisk {
  if (actionType === "create_notification") {
    return "draft";
  }

  if (actionType === "request_accounting_export") {
    return "external_side_effect";
  }

  return "mutate";
}

export function automationActionRequiresApproval(actionType: AutomationActionType) {
  return automationActionRisk(actionType) === "external_side_effect";
}
