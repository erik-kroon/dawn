import { describe, expect, test } from "bun:test";

import {
  dispatchOutboxEvents,
  type JobRun,
  type OutboxDispatchRepository,
  type OutboxEvent,
  type OutboxQueuePublisher,
} from "./index";

class MemoryOutboxDispatchRepository implements OutboxDispatchRepository {
  events = new Map<string, OutboxEvent>();
  jobRuns: JobRun[] = [];
  skipClaims = new Set<string>();

  async withTransaction<T>(
    callback: (repository: OutboxDispatchRepository) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  async listDispatchableOutboxEvents(input: { limit: number; now: Date }) {
    return [...this.events.values()]
      .filter(
        (event) =>
          (event.status === "pending" || event.status === "failed") &&
          (!event.nextAttemptAt || new Date(event.nextAttemptAt) <= input.now),
      )
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .slice(0, input.limit);
  }

  async claimOutboxEventForDispatch(input: { outboxEventId: string; now: Date }) {
    if (this.skipClaims.has(input.outboxEventId)) {
      return null;
    }

    const event = this.events.get(input.outboxEventId);

    if (
      !event ||
      (event.status !== "pending" && event.status !== "failed") ||
      (event.nextAttemptAt && new Date(event.nextAttemptAt) > input.now)
    ) {
      return null;
    }

    const claimed = {
      ...event,
      status: "dispatching" as const,
      dispatchAttempts: event.dispatchAttempts + 1,
      lastError: null,
      nextAttemptAt: null,
    };
    this.events.set(input.outboxEventId, claimed);

    return claimed;
  }

  async createJobRun(input: {
    teamId: string;
    outboxEventId: string;
    jobType: JobRun["jobType"];
    queueName: string;
    status: JobRun["status"];
    attempt: number;
    idempotencyKey: string;
    error?: string | null;
  }) {
    const jobRun = {
      id: `job_${this.jobRuns.length + 1}`,
      ...input,
      error: input.error ?? null,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    } satisfies JobRun;
    this.jobRuns.push(jobRun);

    return jobRun;
  }

  async markOutboxEventDispatched(input: { outboxEventId: string; now: Date }) {
    const event = this.events.get(input.outboxEventId);

    if (event) {
      this.events.set(input.outboxEventId, {
        ...event,
        status: "dispatched",
        processedAt: input.now.toISOString(),
        lastError: null,
        nextAttemptAt: null,
      });
    }
  }

  async markOutboxEventDispatchFailed(input: {
    outboxEventId: string;
    error: string;
    nextAttemptAt: Date;
  }) {
    const event = this.events.get(input.outboxEventId);

    if (event) {
      this.events.set(input.outboxEventId, {
        ...event,
        status: "failed",
        lastError: input.error,
        nextAttemptAt: input.nextAttemptAt.toISOString(),
      });
    }
  }
}

class MemoryOutboxQueuePublisher implements OutboxQueuePublisher {
  messages: Parameters<OutboxQueuePublisher["publish"]>[0][] = [];

  constructor(private readonly failOnPublish?: number) {}

  async publish(message: Parameters<OutboxQueuePublisher["publish"]>[0]) {
    if (this.failOnPublish === this.messages.length + 1) {
      throw new Error("queue unavailable");
    }

    this.messages.push(message);
  }
}

describe("dispatchOutboxEvents", () => {
  test("publishes due transaction events and persists queued job runs", async () => {
    const repository = new MemoryOutboxDispatchRepository();
    const publisher = new MemoryOutboxQueuePublisher();
    const now = new Date("2026-06-15T10:00:00.000Z");
    repository.events.set("outbox_1", outboxEvent());

    const result = await dispatchOutboxEvents(repository, publisher, { now });

    expect(result).toEqual({
      scanned: 1,
      dispatched: 1,
      failed: 0,
      skipped: 0,
      queuedMessages: 4,
    });
    expect(publisher.messages.map((message) => message.type)).toEqual([
      "outbox.dispatch",
      "sync.invalidate",
      "automation.run",
      "webhook.deliver",
    ]);
    expect(repository.events.get("outbox_1")).toMatchObject({
      status: "dispatched",
      dispatchAttempts: 1,
      processedAt: "2026-06-15T10:00:00.000Z",
    });
    expect(repository.jobRuns).toMatchObject([
      {
        outboxEventId: "outbox_1",
        jobType: "outbox.dispatch",
        status: "queued",
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:attempt:1",
      },
      {
        outboxEventId: "outbox_1",
        jobType: "sync.invalidate",
        status: "queued",
        attempt: 1,
        idempotencyKey: "sync:transactions:outbox_1",
      },
      {
        outboxEventId: "outbox_1",
        jobType: "automation.run",
        status: "queued",
        attempt: 1,
        idempotencyKey: "automation:run:outbox_1",
      },
      {
        outboxEventId: "outbox_1",
        jobType: "webhook.deliver",
        status: "queued",
        attempt: 1,
        idempotencyKey: "webhook:deliver:outbox_1",
      },
    ]);
  });

  test("skips events claimed by another dispatcher", async () => {
    const repository = new MemoryOutboxDispatchRepository();
    const publisher = new MemoryOutboxQueuePublisher();
    repository.events.set("outbox_1", outboxEvent());
    repository.skipClaims.add("outbox_1");

    const result = await dispatchOutboxEvents(repository, publisher, {
      now: new Date("2026-06-15T10:00:00.000Z"),
    });

    expect(result).toMatchObject({ scanned: 1, dispatched: 0, skipped: 1 });
    expect(publisher.messages).toHaveLength(0);
    expect(repository.jobRuns).toHaveLength(0);
  });

  test("records failed dispatches with retry metadata", async () => {
    const repository = new MemoryOutboxDispatchRepository();
    const publisher = new MemoryOutboxQueuePublisher(1);
    const now = new Date("2026-06-15T10:00:00.000Z");
    repository.events.set("outbox_1", outboxEvent());

    const result = await dispatchOutboxEvents(repository, publisher, { now });

    expect(result).toMatchObject({ scanned: 1, dispatched: 0, failed: 1 });
    expect(repository.events.get("outbox_1")).toMatchObject({
      status: "failed",
      dispatchAttempts: 1,
      lastError: "queue unavailable",
      nextAttemptAt: "2026-06-15T10:00:30.000Z",
    });
    expect(repository.jobRuns).toMatchObject([
      {
        outboxEventId: "outbox_1",
        jobType: "outbox.dispatch",
        status: "failed",
        attempt: 1,
        idempotencyKey: "outbox:outbox_1:failed:1",
        error: "queue unavailable",
      },
    ]);
  });

  test("retries due failed events with the next attempt number", async () => {
    const repository = new MemoryOutboxDispatchRepository();
    const publisher = new MemoryOutboxQueuePublisher();
    repository.events.set(
      "outbox_1",
      outboxEvent({
        status: "failed",
        dispatchAttempts: 1,
        lastError: "queue unavailable",
        nextAttemptAt: "2026-06-15T09:59:00.000Z",
      }),
    );

    await dispatchOutboxEvents(repository, publisher, {
      now: new Date("2026-06-15T10:00:00.000Z"),
    });

    expect(publisher.messages[0]).toMatchObject({
      type: "outbox.dispatch",
      attempt: 2,
      idempotencyKey: "outbox:outbox_1:attempt:2",
    });
    expect(repository.jobRuns[0]).toMatchObject({
      attempt: 2,
      idempotencyKey: "outbox:outbox_1:attempt:2",
    });
    expect(repository.events.get("outbox_1")).toMatchObject({
      status: "dispatched",
      dispatchAttempts: 2,
      lastError: null,
    });
  });
});

function outboxEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "outbox_1",
    teamId: "team_1",
    type: "transaction.created",
    version: 1,
    payload: { transactionId: "txn_1" },
    status: "pending",
    dispatchAttempts: 0,
    occurredAt: "2026-06-15T09:00:00.000Z",
    processedAt: null,
    lastError: null,
    nextAttemptAt: null,
    ...overrides,
  };
}
