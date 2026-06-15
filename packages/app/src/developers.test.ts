import { describe, expect, test } from "bun:test";

import {
  createApiKey,
  createWebhookSubscription,
  deliverWebhooksForOutboxEvent,
  listDeveloperWorkspace,
  resolvePublicApiKey,
  type DawnRepository,
  type IdempotencyResult,
  type OutboxEvent,
  type WebhookDeliveryProvider,
} from ".";
import type {
  Actor,
  ApiKey,
  OAuthApp,
  TeamRole,
  WebhookDelivery,
  WebhookSubscription,
} from "@dawn/domain";

class MemoryDeveloperRepository {
  role: TeamRole | null = "owner";
  apiKeys = new Map<string, ApiKey & { keyHash: string }>();
  oauthApps = new Map<string, OAuthApp>();
  webhookSubscriptions = new Map<string, WebhookSubscription & { signingSecretHash: string }>();
  webhookDeliveries = new Map<string, WebhookDelivery>();
  outboxEvents = new Map<string, OutboxEvent>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  auditEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(_actor: Actor, teamId: string) {
    return this.role && teamId === "team_1" ? { role: this.role } : null;
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
  }

  async saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }) {
    this.idempotency.set(`${input.teamId}:${input.actorId}:${input.operation}:${input.key}`, {
      fingerprint: input.fingerprint,
      result: input.result,
    });
  }

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
  }

  async listApiKeys(teamId: string) {
    return [...this.apiKeys.values()].filter((apiKey) => apiKey.teamId === teamId);
  }

  async listOAuthApps(teamId: string) {
    return [...this.oauthApps.values()].filter((app) => app.teamId === teamId);
  }

  async listWebhookSubscriptions(teamId: string) {
    return [...this.webhookSubscriptions.values()].filter(
      (subscription) => subscription.teamId === teamId,
    );
  }

  async listWebhookDeliveries(teamId: string, limit: number) {
    return [...this.webhookDeliveries.values()]
      .filter((delivery) => delivery.teamId === teamId)
      .slice(0, limit);
  }

  async getApiKeyByHash(keyHash: string) {
    const apiKey = [...this.apiKeys.values()].find((candidate) => candidate.keyHash === keyHash);
    return apiKey ?? null;
  }

  async markApiKeyUsed(input: { apiKeyId: string; lastUsedAt: string }) {
    const apiKey = this.apiKeys.get(input.apiKeyId);
    if (apiKey) {
      this.apiKeys.set(apiKey.id, { ...apiKey, lastUsedAt: input.lastUsedAt });
    }
  }

  async createApiKey(input: {
    apiKeyId: string;
    teamId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKey["scopes"];
    createdByActorId: string;
  }) {
    const apiKey = {
      id: input.apiKeyId,
      teamId: input.teamId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      createdByActorId: input.createdByActorId,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.apiKeys.set(apiKey.id, apiKey);
    return apiKey;
  }

  async createWebhookSubscription(input: {
    subscriptionId: string;
    teamId: string;
    url: string;
    eventTypes: string[];
    signingSecretHash: string;
    createdByActorId: string;
  }) {
    const now = new Date().toISOString();
    const subscription = {
      id: input.subscriptionId,
      teamId: input.teamId,
      url: input.url,
      eventTypes: input.eventTypes,
      signingSecretHash: input.signingSecretHash,
      status: "active" as const,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    this.webhookSubscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async listActiveWebhookSubscriptionsForEvent(input: { teamId: string; eventType: string }) {
    return [...this.webhookSubscriptions.values()].filter(
      (subscription) =>
        subscription.teamId === input.teamId &&
        subscription.status === "active" &&
        subscription.eventTypes.includes(input.eventType),
    );
  }

  async getOutboxEventForTeam(teamId: string, outboxEventId: string) {
    const event = this.outboxEvents.get(outboxEventId);
    return event?.teamId === teamId ? event : null;
  }

  async createWebhookDelivery(input: {
    deliveryId: string;
    teamId: string;
    subscriptionId: string;
    outboxEventId: string;
    status: WebhookDelivery["status"];
    attempt: number;
    requestPayload: Record<string, unknown>;
    responseStatus?: number | null;
    responseBody?: string | null;
    error?: string | null;
    nextAttemptAt?: string | null;
    deliveredAt?: string | null;
  }) {
    const now = new Date().toISOString();
    const delivery = {
      id: input.deliveryId,
      teamId: input.teamId,
      subscriptionId: input.subscriptionId,
      outboxEventId: input.outboxEventId,
      status: input.status,
      attempt: input.attempt,
      requestPayload: input.requestPayload,
      responseStatus: input.responseStatus ?? null,
      responseBody: input.responseBody ?? null,
      error: input.error ?? null,
      nextAttemptAt: input.nextAttemptAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.webhookDeliveries.set(delivery.id, delivery);
    return delivery;
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

function seedOutboxEvent(repository: MemoryDeveloperRepository) {
  repository.outboxEvents.set("outbox_1", {
    id: "outbox_1",
    teamId: "team_1",
    type: "transaction.created",
    version: 1,
    payload: { transactionId: "txn_1" },
    dispatchAttempts: 0,
    status: "pending",
    occurredAt: "2026-06-15T00:00:00.000Z",
  });
}

describe("developer and public API use cases", () => {
  test("creates hashed scoped API keys and resolves public actors", async () => {
    const repository = new MemoryDeveloperRepository();

    const created = await createApiKey(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Reporting client",
      scopes: ["transactions.read"],
      idempotencyKey: "api_key_1",
    });
    const replayed = await createApiKey(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Reporting client",
      scopes: ["transactions.read"],
      idempotencyKey: "api_key_1",
    });
    const resolved = await resolvePublicApiKey(
      repository as unknown as DawnRepository,
      created.token,
    );
    const workspace = await listDeveloperWorkspace(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
      },
    );

    expect(created.token).toStartWith("dawn_");
    expect(repository.apiKeys.get(created.apiKey.id)?.keyHash).not.toBe(created.token);
    expect(replayed).toMatchObject({ replayed: true, token: "" });
    expect(resolved.actor).toMatchObject({
      type: "api_key",
      teamId: "team_1",
      permissions: ["transactions.read"],
    });
    expect(workspace.apiKeys[0]).toMatchObject({
      keyPrefix: created.token.slice(0, 14),
      scopes: ["transactions.read"],
    });
  });

  test("creates webhook subscriptions and logs delivered attempts", async () => {
    const repository = new MemoryDeveloperRepository();
    seedOutboxEvent(repository);
    const provider: WebhookDeliveryProvider = {
      async deliver() {
        return { status: 204, body: "" };
      },
    };

    const subscription = await createWebhookSubscription(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        url: "https://example.com/webhooks/dawn",
        eventTypes: ["transaction.created"],
        idempotencyKey: "webhook_1",
      },
    );
    const replayed = await createWebhookSubscription(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        url: "https://example.com/webhooks/dawn",
        eventTypes: ["transaction.created"],
        idempotencyKey: "webhook_1",
      },
    );
    const result = await deliverWebhooksForOutboxEvent(
      repository as unknown as DawnRepository,
      provider,
      {
        teamId: "team_1",
        outboxEventId: "outbox_1",
        now: new Date("2026-06-15T10:00:00.000Z"),
      },
    );

    expect(subscription.signingSecret).toStartWith("whsec_");
    expect(replayed).toMatchObject({ replayed: true, signingSecret: "" });
    expect(result).toMatchObject({ scanned: 1, delivered: 1, failed: 0 });
    expect(result.deliveries[0]).toMatchObject({
      status: "delivered",
      responseStatus: 204,
      deliveredAt: "2026-06-15T10:00:00.000Z",
    });
  });

  test("records retry metadata when webhook delivery fails", async () => {
    const repository = new MemoryDeveloperRepository();
    seedOutboxEvent(repository);
    await createWebhookSubscription(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      url: "https://example.com/webhooks/dawn",
      eventTypes: ["transaction.created"],
      idempotencyKey: "webhook_1",
    });

    const result = await deliverWebhooksForOutboxEvent(
      repository as unknown as DawnRepository,
      {
        async deliver() {
          return { status: 500, body: "nope" };
        },
      },
      {
        teamId: "team_1",
        outboxEventId: "outbox_1",
        now: new Date("2026-06-15T10:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({ scanned: 1, delivered: 0, failed: 1 });
    expect(result.deliveries[0]).toMatchObject({
      status: "failed",
      responseStatus: 500,
      nextAttemptAt: "2026-06-15T10:00:30.000Z",
    });
  });
});
