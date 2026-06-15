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
  recurringInvoiceGenerationJobSchema,
  weeklyInsightGenerationJobSchema,
  automationRunJobSchema,
  bankSyncJobSchema,
  webhookDeliveryJobSchema,
  teamDataExportJobSchema,
  teamDataDeletionJobSchema,
]);

export type OutboxDispatchJob = z.infer<typeof outboxDispatchJobSchema>;
export type SyncInvalidationJob = z.infer<typeof syncInvalidationJobSchema>;
export type DocumentExtractionJob = z.infer<typeof documentExtractionJobSchema>;
export type RecurringInvoiceGenerationJob = z.infer<typeof recurringInvoiceGenerationJobSchema>;
export type WeeklyInsightGenerationJob = z.infer<typeof weeklyInsightGenerationJobSchema>;
export type AutomationRunJob = z.infer<typeof automationRunJobSchema>;
export type BankSyncJob = z.infer<typeof bankSyncJobSchema>;
export type WebhookDeliveryJob = z.infer<typeof webhookDeliveryJobSchema>;
export type TeamDataExportJob = z.infer<typeof teamDataExportJobSchema>;
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
  const recurringInvoiceJob = createRecurringInvoiceGenerationJob(event);
  const weeklyInsightJob = createWeeklyInsightGenerationJob(event);
  const automationJob = createAutomationRunJob(event);
  const bankSyncJob = createBankSyncJob(event);
  const webhookJob = createWebhookDeliveryJob(event);
  const exportJob = createTeamDataExportJob(event);
  const deletionJob = createTeamDataDeletionJob(event);

  return [
    dispatchJob,
    syncJob,
    extractionJob,
    recurringInvoiceJob,
    weeklyInsightJob,
    bankSyncJob,
    exportJob,
    deletionJob,
    automationJob,
    webhookJob,
  ].filter((message): message is DawnQueueMessage => Boolean(message));
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
    event.type !== "transaction_import.committed" &&
    event.type !== "bank_connection.synced"
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
  if (event.type !== "document.uploaded") {
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
