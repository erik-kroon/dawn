import { describe, expect, test } from "bun:test";
import {
  buildTransactionSyncInvalidation,
  buildTransactionSyncResponse,
  createTransactionSyncSubscriptionAck,
  createOptimisticTransactionReview,
  isTransactionSyncInvalidationEvent,
  parseTransactionSyncSubscription,
  transactionSyncRecordsFromChanges,
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

describe("transaction sync collection", () => {
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

  test("models realtime subscription handshake messages", () => {
    expect(parseTransactionSyncSubscription({ teamId: "team_1" })).toEqual({
      type: "sync.transactions.subscribe",
      teamId: "team_1",
      collection: "transactions",
    });
    expect(createTransactionSyncSubscriptionAck({ teamId: "team_1" })).toEqual({
      type: "sync.transactions.subscribed",
      teamId: "team_1",
      collection: "transactions",
      reconnect: "refetch_by_cursor",
    });
    expect(() =>
      parseTransactionSyncSubscription({ teamId: "team_1", collection: "documents" }),
    ).toThrow("Unsupported sync collection");
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
