import type { Project, Transaction } from "@dawn/domain";

const syncSubscriptionCoordinatorPath = "/subscribe";
const syncFanoutCoordinatorInvalidationPath = "/invalidate";
const syncReconnectPolicy = "refetch_by_cursor";
const syncInvalidationJobType = "sync.invalidate";

export const transactionSyncCollection = {
  id: "transactions",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_financial_state",
  invalidationEventType: "sync.transactions.invalidated",
} as const;

export const transactionSyncCollectionContract = {
  collection: transactionSyncCollection,
  authorization: {
    permission: "transactions.read",
    syncForbiddenMessage: "You cannot sync transactions for this team",
    subscriptionForbiddenMessage: "You cannot subscribe to this team's transactions",
  },
  subscription: {
    publicPath: "/sync/transactions/subscribe",
    coordinatorPath: syncSubscriptionCoordinatorPath,
    reconnect: syncReconnectPolicy,
  },
  fanout: {
    coordinatorInvalidationPath: syncFanoutCoordinatorInvalidationPath,
  },
  invalidation: {
    jobType: syncInvalidationJobType,
  },
} as const;

export const projectSyncCollection = {
  id: "projects",
  key: "id",
  cursorField: "updatedAt",
  conflictPolicy: "server_wins_for_operational_state",
  invalidationEventType: "sync.projects.invalidated",
} as const;

export const projectSyncCollectionContract = {
  collection: projectSyncCollection,
  authorization: {
    permission: "projects.read",
    syncForbiddenMessage: "You cannot sync projects for this team",
    subscriptionForbiddenMessage: "You cannot subscribe to this team's projects",
  },
  subscription: {
    publicPath: "/sync/projects/subscribe",
    coordinatorPath: syncSubscriptionCoordinatorPath,
    reconnect: syncReconnectPolicy,
  },
  fanout: {
    coordinatorInvalidationPath: syncFanoutCoordinatorInvalidationPath,
  },
  invalidation: {
    jobType: syncInvalidationJobType,
  },
} as const;

export const syncCollectionContracts = [
  transactionSyncCollectionContract,
  projectSyncCollectionContract,
] as const;

export type TransactionSyncCollectionId = typeof transactionSyncCollection.id;
export type ProjectSyncCollectionId = typeof projectSyncCollection.id;
export type SyncCollectionId = TransactionSyncCollectionId | ProjectSyncCollectionId;
export type SyncCollectionContract = (typeof syncCollectionContracts)[number];

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

export type ProjectSyncChange =
  | {
      type: "upsert";
      record: ProjectSyncRecord;
    }
  | {
      type: "delete";
      id: string;
      updatedAt: string;
    };

export type ProjectSyncResponse = {
  collection: ProjectSyncCollectionId;
  teamId: string;
  cursor: string | null;
  conflictPolicy: typeof projectSyncCollection.conflictPolicy;
  changes: ProjectSyncChange[];
};

export type SyncInvalidationJob = {
  type: typeof syncInvalidationJobType;
  teamId: string;
  collection: SyncCollectionId;
  cursor?: string | null;
  changedIds: readonly string[];
};

export type ProjectSyncInvalidationEvent = {
  type: typeof projectSyncCollection.invalidationEventType;
  teamId: string;
  collection: ProjectSyncCollectionId;
  cursor: string | null;
  changedIds: string[];
};

export type SyncInvalidationEvent = TransactionSyncInvalidationEvent | ProjectSyncInvalidationEvent;

export type SyncSubscription = {
  type: "sync.subscribe";
  teamId: string;
  collection: SyncCollectionId;
};

export type SyncSubscriptionAck = {
  type: "sync.subscribed";
  teamId: string;
  collection: SyncCollectionId;
  reconnect: typeof syncReconnectPolicy;
};

export type SyncErrorEvent = {
  type: "sync.error";
  message: string;
};

export type SyncRealtimeEvent = SyncInvalidationEvent | SyncSubscriptionAck | SyncErrorEvent;

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
    collection: transactionSyncCollectionContract.collection.id,
    teamId: input.teamId,
    cursor: records.reduce<string | null>(
      (cursor, record) => maxIsoCursor(cursor, record.updatedAt),
      null,
    ),
    conflictPolicy: transactionSyncCollectionContract.collection.conflictPolicy,
    changes: records.map((record) => ({
      type: "upsert",
      record,
    })),
  };
}

export function buildProjectSyncResponse(input: {
  teamId: string;
  projects: readonly Project[];
}): ProjectSyncResponse {
  const records = input.projects.map(assertProjectSyncRecord);

  return {
    collection: projectSyncCollectionContract.collection.id,
    teamId: input.teamId,
    cursor: records.reduce<string | null>(
      (cursor, record) => maxIsoCursor(cursor, record.updatedAt),
      null,
    ),
    conflictPolicy: projectSyncCollectionContract.collection.conflictPolicy,
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
    type: transactionSyncCollectionContract.collection.invalidationEventType,
    teamId: input.teamId,
    collection: transactionSyncCollectionContract.collection.id,
    cursor: response.cursor,
    changedIds: response.changes.flatMap((change) =>
      change.type === "upsert" ? [change.record.id] : [change.id],
    ),
  };
}

export function buildProjectSyncInvalidation(input: {
  teamId: string;
  projects: readonly Project[];
}): ProjectSyncInvalidationEvent {
  const response = buildProjectSyncResponse(input);

  return {
    type: projectSyncCollectionContract.collection.invalidationEventType,
    teamId: input.teamId,
    collection: projectSyncCollectionContract.collection.id,
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
    type: transactionSyncCollectionContract.collection.invalidationEventType,
    teamId: input.teamId,
    collection: transactionSyncCollectionContract.collection.id,
    cursor: input.cursor ?? null,
    changedIds: [...input.changedIds],
  };
}

export function createProjectSyncInvalidation(input: {
  teamId: string;
  cursor?: string | null;
  changedIds: readonly string[];
}): ProjectSyncInvalidationEvent {
  return {
    type: projectSyncCollectionContract.collection.invalidationEventType,
    teamId: input.teamId,
    collection: projectSyncCollectionContract.collection.id,
    cursor: input.cursor ?? null,
    changedIds: [...input.changedIds],
  };
}

export function createSyncInvalidation(input: {
  teamId: string;
  collection: SyncCollectionId;
  cursor?: string | null;
  changedIds: readonly string[];
}): SyncInvalidationEvent {
  if (input.collection === transactionSyncCollection.id) {
    return createTransactionSyncInvalidation(input);
  }

  return createProjectSyncInvalidation(input);
}

export function createSyncInvalidationFromJob(input: SyncInvalidationJob): SyncInvalidationEvent {
  return createSyncInvalidation({
    teamId: input.teamId,
    collection: input.collection,
    cursor: input.cursor,
    changedIds: input.changedIds,
  });
}

export function createSyncSubscriptionAck(input: {
  teamId: string;
  collection: SyncCollectionId;
}): SyncSubscriptionAck {
  return {
    type: "sync.subscribed",
    teamId: input.teamId,
    collection: input.collection,
    reconnect: syncReconnectPolicy,
  };
}

export function createTransactionSyncSubscriptionUrl(input: { baseUrl: string; teamId: string }) {
  return createSyncSubscriptionUrl({
    ...input,
    collection: transactionSyncCollectionContract.collection.id,
  });
}

export function createProjectSyncSubscriptionUrl(input: { baseUrl: string; teamId: string }) {
  return createSyncSubscriptionUrl({
    ...input,
    collection: projectSyncCollectionContract.collection.id,
  });
}

export function createSyncSubscriptionUrl(input: {
  baseUrl: string;
  teamId: string;
  collection: SyncCollectionId;
}) {
  const contract = syncCollectionContractForId(input.collection);
  const url = new URL(input.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = contract.subscription.publicPath;
  url.search = syncSubscriptionSearchParams({
    teamId: input.teamId,
    collection: input.collection,
  }).toString();

  return url.toString();
}

export function transactionSyncSubscriptionSearchParams(input: { teamId: string }) {
  return syncSubscriptionSearchParams({
    teamId: input.teamId,
    collection: transactionSyncCollectionContract.collection.id,
  });
}

export function syncSubscriptionSearchParams(input: {
  teamId: string;
  collection: SyncCollectionId;
}) {
  return new URLSearchParams({
    teamId: input.teamId,
    collection: input.collection,
  });
}

export function isTransactionSyncInvalidationEvent(
  input: unknown,
): input is TransactionSyncInvalidationEvent {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.type === transactionSyncCollectionContract.collection.invalidationEventType &&
    typeof input.teamId === "string" &&
    input.collection === transactionSyncCollectionContract.collection.id &&
    (typeof input.cursor === "string" || input.cursor === null) &&
    Array.isArray(input.changedIds) &&
    input.changedIds.every((changedId) => typeof changedId === "string")
  );
}

export function isProjectSyncInvalidationEvent(
  input: unknown,
): input is ProjectSyncInvalidationEvent {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.type === projectSyncCollectionContract.collection.invalidationEventType &&
    typeof input.teamId === "string" &&
    input.collection === projectSyncCollectionContract.collection.id &&
    (typeof input.cursor === "string" || input.cursor === null) &&
    Array.isArray(input.changedIds) &&
    input.changedIds.every((changedId) => typeof changedId === "string")
  );
}

export function isSyncInvalidationEvent(input: unknown): input is SyncInvalidationEvent {
  return isTransactionSyncInvalidationEvent(input) || isProjectSyncInvalidationEvent(input);
}

export function isSyncInvalidationJob(input: unknown): input is SyncInvalidationJob {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.type === syncInvalidationJobType &&
    isSyncCollectionId(input.collection) &&
    typeof input.teamId === "string" &&
    (typeof input.cursor === "string" || input.cursor === null || input.cursor === undefined) &&
    Array.isArray(input.changedIds) &&
    input.changedIds.every((changedId) => typeof changedId === "string")
  );
}

export function parseSyncSubscription(input: {
  teamId?: string | null;
  collection?: string | null;
}): SyncSubscription {
  if (!input.teamId) {
    throw new Error("Sync subscription requires a teamId");
  }

  if (!input.collection || !isSyncCollectionId(input.collection)) {
    throw new Error("Unsupported sync collection");
  }

  return {
    type: "sync.subscribe",
    teamId: input.teamId,
    collection: input.collection,
  };
}

export function transactionSyncRecordsFromChanges(changes: readonly TransactionSyncChange[]) {
  return changes.flatMap((change) => (change.type === "upsert" ? [change.record] : []));
}

export function projectSyncRecordsFromChanges(changes: readonly ProjectSyncChange[]) {
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

function assertProjectSyncRecord(project: Project): ProjectSyncRecord {
  if (!project.updatedAt) {
    throw new Error("Project sync record requires updatedAt");
  }

  return {
    ...project,
    updatedAt: project.updatedAt,
  };
}

export function syncCollectionContractForId(collection: SyncCollectionId): SyncCollectionContract {
  const contract = syncCollectionContracts.find((item) => item.collection.id === collection);

  if (!contract) {
    throw new Error("Unsupported sync collection");
  }

  return contract;
}

function isSyncCollectionId(input: unknown): input is SyncCollectionId {
  return syncCollectionContracts.some((contract) => contract.collection.id === input);
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
