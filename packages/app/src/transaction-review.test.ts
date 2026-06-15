import { describe, expect, test } from "bun:test";

import {
  AppError,
  listTransactionSyncCollection,
  listTransactionReviewWorkspace,
  reviewTransaction,
} from "./index";
import {
  createReviewRepository,
  createTestCategory,
  createTestTransaction,
  testActor,
} from "./testkit/fixtures";

describe("reviewTransaction", () => {
  test("categorizes, marks reviewed, audits, and emits outbox", async () => {
    const repository = createReviewRepository("member");

    const result = await reviewTransaction(
      repository,
      { actor: testActor, requestId: "request_1" },
      { teamId: "team_1", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
    );

    expect(result.transaction.categoryId).toBe("cat_1");
    expect(result.transaction.reviewState).toBe("reviewed");
    expect(result.replayed).toBe(false);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("rejects a forbidden actor", async () => {
    const repository = createReviewRepository("viewer");

    await expect(
      reviewTransaction(
        repository,
        { actor: testActor, requestId: "request_1" },
        {
          teamId: "team_1",
          transactionId: "txn_1",
          categoryId: "cat_1",
          idempotencyKey: "idem_1",
        },
      ),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot review transactions for this team"));
  });

  test("replays an idempotent mutation without duplicate side effects", async () => {
    const repository = createReviewRepository("owner");
    const context = { actor: testActor, requestId: "request_1" };
    const command = {
      teamId: "team_1",
      transactionId: "txn_1",
      categoryId: "cat_1",
      idempotencyKey: "idem_1",
    };

    await reviewTransaction(repository, context, command);
    const replay = await reviewTransaction(repository, context, command);

    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("rejects idempotency key reuse for a different review command", async () => {
    const repository = createReviewRepository("owner");
    const context = { actor: testActor, requestId: "request_1" };
    const command = {
      teamId: "team_1",
      transactionId: "txn_1",
      categoryId: "cat_1",
      idempotencyKey: "idem_1",
    };

    await reviewTransaction(repository, context, command);
    repository.categories.set("cat_2", createTestCategory({ id: "cat_2", name: "Meals" }));

    await expect(
      reviewTransaction(repository, context, { ...command, categoryId: "cat_2" }),
    ).rejects.toEqual(
      new AppError("CONFLICT", "Idempotency key was already used for a different review"),
    );
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("does not leak a selected team's query across memberships", async () => {
    const repository = createReviewRepository("owner");

    await expect(
      listTransactionReviewWorkspace(repository, {
        actor: testActor,
        requestId: "request_1",
        teamId: "team_2",
      }),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot read transactions for this team"));
  });

  test("returns not found when selected team does not own the transaction", async () => {
    const repository = createReviewRepository("owner");
    repository.memberships.set("user_1:team_2", "owner");

    await expect(
      reviewTransaction(
        repository,
        { actor: testActor, requestId: "request_1", teamId: "team_2" },
        { teamId: "team_2", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
      ),
    ).rejects.toEqual(new AppError("NOT_FOUND", "Transaction not found"));
  });
});

describe("listTransactionSyncCollection", () => {
  test("returns team-scoped cursor changes for readers", async () => {
    const repository = createReviewRepository("viewer");
    repository.transactions.set(
      "txn_2",
      createTestTransaction({
        id: "txn_2",
        teamId: "team_1",
        description: "Invoice",
        postedAt: "2026-06-15",
        money: { amountMinor: 5000, currency: "USD" },
        categoryId: "cat_1",
        reviewState: "reviewed",
        updatedAt: "2026-06-15T10:00:00.000Z",
      }),
    );
    repository.transactions.set(
      "txn_other",
      createTestTransaction({
        id: "txn_other",
        teamId: "team_2",
        description: "Other",
        postedAt: "2026-06-15",
        money: { amountMinor: -1000, currency: "USD" },
        categoryId: null,
        reviewState: "needs_review",
        updatedAt: "2026-06-16T10:00:00.000Z",
      }),
    );

    const response = await listTransactionSyncCollection(
      repository,
      { actor: testActor, requestId: "request_1" },
      { teamId: "team_1", cursor: "2026-06-14T12:00:00.000Z" },
    );

    expect(response).toMatchObject({
      collection: "transactions",
      teamId: "team_1",
      cursor: "2026-06-15T10:00:00.000Z",
      conflictPolicy: "server_wins_for_financial_state",
    });
    expect(
      response.changes.map((change) => (change.type === "upsert" ? change.record.id : "")),
    ).toEqual(["txn_2"]);
  });

  test("denies sync to non-members", async () => {
    const repository = createReviewRepository("viewer");

    await expect(
      listTransactionSyncCollection(
        repository,
        { actor: testActor, requestId: "request_1" },
        { teamId: "team_2" },
      ),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot sync transactions for this team"));
  });
});
