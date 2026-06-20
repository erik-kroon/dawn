import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { IntegrationConnection } from "@dawn/domain";
import type { IntegrationProvider } from "@dawn/integrations";

import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
} from "./index";
import type { IntegrationUseCaseRepository } from "./integrations";

export type CreateFortnoxAuthorizationUrlCommand = {
  teamId: string;
  redirectUrl: string;
};

export type CreateFortnoxAuthorizationUrlResult = {
  provider: "fortnox";
  authorizationUrl: string;
  state: string;
};

export type CompleteFortnoxOAuthCommand = {
  teamId: string;
  code: string;
  redirectUrl: string;
  state: string;
  idempotencyKey: string;
};

export type CompleteFortnoxOAuthResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type DisconnectFortnoxCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type DisconnectFortnoxResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type FortnoxOAuthStatePayload = {
  teamId: string;
  actorId: string;
  redirectUrl: string;
  nonce: string;
  expiresAt: string;
};

export type FortnoxOAuthStateCodec = {
  createState(input: { teamId: string; actorId: string; redirectUrl: string }): Promise<string>;
  verifyState(state: string): Promise<FortnoxOAuthStatePayload>;
};

export type FortnoxProviderObjectRecord = {
  id: string;
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
  internalEntityType?: string | null;
  internalEntityId?: string | null;
  rawPayload: Record<string, unknown>;
};

export type FortnoxCatalogRepository = {
  getIntegrationConnectionForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnection | null>;
  listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }): Promise<FortnoxProviderObjectRecord[]>;
};

export type FortnoxUseCaseRepository = IntegrationUseCaseRepository & FortnoxCatalogRepository;

export type ListFortnoxCatalogCommand = {
  teamId: string;
  connectionId: string;
};

export type FortnoxCatalog = {
  teamId: string;
  connection: IntegrationConnection;
  company: FortnoxProviderObjectRecord | null;
  customers: FortnoxProviderObjectRecord[];
  articles: FortnoxProviderObjectRecord[];
};

const completeFortnoxOAuthOperation = "fortnox.oauth.complete";
const disconnectFortnoxOperation = "fortnox.disconnect";

export function createFortnoxOAuthStateCodec(input: {
  secret: string;
  allowedRedirectOrigins: readonly string[];
  now?: () => Date;
  ttlSeconds?: number;
}): FortnoxOAuthStateCodec {
  const now = input.now ?? (() => new Date());
  const ttlSeconds = input.ttlSeconds ?? 10 * 60;
  const allowedOrigins = new Set(
    input.allowedRedirectOrigins.map((origin) => new URL(origin).origin),
  );

  function assertRedirectUrl(redirectUrl: string) {
    let url: URL;

    try {
      url = new URL(redirectUrl);
    } catch {
      throw new AppError("FORBIDDEN", "Fortnox OAuth redirect URL is not allowed");
    }

    if (!allowedOrigins.has(url.origin) || !url.pathname.startsWith("/settings")) {
      throw new AppError("FORBIDDEN", "Fortnox OAuth redirect URL is not allowed");
    }
  }

  return {
    async createState(stateInput) {
      assertRedirectUrl(stateInput.redirectUrl);

      const payload: FortnoxOAuthStatePayload = {
        ...stateInput,
        nonce: randomUUID(),
        expiresAt: new Date(now().getTime() + ttlSeconds * 1_000).toISOString(),
      };

      return signFortnoxOAuthState(input.secret, payload);
    },
    async verifyState(state) {
      const payload = verifyFortnoxOAuthStateSignature(input.secret, state);

      assertRedirectUrl(payload.redirectUrl);

      if (new Date(payload.expiresAt).getTime() <= now().getTime()) {
        throw new AppError("FORBIDDEN", "Fortnox OAuth state expired");
      }

      return payload;
    },
  };
}

export async function createFortnoxAuthorizationUrl(
  repository: FortnoxUseCaseRepository,
  providers: readonly IntegrationProvider[],
  stateCodec: FortnoxOAuthStateCodec,
  context: TransactionReviewContext,
  command: CreateFortnoxAuthorizationUrlCommand,
): Promise<CreateFortnoxAuthorizationUrlResult> {
  assertAppRequestTeam(context, command.teamId, "Fortnox connection not found");
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "integrations.write",
    "You cannot connect Fortnox for this team",
  );

  const provider = requireFortnoxProvider(providers);

  if (!provider.createAuthorizationUrl) {
    throw new AppError("CONFLICT", "Fortnox provider does not support OAuth");
  }

  const state = await stateCodec.createState({
    teamId: command.teamId,
    actorId: context.actor.id,
    redirectUrl: command.redirectUrl,
  });
  const authorization = provider.createAuthorizationUrl({
    teamId: command.teamId,
    actorId: context.actor.id,
    redirectUrl: command.redirectUrl,
    state,
  });

  return {
    provider: "fortnox",
    authorizationUrl: authorization.authorizationUrl,
    state,
  };
}

export async function completeFortnoxOAuth(
  repository: FortnoxUseCaseRepository,
  providers: readonly IntegrationProvider[],
  stateCodec: FortnoxOAuthStateCodec,
  context: TransactionReviewContext,
  command: CompleteFortnoxOAuthCommand,
): Promise<CompleteFortnoxOAuthResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const fortnoxRepository = transactionRepository as FortnoxUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Fortnox connection not found");
    await resolveTeamAccess(
      fortnoxRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot connect Fortnox for this team",
    );

    const oauthState = await stateCodec.verifyState(command.state);

    if (
      oauthState.teamId !== command.teamId ||
      oauthState.actorId !== context.actor.id ||
      oauthState.redirectUrl !== command.redirectUrl
    ) {
      throw new AppError("FORBIDDEN", "Fortnox OAuth state is invalid");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      code: command.code,
      redirectUrl: command.redirectUrl,
      state: command.state,
    });
    const replayed = await fortnoxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      completeFortnoxOAuthOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different Fortnox OAuth callback",
        );
      }

      return { ...(replayed.result as CompleteFortnoxOAuthResult), replayed: true };
    }

    const provider = requireFortnoxProvider(providers);

    if (!provider.exchangeOAuthCode) {
      throw new AppError("CONFLICT", "Fortnox provider does not support OAuth");
    }

    const providerConnection = await provider.exchangeOAuthCode({
      teamId: command.teamId,
      actorId: context.actor.id,
      code: command.code,
      redirectUrl: command.redirectUrl,
      state: command.state,
      idempotencyKey: command.idempotencyKey,
    });
    const connection = await fortnoxRepository.upsertIntegrationConnection({
      connectionId: crypto.randomUUID(),
      teamId: command.teamId,
      category: providerConnection.category,
      provider: providerConnection.provider,
      providerConnectionId: providerConnection.providerConnectionId,
      displayName: providerConnection.displayName,
      capabilities: [...providerConnection.capabilities],
      tokenCiphertext: providerConnection.token.encryptedToken,
      tokenKeyId: providerConnection.token.keyId,
      tokenLastFour: providerConnection.token.lastFour,
      rawPayload: providerConnection.rawPayload,
      createdByActorId: context.actor.id,
    });

    await fortnoxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "fortnox.connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        category: connection.category,
        stateValidated: true,
      },
    });

    await fortnoxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "integration.connected",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        category: connection.category,
      },
    });

    const result = { connection, replayed: false };

    await fortnoxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: completeFortnoxOAuthOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listFortnoxCatalog(
  repository: FortnoxUseCaseRepository,
  context: TransactionReviewContext,
  command: ListFortnoxCatalogCommand,
): Promise<FortnoxCatalog> {
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "integrations.read",
    "You cannot read Fortnox data for this team",
  );

  const connection = await repository.getIntegrationConnectionForTeam(
    command.teamId,
    command.connectionId,
  );

  if (!connection || connection.provider !== "fortnox" || connection.status === "disabled") {
    throw new AppError("NOT_FOUND", "Fortnox connection not found");
  }

  const objects = await repository.listProviderObjectsForTeam({
    teamId: command.teamId,
    provider: "fortnox",
    providerObjectTypes: ["company", "customer", "article"],
  });

  return {
    teamId: command.teamId,
    connection,
    company:
      objects.find((object) => object.providerObjectType === "company") ??
      companyFromConnection(connection),
    customers: objects.filter((object) => object.providerObjectType === "customer"),
    articles: objects.filter((object) => object.providerObjectType === "article"),
  };
}

export async function disconnectFortnox(
  repository: FortnoxUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: DisconnectFortnoxCommand,
): Promise<DisconnectFortnoxResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const fortnoxRepository = transactionRepository as FortnoxUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Fortnox connection not found");
    await resolveTeamAccess(
      fortnoxRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot disconnect Fortnox for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
    });
    const replayed = await fortnoxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      disconnectFortnoxOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different Fortnox disconnect",
        );
      }

      return { ...(replayed.result as DisconnectFortnoxResult), replayed: true };
    }

    const connection = await fortnoxRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.provider !== "fortnox" || connection.status === "disabled") {
      throw new AppError("NOT_FOUND", "Fortnox connection not found");
    }

    const provider = requireFortnoxProvider(providers);
    const providerResult = provider.disconnect
      ? await provider.disconnect({
          teamId: command.teamId,
          providerConnectionId: connection.providerConnectionId,
        })
      : { status: "disconnected" as const, rawPayload: { provider: "fortnox" } };
    const disabled = await fortnoxRepository.disableIntegrationConnection({
      connectionId: connection.id,
      disabledAt: new Date(),
    });

    await fortnoxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "fortnox.disconnected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        revoked: providerResult.rawPayload.revoked === true,
        preservesHistoricalData: true,
      },
    });

    await fortnoxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "integration.disabled",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        category: connection.category,
        revoked: providerResult.rawPayload.revoked === true,
        preservesHistoricalData: true,
      },
    });

    const result = { connection: disabled, replayed: false };

    await fortnoxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: disconnectFortnoxOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

function requireFortnoxProvider(providers: readonly IntegrationProvider[]) {
  const provider = providers.find((candidate) => candidate.provider === "fortnox");

  if (!provider) {
    throw new AppError("NOT_FOUND", "Fortnox provider not found");
  }

  return provider;
}

function companyFromConnection(
  connection: IntegrationConnection,
): FortnoxProviderObjectRecord | null {
  const company = connection.rawPayload?.company;

  if (!company || typeof company !== "object") {
    return null;
  }

  const payload = company as Record<string, unknown>;
  const organizationNumber = payload.organizationNumber;

  if (typeof organizationNumber !== "string" || organizationNumber.trim().length === 0) {
    return null;
  }

  return {
    id: `fortnox:company:${organizationNumber}`,
    teamId: connection.teamId,
    provider: "fortnox",
    providerObjectType: "company",
    providerObjectId: organizationNumber,
    rawPayload: {
      ...payload,
      provider: "fortnox",
      providerConnectionId: connection.providerConnectionId,
      integrationConnectionId: connection.id,
    },
  };
}

function signFortnoxOAuthState(secret: string, payload: FortnoxOAuthStatePayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSha256(secret, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyFortnoxOAuthStateSignature(secret: string, state: string) {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    throw new AppError("FORBIDDEN", "Fortnox OAuth state is invalid");
  }

  const expected = hmacSha256(secret, encodedPayload);

  if (!safeEqual(signature, expected)) {
    throw new AppError("FORBIDDEN", "Fortnox OAuth state is invalid");
  }

  let payload: FortnoxOAuthStatePayload;

  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as FortnoxOAuthStatePayload;
  } catch {
    throw new AppError("FORBIDDEN", "Fortnox OAuth state is invalid");
  }

  if (
    !payload.teamId ||
    !payload.actorId ||
    !payload.redirectUrl ||
    !payload.nonce ||
    !payload.expiresAt
  ) {
    throw new AppError("FORBIDDEN", "Fortnox OAuth state is invalid");
  }

  return payload;
}

function hmacSha256(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
