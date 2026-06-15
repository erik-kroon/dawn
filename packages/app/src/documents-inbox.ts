import type {
  InboxMatchConfidence,
  InboxMatchCandidate,
  InboxMatchSuggestion,
  TeamMatchAlias,
  TeamMatchFeedback,
  Transaction,
} from "@dawn/domain";
import { calibrateMatchPolicy, suggestInboxTransactionMatches } from "@dawn/domain";

import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type BusinessDocumentStatus = "uploading" | "uploaded";

export type BusinessDocumentVersionStatus = "pending_upload" | "uploaded";

export type BusinessDocumentVersion = {
  id: string;
  documentId: string;
  teamId: string;
  versionNumber: number;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string | null;
  status: BusinessDocumentVersionStatus;
  uploadedAt?: string | null;
  createdAt: string;
};

export type BusinessDocument = {
  id: string;
  teamId: string;
  title: string;
  status: BusinessDocumentStatus;
  currentVersionId?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
  currentVersion?: BusinessDocumentVersion | null;
};

export type InboxSourceType = "document_upload" | "email_forward";

export type InboxSource = {
  id: string;
  teamId: string;
  type: InboxSourceType;
  name: string;
  createdAt: string;
};

export type InboxItemStatus = "pending_extraction" | "needs_review" | "resolved";

export type InboxItem = {
  id: string;
  teamId: string;
  sourceId: string;
  sourceType: InboxSourceType;
  documentId: string;
  documentVersionId: string;
  status: InboxItemStatus;
  extractionStatus: "pending" | "completed" | "failed";
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
  source?: InboxSource | null;
  document?: BusinessDocument | null;
  latestExtraction?: DocumentExtraction | null;
  matchSuggestions?: InboxTransactionMatchSuggestion[];
};

export type InboxTransactionMatchStatus = "suggested" | "accepted" | "rejected";

export type InboxTransactionMatchSuggestion = {
  id: string;
  teamId: string;
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  status: InboxTransactionMatchStatus;
  createdAt: string;
  updatedAt: string;
  transaction?: Transaction | null;
};

export type TeamAlias = TeamMatchAlias & {
  id: string;
  teamId: string;
  createdAt: string;
};

export type MatchFeedback = TeamMatchFeedback & {
  teamId: string;
};

export type HardNegativeTransactionMatch = {
  id: string;
  teamId: string;
  inboxItemId: string;
  transactionId: string;
  reason?: string | null;
  createdAt: string;
};

export type DocumentType =
  | "receipt"
  | "invoice_received"
  | "invoice_sent"
  | "bank_statement"
  | "contract"
  | "tax_document"
  | "other";

export type DocumentExtractionFields = {
  documentType?: DocumentType | null;
  merchantName?: string | null;
  customerName?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  invoiceNumber?: string | null;
  totalAmountMinor?: number | null;
  currency?: string | null;
  taxAmountMinor?: number | null;
};

export type DocumentExtractionConfidence = Partial<Record<keyof DocumentExtractionFields, number>>;

export type DocumentExtractionStatus = "completed" | "failed";

export type DocumentExtractionSource = "local_deterministic" | "user_correction";

export type DocumentExtraction = {
  id: string;
  teamId: string;
  inboxItemId: string;
  documentId: string;
  documentVersionId: string;
  extractionVersion: number;
  source: DocumentExtractionSource;
  status: DocumentExtractionStatus;
  fields: DocumentExtractionFields;
  confidence: DocumentExtractionConfidence;
  rawText?: string | null;
  error?: string | null;
  createdByActorId: string;
  createdAt: string;
};

export type RunDocumentExtractionCommand = {
  teamId: string;
  inboxItemId: string;
  documentId: string;
  versionId: string;
  rawText: string;
  idempotencyKey: string;
};

export type RunStoredDocumentExtractionCommand = Omit<RunDocumentExtractionCommand, "rawText">;

export type DocumentExtractionTextStorage = {
  readText(input: {
    objectKey: string;
    teamId: string;
    documentId: string;
    versionId: string;
    fileName: string;
    contentType: string;
  }): Promise<string | null>;
};

export type RunDocumentExtractionResult = {
  inboxItem: InboxItem;
  extraction: DocumentExtraction;
  replayed: boolean;
};

export type CorrectDocumentExtractionCommand = {
  teamId: string;
  inboxItemId: string;
  fields: DocumentExtractionFields;
  idempotencyKey: string;
};

export type CorrectDocumentExtractionResult = {
  inboxItem: InboxItem;
  extraction: DocumentExtraction;
  replayed: boolean;
};

export type GenerateInboxMatchSuggestionsCommand = {
  teamId: string;
  inboxItemId: string;
  limit?: number;
};

export type GenerateInboxMatchSuggestionsResult = {
  inboxItemId: string;
  suggestions: InboxTransactionMatchSuggestion[];
};

export type MatchPendingInboxForTransactionCommand = {
  teamId: string;
  transactionId: string;
  sourceOutboxEventId: string;
  idempotencyKey: string;
  limit?: number;
  enforceCallerPermission?: boolean;
};

export type MatchPendingInboxForTransactionResult = {
  transactionId: string;
  suggestions: InboxTransactionMatchSuggestion[];
  replayed: boolean;
};

export type AcceptInboxMatchCommand = {
  teamId: string;
  suggestionId: string;
  idempotencyKey: string;
};

export type AcceptInboxMatchResult = {
  suggestion: InboxTransactionMatchSuggestion;
  inboxItem: InboxItem;
  replayed: boolean;
};

export type RejectInboxMatchCommand = {
  teamId: string;
  suggestionId: string;
  reason?: string | null;
  idempotencyKey: string;
};

export type RejectInboxMatchResult = {
  suggestion: InboxTransactionMatchSuggestion;
  replayed: boolean;
};

export type DocumentExtractionProvider = {
  source: Exclude<DocumentExtractionSource, "user_correction">;
  extract(input: { fileName: string; contentType: string; rawText: string }): Promise<{
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
  }>;
};

export type CreateDocumentUploadCommand = {
  teamId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string | null;
  idempotencyKey: string;
};

export type CreateDocumentUploadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  uploadUrl: string;
  uploadExpiresAt: string;
  replayed: boolean;
};

export type CompleteDocumentUploadCommand = {
  teamId: string;
  documentId: string;
  versionId: string;
  byteSize: number;
  checksumSha256?: string | null;
};

export type CompleteDocumentUploadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  inboxItem: InboxItem;
};

export type CreateDocumentDownloadCommand = {
  teamId: string;
  documentId: string;
};

export type CreateDocumentDownloadResult = {
  document: BusinessDocument;
  version: BusinessDocumentVersion;
  downloadUrl: string;
  downloadExpiresAt: string;
};

export type DocumentUrlSigner = {
  createUploadUrl(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    actorId: string;
    requestId: string;
  }): Promise<{ url: string; expiresAt: string }>;
  createDownloadUrl(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: string }>;
};

export type DocumentRepository = {
  listDocuments(teamId: string): Promise<BusinessDocument[]>;
  createDocumentUploadRecord(input: {
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
  }): Promise<{ document: BusinessDocument; version: BusinessDocumentVersion }>;
  getDocumentForTeam(teamId: string, documentId: string): Promise<BusinessDocument | null>;
  getDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<BusinessDocumentVersion | null>;
  completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }): Promise<{ document: BusinessDocument; version: BusinessDocumentVersion }>;
};

export type InboxRepository = {
  listInboxItems(teamId: string): Promise<InboxItem[]>;
  createInboxItemForDocumentUpload(input: {
    inboxItemId: string;
    sourceId: string;
    teamId: string;
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }): Promise<InboxItem>;
  ensureInboxSource(input: {
    sourceId: string;
    teamId: string;
    type: InboxSourceType;
    name: string;
  }): Promise<InboxSource>;
  getInboxItemForTeam(teamId: string, inboxItemId: string): Promise<InboxItem | null>;
  createDocumentExtraction(input: {
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
  }): Promise<{ inboxItem: InboxItem; extraction: DocumentExtraction }>;
  createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }): Promise<{ inboxItem: InboxItem; extraction: DocumentExtraction }>;
  markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }): Promise<InboxItem>;
  listTeamAliases(teamId: string): Promise<TeamAlias[]>;
  listTeamMatchFeedback(teamId: string): Promise<MatchFeedback[]>;
  listHardNegativeMatches(
    teamId: string,
    inboxItemId: string,
  ): Promise<HardNegativeTransactionMatch[]>;
  listTransactionMatchCandidatesForInboxItem(input: {
    teamId: string;
    inboxItem: InboxItem;
    limit: number;
  }): Promise<InboxMatchCandidate[]>;
  listInboxMatchCandidatesForTransaction(input: {
    teamId: string;
    transaction: Transaction;
    limit: number;
  }): Promise<InboxItem[]>;
  upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: InboxMatchSuggestion[];
  }): Promise<InboxTransactionMatchSuggestion[]>;
  getInboxMatchSuggestionForTeam(
    teamId: string,
    suggestionId: string,
  ): Promise<InboxTransactionMatchSuggestion | null>;
  acceptInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    actorId: string;
  }): Promise<{ suggestion: InboxTransactionMatchSuggestion; inboxItem: InboxItem }>;
  rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
    actorId: string;
  }): Promise<InboxTransactionMatchSuggestion>;
};
export type DocumentsInboxUseCaseRepository = TransactionReviewRepository &
  DocumentRepository &
  InboxRepository;

const createDocumentUploadOperation = "document.upload.create";
const runDocumentExtractionOperation = "document.extraction.run";
const correctDocumentExtractionOperation = "document.extraction.correct";
const matchPendingInboxForTransactionOperation = "inbox.match.pending_for_transaction";
const acceptInboxMatchOperation = "inbox.match.accept";
const rejectInboxMatchOperation = "inbox.match.reject";
const defaultMatchCandidateLimit = 25;
const maxMatchCandidateLimit = 100;

export async function listDocuments(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; documents: BusinessDocument[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "documents.read",
    "You cannot read documents for this team",
  );

  return {
    teamId: access.teamId,
    documents: await repository.listDocuments(access.teamId),
  };
}

export async function createDocumentUpload(
  repository: DocumentsInboxUseCaseRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateDocumentUploadCommand,
): Promise<CreateDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Document not found");

    await resolveTeamAccess(
      documentRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot upload documents for this team",
    );

    const normalized = normalizeDocumentUploadCommand(command);
    const fingerprint = createDocumentUploadFingerprint(normalized);
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createDocumentUploadOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different document upload",
        );
      }

      return { ...(replayed.result as CreateDocumentUploadResult), replayed: true };
    }

    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const objectKey = documentObjectKey(command.teamId, documentId, versionId, normalized.fileName);
    const { document, version } = await documentRepository.createDocumentUploadRecord({
      documentId,
      versionId,
      teamId: command.teamId,
      title: titleFromFileName(normalized.fileName),
      objectKey,
      fileName: normalized.fileName,
      contentType: normalized.contentType,
      byteSize: normalized.byteSize,
      checksumSha256: normalized.checksumSha256,
      createdByActorId: context.actor.id,
    });
    const upload = await signer.createUploadUrl({
      teamId: command.teamId,
      documentId,
      versionId,
      objectKey,
      fileName: normalized.fileName,
      contentType: normalized.contentType,
      byteSize: normalized.byteSize,
      actorId: context.actor.id,
      requestId: context.requestId,
    });
    const result = {
      document,
      version,
      uploadUrl: upload.url,
      uploadExpiresAt: upload.expiresAt,
      replayed: false,
    };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createDocumentUploadOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function completeDocumentUpload(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: CompleteDocumentUploadCommand,
): Promise<CompleteDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Document not found");

    const version = await documentRepository.getDocumentVersionForTeam(
      command.teamId,
      command.versionId,
    );

    if (!version || version.documentId !== command.documentId) {
      throw new AppError("NOT_FOUND", "Document upload not found");
    }

    const result = await documentRepository.completeDocumentVersionUpload({
      teamId: command.teamId,
      documentId: command.documentId,
      versionId: command.versionId,
      byteSize: command.byteSize,
      checksumSha256: command.checksumSha256 ?? version.checksumSha256 ?? null,
      uploadedAt: new Date(),
    });
    const source = await documentRepository.ensureInboxSource({
      sourceId: crypto.randomUUID(),
      teamId: command.teamId,
      type: "document_upload",
      name: "Document uploads",
    });
    const inboxItem = await documentRepository.createInboxItemForDocumentUpload({
      inboxItemId: crypto.randomUUID(),
      sourceId: source.id,
      teamId: command.teamId,
      documentId: command.documentId,
      documentVersionId: command.versionId,
      createdByActorId: context.actor.id,
    });

    await documentRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "document.uploaded",
      entityType: "document",
      entityId: command.documentId,
      metadata: {
        versionId: command.versionId,
        fileName: result.version.fileName,
        contentType: result.version.contentType,
        byteSize: command.byteSize,
      },
    });

    await documentRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "document.uploaded",
      version: 1,
      payload: {
        documentId: command.documentId,
        versionId: command.versionId,
        inboxItemId: inboxItem.id,
        actorId: context.actor.id,
      },
    });

    return { ...result, inboxItem };
  });
}

export async function createDocumentDownload(
  repository: DocumentsInboxUseCaseRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateDocumentDownloadCommand,
): Promise<CreateDocumentDownloadResult> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "documents.read",
    "You cannot download documents for this team",
  );
  const document = await repository.getDocumentForTeam(access.teamId, command.documentId);

  if (!document?.currentVersion || document.status !== "uploaded") {
    throw new AppError("NOT_FOUND", "Document not found");
  }

  const download = await signer.createDownloadUrl({
    teamId: access.teamId,
    documentId: document.id,
    versionId: document.currentVersion.id,
    objectKey: document.currentVersion.objectKey,
    fileName: document.currentVersion.fileName,
    contentType: document.currentVersion.contentType,
  });

  return {
    document,
    version: document.currentVersion,
    downloadUrl: download.url,
    downloadExpiresAt: download.expiresAt,
  };
}

export async function listInboxItems(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; inboxItems: InboxItem[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "documents.read",
    "You cannot read inbox items for this team",
  );

  return {
    teamId: access.teamId,
    inboxItems: await repository.listInboxItems(access.teamId),
  };
}

export async function runStoredDocumentExtraction(
  repository: DocumentsInboxUseCaseRepository,
  storage: DocumentExtractionTextStorage,
  extractor: DocumentExtractionProvider,
  context: TransactionReviewContext,
  command: RunStoredDocumentExtractionCommand,
): Promise<RunDocumentExtractionResult> {
  const fingerprint = documentExtractionFingerprint(command, extractor);
  const replayed = await repository.getIdempotencyResult(
    command.teamId,
    context.actor.id,
    runDocumentExtractionOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for a different document extraction",
      );
    }

    return { ...(replayed.result as RunDocumentExtractionResult), replayed: true };
  }

  const version = await repository.getDocumentVersionForTeam(command.teamId, command.versionId);

  if (!version || version.documentId !== command.documentId) {
    throw new Error("Document version not found");
  }

  const rawText = await storage.readText({
    objectKey: version.objectKey,
    teamId: command.teamId,
    documentId: command.documentId,
    versionId: command.versionId,
    fileName: version.fileName,
    contentType: version.contentType,
  });

  if (rawText == null) {
    throw new Error("Document object not found");
  }

  return runDocumentExtraction(repository, extractor, context, {
    ...command,
    rawText,
  });
}

export async function runDocumentExtraction(
  repository: DocumentsInboxUseCaseRepository,
  extractor: DocumentExtractionProvider,
  context: TransactionReviewContext,
  command: RunDocumentExtractionCommand,
): Promise<RunDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    const fingerprint = documentExtractionFingerprint(command, extractor);
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      runDocumentExtractionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different document extraction",
        );
      }

      return { ...(replayed.result as RunDocumentExtractionResult), replayed: true };
    }

    const [inboxItem, document, version] = await Promise.all([
      inboxRepository.getInboxItemForTeam(command.teamId, command.inboxItemId),
      inboxRepository.getDocumentForTeam(command.teamId, command.documentId),
      inboxRepository.getDocumentVersionForTeam(command.teamId, command.versionId),
    ]);

    if (
      !inboxItem ||
      inboxItem.documentId !== command.documentId ||
      inboxItem.documentVersionId !== command.versionId ||
      !document ||
      !version ||
      version.documentId !== command.documentId
    ) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    try {
      const extracted = await extractor.extract({
        fileName: version.fileName,
        contentType: version.contentType,
        rawText: command.rawText,
      });
      const result = await inboxRepository.createDocumentExtraction({
        extractionId: crypto.randomUUID(),
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        documentId: command.documentId,
        documentVersionId: command.versionId,
        source: extractor.source,
        fields: normalizeDocumentExtractionFields(extracted.fields),
        confidence: normalizeDocumentExtractionConfidence(extracted.confidence),
        rawText: extracted.rawText ?? command.rawText,
        createdByActorId: context.actor.id,
      });

      await inboxRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "document.extracted",
        entityType: "inbox_item",
        entityId: inboxItem.id,
        metadata: {
          documentId: command.documentId,
          versionId: command.versionId,
          extractionId: result.extraction.id,
          provider: extractor.source,
        },
      });

      await inboxRepository.appendOutboxEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: "document.extracted",
        version: 1,
        payload: {
          inboxItemId: inboxItem.id,
          documentId: command.documentId,
          versionId: command.versionId,
          extractionId: result.extraction.id,
        },
      });

      const finalResult = { ...result, replayed: false };

      await inboxRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: runDocumentExtractionOperation,
        key: command.idempotencyKey,
        fingerprint,
        result: finalResult,
      });

      return finalResult;
    } catch (error) {
      await inboxRepository.markDocumentExtractionFailed({
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        error: errorMessage(error),
        failedAt: new Date(),
      });
      throw error;
    }
  });
}

function documentExtractionFingerprint(
  command: RunStoredDocumentExtractionCommand,
  extractor: DocumentExtractionProvider,
) {
  return JSON.stringify({
    teamId: command.teamId,
    inboxItemId: command.inboxItemId,
    documentId: command.documentId,
    versionId: command.versionId,
    extractor: extractor.source,
  });
}

export async function correctDocumentExtraction(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: CorrectDocumentExtractionCommand,
): Promise<CorrectDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot correct extraction results for this team",
    );

    const normalizedFields = normalizeDocumentExtractionFields(command.fields);
    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      fields: normalizedFields,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      correctDocumentExtractionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different extraction correction",
        );
      }

      return { ...(replayed.result as CorrectDocumentExtractionResult), replayed: true };
    }

    const inboxItem = await inboxRepository.getInboxItemForTeam(
      command.teamId,
      command.inboxItemId,
    );

    if (!inboxItem) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    const result = await inboxRepository.createCorrectedDocumentExtraction({
      extractionId: crypto.randomUUID(),
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      fields: normalizedFields,
      confidence: correctionConfidence(normalizedFields),
      createdByActorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "document_extraction.corrected",
      entityType: "inbox_item",
      entityId: command.inboxItemId,
      metadata: {
        extractionId: result.extraction.id,
        fields: Object.keys(normalizedFields),
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "document_extraction.corrected",
      version: 1,
      payload: {
        inboxItemId: command.inboxItemId,
        extractionId: result.extraction.id,
      },
    });

    const finalResult = { ...result, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: correctDocumentExtractionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function generateInboxMatchSuggestions(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: GenerateInboxMatchSuggestionsCommand,
): Promise<GenerateInboxMatchSuggestionsResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "documents.read",
    "You cannot read inbox items for this team",
  );
  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "transactions.read",
    "You cannot read transactions for this team",
  );

  const [inboxItem, aliases, feedback, hardNegatives] = await Promise.all([
    repository.getInboxItemForTeam(command.teamId, command.inboxItemId),
    repository.listTeamAliases(command.teamId),
    repository.listTeamMatchFeedback(command.teamId),
    repository.listHardNegativeMatches(command.teamId, command.inboxItemId),
  ]);

  if (!inboxItem || !inboxItem.latestExtraction) {
    throw new AppError("NOT_FOUND", "Inbox item not found");
  }

  const candidates = await repository.listTransactionMatchCandidatesForInboxItem({
    teamId: command.teamId,
    inboxItem,
    limit: normalizeMatchCandidateLimit(command.limit),
  });
  const memory = {
    aliases,
    feedback,
    hardNegatives,
  };
  const policy = calibrateMatchPolicy(memory);
  const suggestions = suggestInboxTransactionMatches(
    {
      inboxItemId: inboxItem.id,
      documentId: inboxItem.documentId,
      sender: inboxItem.source?.name,
      documentText: inboxItem.latestExtraction.rawText,
      fields: inboxItem.latestExtraction.fields,
    },
    candidates,
    memory,
    policy,
  )
    .filter((suggestion) => suggestion.score >= policy.suggestedScoreThreshold)
    .slice(0, 5);

  return {
    inboxItemId: inboxItem.id,
    suggestions: await repository.upsertInboxMatchSuggestions({
      teamId: command.teamId,
      inboxItemId: inboxItem.id,
      suggestions,
    }),
  };
}

export async function matchPendingInboxForTransaction(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: MatchPendingInboxForTransactionCommand,
): Promise<MatchPendingInboxForTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Transaction not found");

    if (command.enforceCallerPermission !== false) {
      await resolveTeamAccess(
        inboxRepository,
        { ...context, teamId: command.teamId },
        "documents.read",
        "You cannot read inbox items for this team",
      );
      await resolveTeamAccess(
        inboxRepository,
        { ...context, teamId: command.teamId },
        "transactions.read",
        "You cannot read transactions for this team",
      );
    }

    const fingerprint = matchPendingInboxForTransactionFingerprint(command);
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      matchPendingInboxForTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different transaction matching job",
        );
      }

      return { ...(replayed.result as MatchPendingInboxForTransactionResult), replayed: true };
    }

    const transaction = await inboxRepository.getTransactionForTeam(
      command.teamId,
      command.transactionId,
    );

    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const limit = normalizeMatchCandidateLimit(command.limit);
    const [candidateInboxItems, aliases, feedback] = await Promise.all([
      inboxRepository.listInboxMatchCandidatesForTransaction({
        teamId: command.teamId,
        transaction,
        limit,
      }),
      inboxRepository.listTeamAliases(command.teamId),
      inboxRepository.listTeamMatchFeedback(command.teamId),
    ]);
    const persistedSuggestions: InboxTransactionMatchSuggestion[] = [];

    for (const inboxItem of candidateInboxItems) {
      if (!inboxItem.latestExtraction) {
        continue;
      }

      const hardNegatives = await inboxRepository.listHardNegativeMatches(
        command.teamId,
        inboxItem.id,
      );
      const memory = {
        aliases,
        feedback,
        hardNegatives,
      };
      const policy = calibrateMatchPolicy(memory);
      const [suggestion] = suggestInboxTransactionMatches(
        inboxMatchInputForItem(inboxItem),
        [
          {
            transaction,
            providerReference: transaction.providerTransactionId,
          },
        ],
        memory,
        policy,
      ).filter((candidate) => candidate.score >= policy.suggestedScoreThreshold);

      if (!suggestion) {
        continue;
      }

      const upserted = await inboxRepository.upsertInboxMatchSuggestions({
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        suggestions: [suggestion],
      });
      const persisted = upserted.find(
        (candidate) =>
          candidate.inboxItemId === inboxItem.id && candidate.transactionId === transaction.id,
      );

      if (persisted) {
        persistedSuggestions.push(persisted);
      }
    }

    const result = {
      transactionId: transaction.id,
      suggestions: persistedSuggestions,
      replayed: false,
    };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: matchPendingInboxForTransactionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function acceptInboxMatch(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: AcceptInboxMatchCommand,
): Promise<AcceptInboxMatchResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox match not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot accept inbox matches for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      acceptInboxMatchOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox match",
        );
      }

      return { ...(replayed.result as AcceptInboxMatchResult), replayed: true };
    }

    const existing = await inboxRepository.getInboxMatchSuggestionForTeam(
      command.teamId,
      command.suggestionId,
    );

    if (!existing) {
      throw new AppError("NOT_FOUND", "Inbox match not found");
    }

    if (existing.status === "rejected") {
      throw new AppError("CONFLICT", "Rejected inbox matches cannot be accepted");
    }

    const accepted = await inboxRepository.acceptInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      actorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "inbox_match.accepted",
      entityType: "inbox_item",
      entityId: accepted.inboxItem.id,
      metadata: {
        suggestionId: accepted.suggestion.id,
        transactionId: accepted.suggestion.transactionId,
        documentId: accepted.inboxItem.documentId,
        score: accepted.suggestion.score,
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox_match.accepted",
      version: 1,
      payload: {
        inboxItemId: accepted.inboxItem.id,
        suggestionId: accepted.suggestion.id,
        transactionId: accepted.suggestion.transactionId,
        documentId: accepted.inboxItem.documentId,
      },
    });

    const finalResult = { ...accepted, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: acceptInboxMatchOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function rejectInboxMatch(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: RejectInboxMatchCommand,
): Promise<RejectInboxMatchResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox match not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot reject inbox matches for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      reason: command.reason ?? null,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      rejectInboxMatchOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox match rejection",
        );
      }

      return { ...(replayed.result as RejectInboxMatchResult), replayed: true };
    }

    const existing = await inboxRepository.getInboxMatchSuggestionForTeam(
      command.teamId,
      command.suggestionId,
    );

    if (!existing) {
      throw new AppError("NOT_FOUND", "Inbox match not found");
    }

    if (existing.status === "accepted") {
      throw new AppError("CONFLICT", "Accepted inbox matches cannot be rejected");
    }

    const suggestion = await inboxRepository.rejectInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      reason: command.reason,
      actorId: context.actor.id,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "inbox_match.rejected",
      entityType: "inbox_item",
      entityId: suggestion.inboxItemId,
      metadata: {
        suggestionId: suggestion.id,
        transactionId: suggestion.transactionId,
        reason: command.reason ?? null,
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "inbox_match.rejected",
      version: 1,
      payload: {
        inboxItemId: suggestion.inboxItemId,
        suggestionId: suggestion.id,
        transactionId: suggestion.transactionId,
      },
    });

    const finalResult = { suggestion, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: rejectInboxMatchOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

function normalizeDocumentUploadCommand(command: CreateDocumentUploadCommand) {
  const fileName = command.fileName.trim();
  const contentType = command.contentType.trim().toLowerCase();

  if (!fileName) {
    throw new AppError("CONFLICT", "Document file name is required");
  }

  if (!contentType) {
    throw new AppError("CONFLICT", "Document content type is required");
  }

  if (!Number.isSafeInteger(command.byteSize) || command.byteSize <= 0) {
    throw new AppError("CONFLICT", "Document byte size is invalid");
  }

  return {
    teamId: command.teamId,
    fileName,
    contentType,
    byteSize: command.byteSize,
    checksumSha256: command.checksumSha256?.trim() || null,
    idempotencyKey: command.idempotencyKey,
  };
}

export function createDocumentUploadFingerprint(command: CreateDocumentUploadCommand) {
  const normalized = normalizeDocumentUploadCommand(command);

  return JSON.stringify({
    teamId: normalized.teamId,
    fileName: normalized.fileName,
    contentType: normalized.contentType,
    byteSize: normalized.byteSize,
    checksumSha256: normalized.checksumSha256,
  });
}

export function createDeterministicDocumentExtractor(): DocumentExtractionProvider {
  return {
    source: "local_deterministic",
    async extract(input) {
      const rawText = input.rawText.trim();
      const text = rawText || input.fileName;
      const fields = inferDocumentExtractionFields(text, input.fileName);

      return {
        fields,
        confidence: confidenceForExtractedFields(fields, rawText.length > 0),
        rawText,
      };
    },
  };
}

function inferDocumentExtractionFields(text: string, fileName: string): DocumentExtractionFields {
  const currencyMatch = text.match(/\b(USD|EUR|GBP|SEK|NOK|DKK)\b/i);
  const amountMatch = text.match(/(?:total|amount|paid|due)[^\d-]*(-?\d+(?:[.,]\d{1,2})?)/i);
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const invoiceMatch = text.match(/\b(?:invoice|receipt|ref)[\s#:]*([A-Z0-9-]{3,})\b/i);
  const merchantName =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^(total|amount|date|invoice)\b/i.test(line)) ??
    titleFromFileName(fileName);

  return normalizeDocumentExtractionFields({
    documentType: /invoice/i.test(text)
      ? "invoice_received"
      : /statement/i.test(text)
        ? "bank_statement"
        : /receipt/i.test(text) || amountMatch
          ? "receipt"
          : "other",
    merchantName,
    issuedAt: dateMatch?.[1] ?? null,
    invoiceNumber: invoiceMatch?.[1] ?? null,
    totalAmountMinor: amountMatch ? decimalAmountToMinor(amountMatch[1] ?? "0") : null,
    currency: currencyMatch?.[1]?.toUpperCase() ?? null,
  });
}

function normalizeDocumentExtractionFields(
  fields: DocumentExtractionFields,
): DocumentExtractionFields {
  return {
    documentType: fields.documentType ?? null,
    merchantName: normalizedOptionalText(fields.merchantName),
    customerName: normalizedOptionalText(fields.customerName),
    issuedAt: normalizedOptionalText(fields.issuedAt),
    dueAt: normalizedOptionalText(fields.dueAt),
    invoiceNumber: normalizedOptionalText(fields.invoiceNumber),
    totalAmountMinor:
      typeof fields.totalAmountMinor === "number" && Number.isSafeInteger(fields.totalAmountMinor)
        ? fields.totalAmountMinor
        : null,
    currency: normalizedOptionalText(fields.currency)?.toUpperCase() ?? null,
    taxAmountMinor:
      typeof fields.taxAmountMinor === "number" && Number.isSafeInteger(fields.taxAmountMinor)
        ? fields.taxAmountMinor
        : null,
  };
}

function normalizeDocumentExtractionConfidence(
  confidence: DocumentExtractionConfidence,
): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(confidence)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => [key, Math.max(0, Math.min(1, value ?? 0))]),
  ) as DocumentExtractionConfidence;
}

function confidenceForExtractedFields(
  fields: DocumentExtractionFields,
  hasRawText: boolean,
): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, hasRawText ? 0.72 : 0.35]),
  ) as DocumentExtractionConfidence;
}

function correctionConfidence(fields: DocumentExtractionFields): DocumentExtractionConfidence {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, 1]),
  ) as DocumentExtractionConfidence;
}

function inboxMatchInputForItem(inboxItem: InboxItem) {
  if (!inboxItem.latestExtraction) {
    throw new AppError("NOT_FOUND", "Inbox item not found");
  }

  return {
    inboxItemId: inboxItem.id,
    documentId: inboxItem.documentId,
    sender: inboxItem.source?.name,
    documentText: inboxItem.latestExtraction.rawText,
    fields: inboxItem.latestExtraction.fields,
  };
}

export function matchPendingInboxForTransactionFingerprint(
  command: MatchPendingInboxForTransactionCommand,
) {
  return JSON.stringify({
    teamId: command.teamId,
    transactionId: command.transactionId,
    sourceOutboxEventId: command.sourceOutboxEventId,
  });
}

function normalizeMatchCandidateLimit(limit: number | null | undefined) {
  if (!Number.isSafeInteger(limit) || !limit || limit <= 0) {
    return defaultMatchCandidateLimit;
  }

  return Math.min(limit, maxMatchCandidateLimit);
}

function normalizedOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function decimalAmountToMinor(value: string) {
  const normalized = value.replace(",", ".");
  const [major = "0", minor = ""] = normalized.split(".");
  const sign = major.trim().startsWith("-") ? -1 : 1;
  const majorDigits = major.replace(/[^0-9]/g, "");
  const minorDigits = minor
    .replace(/[^0-9]/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  return sign * (Number(majorDigits || "0") * 100 + Number(minorDigits || "0"));
}

function documentObjectKey(
  teamId: string,
  documentId: string,
  versionId: string,
  fileName: string,
) {
  return `teams/${teamId}/documents/${documentId}/versions/${versionId}/${safeObjectFileName(fileName)}`;
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || fileName;
}

function safeObjectFileName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "document"
  );
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
