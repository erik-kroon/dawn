import { z } from "zod";

export const dawnQueueNames = {
  jobs: "dawn-jobs",
  deadLetter: "dawn-jobs-dlq",
} as const;

export const outboxDispatchRetryPolicy = {
  maxAttempts: 8,
  initialDelaySeconds: 30,
  maxDelaySeconds: 3_600,
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
  collection: z.literal("transactions"),
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

export const dawnQueueMessageSchema = z.discriminatedUnion("type", [
  outboxDispatchJobSchema,
  syncInvalidationJobSchema,
  documentExtractionJobSchema,
]);

export type OutboxDispatchJob = z.infer<typeof outboxDispatchJobSchema>;
export type SyncInvalidationJob = z.infer<typeof syncInvalidationJobSchema>;
export type DocumentExtractionJob = z.infer<typeof documentExtractionJobSchema>;
export type DawnQueueMessage = z.infer<typeof dawnQueueMessageSchema>;

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

  return [dispatchJob, syncJob, extractionJob].filter((message): message is DawnQueueMessage =>
    Boolean(message),
  );
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
  if (
    event.type !== "transaction.created" &&
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
