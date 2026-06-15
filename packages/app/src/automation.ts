import type {
  AutomationActionType,
  AutomationApprovalPolicy,
  AutomationRule,
  AutomationRun,
  AutomationTrigger,
} from "@dawn/domain";
import {
  automationActionPermission,
  automationActionRequiresApproval,
  automationActionRisk,
} from "@dawn/domain";

import { reviewTransaction, type BankingUseCaseRepository } from "./banking-ledger";
import { createDraftInvoice, type BillingRepository } from "./billing";
import {
  AppError,
  resolveTeamAccess,
  type OutboxEvent,
  type TransactionReviewContext,
} from "./index";

export type AutomationWorkspace = {
  teamId: string;
  rules: AutomationRule[];
  recentRuns: AutomationRun[];
};

export type CreateAutomationRuleCommand = {
  teamId: string;
  name: string;
  trigger: AutomationTrigger;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  approvalPolicy: AutomationApprovalPolicy;
  idempotencyKey: string;
};

export type CreateAutomationRuleResult = {
  rule: AutomationRule;
  replayed: boolean;
};

export type RunAutomationForOutboxEventCommand = {
  teamId: string;
  outboxEventId: string;
  enforceCallerPermission?: boolean;
};

export type RunAutomationForOutboxEventResult = {
  scanned: number;
  runs: AutomationRun[];
};

export type AutomationRepository = {
  listAutomationRules(teamId: string): Promise<AutomationRule[]>;
  listAutomationRuns(teamId: string, limit: number): Promise<AutomationRun[]>;
  listEnabledAutomationRulesForEvent(input: {
    teamId: string;
    eventType: string;
  }): Promise<AutomationRule[]>;
  getOutboxEventForTeam(teamId: string, outboxEventId: string): Promise<OutboxEvent | null>;
  createAutomationRule(input: {
    ruleId: string;
    teamId: string;
    name: string;
    trigger: AutomationTrigger;
    actionType: AutomationActionType;
    actionConfig: Record<string, unknown>;
    approvalPolicy: AutomationApprovalPolicy;
    createdByActorId: string;
  }): Promise<AutomationRule>;
  createAutomationRun(input: {
    runId: string;
    teamId: string;
    ruleId: string;
    sourceOutboxEventId: string;
    status: AutomationRun["status"];
    actionType: AutomationActionType;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    error?: string | null;
    startedAt: string;
    finishedAt?: string | null;
  }): Promise<AutomationRun>;
};
export type AutomationUseCaseRepository = BankingUseCaseRepository &
  BillingRepository &
  AutomationRepository;

const createAutomationRuleOperation = "automation.rule.create";

export async function listAutomationWorkspace(
  repository: AutomationUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<AutomationWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "automations.read",
    "You cannot read automations for this team",
  );

  return {
    teamId: access.teamId,
    rules: await repository.listAutomationRules(access.teamId),
    recentRuns: await repository.listAutomationRuns(access.teamId, 10),
  };
}

export async function createAutomationRule(
  repository: AutomationUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateAutomationRuleCommand,
): Promise<CreateAutomationRuleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const automationRepository = transactionRepository as AutomationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Automation rule not found");

    await resolveTeamAccess(
      automationRepository,
      { ...context, teamId: command.teamId },
      "automations.write",
      "You cannot create automations for this team",
    );
    await resolveTeamAccess(
      automationRepository,
      { ...context, teamId: command.teamId },
      automationActionPermission(command.actionType),
      "You cannot create an automation for this action",
    );

    const normalized = normalizeAutomationRuleCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await automationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createAutomationRuleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different automation rule",
        );
      }

      return { ...(replayed.result as CreateAutomationRuleResult), replayed: true };
    }

    const rule = await automationRepository.createAutomationRule({
      ruleId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await automationRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "automation_rule.created",
      entityType: "automation_rule",
      entityId: rule.id,
      metadata: {
        trigger: rule.trigger,
        actionType: rule.actionType,
        approvalPolicy: rule.approvalPolicy,
      },
    });

    const result = { rule, replayed: false };

    await automationRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createAutomationRuleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function runAutomationsForOutboxEvent(
  repository: AutomationUseCaseRepository,
  context: TransactionReviewContext,
  command: RunAutomationForOutboxEventCommand,
): Promise<RunAutomationForOutboxEventResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const automationRepository = transactionRepository as AutomationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Outbox event not found");

    if (command.enforceCallerPermission !== false) {
      await resolveTeamAccess(
        automationRepository,
        { ...context, teamId: command.teamId },
        "automations.run",
        "You cannot run automations for this team",
      );
    }

    const event = await automationRepository.getOutboxEventForTeam(
      command.teamId,
      command.outboxEventId,
    );
    if (!event) {
      throw new AppError("NOT_FOUND", "Outbox event was not found");
    }

    const rules = await automationRepository.listEnabledAutomationRulesForEvent({
      teamId: command.teamId,
      eventType: event.type,
    });
    const runs: AutomationRun[] = [];

    for (const rule of rules) {
      runs.push(await executeAutomationRule(automationRepository, context, rule, event));
    }

    return {
      scanned: rules.length,
      runs,
    };
  });
}

function normalizeAutomationRuleCommand(command: CreateAutomationRuleCommand) {
  const name = command.name.trim();
  const eventType = command.trigger.eventType.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Automation rule name is required");
  }

  if (command.trigger.type !== "outbox_event" || !eventType) {
    throw new AppError("CONFLICT", "Automation rules require an outbox event trigger");
  }

  validateAutomationActionConfig(command.actionType, command.actionConfig);

  return {
    teamId: command.teamId,
    name,
    trigger: {
      type: "outbox_event" as const,
      eventType,
    },
    actionType: command.actionType,
    actionConfig: command.actionConfig,
    approvalPolicy: command.approvalPolicy,
  };
}

async function executeAutomationRule(
  repository: AutomationUseCaseRepository,
  context: TransactionReviewContext,
  rule: AutomationRule,
  event: OutboxEvent,
): Promise<AutomationRun> {
  const startedAt = new Date().toISOString();
  const input = {
    eventType: event.type,
    eventPayload: event.payload,
    actionConfig: rule.actionConfig,
  };

  try {
    await resolveTeamAccess(
      repository,
      { ...context, actor: { id: rule.createdByActorId, type: "user" }, teamId: rule.teamId },
      "automations.run",
      "Automation rule creator can no longer run automations for this team",
    );
    await resolveTeamAccess(
      repository,
      { ...context, actor: { id: rule.createdByActorId, type: "user" }, teamId: rule.teamId },
      automationActionPermission(rule.actionType),
      "Automation rule creator can no longer run this action",
    );

    if (
      automationActionRequiresApproval(rule.actionType) &&
      rule.approvalPolicy !== "auto_approve"
    ) {
      return repository.createAutomationRun({
        runId: crypto.randomUUID(),
        teamId: rule.teamId,
        ruleId: rule.id,
        sourceOutboxEventId: event.id,
        status: "approval_required",
        actionType: rule.actionType,
        input,
        output: {
          risk: automationActionRisk(rule.actionType),
          approvalPolicy: rule.approvalPolicy,
          message: "Automation action requires approval before execution",
        },
        error: null,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }

    const output = await executeAutomationAction(repository, context, rule, event);

    return repository.createAutomationRun({
      runId: crypto.randomUUID(),
      teamId: rule.teamId,
      ruleId: rule.id,
      sourceOutboxEventId: event.id,
      status: "succeeded",
      actionType: rule.actionType,
      input,
      output,
      error: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    return repository.createAutomationRun({
      runId: crypto.randomUUID(),
      teamId: rule.teamId,
      ruleId: rule.id,
      sourceOutboxEventId: event.id,
      status: "failed",
      actionType: rule.actionType,
      input,
      output: {},
      error: errorMessage(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }
}

async function executeAutomationAction(
  repository: AutomationUseCaseRepository,
  context: TransactionReviewContext,
  rule: AutomationRule,
  event: OutboxEvent,
) {
  if (rule.actionType === "categorize_transaction") {
    const transactionId =
      stringConfig(rule.actionConfig, "transactionId") ?? eventTransactionId(event);
    const categoryId = stringConfig(rule.actionConfig, "categoryId");

    if (!transactionId || !categoryId) {
      throw new AppError(
        "CONFLICT",
        "Categorization automations require transactionId and categoryId",
      );
    }

    const result = await reviewTransaction(
      repository,
      {
        ...context,
        actor: { id: rule.createdByActorId, type: "user" },
        teamId: rule.teamId,
      },
      {
        teamId: rule.teamId,
        transactionId,
        categoryId,
        idempotencyKey: `automation:${rule.id}:${event.id}:categorize`,
      },
    );

    return {
      transactionId: result.transaction.id,
      categoryId: result.transaction.categoryId,
      reviewState: result.transaction.reviewState,
    };
  }

  if (rule.actionType === "create_invoice_draft") {
    const customerId = stringConfig(rule.actionConfig, "customerId");
    const productId = stringConfig(rule.actionConfig, "productId");
    const product = productId ? await repository.getProductForTeam(rule.teamId, productId) : null;

    if (!customerId || !product) {
      throw new AppError(
        "CONFLICT",
        "Invoice draft automations require customerId and a valid productId",
      );
    }

    const issueDate = new Date().toISOString();
    const result = await createDraftInvoice(
      repository,
      {
        ...context,
        actor: { id: rule.createdByActorId, type: "user" },
        teamId: rule.teamId,
      },
      {
        teamId: rule.teamId,
        customerId,
        invoiceNumber:
          stringConfig(rule.actionConfig, "invoiceNumber") ??
          `AUTO-${issueDate.slice(0, 10).replaceAll("-", "")}`,
        issueDate,
        dueDate: null,
        currency: product.unitPrice.currency,
        discountBasisPoints: 0,
        notes: "Created by an automation rule.",
        lines: [
          {
            productId: product.id,
            description: product.name,
            quantityMilli: numberConfig(rule.actionConfig, "quantityMilli") ?? 1_000,
            unitPrice: product.unitPrice,
            taxRateBasisPoints: product.defaultTaxRateBasisPoints,
          },
        ],
        idempotencyKey: `automation:${rule.id}:${event.id}:invoice_draft`,
      },
    );

    return {
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      total: result.invoice.totals.total,
    };
  }

  if (rule.actionType === "create_notification") {
    const message =
      stringConfig(rule.actionConfig, "message") ??
      `Automation ${rule.name} ran for ${event.type}.`;

    await repository.appendOutboxEvent({
      teamId: rule.teamId,
      actorId: rule.createdByActorId,
      requestId: context.requestId,
      type: "notification.requested",
      version: 1,
      payload: {
        ruleId: rule.id,
        sourceOutboxEventId: event.id,
        message,
      },
    });

    return { message };
  }

  await repository.appendOutboxEvent({
    teamId: rule.teamId,
    actorId: rule.createdByActorId,
    requestId: context.requestId,
    type: "accounting_export.requested",
    version: 1,
    payload: {
      ruleId: rule.id,
      sourceOutboxEventId: event.id,
      exportType: stringConfig(rule.actionConfig, "exportType") ?? "transactions",
    },
  });

  return {
    exportType: stringConfig(rule.actionConfig, "exportType") ?? "transactions",
  };
}

function validateAutomationActionConfig(
  actionType: AutomationActionType,
  config: Record<string, unknown>,
) {
  if (actionType === "categorize_transaction" && !stringConfig(config, "categoryId")) {
    throw new AppError("CONFLICT", "Categorization automations require categoryId");
  }

  if (
    actionType === "create_invoice_draft" &&
    (!stringConfig(config, "customerId") || !stringConfig(config, "productId"))
  ) {
    throw new AppError("CONFLICT", "Invoice draft automations require customerId and productId");
  }
}

function eventTransactionId(event: OutboxEvent) {
  return typeof event.payload.transactionId === "string" ? event.payload.transactionId : null;
}

function stringConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  notFoundMessage: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", notFoundMessage);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
