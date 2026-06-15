import { describe, expect, test } from "bun:test";

import {
  completeEmailInboxOAuth,
  createEmailInboxAuthorizationUrl,
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
} from "@dawn/domain";
import {
  createEmailInboxTokenCodec,
  createMockEmailInboxProvider,
  InboxConnector,
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

const connectors = [
  new InboxConnector({
    provider: createMockEmailInboxProvider(),
    tokenCodec: createEmailInboxTokenCodec({
      secret: "test_secret_that_is_long_enough_for_aes",
      keyId: "test-email-token",
    }),
  }),
];

describe("email inbox use cases", () => {
  test("creates an authorization URL and stores an encrypted email inbox connection", async () => {
    const repository = new MemoryEmailInboxRepository();

    const authorization = await createEmailInboxAuthorizationUrl(
      repository as unknown as DawnRepository,
      connectors,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        redirectUrl: "http://localhost:3000/inbox/oauth/callback",
        state: "state_1",
      },
    );
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: "http://localhost:3000/inbox/oauth/callback",
        idempotencyKey: "email_oauth_1",
      },
    );

    expect(authorization.authorizationUrl).toContain("state=state_1");
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
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "email_inbox.connected" });
  });

  test("syncs attachment and body-only evidence into documents and inbox items", async () => {
    const repository = new MemoryEmailInboxRepository();
    const storage = new MemoryEmailInboxStorage();
    const connected = await completeEmailInboxOAuth(
      repository as unknown as DawnRepository,
      connectors,
      context,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: "http://localhost:3000/inbox/oauth/callback",
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
});

function providerObjectKey(input: {
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
}) {
  return `${input.teamId}:${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
}
