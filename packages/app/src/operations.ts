import {
  isTransactionReadyForAccountantExport,
  type Actor,
  type ApiKey,
  type AutomationRule,
  type AutomationRun,
  type AssistantActionApproval,
  type AssistantMessage,
  type AssistantThread,
  type AssistantToolCall,
  type BusinessInsight,
  type Customer,
  type CustomerContact,
  type InvoiceDraft,
  type InvoicePayment,
  type IntegrationSyncRun,
  type OAuthApp,
  type OAuthGrant,
  type Product,
  type Project,
  type ProjectMember,
  type RecurringInvoiceSchedule,
  type TimeEntry,
  type Transaction,
  type WebhookDelivery,
  type WebhookSubscription,
} from "@dawn/domain";
import { outboxDispatchRetryPolicy } from "@dawn/jobs";

import {
  AppError,
  resolveTeamAccess,
  type AuditLogEntry,
  type BankConnectionSummary,
  type BusinessDocument,
  type DawnRepository,
  type InboxItem,
  type IntegrationConnectionSummary,
  type JobRun,
  type OutboxEvent,
  type ProviderSyncRun,
  type ReviewWorkspaceData,
  type TeamAccessRepository,
  type TeamAlias,
  type TransactionReviewContext,
  type TransactionReviewRepository,
  type TransactionalRepository,
} from "./index";

export type OperationsWorkspaceInput = {
  teamId?: string;
  limit?: number;
  accountantClose?: AccountantClosePeriod;
  audit?: {
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
  };
};

export type OperationsMetricSnapshot = {
  queueDepth: number;
  failedJobs: number;
  deadLetters: number;
  providerFailures: number;
  integrationFailures: number;
  webhookFailures: number;
  automationFailures: number;
  syncLagSeconds: number | null;
  apiLatencyP95Ms: number | null;
  aiCostCents: number;
};

export type AccountantClosePeriod = {
  from: string;
  to: string;
};

export type AccountantCloseReadinessStatus = "empty" | "ready" | "needs_work" | "blocked";

export type AccountantCloseReadiness = {
  period: AccountantClosePeriod;
  status: AccountantCloseReadinessStatus;
  transactionCount: number;
  readyToExportCount: number;
  exportedCount: number;
  missingReceiptCount: number;
  needsReviewCount: number;
  exportingCount: number;
  exportFailedCount: number;
  excludedCount: number;
  archivedCount: number;
  actionableCount: number;
  nextStep: string;
};

export type DataWorkflowStatus = {
  type: "team_data_export" | "team_data_deletion";
  status: "available" | "queued" | "staged";
  description: string;
  nextStep: string;
};

export type JobRunAction = {
  jobRunId: string;
  outboxEventId: string;
  jobType: JobRun["jobType"];
  status: "queued" | "retryable" | "dead_lettered";
  canRetry: boolean;
  reason: string;
  nextStep: string;
  nextAttemptAt: string | null;
};

export type RequestTeamDataExportCommand = {
  teamId: string;
  format?: "json";
  idempotencyKey: string;
};

export type RequestTeamDataDeletionCommand = {
  teamId: string;
  confirmTeamId: string;
  reason?: string | null;
  idempotencyKey: string;
};

export type GateTeamDataDeletionCommand = {
  teamId: string;
  sourceOutboxEventId: string;
  idempotencyKey: string;
};

export type GateTeamDataDeletionResult = {
  teamId: string;
  sourceOutboxEventId: string;
  nextStep: string;
  replayed?: boolean;
};

export type DataWorkflowRequestResult = {
  teamId: string;
  workflow: DataWorkflowStatus;
  requestedAt: string;
  replayed?: boolean;
};

export type CompleteTeamDataExportCommand = {
  teamId: string;
  format?: "json";
  sourceOutboxEventId: string;
  idempotencyKey: string;
  generatedAt?: string;
};

export type TeamDataExportArchiveStorage = {
  put(input: { objectKey: string; body: ArrayBuffer; contentType: string }): Promise<void>;
};

export type CompleteTeamDataExportResult = {
  objectKey: string;
  byteSize: number;
  contentType: string;
  snapshot: TeamDataExportSnapshot;
  replayed?: boolean;
};

export type TeamDataExportSnapshot = {
  schemaVersion: 1;
  teamId: string;
  format: "json";
  generatedAt: string;
  sourceOutboxEventId: string;
  ledger: ReviewWorkspaceData;
  banking: {
    connections: BankConnectionSummary[];
  };
  documents: {
    documents: BusinessDocument[];
    inboxItems: InboxItem[];
    aliases: TeamAlias[];
  };
  billing: {
    customers: Customer[];
    contacts: CustomerContact[];
    products: Product[];
    invoices: InvoiceDraft[];
    payments: InvoicePayment[];
    recurringSchedules: RecurringInvoiceSchedule[];
  };
  projects: {
    projects: Project[];
    members: ProjectMember[];
    timeEntries: TimeEntry[];
  };
  reporting: {
    insights: BusinessInsight[];
  };
  assistant: {
    conversations: Array<{
      thread: AssistantThread;
      messages: AssistantMessage[];
      toolCalls: AssistantToolCall[];
      actionApprovals: AssistantActionApproval[];
    }>;
    pendingApprovals: AssistantActionApproval[];
  };
  automations: {
    rules: AutomationRule[];
    runs: AutomationRun[];
  };
  integrations: {
    connections: IntegrationConnectionSummary[];
    syncRuns: IntegrationSyncRun[];
  };
  developer: {
    apiKeys: ApiKey[];
    oauthApps: OAuthApp[];
    oauthGrants: OAuthGrant[];
    webhookSubscriptions: WebhookSubscription[];
    webhookDeliveries: WebhookDelivery[];
  };
  operations: {
    auditEvents: AuditLogEntry[];
    outboxEvents: OutboxEvent[];
    jobRuns: JobRun[];
    providerSyncRuns: ProviderSyncRun[];
    integrationSyncRuns: IntegrationSyncRun[];
    automationRuns: AutomationRun[];
    webhookDeliveries: WebhookDelivery[];
  };
};

export type OperationsWorkspace = {
  teamId: string;
  requestTrace: {
    requestId: string;
    actorId: string;
    actorType: Actor["type"];
  };
  metrics: OperationsMetricSnapshot;
  recentOutboxEvents: OutboxEvent[];
  recentJobRuns: JobRun[];
  recentProviderSyncRuns: ProviderSyncRun[];
  recentIntegrationSyncRuns: IntegrationSyncRun[];
  recentAutomationRuns: AutomationRun[];
  recentWebhookDeliveries: WebhookDelivery[];
  auditEvents: AuditLogEntry[];
  accountantClose: AccountantCloseReadiness | null;
  dataWorkflows: DataWorkflowStatus[];
  jobRunActions: JobRunAction[];
};

export type OperationsRepository = {
  listAuditEvents(input: {
    teamId: string;
    limit: number;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
  }): Promise<AuditLogEntry[]>;
  listOutboxEvents(teamId: string, limit: number): Promise<OutboxEvent[]>;
  listJobRuns(teamId: string, limit: number): Promise<JobRun[]>;
  listProviderSyncRuns(teamId: string, limit: number): Promise<ProviderSyncRun[]>;
  listIntegrationSyncRuns(teamId: string, limit: number): Promise<IntegrationSyncRun[]>;
  listAutomationRuns(teamId: string, limit: number): Promise<AutomationRun[]>;
  listWebhookDeliveries(teamId: string, limit: number): Promise<WebhookDelivery[]>;
};

export interface OperationsWriteRepository
  extends
    TeamAccessRepository,
    Pick<
      TransactionReviewRepository,
      "appendAuditEvent" | "appendOutboxEvent" | "getIdempotencyResult" | "saveIdempotencyResult"
    > {}

export interface OperationsUseCaseRepository
  extends
    TeamAccessRepository,
    OperationsRepository,
    Pick<TransactionReviewRepository, "listWorkspace">,
    TransactionalRepository<OperationsWriteRepository>,
    OperationsWriteRepository {}

export type TeamDataExportRepository = OperationsUseCaseRepository &
  Pick<
    DawnRepository,
    | "listWorkspace"
    | "listBankConnectionSummaries"
    | "listDocuments"
    | "listInboxItems"
    | "listTeamAliases"
    | "listCustomers"
    | "listCustomerContacts"
    | "listProducts"
    | "listInvoices"
    | "listInvoicePayments"
    | "listRecurringInvoiceSchedules"
    | "listProjects"
    | "listProjectMembers"
    | "listTimeEntries"
    | "listBusinessInsights"
    | "listAssistantThreads"
    | "listPendingAssistantActionApprovals"
    | "listAutomationRules"
    | "listAutomationRuns"
    | "listIntegrationConnectionSummaries"
    | "listIntegrationSyncRuns"
    | "listApiKeys"
    | "listOAuthApps"
    | "listOAuthGrants"
    | "listWebhookSubscriptions"
    | "listWebhookDeliveries"
    | "listJobRuns"
    | "listProviderSyncRuns"
    | "listAssistantMessages"
    | "listAssistantToolCalls"
    | "listAssistantActionApprovals"
  >;

const requestTeamDataExportOperation = "team_data.export.request";
const completeTeamDataExportOperation = "team_data.export.complete";
const requestTeamDataDeletionOperation = "team_data.deletion.request";
const gateTeamDataDeletionOperation = "team_data.deletion.gate";
const teamDataExportContentType = "application/json; charset=utf-8";
const teamDataWorkflowSystemActorId = "system:data-workflow";
const teamDataDeletionNextStep = "retention_provider_r2_cleanup_confirmation";

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function normalizeOperationsLimit(limit?: number) {
  return Math.min(Math.max(Number.isInteger(limit) ? (limit ?? 20) : 20, 1), 50);
}

function normalizeAccountantClosePeriod(
  period?: AccountantClosePeriod,
): AccountantClosePeriod | null {
  if (!period) {
    return null;
  }

  const from = normalizeCloseBoundary(period.from, "from");
  const to = normalizeCloseBoundary(period.to, "to");

  if (new Date(from).getTime() > new Date(to).getTime()) {
    throw new AppError("CONFLICT", "Accountant close period from must be before to");
  }

  return { from, to };
}

function normalizeCloseBoundary(value: string, label: "from" | "to") {
  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    throw new AppError("CONFLICT", `Accountant close period ${label} is invalid`);
  }

  return new Date(time).toISOString();
}

function normalizeExportLimit(limit?: number) {
  return Math.min(Math.max(Number.isInteger(limit) ? (limit ?? 500) : 500, 1), 1_000);
}

function buildAccountantCloseReadiness(
  workspace: ReviewWorkspaceData,
  period: AccountantClosePeriod,
): AccountantCloseReadiness {
  const fromTime = new Date(period.from).getTime();
  const toTime = new Date(period.to).getTime();
  const transactions = workspace.transactions.filter((transaction) => {
    const postedAt = new Date(transaction.postedAt).getTime();

    return Number.isFinite(postedAt) && postedAt >= fromTime && postedAt <= toTime;
  });
  const summary: AccountantCloseReadiness = {
    period,
    status: "empty",
    transactionCount: transactions.length,
    readyToExportCount: 0,
    exportedCount: 0,
    missingReceiptCount: 0,
    needsReviewCount: 0,
    exportingCount: 0,
    exportFailedCount: 0,
    excludedCount: 0,
    archivedCount: 0,
    actionableCount: 0,
    nextStep: "Import or sync transactions for this period before closing it.",
  };

  for (const transaction of transactions) {
    const status = accountantStatusForClose(transaction);

    switch (status) {
      case "ready_to_export":
        if (isTransactionReadyForAccountantExport(transaction)) {
          summary.readyToExportCount += 1;
        } else {
          summary.needsReviewCount += 1;
        }
        break;
      case "exported":
        summary.exportedCount += 1;
        break;
      case "missing_receipt":
        summary.missingReceiptCount += 1;
        break;
      case "needs_review":
      case "receipt_found":
        summary.needsReviewCount += 1;
        break;
      case "exporting":
        summary.exportingCount += 1;
        break;
      case "export_failed":
        summary.exportFailedCount += 1;
        break;
      case "excluded":
        summary.excludedCount += 1;
        break;
      case "archived":
        summary.archivedCount += 1;
        break;
    }
  }

  summary.actionableCount =
    summary.needsReviewCount + summary.missingReceiptCount + summary.exportFailedCount;

  if (summary.transactionCount === 0) {
    return summary;
  }

  if (summary.exportFailedCount > 0) {
    return {
      ...summary,
      status: "blocked",
      nextStep: "Retry or resolve failed accountant exports before closing this period.",
    };
  }

  if (summary.needsReviewCount > 0) {
    return {
      ...summary,
      status: "needs_work",
      nextStep: "Review and categorize transactions before closing this period.",
    };
  }

  if (summary.missingReceiptCount > 0) {
    return {
      ...summary,
      status: "needs_work",
      nextStep: "Attach or confirm receipt evidence before closing this period.",
    };
  }

  if (summary.exportingCount > 0) {
    return {
      ...summary,
      status: "needs_work",
      nextStep: "Wait for in-progress accountant exports before closing this period.",
    };
  }

  if (summary.readyToExportCount > 0) {
    return {
      ...summary,
      status: "ready",
      nextStep: "Generate or share the accountant packet for this period.",
    };
  }

  return {
    ...summary,
    status: "ready",
    nextStep: "Close evidence has already been exported, excluded, or archived for this period.",
  };
}

function accountantStatusForClose(
  transaction: Transaction,
): NonNullable<Transaction["accountantStatus"]> {
  return (
    transaction.accountantStatus ??
    (transaction.reviewState === "reviewed" ? "missing_receipt" : "needs_review")
  );
}

function operationsMetrics(input: {
  outboxEvents: OutboxEvent[];
  jobRuns: JobRun[];
  providerSyncRuns: ProviderSyncRun[];
  integrationSyncRuns: IntegrationSyncRun[];
  automationRuns: AutomationRun[];
  webhookDeliveries: WebhookDelivery[];
  now: Date;
}): OperationsMetricSnapshot {
  const syncTimes = [
    ...input.providerSyncRuns.map((run) => run.completedAt ?? run.startedAt),
    ...input.integrationSyncRuns.map((run) => run.completedAt ?? run.startedAt),
  ]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  const latestSyncTime = syncTimes.length ? Math.max(...syncTimes) : null;

  return {
    queueDepth: input.outboxEvents.filter(
      (event) => event.status === "pending" || event.status === "dispatching",
    ).length,
    failedJobs: input.jobRuns.filter((run) => run.status === "failed").length,
    deadLetters: input.outboxEvents.filter(
      (event) =>
        event.status === "failed" &&
        event.dispatchAttempts >= outboxDispatchRetryPolicy.maxAttempts,
    ).length,
    providerFailures: input.providerSyncRuns.filter((run) => run.status === "failed").length,
    integrationFailures: input.integrationSyncRuns.filter((run) => run.status === "failed").length,
    webhookFailures: input.webhookDeliveries.filter((delivery) => delivery.status === "failed")
      .length,
    automationFailures: input.automationRuns.filter((run) => run.status === "failed").length,
    syncLagSeconds:
      latestSyncTime === null
        ? null
        : Math.max(0, Math.floor((input.now.getTime() - latestSyncTime) / 1_000)),
    apiLatencyP95Ms: null,
    aiCostCents: 0,
  };
}

const sensitiveOperationalKeyPattern =
  /(authorization|cookie|password|secret|token|email|ssn|card|iban|routing|accountNumber)/i;
const emailTextPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerTextPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const apiTokenTextPattern = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g;

export function redactOperationalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return value
    .replace(emailTextPattern, "[redacted-email]")
    .replace(bearerTextPattern, "Bearer [redacted-token]")
    .replace(apiTokenTextPattern, "[redacted-token]");
}

export function redactOperationalValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactOperationalText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactOperationalValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveOperationalKeyPattern.test(key) ? "[redacted]" : redactOperationalValue(nested),
      ]),
    );
  }

  return value;
}

function redactAuditLogEntry(event: AuditLogEntry): AuditLogEntry {
  return {
    ...event,
    metadata: redactOperationalValue(event.metadata) as Record<string, unknown>,
  };
}

function redactOutboxEvent(event: OutboxEvent): OutboxEvent {
  return {
    ...event,
    payload: redactOperationalValue(event.payload) as Record<string, unknown>,
    lastError: redactOperationalText(event.lastError),
  };
}

function redactJobRun(run: JobRun): JobRun {
  return {
    ...run,
    error: redactOperationalText(run.error),
  };
}

function redactProviderSyncRun(run: ProviderSyncRun): ProviderSyncRun {
  return {
    ...run,
    error: redactOperationalText(run.error),
  };
}

function redactBankConnectionSummary(summary: BankConnectionSummary): BankConnectionSummary {
  return {
    ...summary,
    latestSyncRun: summary.latestSyncRun
      ? redactProviderSyncRun(summary.latestSyncRun)
      : summary.latestSyncRun,
  };
}

function redactIntegrationSyncRun(run: IntegrationSyncRun): IntegrationSyncRun {
  return {
    ...run,
    error: redactOperationalText(run.error),
    rawPayload: redactOperationalValue(run.rawPayload) as Record<string, unknown>,
  };
}

function redactAutomationRun(run: AutomationRun): AutomationRun {
  return {
    ...run,
    input: redactOperationalValue(run.input) as Record<string, unknown>,
    output: redactOperationalValue(run.output) as Record<string, unknown>,
    error: redactOperationalText(run.error),
  };
}

function redactWebhookDelivery(delivery: WebhookDelivery): WebhookDelivery {
  return {
    ...delivery,
    requestPayload: redactOperationalValue(delivery.requestPayload) as Record<string, unknown>,
    responseBody: redactOperationalText(delivery.responseBody),
    error: redactOperationalText(delivery.error),
  };
}

export async function listOperationsWorkspace(
  repository: OperationsUseCaseRepository,
  context: TransactionReviewContext,
  input: OperationsWorkspaceInput = {},
): Promise<OperationsWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "operations.read",
    "You cannot read operations for this team",
  );
  const limit = normalizeOperationsLimit(input.limit);
  const accountantClosePeriod = normalizeAccountantClosePeriod(input.accountantClose);
  const [
    auditEvents,
    outboxEvents,
    jobRuns,
    providerSyncRuns,
    integrationSyncRuns,
    automationRuns,
    webhookDeliveries,
    closeWorkspace,
  ] = await Promise.all([
    repository.listAuditEvents({
      teamId: access.teamId,
      limit,
      action: input.audit?.action ?? null,
      entityType: input.audit?.entityType ?? null,
      entityId: input.audit?.entityId ?? null,
      requestId: input.audit?.requestId ?? null,
    }),
    repository.listOutboxEvents(access.teamId, limit),
    repository.listJobRuns(access.teamId, limit),
    repository.listProviderSyncRuns(access.teamId, limit),
    repository.listIntegrationSyncRuns(access.teamId, limit),
    repository.listAutomationRuns(access.teamId, limit),
    repository.listWebhookDeliveries(access.teamId, limit),
    accountantClosePeriod
      ? repository.listWorkspace(context.actor, access.teamId)
      : Promise.resolve(null),
  ]);

  const redactedOutboxEvents = outboxEvents.map(redactOutboxEvent);
  const redactedJobRuns = jobRuns.map(redactJobRun);
  const redactedProviderSyncRuns = providerSyncRuns.map(redactProviderSyncRun);
  const redactedIntegrationSyncRuns = integrationSyncRuns.map(redactIntegrationSyncRun);
  const redactedAutomationRuns = automationRuns.map(redactAutomationRun);
  const redactedWebhookDeliveries = webhookDeliveries.map(redactWebhookDelivery);

  return {
    teamId: access.teamId,
    requestTrace: {
      requestId: context.requestId,
      actorId: context.actor.id,
      actorType: context.actor.type,
    },
    metrics: operationsMetrics({
      outboxEvents,
      jobRuns,
      providerSyncRuns,
      integrationSyncRuns,
      automationRuns,
      webhookDeliveries,
      now: new Date(),
    }),
    recentOutboxEvents: redactedOutboxEvents,
    recentJobRuns: redactedJobRuns,
    recentProviderSyncRuns: redactedProviderSyncRuns,
    recentIntegrationSyncRuns: redactedIntegrationSyncRuns,
    recentAutomationRuns: redactedAutomationRuns,
    recentWebhookDeliveries: redactedWebhookDeliveries,
    auditEvents: auditEvents.map(redactAuditLogEntry),
    accountantClose:
      accountantClosePeriod && closeWorkspace
        ? buildAccountantCloseReadiness(closeWorkspace, accountantClosePeriod)
        : null,
    dataWorkflows: dataWorkflowStatuses(outboxEvents),
    jobRunActions: jobRunActions(redactedJobRuns, redactedOutboxEvents),
  };
}

export async function requestTeamDataExport(
  repository: OperationsUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestTeamDataExportCommand,
): Promise<DataWorkflowRequestResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const operationsRepository = transactionRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Team data export not found");

    await resolveTeamAccess(
      operationsRepository,
      { ...context, teamId: command.teamId },
      "operations.read",
      "You cannot request data exports for this team",
    );

    const normalized = {
      teamId: command.teamId,
      format: command.format ?? "json",
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await operationsRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestTeamDataExportOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different data export request",
        );
      }

      return { ...(replayed.result as DataWorkflowRequestResult), replayed: true };
    }

    const requestedAt = new Date().toISOString();
    const result: DataWorkflowRequestResult = {
      teamId: command.teamId,
      workflow: queuedDataWorkflowStatus("team_data_export", requestedAt),
      requestedAt,
      replayed: false,
    };

    await operationsRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team_data.export_requested",
      entityType: "team",
      entityId: command.teamId,
      metadata: { format: normalized.format },
    });
    await operationsRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team_data.export_requested",
      version: 1,
      payload: {
        workflowType: "team_data_export",
        format: normalized.format,
        requestedAt,
      },
    });
    await operationsRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestTeamDataExportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

type TeamDataExportCompletionRecord = {
  objectKey: string;
  byteSize: number;
  contentType: string;
  generatedAt: string;
};

export async function completeTeamDataExport(
  repository: TeamDataExportRepository,
  storage: TeamDataExportArchiveStorage,
  command: CompleteTeamDataExportCommand,
): Promise<CompleteTeamDataExportResult> {
  const normalized = {
    teamId: command.teamId,
    format: command.format ?? "json",
    sourceOutboxEventId: command.sourceOutboxEventId,
  };
  const fingerprint = JSON.stringify(normalized);
  const replayed = await repository.getIdempotencyResult(
    command.teamId,
    teamDataWorkflowSystemActorId,
    completeTeamDataExportOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for a different data export completion",
      );
    }

    const completion = parseTeamDataExportCompletionRecord(replayed.result);

    if (!completion) {
      throw new AppError("CONFLICT", "Stored team data export completion result is invalid");
    }

    return {
      objectKey: completion.objectKey,
      byteSize: completion.byteSize,
      contentType: completion.contentType,
      snapshot: await buildTeamDataExportSnapshot(repository, {
        teamId: command.teamId,
        sourceOutboxEventId: command.sourceOutboxEventId,
        generatedAt: completion.generatedAt,
      }),
      replayed: true,
    };
  }

  const snapshot = await buildTeamDataExportSnapshot(repository, {
    teamId: command.teamId,
    sourceOutboxEventId: command.sourceOutboxEventId,
    generatedAt: command.generatedAt,
  });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const body = exactArrayBuffer(new TextEncoder().encode(json));
  const objectKey = teamDataExportObjectKey({
    teamId: command.teamId,
    sourceOutboxEventId: command.sourceOutboxEventId,
  });

  await storage.put({
    objectKey,
    body,
    contentType: teamDataExportContentType,
  });

  const completion: TeamDataExportCompletionRecord = {
    objectKey,
    byteSize: body.byteLength,
    contentType: teamDataExportContentType,
    generatedAt: snapshot.generatedAt,
  };

  await repository.withTransaction(async (transactionRepository) => {
    const operationsRepository = transactionRepository;

    await operationsRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: teamDataWorkflowSystemActorId,
      requestId: command.idempotencyKey,
      action: "team_data.export_archive_written",
      entityType: "team",
      entityId: command.teamId,
      metadata: {
        format: normalized.format,
        sourceOutboxEventId: command.sourceOutboxEventId,
        objectKey,
        byteSize: body.byteLength,
        contentType: teamDataExportContentType,
        generatedAt: snapshot.generatedAt,
      },
    });
    await operationsRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: teamDataWorkflowSystemActorId,
      operation: completeTeamDataExportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: completion,
    });
  });

  return {
    objectKey,
    byteSize: body.byteLength,
    contentType: teamDataExportContentType,
    snapshot,
  };
}

function parseTeamDataExportCompletionRecord(
  value: unknown,
): TeamDataExportCompletionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<TeamDataExportCompletionRecord>;

  if (
    typeof record.objectKey !== "string" ||
    typeof record.byteSize !== "number" ||
    !Number.isSafeInteger(record.byteSize) ||
    typeof record.contentType !== "string" ||
    typeof record.generatedAt !== "string"
  ) {
    return null;
  }

  return {
    objectKey: record.objectKey,
    byteSize: record.byteSize,
    contentType: record.contentType,
    generatedAt: record.generatedAt,
  };
}

function teamDataExportObjectKey(input: { teamId: string; sourceOutboxEventId: string }) {
  return `teams/${objectKeySegment(input.teamId)}/exports/${objectKeySegment(
    input.sourceOutboxEventId,
  )}.json`;
}

function objectKeySegment(value: string) {
  return value.replace(/[^A-Za-z0-9._=-]/g, "_");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function buildTeamDataExportSnapshot(
  repository: TeamDataExportRepository,
  input: {
    teamId: string;
    sourceOutboxEventId: string;
    generatedAt?: string;
    limit?: number;
  },
): Promise<TeamDataExportSnapshot> {
  const limit = normalizeExportLimit(input.limit);
  const systemActor: Actor = { id: "system:data-export", type: "system" };
  const [
    ledger,
    bankingConnections,
    documents,
    inboxItems,
    aliases,
    customers,
    contacts,
    products,
    invoices,
    payments,
    recurringSchedules,
    projects,
    projectMembers,
    timeEntries,
    insights,
    assistantThreads,
    pendingAssistantApprovals,
    automationRules,
    automationWorkflowRuns,
    integrationConnections,
    integrationWorkflowSyncRuns,
    apiKeys,
    oauthApps,
    oauthGrants,
    webhookSubscriptions,
    developerWebhookDeliveries,
    auditEvents,
    outboxEvents,
    jobRuns,
    providerSyncRuns,
    operationalIntegrationSyncRuns,
    operationalAutomationRuns,
    operationalWebhookDeliveries,
  ] = await Promise.all([
    repository.listWorkspace(systemActor, input.teamId),
    repository.listBankConnectionSummaries(input.teamId),
    repository.listDocuments(input.teamId),
    repository.listInboxItems(input.teamId),
    repository.listTeamAliases(input.teamId),
    repository.listCustomers(input.teamId),
    repository.listCustomerContacts(input.teamId),
    repository.listProducts(input.teamId),
    repository.listInvoices(input.teamId),
    repository.listInvoicePayments(input.teamId),
    repository.listRecurringInvoiceSchedules(input.teamId),
    repository.listProjects(input.teamId),
    repository.listProjectMembers(input.teamId),
    repository.listTimeEntries(input.teamId),
    repository.listBusinessInsights({ teamId: input.teamId }),
    repository.listAssistantThreads(input.teamId),
    repository.listPendingAssistantActionApprovals(input.teamId),
    repository.listAutomationRules(input.teamId),
    repository.listAutomationRuns(input.teamId, limit),
    repository.listIntegrationConnectionSummaries(input.teamId),
    repository.listIntegrationSyncRuns(input.teamId, limit),
    repository.listApiKeys(input.teamId),
    repository.listOAuthApps(input.teamId),
    repository.listOAuthGrants(input.teamId),
    repository.listWebhookSubscriptions(input.teamId),
    repository.listWebhookDeliveries(input.teamId, limit),
    repository.listAuditEvents({ teamId: input.teamId, limit }),
    repository.listOutboxEvents(input.teamId, limit),
    repository.listJobRuns(input.teamId, limit),
    repository.listProviderSyncRuns(input.teamId, limit),
    repository.listIntegrationSyncRuns(input.teamId, limit),
    repository.listAutomationRuns(input.teamId, limit),
    repository.listWebhookDeliveries(input.teamId, limit),
  ]);
  const assistantConversations = await Promise.all(
    assistantThreads.map(async (thread) => ({
      thread,
      messages: await repository.listAssistantMessages(thread.id),
      toolCalls: await repository.listAssistantToolCalls(thread.id),
      actionApprovals: await repository.listAssistantActionApprovals(thread.id),
    })),
  );

  return {
    schemaVersion: 1,
    teamId: input.teamId,
    format: "json",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceOutboxEventId: input.sourceOutboxEventId,
    ledger,
    banking: {
      connections: bankingConnections.map(redactBankConnectionSummary),
    },
    documents: {
      documents,
      inboxItems,
      aliases,
    },
    billing: {
      customers,
      contacts,
      products,
      invoices,
      payments,
      recurringSchedules,
    },
    projects: {
      projects,
      members: projectMembers,
      timeEntries,
    },
    reporting: {
      insights,
    },
    assistant: {
      conversations: assistantConversations,
      pendingApprovals: pendingAssistantApprovals,
    },
    automations: {
      rules: automationRules,
      runs: automationWorkflowRuns.map(redactAutomationRun),
    },
    integrations: {
      connections: integrationConnections,
      syncRuns: integrationWorkflowSyncRuns.map(redactIntegrationSyncRun),
    },
    developer: {
      apiKeys,
      oauthApps,
      oauthGrants,
      webhookSubscriptions,
      webhookDeliveries: developerWebhookDeliveries.map(redactWebhookDelivery),
    },
    operations: {
      auditEvents: auditEvents.map(redactAuditLogEntry),
      outboxEvents: outboxEvents.map(redactOutboxEvent),
      jobRuns: jobRuns.map(redactJobRun),
      providerSyncRuns: providerSyncRuns.map(redactProviderSyncRun),
      integrationSyncRuns: operationalIntegrationSyncRuns.map(redactIntegrationSyncRun),
      automationRuns: operationalAutomationRuns.map(redactAutomationRun),
      webhookDeliveries: operationalWebhookDeliveries.map(redactWebhookDelivery),
    },
  };
}

export async function requestTeamDataDeletion(
  repository: OperationsUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestTeamDataDeletionCommand,
): Promise<DataWorkflowRequestResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const operationsRepository = transactionRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Team data deletion not found");

    if (command.confirmTeamId !== command.teamId) {
      throw new AppError("CONFLICT", "Confirm the team ID before requesting deletion");
    }

    const access = await resolveTeamAccess(
      operationsRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot request deletion for this team",
    );

    if (access.role !== "owner") {
      throw new AppError("FORBIDDEN", "Only team owners can request tenant deletion");
    }

    const normalized = {
      teamId: command.teamId,
      confirmTeamId: command.confirmTeamId,
      reason: command.reason?.trim() || null,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await operationsRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestTeamDataDeletionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different data deletion request",
        );
      }

      return { ...(replayed.result as DataWorkflowRequestResult), replayed: true };
    }

    const requestedAt = new Date().toISOString();
    const result: DataWorkflowRequestResult = {
      teamId: command.teamId,
      workflow: queuedDataWorkflowStatus("team_data_deletion", requestedAt),
      requestedAt,
      replayed: false,
    };

    await operationsRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team_data.deletion_requested",
      entityType: "team",
      entityId: command.teamId,
      metadata: { reason: normalized.reason },
    });
    await operationsRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team_data.deletion_requested",
      version: 1,
      payload: {
        workflowType: "team_data_deletion",
        requestedAt,
        reason: normalized.reason,
      },
    });
    await operationsRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestTeamDataDeletionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function gateTeamDataDeletion(
  repository: OperationsUseCaseRepository,
  command: GateTeamDataDeletionCommand,
): Promise<GateTeamDataDeletionResult> {
  const fingerprint = JSON.stringify({
    teamId: command.teamId,
    sourceOutboxEventId: command.sourceOutboxEventId,
    nextStep: teamDataDeletionNextStep,
  });
  const replayed = await repository.getIdempotencyResult(
    command.teamId,
    teamDataWorkflowSystemActorId,
    gateTeamDataDeletionOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for a different data deletion gate",
      );
    }

    return { ...(replayed.result as GateTeamDataDeletionResult), replayed: true };
  }

  return repository.withTransaction(async (transactionRepository) => {
    const operationsRepository = transactionRepository;
    const result: GateTeamDataDeletionResult = {
      teamId: command.teamId,
      sourceOutboxEventId: command.sourceOutboxEventId,
      nextStep: teamDataDeletionNextStep,
    };

    await operationsRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: teamDataWorkflowSystemActorId,
      requestId: command.idempotencyKey,
      action: "team_data.deletion_job_gated",
      entityType: "team",
      entityId: command.teamId,
      metadata: {
        sourceOutboxEventId: command.sourceOutboxEventId,
        nextStep: teamDataDeletionNextStep,
      },
    });
    await operationsRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: teamDataWorkflowSystemActorId,
      operation: gateTeamDataDeletionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

function dataWorkflowStatuses(outboxEvents: OutboxEvent[]): DataWorkflowStatus[] {
  return [
    queuedDataWorkflowStatus(
      "team_data_export",
      latestWorkflowRequestAt(outboxEvents, "team_data.export_requested"),
    ),
    queuedDataWorkflowStatus(
      "team_data_deletion",
      latestWorkflowRequestAt(outboxEvents, "team_data.deletion_requested"),
    ),
  ];
}

function jobRunActions(jobRuns: JobRun[], outboxEvents: OutboxEvent[]): JobRunAction[] {
  const outboxEventsById = new Map(outboxEvents.map((event) => [event.id, event]));

  return jobRuns
    .filter((run) => run.status === "failed" || run.status === "queued")
    .map((run) => {
      const event = outboxEventsById.get(run.outboxEventId) ?? null;
      const deadLettered =
        event?.status === "failed" &&
        event.dispatchAttempts >= outboxDispatchRetryPolicy.maxAttempts;

      if (deadLettered) {
        return {
          jobRunId: run.id,
          outboxEventId: run.outboxEventId,
          jobType: run.jobType,
          status: "dead_lettered" as const,
          canRetry: false,
          reason:
            run.error ??
            event.lastError ??
            "Job exhausted the retry policy and needs operator review.",
          nextStep:
            "Inspect the redacted error, fix the underlying provider or payload issue, then manually requeue or replay the originating outbox event.",
          nextAttemptAt: null,
        };
      }

      if (run.status === "failed") {
        return {
          jobRunId: run.id,
          outboxEventId: run.outboxEventId,
          jobType: run.jobType,
          status: "retryable" as const,
          canRetry: true,
          reason: run.error ?? event?.lastError ?? "Job failed and is eligible for retry.",
          nextStep: event?.nextAttemptAt
            ? `Worker retry is scheduled for ${event.nextAttemptAt}.`
            : "Requeue the originating outbox event after fixing the redacted error cause.",
          nextAttemptAt: event?.nextAttemptAt ?? null,
        };
      }

      return {
        jobRunId: run.id,
        outboxEventId: run.outboxEventId,
        jobType: run.jobType,
        status: "queued" as const,
        canRetry: false,
        reason: "Job is queued or dispatching.",
        nextStep: "Wait for the worker to process this job before retrying.",
        nextAttemptAt: event?.nextAttemptAt ?? null,
      };
    });
}

function queuedDataWorkflowStatus(
  type: DataWorkflowStatus["type"],
  requestedAt?: string | null,
): DataWorkflowStatus {
  if (type === "team_data_export") {
    return {
      type,
      status: requestedAt ? "queued" : "available",
      description:
        "Team data export gathers team-owned audit, outbox, jobs, documents, ledger, billing, projects, assistant, automation, integration, and developer records.",
      nextStep: requestedAt
        ? `Export request queued ${requestedAt}. Worker delivery will write a signed archive to R2.`
        : "Request an export to queue an audited archive job.",
    };
  }

  return {
    type,
    status: requestedAt ? "queued" : "staged",
    description:
      "Tenant deletion requires owner confirmation, retention checks, provider revocation, R2 object cleanup, search/vector projection cleanup, and audit-safe tombstones.",
    nextStep: requestedAt
      ? `Deletion request queued ${requestedAt}. Execution remains gated by retention and provider cleanup.`
      : "Confirm the team ID to queue an audited deletion request.",
  };
}

function latestWorkflowRequestAt(outboxEvents: OutboxEvent[], eventType: string) {
  return (
    outboxEvents
      .filter((event) => event.type === eventType)
      .map((event) => event.occurredAt)
      .sort()
      .at(-1) ?? null
  );
}
