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
    ]);
  });

  test("calculates capped exponential retry delays", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");

    expect(nextOutboxRetryAt({ attempt: 1, now }).toISOString()).toBe("2026-06-15T10:00:30.000Z");
    expect(nextOutboxRetryAt({ attempt: 20, now }).toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });
});
