import type {
  ApiKey,
  OAuthApp,
  OAuthGrant,
  WebhookDelivery,
  WebhookSubscription,
} from "@dawn/domain";
import { and, desc, eq } from "drizzle-orm";

import * as schema from "../schema";
import type { QueryClient } from "./types";

export async function listApiKeys(client: QueryClient, teamId: string): Promise<ApiKey[]> {
  const keys = await client
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.teamId, teamId))
    .orderBy(desc(schema.apiKey.createdAt));

  return keys.map(mapApiKey);
}

export async function listOAuthApps(client: QueryClient, teamId: string): Promise<OAuthApp[]> {
  const apps = await client
    .select()
    .from(schema.oauthApp)
    .where(eq(schema.oauthApp.teamId, teamId))
    .orderBy(desc(schema.oauthApp.createdAt));

  return apps.map(mapOAuthApp);
}

export async function listOAuthGrants(client: QueryClient, teamId: string): Promise<OAuthGrant[]> {
  const grants = await client
    .select()
    .from(schema.oauthGrant)
    .where(eq(schema.oauthGrant.teamId, teamId))
    .orderBy(desc(schema.oauthGrant.createdAt));

  return grants.map(mapOAuthGrant);
}

export async function listWebhookSubscriptions(
  client: QueryClient,
  teamId: string,
): Promise<WebhookSubscription[]> {
  const subscriptions = await client
    .select()
    .from(schema.webhookSubscription)
    .where(eq(schema.webhookSubscription.teamId, teamId))
    .orderBy(desc(schema.webhookSubscription.createdAt));

  return subscriptions.map(mapWebhookSubscription);
}

export async function listWebhookDeliveries(
  client: QueryClient,
  teamId: string,
  limit: number,
): Promise<WebhookDelivery[]> {
  const deliveries = await client
    .select()
    .from(schema.webhookDelivery)
    .where(eq(schema.webhookDelivery.teamId, teamId))
    .orderBy(desc(schema.webhookDelivery.createdAt))
    .limit(limit);

  return deliveries.map(mapWebhookDelivery);
}

export async function getApiKeyByHash(
  client: QueryClient,
  keyHash: string,
): Promise<ApiKey | null> {
  const [apiKey] = await client
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.keyHash, keyHash))
    .limit(1);

  return apiKey ? mapApiKey(apiKey) : null;
}

export async function getOAuthAppForTeam(
  client: QueryClient,
  teamId: string,
  appId: string,
): Promise<OAuthApp | null> {
  const [app] = await client
    .select()
    .from(schema.oauthApp)
    .where(and(eq(schema.oauthApp.teamId, teamId), eq(schema.oauthApp.id, appId)))
    .limit(1);

  return app ? mapOAuthApp(app) : null;
}

export async function markApiKeyUsed(
  client: QueryClient,
  input: { apiKeyId: string; lastUsedAt: string },
): Promise<void> {
  await client
    .update(schema.apiKey)
    .set({ lastUsedAt: new Date(input.lastUsedAt) })
    .where(eq(schema.apiKey.id, input.apiKeyId));
}

export async function createApiKey(
  client: QueryClient,
  input: {
    apiKeyId: string;
    teamId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKey["scopes"];
    createdByActorId: string;
  },
): Promise<ApiKey> {
  const [apiKey] = await client
    .insert(schema.apiKey)
    .values({
      id: input.apiKeyId,
      teamId: input.teamId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      createdByActorId: input.createdByActorId,
    })
    .returning();

  if (!apiKey) {
    throw new Error("Failed to create API key");
  }

  return mapApiKey(apiKey);
}

export async function createOAuthApp(
  client: QueryClient,
  input: {
    appId: string;
    teamId: string;
    name: string;
    redirectUris: string[];
    scopes: OAuthApp["scopes"];
    createdByActorId: string;
  },
): Promise<OAuthApp> {
  const [app] = await client
    .insert(schema.oauthApp)
    .values({
      id: input.appId,
      teamId: input.teamId,
      name: input.name,
      redirectUris: input.redirectUris,
      scopes: input.scopes,
      createdByActorId: input.createdByActorId,
    })
    .returning();

  if (!app) {
    throw new Error("Failed to create OAuth app");
  }

  return mapOAuthApp(app);
}

export async function createOAuthGrant(
  client: QueryClient,
  input: {
    grantId: string;
    teamId: string;
    appId: string;
    actorId: string;
    scopes: OAuthGrant["scopes"];
  },
): Promise<OAuthGrant> {
  const [grant] = await client
    .insert(schema.oauthGrant)
    .values({
      id: input.grantId,
      teamId: input.teamId,
      appId: input.appId,
      actorId: input.actorId,
      scopes: input.scopes,
    })
    .returning();

  if (!grant) {
    throw new Error("Failed to create OAuth grant");
  }

  return mapOAuthGrant(grant);
}

export async function createWebhookSubscription(
  client: QueryClient,
  input: {
    subscriptionId: string;
    teamId: string;
    url: string;
    eventTypes: string[];
    signingSecretHash: string;
    createdByActorId: string;
  },
): Promise<WebhookSubscription> {
  const [subscription] = await client
    .insert(schema.webhookSubscription)
    .values({
      id: input.subscriptionId,
      teamId: input.teamId,
      url: input.url,
      eventTypes: input.eventTypes,
      signingSecretHash: input.signingSecretHash,
      status: "active",
      createdByActorId: input.createdByActorId,
    })
    .returning();

  if (!subscription) {
    throw new Error("Failed to create webhook subscription");
  }

  return mapWebhookSubscription(subscription);
}

export async function listActiveWebhookSubscriptionsForEvent(
  client: QueryClient,
  input: {
    teamId: string;
    eventType: string;
  },
): Promise<WebhookSubscription[]> {
  const subscriptions = await client
    .select()
    .from(schema.webhookSubscription)
    .where(
      and(
        eq(schema.webhookSubscription.teamId, input.teamId),
        eq(schema.webhookSubscription.status, "active"),
      ),
    );

  return subscriptions
    .map(mapWebhookSubscription)
    .filter((subscription) => subscription.eventTypes.includes(input.eventType));
}

export async function createWebhookDelivery(
  client: QueryClient,
  input: {
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
  },
): Promise<WebhookDelivery> {
  const [delivery] = await client
    .insert(schema.webhookDelivery)
    .values({
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
      nextAttemptAt: input.nextAttemptAt ? new Date(input.nextAttemptAt) : null,
      deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : null,
    })
    .returning();

  if (!delivery) {
    throw new Error("Failed to create webhook delivery");
  }

  return mapWebhookDelivery(delivery);
}

function mapApiKey(apiKey: typeof schema.apiKey.$inferSelect): ApiKey {
  return {
    id: apiKey.id,
    teamId: apiKey.teamId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes as ApiKey["scopes"],
    createdByActorId: apiKey.createdByActorId,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

function mapOAuthApp(app: typeof schema.oauthApp.$inferSelect): OAuthApp {
  return {
    id: app.id,
    teamId: app.teamId,
    name: app.name,
    redirectUris: app.redirectUris,
    scopes: app.scopes as OAuthApp["scopes"],
    createdByActorId: app.createdByActorId,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

function mapOAuthGrant(grant: typeof schema.oauthGrant.$inferSelect): OAuthGrant {
  return {
    id: grant.id,
    teamId: grant.teamId,
    appId: grant.appId,
    actorId: grant.actorId,
    scopes: grant.scopes as OAuthGrant["scopes"],
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    createdAt: grant.createdAt.toISOString(),
  };
}

function mapWebhookSubscription(
  subscription: typeof schema.webhookSubscription.$inferSelect,
): WebhookSubscription {
  return {
    id: subscription.id,
    teamId: subscription.teamId,
    url: subscription.url,
    eventTypes: subscription.eventTypes,
    status: subscription.status as WebhookSubscription["status"],
    createdByActorId: subscription.createdByActorId,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

function mapWebhookDelivery(delivery: typeof schema.webhookDelivery.$inferSelect): WebhookDelivery {
  return {
    id: delivery.id,
    teamId: delivery.teamId,
    subscriptionId: delivery.subscriptionId,
    outboxEventId: delivery.outboxEventId,
    status: delivery.status as WebhookDelivery["status"],
    attempt: delivery.attempt,
    requestPayload: delivery.requestPayload,
    responseStatus: delivery.responseStatus,
    responseBody: delivery.responseBody,
    error: delivery.error,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
