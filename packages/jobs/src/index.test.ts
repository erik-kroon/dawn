import { describe, expect, test } from "bun:test";

import { createOutboxDispatchJob, nextOutboxRetryAt, outboxEventToQueueMessages } from "./index";

const event = {
  id: "outbox_1",
  teamId: "team_1",
  type: "transaction.created",
  version: 1,
  payload: { transactionId: "txn_1" },
  dispatchAttempts: 0,
};

describe("job contracts", () => {
  test("creates idempotent outbox dispatch jobs", () => {
    expect(createOutboxDispatchJob(event)).toEqual({
      type: "outbox.dispatch",
      outboxEventId: "outbox_1",
      teamId: "team_1",
      eventType: "transaction.created",
      version: 1,
      attempt: 1,
      idempotencyKey: "outbox:outbox_1:attempt:1",
    });
  });

  test("maps transaction outbox events to realtime invalidation input", () => {
    expect(outboxEventToQueueMessages(event)).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "transaction.created",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "sync.invalidate",
        teamId: "team_1",
        collection: "transactions",
        cursor: null,
        changedIds: ["txn_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "sync:transactions:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "transaction.created",
        idempotencyKey: "automation:run:outbox_1",
      },
    ]);
  });

  test("maps bank sync outbox events to transaction invalidation input", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "bank_connection.synced",
        payload: { transactionIds: ["txn_1", "txn_2"] },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "bank_connection.synced",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "sync.invalidate",
        teamId: "team_1",
        collection: "transactions",
        cursor: null,
        changedIds: ["txn_1", "txn_2"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "sync:transactions:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "bank_connection.synced",
        idempotencyKey: "automation:run:outbox_1",
      },
    ]);
  });

  test("maps document upload outbox events to extraction jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "document.uploaded",
        payload: {
          documentId: "doc_1",
          versionId: "ver_1",
          inboxItemId: "inbox_1",
          actorId: "user_1",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "document.uploaded",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "document.extract",
        teamId: "team_1",
        documentId: "doc_1",
        versionId: "ver_1",
        inboxItemId: "inbox_1",
        actorId: "user_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "document:extract:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "document.uploaded",
        idempotencyKey: "automation:run:outbox_1",
      },
    ]);
  });

  test("maps recurring invoice due events to generation jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "recurring_invoice.due",
        payload: {
          scheduleId: "schedule_1",
          sourceInvoiceId: "invoice_1",
          runAt: "2026-07-15T00:00:00.000Z",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "recurring_invoice.due",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "invoice.recurring.generate",
        teamId: "team_1",
        scheduleId: "schedule_1",
        sourceInvoiceId: "invoice_1",
        runAt: "2026-07-15T00:00:00.000Z",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "invoice:recurring:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "recurring_invoice.due",
        idempotencyKey: "automation:run:outbox_1",
      },
    ]);
  });

  test("maps weekly insight due events to generation jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "insights.weekly.due",
        payload: {
          periodStart: "2026-06-08T00:00:00.000Z",
          periodEnd: "2026-06-15T00:00:00.000Z",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "insights.weekly.due",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "insights.weekly.generate",
        teamId: "team_1",
        periodStart: "2026-06-08T00:00:00.000Z",
        periodEnd: "2026-06-15T00:00:00.000Z",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "insights:weekly:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "insights.weekly.due",
        idempotencyKey: "automation:run:outbox_1",
      },
    ]);
  });

  test("calculates capped exponential retry delays", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");

    expect(nextOutboxRetryAt({ attempt: 1, now }).toISOString()).toBe("2026-06-15T10:00:30.000Z");
    expect(nextOutboxRetryAt({ attempt: 20, now }).toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });
});
