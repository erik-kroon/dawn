import { describe, expect, test } from "bun:test";

import {
  createDawnQueueMessageHandlerRegistry,
  createOutboxDispatchJob,
  nextOutboxRetryAt,
  outboxEventToQueueMessages,
  type DawnQueueMessageHandlers,
} from "./index";

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

function inboxMatchBatchJob(input: { transactionIds?: string[]; inboxItemIds?: string[] }) {
  return {
    type: "inbox.match_bidirectional_batch" as const,
    teamId: "team_1",
    transactionIds: input.transactionIds ?? [],
    inboxItemIds: input.inboxItemIds ?? [],
    sourceOutboxEventId: "outbox_1",
    idempotencyKey: "inbox:match-batch:outbox_1",
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
      inboxMatchBatchJob({ transactionIds: ["txn_1"] }),
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

  test("maps project outbox events to project invalidation input", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "project.created",
        payload: { projectId: "project_1" },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "project.created",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "sync.invalidate",
        teamId: "team_1",
        collection: "projects",
        cursor: null,
        changedIds: ["project_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "sync:projects:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "project.created",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("project.created"),
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
      inboxMatchBatchJob({ transactionIds: ["txn_1", "txn_2"] }),
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

  test("maps transaction import outbox events to bidirectional inbox matching jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "transaction_import.committed",
        payload: { importSessionId: "import_1", transactionIds: ["txn_1", "txn_2"] },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "transaction_import.committed",
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
      inboxMatchBatchJob({ transactionIds: ["txn_1", "txn_2"] }),
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "transaction_import.committed",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("transaction_import.committed"),
    ]);
  });

  test("maps queued transaction imports to commit jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "transaction_import.queued",
        payload: {
          importSessionId: "import_1",
          payloadObjectKey: "teams/team_1/transaction-imports/import_1.json",
          actorId: "user_1",
          accountId: "acct_1",
          rowCount: 501,
          readyCount: 500,
          duplicateCount: 1,
          invalidCount: 0,
        },
      }),
    ).toContainEqual({
      type: "transaction_import.commit",
      teamId: "team_1",
      importSessionId: "import_1",
      payloadObjectKey: "teams/team_1/transaction-imports/import_1.json",
      actorId: "user_1",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "transaction-import:commit:outbox_1:import_1",
    });
  });

  test("maps accountant status changes to transaction invalidation input", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "transaction.accountant_status_changed",
        payload: {
          transactionId: "txn_1",
          previousStatus: "ready_to_export",
          nextStatus: "exported",
        },
      }),
    ).toContainEqual({
      type: "sync.invalidate",
      teamId: "team_1",
      collection: "transactions",
      cursor: null,
      changedIds: ["txn_1"],
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "sync:transactions:outbox_1",
    });
  });

  test("maps accountant packet exports to transaction invalidation input", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "accountant_packet.exported",
        payload: { packetId: "packet_1", transactionIds: ["txn_1", "txn_2"] },
      }),
    ).toContainEqual({
      type: "sync.invalidate",
      teamId: "team_1",
      collection: "transactions",
      cursor: null,
      changedIds: ["txn_1", "txn_2"],
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "sync:transactions:outbox_1",
    });
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

  test("maps Fortnox connection events to initial sync jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "integration.connected",
        payload: {
          connectionId: "conn_fortnox_1",
          provider: "fortnox",
          category: "accounting",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "integration.connected",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "fortnox.sync",
        teamId: "team_1",
        connectionId: "conn_fortnox_1",
        provider: "fortnox",
        syncMode: "initial",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "fortnox:initial-sync:outbox_1:conn_fortnox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "integration.connected",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("integration.connected"),
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

  test("maps document extraction retry requests to extraction jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "document_extraction.retry_requested",
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
        eventType: "document_extraction.retry_requested",
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
        eventType: "document_extraction.retry_requested",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("document_extraction.retry_requested"),
    ]);
  });

  test("maps extracted document outbox events to bidirectional inbox matching jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "document.extracted",
        payload: {
          inboxItemId: "inbox_1",
          documentId: "doc_1",
          versionId: "ver_1",
          extractionId: "extraction_1",
        },
      }),
    ).toEqual([
      {
        type: "outbox.dispatch",
        outboxEventId: "outbox_1",
        teamId: "team_1",
        eventType: "document.extracted",
        version: 1,
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        type: "inbox.match_bidirectional_batch",
        teamId: "team_1",
        transactionIds: [],
        inboxItemIds: ["inbox_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "inbox:match-batch:outbox_1",
      },
      {
        type: "automation.run",
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        eventType: "document.extracted",
        idempotencyKey: "automation:run:outbox_1",
      },
      webhookDeliveryJob("document.extracted"),
    ]);
  });

  test("maps inbox provider sync requests to queued sync jobs", () => {
    const messages = outboxEventToQueueMessages({
      id: "outbox_1",
      teamId: "team_1",
      type: "inbox.provider.sync_requested",
      version: 1,
      payload: {
        connectionId: "conn_1",
        provider: "gmail",
      },
      dispatchAttempts: 0,
    });

    expect(messages).toContainEqual({
      type: "inbox.provider.sync",
      teamId: "team_1",
      connectionId: "conn_1",
      provider: "gmail",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "inbox:provider-sync:outbox_1:conn_1",
    });
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

  test("maps accountant packet export requests to queued jobs", () => {
    expect(
      outboxEventToQueueMessages({
        ...event,
        type: "accountant_packet.export_requested",
        payload: {
          actorId: "user_1",
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          transactionIds: ["txn_1"],
          formats: ["csv", "xlsx"],
          csvDelimiter: ";",
        },
      }),
    ).toContainEqual({
      type: "accountant_packet.export",
      teamId: "team_1",
      actorId: "user_1",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      transactionIds: ["txn_1"],
      formats: ["csv", "xlsx"],
      csvDelimiter: ";",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "accountant-packet:export:outbox_1",
    });
  });

  test("calculates capped exponential retry delays", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");

    expect(nextOutboxRetryAt({ attempt: 1, now }).toISOString()).toBe("2026-06-15T10:00:30.000Z");
    expect(nextOutboxRetryAt({ attempt: 20, now }).toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });

  test("routes queue messages through registered handlers", async () => {
    const handled: string[] = [];
    const record = (expectedType: string) => async (message: { type: string }) => {
      handled.push(`${expectedType}:${message.type}`);
    };
    const handlers: DawnQueueMessageHandlers = {
      "outbox.dispatch": record("outbox.dispatch"),
      "sync.invalidate": record("sync.invalidate"),
      "document.extract": record("document.extract"),
      "inbox.match_bidirectional_batch": record("inbox.match_bidirectional_batch"),
      "inbox.match_suggestions": record("inbox.match_suggestions"),
      "inbox.provider.sync": record("inbox.provider.sync"),
      "transaction_import.commit": record("transaction_import.commit"),
      "transaction.match_pending_inbox": record("transaction.match_pending_inbox"),
      "invoice.recurring.generate": record("invoice.recurring.generate"),
      "insights.weekly.generate": record("insights.weekly.generate"),
      "automation.run": record("automation.run"),
      "bank.sync": record("bank.sync"),
      "fortnox.sync": record("fortnox.sync"),
      "webhook.deliver": record("webhook.deliver"),
      "team_data.export": record("team_data.export"),
      "accountant_packet.export": record("accountant_packet.export"),
      "team_data.delete": record("team_data.delete"),
    };
    const registry = createDawnQueueMessageHandlerRegistry(handlers);

    await registry.handle({
      type: "team_data.delete",
      teamId: "team_1",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "team-data:delete:outbox_1",
    });

    expect(handled).toEqual(["team_data.delete:team_data.delete"]);
  });
});
