import type { Project, TimeEntry, Transaction } from "@dawn/domain";

export const transactionSyncCollection = {
  id: "transactions",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_financial_state",
  invalidationEventType: "sync.transactions.invalidated",
} as const;

export const projectSyncCollection = {
  id: "projects",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_operational_state",
  invalidationEventType: "sync.projects.invalidated",
} as const;

export const timeEntrySyncCollection = {
  id: "time_entries",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_operational_state",
  invalidationEventType: "sync.time_entries.invalidated",
} as const;

export type TransactionSyncCollectionId = typeof transactionSyncCollection.id;
export type ProjectSyncCollectionId = typeof projectSyncCollection.id;
export type TimeEntrySyncCollectionId = typeof timeEntrySyncCollection.id;
export type OperationalSyncCollectionId = ProjectSyncCollectionId | TimeEntrySyncCollectionId;

export type TransactionSyncRecord = Transaction & {
  updatedAt: string;
};

export type TransactionSyncChange =
  | {
      type: "upsert";
      record: TransactionSyncRecord;
    }
  | {
      type: "delete";
      id: string;
      updatedAt: string;
    };

export type TransactionSyncResponse = {
  collection: TransactionSyncCollectionId;
  teamId: string;
  cursor: string | null;
  conflictPolicy: typeof transactionSyncCollection.conflictPolicy;
  changes: TransactionSyncChange[];
};

export type ProjectSyncRecord = Project & {
  updatedAt: string;
};

export type TimeEntrySyncRecord = TimeEntry & {
  updatedAt: string;
};

export type OperationalSyncInvalidationEvent = {
  type:
    | typeof projectSyncCollection.invalidationEventType
    | typeof timeEntrySyncCollection.invalidationEventType;
  teamId: string;
  collection: OperationalSyncCollectionId;
  cursor: string | null;
  changedIds: string[];
};

export type TransactionSyncInvalidationEvent = {
  type: typeof transactionSyncCollection.invalidationEventType;
  teamId: string;
  collection: TransactionSyncCollectionId;
  cursor: string | null;
  changedIds: string[];
};

export type TransactionSyncSubscription = {
  type: "sync.transactions.subscribe";
  teamId: string;
  collection: TransactionSyncCollectionId;
};

export type TransactionSyncSubscriptionAck = {
  type: "sync.transactions.subscribed";
  teamId: string;
  collection: TransactionSyncCollectionId;
  reconnect: "refetch_by_cursor";
};

export type TransactionSyncErrorEvent = {
  type: "sync.error";
  message: string;
};

export type TransactionSyncRealtimeEvent =
  | TransactionSyncInvalidationEvent
  | TransactionSyncSubscriptionAck
  | TransactionSyncErrorEvent;

export type OptimisticTransactionReview = {
  record: TransactionSyncRecord;
  rollback: TransactionSyncRecord;
};

export function buildTransactionSyncResponse(input: {
  teamId: string;
  transactions: readonly Transaction[];
}): TransactionSyncResponse {
  const records = input.transactions.map(assertTransactionSyncRecord);

  return {
    collection: transactionSyncCollection.id,
    teamId: input.teamId,
    cursor: records.reduce<string | null>(
      (cursor, record) => maxIsoCursor(cursor, record.updatedAt),
      null,
    ),
    conflictPolicy: transactionSyncCollection.conflictPolicy,
    changes: records.map((record) => ({
      type: "upsert",
      record,
    })),
  };
}

export function buildTransactionSyncInvalidation(input: {
  teamId: string;
  transactions: readonly Transaction[];
}): TransactionSyncInvalidationEvent {
  const response = buildTransactionSyncResponse(input);

  return {
    type: transactionSyncCollection.invalidationEventType,
    teamId: input.teamId,
    collection: transactionSyncCollection.id,
    cursor: response.cursor,
    changedIds: response.changes.flatMap((change) =>
      change.type === "upsert" ? [change.record.id] : [change.id],
    ),
  };
}

export function createTransactionSyncInvalidation(input: {
  teamId: string;
  cursor?: string | null;
  changedIds: readonly string[];
}): TransactionSyncInvalidationEvent {
  return {
    type: transactionSyncCollection.invalidationEventType,
    teamId: input.teamId,
    collection: transactionSyncCollection.id,
    cursor: input.cursor ?? null,
    changedIds: [...input.changedIds],
  };
}

export function createOperationalSyncInvalidation(input: {
  teamId: string;
  collection: OperationalSyncCollectionId;
  cursor?: string | null;
  changedIds: readonly string[];
}): OperationalSyncInvalidationEvent {
  return {
    type:
      input.collection === projectSyncCollection.id
        ? projectSyncCollection.invalidationEventType
        : timeEntrySyncCollection.invalidationEventType,
    teamId: input.teamId,
    collection: input.collection,
    cursor: input.cursor ?? null,
    changedIds: [...input.changedIds],
  };
}

export function createTransactionSyncSubscriptionAck(input: {
  teamId: string;
}): TransactionSyncSubscriptionAck {
  return {
    type: "sync.transactions.subscribed",
    teamId: input.teamId,
    collection: transactionSyncCollection.id,
    reconnect: "refetch_by_cursor",
  };
}

export function isTransactionSyncInvalidationEvent(
  input: unknown,
): input is TransactionSyncInvalidationEvent {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.type === transactionSyncCollection.invalidationEventType &&
    typeof input.teamId === "string" &&
    input.collection === transactionSyncCollection.id &&
    (typeof input.cursor === "string" || input.cursor === null) &&
    Array.isArray(input.changedIds) &&
    input.changedIds.every((changedId) => typeof changedId === "string")
  );
}

export function parseTransactionSyncSubscription(input: {
  teamId?: string | null;
  collection?: string | null;
}): TransactionSyncSubscription {
  if (!input.teamId) {
    throw new Error("Transaction sync subscription requires a teamId");
  }

  if (input.collection && input.collection !== transactionSyncCollection.id) {
    throw new Error("Unsupported sync collection");
  }

  return {
    type: "sync.transactions.subscribe",
    teamId: input.teamId,
    collection: transactionSyncCollection.id,
  };
}

export function transactionSyncRecordsFromChanges(changes: readonly TransactionSyncChange[]) {
  return changes.flatMap((change) => (change.type === "upsert" ? [change.record] : []));
}

export function createOptimisticTransactionReview(input: {
  record: TransactionSyncRecord;
  categoryId: string;
  now: string;
}): OptimisticTransactionReview {
  return {
    rollback: input.record,
    record: {
      ...input.record,
      categoryId: input.categoryId,
      reviewState: "reviewed",
      updatedAt: input.now,
    },
  };
}

function assertTransactionSyncRecord(transaction: Transaction): TransactionSyncRecord {
  if (!transaction.updatedAt) {
    throw new Error("Transaction sync record requires updatedAt");
  }

  return {
    ...transaction,
    updatedAt: transaction.updatedAt,
  };
}

function maxIsoCursor(left: string | null, right: string) {
  if (!left) {
    return right;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
