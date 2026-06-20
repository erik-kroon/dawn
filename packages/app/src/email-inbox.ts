import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { IntegrationCategory, IntegrationConnection, IntegrationSyncRun } from "@dawn/domain";
import type {
  EmailInboxEvidence,
  EmailInboxEncryptedToken,
  EmailInboxProviderName,
  EmailInboxSettings,
  EmailInboxSyncCursor,
  EmailInboxSyncRange,
  EmailInboxTokenBundle,
  InboxConnector,
  InboxConnectorConnectionResult,
} from "@dawn/integrations";
import {
  EmailInboxProviderAuthError,
  EmailInboxProviderSyncError,
  emailInboxArtifactFileName,
  emailInboxEvidenceDeduplicationKey,
} from "@dawn/integrations";

import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";
import type {
  BusinessDocument,
  BusinessDocumentVersion,
  DocumentExtraction,
  DocumentsInboxUseCaseRepository,
  InboxItem,
  InboxSourceType,
} from "./documents-inbox";
import { createDeterministicDocumentExtractor } from "./documents-inbox";
import type { IntegrationRepository } from "./integrations";

export type EmailInboxProviderDescriptor = {
  provider: EmailInboxProviderName;
  displayName: string;
  capabilities: readonly string[];
  defaultScopes: readonly string[];
};

export type EmailInboxWorkspaceConnection = {
  connection: IntegrationConnection;
  accountEmail: string | null;
  grantedScopes: readonly string[];
  syncCursor: EmailInboxSyncCursor | null;
  syncRange: EmailInboxSyncRange | null;
  settings: EmailInboxSettings;
  reauthorizationRequired: boolean;
  latestSyncRun?: IntegrationSyncRun | null;
};

export type EmailInboxWorkspace = {
  teamId: string;
  providers: EmailInboxProviderDescriptor[];
  connections: EmailInboxWorkspaceConnection[];
};

export type CreateEmailInboxAuthorizationUrlCommand = {
  teamId: string;
  provider: EmailInboxProviderName;
  redirectUrl: string;
  loginHint?: string | null;
};

export type CreateEmailInboxAuthorizationUrlResult = {
  provider: EmailInboxProviderName;
  authorizationUrl: string;
  state: string;
};

export type CompleteEmailInboxOAuthCommand = {
  teamId: string;
  provider: EmailInboxProviderName;
  code: string;
  redirectUrl: string;
  state: string;
  idempotencyKey: string;
};

export type CompleteEmailInboxOAuthResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type ConnectEmailInboxFromProviderTokenCommand = {
  teamId: string;
  provider: EmailInboxProviderName;
  tokens: EmailInboxTokenBundle;
  idempotencyKey: string;
  source?: "google_login" | "provider_token";
};

export type ConnectEmailInboxFromProviderTokenResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type SyncEmailInboxCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
  maxResults?: number;
  fullSync?: boolean;
  enforceCallerPermission?: boolean;
  now?: Date;
};

export type SyncEmailInboxResult = {
  connection: IntegrationConnection;
  syncRun: IntegrationSyncRun;
  imported: EmailInboxImportedArtifact[];
  skipped: EmailInboxSkippedArtifact[];
  replayed: boolean;
};

export type UpdateEmailInboxSettingsCommand = {
  teamId: string;
  connectionId: string;
  settings: Partial<EmailInboxSettings>;
  idempotencyKey: string;
};

export type UpdateEmailInboxSettingsResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type RequestDueEmailInboxSyncsCommand = {
  teamId: string;
  now?: Date;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
};

export type RequestEmailInboxSyncCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type RequestDueEmailInboxSyncsResult = {
  requested: number;
  skipped: number;
};

export type RequestEmailInboxSyncResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type EmailInboxImportedArtifact = {
  evidenceId: string;
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  inboxItem: InboxItem;
  extraction?: DocumentExtraction | null;
};

export type EmailInboxSkippedArtifact = {
  evidenceId: string;
  reason: "duplicate" | "blocked_sender" | "unsupported_mime" | "oversized" | "empty_body";
};

export type IntegrationConnectionSecrets = {
  token: EmailInboxEncryptedToken;
  rawPayload: Record<string, unknown>;
};

export type ProviderObjectRecord = {
  id: string;
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
  internalEntityType?: string | null;
  internalEntityId?: string | null;
  rawPayload: Record<string, unknown>;
};

export type EmailInboxObjectStorage = {
  put(input: { objectKey: string; body: ArrayBuffer; contentType: string }): Promise<void>;
};

export type EmailInboxOAuthStatePayload = {
  teamId: string;
  actorId: string;
  provider: EmailInboxProviderName;
  redirectUrl: string;
  nonce: string;
  expiresAt: string;
};

export type EmailInboxOAuthStateCodec = {
  createState(input: {
    teamId: string;
    actorId: string;
    provider: EmailInboxProviderName;
    redirectUrl: string;
  }): Promise<string>;
  verifyState(state: string): Promise<EmailInboxOAuthStatePayload>;
};

export function createEmailInboxOAuthStateCodec(input: {
  secret: string;
  allowedRedirectOrigins: readonly string[];
  now?: () => Date;
  ttlSeconds?: number;
}): EmailInboxOAuthStateCodec {
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
      throw new AppError("FORBIDDEN", "Email inbox OAuth redirect URL is not allowed");
    }

    if (url.pathname !== "/inbox" || !allowedOrigins.has(url.origin)) {
      throw new AppError("FORBIDDEN", "Email inbox OAuth redirect URL is not allowed");
    }
  }

  return {
    async createState(stateInput) {
      assertRedirectUrl(stateInput.redirectUrl);

      const payload: EmailInboxOAuthStatePayload = {
        ...stateInput,
        nonce: randomUUID(),
        expiresAt: new Date(now().getTime() + ttlSeconds * 1_000).toISOString(),
      };

      return signEmailInboxOAuthState(input.secret, payload);
    },
    async verifyState(state) {
      const payload = verifyEmailInboxOAuthStateSignature(input.secret, state);

      assertRedirectUrl(payload.redirectUrl);

      if (new Date(payload.expiresAt).getTime() <= now().getTime()) {
        throw new AppError("FORBIDDEN", "Email inbox OAuth state expired");
      }

      return payload;
    },
  };
}

export type EmailInboxUseCaseRepository = TransactionReviewRepository &
  IntegrationRepository &
  DocumentsInboxUseCaseRepository & {
    getIntegrationConnectionSecretsForTeam(
      teamId: string,
      connectionId: string,
    ): Promise<IntegrationConnectionSecrets | null>;
    updateIntegrationConnectionTokenAndRawPayload(input: {
      connectionId: string;
      token?: EmailInboxEncryptedToken | null;
      rawPayload: Record<string, unknown>;
      status?: IntegrationConnection["status"];
      lastError?: string | null;
      lastSyncAt?: Date | null;
    }): Promise<IntegrationConnection>;
    listIntegrationConnectionsForTeam(teamId: string): Promise<IntegrationConnection[]>;
    listEmailInboxSyncCandidateConnections(): Promise<IntegrationConnection[]>;
    createEmailInboxSyncRunIfIdle(input: {
      syncRunId: string;
      teamId: string;
      integrationConnectionId: string;
      category: IntegrationCategory;
      provider: string;
    }): Promise<IntegrationSyncRun | null>;
    getProviderObjectForTeam(input: {
      teamId: string;
      provider: string;
      providerObjectType: string;
      providerObjectId: string;
    }): Promise<ProviderObjectRecord | null>;
    upsertProviderObject(input: {
      teamId: string;
      provider: string;
      providerObjectType: string;
      providerObjectId: string;
      connectionId?: string | null;
      bankAccountId?: string | null;
      internalEntityType?: string | null;
      internalEntityId?: string | null;
      rawPayload: Record<string, unknown>;
    }): Promise<void>;
  };

const completeEmailInboxOAuthOperation = "email_inbox.oauth.complete";
const connectEmailInboxFromProviderTokenOperation = "email_inbox.provider_token.connect";
const syncEmailInboxOperation = "email_inbox.sync";
const updateEmailInboxSettingsOperation = "email_inbox.settings.update";
const requestEmailInboxSyncOperation = "email_inbox.sync.request";
const requestDueEmailInboxSyncsOperation = "email_inbox.sync.request_due";
const emailInboxCategory: IntegrationCategory = "email";
const emailInboxSyncIntervalMs = 6 * 60 * 60 * 1_000;
const emailInboxAccountantBackfillReceivedFrom = "2025-01-01T00:00:00.000Z";
const supportedEmailAttachmentContentTypes = new Set([
  "application/pdf",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function listEmailInboxWorkspace(
  repository: EmailInboxUseCaseRepository,
  connectors: readonly InboxConnector[],
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<EmailInboxWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "integrations.read",
    "You cannot read email inbox integrations for this team",
  );
  const summaries = await repository.listIntegrationConnectionSummaries(access.teamId);

  return {
    teamId: access.teamId,
    providers: connectors.map(emailInboxProviderDescriptor),
    connections: summaries
      .filter((summary) => isEmailInboxConnection(summary.connection))
      .map((summary) => ({
        connection: summary.connection,
        accountEmail: emailInboxAccountEmail(summary.connection),
        grantedScopes: emailInboxMetadata(summary.connection.rawPayload).grantedScopes,
        syncCursor: emailInboxSyncCursor(summary.connection.rawPayload),
        syncRange: emailInboxSyncRange(summary.connection.rawPayload),
        settings: emailInboxSettings(summary.connection.rawPayload),
        reauthorizationRequired:
          summary.connection.status === "error" && isReauthError(summary.connection),
        latestSyncRun: summary.latestSyncRun ?? null,
      })),
  };
}

export async function createEmailInboxAuthorizationUrl(
  repository: EmailInboxUseCaseRepository,
  connectors: readonly InboxConnector[],
  stateCodec: EmailInboxOAuthStateCodec,
  context: TransactionReviewContext,
  command: CreateEmailInboxAuthorizationUrlCommand,
): Promise<CreateEmailInboxAuthorizationUrlResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Email inbox provider not found");
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "integrations.write",
    "You cannot connect email inbox integrations for this team",
  );

  const connector = requireInboxConnector(connectors, command.provider);
  const state = await stateCodec.createState({
    teamId: command.teamId,
    actorId: context.actor.id,
    provider: command.provider,
    redirectUrl: command.redirectUrl,
  });

  return {
    provider: connector.provider,
    state,
    authorizationUrl: connector.createAuthUrl({
      redirectUrl: command.redirectUrl,
      state,
      loginHint: command.loginHint ?? undefined,
    }),
  };
}

export async function completeEmailInboxOAuth(
  repository: EmailInboxUseCaseRepository,
  connectors: readonly InboxConnector[],
  stateCodec: EmailInboxOAuthStateCodec,
  context: TransactionReviewContext,
  command: CompleteEmailInboxOAuthCommand,
): Promise<CompleteEmailInboxOAuthResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const emailRepository = transactionRepository as EmailInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Email inbox provider not found");
    await resolveTeamAccess(
      emailRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot connect email inbox integrations for this team",
    );
    const oauthState = await stateCodec.verifyState(command.state);

    if (
      oauthState.teamId !== command.teamId ||
      oauthState.actorId !== context.actor.id ||
      oauthState.provider !== command.provider ||
      oauthState.redirectUrl !== command.redirectUrl
    ) {
      throw new AppError("FORBIDDEN", "Email inbox OAuth state is invalid");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      provider: command.provider,
      code: command.code,
      redirectUrl: command.redirectUrl,
      state: command.state,
    });
    const replayed = await emailRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      completeEmailInboxOAuthOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different Gmail connection",
        );
      }

      return { ...(replayed.result as CompleteEmailInboxOAuthResult), replayed: true };
    }

    const connector = requireInboxConnector(connectors, command.provider);
    const providerConnection = await connector.exchangeCodeForConnection({
      code: command.code,
      redirectUrl: command.redirectUrl,
    });
    const connection = await upsertEmailInboxProviderConnection({
      repository: emailRepository,
      connector,
      context,
      teamId: command.teamId,
      provider: command.provider,
      providerConnection,
      source: "oauth",
    });

    const result = { connection, replayed: false };

    await emailRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: completeEmailInboxOAuthOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function connectEmailInboxFromProviderToken(
  repository: EmailInboxUseCaseRepository,
  connectors: readonly InboxConnector[],
  context: TransactionReviewContext,
  command: ConnectEmailInboxFromProviderTokenCommand,
): Promise<ConnectEmailInboxFromProviderTokenResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const emailRepository = transactionRepository as EmailInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Email inbox provider not found");
    await resolveTeamAccess(
      emailRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot connect email inbox integrations for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      provider: command.provider,
      source: command.source ?? "provider_token",
      scopes: [...command.tokens.scopes].sort(),
      expiresAt: command.tokens.expiresAt ?? null,
      hasRefreshToken: Boolean(command.tokens.refreshToken),
    });
    const replayed = await emailRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      connectEmailInboxFromProviderTokenOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different Gmail login connection",
        );
      }

      return {
        ...(replayed.result as ConnectEmailInboxFromProviderTokenResult),
        replayed: true,
      };
    }

    const connector = requireInboxConnector(connectors, command.provider);
    const providerConnection = await connector.createConnectionFromTokens(command.tokens);
    const connection = await upsertEmailInboxProviderConnection({
      repository: emailRepository,
      connector,
      context,
      teamId: command.teamId,
      provider: command.provider,
      providerConnection,
      source: command.source ?? "provider_token",
    });
    const result = { connection, replayed: false };

    await emailRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: connectEmailInboxFromProviderTokenOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function syncEmailInbox(
  repository: EmailInboxUseCaseRepository,
  connectors: readonly InboxConnector[],
  storage: EmailInboxObjectStorage,
  context: TransactionReviewContext,
  command: SyncEmailInboxCommand,
): Promise<SyncEmailInboxResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const emailRepository = transactionRepository as EmailInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Email inbox connection not found");

    if (command.enforceCallerPermission !== false) {
      await resolveTeamAccess(
        emailRepository,
        { ...context, teamId: command.teamId },
        "integrations.write",
        "You cannot sync email inbox integrations for this team",
      );
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      maxResults: command.maxResults ?? null,
      fullSync: command.fullSync ?? false,
    });
    const replayed = await emailRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      syncEmailInboxOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different email inbox sync",
        );
      }

      return { ...(replayed.result as SyncEmailInboxResult), replayed: true };
    }

    const connection = await emailRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || !isEmailInboxConnection(connection) || connection.status === "disabled") {
      throw new AppError("NOT_FOUND", "Email inbox connection not found");
    }

    const secrets = await emailRepository.getIntegrationConnectionSecretsForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!secrets) {
      throw new AppError("NOT_FOUND", "Email inbox connection not found");
    }

    const connector = requireInboxConnector(
      connectors,
      connection.provider as EmailInboxProviderName,
    );
    const syncRun = await emailRepository.createEmailInboxSyncRunIfIdle({
      syncRunId: crypto.randomUUID(),
      teamId: command.teamId,
      integrationConnectionId: connection.id,
      category: connection.category,
      provider: connection.provider,
    });

    if (!syncRun) {
      throw new AppError("CONFLICT", "Email inbox sync already running");
    }

    try {
      const rawPayload = { ...secrets.rawPayload };
      const previousRange = emailInboxSyncRange(rawPayload);
      const syncRange = await resolveEmailInboxSyncRange({
        repository: emailRepository,
        teamId: command.teamId,
        now: command.now ?? new Date(),
      });
      const storedSyncCursor = command.fullSync ? null : emailInboxSyncCursor(rawPayload);
      const syncCursor = usableEmailInboxSyncCursor({
        cursor: storedSyncCursor,
        previousRange,
        desiredRange: syncRange,
      });
      const connectorResult = await connector.syncEvidence({
        teamId: command.teamId,
        connection: emailInboxProviderConnection(connection, rawPayload),
        token: secrets.token,
        cursor: syncCursor,
        syncRange,
        settings: emailInboxSettings(rawPayload),
        maxResults: command.maxResults,
      });
      const imported: EmailInboxImportedArtifact[] = [];
      const skipped: EmailInboxSkippedArtifact[] = [];

      for (const evidence of connectorResult.evidence) {
        const normalized = normalizeEvidenceForImport(evidence, emailInboxSettings(rawPayload));

        if (normalized.skipReason) {
          skipped.push({ evidenceId: evidence.providerEvidenceId, reason: normalized.skipReason });
          continue;
        }

        const existing = await emailRepository.getProviderObjectForTeam({
          teamId: command.teamId,
          provider: evidence.provider,
          providerObjectType: "email_evidence",
          providerObjectId: normalized.deduplicationKey,
        });

        if (existing) {
          skipped.push({ evidenceId: evidence.providerEvidenceId, reason: "duplicate" });
          continue;
        }

        imported.push(
          await importEmailInboxEvidence({
            repository: emailRepository,
            storage,
            context,
            teamId: command.teamId,
            evidence,
            normalized,
          }),
        );
      }

      const nextRawPayload = mergeEmailInboxRawPayload(rawPayload, {
        syncCursor: connectorResult.nextCursor ?? syncCursor,
        syncRange,
        syncedAt: new Date().toISOString(),
      });
      const completedSyncRun = await emailRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "completed",
        recordsSynced: imported.length,
        error: null,
        rawPayload: {
          ...connectorResult.rawPayload,
          syncRange,
          imported: imported.length,
          skipped: skipped.length,
          skipReasons: skipped.reduce<Record<string, number>>((counts, item) => {
            counts[item.reason] = (counts[item.reason] ?? 0) + 1;
            return counts;
          }, {}),
        },
      });
      const syncedConnection = await emailRepository.updateIntegrationConnectionTokenAndRawPayload({
        connectionId: connection.id,
        token: connectorResult.refreshedToken ?? null,
        rawPayload: nextRawPayload,
        status: "connected",
        lastError: null,
        lastSyncAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
      });

      await emailRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "email_inbox.synced",
        entityType: "integration_connection",
        entityId: connection.id,
        metadata: {
          provider: connection.provider,
          imported: imported.length,
          skipped: skipped.length,
        },
      });

      await emailRepository.appendOutboxEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: "email_inbox.synced",
        version: 1,
        payload: {
          connectionId: connection.id,
          provider: connection.provider,
          imported: imported.length,
          skipped: skipped.length,
        },
      });

      const result = {
        connection: syncedConnection,
        syncRun: completedSyncRun,
        imported,
        skipped,
        replayed: false,
      };

      await emailRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: syncEmailInboxOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const message = emailInboxErrorMessage(error);
      const isReauth =
        error instanceof EmailInboxProviderAuthError && error.code === "reauthorization_required";
      const failedSyncRun = await emailRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        recordsSynced: 0,
        error: message,
        rawPayload: {
          error: message,
          reauthorizationRequired: isReauth,
        },
      });
      const failedConnection = await emailRepository.updateIntegrationConnectionTokenAndRawPayload({
        connectionId: connection.id,
        rawPayload: mergeEmailInboxRawPayload(secrets.rawPayload, {
          lastError: message,
          reauthorizationRequired: isReauth,
        }),
        status: "error",
        lastError: message,
        lastSyncAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
      });
      const result = {
        connection: failedConnection,
        syncRun: failedSyncRun,
        imported: [],
        skipped: [],
        replayed: false,
      };

      await emailRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: syncEmailInboxOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }
  });
}

export async function updateEmailInboxSettings(
  repository: EmailInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateEmailInboxSettingsCommand,
): Promise<UpdateEmailInboxSettingsResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const emailRepository = transactionRepository as EmailInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Email inbox connection not found");
    await resolveTeamAccess(
      emailRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot update email inbox settings for this team",
    );

    const fingerprint = JSON.stringify(command);
    const replayed = await emailRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateEmailInboxSettingsOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for different email inbox settings",
        );
      }

      return { ...(replayed.result as UpdateEmailInboxSettingsResult), replayed: true };
    }

    const [connection, secrets] = await Promise.all([
      emailRepository.getIntegrationConnectionForTeam(command.teamId, command.connectionId),
      emailRepository.getIntegrationConnectionSecretsForTeam(command.teamId, command.connectionId),
    ]);

    if (!connection || !secrets || !isEmailInboxConnection(connection)) {
      throw new AppError("NOT_FOUND", "Email inbox connection not found");
    }

    const updated = await emailRepository.updateIntegrationConnectionTokenAndRawPayload({
      connectionId: connection.id,
      rawPayload: mergeEmailInboxRawPayload(secrets.rawPayload, {
        settings: normalizeSettingsPatch(command.settings),
      }),
    });
    const result = { connection: updated, replayed: false };

    await emailRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateEmailInboxSettingsOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function requestEmailInboxSync(
  repository: EmailInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestEmailInboxSyncCommand,
): Promise<RequestEmailInboxSyncResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const emailRepository = transactionRepository as EmailInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Email inbox connection not found");
    await resolveTeamAccess(
      emailRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot sync email inbox integrations for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
    });
    const replayed = await emailRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestEmailInboxSyncOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different email inbox sync request",
        );
      }

      return { ...(replayed.result as RequestEmailInboxSyncResult), replayed: true };
    }

    const connection = await emailRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || !isEmailInboxConnection(connection) || connection.status === "disabled") {
      throw new AppError("NOT_FOUND", "Email inbox connection not found");
    }

    await emailRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox.provider.sync_requested",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        manual: true,
      },
    });

    const result = { connection, replayed: false };

    await emailRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestEmailInboxSyncOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function requestDueEmailInboxSyncs(
  repository: EmailInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestDueEmailInboxSyncsCommand,
): Promise<RequestDueEmailInboxSyncsResult> {
  const teamId = command.teamId;

  if (command.enforceCallerPermission !== false) {
    await resolveTeamAccess(
      repository,
      { ...context, teamId },
      "integrations.write",
      "You cannot request email inbox syncs for this team",
    );
  }

  const now = command.now ?? new Date();
  const fingerprint = JSON.stringify({ teamId, now: now.toISOString() });
  const replayed = await repository.getIdempotencyResult(
    teamId,
    context.actor.id,
    requestDueEmailInboxSyncsOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for different due email inbox syncs",
      );
    }

    return replayed.result as RequestDueEmailInboxSyncsResult;
  }

  const emailConnections = (await repository.listIntegrationConnectionsForTeam(teamId)).filter(
    isEmailInboxConnection,
  );
  const connections = emailConnections.filter((connection) => emailInboxSyncDue(connection, now));

  let requested = 0;

  for (const connection of connections) {
    await repository.appendOutboxEvent({
      teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox.provider.sync_requested",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        dueAt: now.toISOString(),
      },
    });
    requested += 1;
  }

  const result = {
    requested,
    skipped: emailConnections.length - requested,
  };

  await repository.saveIdempotencyResult({
    teamId,
    actorId: context.actor.id,
    operation: requestDueEmailInboxSyncsOperation,
    key: command.idempotencyKey,
    fingerprint,
    result,
  });

  return result;
}

function emailInboxProviderDescriptor(connector: InboxConnector): EmailInboxProviderDescriptor {
  return {
    provider: connector.provider,
    displayName: connector.displayName,
    capabilities: connector.capabilities.map(String),
    defaultScopes: connector.defaultScopes,
  };
}

async function upsertEmailInboxProviderConnection(input: {
  repository: EmailInboxUseCaseRepository;
  connector: InboxConnector;
  context: TransactionReviewContext;
  teamId: string;
  provider: EmailInboxProviderName;
  providerConnection: InboxConnectorConnectionResult;
  source: "oauth" | "google_login" | "provider_token";
}) {
  assertEmailInboxMailboxScopes(input.connector, input.providerConnection.connection.grantedScopes);
  const rawPayload = {
    ...input.providerConnection.connection.rawPayload,
    emailInbox: {
      provider: input.provider,
      accountEmail: input.providerConnection.connection.accountEmail,
      providerConnectionId: input.providerConnection.connection.providerConnectionId,
      grantedScopes: [...input.providerConnection.connection.grantedScopes],
      expiresAt: input.providerConnection.connection.expiresAt ?? null,
      syncCursor: null,
      syncRange: null,
      settings: defaultEmailInboxSettings(),
      connectedAt: new Date().toISOString(),
      source: input.source,
    },
  };
  const connection = await input.repository.upsertIntegrationConnection({
    connectionId: crypto.randomUUID(),
    teamId: input.teamId,
    category: emailInboxCategory,
    provider: input.provider,
    providerConnectionId: input.providerConnection.connection.providerConnectionId,
    displayName: input.providerConnection.connection.accountEmail,
    capabilities: input.connector.capabilities.map(String),
    tokenCiphertext: input.providerConnection.token.encryptedToken,
    tokenKeyId: input.providerConnection.token.keyId,
    tokenLastFour: input.providerConnection.token.lastFour,
    rawPayload,
    createdByActorId: input.context.actor.id,
  });

  await input.repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    action: "email_inbox.connected",
    entityType: "integration_connection",
    entityId: connection.id,
    metadata: {
      provider: connection.provider,
      accountEmail: input.providerConnection.connection.accountEmail,
      scopes: input.providerConnection.connection.grantedScopes,
      source: input.source,
    },
  });

  await input.repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    type: "email_inbox.connected",
    version: 1,
    payload: {
      connectionId: connection.id,
      provider: connection.provider,
      accountEmail: input.providerConnection.connection.accountEmail,
      source: input.source,
    },
  });

  return connection;
}

function assertEmailInboxMailboxScopes(
  connector: InboxConnector,
  grantedScopes: readonly string[],
) {
  const requiredScopes = connector.defaultScopes.filter(
    (scope) => scope === "email.inbox.readonly" || scope.includes("gmail.readonly"),
  );
  const granted = new Set(grantedScopes);
  const missing = requiredScopes.filter((scope) => !granted.has(scope));

  if (missing.length > 0) {
    throw new AppError(
      "CONFLICT",
      `Email inbox connection is missing required mailbox scope: ${missing.join(", ")}`,
    );
  }
}

async function importEmailInboxEvidence(input: {
  repository: EmailInboxUseCaseRepository;
  storage: EmailInboxObjectStorage;
  context: TransactionReviewContext;
  teamId: string;
  evidence: EmailInboxEvidence;
  normalized: NormalizedEmailInboxEvidence;
}): Promise<EmailInboxImportedArtifact> {
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const objectKey = emailInboxObjectKey(
    input.teamId,
    documentId,
    versionId,
    input.normalized.fileName,
  );

  await input.storage.put({
    objectKey,
    body: input.normalized.body,
    contentType: input.normalized.contentType,
  });

  const { document, version } = await input.repository.createDocumentUploadRecord({
    documentId,
    versionId,
    teamId: input.teamId,
    title: emailInboxDocumentTitle(input.evidence),
    objectKey,
    fileName: input.normalized.fileName,
    contentType: input.normalized.contentType,
    byteSize: input.normalized.body.byteLength,
    checksumSha256: input.normalized.checksumSha256,
    createdByActorId: input.context.actor.id,
  });
  const completed = await input.repository.completeDocumentVersionUpload({
    teamId: input.teamId,
    documentId: document.id,
    versionId: version.id,
    byteSize: input.normalized.body.byteLength,
    checksumSha256: input.normalized.checksumSha256,
    uploadedAt: new Date(input.evidence.receivedAt),
  });
  const source = await input.repository.ensureInboxSource({
    sourceId: crypto.randomUUID(),
    teamId: input.teamId,
    type: "email_provider",
    name: `${input.evidence.provider}: ${input.evidence.from.email}`,
  });
  const inboxItem = await input.repository.createInboxItemForDocumentUpload({
    inboxItemId: crypto.randomUUID(),
    sourceId: source.id,
    teamId: input.teamId,
    sourceType: "email_provider" satisfies InboxSourceType,
    documentId: document.id,
    documentVersionId: version.id,
    createdByActorId: input.context.actor.id,
  });
  let extraction: DocumentExtraction | null = null;
  let importedInboxItem = inboxItem;

  if (input.normalized.rawText) {
    const extracted = await createDeterministicDocumentExtractor().extract({
      teamId: input.teamId,
      inboxItemId: inboxItem.id,
      documentId: document.id,
      versionId: version.id,
      objectKey: version.objectKey,
      fileName: input.normalized.fileName,
      contentType: input.normalized.contentType,
      byteSize: input.normalized.body.byteLength,
      body: input.normalized.body,
      rawText: input.normalized.rawText,
    });
    const extractedResult = await input.repository.createDocumentExtraction({
      extractionId: crypto.randomUUID(),
      teamId: input.teamId,
      inboxItemId: inboxItem.id,
      documentId: document.id,
      documentVersionId: version.id,
      source: "local_deterministic",
      fields: extracted.fields,
      confidence: extracted.confidence,
      rawText: extracted.rawText,
      createdByActorId: input.context.actor.id,
    });
    extraction = extractedResult.extraction;
    importedInboxItem = extractedResult.inboxItem;

    await input.repository.appendAuditEvent({
      teamId: input.teamId,
      actorId: input.context.actor.id,
      requestId: input.context.requestId,
      action: "document.extracted",
      entityType: "inbox_item",
      entityId: inboxItem.id,
      metadata: {
        documentId: document.id,
        versionId: version.id,
        source: "email_provider",
      },
    });

    await input.repository.appendOutboxEvent({
      teamId: input.teamId,
      actorId: input.context.actor.id,
      requestId: input.context.requestId,
      type: "document.extracted",
      version: 1,
      payload: {
        inboxItemId: inboxItem.id,
        documentId: document.id,
        versionId: version.id,
        source: "email_provider",
      },
    });
  }

  await input.repository.upsertProviderObject({
    teamId: input.teamId,
    provider: input.evidence.provider,
    providerObjectType: "email_evidence",
    providerObjectId: input.normalized.deduplicationKey,
    internalEntityType: "inbox_item",
    internalEntityId: inboxItem.id,
    rawPayload: {
      evidence: input.evidence.rawPayload,
      providerMessageId: input.evidence.providerMessageId,
      providerEvidenceId: input.evidence.providerEvidenceId,
      checksumSha256: input.normalized.checksumSha256,
      documentId: document.id,
      versionId: version.id,
    },
  });

  await input.repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    action: "email_inbox.evidence_imported",
    entityType: "inbox_item",
    entityId: inboxItem.id,
    metadata: {
      provider: input.evidence.provider,
      providerMessageId: input.evidence.providerMessageId,
      providerEvidenceId: input.evidence.providerEvidenceId,
      artifactKind: input.evidence.artifact.kind,
      from: input.evidence.from.email,
    },
  });

  await input.repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    type: "document.uploaded",
    version: 1,
    payload: {
      documentId: document.id,
      versionId: version.id,
      inboxItemId: inboxItem.id,
      actorId: input.context.actor.id,
      source: "email_provider",
      provider: input.evidence.provider,
      providerMessageId: input.evidence.providerMessageId,
      skipExtraction: Boolean(input.normalized.rawText),
    },
  });

  return {
    evidenceId: input.evidence.providerEvidenceId,
    document: completed.document,
    version: completed.version,
    inboxItem: importedInboxItem,
    extraction,
  };
}

type NormalizedEmailInboxEvidence = {
  deduplicationKey: string;
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
  checksumSha256: string;
  rawText?: string | null;
  skipReason?: EmailInboxSkippedArtifact["reason"];
};

function normalizeEvidenceForImport(
  evidence: EmailInboxEvidence,
  settings: EmailInboxSettings,
): NormalizedEmailInboxEvidence {
  const blocked = blockedSenderReason(evidence, settings);
  const empty = new ArrayBuffer(0);

  if (blocked) {
    return skippedEvidence(evidence, blocked, empty);
  }

  if (evidence.artifact.kind === "attachment") {
    if (
      !supportedEmailAttachmentContentTypes.has(
        normalizedContentType(evidence.artifact.contentType),
      )
    ) {
      return skippedEvidence(evidence, "unsupported_mime", empty);
    }

    if (evidence.artifact.byteSize > settings.maxAttachmentBytes) {
      return skippedEvidence(evidence, "oversized", empty);
    }

    const bytes = Buffer.from(evidence.artifact.contentBase64 ?? "", "base64");

    return {
      deduplicationKey: emailInboxEvidenceDeduplicationKey(evidence),
      fileName: emailInboxArtifactFileName(evidence),
      contentType: evidence.artifact.contentType,
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      checksumSha256: evidence.artifact.checksumSha256 ?? sha256Hex(bytes),
      rawText: null,
    };
  }

  const rawText =
    evidence.artifact.text?.trim() ||
    evidence.artifact.html
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ||
    "";

  if (!rawText) {
    return skippedEvidence(evidence, "empty_body", empty);
  }

  const bytes = Buffer.from(evidence.artifact.html ?? rawText, "utf8");

  return {
    deduplicationKey: emailInboxEvidenceDeduplicationKey(evidence),
    fileName: emailInboxArtifactFileName(evidence),
    contentType: evidence.artifact.contentType,
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    checksumSha256: evidence.artifact.checksumSha256 ?? sha256Hex(bytes),
    rawText,
  };
}

function normalizedContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function skippedEvidence(
  evidence: EmailInboxEvidence,
  reason: EmailInboxSkippedArtifact["reason"],
  body: ArrayBuffer,
): NormalizedEmailInboxEvidence {
  return {
    deduplicationKey: emailInboxEvidenceDeduplicationKey(evidence),
    fileName: emailInboxArtifactFileName(evidence),
    contentType:
      evidence.artifact.kind === "attachment"
        ? evidence.artifact.contentType
        : evidence.artifact.contentType,
    body,
    checksumSha256: evidence.artifact.checksumSha256 ?? "",
    skipReason: reason,
  };
}

function blockedSenderReason(
  evidence: EmailInboxEvidence,
  settings: EmailInboxSettings,
): EmailInboxSkippedArtifact["reason"] | null {
  const sender = evidence.from.email.toLowerCase();
  const domain = sender.split("@").at(-1) ?? "";

  if (settings.senderBlocklist.includes(sender) || settings.domainBlocklist.includes(domain)) {
    return "blocked_sender";
  }

  if (settings.senderAllowlist?.length && !settings.senderAllowlist.includes(sender)) {
    return "blocked_sender";
  }

  return null;
}

function requireInboxConnector(
  connectors: readonly InboxConnector[],
  provider: EmailInboxProviderName,
) {
  const connector = connectors.find((candidate) => candidate.provider === provider);

  if (!connector) {
    throw new AppError("NOT_FOUND", "Email inbox provider not found");
  }

  return connector;
}

function emailInboxProviderConnection(
  connection: IntegrationConnection,
  rawPayload: Record<string, unknown>,
) {
  const metadata = emailInboxMetadata(rawPayload);

  return {
    provider: connection.provider as EmailInboxProviderName,
    providerConnectionId: connection.providerConnectionId,
    accountEmail: metadata.accountEmail ?? connection.displayName,
    status:
      connection.status === "error" && metadata.reauthorizationRequired
        ? ("reauthorization_required" as const)
        : ("connected" as const),
    grantedScopes: metadata.grantedScopes,
    expiresAt: metadata.expiresAt,
    rawPayload,
  };
}

function isEmailInboxConnection(connection: IntegrationConnection) {
  return (
    connection.category === "email" && ["gmail", "mock-email-inbox"].includes(connection.provider)
  );
}

function emailInboxAccountEmail(connection: IntegrationConnection) {
  return emailInboxMetadata(connection.rawPayload).accountEmail ?? connection.displayName ?? null;
}

function emailInboxSyncDue(connection: IntegrationConnection, now: Date) {
  if (connection.status !== "connected") {
    return false;
  }

  if (!connection.lastSyncAt) {
    return true;
  }

  return now.getTime() - new Date(connection.lastSyncAt).getTime() >= emailInboxSyncIntervalMs;
}

function emailInboxSyncCursor(
  rawPayload: Record<string, unknown> | undefined,
): EmailInboxSyncCursor | null {
  const cursor = emailInboxMetadata(rawPayload).syncCursor;

  return cursor && Object.keys(cursor).length > 0 ? cursor : null;
}

function emailInboxSyncRange(
  rawPayload: Record<string, unknown> | undefined,
): EmailInboxSyncRange | null {
  return emailInboxMetadata(rawPayload).syncRange;
}

function emailInboxSettings(rawPayload: Record<string, unknown> | undefined): EmailInboxSettings {
  return {
    ...defaultEmailInboxSettings(),
    ...emailInboxMetadata(rawPayload).settings,
  };
}

function defaultEmailInboxSettings(): EmailInboxSettings {
  return {
    senderBlocklist: [],
    domainBlocklist: [],
    senderAllowlist: [],
    searchQuery: null,
    maxAttachmentBytes: 10 * 1024 * 1024,
  };
}

function normalizeSettingsPatch(settings: Partial<EmailInboxSettings>) {
  const current = defaultEmailInboxSettings();

  return {
    senderBlocklist: normalizeEmailList(settings.senderBlocklist ?? current.senderBlocklist),
    domainBlocklist: normalizeDomainList(settings.domainBlocklist ?? current.domainBlocklist),
    senderAllowlist: normalizeEmailList(settings.senderAllowlist ?? current.senderAllowlist ?? []),
    searchQuery: settings.searchQuery?.trim() || null,
    maxAttachmentBytes:
      typeof settings.maxAttachmentBytes === "number" &&
      Number.isSafeInteger(settings.maxAttachmentBytes) &&
      settings.maxAttachmentBytes > 0
        ? settings.maxAttachmentBytes
        : current.maxAttachmentBytes,
  };
}

function mergeEmailInboxRawPayload(
  rawPayload: Record<string, unknown>,
  patch: Partial<{
    syncCursor: EmailInboxSyncCursor | null;
    syncRange: EmailInboxSyncRange | null;
    syncedAt: string;
    settings: EmailInboxSettings;
    lastError: string | null;
    reauthorizationRequired: boolean;
  }>,
) {
  const previous = emailInboxMetadata(rawPayload);

  return {
    ...rawPayload,
    emailInbox: {
      ...previous,
      ...patch,
      settings: patch.settings ? { ...previous.settings, ...patch.settings } : previous.settings,
    },
  };
}

function emailInboxMetadata(rawPayload: Record<string, unknown> | undefined) {
  const metadata = isRecord(rawPayload?.emailInbox) ? rawPayload.emailInbox : {};
  const settings = isRecord(metadata.settings) ? metadata.settings : {};
  const cursor = isRecord(metadata.syncCursor) ? metadata.syncCursor : null;
  const syncRange = parseEmailInboxSyncRange(metadata.syncRange);

  return {
    provider: typeof metadata.provider === "string" ? metadata.provider : null,
    accountEmail: typeof metadata.accountEmail === "string" ? metadata.accountEmail : null,
    providerConnectionId:
      typeof metadata.providerConnectionId === "string" ? metadata.providerConnectionId : null,
    grantedScopes: Array.isArray(metadata.grantedScopes)
      ? metadata.grantedScopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    expiresAt: typeof metadata.expiresAt === "string" ? metadata.expiresAt : null,
    syncCursor: cursor as EmailInboxSyncCursor | null,
    syncRange,
    settings: {
      senderBlocklist: normalizeEmailList(readStringArray(settings.senderBlocklist)),
      domainBlocklist: normalizeDomainList(readStringArray(settings.domainBlocklist)),
      senderAllowlist: normalizeEmailList(readStringArray(settings.senderAllowlist)),
      searchQuery: typeof settings.searchQuery === "string" ? settings.searchQuery : null,
      maxAttachmentBytes:
        typeof settings.maxAttachmentBytes === "number" && settings.maxAttachmentBytes > 0
          ? settings.maxAttachmentBytes
          : defaultEmailInboxSettings().maxAttachmentBytes,
    },
    reauthorizationRequired: metadata.reauthorizationRequired === true,
  };
}

async function resolveEmailInboxSyncRange(input: {
  repository: EmailInboxUseCaseRepository;
  teamId: string;
  now: Date;
}): Promise<EmailInboxSyncRange | null> {
  return accountantBackfillEmailInboxSyncRange(
    input.now,
    await transactionActivityEmailInboxSyncRange(input.repository, input.teamId),
  );
}

function usableEmailInboxSyncCursor(input: {
  cursor: EmailInboxSyncCursor | null;
  previousRange: EmailInboxSyncRange | null;
  desiredRange: EmailInboxSyncRange | null;
}) {
  if (!input.cursor) {
    return null;
  }

  if (!input.desiredRange) {
    return input.cursor;
  }

  if (emailInboxSyncRangeCoversBackfill(input.previousRange, input.desiredRange)) {
    return input.cursor;
  }

  return null;
}

function emailInboxSyncRangeCoversBackfill(
  previousRange: EmailInboxSyncRange | null,
  desiredRange: EmailInboxSyncRange,
) {
  if (!previousRange) {
    return false;
  }

  return (
    validDateString(previousRange.receivedFrom) &&
    new Date(previousRange.receivedFrom).getTime() <= new Date(desiredRange.receivedFrom).getTime()
  );
}

function accountantBackfillEmailInboxSyncRange(
  now: Date,
  transactionRange: EmailInboxSyncRange | null,
): EmailInboxSyncRange {
  const transactionReceivedTo =
    transactionRange?.receivedTo && validDateString(transactionRange.receivedTo)
      ? new Date(transactionRange.receivedTo).getTime()
      : Number.NaN;
  const receivedTo = new Date(
    Math.max(now.getTime(), Number.isFinite(transactionReceivedTo) ? transactionReceivedTo : 0),
  );

  return {
    receivedFrom: emailInboxAccountantBackfillReceivedFrom,
    receivedTo: receivedTo.toISOString(),
    source: "accountant_backfill",
  };
}

async function transactionActivityEmailInboxSyncRange(
  repository: EmailInboxUseCaseRepository,
  teamId: string,
): Promise<EmailInboxSyncRange | null> {
  const transactions = await repository.listTransactionsForReport({ teamId });
  const postedTimes = transactions
    .map((transaction) => new Date(transaction.postedAt).getTime())
    .filter(Number.isFinite);

  if (postedTimes.length === 0) {
    return null;
  }

  const firstPostedAt = new Date(Math.min(...postedTimes));
  const lastPostedAt = new Date(Math.max(...postedTimes));

  return {
    receivedFrom: startOfUtcDay(addUtcDays(firstPostedAt, -7)).toISOString(),
    receivedTo: endOfUtcDay(addUtcDays(lastPostedAt, 7)).toISOString(),
    source: "transaction_activity",
  };
}

function parseEmailInboxSyncRange(value: unknown): EmailInboxSyncRange | null {
  if (!isRecord(value)) {
    return null;
  }

  const source =
    value.source === "accountant_backfill" ||
    value.source === "current_calendar_year" ||
    value.source === "transaction_activity"
      ? value.source
      : null;
  const receivedFrom = typeof value.receivedFrom === "string" ? value.receivedFrom : null;
  const receivedTo =
    typeof value.receivedTo === "string" && validDateString(value.receivedTo)
      ? value.receivedTo
      : null;

  if (!source || !receivedFrom || !validDateString(receivedFrom)) {
    return null;
  }

  return { receivedFrom, receivedTo, source };
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

function validDateString(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function isReauthError(connection: IntegrationConnection) {
  return emailInboxMetadata(connection.rawPayload).reauthorizationRequired;
}

function normalizeEmailList(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeDomainList(values: readonly string[]) {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
        .filter((value) => value.includes(".")),
    ),
  ];
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function emailInboxObjectKey(
  teamId: string,
  documentId: string,
  versionId: string,
  fileName: string,
) {
  return `teams/${teamId}/documents/${documentId}/versions/${versionId}/${fileName}`;
}

function emailInboxDocumentTitle(evidence: EmailInboxEvidence) {
  const subject = evidence.subject?.trim();

  if (subject) {
    return subject;
  }

  return evidence.artifact.kind === "attachment" ? evidence.artifact.fileName : "Email receipt";
}

function sha256Hex(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

function signEmailInboxOAuthState(secret: string, payload: EmailInboxOAuthStatePayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSha256(secret, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyEmailInboxOAuthStateSignature(secret: string, state: string) {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    throw new AppError("FORBIDDEN", "Email inbox OAuth state is invalid");
  }

  const expected = hmacSha256(secret, encodedPayload);

  if (!safeEqual(signature, expected)) {
    throw new AppError("FORBIDDEN", "Email inbox OAuth state is invalid");
  }

  let payload: EmailInboxOAuthStatePayload;

  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as EmailInboxOAuthStatePayload;
  } catch {
    throw new AppError("FORBIDDEN", "Email inbox OAuth state is invalid");
  }

  if (
    !payload.teamId ||
    !payload.actorId ||
    !payload.provider ||
    !payload.redirectUrl ||
    !payload.nonce ||
    !payload.expiresAt
  ) {
    throw new AppError("FORBIDDEN", "Email inbox OAuth state is invalid");
  }

  return payload;
}

function hmacSha256(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
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

function emailInboxErrorMessage(error: unknown) {
  if (
    error instanceof EmailInboxProviderAuthError ||
    error instanceof EmailInboxProviderSyncError
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
