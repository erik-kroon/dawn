import type { Transaction } from "@dawn/domain";

export const transactionSyncCollection = {
  id: "transactions",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_financial_state",
  invalidationEventType: "sync.transactions.invalidated",
} as const;

export type TransactionSyncCollectionId = typeof transactionSyncCollection.id;

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

export type TransactionSyncInvalidationEvent = {
  type: typeof transactionSyncCollection.invalidationEventType;
  teamId: string;
  collection: TransactionSyncCollectionId;
  cursor: string | null;
  changedIds: string[];
};

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
