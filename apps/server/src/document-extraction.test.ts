import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type {
  BusinessDocument,
  BusinessDocumentVersion,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  DocumentExtractionSource,
  DocumentIntelligenceInput,
  DocumentIntelligenceProvider,
  IdempotencyResult,
  InboxItem,
} from "@dawn/app";

import {
  createConfiguredStructuredDocumentExtractionProvider,
  createDefaultDocumentIntelligenceProvider,
  createMimeAwareDocumentIntelligenceProvider,
  processDocumentExtractionJob,
} from "./document-extraction";
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
    source: Exclude<DocumentExtractionSource, "user_correction">;
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
      status: "needs_review" as const,
      extractionStatus: "failed" as const,
      updatedAt: input.failedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }
}

describe("processDocumentExtractionJob", () => {
  test("configures an OpenAI-compatible document provider from environment", () => {
    expect(createConfiguredStructuredDocumentExtractionProvider({})).toBeNull();
    expect(
      createConfiguredStructuredDocumentExtractionProvider({ OPENAI_API_KEY: "test-key" }),
    ).toMatchObject({ source: "tanstack_ai" });
    expect(
      createDefaultDocumentIntelligenceProvider(undefined, { OPENAI_API_KEY: "test-key" }),
    ).toMatchObject({ source: "tanstack_ai" });
  });

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

  test("extracts readable PDF receipt text through the default document intelligence provider", async () => {
    const repository = seededRepository();
    repository.documentVersions.set("ver_1", {
      ...repository.documentVersions.get("ver_1")!,
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 512,
    });
    const storage = createMemoryDocumentObjectStorage();
    const body = await readablePdfReceipt();
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      body,
      contentType: "application/pdf",
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

    expect(result.extraction.rawText).toContain("Acme Supplies");
    expect(result.extraction.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      issuedAt: "2026-06-14",
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
    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "failed",
    });
  });

  test("routes PNG receipts through a configured OCR provider", async () => {
    const repository = seededRepository();
    repository.documentVersions.set("ver_1", {
      ...repository.documentVersions.get("ver_1")!,
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.png",
      fileName: "receipt.png",
      contentType: "image/png",
      byteSize: 4,
    });
    const storage = createMemoryDocumentObjectStorage();
    const calls: DocumentIntelligenceInput[] = [];
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.png",
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      contentType: "image/png",
    });

    const result = await processDocumentExtractionJob({
      repository: repository as unknown as DawnRepository,
      storage,
      documentIntelligenceProvider: createMimeAwareDocumentIntelligenceProvider({
        ocrProvider: createMockOcrProvider(calls),
      }),
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

    expect(calls[0]).toMatchObject({
      fileName: "receipt.png",
      contentType: "image/png",
      byteSize: 4,
      body: expect.any(ArrayBuffer),
    });
    expect(result.extraction).toMatchObject({
      source: "tanstack_ai",
      fields: {
        documentType: "receipt",
        merchantName: "Acme Vision",
        totalAmountMinor: 4250,
        currency: "USD",
      },
    });
  });

  test("routes JPEG and WebP receipts through OCR", async () => {
    const calls: DocumentIntelligenceInput[] = [];
    const provider = createMimeAwareDocumentIntelligenceProvider({
      ocrProvider: createMockOcrProvider(calls),
    });

    await provider.extract({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "receipt.jpg",
      fileName: "receipt.jpg",
      contentType: "image/jpeg",
      byteSize: 3,
      body: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    });
    await provider.extract({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "receipt.webp",
      fileName: "receipt.webp",
      contentType: "image/webp",
      byteSize: 4,
      body: new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer,
    });

    expect(calls.map((call) => call.contentType)).toEqual(["image/jpeg", "image/webp"]);
  });

  test("routes scanned PDFs with no readable text through OCR", async () => {
    const calls: DocumentIntelligenceInput[] = [];
    const provider = createMimeAwareDocumentIntelligenceProvider({
      textExtractor: {
        async extractText() {
          return { text: "", method: "pdf_text", totalPages: 1 };
        },
      },
      ocrProvider: createMockOcrProvider(calls),
    });

    const result = await provider.extract({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    });

    expect(calls[0]).toMatchObject({
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      body: expect.any(ArrayBuffer),
    });
    expect(result).toMatchObject({
      source: "tanstack_ai",
      fields: { documentType: "receipt", merchantName: "Acme Vision" },
    });
  });

  test("uses signed URLs for OCR inputs over the inline byte limit", async () => {
    const calls: DocumentIntelligenceInput[] = [];
    const provider = createMimeAwareDocumentIntelligenceProvider({
      inlineByteLimit: 2,
      createSignedUrl: async (input) => `https://signed.example/${input.objectKey}`,
      ocrProvider: createMockOcrProvider(calls),
    });

    await provider.extract({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.webp",
      fileName: "receipt.webp",
      contentType: "image/webp",
      byteSize: 3,
      body: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(calls[0]).toMatchObject({
      body: null,
      sourceUrl: "https://signed.example/teams/team_1/documents/doc_1/versions/ver_1/receipt.webp",
    });
  });

  test("keeps HEIC conversion behind an explicit adapter boundary", async () => {
    const provider = createMimeAwareDocumentIntelligenceProvider({
      ocrProvider: createMockOcrProvider([]),
    });

    await expect(
      provider.extract({
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        objectKey: "receipt.heic",
        fileName: "receipt.heic",
        contentType: "image/heic",
        byteSize: 4,
        body: new Uint8Array([1, 2, 3, 4]).buffer,
      }),
    ).rejects.toThrow("HEIC document conversion is not configured");
  });

  test("fails oversized documents before provider OCR", async () => {
    const repository = seededRepository();
    repository.documentVersions.set("ver_1", {
      ...repository.documentVersions.get("ver_1")!,
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.png",
      fileName: "receipt.png",
      contentType: "image/png",
      byteSize: 4,
    });
    const storage = createMemoryDocumentObjectStorage();
    const calls: DocumentIntelligenceInput[] = [];
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.png",
      body: new Uint8Array([1, 2, 3, 4]).buffer,
      contentType: "image/png",
    });

    await expect(
      processDocumentExtractionJob({
        repository: repository as unknown as DawnRepository,
        storage,
        documentIntelligenceProvider: createMimeAwareDocumentIntelligenceProvider({
          maxBytes: 3,
          ocrProvider: createMockOcrProvider(calls),
        }),
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
    ).rejects.toThrow("Document exceeds extraction size limit");
    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "failed",
    });
    expect(calls).toEqual([]);
  });

  test("fails unsupported binary objects into reviewable extraction state without match output", async () => {
    const repository = seededRepository();
    repository.documentVersions.set("ver_1", {
      ...repository.documentVersions.get("ver_1")!,
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.zip",
      fileName: "receipt.zip",
      contentType: "application/zip",
      byteSize: 4,
    });
    const storage = createMemoryDocumentObjectStorage();
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.zip",
      body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer,
      contentType: "application/zip",
    });

    await expect(
      processDocumentExtractionJob({
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
      }),
    ).rejects.toThrow("Document extraction is not configured for application/zip");
    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "failed",
    });
    expect(repository.outboxEvents).toEqual([]);
  });
});

async function readablePdfReceipt() {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 400]);
  const font = await document.embedFont(StandardFonts.Helvetica);

  page.drawText("Acme Supplies", { x: 40, y: 340, size: 14, font });
  page.drawText("Receipt R-100", { x: 40, y: 315, size: 12, font });
  page.drawText("Date 2026-06-14", { x: 40, y: 290, size: 12, font });
  page.drawText("Total USD 42.50", { x: 40, y: 265, size: 12, font });

  const bytes = await document.save();
  return Uint8Array.from(bytes).buffer;
}

function createMockOcrProvider(calls: DocumentIntelligenceInput[]): DocumentIntelligenceProvider {
  return {
    source: "tanstack_ai",
    async extract(input) {
      calls.push(input);
      return {
        source: "tanstack_ai",
        fields: {
          documentType: "receipt",
          merchantName: "Acme Vision",
          issuedAt: "2026-06-14",
          totalAmountMinor: 4250,
          currency: "USD",
        },
        confidence: {
          merchantName: 0.9,
          totalAmountMinor: 0.92,
          currency: 0.9,
        },
        rawText: "Acme Vision\nTotal USD 42.50",
      };
    },
  };
}

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
