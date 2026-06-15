import type {
  Actor,
  ApiKey,
  OAuthApp,
  OAuthGrant,
  PublicApiScope,
  WebhookDelivery,
  WebhookSubscription,
} from "@dawn/domain";
import { permissionsForPublicApiScopes } from "@dawn/domain";

import type { AutomationRepository } from "./automation";
import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type DeveloperWorkspace = {
  teamId: string;
  apiKeys: ApiKey[];
  oauthApps: OAuthApp[];
  oauthGrants: OAuthGrant[];
  webhookSubscriptions: WebhookSubscription[];
  recentWebhookDeliveries: WebhookDelivery[];
};

export type CreateApiKeyCommand = {
  teamId: string;
  name: string;
  scopes: PublicApiScope[];
  idempotencyKey: string;
};

export type CreateApiKeyResult = {
  apiKey: ApiKey;
  token: string;
  replayed: boolean;
};

export type ResolveApiKeyResult = {
  apiKey: ApiKey;
  actor: Actor;
};

export type CreateOAuthAppCommand = {
  teamId: string;
  name: string;
  redirectUris: string[];
  scopes: PublicApiScope[];
  idempotencyKey: string;
};

export type CreateOAuthAppResult = {
  app: OAuthApp;
  replayed: boolean;
};

export type OAuthConsentCommand = {
  teamId: string;
  appId: string;
  redirectUri: string;
  scopes: PublicApiScope[];
};

export type OAuthConsentPreview = {
  teamId: string;
  app: OAuthApp;
  redirectUri: string;
  scopes: PublicApiScope[];
};

export type GrantOAuthConsentCommand = OAuthConsentCommand & {
  idempotencyKey: string;
};

export type GrantOAuthConsentResult = OAuthConsentPreview & {
  grant: OAuthGrant;
  replayed: boolean;
};

export type CreateWebhookSubscriptionCommand = {
  teamId: string;
  url: string;
  eventTypes: string[];
  idempotencyKey: string;
};

export type CreateWebhookSubscriptionResult = {
  subscription: WebhookSubscription;
  signingSecret: string;
  replayed: boolean;
};

export type DeliverWebhooksForOutboxEventCommand = {
  teamId: string;
  outboxEventId: string;
  now?: Date;
};

export type DeliverWebhooksForOutboxEventResult = {
  scanned: number;
  delivered: number;
  failed: number;
  deliveries: WebhookDelivery[];
};

export type WebhookDeliveryProvider = {
  deliver(input: {
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }): Promise<{ status: number; body?: string | null }>;
};

export type DeveloperRepository = {
  listApiKeys(teamId: string): Promise<ApiKey[]>;
  listOAuthApps(teamId: string): Promise<OAuthApp[]>;
  listOAuthGrants(teamId: string): Promise<OAuthGrant[]>;
  listWebhookSubscriptions(teamId: string): Promise<WebhookSubscription[]>;
  listWebhookDeliveries(teamId: string, limit: number): Promise<WebhookDelivery[]>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  getOAuthAppForTeam(teamId: string, appId: string): Promise<OAuthApp | null>;
  markApiKeyUsed(input: { apiKeyId: string; lastUsedAt: string }): Promise<void>;
  createApiKey(input: {
    apiKeyId: string;
    teamId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: PublicApiScope[];
    createdByActorId: string;
  }): Promise<ApiKey>;
  createOAuthApp(input: {
    appId: string;
    teamId: string;
    name: string;
    redirectUris: string[];
    scopes: PublicApiScope[];
    createdByActorId: string;
  }): Promise<OAuthApp>;
  createOAuthGrant(input: {
    grantId: string;
    teamId: string;
    appId: string;
    actorId: string;
    scopes: PublicApiScope[];
  }): Promise<OAuthGrant>;
  createWebhookSubscription(input: {
    subscriptionId: string;
    teamId: string;
    url: string;
    eventTypes: string[];
    signingSecretHash: string;
    createdByActorId: string;
  }): Promise<WebhookSubscription>;
  listActiveWebhookSubscriptionsForEvent(input: {
    teamId: string;
    eventType: string;
  }): Promise<WebhookSubscription[]>;
  createWebhookDelivery(input: {
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
  }): Promise<WebhookDelivery>;
};
export type DeveloperUseCaseRepository = TransactionReviewRepository &
  AutomationRepository &
  DeveloperRepository;

const createApiKeyOperation = "api_key.create";
const createOAuthAppOperation = "oauth_app.create";
const grantOAuthConsentOperation = "oauth_consent.grant";
const createWebhookSubscriptionOperation = "webhook_subscription.create";

export async function listDeveloperWorkspace(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<DeveloperWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "api_keys.manage",
    "You cannot manage developer settings for this team",
  );

  return {
    teamId: access.teamId,
    apiKeys: await repository.listApiKeys(access.teamId),
    oauthApps: await repository.listOAuthApps(access.teamId),
    oauthGrants: await repository.listOAuthGrants(access.teamId),
    webhookSubscriptions: await repository.listWebhookSubscriptions(access.teamId),
    recentWebhookDeliveries: await repository.listWebhookDeliveries(access.teamId, 10),
  };
}

export async function createApiKey(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateApiKeyCommand,
): Promise<CreateApiKeyResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const developerRepository = transactionRepository as DeveloperUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "API key not found");

    await resolveTeamAccess(
      developerRepository,
      { ...context, teamId: command.teamId },
      "api_keys.manage",
      "You cannot create API keys for this team",
    );

    const normalized = normalizeCreateApiKeyCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await developerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createApiKeyOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different API key");
      }

      return { ...(replayed.result as CreateApiKeyResult), replayed: true };
    }

    const token = `dawn_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const apiKey = await developerRepository.createApiKey({
      apiKeyId: crypto.randomUUID(),
      teamId: normalized.teamId,
      name: normalized.name,
      keyHash: await sha256Hex(token),
      keyPrefix: token.slice(0, 14),
      scopes: normalized.scopes,
      createdByActorId: context.actor.id,
    });

    await developerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "api_key.created",
      entityType: "api_key",
      entityId: apiKey.id,
      metadata: {
        scopes: apiKey.scopes,
        keyPrefix: apiKey.keyPrefix,
      },
    });

    const result = { apiKey, token, replayed: false };

    await developerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createApiKeyOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: { apiKey, token: "", replayed: false },
    });

    return result;
  });
}

export async function resolvePublicApiKey(
  repository: DeveloperUseCaseRepository,
  token: string,
): Promise<ResolveApiKeyResult> {
  const apiKey = await repository.getApiKeyByHash(await sha256Hex(token));

  if (!apiKey || apiKey.revokedAt) {
    throw new AppError("FORBIDDEN", "Invalid API key");
  }

  await repository.markApiKeyUsed({
    apiKeyId: apiKey.id,
    lastUsedAt: new Date().toISOString(),
  });

  return {
    apiKey,
    actor: {
      id: `api_key:${apiKey.id}`,
      type: "api_key",
      teamId: apiKey.teamId,
      permissions: permissionsForPublicApiScopes(apiKey.scopes),
    },
  };
}

export async function createOAuthApp(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateOAuthAppCommand,
): Promise<CreateOAuthAppResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const developerRepository = transactionRepository as DeveloperUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "OAuth app not found");

    await resolveTeamAccess(
      developerRepository,
      { ...context, teamId: command.teamId },
      "api_keys.manage",
      "You cannot create OAuth apps for this team",
    );

    const normalized = normalizeCreateOAuthAppCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await developerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createOAuthAppOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different OAuth app",
        );
      }

      return { ...(replayed.result as CreateOAuthAppResult), replayed: true };
    }

    const app = await developerRepository.createOAuthApp({
      appId: crypto.randomUUID(),
      teamId: normalized.teamId,
      name: normalized.name,
      redirectUris: normalized.redirectUris,
      scopes: normalized.scopes,
      createdByActorId: context.actor.id,
    });

    await developerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "oauth_app.created",
      entityType: "oauth_app",
      entityId: app.id,
      metadata: {
        redirectUris: app.redirectUris,
        scopes: app.scopes,
      },
    });

    const result = { app, replayed: false };

    await developerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createOAuthAppOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function previewOAuthConsent(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  command: OAuthConsentCommand,
): Promise<OAuthConsentPreview> {
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "api_keys.manage",
    "You cannot grant OAuth access for this team",
  );

  const normalized = normalizeOAuthConsentCommand(command);
  const app = await repository.getOAuthAppForTeam(normalized.teamId, normalized.appId);

  if (!app) {
    throw new AppError("NOT_FOUND", "OAuth app was not found");
  }

  assertOAuthConsentAllowed(app, normalized);

  return {
    teamId: normalized.teamId,
    app,
    redirectUri: normalized.redirectUri,
    scopes: normalized.scopes,
  };
}

export async function grantOAuthConsent(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  command: GrantOAuthConsentCommand,
): Promise<GrantOAuthConsentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const developerRepository = transactionRepository as DeveloperUseCaseRepository;
    const preview = await previewOAuthConsent(developerRepository, context, command);
    const fingerprint = JSON.stringify({
      teamId: preview.teamId,
      appId: preview.app.id,
      redirectUri: preview.redirectUri,
      scopes: preview.scopes,
    });
    const replayed = await developerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      grantOAuthConsentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different OAuth consent",
        );
      }

      return { ...(replayed.result as GrantOAuthConsentResult), replayed: true };
    }

    const grant = await developerRepository.createOAuthGrant({
      grantId: crypto.randomUUID(),
      teamId: preview.teamId,
      appId: preview.app.id,
      actorId: context.actor.id,
      scopes: preview.scopes,
    });

    await developerRepository.appendAuditEvent({
      teamId: preview.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "oauth_consent.granted",
      entityType: "oauth_grant",
      entityId: grant.id,
      metadata: {
        appId: preview.app.id,
        redirectUri: preview.redirectUri,
        scopes: preview.scopes,
      },
    });

    await developerRepository.appendOutboxEvent({
      teamId: preview.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "oauth_consent.granted",
      version: 1,
      payload: {
        appId: preview.app.id,
        grantId: grant.id,
        scopes: preview.scopes,
      },
    });

    const result = { ...preview, grant, replayed: false };

    await developerRepository.saveIdempotencyResult({
      teamId: preview.teamId,
      actorId: context.actor.id,
      operation: grantOAuthConsentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createWebhookSubscription(
  repository: DeveloperUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateWebhookSubscriptionCommand,
): Promise<CreateWebhookSubscriptionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const developerRepository = transactionRepository as DeveloperUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Webhook subscription not found");

    await resolveTeamAccess(
      developerRepository,
      { ...context, teamId: command.teamId },
      "webhooks.manage",
      "You cannot create webhooks for this team",
    );

    const normalized = normalizeCreateWebhookSubscriptionCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await developerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createWebhookSubscriptionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different webhook subscription",
        );
      }

      return { ...(replayed.result as CreateWebhookSubscriptionResult), replayed: true };
    }

    const signingSecret = `whsec_${crypto.randomUUID().replaceAll("-", "")}`;
    const subscription = await developerRepository.createWebhookSubscription({
      subscriptionId: crypto.randomUUID(),
      teamId: normalized.teamId,
      url: normalized.url,
      eventTypes: normalized.eventTypes,
      signingSecretHash: await sha256Hex(signingSecret),
      createdByActorId: context.actor.id,
    });

    await developerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "webhook_subscription.created",
      entityType: "webhook_subscription",
      entityId: subscription.id,
      metadata: {
        eventTypes: subscription.eventTypes,
      },
    });

    const result = { subscription, signingSecret, replayed: false };

    await developerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createWebhookSubscriptionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: { subscription, signingSecret: "", replayed: false },
    });

    return result;
  });
}

export async function deliverWebhooksForOutboxEvent(
  repository: DeveloperUseCaseRepository,
  provider: WebhookDeliveryProvider,
  command: DeliverWebhooksForOutboxEventCommand,
): Promise<DeliverWebhooksForOutboxEventResult> {
  const event = await repository.getOutboxEventForTeam(command.teamId, command.outboxEventId);

  if (!event) {
    throw new AppError("NOT_FOUND", "Outbox event was not found");
  }

  const subscriptions = await repository.listActiveWebhookSubscriptionsForEvent({
    teamId: command.teamId,
    eventType: event.type,
  });
  const deliveries: WebhookDelivery[] = [];
  const now = command.now ?? new Date();
  let delivered = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const payload = {
      id: event.id,
      teamId: event.teamId,
      type: event.type,
      version: event.version,
      payload: event.payload,
      occurredAt: event.occurredAt,
    };

    try {
      const response = await provider.deliver({
        url: subscription.url,
        body: payload,
        headers: {
          "content-type": "application/json",
          "x-dawn-event-id": event.id,
          "x-dawn-event-type": event.type,
        },
      });
      const success = response.status >= 200 && response.status < 300;
      deliveries.push(
        await repository.createWebhookDelivery({
          deliveryId: crypto.randomUUID(),
          teamId: event.teamId,
          subscriptionId: subscription.id,
          outboxEventId: event.id,
          status: success ? "delivered" : "failed",
          attempt: 1,
          requestPayload: payload,
          responseStatus: response.status,
          responseBody: response.body ?? null,
          error: success ? null : `Webhook endpoint returned ${response.status}`,
          nextAttemptAt: success ? null : nextWebhookRetryAt(now, 1).toISOString(),
          deliveredAt: success ? now.toISOString() : null,
        }),
      );
      if (success) {
        delivered += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      deliveries.push(
        await repository.createWebhookDelivery({
          deliveryId: crypto.randomUUID(),
          teamId: event.teamId,
          subscriptionId: subscription.id,
          outboxEventId: event.id,
          status: "failed",
          attempt: 1,
          requestPayload: payload,
          error: errorMessage(error),
          nextAttemptAt: nextWebhookRetryAt(now, 1).toISOString(),
          deliveredAt: null,
        }),
      );
    }
  }

  return {
    scanned: subscriptions.length,
    delivered,
    failed,
    deliveries,
  };
}

function normalizeCreateApiKeyCommand(command: CreateApiKeyCommand) {
  const name = command.name.trim();
  const scopes = [...new Set(command.scopes)];

  if (!name) {
    throw new AppError("CONFLICT", "API key name is required");
  }

  if (scopes.length === 0) {
    throw new AppError("CONFLICT", "API keys require at least one scope");
  }

  return {
    teamId: command.teamId,
    name,
    scopes,
  };
}

function normalizeCreateOAuthAppCommand(command: CreateOAuthAppCommand) {
  const name = command.name.trim();
  const redirectUris = [...new Set(command.redirectUris.map(normalizeOAuthRedirectUri))];
  const scopes = normalizePublicApiScopes(command.scopes, "OAuth apps");

  if (!name) {
    throw new AppError("CONFLICT", "OAuth app name is required");
  }

  if (redirectUris.length === 0) {
    throw new AppError("CONFLICT", "OAuth apps require at least one redirect URI");
  }

  return {
    teamId: command.teamId,
    name,
    redirectUris,
    scopes,
  };
}

function normalizeOAuthConsentCommand(command: OAuthConsentCommand) {
  return {
    teamId: command.teamId,
    appId: command.appId,
    redirectUri: normalizeOAuthRedirectUri(command.redirectUri),
    scopes: normalizePublicApiScopes(command.scopes, "OAuth consent"),
  };
}

function assertOAuthConsentAllowed(
  app: OAuthApp,
  command: ReturnType<typeof normalizeOAuthConsentCommand>,
) {
  if (!app.redirectUris.includes(command.redirectUri)) {
    throw new AppError("CONFLICT", "OAuth redirect URI is not registered for this app");
  }

  const appScopes = new Set(app.scopes);
  const unsupportedScopes = command.scopes.filter((scope) => !appScopes.has(scope));

  if (unsupportedScopes.length > 0) {
    throw new AppError("CONFLICT", "OAuth consent requested scopes outside the app registration");
  }
}

function normalizePublicApiScopes(scopes: PublicApiScope[], label: string) {
  const normalized = [...new Set(scopes)];

  if (normalized.length === 0) {
    throw new AppError("CONFLICT", `${label} require at least one scope`);
  }

  return normalized;
}

function normalizeOAuthRedirectUri(value: string) {
  const redirectUri = value.trim();

  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" || parsed.hash) {
      throw new Error("OAuth redirect URI must use HTTPS and cannot include a fragment");
    }

    return parsed.toString();
  } catch {
    throw new AppError("CONFLICT", "OAuth redirect URI must be a valid HTTPS URL");
  }
}

function normalizeCreateWebhookSubscriptionCommand(command: CreateWebhookSubscriptionCommand) {
  const url = command.url.trim();
  const eventTypes = [...new Set(command.eventTypes.map((eventType) => eventType.trim()))].filter(
    Boolean,
  );

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Webhook URL must use HTTPS");
    }
  } catch {
    throw new AppError("CONFLICT", "Webhook URL must be a valid HTTPS URL");
  }

  if (eventTypes.length === 0) {
    throw new AppError("CONFLICT", "Webhook subscriptions require at least one event type");
  }

  return {
    teamId: command.teamId,
    url,
    eventTypes,
  };
}

function nextWebhookRetryAt(now: Date, attempt: number) {
  const delaySeconds = Math.min(3_600, 30 * 2 ** Math.max(attempt - 1, 0));
  return new Date(now.getTime() + delaySeconds * 1_000);
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  notFoundMessage: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", notFoundMessage);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
