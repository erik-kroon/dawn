import { describe, expect, test } from "bun:test";

import {
  connectEmailInboxFromProviderToken,
  completeEmailInboxOAuth,
  createEmailInboxOAuthStateCodec,
  createEmailInboxAuthorizationUrl,
  listEmailInboxWorkspace,
  requestDueEmailInboxSyncs,
  syncEmailInbox,
  type BusinessDocument,
  type BusinessDocumentVersion,
  type DawnRepository,
  type DocumentExtraction,
  type DocumentExtractionConfidence,
  type DocumentExtractionFields,
  type EmailInboxObjectStorage,
  type IdempotencyResult,
  type InboxItem,
  type InboxSource,
  type InboxSourceType,
  type IntegrationConnectionSecrets,
  type ProviderObjectRecord,
} from ".";
import type {
  Actor,
  IntegrationCategory,
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationSyncRunStatus,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import {
  createEmailInboxTokenCodec,
  createMockEmailInboxProvider,
  EmailInboxProviderAuthError,
  InboxConnector,
  type EmailInboxProvider,
} from "@dawn/integrations";

class MemoryEmailInboxRepository {
  role: TeamRole | null = "owner";
  connections = new Map<string, IntegrationConnection & { tokenCiphertext: string }>();
  syncRuns = new Map<string, IntegrationSyncRun>();
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  inboxSources = new Map<string, InboxSource>();
  inboxItems = new Map<string, InboxItem>();
  extractions = new Map<string, DocumentExtraction>();
  providerObjects = new Map<string, ProviderObjectRecord>();
  transactions = new Map<string, Transaction>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

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

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }

  async listIntegrationConnectionSummaries(teamId: string) {
    return [...this.connections.values()]
      .filter((connection) => connection.teamId === teamId)
      .map((connection) => ({
        connection,
        latestSyncRun:
          [...this.syncRuns.values()]
            .filter((run) => run.integrationConnectionId === connection.id)
            .at(-1) ?? null,
      }));
  }

  async listIntegrationConnectionsForTeam(teamId: string) {
    return [...this.connections.values()].filter((connection) => connection.teamId === teamId);
  }

  async listEmailInboxSyncCandidateConnections() {
    return [...this.connections.values()].filter(
      (connection) => connection.category === "email" && connection.status === "connected",
    );
  }

  async getIntegrationConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.connections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async getIntegrationConnectionSecretsForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnectionSecrets | null> {
    const connection = this.connections.get(connectionId);

    return connection?.teamId === teamId
      ? {
          token: {
            encryptedToken: connection.tokenCiphertext,
            keyId: connection.tokenKeyId,
            lastFour: connection.tokenLastFour,
          },
          rawPayload: connection.rawPayload ?? {},
        }
      : null;
  }

  async upsertIntegrationConnection(input: {
    connectionId: string;
    teamId: string;
    category: IntegrationCategory;
    provider: string;
    providerConnectionId: string;
    displayName: string;
    capabilities: string[];
    tokenCiphertext: string;
    tokenKeyId: string;
    tokenLastFour: string;
    rawPayload: Record<string, unknown>;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const existing = [...this.connections.values()].find(
      (connection) =>
        connection.teamId === input.teamId &&
        connection.provider === input.provider &&
        connection.providerConnectionId === input.providerConnectionId,
    );
    const connection = {
      id: existing?.id ?? input.connectionId,
      teamId: input.teamId,
      category: input.category,
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      displayName: input.displayName,
      status: "connected" as const,
      capabilities: input.capabilities,
      tokenCiphertext: input.tokenCiphertext,
      tokenKeyId: input.tokenKeyId,
      tokenLastFour: input.tokenLastFour,
      rawPayload: input.rawPayload,
      lastSyncAt: null,
      lastError: null,
      disabledAt: null,
      createdByActorId: input.createdByActorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.connections.set(connection.id, connection);
    return connection;
  }

  async updateIntegrationConnectionTokenAndRawPayload(input: {
    connectionId: string;
    token?: IntegrationConnectionSecrets["token"] | null;
    rawPayload: Record<string, unknown>;
    status?: IntegrationConnection["status"];
    lastError?: string | null;
    lastSyncAt?: Date | null;
  }) {
    const connection = this.connections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const updated = {
      ...connection,
      tokenCiphertext: input.token?.encryptedToken ?? connection.tokenCiphertext,
      tokenKeyId: input.token?.keyId ?? connection.tokenKeyId,
      tokenLastFour: input.token?.lastFour ?? connection.tokenLastFour,
      rawPayload: input.rawPayload,
      status: input.status ?? connection.status,
      lastError: input.lastError ?? null,
      lastSyncAt: input.lastSyncAt?.toISOString() ?? connection.lastSyncAt,
      updatedAt: "2026-06-15T10:05:00.000Z",
    };
    this.connections.set(updated.id, updated);
    return updated;
  }

  async createIntegrationSyncRun(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }) {
    const syncRun = {
      id: input.syncRunId,
      teamId: input.teamId,
      integrationConnectionId: input.integrationConnectionId,
      category: input.category,
      provider: input.provider,
      status: "running" as const,
      startedAt: "2026-06-15T10:00:00.000Z",
      completedAt: null,
      recordsSynced: 0,
      error: null,
      rawPayload: {},
    };
    this.syncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async createEmailInboxSyncRunIfIdle(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }) {
    const running = [...this.syncRuns.values()].find(
      (syncRun) =>
        syncRun.integrationConnectionId === input.integrationConnectionId &&
        syncRun.status === "running",
    );

    if (running) {
      return null;
    }

    return this.createIntegrationSyncRun(input);
  }

  async finishIntegrationSyncRun(input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const existing = this.syncRuns.get(input.syncRunId);

    if (!existing) {
      throw new Error("missing sync run");
    }

    const syncRun = {
      ...existing,
      status: input.status,
      completedAt: "2026-06-15T10:01:00.000Z",
      recordsSynced: input.recordsSynced,
      error: input.error ?? null,
      rawPayload: input.rawPayload,
    };
    this.syncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async markIntegrationConnectionSynced() {
    throw new Error("unused");
  }

  async disableIntegrationConnection() {
    throw new Error("unused");
  }

  async listDocuments(teamId: string) {
    return [...this.documents.values()].filter((document) => document.teamId === teamId);
  }

  async listInboxItems(teamId: string) {
    return [...this.inboxItems.values()].filter((item) => item.teamId === teamId);
  }

  async listTransactionsForReport(input: { teamId: string }) {
    return [...this.transactions.values()].filter(
      (transaction) => transaction.teamId === input.teamId,
    );
  }

  async createDocumentUploadRecord(input: {
    documentId: string;
    versionId: string;
    teamId: string;
    title: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    checksumSha256?: string | null;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const version: BusinessDocumentVersion = {
      id: input.versionId,
      documentId: input.documentId,
      teamId: input.teamId,
      versionNumber: 1,
      objectKey: input.objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "pending_upload",
      uploadedAt: null,
      createdAt: now,
    };
    const document: BusinessDocument = {
      id: input.documentId,
      teamId: input.teamId,
      title: input.title,
      status: "uploading",
      currentVersionId: input.versionId,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
      currentVersion: version,
    };
    this.documentVersions.set(version.id, version);
    this.documents.set(document.id, document);
    return { document, version };
  }

  async completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }) {
    const document = this.documents.get(input.documentId)!;
    const version = this.documentVersions.get(input.versionId)!;
    const uploadedVersion: BusinessDocumentVersion = {
      ...version,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? version.checksumSha256 ?? null,
      status: "uploaded",
      uploadedAt: input.uploadedAt.toISOString(),
    };
    const uploadedDocument: BusinessDocument = {
      ...document,
      status: "uploaded",
      currentVersion: uploadedVersion,
      updatedAt: input.uploadedAt.toISOString(),
    };
    this.documentVersions.set(uploadedVersion.id, uploadedVersion);
    this.documents.set(uploadedDocument.id, uploadedDocument);
    return { document: uploadedDocument, version: uploadedVersion };
  }

  async getDocumentForTeam(teamId: string, documentId: string) {
    const document = this.documents.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.documentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async ensureInboxSource(input: {
    sourceId: string;
    teamId: string;
    type: InboxSourceType;
    name: string;
  }) {
    const existing = [...this.inboxSources.values()].find(
      (source) =>
        source.teamId === input.teamId && source.type === input.type && source.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const source: InboxSource = {
      id: input.sourceId,
      teamId: input.teamId,
      type: input.type,
      name: input.name,
      createdAt: "2026-06-15T10:00:00.000Z",
    };
    this.inboxSources.set(source.id, source);
    return source;
  }

  async createInboxItemForDocumentUpload(input: {
    inboxItemId: string;
    sourceId: string;
    teamId: string;
    sourceType?: InboxSourceType;
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }) {
    const item: InboxItem = {
      id: input.inboxItemId,
      teamId: input.teamId,
      sourceId: input.sourceId,
      sourceType: input.sourceType ?? "document_upload",
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      status: "pending_extraction",
      extractionStatus: "pending",
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
      source: this.inboxSources.get(input.sourceId) ?? null,
      document: this.documents.get(input.documentId) ?? null,
      latestExtraction: null,
    };
    this.inboxItems.set(item.id, item);
    return item;
  }

  async getInboxItemForTeam(teamId: string, inboxItemId: string) {
    const item = this.inboxItems.get(inboxItemId);
    return item?.teamId === teamId ? item : null;
  }

  async createDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    source: "local_deterministic";
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
    createdByActorId: string;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId)!;
    const extraction: DocumentExtraction = {
      id: input.extractionId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      extractionVersion: this.extractions.size + 1,
      source: input.source,
      status: "completed",
      fields: input.fields,
      confidence: input.confidence,
      rawText: input.rawText ?? null,
      error: null,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:02:00.000Z",
    };
    const updatedInboxItem: InboxItem = {
      ...inboxItem,
      status: "needs_review",
      extractionStatus: "completed",
      latestExtraction: extraction,
      updatedAt: "2026-06-15T10:02:00.000Z",
    };
    this.extractions.set(extraction.id, extraction);
    this.inboxItems.set(updatedInboxItem.id, updatedInboxItem);
    return { inboxItem: updatedInboxItem, extraction };
  }

  async getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }) {
    return this.providerObjects.get(providerObjectKey(input)) ?? null;
  }

  async upsertProviderObject(input: ProviderObjectRecord) {
    this.providerObjects.set(providerObjectKey(input), input);
  }
}

class MemoryEmailInboxStorage implements EmailInboxObjectStorage {
  objects = new Map<string, { body: ArrayBuffer; contentType: string }>();

  async put(input: { objectKey: string; body: ArrayBuffer; contentType: string }) {
    this.objects.set(input.objectKey, { body: input.body, contentType: input.contentType });
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};
const oauthRedirectUrl = "http://localhost:3000/inbox";
const oauthStateCodec = createEmailInboxOAuthStateCodec({
  secret: "test_oauth_state_secret_that_is_long_enough",
  allowedRedirectOrigins: ["http://localhost:3000"],
  now: () => new Date("2026-06-15T10:00:00.000Z"),
});

function createOAuthState(
  input: {
    teamId?: string;
    actorId?: string;
    provider?: "mock-email-inbox";
    redirectUrl?: string;
  } = {},
) {
  return oauthStateCodec.createState({
    teamId: input.teamId ?? "team_1",
    actorId: input.actorId ?? "user_1",
    provider: input.provider ?? "mock-email-inbox",
    redirectUrl: input.redirectUrl ?? oauthRedirectUrl,
  });
}

function createEmailInboxConnectors(provider: EmailInboxProvider = createMockEmailInboxProvider()) {
  return [
    new InboxConnector({
      provider,
      tokenCodec: createEmailInboxTokenCodec({
        secret: "test_secret_that_is_long_enough_for_aes",
        keyId: "test-email-token",
      }),
    }),
  ];
}

const connectors = createEmailInboxConnectors();

describe("email inbox use cases", () => {
  test("creates an authorization URL and stores an encrypted email inbox connection", async () => {
    const repository = new MemoryEmailInboxRepository();

    const authorization = await createEmailInboxAuthorizationUrl(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        redirectUrl: oauthRedirectUrl,
      },
    );
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: authorization.state,
        idempotencyKey: "email_oauth_1",
      },
    );
    const workspace = await listEmailInboxWorkspace(
      repository as unknown as DawnRepository,
      connectors,
      context,
      { teamId: "team_1" },
    );

    expect(authorization.authorizationUrl).toContain(
      `state=${encodeURIComponent(authorization.state)}`,
    );
    expect(connected.connection).toMatchObject({
      category: "email",
      provider: "mock-email-inbox",
      providerConnectionId: "mock_email_account_1",
      displayName: "receipts@example.com",
      status: "connected",
    });
    expect(repository.connections.get(connected.connection.id)?.tokenCiphertext).not.toContain(
      "mock_refresh",
    );
    expect(workspace.connections[0]?.grantedScopes).toEqual(["email.inbox.readonly"]);
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "email_inbox.connected" });
  });

  test("stores an encrypted email inbox connection from provider tokens", async () => {
    const repository = new MemoryEmailInboxRepository();

    const connected = await connectEmailInboxFromProviderToken(
      repository as unknown as DawnRepository,
      connectors,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        tokens: {
          accessToken: "provider_access_token",
          refreshToken: "provider_refresh_token",
          expiresAt: "2026-06-15T16:00:00.000Z",
          tokenType: "Bearer",
          scopes: ["email.inbox.readonly"],
          rawPayload: { source: "test-token" },
        },
        idempotencyKey: "email_provider_token_1",
        source: "google_login",
      },
    );

    expect(connected.connection).toMatchObject({
      category: "email",
      provider: "mock-email-inbox",
      providerConnectionId: "mock_email_account_1",
      displayName: "receipts@example.com",
      status: "connected",
    });
    expect(repository.connections.get(connected.connection.id)?.tokenCiphertext).not.toContain(
      "provider_refresh_token",
    );
    expect(connected.connection.rawPayload?.emailInbox).toMatchObject({
      source: "google_login",
      grantedScopes: ["email.inbox.readonly"],
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "email_inbox.connected",
      metadata: { source: "google_login" },
    });
  });

  test("rejects unsafe or mismatched email inbox OAuth state", async () => {
    const repository = new MemoryEmailInboxRepository();

    await expect(
      createEmailInboxAuthorizationUrl(
        repository as unknown as DawnRepository,
        connectors,
        oauthStateCodec,
        context,
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          redirectUrl: "https://evil.example/inbox",
        },
      ),
    ).rejects.toThrow("Email inbox OAuth redirect URL is not allowed");

    await expect(
      createEmailInboxAuthorizationUrl(
        repository as unknown as DawnRepository,
        connectors,
        oauthStateCodec,
        context,
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          redirectUrl: "http://localhost:3000/dashboard",
        },
      ),
    ).rejects.toThrow("Email inbox OAuth redirect URL is not allowed");

    await expect(
      completeEmailInboxOAuth(
        repository as unknown as DawnRepository,
        connectors,
        oauthStateCodec,
        context,
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          code: "oauth_code_1",
          redirectUrl: oauthRedirectUrl,
          state: await createOAuthState({ actorId: "user_2" }),
          idempotencyKey: "email_oauth_mismatch",
        },
      ),
    ).rejects.toThrow("Email inbox OAuth state is invalid");

    await expect(
      completeEmailInboxOAuth(
        repository as unknown as DawnRepository,
        connectors,
        oauthStateCodec,
        context,
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          code: "oauth_code_1",
          redirectUrl: oauthRedirectUrl,
          state: "not-a-valid-state",
          idempotencyKey: "email_oauth_tampered",
        },
      ),
    ).rejects.toThrow("Email inbox OAuth state is invalid");

    const expiredStateCodec = createEmailInboxOAuthStateCodec({
      secret: "test_oauth_state_secret_that_is_long_enough",
      allowedRedirectOrigins: ["http://localhost:3000"],
      now: () => new Date("2026-06-15T10:11:00.000Z"),
    });

    await expect(
      completeEmailInboxOAuth(
        repository as unknown as DawnRepository,
        connectors,
        expiredStateCodec,
        context,
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          code: "oauth_code_1",
          redirectUrl: oauthRedirectUrl,
          state: await createOAuthState(),
          idempotencyKey: "email_oauth_expired",
        },
      ),
    ).rejects.toThrow("Email inbox OAuth state expired");
    expect(repository.connections).toHaveLength(0);
  });

  test("reports due and skipped scheduled sync requests", async () => {
    const repository = new MemoryEmailInboxRepository();
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_1",
      },
    );
    const baseConnection = repository.connections.get(connected.connection.id)!;

    repository.connections.set("connection_recent", {
      ...baseConnection,
      id: "connection_recent",
      providerConnectionId: "mock_email_account_recent",
      displayName: "recent@example.com",
      lastSyncAt: "2026-06-15T09:30:00.000Z",
    });
    repository.connections.set("connection_error", {
      ...baseConnection,
      id: "connection_error",
      providerConnectionId: "mock_email_account_error",
      displayName: "error@example.com",
      status: "error",
      lastError: "Email inbox connection requires reauthorization",
      rawPayload: {
        emailInbox: {
          reauthorizationRequired: true,
        },
      },
    });
    repository.connections.set("connection_disabled", {
      ...baseConnection,
      id: "connection_disabled",
      providerConnectionId: "mock_email_account_disabled",
      displayName: "disabled@example.com",
      status: "disabled",
      disabledAt: "2026-06-15T09:00:00.000Z",
    });

    const result = await requestDueEmailInboxSyncs(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        now: new Date("2026-06-15T10:00:00.000Z"),
        idempotencyKey: "email_due_sync_1",
      },
    );

    expect(result).toEqual({ requested: 1, skipped: 3 });
    expect(
      repository.outboxEvents.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "inbox.provider.sync_requested",
      ),
    ).toHaveLength(1);
  });

  test("marks revoked credentials as reauthorization required", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_1",
      },
    );
    const reauthorizationConnectors = createEmailInboxConnectors({
      ...createMockEmailInboxProvider(),
      async syncEvidence(input) {
        throw new EmailInboxProviderAuthError(
          "Email inbox connection requires reauthorization",
          "reauthorization_required",
          "mock-email-inbox",
          input.connection.providerConnectionId,
        );
      },
    });

    const synced = await syncEmailInbox(
      repository as unknown as DawnRepository,
      reauthorizationConnectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_reauth",
      },
    );
    const workspace = await listEmailInboxWorkspace(
      repository as unknown as DawnRepository,
      connectors,
      context,
      { teamId: "team_1" },
    );

    expect(synced.connection.status).toBe("error");
    expect(synced.connection.rawPayload?.emailInbox).toMatchObject({
      reauthorizationRequired: true,
      lastError: "Email inbox connection requires reauthorization",
    });
    expect(synced.syncRun).toMatchObject({
      status: "failed",
      error: "Email inbox connection requires reauthorization",
      rawPayload: { reauthorizationRequired: true },
    });
    expect(workspace.connections.at(0)).toMatchObject({
      reauthorizationRequired: true,
      latestSyncRun: {
        status: "failed",
        error: "Email inbox connection requires reauthorization",
      },
    });
  });

  test("does not start a second sync while the connection has a running sync", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_1",
      },
    );

    await repository.createIntegrationSyncRun({
      syncRunId: "sync_running_1",
      teamId: "team_1",
      integrationConnectionId: connected.connection.id,
      category: "email",
      provider: "mock-email-inbox",
    });

    await expect(
      syncEmailInbox(repository as unknown as DawnRepository, connectors, storage, context, {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_conflict",
      }),
    ).rejects.toThrow("Email inbox sync already running");
    expect(repository.syncRuns).toHaveLength(1);
    expect(storage.objects).toHaveLength(0);
  });

  test("uses the accountant backfill window as the initial email inbox sync range", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const syncInputs: Parameters<EmailInboxProvider["syncEvidence"]>[0][] = [];
    const rangeConnectors = createEmailInboxConnectors({
      ...createMockEmailInboxProvider(),
      async syncEvidence(input) {
        syncInputs.push(input);
        return { status: "completed", evidence: [], nextCursor: null, rawPayload: {} };
      },
    });
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      rangeConnectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_range_ytd",
      },
    );

    const synced = await syncEmailInbox(
      repository as unknown as DawnRepository,
      rangeConnectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_range_ytd",
        now: new Date("2026-06-16T12:00:00.000Z"),
      },
    );

    expect(syncInputs[0]?.syncRange).toEqual({
      receivedFrom: "2025-01-01T00:00:00.000Z",
      receivedTo: "2026-06-16T12:00:00.000Z",
      source: "accountant_backfill",
    });
    expect(synced.connection.rawPayload?.emailInbox).toMatchObject({
      syncRange: syncInputs[0]?.syncRange,
    });
    expect(synced.syncRun.rawPayload).toMatchObject({
      syncRange: syncInputs[0]?.syncRange,
    });
  });

  test("keeps transaction activity inside the accountant backfill window", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const syncInputs: Parameters<EmailInboxProvider["syncEvidence"]>[0][] = [];
    const rangeConnectors = createEmailInboxConnectors({
      ...createMockEmailInboxProvider(),
      async syncEvidence(input) {
        syncInputs.push(input);
        return { status: "completed", evidence: [], nextCursor: null, rawPayload: {} };
      },
    });
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Opening purchase",
      postedAt: "2025-01-01T10:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "csv_import",
      providerTransactionId: "csv_txn_1",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.transactions.set("txn_2", {
      id: "txn_2",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Year-end purchase",
      postedAt: "2025-12-31T15:00:00.000Z",
      money: { amountMinor: -3400, currency: "USD" },
      type: "expense",
      source: "csv_import",
      providerTransactionId: "csv_txn_2",
      categoryId: null,
      reviewState: "needs_review",
    });
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      rangeConnectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_range_transactions",
      },
    );

    await syncEmailInbox(
      repository as unknown as DawnRepository,
      rangeConnectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_range_transactions",
        now: new Date("2026-06-16T12:00:00.000Z"),
      },
    );

    expect(syncInputs[0]?.syncRange).toEqual({
      receivedFrom: "2025-01-01T00:00:00.000Z",
      receivedTo: "2026-06-16T12:00:00.000Z",
      source: "accountant_backfill",
    });
  });

  test("ignores stored current-year cursors until the accountant backfill is covered", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const syncInputs: Parameters<EmailInboxProvider["syncEvidence"]>[0][] = [];
    const rangeConnectors = createEmailInboxConnectors({
      ...createMockEmailInboxProvider(),
      async syncEvidence(input) {
        syncInputs.push(input);
        return { status: "completed", evidence: [], nextCursor: null, rawPayload: {} };
      },
    });
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      rangeConnectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_range_existing_cursor",
      },
    );
    const existingConnection = repository.connections.get(connected.connection.id)!;
    const existingRawPayload = existingConnection.rawPayload ?? {};
    const existingEmailInbox =
      typeof existingRawPayload.emailInbox === "object" && existingRawPayload.emailInbox !== null
        ? (existingRawPayload.emailInbox as Record<string, unknown>)
        : {};
    repository.connections.set(existingConnection.id, {
      ...existingConnection,
      rawPayload: {
        ...existingRawPayload,
        emailInbox: {
          ...existingEmailInbox,
          syncCursor: {
            receivedAfter: "2026-06-16T12:00:00.000Z",
            providerCursor: null,
            rawPayload: { source: "old-ytd-sync" },
          },
          syncRange: {
            receivedFrom: "2026-01-01T00:00:00.000Z",
            receivedTo: "2026-06-16T12:00:00.000Z",
            source: "current_calendar_year",
          },
        },
      },
    });

    const synced = await syncEmailInbox(
      repository as unknown as DawnRepository,
      rangeConnectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_range_existing_cursor",
        now: new Date("2026-06-16T12:00:00.000Z"),
      },
    );

    expect(syncInputs[0]?.cursor).toBeNull();
    expect(syncInputs[0]?.syncRange).toEqual({
      receivedFrom: "2025-01-01T00:00:00.000Z",
      receivedTo: "2026-06-16T12:00:00.000Z",
      source: "accountant_backfill",
    });
    expect(synced.connection.rawPayload?.emailInbox).toMatchObject({
      syncCursor: null,
      syncRange: syncInputs[0]?.syncRange,
    });
  });

  test("syncs attachment and body-only evidence into documents and inbox items", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_1",
      },
    );

    const synced = await syncEmailInbox(
      repository as unknown as DawnRepository,
      connectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_1",
      },
    );
    const duplicate = await syncEmailInbox(
      repository as unknown as DawnRepository,
      connectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_2",
      },
    );

    expect(synced.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 2,
      rawPayload: { imported: 2, skipped: 0 },
    });
    expect(synced.imported.map((item) => item.inboxItem.sourceType)).toEqual([
      "email_provider",
      "email_provider",
    ]);
    expect(synced.imported[0]?.version.contentType).toBe("application/pdf");
    expect(synced.imported[1]?.extraction?.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Coffee Shop",
      totalAmountMinor: 850,
      currency: "USD",
    });
    expect(storage.objects).toHaveLength(2);
    expect(repository.providerObjects).toHaveLength(2);
    expect(repository.outboxEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "document.uploaded" }),
        expect.objectContaining({ type: "document.extracted" }),
        expect.objectContaining({ type: "email_inbox.synced" }),
      ]),
    );
    expect(duplicate).toMatchObject({
      imported: [],
      skipped: [{ reason: "duplicate" }, { reason: "duplicate" }],
    });
  });

  test("imports image receipt attachments for OCR extraction", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const imageConnectors = createEmailInboxConnectors({
      ...createMockEmailInboxProvider(),
      async syncEvidence(input) {
        return {
          status: "completed",
          evidence: [
            {
              provider: "mock-email-inbox",
              providerConnectionId: input.connection.providerConnectionId,
              providerMessageId: "message_image_1",
              providerEvidenceId: "evidence_image_1",
              subject: "Receipt",
              receivedAt: "2026-06-15T12:00:00.000Z",
              from: { email: "receipts@example.com" },
              to: [{ email: "accounting@example.com" }],
              artifact: {
                kind: "attachment",
                artifactId: "artifact_image_1",
                providerPartId: "part_image_1",
                fileName: "receipt.png",
                contentType: "image/png",
                byteSize: 4,
                contentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
              },
              rawPayload: { mock: true },
            },
          ],
          nextCursor: null,
          rawPayload: {},
        };
      },
    });
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      imageConnectors,
      oauthStateCodec,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_image",
        redirectUrl: oauthRedirectUrl,
        state: await createOAuthState(),
        idempotencyKey: "email_oauth_image",
      },
    );

    const synced = await syncEmailInbox(
      repository as unknown as DawnRepository,
      imageConnectors,
      storage,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_sync_image",
      },
    );

    expect(synced).toMatchObject({
      imported: [
        {
          version: { fileName: "receipt.png", contentType: "image/png", byteSize: 4 },
          extraction: null,
        },
      ],
      skipped: [],
    });
    expect(synced.imported[0]?.inboxItem).toMatchObject({
      status: "pending_extraction",
      extractionStatus: "pending",
    });
    expect(storage.objects.values().next().value).toMatchObject({
      contentType: "image/png",
    });
  });
});

function providerObjectKey(input: {
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
}) {
  return `${input.teamId}:${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
}
