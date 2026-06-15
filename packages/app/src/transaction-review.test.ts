import { describe, expect, test } from "bun:test";

import {
  AppError,
  listTransactionSyncCollection,
  listTransactionReviewWorkspace,
  reviewTransaction,
  updateTransactionAccountantStatus,
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

  test("marks reviewed transactions without receipts as missing receipt", async () => {
    const repository = createReviewRepository("member");

    const result = await reviewTransaction(
      repository,
      { actor: testActor, requestId: "request_1" },
      { teamId: "team_1", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
    );

    expect(result.transaction.accountantStatus).toBe("missing_receipt");
  });

  test("marks reviewed transactions with accepted receipts as ready to export", async () => {
    const repository = createReviewRepository("member");
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });

    const result = await reviewTransaction(
      repository,
      { actor: testActor, requestId: "request_1" },
      { teamId: "team_1", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
    );

    expect(result.transaction.accountantStatus).toBe("ready_to_export");
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

describe("updateTransactionAccountantStatus", () => {
  test("excludes transactions with audit, outbox, and idempotency", async () => {
    const repository = createReviewRepository("member");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        categoryId: "cat_1",
        reviewState: "reviewed",
      }),
    );
    const command = {
      teamId: "team_1",
      transactionId: "txn_1",
      action: "exclude" as const,
      reason: "Owner confirmed personal spend",
      idempotencyKey: "status_1",
    };

    const first = await updateTransactionAccountantStatus(
      repository,
      { actor: testActor, requestId: "request_1" },
      command,
    );
    const second = await updateTransactionAccountantStatus(
      repository,
      { actor: testActor, requestId: "request_2" },
      command,
    );

    expect(first.transaction.accountantStatus).toBe("excluded");
    expect(first.nextStatus).toBe("excluded");
    expect(second.replayed).toBe(true);
    expect(repository.auditEvents).toMatchObject([
      { action: "transaction.accountant_status.exclude" },
    ]);
    expect(repository.outboxEvents).toMatchObject([
      {
        type: "transaction.accountant_status_changed",
        payload: { transactionId: "txn_1", nextStatus: "excluded" },
      },
    ]);
  });

  test("retries failed exports back to the derived ready state", async () => {
    const repository = createReviewRepository("member");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        categoryId: "cat_1",
        reviewState: "reviewed",
        accountantStatus: "export_failed",
      }),
    );
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });

    const result = await updateTransactionAccountantStatus(
      repository,
      { actor: testActor, requestId: "request_1" },
      {
        teamId: "team_1",
        transactionId: "txn_1",
        action: "retry_export",
        idempotencyKey: "status_1",
      },
    );

    expect(result.previousStatus).toBe("export_failed");
    expect(result.nextStatus).toBe("ready_to_export");
    expect(result.transaction.accountantStatus).toBe("ready_to_export");
  });

  test("rejects a viewer changing accountant status", async () => {
    const repository = createReviewRepository("viewer");

    await expect(
      updateTransactionAccountantStatus(
        repository,
        { actor: testActor, requestId: "request_1" },
        {
          teamId: "team_1",
          transactionId: "txn_1",
          action: "archive",
          idempotencyKey: "status_1",
        },
      ),
    ).rejects.toEqual(
      new AppError("FORBIDDEN", "You cannot update accountant transaction status for this team"),
    );
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
