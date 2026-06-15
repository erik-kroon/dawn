import { describe, expect, test } from "bun:test";
import {
  buildProjectSyncInvalidation,
  buildProjectSyncResponse,
  buildTransactionSyncInvalidation,
  buildTransactionSyncResponse,
  createProjectSyncSubscriptionUrl,
  createSyncInvalidationFromJob,
  createSyncSubscriptionAck,
  createTransactionSyncSubscriptionUrl,
  createOptimisticTransactionReview,
  isProjectSyncInvalidationEvent,
  isSyncInvalidationJob,
  isTransactionSyncInvalidationEvent,
  parseSyncSubscription,
  projectSyncCollectionContract,
  projectSyncRecordsFromChanges,
  transactionSyncCollectionContract,
  transactionSyncRecordsFromChanges,
  type ProjectSyncRecord,
  type TransactionSyncRecord,
} from "./index";

const transactions: TransactionSyncRecord[] = [
  {
    id: "txn_1",
    teamId: "team_1",
    description: "Figma",
    postedAt: "2026-06-14",
    money: { amountMinor: -1200, currency: "USD" },
    categoryId: null,
    reviewState: "needs_review",
    updatedAt: "2026-06-14T10:00:00.000Z",
  },
  {
    id: "txn_2",
    teamId: "team_1",
    description: "Invoice",
    postedAt: "2026-06-15",
    money: { amountMinor: 5000, currency: "USD" },
    categoryId: "cat_revenue",
    reviewState: "reviewed",
    updatedAt: "2026-06-15T10:00:00.000Z",
  },
];

const projects: ProjectSyncRecord[] = [
  {
    id: "project_1",
    teamId: "team_1",
    customerId: "customer_1",
    name: "Website",
    description: null,
    status: "active",
    billableRate: { amountMinor: 12_000, currency: "USD" },
    createdByActorId: "user_1",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  },
  {
    id: "project_2",
    teamId: "team_1",
    customerId: "customer_1",
    name: "Retainer",
    description: "Monthly support",
    status: "active",
    billableRate: { amountMinor: 15_000, currency: "USD" },
    createdByActorId: "user_1",
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
  },
];

describe("transaction sync collection", () => {
  test("describes authorization, cursor, subscription, and fanout contract facts", () => {
    expect(transactionSyncCollectionContract).toMatchObject({
      collection: {
        id: "transactions",
        key: "id",
        cursorField: "updatedAt",
        conflictPolicy: "server_wins_for_financial_state",
        invalidationEventType: "sync.transactions.invalidated",
      },
      authorization: {
        permission: "transactions.read",
        syncForbiddenMessage: "You cannot sync transactions for this team",
        subscriptionForbiddenMessage: "You cannot subscribe to this team's transactions",
      },
      subscription: {
        publicPath: "/sync/transactions/subscribe",
        coordinatorPath: "/subscribe",
        reconnect: "refetch_by_cursor",
      },
      fanout: {
        coordinatorInvalidationPath: "/invalidate",
      },
      invalidation: {
        jobType: "sync.invalidate",
      },
    });
    expect(projectSyncCollectionContract).toMatchObject({
      collection: {
        id: "projects",
        key: "id",
        cursorField: "updatedAt",
        conflictPolicy: "server_wins_for_operational_state",
        invalidationEventType: "sync.projects.invalidated",
      },
      authorization: {
        permission: "projects.read",
        syncForbiddenMessage: "You cannot sync projects for this team",
        subscriptionForbiddenMessage: "You cannot subscribe to this team's projects",
      },
      subscription: {
        publicPath: "/sync/projects/subscribe",
        coordinatorPath: "/subscribe",
        reconnect: "refetch_by_cursor",
      },
      fanout: {
        coordinatorInvalidationPath: "/invalidate",
      },
      invalidation: {
        jobType: "sync.invalidate",
      },
    });
  });

  test("builds cursor-based upsert responses", () => {
    const response = buildTransactionSyncResponse({ teamId: "team_1", transactions });

    expect(response.collection).toBe("transactions");
    expect(response.cursor).toBe("2026-06-15T10:00:00.000Z");
    expect(transactionSyncRecordsFromChanges(response.changes).map((record) => record.id)).toEqual([
      "txn_1",
      "txn_2",
    ]);
  });

  test("requires updatedAt for synced transactions", () => {
    expect(() =>
      buildTransactionSyncResponse({
        teamId: "team_1",
        transactions: [{ ...transactions[0]!, updatedAt: null }],
      }),
    ).toThrow("Transaction sync record requires updatedAt");
  });

  test("builds project cursor-based upsert responses", () => {
    const response = buildProjectSyncResponse({ teamId: "team_1", projects });

    expect(response.collection).toBe("projects");
    expect(response.cursor).toBe("2026-06-15T10:00:00.000Z");
    expect(projectSyncRecordsFromChanges(response.changes).map((record) => record.id)).toEqual([
      "project_1",
      "project_2",
    ]);
  });

  test("requires updatedAt for synced projects", () => {
    expect(() =>
      buildProjectSyncResponse({
        teamId: "team_1",
        projects: [{ ...projects[0]!, updatedAt: null }],
      }),
    ).toThrow("Project sync record requires updatedAt");
  });

  test("creates invalidation event shape for realtime fanout", () => {
    const event = buildTransactionSyncInvalidation({ teamId: "team_1", transactions });

    expect(event).toEqual({
      type: "sync.transactions.invalidated",
      teamId: "team_1",
      collection: "transactions",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["txn_1", "txn_2"],
    });
    expect(isTransactionSyncInvalidationEvent(event)).toBe(true);
  });

  test("creates project invalidation event shape for realtime fanout", () => {
    const event = buildProjectSyncInvalidation({ teamId: "team_1", projects });

    expect(event).toEqual({
      type: "sync.projects.invalidated",
      teamId: "team_1",
      collection: "projects",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["project_1", "project_2"],
    });
    expect(isProjectSyncInvalidationEvent(event)).toBe(true);
  });

  test("normalizes queue invalidation jobs through collection contracts", () => {
    const job = {
      type: "sync.invalidate",
      teamId: "team_1",
      collection: "transactions",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["txn_1"],
    } as const;
    const projectJob = {
      ...job,
      collection: "projects",
      changedIds: ["project_1"],
    } as const;

    expect(isSyncInvalidationJob(job)).toBe(true);
    expect(createSyncInvalidationFromJob(job)).toEqual({
      type: "sync.transactions.invalidated",
      teamId: "team_1",
      collection: "transactions",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["txn_1"],
    });
    expect(createSyncInvalidationFromJob(projectJob)).toEqual({
      type: "sync.projects.invalidated",
      teamId: "team_1",
      collection: "projects",
      cursor: "2026-06-15T10:00:00.000Z",
      changedIds: ["project_1"],
    });
    expect(isSyncInvalidationJob({ ...job, collection: "documents" })).toBe(false);
  });

  test("models realtime subscription handshake messages", () => {
    expect(
      createTransactionSyncSubscriptionUrl({
        baseUrl: "https://api.dawn.local",
        teamId: "team_1",
      }),
    ).toBe(
      "wss://api.dawn.local/sync/transactions/subscribe?teamId=team_1&collection=transactions",
    );
    expect(
      createProjectSyncSubscriptionUrl({
        baseUrl: "https://api.dawn.local",
        teamId: "team_1",
      }),
    ).toBe("wss://api.dawn.local/sync/projects/subscribe?teamId=team_1&collection=projects");
    expect(parseSyncSubscription({ teamId: "team_1", collection: "transactions" })).toEqual({
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });
    expect(parseSyncSubscription({ teamId: "team_1", collection: "projects" })).toEqual({
      type: "sync.subscribe",
      teamId: "team_1",
      collection: "projects",
    });
    expect(createSyncSubscriptionAck({ teamId: "team_1", collection: "projects" })).toEqual({
      type: "sync.subscribed",
      teamId: "team_1",
      collection: "projects",
      reconnect: "refetch_by_cursor",
    });
    expect(() => parseSyncSubscription({ teamId: "team_1", collection: "documents" })).toThrow(
      "Unsupported sync collection",
    );
  });

  test("models optimistic review with rollback state", () => {
    const review = createOptimisticTransactionReview({
      record: transactions[0]!,
      categoryId: "cat_software",
      now: "2026-06-15T12:00:00.000Z",
    });

    expect(review.record.categoryId).toBe("cat_software");
    expect(review.record.reviewState).toBe("reviewed");
    expect(review.rollback.categoryId).toBeNull();
  });
});
