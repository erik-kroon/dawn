import { describe, expect, test } from "bun:test";
import type { Actor, TeamRole } from "@dawn/domain";

import {
  AppError,
  completeDocumentUpload,
  createDocumentDownload,
  createDocumentUpload,
  type BusinessDocument,
  type BusinessDocumentVersion,
  type DawnRepository,
  type DocumentExtraction,
  type DocumentExtractionConfidence,
  type DocumentExtractionFields,
  type DocumentUrlSigner,
  type IdempotencyResult,
  type InboxItem,
  type InboxSource,
  type InboxSourceType,
} from "./index";

class MemoryDocumentRepository {
  auditEvents: unknown[] = [];
  inboxItems = new Map<string, InboxItem>();
  inboxSources = new Map<string, InboxSource>();
  extractions = new Map<string, DocumentExtraction>();
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
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
      currentVersionId: null,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
      currentVersion: null,
    };
    this.documents.set(document.id, document);
    this.documentVersions.set(version.id, version);

    return { document, version };
  }

  async getDocumentForTeam(teamId: string, documentId: string) {
    const document = this.documents.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.documentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }) {
    const document = this.documents.get(input.documentId);
    const version = this.documentVersions.get(input.versionId);

    if (
      !document ||
      document.teamId !== input.teamId ||
      !version ||
      version.teamId !== input.teamId
    ) {
      throw new Error("Document upload not found");
    }

    const uploadedVersion: BusinessDocumentVersion = {
      ...version,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "uploaded",
      uploadedAt: input.uploadedAt.toISOString(),
    };
    const uploadedDocument: BusinessDocument = {
      ...document,
      status: "uploaded",
      currentVersionId: uploadedVersion.id,
      currentVersion: uploadedVersion,
      updatedAt: input.uploadedAt.toISOString(),
    };
    this.documentVersions.set(uploadedVersion.id, uploadedVersion);
    this.documents.set(uploadedDocument.id, uploadedDocument);

    return { document: uploadedDocument, version: uploadedVersion };
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
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }) {
    const source = this.inboxSources.get(input.sourceId) ?? null;
    const document = this.documents.get(input.documentId) ?? null;
    const inboxItem: InboxItem = {
      id: input.inboxItemId,
      teamId: input.teamId,
      sourceId: input.sourceId,
      sourceType: "document_upload",
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      status: "pending_extraction",
      extractionStatus: "pending",
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
      source,
      document,
      latestExtraction: null,
    };
    this.inboxItems.set(inboxItem.id, inboxItem);
    return inboxItem;
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
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem) {
      throw new Error("Inbox item not found");
    }

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

  async createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem) {
      throw new Error("Inbox item not found");
    }

    const extraction: DocumentExtraction = {
      id: input.extractionId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: inboxItem.documentId,
      documentVersionId: inboxItem.documentVersionId,
      extractionVersion: this.extractions.size + 1,
      source: "user_correction",
      status: "completed",
      fields: input.fields,
      confidence: input.confidence,
      rawText: inboxItem.latestExtraction?.rawText ?? null,
      error: null,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:03:00.000Z",
    };
    const updatedInboxItem = { ...inboxItem, latestExtraction: extraction };
    this.extractions.set(extraction.id, extraction);
    this.inboxItems.set(updatedInboxItem.id, updatedInboxItem);
    return { inboxItem: updatedInboxItem, extraction };
  }

  async markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem || inboxItem.teamId !== input.teamId) {
      throw new Error("Inbox item not found");
    }

    const updated = {
      ...inboxItem,
      extractionStatus: "failed" as const,
      updatedAt: input.failedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }
}

const signer: DocumentUrlSigner = {
  async createUploadUrl(input) {
    return {
      url: `https://files.example.com/upload/${input.teamId}/${input.versionId}`,
      expiresAt: "2026-06-15T10:15:00.000Z",
    };
  },
  async createDownloadUrl(input) {
    return {
      url: `https://files.example.com/download/${input.teamId}/${input.versionId}`,
      expiresAt: "2026-06-15T10:05:00.000Z",
    };
  },
};

describe("document use cases", () => {
  test("creates upload metadata with a signed URL and idempotent replay", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");

    const first = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: " Receipt June.pdf ",
        contentType: "Application/PDF",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );
    const replayed = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: " Receipt June.pdf ",
        contentType: "Application/PDF",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );

    expect(first.document).toMatchObject({
      teamId: "team_1",
      title: "Receipt June",
      status: "uploading",
    });
    expect(first.version).toMatchObject({
      fileName: "Receipt June.pdf",
      contentType: "application/pdf",
      status: "pending_upload",
    });
    expect(first.version.objectKey).toContain(`/documents/${first.document.id}/versions/`);
    expect(first.uploadUrl).toContain(first.version.id);
    expect(replayed).toMatchObject({ replayed: true, document: { id: first.document.id } });
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.outboxEvents).toHaveLength(0);
  });

  test("completes uploads by updating metadata and emitting audit and outbox events", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");
    const prepared = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );

    const completed = await completeDocumentUpload(
      repository as unknown as DawnRepository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        byteSize: 7,
      },
    );

    expect(completed.document.status).toBe("uploaded");
    expect(completed.document.currentVersionId).toBe(prepared.version.id);
    expect(completed.version.status).toBe("uploaded");
    expect(completed.inboxItem).toMatchObject({
      documentId: prepared.document.id,
      documentVersionId: prepared.version.id,
      status: "pending_extraction",
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({ action: "document.uploaded" });
    expect(repository.outboxEvents).toHaveLength(1);
    expect(repository.outboxEvents[0]).toMatchObject({
      type: "document.uploaded",
      payload: { inboxItemId: completed.inboxItem.id, actorId: "user_1" },
    });
  });

  test("scopes download signing to document read permission", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");
    repository.memberships.set("user_2:team_1", "viewer");
    const prepared = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );
    await completeDocumentUpload(
      repository as unknown as DawnRepository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        byteSize: 7,
      },
    );

    const download = await createDocumentDownload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_2", type: "user" }, requestId: "request_3", teamId: "team_1" },
      { teamId: "team_1", documentId: prepared.document.id },
    );

    await expect(
      createDocumentDownload(
        repository as unknown as DawnRepository,
        signer,
        { actor: { id: "user_3", type: "user" }, requestId: "request_4", teamId: "team_1" },
        { teamId: "team_1", documentId: prepared.document.id },
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(download.downloadUrl).toContain(prepared.version.id);
  });
});
