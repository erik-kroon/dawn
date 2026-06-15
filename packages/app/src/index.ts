import type {
  Actor,
  Category,
  CsvTransactionColumnMapping,
  LedgerAccount,
  LedgerTransactionDraft,
  Money,
  Permission,
  ReportTotals,
  Team,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import type {
  BankingProvider,
  BankingProviderAccount,
  BankingProviderConnection,
  BankingProviderName,
  BankingProviderTransaction,
} from "@dawn/integrations";
import type { DawnQueueMessage, OutboxEventForJob } from "@dawn/jobs";
import type { TransactionSyncResponse } from "@dawn/sync";
import {
  applyTransactionReview,
  assertLedgerTransactionDraft,
  createReportTotals,
  csvRowToLedgerDraft,
  ledgerDuplicateKey,
  parseCsvTransactionRows,
  permissionsForRole,
  roleHasPermission,
} from "@dawn/domain";
import { providerTransactionToLedgerDraft } from "@dawn/integrations";
import { dawnQueueNames, nextOutboxRetryAt, outboxEventToQueueMessages } from "@dawn/jobs";
import { buildTransactionSyncResponse } from "@dawn/sync";

export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type TransactionReviewContext = {
  actor: Actor;
  requestId: string;
  teamId?: string;
};

export type ActorTeam = Team & {
  role: TeamRole;
};

export type ReviewWorkspace = {
  teamId: string;
  teamName: string;
  role: TeamRole;
  permissions: readonly Permission[];
  categories: Category[];
  transactions: Transaction[];
  sync: {
    collection: "transactions";
    cursor: string | null;
    conflictPolicy: "server_wins_for_financial_state";
  };
};

export type ReviewWorkspaceData = Omit<ReviewWorkspace, "role" | "permissions">;

export type ListTransactionSyncCommand = {
  teamId?: string;
  cursor?: string | null;
};

export type ReviewTransactionCommand = {
  teamId: string;
  transactionId: string;
  categoryId: string;
  idempotencyKey: string;
};

export type ReviewTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type InviteTeamMemberCommand = {
  teamId: string;
  email: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type InviteTeamMemberResult = {
  invite: TeamInvite;
  replayed: boolean;
};

export type AcceptTeamInviteCommand = {
  inviteId: string;
  idempotencyKey: string;
};

export type AcceptTeamInviteResult = {
  membership: TeamMembership;
  invite: TeamInvite;
  replayed: boolean;
};

export type UpdateTeamMemberRoleCommand = {
  teamId: string;
  userId: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type UpdateTeamMemberRoleResult = {
  membership: TeamMember;
  replayed: boolean;
};

export type CreateLedgerTransactionCommand = LedgerTransactionDraft & {
  idempotencyKey: string;
};

export type CreateLedgerTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type LedgerSummary = {
  teamId: string;
  accounts: LedgerAccount[];
  totals: ReportTotals;
  transactionCount: number;
};

export type CsvTransactionImportMapping = CsvTransactionColumnMapping & {
  categoryId?: string | null;
};

export type PreviewCsvTransactionImportCommand = {
  teamId: string;
  accountId: string;
  csvText: string;
  mapping: CsvTransactionImportMapping;
};

export type CommitCsvTransactionImportCommand = PreviewCsvTransactionImportCommand & {
  fileName?: string | null;
  idempotencyKey: string;
};

export type CsvTransactionImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string>;
  status: "ready" | "duplicate" | "invalid";
  errors: string[];
  duplicateKey: string | null;
  draft: LedgerTransactionDraft | null;
};

export type CsvTransactionImportPreview = {
  teamId: string;
  accountId: string;
  rows: CsvTransactionImportPreviewRow[];
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export type TransactionImportSession = {
  id: string;
  teamId: string;
  accountId: string;
  source: "csv";
  fileName: string | null;
  status: "committed";
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export type BankConnectionStatus = "connected" | "disconnected" | "error";

export type BankConnection = {
  id: string;
  teamId: string;
  provider: BankingProviderName;
  providerConnectionId: string;
  institutionName: string;
  status: BankConnectionStatus;
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankAccount = {
  id: string;
  teamId: string;
  connectionId: string;
  ledgerAccountId: string;
  providerAccountId: string;
  name: string;
  currency: string;
  type: LedgerAccount["type"];
  currentBalance: Money;
  status: "active" | "inactive";
};

export type ProviderSyncRunStatus = "running" | "completed" | "failed";

export type ProviderSyncRun = {
  id: string;
  teamId: string;
  connectionId: string;
  status: ProviderSyncRunStatus;
  startedAt: string;
  completedAt?: string | null;
  accountsSynced: number;
  transactionsImported: number;
  duplicateCount: number;
  error?: string | null;
};

export type BankConnectionSummary = {
  connection: BankConnection;
  accounts: BankAccount[];
  latestSyncRun?: ProviderSyncRun | null;
};

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

export type DocumentExtractionProvider = {
  source: Exclude<DocumentExtractionSource, "user_correction">;
  extract(input: { fileName: string; contentType: string; rawText: string }): Promise<{
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
  }>;
};

export type ConnectMockBankConnectionCommand = {
  teamId: string;
  idempotencyKey: string;
};

export type ConnectMockBankConnectionResult = {
  connection: BankConnection;
  replayed: boolean;
};

export type SyncBankConnectionCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type SyncBankConnectionResult = {
  connection: BankConnection;
  accounts: BankAccount[];
  syncRun: ProviderSyncRun;
  transactions: Transaction[];
  duplicateCount: number;
  replayed: boolean;
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

export type OutboxEventStatus = "pending" | "dispatching" | "dispatched" | "failed";

export type OutboxEvent = OutboxEventForJob & {
  status: OutboxEventStatus;
  occurredAt: string;
  processedAt?: string | null;
  lastError?: string | null;
  nextAttemptAt?: string | null;
};

export type JobRunStatus = "queued" | "failed";

export type JobRun = {
  id: string;
  teamId: string;
  outboxEventId: string;
  jobType: DawnQueueMessage["type"];
  queueName: string;
  status: JobRunStatus;
  attempt: number;
  idempotencyKey: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DispatchOutboxCommand = {
  limit?: number;
  now?: Date;
};

export type DispatchOutboxResult = {
  scanned: number;
  dispatched: number;
  failed: number;
  skipped: number;
  queuedMessages: number;
};

export type OutboxQueuePublisher = {
  publish(message: DawnQueueMessage): Promise<void>;
};

export type CommitCsvTransactionImportResult = {
  importSession: TransactionImportSession;
  transactions: Transaction[];
  preview: CsvTransactionImportPreview;
  replayed: boolean;
};

export type BankingRepository = {
  listBankConnectionSummaries(teamId: string): Promise<BankConnectionSummary[]>;
  getBankConnectionForTeam(teamId: string, connectionId: string): Promise<BankConnection | null>;
  upsertBankConnection(input: {
    teamId: string;
    providerConnection: BankingProviderConnection;
  }): Promise<BankConnection>;
  upsertBankAccount(input: {
    teamId: string;
    connectionId: string;
    providerAccount: BankingProviderAccount;
  }): Promise<BankAccount>;
  getTransactionByProviderTransactionId(
    teamId: string,
    providerTransactionId: string,
  ): Promise<Transaction | null>;
  createProviderSyncRun(input: { teamId: string; connectionId: string }): Promise<ProviderSyncRun>;
  finishProviderSyncRun(input: {
    syncRunId: string;
    status: Exclude<ProviderSyncRunStatus, "running">;
    accountsSynced: number;
    transactionsImported: number;
    duplicateCount: number;
    error?: string | null;
  }): Promise<ProviderSyncRun>;
  markBankConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: BankConnectionStatus;
  }): Promise<BankConnection>;
  upsertProviderObject(input: {
    teamId: string;
    provider: BankingProviderName;
    providerObjectType: "connection" | "account" | "transaction";
    providerObjectId: string;
    connectionId?: string | null;
    bankAccountId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
};

export type BankingUseCaseRepository = TransactionReviewRepository & BankingRepository;

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
};

export type DawnRepository = BankingUseCaseRepository & DocumentRepository & InboxRepository;

export type OutboxDispatchRepository = {
  withTransaction<T>(callback: (repository: OutboxDispatchRepository) => Promise<T>): Promise<T>;
  listDispatchableOutboxEvents(input: { limit: number; now: Date }): Promise<OutboxEvent[]>;
  claimOutboxEventForDispatch(input: {
    outboxEventId: string;
    now: Date;
  }): Promise<OutboxEvent | null>;
  createJobRun(input: {
    teamId: string;
    outboxEventId: string;
    jobType: DawnQueueMessage["type"];
    queueName: string;
    status: JobRunStatus;
    attempt: number;
    idempotencyKey: string;
    error?: string | null;
  }): Promise<JobRun>;
  markOutboxEventDispatched(input: { outboxEventId: string; now: Date }): Promise<void>;
  markOutboxEventDispatchFailed(input: {
    outboxEventId: string;
    error: string;
    nextAttemptAt: Date;
  }): Promise<void>;
};

export type IdempotencyResult<T> = {
  fingerprint: string;
  result: T;
};

export type ResolvedTeamAccess = {
  teamId: string;
  role: TeamRole;
  permissions: readonly Permission[];
};

export type TeamDirectory = {
  teamId: string;
  members: TeamMember[];
  pendingInvites: TeamInvite[];
};

export type TransactionReviewRepository = {
  withTransaction<T>(callback: (repository: TransactionReviewRepository) => Promise<T>): Promise<T>;
  ensureDefaultWorkspace(actor: Actor): Promise<{ teamId: string }>;
  listActorTeams(actor: Actor): Promise<ActorTeam[]>;
  createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam>;
  listWorkspace(actor: Actor, teamId: string): Promise<ReviewWorkspaceData>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
  getTransactionForTeam(teamId: string, transactionId: string): Promise<Transaction | null>;
  getCategoryForTeam(teamId: string, categoryId: string): Promise<Category | null>;
  listLedgerAccounts(teamId: string): Promise<LedgerAccount[]>;
  getLedgerAccountForTeam(teamId: string, accountId: string): Promise<LedgerAccount | null>;
  getTransactionByDuplicateKey(teamId: string, duplicateKey: string): Promise<Transaction | null>;
  listTransactionsForReport(input: {
    teamId: string;
    accountId?: string;
    from?: string;
    to?: string;
  }): Promise<Transaction[]>;
  listTransactionsForSync(input: {
    teamId: string;
    cursor?: string | null;
  }): Promise<Transaction[]>;
  createLedgerTransactionForTeam(input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }): Promise<Transaction>;
  createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    mapping: CsvTransactionImportMapping;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }): Promise<TransactionImportSession>;
  getIdempotencyResult(
    teamId: string,
    actorId: string,
    operation: string,
    key: string,
  ): Promise<IdempotencyResult<unknown> | null>;
  updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }): Promise<Transaction>;
  appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }): Promise<void>;
  saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }): Promise<void>;
  createTeamInvite(input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }): Promise<TeamInvite>;
  listTeamMembers(teamId: string): Promise<TeamMember[]>;
  listPendingTeamInvites(teamId: string): Promise<TeamInvite[]>;
  getTeamInvite(inviteId: string): Promise<TeamInvite | null>;
  addTeamMembership(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership>;
  markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }): Promise<TeamInvite>;
  getTeamMemberByUserId(teamId: string, userId: string): Promise<TeamMember | null>;
  updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember>;
};

const reviewTransactionOperation = "transaction.review";
const createLedgerTransactionOperation = "ledger.transaction.create";
const commitCsvTransactionImportOperation = "csv_transaction_import.commit";
const connectMockBankConnectionOperation = "banking.connection.mock.connect";
const syncBankConnectionOperation = "banking.connection.sync";
const createDocumentUploadOperation = "document.upload.create";
const runDocumentExtractionOperation = "document.extraction.run";
const correctDocumentExtractionOperation = "document.extraction.correct";
const inviteTeamMemberOperation = "team.invite";
const acceptTeamInviteOperation = "team.invite.accept";
const updateTeamMemberRoleOperation = "team.member.role.update";

export async function dispatchOutboxEvents(
  repository: OutboxDispatchRepository,
  publisher: OutboxQueuePublisher,
  command: DispatchOutboxCommand = {},
): Promise<DispatchOutboxResult> {
  const now = command.now ?? new Date();
  const events = await repository.listDispatchableOutboxEvents({
    limit: command.limit ?? 25,
    now,
  });
  const result: DispatchOutboxResult = {
    scanned: events.length,
    dispatched: 0,
    failed: 0,
    skipped: 0,
    queuedMessages: 0,
  };

  for (const event of events) {
    const claimed = await repository.claimOutboxEventForDispatch({
      outboxEventId: event.id,
      now,
    });

    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    try {
      const messages = outboxEventToQueueMessages(event);

      for (const message of messages) {
        await publisher.publish(message);
        await repository.createJobRun({
          teamId: event.teamId,
          outboxEventId: event.id,
          jobType: message.type,
          queueName: dawnQueueNames.jobs,
          status: "queued",
          attempt: event.dispatchAttempts + 1,
          idempotencyKey: message.idempotencyKey,
          error: null,
        });
        result.queuedMessages += 1;
      }

      await repository.markOutboxEventDispatched({ outboxEventId: event.id, now });
      result.dispatched += 1;
    } catch (error) {
      const message = errorMessage(error);
      const attempt = event.dispatchAttempts + 1;
      const nextAttemptAt = nextOutboxRetryAt({ attempt, now });

      await repository.createJobRun({
        teamId: event.teamId,
        outboxEventId: event.id,
        jobType: "outbox.dispatch",
        queueName: dawnQueueNames.jobs,
        status: "failed",
        attempt,
        idempotencyKey: `outbox:${event.id}:failed:${attempt}`,
        error: message,
      });
      await repository.markOutboxEventDispatchFailed({
        outboxEventId: event.id,
        error: message,
        nextAttemptAt,
      });
      result.failed += 1;
    }
  }

  return result;
}

export async function listTeams(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<{ teams: ActorTeam[]; currentTeamId: string; currentRole: TeamRole }> {
  const { teamId } = await repository.ensureDefaultWorkspace(context.actor);
  const teams = await repository.listActorTeams(context.actor);
  const requestedTeamId = context.teamId ?? teamId;
  const currentTeam = teams.find((team) => team.id === requestedTeamId) ?? teams[0];

  if (!currentTeam) {
    throw new AppError("FORBIDDEN", "You do not belong to any team");
  }

  return { teams, currentTeamId: currentTeam.id, currentRole: currentTeam.role };
}

export async function createTeam(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: { name: string },
): Promise<ActorTeam> {
  const name = command.name.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Team name is required");
  }

  return repository.createTeam({ actor: context.actor, name });
}

export async function listTransactionReviewWorkspace(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<ReviewWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    context,
    "transactions.read",
    "You cannot read transactions for this team",
  );
  const workspace = await repository.listWorkspace(context.actor, access.teamId);

  return {
    ...workspace,
    role: access.role,
    permissions: access.permissions,
  };
}

export async function listTransactionSyncCollection(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ListTransactionSyncCommand = {},
): Promise<TransactionSyncResponse> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "transactions.read",
    "You cannot sync transactions for this team",
  );
  const transactions = await repository.listTransactionsForSync({
    teamId: access.teamId,
    cursor: command.cursor ?? null,
  });

  return buildTransactionSyncResponse({
    teamId: access.teamId,
    transactions,
  });
}

export async function reviewTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ReviewTransactionCommand,
): Promise<ReviewTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Transaction not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.categorize",
      "You cannot review transactions for this team",
    );

    const fingerprint = transactionReviewFingerprint(command);

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      reviewTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different review");
      }

      return { ...(replayed.result as ReviewTransactionResult), replayed: true };
    }

    const transaction = await transactionRepository.getTransactionForTeam(
      command.teamId,
      command.transactionId,
    );

    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const category = await transactionRepository.getCategoryForTeam(
      command.teamId,
      command.categoryId,
    );

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }

    const reviewChange = applyTransactionReview(transaction, category);

    const updatedTransaction = await transactionRepository.updateTransactionReviewForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
      categoryId: reviewChange.transaction.categoryId ?? category.id,
      reviewState: reviewChange.transaction.reviewState,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction.reviewed",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: reviewChange.auditMetadata,
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.reviewed",
      version: 1,
      payload: reviewChange.outboxPayload,
    });

    const result = { transaction: updatedTransaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: reviewTransactionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function transactionReviewFingerprint(command: ReviewTransactionCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    transactionId: command.transactionId,
    categoryId: command.categoryId,
  });
}

export async function listLedgerSummary(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  input: { teamId?: string; accountId?: string; from?: string; to?: string } = {},
): Promise<LedgerSummary> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read ledger data for this team",
  );
  const [accounts, transactions] = await Promise.all([
    repository.listLedgerAccounts(access.teamId),
    repository.listTransactionsForReport({
      teamId: access.teamId,
      accountId: input.accountId,
      from: input.from,
      to: input.to,
    }),
  ]);
  const currency =
    accounts.find((account) => account.id === input.accountId)?.currency ??
    accounts[0]?.currency ??
    transactions[0]?.money.currency ??
    "USD";

  return {
    teamId: access.teamId,
    accounts,
    totals: createReportTotals(transactions, currency),
    transactionCount: transactions.length,
  };
}

export async function createLedgerTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: CreateLedgerTransactionCommand,
): Promise<CreateLedgerTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Ledger transaction not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot create ledger transactions for this team",
    );

    const draft = normalizeLedgerTransactionDraft(command);
    const fingerprint = createLedgerTransactionFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createLedgerTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different ledger transaction",
        );
      }

      return { ...(replayed.result as CreateLedgerTransactionResult), replayed: true };
    }

    const account = await transactionRepository.getLedgerAccountForTeam(
      draft.teamId,
      draft.accountId,
    );

    if (!account) {
      throw new AppError("NOT_FOUND", "Ledger account not found");
    }

    if (account.currency !== draft.money.currency) {
      throw new AppError("CONFLICT", "Ledger transaction currency must match the account");
    }

    if (draft.categoryId) {
      const category = await transactionRepository.getCategoryForTeam(
        draft.teamId,
        draft.categoryId,
      );

      if (!category) {
        throw new AppError("NOT_FOUND", "Category not found");
      }
    }

    const duplicateKey = ledgerDuplicateKey(draft);
    const duplicate = await transactionRepository.getTransactionByDuplicateKey(
      draft.teamId,
      duplicateKey,
    );

    if (duplicate) {
      throw new AppError("CONFLICT", "Ledger transaction duplicate key already exists");
    }

    const transaction = await transactionRepository.createLedgerTransactionForTeam({
      draft,
      duplicateKey,
    });

    await transactionRepository.appendAuditEvent({
      teamId: draft.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction.created",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        accountId: draft.accountId,
        duplicateKey,
        source: draft.source,
        type: draft.type,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: draft.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.created",
      version: 1,
      payload: {
        transactionId: transaction.id,
        accountId: draft.accountId,
        duplicateKey,
      },
    });

    const result = { transaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: draft.teamId,
      actorId: context.actor.id,
      operation: createLedgerTransactionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function createLedgerTransactionFingerprint(command: CreateLedgerTransactionCommand) {
  const draft = normalizeLedgerTransactionDraft(command);

  return JSON.stringify({
    teamId: draft.teamId,
    accountId: draft.accountId,
    description: draft.description,
    postedAt: draft.postedAt,
    money: draft.money,
    type: draft.type,
    source: draft.source,
    categoryId: draft.categoryId ?? null,
    counterpartyId: draft.counterpartyId ?? null,
    providerTransactionId: draft.providerTransactionId ?? null,
    splits: draft.splits ?? [],
    tagIds: draft.tagIds ?? [],
  });
}

export async function listBankConnections(
  repository: BankingUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{ teamId: string; connections: BankConnectionSummary[] }> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read bank connections for this team",
  );

  return {
    teamId: access.teamId,
    connections: await repository.listBankConnectionSummaries(access.teamId),
  };
}

export async function connectMockBankConnection(
  repository: BankingUseCaseRepository,
  provider: BankingProvider,
  context: TransactionReviewContext,
  command: ConnectMockBankConnectionCommand,
): Promise<ConnectMockBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot connect bank providers for this team",
    );

    const fingerprint = connectMockBankConnectionFingerprint(command, provider.provider);
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      connectMockBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank connection",
        );
      }

      return { ...(replayed.result as ConnectMockBankConnectionResult), replayed: true };
    }

    const providerConnection = await provider.createConnection({
      teamId: command.teamId,
      actorId: context.actor.id,
    });
    const connection = await bankingRepository.upsertBankConnection({
      teamId: command.teamId,
      providerConnection,
    });

    await bankingRepository.upsertProviderObject({
      teamId: command.teamId,
      provider: provider.provider,
      providerObjectType: "connection",
      providerObjectId: providerConnection.providerConnectionId,
      connectionId: connection.id,
      internalEntityType: "bank_connection",
      internalEntityId: connection.id,
      rawPayload: providerConnection.rawPayload,
    });

    await bankingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "bank_connection.connected",
      entityType: "bank_connection",
      entityId: connection.id,
      metadata: {
        provider: provider.provider,
        providerConnectionId: providerConnection.providerConnectionId,
      },
    });

    await bankingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "bank_connection.connected",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: provider.provider,
      },
    });

    const result = { connection, replayed: false };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: connectMockBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function syncBankConnection(
  repository: BankingUseCaseRepository,
  provider: BankingProvider,
  context: TransactionReviewContext,
  command: SyncBankConnectionCommand,
): Promise<SyncBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot sync bank providers for this team",
    );

    const fingerprint = syncBankConnectionFingerprint(command, provider.provider);
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      syncBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank sync",
        );
      }

      return { ...(replayed.result as SyncBankConnectionResult), replayed: true };
    }

    const connection = await bankingRepository.getBankConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.provider !== provider.provider) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    const providerConnection = persistedProviderConnection(connection);
    const providerAccounts = await provider.listAccounts(providerConnection);
    const syncRun = await bankingRepository.createProviderSyncRun({
      teamId: command.teamId,
      connectionId: connection.id,
    });
    const accounts: BankAccount[] = [];
    const transactions: Transaction[] = [];
    let duplicateCount = 0;

    for (const providerAccount of providerAccounts) {
      const account = await bankingRepository.upsertBankAccount({
        teamId: command.teamId,
        connectionId: connection.id,
        providerAccount,
      });
      accounts.push(account);

      await bankingRepository.upsertProviderObject({
        teamId: command.teamId,
        provider: provider.provider,
        providerObjectType: "account",
        providerObjectId: providerAccount.providerAccountId,
        connectionId: connection.id,
        bankAccountId: account.id,
        internalEntityType: "bank_account",
        internalEntityId: account.id,
        rawPayload: providerAccount.rawPayload,
      });

      const providerTransactions = await provider.syncAccount({
        connection: providerConnection,
        account: providerAccount,
      });

      for (const providerTransaction of providerTransactions) {
        const transaction = await importProviderTransaction({
          repository: bankingRepository,
          provider,
          connection,
          bankAccount: account,
          providerTransaction,
        });

        if (transaction) {
          transactions.push(transaction);
        } else {
          duplicateCount += 1;
        }
      }
    }

    const completedSyncRun = await bankingRepository.finishProviderSyncRun({
      syncRunId: syncRun.id,
      status: "completed",
      accountsSynced: accounts.length,
      transactionsImported: transactions.length,
      duplicateCount,
      error: null,
    });
    const syncedConnection = await bankingRepository.markBankConnectionSynced({
      connectionId: connection.id,
      syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
      status: "connected",
    });

    await bankingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "bank_connection.synced",
      entityType: "bank_connection",
      entityId: connection.id,
      metadata: {
        provider: provider.provider,
        accountsSynced: accounts.length,
        transactionsImported: transactions.length,
        duplicateCount,
      },
    });

    await bankingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "bank_connection.synced",
      version: 1,
      payload: {
        connectionId: connection.id,
        transactionIds: transactions.map((transaction) => transaction.id),
      },
    });

    const result = {
      connection: syncedConnection,
      accounts,
      syncRun: completedSyncRun,
      transactions,
      duplicateCount,
      replayed: false,
    };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: syncBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listDocuments(
  repository: DawnRepository,
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
  repository: DawnRepository,
  signer: DocumentUrlSigner,
  context: TransactionReviewContext,
  command: CreateDocumentUploadCommand,
): Promise<CreateDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DawnRepository;

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
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CompleteDocumentUploadCommand,
): Promise<CompleteDocumentUploadResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as DawnRepository;

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
  repository: DawnRepository,
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
  repository: DawnRepository,
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

export async function runDocumentExtraction(
  repository: DawnRepository,
  extractor: DocumentExtractionProvider,
  context: TransactionReviewContext,
  command: RunDocumentExtractionCommand,
): Promise<RunDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Inbox item not found");

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      inboxItemId: command.inboxItemId,
      documentId: command.documentId,
      versionId: command.versionId,
      extractor: extractor.source,
    });
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

export async function correctDocumentExtraction(
  repository: DawnRepository,
  context: TransactionReviewContext,
  command: CorrectDocumentExtractionCommand,
): Promise<CorrectDocumentExtractionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const inboxRepository = transactionRepository as DawnRepository;

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

async function importProviderTransaction(input: {
  repository: BankingUseCaseRepository;
  provider: BankingProvider;
  connection: BankConnection;
  bankAccount: BankAccount;
  providerTransaction: BankingProviderTransaction;
}) {
  const draft = providerTransactionToLedgerDraft({
    teamId: input.connection.teamId,
    ledgerAccountId: input.bankAccount.ledgerAccountId,
    provider: input.provider.provider,
    providerConnectionId: input.connection.providerConnectionId,
    transaction: input.providerTransaction,
  });
  const providerTransactionId = draft.providerTransactionId;

  if (!providerTransactionId) {
    throw new AppError("CONFLICT", "Provider transaction id is required");
  }

  const providerDuplicate = await input.repository.getTransactionByProviderTransactionId(
    draft.teamId,
    providerTransactionId,
  );

  if (providerDuplicate) {
    await input.repository.upsertProviderObject({
      teamId: draft.teamId,
      provider: input.provider.provider,
      providerObjectType: "transaction",
      providerObjectId: providerTransactionId,
      connectionId: input.connection.id,
      bankAccountId: input.bankAccount.id,
      internalEntityType: "transaction",
      internalEntityId: providerDuplicate.id,
      rawPayload: input.providerTransaction.rawPayload,
    });
    return null;
  }

  const duplicateKey = ledgerDuplicateKey(draft);
  const duplicate = await input.repository.getTransactionByDuplicateKey(draft.teamId, duplicateKey);

  if (duplicate) {
    await input.repository.upsertProviderObject({
      teamId: draft.teamId,
      provider: input.provider.provider,
      providerObjectType: "transaction",
      providerObjectId: providerTransactionId,
      connectionId: input.connection.id,
      bankAccountId: input.bankAccount.id,
      internalEntityType: "transaction",
      internalEntityId: duplicate.id,
      rawPayload: input.providerTransaction.rawPayload,
    });
    return null;
  }

  const transaction = await input.repository.createLedgerTransactionForTeam({
    draft,
    duplicateKey,
  });

  await input.repository.upsertProviderObject({
    teamId: draft.teamId,
    provider: input.provider.provider,
    providerObjectType: "transaction",
    providerObjectId: providerTransactionId,
    connectionId: input.connection.id,
    bankAccountId: input.bankAccount.id,
    internalEntityType: "transaction",
    internalEntityId: transaction.id,
    rawPayload: input.providerTransaction.rawPayload,
  });

  return transaction;
}

function persistedProviderConnection(connection: BankConnection): BankingProviderConnection {
  if (connection.status !== "connected") {
    throw new AppError("CONFLICT", "Bank connection is not connected");
  }

  return {
    provider: connection.provider,
    providerConnectionId: connection.providerConnectionId,
    institutionName: connection.institutionName,
    status: "connected",
    rawPayload: {},
  };
}

export function connectMockBankConnectionFingerprint(
  command: ConnectMockBankConnectionCommand,
  provider: BankingProviderName,
) {
  return JSON.stringify({
    teamId: command.teamId,
    provider,
  });
}

export function syncBankConnectionFingerprint(
  command: SyncBankConnectionCommand,
  provider: BankingProviderName,
) {
  return JSON.stringify({
    teamId: command.teamId,
    connectionId: command.connectionId,
    provider,
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

export async function previewCsvTransactionImport(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: PreviewCsvTransactionImportCommand,
): Promise<CsvTransactionImportPreview> {
  assertCommandTeamMatchesContext(context, command.teamId, "CSV import not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "transactions.write",
    "You cannot import transactions for this team",
  );

  const account = await repository.getLedgerAccountForTeam(command.teamId, command.accountId);

  if (!account) {
    throw new AppError("NOT_FOUND", "Ledger account not found");
  }

  if (command.mapping.categoryId) {
    const category = await repository.getCategoryForTeam(
      command.teamId,
      command.mapping.categoryId,
    );

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }
  }

  return buildCsvImportPreview(repository, command, account);
}

export async function commitCsvTransactionImport(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: CommitCsvTransactionImportCommand,
): Promise<CommitCsvTransactionImportResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "CSV import not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot import transactions for this team",
    );

    const fingerprint = csvTransactionImportFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      commitCsvTransactionImportOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different CSV import",
        );
      }

      return { ...(replayed.result as CommitCsvTransactionImportResult), replayed: true };
    }

    const account = await transactionRepository.getLedgerAccountForTeam(
      command.teamId,
      command.accountId,
    );

    if (!account) {
      throw new AppError("NOT_FOUND", "Ledger account not found");
    }

    if (command.mapping.categoryId) {
      const category = await transactionRepository.getCategoryForTeam(
        command.teamId,
        command.mapping.categoryId,
      );

      if (!category) {
        throw new AppError("NOT_FOUND", "Category not found");
      }
    }

    const preview = await buildCsvImportPreview(transactionRepository, command, account);
    const readyRows = preview.rows.filter((row) => row.status === "ready" && row.draft);

    if (readyRows.length === 0) {
      throw new AppError("CONFLICT", "CSV import has no rows ready to commit");
    }

    const transactions: Transaction[] = [];

    for (const row of readyRows) {
      if (!row.draft || !row.duplicateKey) {
        continue;
      }

      transactions.push(
        await transactionRepository.createLedgerTransactionForTeam({
          draft: row.draft,
          duplicateKey: row.duplicateKey,
        }),
      );
    }

    const importSession = await transactionRepository.createTransactionImportSession({
      teamId: command.teamId,
      accountId: command.accountId,
      actorId: context.actor.id,
      fileName: command.fileName ?? null,
      mapping: command.mapping,
      rowCount: preview.totalRows,
      importedCount: transactions.length,
      duplicateCount: preview.duplicateCount,
      invalidCount: preview.invalidCount,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction_import.committed",
      entityType: "transaction_import",
      entityId: importSession.id,
      metadata: {
        accountId: command.accountId,
        importedCount: transactions.length,
        duplicateCount: preview.duplicateCount,
        invalidCount: preview.invalidCount,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction_import.committed",
      version: 1,
      payload: {
        importSessionId: importSession.id,
        transactionIds: transactions.map((transaction) => transaction.id),
        accountId: command.accountId,
      },
    });

    const result = { importSession, transactions, preview, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: commitCsvTransactionImportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function csvTransactionImportFingerprint(command: CommitCsvTransactionImportCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    accountId: command.accountId,
    csvText: command.csvText,
    mapping: command.mapping,
    fileName: command.fileName ?? null,
  });
}

async function buildCsvImportPreview(
  repository: TransactionReviewRepository,
  command: PreviewCsvTransactionImportCommand,
  account: LedgerAccount,
): Promise<CsvTransactionImportPreview> {
  let rows;

  try {
    rows = parseCsvTransactionRows(command.csvText);
  } catch (error) {
    throw new AppError(
      "CONFLICT",
      error instanceof Error ? error.message : "CSV import file is invalid",
    );
  }

  const seenDuplicateKeys = new Set<string>();
  const previewRows: CsvTransactionImportPreviewRow[] = [];

  for (const row of rows) {
    try {
      const draft = csvRowToLedgerDraft({
        teamId: command.teamId,
        accountId: command.accountId,
        accountCurrency: account.currency,
        mapping: command.mapping,
        row,
        categoryId: command.mapping.categoryId ?? null,
      });
      const duplicateKey = ledgerDuplicateKey(draft);
      const duplicateInFile = seenDuplicateKeys.has(duplicateKey);
      const duplicateInLedger = duplicateInFile
        ? null
        : await repository.getTransactionByDuplicateKey(command.teamId, duplicateKey);

      seenDuplicateKeys.add(duplicateKey);

      previewRows.push({
        rowNumber: row.rowNumber,
        values: row.values,
        status: duplicateInFile || duplicateInLedger ? "duplicate" : "ready",
        errors: duplicateInFile
          ? ["Duplicate row in this file"]
          : duplicateInLedger
            ? ["Duplicate transaction already exists"]
            : [],
        duplicateKey,
        draft,
      });
    } catch (error) {
      previewRows.push({
        rowNumber: row.rowNumber,
        values: row.values,
        status: "invalid",
        errors: [error instanceof Error ? error.message : "CSV row is invalid"],
        duplicateKey: null,
        draft: null,
      });
    }
  }

  return {
    teamId: command.teamId,
    accountId: command.accountId,
    rows: previewRows,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    duplicateCount: previewRows.filter((row) => row.status === "duplicate").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length,
  };
}

function normalizeLedgerTransactionDraft(
  command: CreateLedgerTransactionCommand,
): LedgerTransactionDraft {
  const draft = {
    teamId: command.teamId,
    accountId: command.accountId,
    description: command.description.trim(),
    postedAt: new Date(command.postedAt).toISOString(),
    money: command.money,
    type: command.type,
    source: command.source,
    categoryId: command.categoryId ?? null,
    counterpartyId: command.counterpartyId ?? null,
    providerTransactionId: command.providerTransactionId?.trim() || null,
    splits: command.splits ?? [],
    tagIds: command.tagIds ?? [],
  } satisfies LedgerTransactionDraft;

  assertLedgerTransactionDraft(draft);

  return draft;
}

export async function inviteTeamMember(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: InviteTeamMemberCommand,
): Promise<InviteTeamMemberResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot invite members to this team",
    );

    const normalizedEmail = normalizeInviteEmail(command.email);
    assertInvitableRole(command.role);
    const fingerprint = inviteTeamMemberFingerprint({ ...command, email: normalizedEmail });

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      inviteTeamMemberOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different invite");
      }

      return { ...(replayed.result as InviteTeamMemberResult), replayed: true };
    }

    const invite = await transactionRepository.createTeamInvite({
      teamId: command.teamId,
      email: normalizedEmail,
      role: command.role,
      invitedByActorId: context.actor.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_invited",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_invited",
      version: 1,
      payload: {
        inviteId: invite.id,
        email: invite.email,
        role: invite.role,
      },
    });

    const result = { invite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: inviteTeamMemberOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listTeamDirectory(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<TeamDirectory> {
  const access = await resolveTeamAccess(
    repository,
    context,
    "team.manage",
    "You cannot manage members for this team",
  );
  const [members, pendingInvites] = await Promise.all([
    repository.listTeamMembers(access.teamId),
    repository.listPendingTeamInvites(access.teamId),
  ]);

  return {
    teamId: access.teamId,
    members,
    pendingInvites,
  };
}

export async function acceptTeamInvite(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: AcceptTeamInviteCommand,
): Promise<AcceptTeamInviteResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invite = await transactionRepository.getTeamInvite(command.inviteId);

    if (!invite) {
      throw new AppError("NOT_FOUND", "Team invite not found");
    }

    const fingerprint = acceptTeamInviteFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      invite.teamId,
      context.actor.id,
      acceptTeamInviteOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invite acceptance",
        );
      }

      return { ...(replayed.result as AcceptTeamInviteResult), replayed: true };
    }

    assertActorCanAcceptInvite(context.actor, invite);

    const existingMembership = await transactionRepository.getMembership(
      context.actor,
      invite.teamId,
    );

    if (existingMembership) {
      throw new AppError("CONFLICT", "You already belong to this team");
    }

    const membership = await transactionRepository.addTeamMembership({
      teamId: invite.teamId,
      userId: context.actor.id,
      role: invite.role,
    });
    const acceptedInvite = await transactionRepository.markTeamInviteAccepted({
      inviteId: invite.id,
      acceptedAt: new Date(),
    });

    await transactionRepository.appendAuditEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.invite_accepted",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.invite_accepted",
      version: 1,
      payload: {
        inviteId: invite.id,
        userId: context.actor.id,
        role: invite.role,
      },
    });

    const result = { membership, invite: acceptedInvite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: invite.teamId,
      actorId: context.actor.id,
      operation: acceptTeamInviteOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateTeamMemberRole(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: UpdateTeamMemberRoleCommand,
): Promise<UpdateTeamMemberRoleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team member not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot manage members for this team",
    );

    if (context.actor.id === command.userId) {
      throw new AppError("CONFLICT", "You cannot update your own role");
    }

    assertManagedRole(command.role);

    const fingerprint = updateTeamMemberRoleFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateTeamMemberRoleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different role update",
        );
      }

      return { ...(replayed.result as UpdateTeamMemberRoleResult), replayed: true };
    }

    const existingMembership = await transactionRepository.getTeamMemberByUserId(
      command.teamId,
      command.userId,
    );

    if (!existingMembership) {
      throw new AppError("NOT_FOUND", "Team member not found");
    }

    assertManagedRole(existingMembership.role);

    const membership = await transactionRepository.updateTeamMemberRole({
      teamId: command.teamId,
      userId: command.userId,
      role: command.role,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_role_updated",
      entityType: "team_membership",
      entityId: membership.id,
      metadata: {
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_role_updated",
      version: 1,
      payload: {
        membershipId: membership.id,
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    const result = { membership, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateTeamMemberRoleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function resolveTeamAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  permission: Permission,
  forbiddenMessage = "You cannot access this team",
): Promise<ResolvedTeamAccess> {
  const defaultWorkspace = context.teamId
    ? null
    : await repository.ensureDefaultWorkspace(context.actor);
  const teamId = context.teamId ?? defaultWorkspace?.teamId;

  if (!teamId) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  const membership = await repository.getMembership(context.actor, teamId);

  if (!membership || !roleHasPermission(membership.role, permission)) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  return {
    teamId,
    role: membership.role,
    permissions: permissionsForRole(membership.role),
  };
}

function assertActorCanAcceptInvite(actor: Actor, invite: TeamInvite) {
  const actorEmail = actor.email ? normalizeInviteEmail(actor.email) : null;

  if (!actorEmail || actorEmail !== invite.email) {
    throw new AppError("FORBIDDEN", "You cannot accept this team invite");
  }

  if (invite.status !== "pending") {
    throw new AppError("CONFLICT", "Team invite is not pending");
  }

  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new AppError("CONFLICT", "Team invite has expired");
  }
}

function normalizeInviteEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("CONFLICT", "Invite email is invalid");
  }

  return normalizedEmail;
}

export function acceptTeamInviteFingerprint(command: AcceptTeamInviteCommand) {
  return JSON.stringify({
    inviteId: command.inviteId,
  });
}

export function inviteTeamMemberFingerprint(command: InviteTeamMemberCommand) {
  assertInvitableRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    email: normalizeInviteEmail(command.email),
    role: command.role,
  });
}

export function updateTeamMemberRoleFingerprint(command: UpdateTeamMemberRoleCommand) {
  assertManagedRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    userId: command.userId,
    role: command.role,
  });
}

function assertInvitableRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role cannot be assigned by invite");
  }
}

function assertManagedRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role changes require ownership transfer");
  }
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Outbox dispatch failed";
}
