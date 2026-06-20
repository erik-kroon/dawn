import type {
  InboxMatchConfidence,
  InboxMatchCandidate,
  InboxMatchSignalScores,
  InboxMatchSuggestion,
  MatchCalibration,
  MatchPolicy,
  MatchSignals,
  TeamMatchAlias,
  TeamMatchFeedback,
  Transaction,
} from "@dawn/domain";
import {
  calibrateMatchPolicy,
  deriveTransactionAccountantStatus,
  evaluateAutoMatch,
  suggestInboxTransactionMatches,
} from "@dawn/domain";

import {
  AppError,
  resolveTeamAccess,
  type TransactionAccountantLifecycleRepository,
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

export type InboxSourceType = "document_upload" | "email_forward" | "email_provider";

export type InboxSource = {
  id: string;
  teamId: string;
  type: InboxSourceType;
  name: string;
  createdAt: string;
};

export type InboxItemStatus = "pending_extraction" | "needs_review" | "resolved" | "dismissed";

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

export type InboxTransactionMatchStatus = "suggested" | "accepted" | "rejected" | "expired";

export type InboxTransactionMatchSuggestion = {
  id: string;
  teamId: string;
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  status: InboxTransactionMatchStatus;
  signals?: InboxMatchSignalScores;
  signalDetails?: MatchSignals;
  thresholds?: {
    suggested: number;
    autoMatch: number;
  };
  calibration?: MatchCalibration | null;
  matchType?: "suggested";
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
  baseAmountMinor?: number | null;
  baseCurrency?: string | null;
  taxAmountMinor?: number | null;
};

export type DocumentExtractionConfidence = Partial<
  Record<keyof DocumentExtractionFields | "overall", number>
>;

export type DocumentExtractionStatus = "completed" | "failed";

export type DocumentExtractionSource = "local_deterministic" | "tanstack_ai" | "user_correction";

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

export type DocumentExtractionAttemptStatus = "completed" | "failed";

export type DocumentExtractionAttempt = {
  id: string;
  teamId: string;
  inboxItemId: string;
  documentId: string;
  documentVersionId: string;
  extractionId?: string | null;
  attemptNumber: number;
  source: Exclude<DocumentExtractionSource, "user_correction">;
  provider?: string | null;
  model?: string | null;
  status: DocumentExtractionAttemptStatus;
  durationMs?: number | null;
  qualityScore?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  rawTextPresent: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RunDocumentExtractionCommand = {
  teamId: string;
  inboxItemId: string;
  documentId: string;
  versionId: string;
  rawText?: string | null;
  storedDocument?: StoredDocumentExtractionObject | null;
  idempotencyKey: string;
};

export type RunStoredDocumentExtractionCommand = Omit<
  RunDocumentExtractionCommand,
  "rawText" | "storedDocument"
>;

export type StoredDocumentExtractionObject = {
  body: ArrayBuffer;
  contentType?: string | null;
  byteSize?: number | null;
};

export type DocumentExtractionObjectStorage = {
  readDocument(input: {
    objectKey: string;
    teamId: string;
    documentId: string;
    versionId: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }): Promise<StoredDocumentExtractionObject | null>;
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

export type RequestDocumentExtractionRetryCommand = {
  teamId: string;
  inboxItemId: string;
  idempotencyKey: string;
};

export type RequestDocumentExtractionRetryResult = {
  inboxItem: InboxItem;
  replayed: boolean;
};

export type DismissInboxItemCommand = {
  teamId: string;
  inboxItemId: string;
  idempotencyKey: string;
};

export type DismissInboxItemResult = {
  inboxItem: InboxItem;
  replayed: boolean;
};

export type GenerateInboxMatchSuggestionsCommand = {
  teamId: string;
  inboxItemId: string;
  limit?: number;
  autoMatch?: AutoMatchOptions;
  enforceCallerPermission?: boolean;
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
  autoMatch?: AutoMatchOptions;
};

export type MatchPendingInboxForTransactionResult = {
  transactionId: string;
  suggestions: InboxTransactionMatchSuggestion[];
  replayed: boolean;
};

export type MatchBidirectionalBatchCommand = {
  teamId: string;
  transactionIds?: string[];
  inboxItemIds?: string[];
  sourceOutboxEventId: string;
  idempotencyKey: string;
  limit?: number;
  enforceCallerPermission?: boolean;
  autoMatch?: AutoMatchOptions;
};

export type MatchBidirectionalBatchResult = {
  transactionIds: string[];
  inboxItemIds: string[];
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

export type AutoMatchOptions = {
  enabled?: boolean;
};

export type DocumentIntelligenceInput = {
  teamId: string;
  inboxItemId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  body?: ArrayBuffer | null;
  sourceUrl?: string | null;
  rawText?: string | null;
};

export type DocumentIntelligenceResult = {
  source?: Exclude<DocumentExtractionSource, "user_correction">;
  fields: DocumentExtractionFields;
  confidence: DocumentExtractionConfidence;
  rawText?: string | null;
  metadata?: DocumentIntelligenceMetadata | null;
};

export type DocumentIntelligenceAttemptMetadata = {
  attempt?: number | null;
  provider?: string | null;
  model?: string | null;
  status?: DocumentExtractionAttemptStatus | null;
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DocumentIntelligenceMetadata = {
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
  attempts?: DocumentIntelligenceAttemptMetadata[] | null;
  [key: string]: unknown;
};

export type DocumentExtractionRepairInput = DocumentIntelligenceInput & {
  current: DocumentIntelligenceResult;
  missingFields: (keyof DocumentExtractionFields)[];
  invalidFields: (keyof DocumentExtractionFields)[];
  issues: string[];
};

export type DocumentIntelligenceProvider = {
  source: Exclude<DocumentExtractionSource, "user_correction">;
  extract(input: DocumentIntelligenceInput): Promise<DocumentIntelligenceResult>;
  repair?(input: DocumentExtractionRepairInput): Promise<DocumentIntelligenceResult>;
};

export type DocumentExtractionProvider = DocumentIntelligenceProvider;

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
    sourceType?: InboxSourceType;
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
  createDocumentExtractionAttempt?(input: {
    attemptId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    extractionId?: string | null;
    attemptNumber: number;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    provider?: string | null;
    model?: string | null;
    status: DocumentExtractionAttemptStatus;
    durationMs?: number | null;
    qualityScore?: number | null;
    errorClass?: string | null;
    errorMessage?: string | null;
    rawTextPresent: boolean;
    metadata: Record<string, unknown>;
  }): Promise<DocumentExtractionAttempt>;
  listDocumentExtractionAttemptsForInboxItem?(
    teamId: string,
    inboxItemId: string,
  ): Promise<DocumentExtractionAttempt[]>;
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
  markDocumentExtractionPending(input: {
    teamId: string;
    inboxItemId: string;
    requestedAt: Date;
  }): Promise<InboxItem>;
  dismissInboxItem(input: {
    teamId: string;
    inboxItemId: string;
    dismissedAt: Date;
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
const requestDocumentExtractionRetryOperation = "document.extraction.retry";
const dismissInboxItemOperation = "inbox.item.dismiss";
const matchPendingInboxForTransactionOperation = "inbox.match.pending_for_transaction";
const matchBidirectionalBatchOperation = "inbox.match.bidirectional_batch";
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
    inboxItems: (await repository.listInboxItems(access.teamId)).filter(
      (item) => item.status !== "dismissed",
    ),
  };
}

export async function runStoredDocumentExtraction(
  repository: DocumentsInboxUseCaseRepository,
  storage: DocumentExtractionObjectStorage,
  extractor: DocumentIntelligenceProvider,
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

  let storedDocument: StoredDocumentExtractionObject;

  try {
    const object = await storage.readDocument({
      objectKey: version.objectKey,
      teamId: command.teamId,
      documentId: command.documentId,
      versionId: command.versionId,
      fileName: version.fileName,
      contentType: version.contentType,
      byteSize: version.byteSize,
    });

    if (!object) {
      throw new Error("Document object not found");
    }

    storedDocument = object;
  } catch (error) {
    await repository.markDocumentExtractionFailed({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      error: errorMessage(error),
      failedAt: new Date(),
    });
    throw error;
  }

  return runDocumentExtraction(repository, extractor, context, {
    ...command,
    storedDocument,
  });
}

export async function runDocumentExtraction(
  repository: DocumentsInboxUseCaseRepository,
  extractor: DocumentIntelligenceProvider,
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

    const documentInput = documentIntelligenceInput({
      command,
      inboxItem,
      version,
    });

    try {
      const extracted = await extractDocumentIntelligence(extractor, documentInput);
      const extractionSource = extracted.source ?? extractor.source;
      const result = await inboxRepository.createDocumentExtraction({
        extractionId: crypto.randomUUID(),
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        documentId: command.documentId,
        documentVersionId: command.versionId,
        source: extractionSource,
        fields: extracted.fields,
        confidence: extracted.confidence,
        rawText: extracted.rawText ?? command.rawText ?? null,
        createdByActorId: context.actor.id,
      });
      const quality = extractionQualitySummary(extracted);

      await recordDocumentExtractionAttempts(inboxRepository, {
        input: documentInput,
        source: extractionSource,
        result: extracted,
        extractionId: result.extraction.id,
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
          source: extractionSource,
          quality,
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
          source: extractionSource,
          quality,
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
      await recordFailedDocumentExtractionAttempts(inboxRepository, {
        input: documentInput,
        source: extractor.source,
        error,
      });
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
  extractor: DocumentIntelligenceProvider,
) {
  return JSON.stringify({
    teamId: command.teamId,
    inboxItemId: command.inboxItemId,
    documentId: command.documentId,
    versionId: command.versionId,
    extractor: extractor.source,
  });
}

function documentIntelligenceInput(input: {
  command: RunDocumentExtractionCommand;
  inboxItem: InboxItem;
  version: BusinessDocumentVersion;
}): DocumentIntelligenceInput {
  const storedDocument = input.command.storedDocument ?? null;
  const contentType = normalizedOptionalText(storedDocument?.contentType ?? null);
  const byteSize =
    typeof storedDocument?.byteSize === "number" && Number.isSafeInteger(storedDocument.byteSize)
      ? storedDocument.byteSize
      : (storedDocument?.body.byteLength ?? input.version.byteSize);

  return {
    teamId: input.command.teamId,
    inboxItemId: input.inboxItem.id,
    documentId: input.command.documentId,
    versionId: input.command.versionId,
    objectKey: input.version.objectKey,
    fileName: input.version.fileName,
    contentType: contentType ?? input.version.contentType,
    byteSize,
    body: storedDocument?.body ?? null,
    rawText: input.command.rawText ?? null,
  };
}

async function extractDocumentIntelligence(
  extractor: DocumentIntelligenceProvider,
  input: DocumentIntelligenceInput,
): Promise<DocumentIntelligenceResult> {
  const extracted = finalizeDocumentIntelligenceResult(await extractor.extract(input));
  const assessment = assessDocumentExtraction(extracted.fields, extracted.confidence);

  if (assessment.missingCriticalFields.length === 0 || !extractor.repair) {
    return extracted;
  }

  const repaired = finalizeDocumentIntelligenceResult(
    mergeDocumentIntelligenceResults(
      extracted,
      await extractor.repair({
        ...input,
        current: extracted,
        missingFields: assessment.missingCriticalFields,
        invalidFields: assessment.invalidFields,
        issues: assessment.issues,
      }),
    ),
  );

  return repaired;
}

function mergeDocumentIntelligenceResults(
  current: DocumentIntelligenceResult,
  repair: DocumentIntelligenceResult,
): DocumentIntelligenceResult {
  const { overall: _currentOverall, ...currentConfidence } = current.confidence;
  const { overall: repairOverall, ...repairConfidence } = repair.confidence;

  return {
    source: repair.source ?? current.source,
    fields: {
      ...current.fields,
      ...repair.fields,
    },
    confidence: {
      ...currentConfidence,
      ...repairConfidence,
      ...(typeof repairOverall === "number" ? { overall: repairOverall } : {}),
    },
    rawText: repair.rawText ?? current.rawText,
    metadata: repair.metadata ?? current.metadata,
  };
}

function finalizeDocumentIntelligenceResult(
  result: DocumentIntelligenceResult,
): DocumentIntelligenceResult {
  const fields = normalizeDocumentExtractionFields(result.fields);
  const invalidFields = invalidDocumentExtractionFields(result.fields, fields);
  const confidence = normalizeDocumentExtractionConfidence(result.confidence, fields);
  const assessment = assessDocumentExtraction(fields, confidence, invalidFields);
  const providerOverall = confidence.overall;

  return {
    ...result,
    fields,
    confidence: {
      ...confidence,
      overall:
        typeof providerOverall === "number"
          ? Math.min(providerOverall, assessment.overallConfidence)
          : assessment.overallConfidence,
    },
  };
}

async function recordDocumentExtractionAttempts(
  repository: DocumentsInboxUseCaseRepository,
  input: {
    input: DocumentIntelligenceInput;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    result: DocumentIntelligenceResult;
    extractionId: string;
  },
) {
  if (!repository.createDocumentExtractionAttempt) {
    return;
  }

  const attempts = normalizedAttemptMetadata(input.result.metadata);
  const qualityScore = input.result.confidence.overall ?? null;
  const rawTextPresent = Boolean(input.result.rawText?.trim());

  for (const [index, attempt] of attempts.entries()) {
    const status = attempt.status === "failed" ? "failed" : "completed";

    await repository.createDocumentExtractionAttempt({
      attemptId: crypto.randomUUID(),
      teamId: input.input.teamId,
      inboxItemId: input.input.inboxItemId,
      documentId: input.input.documentId,
      documentVersionId: input.input.versionId,
      extractionId: input.extractionId,
      attemptNumber: attempt.attempt ?? index + 1,
      source: input.source,
      provider: attempt.provider ?? input.result.metadata?.provider ?? input.source,
      model: attempt.model ?? input.result.metadata?.model ?? null,
      status,
      durationMs: normalizedDurationMs(attempt.durationMs ?? input.result.metadata?.durationMs),
      qualityScore: status === "completed" ? qualityScore : null,
      errorClass: status === "failed" ? (attempt.errorClass ?? null) : null,
      errorMessage: status === "failed" ? (attempt.errorMessage ?? null) : null,
      rawTextPresent,
      metadata: redactDocumentExtractionMetadata(attempt.metadata ?? {}),
    });
  }
}

async function recordFailedDocumentExtractionAttempts(
  repository: DocumentsInboxUseCaseRepository,
  input: {
    input: DocumentIntelligenceInput;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    error: unknown;
  },
) {
  if (!repository.createDocumentExtractionAttempt) {
    return;
  }

  const attempts = normalizedErrorAttemptMetadata(input.error);

  for (const [index, attempt] of attempts.entries()) {
    await repository.createDocumentExtractionAttempt({
      attemptId: crypto.randomUUID(),
      teamId: input.input.teamId,
      inboxItemId: input.input.inboxItemId,
      documentId: input.input.documentId,
      documentVersionId: input.input.versionId,
      extractionId: null,
      attemptNumber: attempt.attempt ?? index + 1,
      source: input.source,
      provider: attempt.provider ?? input.source,
      model: attempt.model ?? null,
      status: "failed",
      durationMs: normalizedDurationMs(attempt.durationMs),
      qualityScore: null,
      errorClass: attempt.errorClass ?? errorClass(input.error),
      errorMessage: attempt.errorMessage ?? errorMessage(input.error),
      rawTextPresent: false,
      metadata: redactDocumentExtractionMetadata(attempt.metadata ?? {}),
    });
  }
}

function normalizedAttemptMetadata(
  metadata: DocumentIntelligenceMetadata | null | undefined,
): DocumentIntelligenceAttemptMetadata[] {
  return metadata?.attempts?.length
    ? metadata.attempts
    : [
        {
          attempt: 1,
          provider: metadata?.provider ?? null,
          model: metadata?.model ?? null,
          status: "completed",
          durationMs: metadata?.durationMs ?? null,
          metadata: {},
        },
      ];
}

function normalizedErrorAttemptMetadata(error: unknown): DocumentIntelligenceAttemptMetadata[] {
  const attempts =
    typeof error === "object" && error !== null && "attempts" in error
      ? (error as { attempts?: unknown }).attempts
      : null;

  if (Array.isArray(attempts) && attempts.length > 0) {
    return attempts
      .filter(
        (attempt): attempt is Record<string, unknown> =>
          typeof attempt === "object" && attempt !== null,
      )
      .map((attempt) => ({
        attempt: typeof attempt.attempt === "number" ? attempt.attempt : null,
        provider: typeof attempt.provider === "string" ? attempt.provider : null,
        model: typeof attempt.model === "string" ? attempt.model : null,
        status: "failed",
        durationMs: typeof attempt.durationMs === "number" ? attempt.durationMs : null,
        errorClass: typeof attempt.errorClass === "string" ? attempt.errorClass : null,
        errorMessage: typeof attempt.errorMessage === "string" ? attempt.errorMessage : null,
        metadata:
          typeof attempt.metadata === "object" && attempt.metadata !== null
            ? (attempt.metadata as Record<string, unknown>)
            : {},
      }));
  }

  return [
    {
      attempt: 1,
      status: "failed",
      errorClass: errorClass(error),
      errorMessage: errorMessage(error),
      metadata: {},
    },
  ];
}

function extractionQualitySummary(result: DocumentIntelligenceResult) {
  const assessment = assessDocumentExtraction(result.fields, result.confidence);

  return {
    overallConfidence: result.confidence.overall ?? assessment.overallConfidence,
    missingCriticalFields: assessment.missingCriticalFields,
    invalidFields: assessment.invalidFields,
  };
}

function redactDocumentExtractionMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return redactMetadataValue(value) as Record<string, unknown>;
}

function redactMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactMetadataValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveDocumentMetadataKey(key))
      .map(([key, nestedValue]) => [key, redactMetadataValue(nestedValue)]),
  );
}

function isSensitiveDocumentMetadataKey(key: string) {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");

  return (
    normalized === "apikey" ||
    normalized === "authorization" ||
    normalized === "secret" ||
    normalized === "password" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "rawpayload" ||
    normalized === "body" ||
    normalized === "requestbody" ||
    normalized === "responsebody" ||
    normalized === "contentbase64" ||
    normalized === "bytes"
  );
}

function normalizedDurationMs(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function errorClass(error: unknown) {
  return error instanceof Error && error.constructor.name ? error.constructor.name : "Error";
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

export async function requestDocumentExtractionRetry(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestDocumentExtractionRetryCommand,
): Promise<RequestDocumentExtractionRetryResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot retry extraction for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestDocumentExtractionRetryOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different extraction retry",
        );
      }

      return { ...(replayed.result as RequestDocumentExtractionRetryResult), replayed: true };
    }

    const inboxItem = await inboxRepository.getInboxItemForTeam(
      command.teamId,
      command.inboxItemId,
    );

    if (!inboxItem) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    if (inboxItem.extractionStatus !== "failed") {
      throw new AppError("CONFLICT", "Only failed extraction items can be retried");
    }

    const requestedAt = new Date();
    const updated = await inboxRepository.markDocumentExtractionPending({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      requestedAt,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "document_extraction.retry_requested",
      entityType: "inbox_item",
      entityId: command.inboxItemId,
      metadata: {
        documentId: inboxItem.documentId,
        versionId: inboxItem.documentVersionId,
      },
    });

    await inboxRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "document_extraction.retry_requested",
      version: 1,
      payload: {
        inboxItemId: command.inboxItemId,
        documentId: inboxItem.documentId,
        versionId: inboxItem.documentVersionId,
        actorId: context.actor.id,
      },
    });

    const result = { inboxItem: updated, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestDocumentExtractionRetryOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function dismissInboxItem(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: DismissInboxItemCommand,
): Promise<DismissInboxItemResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    await resolveTeamAccess(
      inboxRepository,
      { ...context, teamId: command.teamId },
      "documents.write",
      "You cannot dismiss inbox items for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
    });
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      dismissInboxItemOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox dismissal",
        );
      }

      return { ...(replayed.result as DismissInboxItemResult), replayed: true };
    }

    const inboxItem = await inboxRepository.getInboxItemForTeam(
      command.teamId,
      command.inboxItemId,
    );

    if (!inboxItem) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    const dismissedAt = new Date();
    const updated = await inboxRepository.dismissInboxItem({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      dismissedAt,
    });

    await inboxRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "inbox_item.dismissed",
      entityType: "inbox_item",
      entityId: command.inboxItemId,
      metadata: {
        documentId: inboxItem.documentId,
        versionId: inboxItem.documentVersionId,
      },
    });

    const result = { inboxItem: updated, replayed: false };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: dismissInboxItemOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function generateInboxMatchSuggestions(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: GenerateInboxMatchSuggestionsCommand,
): Promise<GenerateInboxMatchSuggestionsResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

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

    const [inboxItem, aliases, feedback, hardNegatives] = await Promise.all([
      inboxRepository.getInboxItemForTeam(command.teamId, command.inboxItemId),
      inboxRepository.listTeamAliases(command.teamId),
      inboxRepository.listTeamMatchFeedback(command.teamId),
      inboxRepository.listHardNegativeMatches(command.teamId, command.inboxItemId),
    ]);

    if (!inboxItem || !inboxItem.latestExtraction) {
      throw new AppError("NOT_FOUND", "Inbox item not found");
    }

    if (!extractionAllowsMatchSuggestions(inboxItem.latestExtraction)) {
      return { inboxItemId: inboxItem.id, suggestions: [] };
    }

    const candidates = await inboxRepository.listTransactionMatchCandidatesForInboxItem({
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
    const persistedSuggestions = currentSuggestedPersistedSuggestions(
      await inboxRepository.upsertInboxMatchSuggestions({
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        suggestions,
      }),
      suggestions,
    );
    const autoAccepted = await maybeAutoAcceptInboxMatch({
      repository: inboxRepository,
      context,
      teamId: command.teamId,
      persistedSuggestions,
      candidateSuggestions: suggestions,
      policy,
      autoMatch: extractionAllowsAutoMatch(inboxItem.latestExtraction)
        ? command.autoMatch
        : { enabled: false },
    });

    return {
      inboxItemId: inboxItem.id,
      suggestions: replaceAcceptedSuggestion(persistedSuggestions, autoAccepted),
    };
  });
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
      if (
        !inboxItem.latestExtraction ||
        !extractionAllowsMatchSuggestions(inboxItem.latestExtraction)
      ) {
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

      const upserted = currentSuggestedPersistedSuggestions(
        await inboxRepository.upsertInboxMatchSuggestions({
          teamId: command.teamId,
          inboxItemId: inboxItem.id,
          suggestions: [suggestion],
        }),
        [suggestion],
      );
      const autoAccepted = await maybeAutoAcceptInboxMatch({
        repository: inboxRepository,
        context,
        teamId: command.teamId,
        persistedSuggestions: upserted,
        candidateSuggestions: [suggestion],
        policy,
        autoMatch: extractionAllowsAutoMatch(inboxItem.latestExtraction)
          ? command.autoMatch
          : { enabled: false },
      });
      const persisted = upserted.find(
        (candidate) =>
          candidate.inboxItemId === inboxItem.id && candidate.transactionId === transaction.id,
      );

      if (autoAccepted) {
        persistedSuggestions.push(autoAccepted);
      } else if (persisted) {
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

export async function matchBidirectionalBatch(
  repository: DocumentsInboxUseCaseRepository,
  context: TransactionReviewContext,
  command: MatchBidirectionalBatchCommand,
): Promise<MatchBidirectionalBatchResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DocumentsInboxUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox match batch not found");

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

    const normalized = normalizeMatchBidirectionalBatchCommand(command);
    const fingerprint = matchBidirectionalBatchFingerprint(normalized);
    const replayed = await inboxRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      matchBidirectionalBatchOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different inbox matching batch",
        );
      }

      return { ...(replayed.result as MatchBidirectionalBatchResult), replayed: true };
    }

    const limit = normalizeMatchCandidateLimit(command.limit);
    const [aliases, feedback] = await Promise.all([
      inboxRepository.listTeamAliases(command.teamId),
      inboxRepository.listTeamMatchFeedback(command.teamId),
    ]);
    const claimedInboxItemIds = new Set<string>();
    const claimedTransactionIds = new Set<string>();
    const persistedSuggestions: InboxTransactionMatchSuggestion[] = [];

    for (const transactionId of normalized.transactionIds) {
      if (claimedTransactionIds.has(transactionId)) {
        continue;
      }

      const transaction = await inboxRepository.getTransactionForTeam(
        command.teamId,
        transactionId,
      );

      if (!transaction) {
        continue;
      }

      const candidateInboxItems = await inboxRepository.listInboxMatchCandidatesForTransaction({
        teamId: command.teamId,
        transaction,
        limit,
      });
      const scoredCandidates: {
        inboxItem: InboxItem;
        suggestion: InboxMatchSuggestion;
        policy: MatchPolicy;
      }[] = [];

      for (const inboxItem of candidateInboxItems) {
        if (
          claimedInboxItemIds.has(inboxItem.id) ||
          !inboxItem.latestExtraction ||
          !extractionAllowsMatchSuggestions(inboxItem.latestExtraction)
        ) {
          continue;
        }

        const hardNegatives = await inboxRepository.listHardNegativeMatches(
          command.teamId,
          inboxItem.id,
        );
        const memory = { aliases, feedback, hardNegatives };
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

        if (suggestion) {
          scoredCandidates.push({ inboxItem, suggestion, policy });
        }
      }

      scoredCandidates.sort(
        (left, right) =>
          right.suggestion.score - left.suggestion.score ||
          left.inboxItem.id.localeCompare(right.inboxItem.id),
      );
      const selected = scoredCandidates[0];

      if (!selected) {
        continue;
      }

      const persisted = await persistBatchSuggestion({
        repository: inboxRepository,
        context,
        teamId: command.teamId,
        inboxItemId: selected.inboxItem.id,
        suggestion: selected.suggestion,
        candidateSuggestions: [selected.suggestion],
        policy: selected.policy,
        autoMatch: extractionAllowsAutoMatch(selected.inboxItem.latestExtraction!)
          ? command.autoMatch
          : { enabled: false },
      });

      if (persisted) {
        persistedSuggestions.push(persisted);
        claimedInboxItemIds.add(selected.inboxItem.id);
        claimedTransactionIds.add(transaction.id);
      }
    }

    for (const inboxItemId of normalized.inboxItemIds) {
      if (claimedInboxItemIds.has(inboxItemId)) {
        continue;
      }

      const inboxItem = await inboxRepository.getInboxItemForTeam(command.teamId, inboxItemId);

      if (
        !inboxItem?.latestExtraction ||
        !extractionAllowsMatchSuggestions(inboxItem.latestExtraction)
      ) {
        continue;
      }

      const candidates = (
        await inboxRepository.listTransactionMatchCandidatesForInboxItem({
          teamId: command.teamId,
          inboxItem,
          limit,
        })
      ).filter((candidate) => !claimedTransactionIds.has(candidate.transaction.id));
      const hardNegatives = await inboxRepository.listHardNegativeMatches(
        command.teamId,
        inboxItem.id,
      );
      const memory = { aliases, feedback, hardNegatives };
      const policy = calibrateMatchPolicy(memory);
      const candidateSuggestions = suggestInboxTransactionMatches(
        inboxMatchInputForItem(inboxItem),
        candidates,
        memory,
        policy,
      ).filter((candidate) => candidate.score >= policy.suggestedScoreThreshold);
      const [suggestion] = candidateSuggestions;

      if (!suggestion) {
        continue;
      }

      const persisted = await persistBatchSuggestion({
        repository: inboxRepository,
        context,
        teamId: command.teamId,
        inboxItemId: inboxItem.id,
        suggestion,
        candidateSuggestions,
        policy,
        autoMatch: extractionAllowsAutoMatch(inboxItem.latestExtraction)
          ? command.autoMatch
          : { enabled: false },
      });

      if (persisted) {
        persistedSuggestions.push(persisted);
        claimedInboxItemIds.add(inboxItem.id);
        claimedTransactionIds.add(suggestion.transactionId);
      }
    }

    const result = {
      transactionIds: normalized.transactionIds,
      inboxItemIds: normalized.inboxItemIds,
      suggestions: persistedSuggestions,
      replayed: false,
    };

    await inboxRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: matchBidirectionalBatchOperation,
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

    if (existing.status !== "suggested") {
      throw new AppError("CONFLICT", "Only suggested inbox matches can be accepted");
    }

    const accepted = await inboxRepository.acceptInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      actorId: context.actor.id,
    });
    await updateMatchedTransactionAccountantStatus(
      inboxRepository,
      command.teamId,
      accepted.suggestion.transactionId,
    );

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

    const suggestion = await inboxRepository.rejectInboxMatchSuggestion({
      teamId: command.teamId,
      suggestionId: command.suggestionId,
      reason: command.reason,
      actorId: context.actor.id,
    });
    await updateMatchedTransactionAccountantStatus(
      inboxRepository,
      command.teamId,
      suggestion.transactionId,
    );

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

export function createDeterministicDocumentExtractor(): DocumentIntelligenceProvider {
  return {
    source: "local_deterministic",
    async extract(input) {
      const rawText = (input.rawText ?? "").trim();
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
  const documentType = normalizedDocumentType(fields.documentType);
  const totalAmountMinor = normalizedPositiveMinorAmount(fields.totalAmountMinor);
  const baseAmountMinor = normalizedPositiveMinorAmount(fields.baseAmountMinor);
  const taxAmountMinor = normalizedTaxAmount(fields.taxAmountMinor, totalAmountMinor);

  return {
    documentType,
    merchantName: normalizedOptionalText(fields.merchantName),
    customerName: normalizedOptionalText(fields.customerName),
    issuedAt: normalizedDateString(fields.issuedAt),
    dueAt: normalizedDateString(fields.dueAt),
    invoiceNumber: normalizedOptionalText(fields.invoiceNumber),
    totalAmountMinor,
    currency: normalizedCurrencyCode(fields.currency),
    baseAmountMinor,
    baseCurrency: normalizedCurrencyCode(fields.baseCurrency),
    taxAmountMinor,
  };
}

function normalizeDocumentExtractionConfidence(
  confidence: DocumentExtractionConfidence,
  fields?: DocumentExtractionFields,
): DocumentExtractionConfidence {
  const availableFields = fields
    ? new Set(
        Object.entries(fields)
          .filter(([, value]) => value !== null && value !== undefined && value !== "")
          .map(([key]) => key),
      )
    : null;

  return Object.fromEntries(
    Object.entries(confidence)
      .filter(
        ([key, value]) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          (key === "overall" || !availableFields || availableFields.has(key)),
      )
      .map(([key, value]) => [key, Math.max(0, Math.min(1, value ?? 0))]),
  ) as DocumentExtractionConfidence;
}

function invalidDocumentExtractionFields(
  input: DocumentExtractionFields,
  normalized: DocumentExtractionFields,
): (keyof DocumentExtractionFields)[] {
  return (
    [
      "documentType",
      "issuedAt",
      "dueAt",
      "totalAmountMinor",
      "currency",
      "baseAmountMinor",
      "baseCurrency",
      "taxAmountMinor",
    ] as const
  ).filter(
    (field) => hasExtractionFieldValue(input[field]) && !hasExtractionFieldValue(normalized[field]),
  );
}

function assessDocumentExtraction(
  fields: DocumentExtractionFields,
  confidence: DocumentExtractionConfidence,
  invalidFields: (keyof DocumentExtractionFields)[] = [],
) {
  const criticalFields = criticalDocumentExtractionFields(fields.documentType);
  const missingCriticalFields = criticalFields.filter(
    (field) => !hasExtractionFieldValue(fields[field]),
  );
  const issues = [
    ...missingCriticalFields.map((field) => `Missing critical field: ${field}`),
    ...invalidFields.map((field) => `Invalid field: ${field}`),
  ];
  const criticalConfidences = criticalFields
    .filter((field) => hasExtractionFieldValue(fields[field]))
    .map((field) => confidence[field] ?? 0.72);
  const criticalConfidence =
    criticalConfidences.length > 0
      ? criticalConfidences.reduce((total, value) => total + value, 0) / criticalConfidences.length
      : (confidence.documentType ?? 0.72);
  const coverage =
    criticalFields.length > 0
      ? (criticalFields.length - missingCriticalFields.length) / criticalFields.length
      : 1;
  let overallConfidence = Math.min(coverage, criticalConfidence);

  if (missingCriticalFields.length > 0 || invalidFields.length > 0) {
    overallConfidence = Math.min(overallConfidence, 0.69);
  }

  return {
    missingCriticalFields,
    invalidFields,
    issues,
    overallConfidence: Math.max(0, Math.min(1, overallConfidence)),
  };
}

function criticalDocumentExtractionFields(
  documentType: DocumentExtractionFields["documentType"],
): (keyof DocumentExtractionFields)[] {
  switch (documentType) {
    case "receipt":
      return ["documentType", "merchantName", "issuedAt", "totalAmountMinor", "currency"];
    case "invoice_received":
    case "invoice_sent":
      return ["documentType", "merchantName", "issuedAt", "totalAmountMinor", "currency"];
    default:
      return documentType ? ["documentType"] : [];
  }
}

function normalizedDocumentType(value: DocumentExtractionFields["documentType"]) {
  const normalized = normalizedOptionalText(value);

  if (
    normalized === "receipt" ||
    normalized === "invoice_received" ||
    normalized === "invoice_sent" ||
    normalized === "bank_statement" ||
    normalized === "contract" ||
    normalized === "tax_document" ||
    normalized === "other"
  ) {
    return normalized;
  }

  return null;
}

function normalizedPositiveMinorAmount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizedTaxAmount(value: unknown, totalAmountMinor: number | null) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  if (totalAmountMinor == null || value > totalAmountMinor) {
    return null;
  }

  return value;
}

function normalizedCurrencyCode(value: unknown) {
  const normalized = normalizedOptionalText(value)?.toUpperCase() ?? null;

  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizedDateString(value: unknown) {
  const normalized = normalizedOptionalText(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized;
}

function hasExtractionFieldValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function confidenceForExtractedFields(
  fields: DocumentExtractionFields,
  hasRawText: boolean,
): DocumentExtractionConfidence {
  const confidence = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, hasRawText ? 0.82 : 0.35]),
  ) as DocumentExtractionConfidence;

  return {
    ...confidence,
    overall: assessDocumentExtraction(fields, confidence).overallConfidence,
  };
}

function correctionConfidence(fields: DocumentExtractionFields): DocumentExtractionConfidence {
  const confidence = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => [key, 1]),
  ) as DocumentExtractionConfidence;

  return {
    ...confidence,
    overall: 1,
  };
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

function extractionAllowsMatchSuggestions(extraction: DocumentExtraction) {
  let financialDocument = false;

  switch (extraction.fields.documentType) {
    case "receipt":
    case "invoice_received":
    case "invoice_sent":
      financialDocument = true;
      break;
    case "other":
    case "bank_statement":
    case "contract":
    case "tax_document":
      return false;
    default:
      financialDocument = Boolean(
        extraction.fields.totalAmountMinor &&
        extraction.fields.currency &&
        extraction.fields.merchantName,
      );
  }

  return financialDocument && extractionQualityAllowsMatchSuggestions(extraction);
}

function extractionQualityAllowsMatchSuggestions(extraction: DocumentExtraction) {
  if (Object.keys(extraction.confidence).length === 0) {
    return true;
  }

  const assessment = assessDocumentExtraction(extraction.fields, extraction.confidence);
  const overallConfidence = extraction.confidence.overall ?? assessment.overallConfidence;

  return overallConfidence >= 0.7 && assessment.missingCriticalFields.length === 0;
}

function extractionAllowsAutoMatch(extraction: DocumentExtraction) {
  if (!extractionAllowsMatchSuggestions(extraction)) {
    return false;
  }

  return true;
}

async function maybeAutoAcceptInboxMatch(input: {
  repository: DocumentsInboxUseCaseRepository;
  context: TransactionReviewContext;
  teamId: string;
  persistedSuggestions: InboxTransactionMatchSuggestion[];
  candidateSuggestions: InboxMatchSuggestion[];
  policy: MatchPolicy;
  autoMatch?: AutoMatchOptions;
}): Promise<InboxTransactionMatchSuggestion | null> {
  const [candidate] = input.candidateSuggestions;
  const persisted = candidate
    ? input.persistedSuggestions.find(
        (suggestion) =>
          suggestion.inboxItemId === candidate.inboxItemId &&
          suggestion.transactionId === candidate.transactionId &&
          suggestion.status === "suggested",
      )
    : null;
  const evaluation = evaluateAutoMatch({
    enabled: input.autoMatch?.enabled === true,
    candidate: candidate ?? null,
    alternatives: input.candidateSuggestions,
    policy: input.policy,
  });

  if (!evaluation.eligible || !persisted) {
    return null;
  }

  const accepted = await input.repository.acceptInboxMatchSuggestion({
    teamId: input.teamId,
    suggestionId: persisted.id,
    actorId: input.context.actor.id,
  });
  await updateMatchedTransactionAccountantStatus(
    input.repository,
    input.teamId,
    accepted.suggestion.transactionId,
  );

  await input.repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    action: "inbox_match.auto_matched",
    entityType: "inbox_item",
    entityId: accepted.inboxItem.id,
    metadata: {
      suggestionId: accepted.suggestion.id,
      transactionId: accepted.suggestion.transactionId,
      documentId: accepted.inboxItem.documentId,
      score: accepted.suggestion.score,
      threshold: evaluation.threshold,
      closestAlternativeScore: evaluation.closestAlternativeScore ?? null,
    },
  });

  await input.repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    type: "inbox_match.auto_matched",
    version: 1,
    payload: {
      inboxItemId: accepted.inboxItem.id,
      suggestionId: accepted.suggestion.id,
      transactionId: accepted.suggestion.transactionId,
      documentId: accepted.inboxItem.documentId,
    },
  });

  return accepted.suggestion;
}

async function persistBatchSuggestion(input: {
  repository: DocumentsInboxUseCaseRepository;
  context: TransactionReviewContext;
  teamId: string;
  inboxItemId: string;
  suggestion: InboxMatchSuggestion;
  candidateSuggestions: InboxMatchSuggestion[];
  policy: MatchPolicy;
  autoMatch?: AutoMatchOptions;
}) {
  const upserted = currentSuggestedPersistedSuggestions(
    await input.repository.upsertInboxMatchSuggestions({
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      suggestions: [input.suggestion],
    }),
    [input.suggestion],
  );
  const autoAccepted = await maybeAutoAcceptInboxMatch({
    repository: input.repository,
    context: input.context,
    teamId: input.teamId,
    persistedSuggestions: upserted,
    candidateSuggestions: input.candidateSuggestions,
    policy: input.policy,
    autoMatch: input.autoMatch,
  });

  if (autoAccepted) {
    return autoAccepted;
  }

  return (
    upserted.find(
      (candidate) =>
        candidate.inboxItemId === input.suggestion.inboxItemId &&
        candidate.transactionId === input.suggestion.transactionId,
    ) ?? null
  );
}

function replaceAcceptedSuggestion(
  suggestions: InboxTransactionMatchSuggestion[],
  accepted: InboxTransactionMatchSuggestion | null,
) {
  return accepted
    ? suggestions.map((suggestion) => (suggestion.id === accepted.id ? accepted : suggestion))
    : suggestions;
}

async function updateMatchedTransactionAccountantStatus(
  repository: DocumentsInboxUseCaseRepository,
  teamId: string,
  transactionId: string,
) {
  if (!isTransactionAccountantLifecycleRepository(repository)) {
    return;
  }

  const transaction = await repository.getTransactionForTeam(teamId, transactionId);

  if (!transaction) {
    return;
  }

  const acceptedAttachmentCount = await repository.countTransactionAttachmentsForTeam({
    teamId,
    transactionId,
  });
  const nextStatus = deriveTransactionAccountantStatus({
    transaction,
    acceptedAttachmentCount,
  });

  if (transaction.accountantStatus === nextStatus) {
    return;
  }

  await repository.updateTransactionAccountantStatusForTeam({
    teamId,
    transactionId,
    accountantStatus: nextStatus,
    reason: null,
  });
}

function isTransactionAccountantLifecycleRepository(
  repository: DocumentsInboxUseCaseRepository,
): repository is DocumentsInboxUseCaseRepository & TransactionAccountantLifecycleRepository {
  return (
    "countTransactionAttachmentsForTeam" in repository &&
    "updateTransactionAccountantStatusForTeam" in repository
  );
}

function currentSuggestedPersistedSuggestions(
  persistedSuggestions: InboxTransactionMatchSuggestion[],
  candidateSuggestions: InboxMatchSuggestion[],
) {
  return persistedSuggestions.filter(
    (persisted) =>
      persisted.status === "suggested" &&
      candidateSuggestions.some(
        (candidate) =>
          candidate.inboxItemId === persisted.inboxItemId &&
          candidate.transactionId === persisted.transactionId,
      ),
  );
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

export function matchBidirectionalBatchFingerprint(command: MatchBidirectionalBatchCommand) {
  const normalized = normalizeMatchBidirectionalBatchCommand(command);

  return JSON.stringify({
    teamId: normalized.teamId,
    sourceOutboxEventId: normalized.sourceOutboxEventId,
    transactionIds: normalized.transactionIds,
    inboxItemIds: normalized.inboxItemIds,
    limit: normalizeMatchCandidateLimit(normalized.limit),
    autoMatch: normalized.autoMatch?.enabled === true,
  });
}

function normalizeMatchBidirectionalBatchCommand(
  command: MatchBidirectionalBatchCommand,
): MatchBidirectionalBatchCommand & { transactionIds: string[]; inboxItemIds: string[] } {
  return {
    ...command,
    transactionIds: uniqueNonEmptyStrings(command.transactionIds ?? []),
    inboxItemIds: uniqueNonEmptyStrings(command.inboxItemIds ?? []),
  };
}

function uniqueNonEmptyStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeMatchCandidateLimit(limit: number | null | undefined) {
  if (!Number.isSafeInteger(limit) || !limit || limit <= 0) {
    return defaultMatchCandidateLimit;
  }

  return Math.min(limit, maxMatchCandidateLimit);
}

function normalizedOptionalText(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
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
