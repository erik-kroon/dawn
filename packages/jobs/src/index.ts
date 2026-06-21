import { z } from "zod";

export const dawnQueueNames = {
  jobs: "dawn-jobs",
  deadLetter: "dawn-jobs-dlq",
} as const;

export const outboxDispatchRetryPolicy = {
  maxAttempts: 8,
  initialDelaySeconds: 30,
  maxDelaySeconds: 3_600,
  leaseSeconds: 300,
} as const;

export const outboxEventForJobSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  type: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  dispatchAttempts: z.number().int().nonnegative(),
});

export type OutboxEventForJob = z.infer<typeof outboxEventForJobSchema>;

export const outboxDispatchJobSchema = z.object({
  type: z.literal("outbox.dispatch"),
  outboxEventId: z.string().min(1),
  teamId: z.string().min(1),
  eventType: z.string().min(1),
  version: z.number().int().positive(),
  attempt: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

export const syncInvalidationJobSchema = z.object({
  type: z.literal("sync.invalidate"),
  teamId: z.string().min(1),
  collection: z.enum(["transactions", "projects"]),
  cursor: z.string().nullable(),
  changedIds: z.array(z.string().min(1)),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const documentExtractionJobSchema = z.object({
  type: z.literal("document.extract"),
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  versionId: z.string().min(1),
  inboxItemId: z.string().min(1),
  actorId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const transactionPendingInboxMatchJobSchema = z.object({
  type: z.literal("transaction.match_pending_inbox"),
  teamId: z.string().min(1),
  transactionId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const inboxMatchBidirectionalBatchJobSchema = z.object({
  type: z.literal("inbox.match_bidirectional_batch"),
  teamId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)),
  inboxItemIds: z.array(z.string().min(1)),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const transactionImportCommitJobSchema = z.object({
  type: z.literal("transaction_import.commit"),
  teamId: z.string().min(1),
  importSessionId: z.string().min(1),
  payloadObjectKey: z.string().min(1),
  actorId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const inboxMatchSuggestionsJobSchema = z.object({
  type: z.literal("inbox.match_suggestions"),
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const inboxProviderSyncJobSchema = z.object({
  type: z.literal("inbox.provider.sync"),
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  provider: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const recurringInvoiceGenerationJobSchema = z.object({
  type: z.literal("invoice.recurring.generate"),
  teamId: z.string().min(1),
  scheduleId: z.string().min(1),
  sourceInvoiceId: z.string().min(1),
  runAt: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const weeklyInsightGenerationJobSchema = z.object({
  type: z.literal("insights.weekly.generate"),
  teamId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const automationRunJobSchema = z.object({
  type: z.literal("automation.run"),
  teamId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  eventType: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const bankSyncJobSchema = z.object({
  type: z.literal("bank.sync"),
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  provider: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const fortnoxSyncJobSchema = z.object({
  type: z.literal("fortnox.sync"),
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  provider: z.literal("fortnox"),
  syncMode: z.enum(["initial", "incremental"]),
  cursor: z.record(z.string(), z.unknown()).nullable().optional(),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const fortnoxCreateInvoiceJobSchema = z.object({
  type: z.literal("fortnox.create_invoice"),
  teamId: z.string().min(1),
  handoffId: z.string().min(1),
  documentId: z.string().min(1),
  documentVersionId: z.string().min(1),
  signatureRequestId: z.string().min(1),
  connectionId: z.string().min(1),
  provider: z.literal("fortnox"),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const webhookDeliveryJobSchema = z.object({
  type: z.literal("webhook.deliver"),
  teamId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  eventType: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const teamDataExportJobSchema = z.object({
  type: z.literal("team_data.export"),
  teamId: z.string().min(1),
  format: z.literal("json"),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const accountantPacketExportJobSchema = z.object({
  type: z.literal("accountant_packet.export"),
  teamId: z.string().min(1),
  actorId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  transactionIds: z.array(z.string().min(1)),
  formats: z.array(z.enum(["csv", "xlsx"])).optional(),
  csvDelimiter: z.enum([",", ";", "\t"]).optional(),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const teamDataDeletionJobSchema = z.object({
  type: z.literal("team_data.delete"),
  teamId: z.string().min(1),
  sourceOutboxEventId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const dawnQueueMessageSchema = z.discriminatedUnion("type", [
  outboxDispatchJobSchema,
  syncInvalidationJobSchema,
  documentExtractionJobSchema,
  transactionPendingInboxMatchJobSchema,
  inboxMatchBidirectionalBatchJobSchema,
  transactionImportCommitJobSchema,
  inboxMatchSuggestionsJobSchema,
  inboxProviderSyncJobSchema,
  recurringInvoiceGenerationJobSchema,
  weeklyInsightGenerationJobSchema,
  automationRunJobSchema,
  bankSyncJobSchema,
  fortnoxSyncJobSchema,
  fortnoxCreateInvoiceJobSchema,
  webhookDeliveryJobSchema,
  teamDataExportJobSchema,
  accountantPacketExportJobSchema,
  teamDataDeletionJobSchema,
]);

export type OutboxDispatchJob = z.infer<typeof outboxDispatchJobSchema>;
export type SyncInvalidationJob = z.infer<typeof syncInvalidationJobSchema>;
export type DocumentExtractionJob = z.infer<typeof documentExtractionJobSchema>;
export type TransactionPendingInboxMatchJob = z.infer<typeof transactionPendingInboxMatchJobSchema>;
export type InboxMatchBidirectionalBatchJob = z.infer<typeof inboxMatchBidirectionalBatchJobSchema>;
export type TransactionImportCommitJob = z.infer<typeof transactionImportCommitJobSchema>;
export type InboxMatchSuggestionsJob = z.infer<typeof inboxMatchSuggestionsJobSchema>;
export type InboxProviderSyncJob = z.infer<typeof inboxProviderSyncJobSchema>;
export type RecurringInvoiceGenerationJob = z.infer<typeof recurringInvoiceGenerationJobSchema>;
export type WeeklyInsightGenerationJob = z.infer<typeof weeklyInsightGenerationJobSchema>;
export type AutomationRunJob = z.infer<typeof automationRunJobSchema>;
export type BankSyncJob = z.infer<typeof bankSyncJobSchema>;
export type FortnoxSyncJob = z.infer<typeof fortnoxSyncJobSchema>;
export type FortnoxCreateInvoiceJob = z.infer<typeof fortnoxCreateInvoiceJobSchema>;
export type WebhookDeliveryJob = z.infer<typeof webhookDeliveryJobSchema>;
export type TeamDataExportJob = z.infer<typeof teamDataExportJobSchema>;
export type AccountantPacketExportJob = z.infer<typeof accountantPacketExportJobSchema>;
export type TeamDataDeletionJob = z.infer<typeof teamDataDeletionJobSchema>;
export type DawnQueueMessage = z.infer<typeof dawnQueueMessageSchema>;
export type DawnQueueMessageType = DawnQueueMessage["type"];
export type DawnQueueMessageForType<Type extends DawnQueueMessageType> = Extract<
  DawnQueueMessage,
  { type: Type }
>;
export type DawnQueueMessageHandlers = {
  [Type in DawnQueueMessageType]: (message: DawnQueueMessageForType<Type>) => Promise<void> | void;
};
export type DawnQueueMessageHandlerRegistry = {
  handle(message: DawnQueueMessage): Promise<void>;
};

export function createDawnQueueMessageHandlerRegistry(
  handlers: DawnQueueMessageHandlers,
): DawnQueueMessageHandlerRegistry {
  return {
    async handle(message) {
      const handler = handlers[message.type] as (message: DawnQueueMessage) => Promise<void> | void;
      await handler(message);
    },
  };
}

export function createOutboxDispatchJob(event: OutboxEventForJob): OutboxDispatchJob {
  const parsed = outboxEventForJobSchema.parse(event);
  const attempt = parsed.dispatchAttempts + 1;

  return {
    type: "outbox.dispatch",
    outboxEventId: parsed.id,
    teamId: parsed.teamId,
    eventType: parsed.type,
    version: parsed.version,
    attempt,
    idempotencyKey: outboxDispatchIdempotencyKey(parsed.id, attempt),
  };
}

export function outboxEventToQueueMessages(event: OutboxEventForJob): DawnQueueMessage[] {
  const dispatchJob = createOutboxDispatchJob(event);
  const syncJob = createSyncInvalidationJob(event);
  const extractionJob = createDocumentExtractionJob(event);
  const inboxMatchBatchJob = createInboxMatchBidirectionalBatchJob(event);
  const transactionImportCommitJob = createTransactionImportCommitJob(event);
  const inboxProviderSyncJob = createInboxProviderSyncJob(event);
  const recurringInvoiceJob = createRecurringInvoiceGenerationJob(event);
  const weeklyInsightJob = createWeeklyInsightGenerationJob(event);
  const automationJob = createAutomationRunJob(event);
  const bankSyncJob = createBankSyncJob(event);
  const fortnoxSyncJob = createFortnoxSyncJob(event);
  const fortnoxCreateInvoiceJob = createFortnoxCreateInvoiceJob(event);
  const webhookJob = createWebhookDeliveryJob(event);
  const exportJob = createTeamDataExportJob(event);
  const accountantPacketExportJob = createAccountantPacketExportJob(event);
  const deletionJob = createTeamDataDeletionJob(event);

  const messages: Array<DawnQueueMessage | null> = [
    dispatchJob,
    syncJob,
    extractionJob,
    inboxMatchBatchJob,
    transactionImportCommitJob,
    inboxProviderSyncJob,
    recurringInvoiceJob,
    weeklyInsightJob,
    bankSyncJob,
    fortnoxSyncJob,
    fortnoxCreateInvoiceJob,
    exportJob,
    accountantPacketExportJob,
    deletionJob,
    automationJob,
    webhookJob,
  ];

  return messages.filter((message): message is DawnQueueMessage => message !== null);
}

export function nextOutboxRetryAt(input: { attempt: number; now: Date }) {
  const exponentialDelaySeconds =
    outboxDispatchRetryPolicy.initialDelaySeconds * 2 ** Math.max(input.attempt - 1, 0);
  const cappedDelaySeconds = Math.min(
    exponentialDelaySeconds,
    outboxDispatchRetryPolicy.maxDelaySeconds,
  );

  return new Date(input.now.getTime() + cappedDelaySeconds * 1_000);
}

export function outboxDispatchIdempotencyKey(outboxEventId: string, attempt: number) {
  return `outbox:${outboxEventId}:attempt:${attempt}`;
}

function createSyncInvalidationJob(event: OutboxEventForJob): SyncInvalidationJob | null {
  if (event.type === "project.created") {
    const changedIds = projectIdsForEvent(event);

    if (changedIds.length === 0) {
      return null;
    }

    return {
      type: "sync.invalidate",
      teamId: event.teamId,
      collection: "projects",
      cursor: null,
      changedIds,
      sourceOutboxEventId: event.id,
      idempotencyKey: `sync:projects:${event.id}`,
    };
  }

  if (
    event.type !== "transaction.created" &&
    event.type !== "transaction.transfer_pair.created" &&
    event.type !== "transaction.reviewed" &&
    event.type !== "transaction.accountant_status_changed" &&
    event.type !== "transaction_import.committed" &&
    event.type !== "bank_connection.synced" &&
    event.type !== "accountant_packet.exported" &&
    event.type !== "inbox_match.accepted" &&
    event.type !== "inbox_match.rejected" &&
    event.type !== "inbox_match.auto_matched"
  ) {
    return null;
  }

  const changedIds = transactionIdsForEvent(event);

  if (changedIds.length === 0) {
    return null;
  }

  return {
    type: "sync.invalidate",
    teamId: event.teamId,
    collection: "transactions",
    cursor: null,
    changedIds,
    sourceOutboxEventId: event.id,
    idempotencyKey: `sync:transactions:${event.id}`,
  };
}

function createDocumentExtractionJob(event: OutboxEventForJob): DocumentExtractionJob | null {
  if (event.type !== "document.uploaded" && event.type !== "document_extraction.retry_requested") {
    return null;
  }

  if (event.payload.skipExtraction === true) {
    return null;
  }

  if (
    typeof event.payload.documentId !== "string" ||
    typeof event.payload.versionId !== "string" ||
    typeof event.payload.inboxItemId !== "string" ||
    typeof event.payload.actorId !== "string"
  ) {
    return null;
  }

  return {
    type: "document.extract",
    teamId: event.teamId,
    documentId: event.payload.documentId,
    versionId: event.payload.versionId,
    inboxItemId: event.payload.inboxItemId,
    actorId: event.payload.actorId,
    sourceOutboxEventId: event.id,
    idempotencyKey: `document:extract:${event.id}`,
  };
}

function createInboxMatchBidirectionalBatchJob(
  event: OutboxEventForJob,
): InboxMatchBidirectionalBatchJob | null {
  const transactionIds =
    event.type === "transaction.created" ||
    event.type === "transaction_import.committed" ||
    event.type === "bank_connection.synced"
      ? transactionIdsForEvent(event)
      : [];
  const inboxItemIds =
    (event.type === "document.extracted" || event.type === "document_extraction.corrected") &&
    typeof event.payload.inboxItemId === "string"
      ? [event.payload.inboxItemId]
      : [];

  if (transactionIds.length === 0 && inboxItemIds.length === 0) {
    return null;
  }

  return {
    type: "inbox.match_bidirectional_batch",
    teamId: event.teamId,
    transactionIds,
    inboxItemIds,
    sourceOutboxEventId: event.id,
    idempotencyKey: `inbox:match-batch:${event.id}`,
  };
}

function createTransactionImportCommitJob(
  event: OutboxEventForJob,
): TransactionImportCommitJob | null {
  if (event.type !== "transaction_import.queued") {
    return null;
  }

  if (
    typeof event.payload.importSessionId !== "string" ||
    typeof event.payload.payloadObjectKey !== "string" ||
    typeof event.payload.actorId !== "string"
  ) {
    return null;
  }

  return {
    type: "transaction_import.commit",
    teamId: event.teamId,
    importSessionId: event.payload.importSessionId,
    payloadObjectKey: event.payload.payloadObjectKey,
    actorId: event.payload.actorId,
    sourceOutboxEventId: event.id,
    idempotencyKey: `transaction-import:commit:${event.id}:${event.payload.importSessionId}`,
  };
}

function createInboxProviderSyncJob(event: OutboxEventForJob): InboxProviderSyncJob | null {
  if (event.type !== "inbox.provider.sync_requested") {
    return null;
  }

  if (
    typeof event.payload.connectionId !== "string" ||
    typeof event.payload.provider !== "string"
  ) {
    return null;
  }

  return {
    type: "inbox.provider.sync",
    teamId: event.teamId,
    connectionId: event.payload.connectionId,
    provider: event.payload.provider,
    sourceOutboxEventId: event.id,
    idempotencyKey: `inbox:provider-sync:${event.id}:${event.payload.connectionId}`,
  };
}

function createRecurringInvoiceGenerationJob(
  event: OutboxEventForJob,
): RecurringInvoiceGenerationJob | null {
  if (event.type !== "recurring_invoice.due") {
    return null;
  }

  if (
    typeof event.payload.scheduleId !== "string" ||
    typeof event.payload.sourceInvoiceId !== "string" ||
    typeof event.payload.runAt !== "string"
  ) {
    return null;
  }

  return {
    type: "invoice.recurring.generate",
    teamId: event.teamId,
    scheduleId: event.payload.scheduleId,
    sourceInvoiceId: event.payload.sourceInvoiceId,
    runAt: event.payload.runAt,
    sourceOutboxEventId: event.id,
    idempotencyKey: `invoice:recurring:${event.id}`,
  };
}

function createWeeklyInsightGenerationJob(
  event: OutboxEventForJob,
): WeeklyInsightGenerationJob | null {
  if (event.type !== "insights.weekly.due") {
    return null;
  }

  if (
    typeof event.payload.periodStart !== "string" ||
    typeof event.payload.periodEnd !== "string"
  ) {
    return null;
  }

  return {
    type: "insights.weekly.generate",
    teamId: event.teamId,
    periodStart: event.payload.periodStart,
    periodEnd: event.payload.periodEnd,
    sourceOutboxEventId: event.id,
    idempotencyKey: `insights:weekly:${event.id}`,
  };
}

function createAutomationRunJob(event: OutboxEventForJob): AutomationRunJob {
  return {
    type: "automation.run",
    teamId: event.teamId,
    sourceOutboxEventId: event.id,
    eventType: event.type,
    idempotencyKey: `automation:run:${event.id}`,
  };
}

function createBankSyncJob(event: OutboxEventForJob): BankSyncJob | null {
  if (event.type !== "bank_connection.sync_requested") {
    return null;
  }

  if (
    typeof event.payload.connectionId !== "string" ||
    typeof event.payload.provider !== "string"
  ) {
    return null;
  }

  return {
    type: "bank.sync",
    teamId: event.teamId,
    connectionId: event.payload.connectionId,
    provider: event.payload.provider,
    sourceOutboxEventId: event.id,
    idempotencyKey: `bank:sync:${event.id}`,
  };
}

function createFortnoxSyncJob(event: OutboxEventForJob): FortnoxSyncJob | null {
  if (event.type !== "integration.connected" || event.payload.provider !== "fortnox") {
    return null;
  }

  if (typeof event.payload.connectionId !== "string") {
    return null;
  }

  return {
    type: "fortnox.sync",
    teamId: event.teamId,
    connectionId: event.payload.connectionId,
    provider: "fortnox",
    syncMode: "initial",
    sourceOutboxEventId: event.id,
    idempotencyKey: `fortnox:initial-sync:${event.id}:${event.payload.connectionId}`,
  };
}

function createFortnoxCreateInvoiceJob(event: OutboxEventForJob): FortnoxCreateInvoiceJob | null {
  if (
    event.type !== "invoice_handoff.requested" &&
    event.type !== "invoice_handoff.approved" &&
    event.type !== "invoice_handoff.retry_requested"
  ) {
    return null;
  }

  if (
    event.payload.provider !== "fortnox" ||
    typeof event.payload.handoffId !== "string" ||
    typeof event.payload.documentId !== "string" ||
    typeof event.payload.documentVersionId !== "string" ||
    typeof event.payload.signatureRequestId !== "string" ||
    typeof event.payload.connectionId !== "string"
  ) {
    return null;
  }

  return {
    type: "fortnox.create_invoice",
    teamId: event.teamId,
    handoffId: event.payload.handoffId,
    documentId: event.payload.documentId,
    documentVersionId: event.payload.documentVersionId,
    signatureRequestId: event.payload.signatureRequestId,
    connectionId: event.payload.connectionId,
    provider: "fortnox",
    sourceOutboxEventId: event.id,
    idempotencyKey: `fortnox:create-invoice:${event.id}:${event.payload.handoffId}`,
  };
}

function createWebhookDeliveryJob(event: OutboxEventForJob): WebhookDeliveryJob {
  return {
    type: "webhook.deliver",
    teamId: event.teamId,
    sourceOutboxEventId: event.id,
    eventType: event.type,
    idempotencyKey: `webhook:deliver:${event.id}`,
  };
}

function createTeamDataExportJob(event: OutboxEventForJob): TeamDataExportJob | null {
  if (event.type !== "team_data.export_requested") {
    return null;
  }

  return {
    type: "team_data.export",
    teamId: event.teamId,
    format: "json",
    sourceOutboxEventId: event.id,
    idempotencyKey: `team-data:export:${event.id}`,
  };
}

function createAccountantPacketExportJob(
  event: OutboxEventForJob,
): AccountantPacketExportJob | null {
  if (event.type !== "accountant_packet.export_requested") {
    return null;
  }

  if (
    typeof event.payload.actorId !== "string" ||
    typeof event.payload.from !== "string" ||
    typeof event.payload.to !== "string"
  ) {
    return null;
  }

  const transactionIds = Array.isArray(event.payload.transactionIds)
    ? event.payload.transactionIds.filter(
        (transactionId): transactionId is string => typeof transactionId === "string",
      )
    : [];
  const formats = Array.isArray(event.payload.formats)
    ? event.payload.formats.filter(
        (format): format is "csv" | "xlsx" => format === "csv" || format === "xlsx",
      )
    : undefined;
  const csvDelimiter =
    event.payload.csvDelimiter === "," ||
    event.payload.csvDelimiter === ";" ||
    event.payload.csvDelimiter === "\t"
      ? event.payload.csvDelimiter
      : undefined;

  return {
    type: "accountant_packet.export",
    teamId: event.teamId,
    actorId: event.payload.actorId,
    from: event.payload.from,
    to: event.payload.to,
    transactionIds,
    formats,
    csvDelimiter,
    sourceOutboxEventId: event.id,
    idempotencyKey: `accountant-packet:export:${event.id}`,
  };
}

function createTeamDataDeletionJob(event: OutboxEventForJob): TeamDataDeletionJob | null {
  if (event.type !== "team_data.deletion_requested") {
    return null;
  }

  return {
    type: "team_data.delete",
    teamId: event.teamId,
    sourceOutboxEventId: event.id,
    idempotencyKey: `team-data:delete:${event.id}`,
  };
}

function transactionIdsForEvent(event: OutboxEventForJob) {
  if (typeof event.payload.transactionId === "string") {
    return [event.payload.transactionId];
  }

  if (Array.isArray(event.payload.transactionIds)) {
    return event.payload.transactionIds.filter(
      (transactionId): transactionId is string => typeof transactionId === "string",
    );
  }

  return [];
}

function projectIdsForEvent(event: OutboxEventForJob) {
  if (typeof event.payload.projectId === "string") {
    return [event.payload.projectId];
  }

  if (Array.isArray(event.payload.projectIds)) {
    return event.payload.projectIds.filter(
      (projectId): projectId is string => typeof projectId === "string",
    );
  }

  return [];
}
