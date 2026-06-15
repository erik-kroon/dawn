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

function webhookDeliveryJob(eventType: string) {
  return {
    type: "webhook.deliver" as const,
    teamId: "team_1",
    sourceOutboxEventId: "outbox_1",
    eventType,
    idempotencyKey: "webhook:deliver:outbox_1",
  };
}

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
      webhookDeliveryJob("transaction.created"),
    ]);
  });

  test("maps transfer pair outbox events to transaction invalidation input", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "transaction.transfer_pair.created",
        payload: { transferGroupId: "transfer_1", transactionIds: ["txn_1", "txn_2"] },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "transaction.transfer_pair.created",
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
        eventType: "transaction.transfer_pair.created",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("transaction.transfer_pair.created"),
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
      webhookDeliveryJob("bank_connection.synced"),
    ]);
  });

  test("maps bank sync requests to queued bank sync jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "bank_connection.sync_requested",
        payload: {
          connectionId: "conn_1",
          provider: "sandbox-bank",
          providerConnectionId: "sandbox_item_team_1",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "bank_connection.sync_requested",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "bank.sync",
        teamId: "team_1",
        connectionId: "conn_1",
        provider: "sandbox-bank",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "bank:sync:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "bank_connection.sync_requested",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("bank_connection.sync_requested"),
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
      webhookDeliveryJob("document.uploaded"),
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
      webhookDeliveryJob("recurring_invoice.due"),
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
      webhookDeliveryJob("insights.weekly.due"),
    ]);
  });

  test("maps team data workflow requests to queued jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "team_data.export_requested",
        payload: { workflowType: "team_data_export", format: "json" },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "team_data.export_requested",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "team_data.export",
        teamId: "team_1",
        format: "json",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "team-data:export:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "team_data.export_requested",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("team_data.export_requested"),
    ]);
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "team_data.deletion_requested",
        payload: { workflowType: "team_data_deletion" },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "team_data.deletion_requested",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "team_data.delete",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "team-data:delete:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "team_data.deletion_requested",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("team_data.deletion_requested"),
    ]);
  });

  test("calculates capped exponential retry delays", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");

    expect(nextOutboxRetryAt({ attempt: 1, now }).toISOString()).toBe("2026-06-15T10:00:30.000Z");
    expect(nextOutboxRetryAt({ attempt: 20, now }).toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });
});
