import { describe, expect, test } from "bun:test";

import {
  correctDocumentExtraction,
  createDeterministicDocumentExtractor,
  requestDocumentExtractionRetry,
  runDocumentExtraction,
  runStoredDocumentExtraction,
  type BusinessDocument,
  type BusinessDocumentVersion,
  type DawnRepository,
  type DocumentExtraction,
  type DocumentExtractionAttempt,
  type DocumentExtractionConfidence,
  type DocumentExtractionFields,
  type DocumentExtractionSource,
  type DocumentIntelligenceProvider,
  type IdempotencyResult,
  type InboxItem,
  type InboxSource,
  type InboxSourceType,
} from "./index";

class MemoryInboxRepository {
  auditEvents: unknown[] = [];
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  extractionAttempts: DocumentExtractionAttempt[] = [];
  extractions = new Map<string, DocumentExtraction>();
  inboxItems = new Map<string, InboxItem>();
  inboxSources = new Map<string, InboxSource>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, "owner" | "viewer">();
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: { id: string }, teamId: string) {
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

  async listInboxItems(teamId: string) {
    return [...this.inboxItems.values()].filter((item) => item.teamId === teamId);
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
    const item: InboxItem = {
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
    source: Exclude<DocumentExtractionSource, "user_correction">;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
    createdByActorId: string;
  }) {
    const item = this.inboxItems.get(input.inboxItemId);

    if (!item) {
      throw new Error("missing inbox item");
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

  async createDocumentExtractionAttempt(
    input: Omit<DocumentExtractionAttempt, "id" | "createdAt"> & { attemptId: string },
  ) {
    const attempt: DocumentExtractionAttempt = {
      id: input.attemptId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      extractionId: input.extractionId,
      attemptNumber: input.attemptNumber,
      source: input.source,
      provider: input.provider,
      model: input.model,
      status: input.status,
      durationMs: input.durationMs,
      qualityScore: input.qualityScore,
      errorClass: input.errorClass,
      errorMessage: input.errorMessage,
      rawTextPresent: input.rawTextPresent,
      metadata: input.metadata,
      createdAt: "2026-06-15T10:01:00.000Z",
    };
    this.extractionAttempts.push(attempt);
    return attempt;
  }

  async listDocumentExtractionAttemptsForInboxItem(teamId: string, inboxItemId: string) {
    return this.extractionAttempts.filter(
      (attempt) => attempt.teamId === teamId && attempt.inboxItemId === inboxItemId,
    );
  }

  async createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }) {
    const item = this.inboxItems.get(input.inboxItemId);

    if (!item) {
      throw new Error("missing inbox item");
    }

    const extraction: DocumentExtraction = {
      id: input.extractionId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: item.documentId,
      documentVersionId: item.documentVersionId,
      extractionVersion: this.extractions.size + 1,
      source: "user_correction",
      status: "completed",
      fields: input.fields,
      confidence: input.confidence,
      rawText: item.latestExtraction?.rawText ?? null,
      error: null,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:03:00.000Z",
    };
    const updatedItem = { ...item, latestExtraction: extraction };
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

  async markDocumentExtractionPending(input: {
    teamId: string;
    inboxItemId: string;
    requestedAt: Date;
  }) {
    const item = this.inboxItems.get(input.inboxItemId);

    if (!item || item.teamId !== input.teamId) {
      throw new Error("Inbox item not found");
    }

    const updated = {
      ...item,
      status: "pending_extraction" as const,
      extractionStatus: "pending" as const,
      updatedAt: input.requestedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }
}

describe("inbox extraction use cases", () => {
  test("runs deterministic extraction and writes audit and outbox events", async () => {
    const repository = seededRepository();

    const result = await runDocumentExtraction(
      repository as unknown as DawnRepository,
      createDeterministicDocumentExtractor(),
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "Acme Supplies\nReceipt R-100\nDate 2026-06-14\nTotal USD 42.50",
        idempotencyKey: "extract_1",
      },
    );

    expect(result.inboxItem).toMatchObject({
      status: "needs_review",
      extractionStatus: "completed",
    });
    expect(result.extraction.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      issuedAt: "2026-06-14",
      totalAmountMinor: 4250,
      currency: "USD",
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({ action: "document.extracted" });
    expect(repository.outboxEvents).toHaveLength(1);
    expect(repository.outboxEvents[0]).toMatchObject({ type: "document.extracted" });
  });

  test("runs stored document extraction through an app-owned storage adapter", async () => {
    const repository = seededRepository();
    const reads: string[] = [];
    const providerInputs: Array<{
      fileName: string;
      contentType: string;
      byteSize: number;
      bodyByteLength: number;
    }> = [];
    const body = new TextEncoder().encode("Acme Supplies\nReceipt R-100\nTotal USD 42.50").buffer;

    const result = await runStoredDocumentExtraction(
      repository as unknown as DawnRepository,
      {
        async readDocument(input) {
          reads.push(input.objectKey);
          return {
            body,
            contentType: "text/plain",
            byteSize: body.byteLength,
          };
        },
      },
      {
        source: "local_deterministic",
        async extract(input) {
          providerInputs.push({
            fileName: input.fileName,
            contentType: input.contentType,
            byteSize: input.byteSize,
            bodyByteLength: input.body?.byteLength ?? 0,
          });
          return createDeterministicDocumentExtractor().extract({
            ...input,
            rawText: new TextDecoder("utf-8").decode(input.body ?? new ArrayBuffer(0)),
          });
        },
      },
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        idempotencyKey: "extract_1",
      },
    );
    const replay = await runStoredDocumentExtraction(
      repository as unknown as DawnRepository,
      {
        async readDocument() {
          throw new Error("storage should not be read on replay");
        },
      },
      {
        source: "local_deterministic",
        async extract() {
          throw new Error("provider should not run on replay");
        },
      },
      { actor: { id: "user_1", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        idempotencyKey: "extract_1",
      },
    );

    expect(reads).toEqual(["teams/team_1/documents/doc_1/versions/ver_1/receipt.txt"]);
    expect(providerInputs).toEqual([
      {
        fileName: "receipt.txt",
        contentType: "text/plain",
        byteSize: body.byteLength,
        bodyByteLength: body.byteLength,
      },
    ]);
    expect(result.extraction.fields).toMatchObject({
      merchantName: "Acme Supplies",
      totalAmountMinor: 4250,
      currency: "USD",
    });
    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
  });

  test("marks stored document extraction failed when the stored object is unavailable", async () => {
    const repository = seededRepository();

    await expect(
      runStoredDocumentExtraction(
        repository as unknown as DawnRepository,
        {
          async readDocument() {
            return null;
          },
        },
        createDeterministicDocumentExtractor(),
        { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
        {
          teamId: "team_1",
          inboxItemId: "inbox_1",
          documentId: "doc_1",
          versionId: "ver_1",
          idempotencyKey: "extract_1",
        },
      ),
    ).rejects.toThrow("Document object not found");
    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "failed",
    });
    expect(repository.auditEvents).toEqual([]);
    expect(repository.outboxEvents).toEqual([]);
  });

  test("queues a failed extraction retry and marks the inbox item pending", async () => {
    const repository = seededRepository();

    await repository.markDocumentExtractionFailed({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      error: "OCR provider timed out",
      failedAt: new Date("2026-06-15T10:05:00.000Z"),
    });

    const result = await requestDocumentExtractionRetry(
      repository as unknown as DawnRepository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_retry", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        idempotencyKey: "retry_extract_1",
      },
    );

    expect(result.inboxItem).toMatchObject({
      id: "inbox_1",
      status: "pending_extraction",
      extractionStatus: "pending",
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "document_extraction.retry_requested",
      metadata: {
        documentId: "doc_1",
        versionId: "ver_1",
      },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "document_extraction.retry_requested",
      payload: {
        documentId: "doc_1",
        versionId: "ver_1",
        inboxItemId: "inbox_1",
        actorId: "user_1",
      },
    });
  });

  test("repairs missing critical receipt fields once before persistence", async () => {
    const repository = seededRepository();
    const repairInputs: unknown[] = [];
    const provider: DocumentIntelligenceProvider = {
      source: "tanstack_ai",
      async extract() {
        return {
          fields: {
            documentType: "receipt",
            merchantName: "Acme Supplies",
            issuedAt: "2026-06-14",
            totalAmountMinor: 4250,
          },
          confidence: {
            merchantName: 0.92,
            issuedAt: 0.9,
            totalAmountMinor: 0.93,
          },
          rawText: "Acme Supplies\nDate 2026-06-14\nTotal 42.50",
        };
      },
      async repair(input) {
        repairInputs.push(input);
        return {
          fields: {
            currency: "usd",
          },
          confidence: {
            currency: 0.88,
          },
        };
      },
    };

    const result = await runDocumentExtraction(
      repository as unknown as DawnRepository,
      provider,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "Acme Supplies\nDate 2026-06-14\nTotal 42.50",
        idempotencyKey: "extract_repair_currency",
      },
    );

    expect(repairInputs).toHaveLength(1);
    expect(repairInputs[0]).toMatchObject({
      missingFields: ["currency"],
    });
    expect(result.extraction.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      issuedAt: "2026-06-14",
      totalAmountMinor: 4250,
      currency: "USD",
    });
    expect(result.extraction.confidence.overall).toBeGreaterThanOrEqual(0.8);
  });

  test("validates bad dates currency and amounts before persistence", async () => {
    const repository = seededRepository();
    const provider: DocumentIntelligenceProvider = {
      source: "tanstack_ai",
      async extract() {
        return {
          fields: {
            documentType: "receipt",
            merchantName: "Acme Supplies",
            issuedAt: "06/14/2026",
            totalAmountMinor: -4250,
            currency: "US dollars",
            taxAmountMinor: 5000,
          },
          confidence: {
            merchantName: 0.9,
            issuedAt: 0.9,
            totalAmountMinor: 0.9,
            currency: 0.9,
            taxAmountMinor: 0.9,
          },
          rawText: "bad receipt",
        };
      },
    };

    const result = await runDocumentExtraction(
      repository as unknown as DawnRepository,
      provider,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "bad receipt",
        idempotencyKey: "extract_invalid_fields",
      },
    );

    expect(result.extraction.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      issuedAt: null,
      totalAmountMinor: null,
      currency: null,
      taxAmountMinor: null,
    });
    expect(result.extraction.confidence).not.toHaveProperty("issuedAt");
    expect(result.extraction.confidence).not.toHaveProperty("totalAmountMinor");
    expect(result.extraction.confidence.overall).toBeLessThan(0.75);
  });

  test("low field confidence lowers overall extraction confidence", async () => {
    const repository = seededRepository();
    const provider: DocumentIntelligenceProvider = {
      source: "tanstack_ai",
      async extract() {
        return {
          fields: {
            documentType: "receipt",
            merchantName: "Acme Supplies",
            issuedAt: "2026-06-14",
            totalAmountMinor: 4250,
            currency: "USD",
          },
          confidence: {
            merchantName: 0.92,
            issuedAt: 0.9,
            totalAmountMinor: 0.2,
            currency: 0.93,
          },
          rawText: "Acme Supplies\nDate 2026-06-14\nTotal USD 42.50 or 24.50",
        };
      },
    };

    const result = await runDocumentExtraction(
      repository as unknown as DawnRepository,
      provider,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "Acme Supplies\nDate 2026-06-14\nTotal USD 42.50 or 24.50",
        idempotencyKey: "extract_ambiguous_total",
      },
    );

    expect(result.extraction.confidence).toMatchObject({
      totalAmountMinor: 0.2,
    });
    expect(result.extraction.confidence.overall).toBeLessThan(0.75);
  });

  test("records redacted provider attempts without losing final extraction", async () => {
    const repository = seededRepository();
    const provider: DocumentIntelligenceProvider = {
      source: "tanstack_ai",
      async extract() {
        return {
          fields: {
            documentType: "receipt",
            merchantName: "Acme Supplies",
            issuedAt: "2026-06-14",
            totalAmountMinor: 4250,
            currency: "USD",
          },
          confidence: {
            merchantName: 0.92,
            issuedAt: 0.9,
            totalAmountMinor: 0.93,
            currency: 0.88,
          },
          rawText: "Acme Supplies\nTotal USD 42.50",
          metadata: {
            provider: "gemini",
            model: "gemini-3.1-pro-preview",
            attempts: [
              {
                attempt: 1,
                provider: "gemini",
                model: "gemini-3.1-pro-preview",
                status: "completed",
                durationMs: 42,
                metadata: {
                  promptTokens: 120,
                  rawPayload: { fullText: "sensitive" },
                  apiKey: "secret",
                },
              },
            ],
          },
        };
      },
    };

    const result = await runDocumentExtraction(
      repository as unknown as DawnRepository,
      provider,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "Acme Supplies\nTotal USD 42.50",
        idempotencyKey: "extract_attempt_success",
      },
    );

    expect(result.extraction.fields).toMatchObject({
      merchantName: "Acme Supplies",
      totalAmountMinor: 4250,
    });
    expect(repository.extractionAttempts).toEqual([
      expect.objectContaining({
        extractionId: result.extraction.id,
        attemptNumber: 1,
        source: "tanstack_ai",
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
        status: "completed",
        durationMs: 42,
        qualityScore: expect.any(Number),
        rawTextPresent: true,
        metadata: { promptTokens: 120 },
      }),
    ]);
  });

  test("records failed cascade attempts before marking extraction failed", async () => {
    const repository = seededRepository();
    const error = Object.assign(
      new Error("Document extraction failed for every configured model"),
      {
        attempts: [
          {
            attempt: 1,
            provider: "gemini",
            model: "gemini-3.1-pro-preview",
            status: "failed",
            durationMs: 50,
            errorClass: "DocumentExtractionTimeoutError",
            errorMessage: "Document extraction timed out after 50ms",
            metadata: {
              rawPayload: { providerBody: "sensitive" },
              secret: "redacted",
              retryable: true,
            },
          },
        ],
      },
    );
    const provider: DocumentIntelligenceProvider = {
      source: "tanstack_ai",
      async extract() {
        throw error;
      },
    };

    await expect(
      runDocumentExtraction(
        repository as unknown as DawnRepository,
        provider,
        { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
        {
          teamId: "team_1",
          inboxItemId: "inbox_1",
          documentId: "doc_1",
          versionId: "ver_1",
          rawText: "Acme Supplies\nTotal USD 42.50",
          idempotencyKey: "extract_attempt_failure",
        },
      ),
    ).rejects.toThrow("Document extraction failed for every configured model");

    expect(repository.inboxItems.get("inbox_1")).toMatchObject({
      status: "needs_review",
      extractionStatus: "failed",
    });
    expect(repository.extractionAttempts).toEqual([
      expect.objectContaining({
        extractionId: null,
        attemptNumber: 1,
        source: "tanstack_ai",
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
        status: "failed",
        errorClass: "DocumentExtractionTimeoutError",
        errorMessage: "Document extraction timed out after 50ms",
        metadata: { retryable: true },
      }),
    ]);
  });

  test("persists user corrections as a new extraction version", async () => {
    const repository = seededRepository();
    repository.memberships.set("user_2:team_1", "owner");
    await runDocumentExtraction(
      repository as unknown as DawnRepository,
      createDeterministicDocumentExtractor(),
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        rawText: "Acme Supplies\nTotal USD 42.50",
        idempotencyKey: "extract_1",
      },
    );

    const corrected = await correctDocumentExtraction(
      repository as unknown as DawnRepository,
      { actor: { id: "user_2", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        fields: {
          merchantName: "Acme Supply Co",
          totalAmountMinor: 4300,
          currency: "USD",
        },
        idempotencyKey: "correct_1",
      },
    );

    expect(corrected.extraction).toMatchObject({
      extractionVersion: 2,
      source: "user_correction",
      fields: { merchantName: "Acme Supply Co", totalAmountMinor: 4300 },
    });
    expect(corrected.extraction.confidence).toMatchObject({
      merchantName: 1,
      totalAmountMinor: 1,
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "document_extraction.corrected",
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "document_extraction.corrected",
    });
  });

  test("rejects extraction corrections without write permission", async () => {
    const repository = seededRepository();
    repository.memberships.set("user_2:team_1", "viewer");

    await expect(
      correctDocumentExtraction(
        repository as unknown as DawnRepository,
        { actor: { id: "user_2", type: "user" }, requestId: "request_2", teamId: "team_1" },
        {
          teamId: "team_1",
          inboxItemId: "inbox_1",
          fields: { merchantName: "Blocked" },
          idempotencyKey: "correct_1",
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot correct extraction results for this team",
    });
  });
});

function seededRepository() {
  const repository = new MemoryInboxRepository();
  repository.memberships.set("user_1:team_1", "owner");
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
  repository.inboxSources.set("source_1", {
    id: "source_1",
    teamId: "team_1",
    type: "document_upload",
    name: "Document uploads",
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
