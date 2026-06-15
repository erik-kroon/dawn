import { describe, expect, test } from "bun:test";
import type {
  BusinessDocument,
  BusinessDocumentVersion,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  IdempotencyResult,
  InboxItem,
} from "@dawn/app";

import { processDocumentExtractionJob } from "./document-extraction";
import { createMemoryDocumentObjectStorage } from "./document-storage";

class MemoryExtractionRepository {
  auditEvents: unknown[] = [];
  documentVersions = new Map<string, BusinessDocumentVersion>();
  documents = new Map<string, BusinessDocument>();
  extractions = new Map<string, DocumentExtraction>();
  inboxItems = new Map<string, InboxItem>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
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

  async getDocumentForTeam(teamId: string, documentId: string) {
    const document = this.documents.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.documentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
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
    const item = this.inboxItems.get(input.inboxItemId);

    if (!item) {
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
    const updatedItem: InboxItem = {
      ...item,
      status: "needs_review",
      extractionStatus: "completed",
      latestExtraction: extraction,
      updatedAt: "2026-06-15T10:02:00.000Z",
    };
    this.extractions.set(extraction.id, extraction);
    this.inboxItems.set(updatedItem.id, updatedItem);
    return { inboxItem: updatedItem, extraction };
  }

  async markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }) {
    const item = this.inboxItems.get(input.inboxItemId);

    if (!item || item.teamId !== input.teamId) {
      throw new Error(input.error);
    }

    const updated = {
      ...item,
      extractionStatus: "failed" as const,
      updatedAt: input.failedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }
}

describe("processDocumentExtractionJob", () => {
  test("extracts stored document text into an inbox item", async () => {
    const repository = seededRepository();
    const storage = createMemoryDocumentObjectStorage();
    const body = new TextEncoder().encode("Acme Supplies\nReceipt R-100\nTotal USD 42.50").buffer;
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.txt",
      body,
      contentType: "text/plain",
    });

    const result = await processDocumentExtractionJob({
      repository: repository as unknown as DawnRepository,
      storage,
      message: {
        type: "document.extract",
        teamId: "team_1",
        documentId: "doc_1",
        versionId: "ver_1",
        inboxItemId: "inbox_1",
        actorId: "user_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "document:extract:outbox_1",
      },
    });

    expect(result.extraction.fields).toMatchObject({
      merchantName: "Acme Supplies",
      totalAmountMinor: 4250,
      currency: "USD",
    });
    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "completed",
    });
  });

  test("fails when the queued document object is missing", async () => {
    const repository = seededRepository();

    await expect(
      processDocumentExtractionJob({
        repository: repository as unknown as DawnRepository,
        storage: createMemoryDocumentObjectStorage(),
        message: {
          type: "document.extract",
          teamId: "team_1",
          documentId: "doc_1",
          versionId: "ver_1",
          inboxItemId: "inbox_1",
          actorId: "user_1",
          sourceOutboxEventId: "outbox_1",
          idempotencyKey: "document:extract:outbox_1",
        },
      }),
    ).rejects.toThrow("Document object not found");
  });
});

function seededRepository() {
  const repository = new MemoryExtractionRepository();
  repository.documents.set("doc_1", {
    id: "doc_1",
    teamId: "team_1",
    title: "Receipt",
    status: "uploaded",
    currentVersionId: "ver_1",
    createdByActorId: "user_1",
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
  });
  repository.documentVersions.set("ver_1", {
    id: "ver_1",
    documentId: "doc_1",
    teamId: "team_1",
    versionNumber: 1,
    objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.txt",
    fileName: "receipt.txt",
    contentType: "text/plain",
    byteSize: 64,
    status: "uploaded",
    uploadedAt: "2026-06-15T10:00:00.000Z",
    createdAt: "2026-06-15T10:00:00.000Z",
  });
  repository.inboxItems.set("inbox_1", {
    id: "inbox_1",
    teamId: "team_1",
    sourceId: "source_1",
    sourceType: "document_upload",
    documentId: "doc_1",
    documentVersionId: "ver_1",
    status: "pending_extraction",
    extractionStatus: "pending",
    createdByActorId: "user_1",
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
  });
  return repository;
}
