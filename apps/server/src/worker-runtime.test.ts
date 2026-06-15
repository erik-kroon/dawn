import { describe, expect, test } from "bun:test";

import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import type { DawnQueueMessage, SyncInvalidationJob } from "@dawn/jobs";

import { createDawnWorkerRuntime, handleDawnWorkerQueueBatch } from "./worker-runtime";

const syncInvalidationJob = {
  type: "sync.invalidate",
  teamId: "team_1",
  collection: "transactions",
  cursor: null,
  changedIds: ["txn_1"],
  sourceOutboxEventId: "outbox_1",
  idempotencyKey: "sync:transactions:outbox_1",
} satisfies SyncInvalidationJob;
const projectSyncInvalidationJob = {
  ...syncInvalidationJob,
  collection: "projects",
  changedIds: ["project_1"],
  idempotencyKey: "sync:projects:outbox_1",
} satisfies SyncInvalidationJob;

describe("Dawn worker runtime", () => {
  test("reports queue runtime health and registered job handlers", () => {
    const runtime = createDawnWorkerRuntime(createWorkerTestEnv(async () => Response.json({})));

    expect(runtime.health()).toMatchObject({
      service: "dawn-worker",
      status: "ok",
      environment: "preview",
      bindings: {
        database: "bound",
        documents: "bound",
        jobs: "bound",
        deadLetter: "bound",
        tenantCoordinator: "bound",
      },
      configuration: {
        gmail: "missing",
      },
    });
    expect(runtime.health().handlers).toEqual([
      "automation.run",
      "bank.sync",
      "document.extract",
      "inbox.match_suggestions",
      "inbox.provider.sync",
      "insights.weekly.generate",
      "invoice.recurring.generate",
      "outbox.dispatch",
      "sync.invalidate",
      "team_data.delete",
      "team_data.export",
      "transaction.match_pending_inbox",
      "transaction_import.commit",
      "webhook.deliver",
    ]);
  });

  test("reports Gmail worker configuration when both OAuth values are present", () => {
    const runtime = createDawnWorkerRuntime(
      createWorkerTestEnv(async () => Response.json({}), {
        GMAIL_CLIENT_ID: "gmail-client-id",
        GMAIL_CLIENT_SECRET: "gmail-client-secret",
      }),
    );

    expect(runtime.health().configuration).toEqual({ gmail: "configured" });
  });

  test("runs sync invalidation jobs through the worker registry", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const runtime = createDawnWorkerRuntime(
      createWorkerTestEnv(async (input, init) => {
        requests.push({
          url: input.toString(),
          body: JSON.parse(String(init?.body)),
        });

        return Response.json({ delivered: 1, subscribers: 2 });
      }),
    );

    await runtime.handleMessage(syncInvalidationJob);

    expect(requests).toEqual([
      {
        url: "https://tenant-coordinator/invalidate",
        body: {
          type: "sync.transactions.invalidated",
          teamId: "team_1",
          collection: "transactions",
          cursor: null,
          changedIds: ["txn_1"],
        },
      },
    ]);
  });

  test("runs project sync invalidation jobs through the worker registry", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const runtime = createDawnWorkerRuntime(
      createWorkerTestEnv(async (input, init) => {
        requests.push({
          url: input.toString(),
          body: JSON.parse(String(init?.body)),
        });

        return Response.json({ delivered: 1, subscribers: 2 });
      }),
    );

    await runtime.handleMessage(projectSyncInvalidationJob);

    expect(requests).toEqual([
      {
        url: "https://tenant-coordinator/invalidate",
        body: {
          type: "sync.projects.invalidated",
          teamId: "team_1",
          collection: "projects",
          cursor: null,
          changedIds: ["project_1"],
        },
      },
    ]);
  });

  test("acks handled queue messages", async () => {
    let acked = 0;
    let retried = 0;
    const env = createWorkerTestEnv(async () => Response.json({ delivered: 1, subscribers: 2 }));
    const message = {
      body: syncInvalidationJob,
      ack() {
        acked += 1;
      },
      retry() {
        retried += 1;
      },
    } as Message<DawnQueueMessage>;

    await handleDawnWorkerQueueBatch(
      { messages: [message] } as unknown as MessageBatch<DawnQueueMessage>,
      env,
    );

    expect(acked).toBe(1);
    expect(retried).toBe(0);
  });
});

function createWorkerTestEnv(
  fetch: DurableObjectStub["fetch"],
  overrides: Partial<DawnCloudflareBindings> = {},
): DawnCloudflareBindings {
  return {
    ENVIRONMENT: "preview",
    NODE_ENV: "test",
    CORS_ORIGIN: "http://localhost:3001",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret",
    POLAR_ACCESS_TOKEN: "test",
    POLAR_SUCCESS_URL: "http://localhost:3001/success",
    DATABASE_URL: "postgres://test",
    DAWN_DOCUMENTS: {} as R2Bucket,
    DAWN_JOBS: {} as Queue<DawnQueueMessage>,
    DAWN_JOBS_DLQ: {} as Queue<DawnQueueMessage>,
    DAWN_CACHE: {} as KVNamespace,
    DAWN_TENANT_COORDINATOR: {
      idFromName(name: string) {
        return { name } as unknown as DurableObjectId;
      },
      get() {
        return { fetch } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
    ...overrides,
  };
}
