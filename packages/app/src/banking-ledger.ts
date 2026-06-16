import type {
  Actor,
  Category,
  Counterparty,
  LedgerAccount,
  LedgerTransactionDraft,
  Money,
  Permission,
  ReportTotals,
  TeamRole,
  Transaction,
  TransactionAccountantStatus,
  TransactionTag,
} from "@dawn/domain";
import {
  applyTransactionReview,
  assertLedgerTransactionDraft,
  createReportTotals,
  csvRowToLedgerDraft,
  detectCsvTransactionColumnMapping,
  deriveTransactionAccountantStatus,
  ledgerDuplicateKey,
  parseCsvTransactionRows,
} from "@dawn/domain";
import type {
  BankingProvider,
  BankingProviderAccount,
  BankingProviderConnection,
  BankingProviderConnectionSession,
  BankingProviderName,
  BankingProviderTransaction,
  BankingProviderWebhookVerification,
} from "@dawn/integrations";
import { providerTransactionToLedgerDraft } from "@dawn/integrations";
import type { TransactionSyncResponse } from "@dawn/sync";
import { buildTransactionSyncResponse, transactionSyncCollectionContract } from "@dawn/sync";

import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type ReviewWorkspace = {
  teamId: string;
  teamName: string;
  role: TeamRole;
  permissions: readonly Permission[];
  categories: Category[];
  transactions: Transaction[];
  sync: {
    collection: typeof transactionSyncCollectionContract.collection.id;
    cursor: string | null;
    conflictPolicy: typeof transactionSyncCollectionContract.collection.conflictPolicy;
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

export type UpdateTransactionAccountantStatusAction =
  | "exclude"
  | "archive"
  | "unarchive"
  | "mark_exporting"
  | "mark_exported"
  | "mark_export_failed"
  | "retry_export";

export type UpdateTransactionAccountantStatusCommand = {
  teamId: string;
  transactionId: string;
  action: UpdateTransactionAccountantStatusAction;
  reason?: string | null;
  idempotencyKey: string;
};

export type UpdateTransactionAccountantStatusResult = {
  transaction: Transaction;
  previousStatus: TransactionAccountantStatus;
  nextStatus: TransactionAccountantStatus;
  replayed: boolean;
};

export type CreateLedgerTransactionCommand = LedgerTransactionDraft & {
  idempotencyKey: string;
};

export type CreateLedgerTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type CreateLedgerCounterpartyCommand = {
  teamId: string;
  name: string;
  idempotencyKey: string;
};

export type CreateLedgerCounterpartyResult = {
  counterparty: Counterparty;
  replayed: boolean;
};

export type CreateTransactionTagCommand = {
  teamId: string;
  name: string;
  idempotencyKey: string;
};

export type CreateTransactionTagResult = {
  tag: TransactionTag;
  replayed: boolean;
};

export type CreateLedgerTransferPairCommand = {
  teamId: string;
  fromAccountId: string;
  toAccountId: string;
  postedAt: string;
  description: string;
  money: Money;
  tagIds?: readonly string[];
  idempotencyKey: string;
};

export type CreateLedgerTransferPairResult = {
  transferGroupId: string;
  fromTransaction: Transaction;
  toTransaction: Transaction;
  replayed: boolean;
};

export type LedgerSummary = {
  teamId: string;
  accounts: LedgerAccount[];
  counterparties: Counterparty[];
  tags: TransactionTag[];
  totals: ReportTotals;
  transactionCount: number;
};

export type CsvTransactionImportMapping = import("@dawn/domain").CsvTransactionColumnMapping & {
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

export type CommitCsvTransactionImportOptions = {
  payloadStorage?: TransactionImportPayloadStorage;
  synchronousRowLimit?: number;
};

export type CsvTransactionImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string>;
  status: "ready" | "duplicate" | "invalid";
  errors: string[];
  duplicateKey: string | null;
  draft: LedgerTransactionDraft | null;
};

export type CsvTransactionImportPreviewSummary = {
  readyDateRange: { from: string; to: string } | null;
  readyCurrencyTotals: Record<string, Money>;
  readyIncomeCount: number;
  readyExpenseCount: number;
  readyZeroAmountCount: number;
};

export type CsvTransactionImportPreview = {
  teamId: string;
  accountId: string;
  headers: string[];
  detectedMapping: CsvTransactionImportMapping;
  rows: CsvTransactionImportPreviewRow[];
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  summary: CsvTransactionImportPreviewSummary;
};

export type TransactionImportSession = {
  id: string;
  teamId: string;
  accountId: string;
  source: "csv";
  fileName: string | null;
  status: "queued" | "committed" | "failed";
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export type StoredTransactionImportPayload = {
  body: string;
  contentType: string;
  byteSize: number;
};

export type TransactionImportPayloadStorage = {
  put(input: { objectKey: string; body: string; contentType: string }): Promise<void>;
  get(objectKey: string): Promise<StoredTransactionImportPayload | null>;
  delete(objectKey: string): Promise<void>;
};

export type QueuedCsvTransactionImportPayload = {
  schemaVersion: 1;
  teamId: string;
  accountId: string;
  actor: Actor;
  fileName: string | null;
  csvText: string;
  mapping: CsvTransactionImportMapping;
};

export type QueuedCsvTransactionImportJob = {
  payloadObjectKey: string;
};

export type RunQueuedCsvTransactionImportCommand = {
  teamId: string;
  importSessionId: string;
  payloadObjectKey: string;
  sourceOutboxEventId: string;
  idempotencyKey: string;
};

export type BankConnectionStatus = "connected" | "disconnected" | "error";

export type BankConnection = {
  id: string;
  teamId: string;
  provider: BankingProviderName;
  providerConnectionId: string;
  institutionName: string;
  status: BankConnectionStatus;
  tokenKeyId?: string | null;
  tokenLastFour?: string | null;
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

export type BankingProviderDescriptor = {
  provider: BankingProviderName;
  displayName: string;
  environment: BankingProvider["environment"];
  capabilities: readonly string[];
};

export type BankingProviderRegistry = {
  listProviders(): readonly BankingProvider[];
  requireProvider(providerName: BankingProviderName | string | null | undefined): BankingProvider;
};

export type BankingProviderSource =
  | BankingProviderRegistry
  | readonly BankingProvider[]
  | BankingProvider;

export function createBankingProviderRegistry(
  providers: readonly BankingProvider[],
): BankingProviderRegistry {
  const providerList = [...providers];
  const providersByName = new Map<string, BankingProvider>(
    providerList.map((provider) => [provider.provider, provider] as const),
  );

  return {
    listProviders() {
      return providerList;
    },
    requireProvider(providerName) {
      const provider = providerName ? providersByName.get(providerName) : null;

      if (!provider) {
        throw new AppError("NOT_FOUND", "Bank provider not found");
      }

      return provider;
    },
  };
}

export type ConnectMockBankConnectionCommand = {
  teamId: string;
  idempotencyKey: string;
};

export type ConnectMockBankConnectionResult = {
  connection: BankConnection;
  replayed: boolean;
};

export type CreateBankConnectionSessionCommand = {
  teamId: string;
  provider: BankingProviderName;
  redirectUrl: string;
  idempotencyKey: string;
};

export type CreateBankConnectionSessionResult = {
  session: BankingProviderConnectionSession;
  replayed: boolean;
};

export type CompleteBankConnectionCommand = {
  teamId: string;
  provider: BankingProviderName;
  providerSessionId: string;
  publicToken: string;
  idempotencyKey: string;
};

export type CompleteBankConnectionResult = {
  connection: BankConnection;
  replayed: boolean;
};

export type SyncBankConnectionCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
};

export type SyncBankConnectionResult = {
  connection: BankConnection;
  accounts: BankAccount[];
  syncRun: ProviderSyncRun;
  transactions: Transaction[];
  duplicateCount: number;
  replayed: boolean;
};

export type RequestBankConnectionSyncFromWebhookCommand = {
  teamId: string;
  verification: BankingProviderWebhookVerification;
  idempotencyKey: string;
};

export type RequestBankConnectionSyncFromWebhookResult = {
  connection: BankConnection;
  eventType: string;
  replayed: boolean;
};

export type DisconnectBankConnectionCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type DisconnectBankConnectionResult = {
  connection: BankConnection;
  replayed: boolean;
};

export type CommitCsvTransactionImportResult = {
  mode: "committed" | "queued";
  importSession: TransactionImportSession;
  transactions: Transaction[];
  preview: CsvTransactionImportPreview;
  replayed: boolean;
  queuedJob?: QueuedCsvTransactionImportJob;
};

export type BankingRepository = {
  listBankConnectionSummaries(teamId: string): Promise<BankConnectionSummary[]>;
  getBankConnectionForTeam(teamId: string, connectionId: string): Promise<BankConnection | null>;
  getBankConnectionByProviderConnectionId(
    teamId: string,
    provider: BankingProviderName,
    providerConnectionId: string,
  ): Promise<BankConnection | null>;
  upsertBankConnection(input: {
    teamId: string;
    providerConnection: BankingProviderConnection;
  }): Promise<BankConnection>;
  disconnectBankConnection(input: {
    connectionId: string;
    disconnectedAt: Date;
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

export type BankingUseCaseRepository = TransactionReviewRepository & BankingRepository;

export type LedgerMetadataRepository = {
  listCounterparties(teamId: string): Promise<Counterparty[]>;
  listTransactionTags(teamId: string): Promise<TransactionTag[]>;
  getCounterpartyForTeam(teamId: string, counterpartyId: string): Promise<Counterparty | null>;
  getTransactionTagForTeam(teamId: string, tagId: string): Promise<TransactionTag | null>;
  upsertCounterparty(input: { teamId: string; name: string }): Promise<Counterparty>;
  upsertTransactionTag(input: { teamId: string; name: string }): Promise<TransactionTag>;
};

export type LedgerRepository = TransactionReviewRepository & LedgerMetadataRepository;

export type TransactionAccountantLifecycleRepository = TransactionReviewRepository & {
  countTransactionAttachmentsForTeam(input: {
    teamId: string;
    transactionId: string;
  }): Promise<number>;
  updateTransactionAccountantStatusForTeam(input: {
    teamId: string;
    transactionId: string;
    accountantStatus: TransactionAccountantStatus;
    reason?: string | null;
  }): Promise<Transaction>;
};

const reviewTransactionOperation = "transaction.review";
const updateTransactionAccountantStatusOperation = "transaction.accountant_status.update";
const createLedgerTransactionOperation = "ledger.transaction.create";
const createLedgerCounterpartyOperation = "ledger.counterparty.create";
const createTransactionTagOperation = "ledger.transaction_tag.create";
const createLedgerTransferPairOperation = "ledger.transfer_pair.create";
const commitCsvTransactionImportOperation = "csv_transaction_import.commit";
const runQueuedCsvTransactionImportOperation = "csv_transaction_import.queued_commit";
const connectMockBankConnectionOperation = "banking.connection.mock.connect";
const createBankConnectionSessionOperation = "banking.connection.session.create";
const completeBankConnectionOperation = "banking.connection.complete";
const syncBankConnectionOperation = "banking.connection.sync";
const requestBankConnectionSyncFromWebhookOperation = "banking.connection.webhook.sync.request";
const disconnectBankConnectionOperation = "banking.connection.disconnect";
export const csvTransactionImportSynchronousRowLimit = 500;
export const csvTransactionImportPayloadContentType = "application/json; charset=utf-8";

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
    transactionSyncCollectionContract.authorization.permission,
    transactionSyncCollectionContract.authorization.syncForbiddenMessage,
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

    const reviewedTransaction = await transactionRepository.updateTransactionReviewForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
      categoryId: reviewChange.transaction.categoryId ?? category.id,
      reviewState: reviewChange.transaction.reviewState,
    });
    const updatedTransaction = await updateDerivedAccountantStatusIfSupported(
      transactionRepository,
      command.teamId,
      reviewedTransaction,
    );

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

export async function updateTransactionAccountantStatus(
  repository: TransactionAccountantLifecycleRepository,
  context: TransactionReviewContext,
  command: UpdateTransactionAccountantStatusCommand,
): Promise<UpdateTransactionAccountantStatusResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const lifecycleRepository = transactionRepository as TransactionAccountantLifecycleRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Transaction not found");

    await resolveTeamAccess(
      lifecycleRepository,
      { ...context, teamId: command.teamId },
      "transactions.export",
      "You cannot update accountant transaction status for this team",
    );

    const fingerprint = updateTransactionAccountantStatusFingerprint(command);
    const replayed = await lifecycleRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateTransactionAccountantStatusOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different accountant status update",
        );
      }

      return {
        ...(replayed.result as UpdateTransactionAccountantStatusResult),
        replayed: true,
      };
    }

    const transaction = await lifecycleRepository.getTransactionForTeam(
      command.teamId,
      command.transactionId,
    );

    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const attachmentCount = await lifecycleRepository.countTransactionAttachmentsForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
    });
    const previousStatus = deriveTransactionAccountantStatus({
      transaction,
      acceptedAttachmentCount: attachmentCount,
    });
    const nextStatus = nextAccountantStatusForAction({
      action: command.action,
      transaction,
      attachmentCount,
    });
    const updatedTransaction = await lifecycleRepository.updateTransactionAccountantStatusForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
      accountantStatus: nextStatus,
      reason: normalizedAccountantStatusReason(command.reason),
    });

    await lifecycleRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: `transaction.accountant_status.${command.action}`,
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        previousStatus,
        nextStatus,
        reason: normalizedAccountantStatusReason(command.reason),
      },
    });

    await lifecycleRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.accountant_status_changed",
      version: 1,
      payload: {
        transactionId: transaction.id,
        previousStatus,
        nextStatus,
        action: command.action,
      },
    });

    const result = {
      transaction: updatedTransaction,
      previousStatus,
      nextStatus,
      replayed: false,
    };

    await lifecycleRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateTransactionAccountantStatusOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function updateTransactionAccountantStatusFingerprint(
  command: UpdateTransactionAccountantStatusCommand,
) {
  return JSON.stringify({
    teamId: command.teamId,
    transactionId: command.transactionId,
    action: command.action,
    reason: normalizedAccountantStatusReason(command.reason),
  });
}

async function updateDerivedAccountantStatusIfSupported(
  repository: TransactionReviewRepository,
  teamId: string,
  transaction: Transaction,
) {
  if (!isTransactionAccountantLifecycleRepository(repository)) {
    return transaction;
  }

  const attachmentCount = await repository.countTransactionAttachmentsForTeam({
    teamId,
    transactionId: transaction.id,
  });
  const nextStatus = deriveTransactionAccountantStatus({
    transaction,
    acceptedAttachmentCount: attachmentCount,
  });

  if (transaction.accountantStatus === nextStatus) {
    return transaction;
  }

  return repository.updateTransactionAccountantStatusForTeam({
    teamId,
    transactionId: transaction.id,
    accountantStatus: nextStatus,
    reason: null,
  });
}

function nextAccountantStatusForAction(input: {
  action: UpdateTransactionAccountantStatusAction;
  transaction: Transaction;
  attachmentCount: number;
}): TransactionAccountantStatus {
  if (input.action === "exclude") {
    return "excluded";
  }

  if (input.action === "archive") {
    return "archived";
  }

  if (input.action === "mark_exporting") {
    return "exporting";
  }

  if (input.action === "mark_exported") {
    return "exported";
  }

  if (input.action === "mark_export_failed") {
    return "export_failed";
  }

  return deriveTransactionAccountantStatus({
    transaction: {
      ...input.transaction,
      accountantStatus: "needs_review",
    },
    acceptedAttachmentCount: input.attachmentCount,
  });
}

function normalizedAccountantStatusReason(reason: string | null | undefined) {
  return reason?.trim() || null;
}

function isTransactionAccountantLifecycleRepository(
  repository: TransactionReviewRepository,
): repository is TransactionAccountantLifecycleRepository {
  return (
    "countTransactionAttachmentsForTeam" in repository &&
    "updateTransactionAccountantStatusForTeam" in repository
  );
}

export async function listLedgerSummary(
  repository: LedgerRepository,
  context: TransactionReviewContext,
  input: { teamId?: string; accountId?: string; from?: string; to?: string } = {},
): Promise<LedgerSummary> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read ledger data for this team",
  );
  const [accounts, counterparties, tags, transactions] = await Promise.all([
    repository.listLedgerAccounts(access.teamId),
    repository.listCounterparties(access.teamId),
    repository.listTransactionTags(access.teamId),
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
    counterparties,
    tags,
    totals: createReportTotals(transactions, currency),
    transactionCount: transactions.length,
  };
}

export async function createLedgerCounterparty(
  repository: LedgerRepository,
  context: TransactionReviewContext,
  command: CreateLedgerCounterpartyCommand,
): Promise<CreateLedgerCounterpartyResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const ledgerRepository = transactionRepository as LedgerRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Counterparty not found");

    await resolveTeamAccess(
      ledgerRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot manage ledger counterparties for this team",
    );

    const name = normalizeLedgerMetadataName(command.name, "Counterparty name is required");
    const fingerprint = JSON.stringify({ teamId: command.teamId, name });
    const replayed = await ledgerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createLedgerCounterpartyOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different counterparty",
        );
      }

      return { ...(replayed.result as CreateLedgerCounterpartyResult), replayed: true };
    }

    const counterparty = await ledgerRepository.upsertCounterparty({
      teamId: command.teamId,
      name,
    });

    await ledgerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "ledger.counterparty.created",
      entityType: "counterparty",
      entityId: counterparty.id,
      metadata: { name },
    });

    const result = { counterparty, replayed: false };

    await ledgerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createLedgerCounterpartyOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createTransactionTag(
  repository: LedgerRepository,
  context: TransactionReviewContext,
  command: CreateTransactionTagCommand,
): Promise<CreateTransactionTagResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const ledgerRepository = transactionRepository as LedgerRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Transaction tag not found");

    await resolveTeamAccess(
      ledgerRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot manage transaction tags for this team",
    );

    const name = normalizeLedgerMetadataName(command.name, "Transaction tag name is required");
    const fingerprint = JSON.stringify({ teamId: command.teamId, name });
    const replayed = await ledgerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createTransactionTagOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different transaction tag",
        );
      }

      return { ...(replayed.result as CreateTransactionTagResult), replayed: true };
    }

    const tag = await ledgerRepository.upsertTransactionTag({
      teamId: command.teamId,
      name,
    });

    await ledgerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "ledger.transaction_tag.created",
      entityType: "transaction_tag",
      entityId: tag.id,
      metadata: { name },
    });

    const result = { tag, replayed: false };

    await ledgerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createTransactionTagOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createLedgerTransaction(
  repository: LedgerRepository,
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

    await validateLedgerDraftReferences(transactionRepository as LedgerRepository, draft);

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

export async function createLedgerTransferPair(
  repository: LedgerRepository,
  context: TransactionReviewContext,
  command: CreateLedgerTransferPairCommand,
): Promise<CreateLedgerTransferPairResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const ledgerRepository = transactionRepository as LedgerRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Ledger transfer not found");

    await resolveTeamAccess(
      ledgerRepository,
      { ...context, teamId: command.teamId },
      "transactions.write",
      "You cannot create ledger transfers for this team",
    );

    const normalized = normalizeLedgerTransferPairCommand(command);
    const fingerprint = createLedgerTransferPairFingerprint(command);
    const replayed = await ledgerRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createLedgerTransferPairOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different ledger transfer",
        );
      }

      return { ...(replayed.result as CreateLedgerTransferPairResult), replayed: true };
    }

    const [fromAccount, toAccount] = await Promise.all([
      ledgerRepository.getLedgerAccountForTeam(command.teamId, normalized.fromAccountId),
      ledgerRepository.getLedgerAccountForTeam(command.teamId, normalized.toAccountId),
    ]);

    if (!fromAccount || !toAccount) {
      throw new AppError("NOT_FOUND", "Ledger account not found");
    }

    if (fromAccount.id === toAccount.id) {
      throw new AppError("CONFLICT", "Ledger transfer requires two different accounts");
    }

    if (
      fromAccount.currency !== toAccount.currency ||
      fromAccount.currency !== normalized.money.currency
    ) {
      throw new AppError("CONFLICT", "Ledger transfer currency must match both accounts");
    }

    await validateTransactionTags(ledgerRepository, command.teamId, normalized.tagIds ?? []);

    const transferGroupId = crypto.randomUUID();
    const fromDraft = normalizeLedgerTransactionDraft({
      teamId: command.teamId,
      accountId: fromAccount.id,
      description: `Transfer to ${toAccount.name}: ${normalized.description}`,
      postedAt: normalized.postedAt,
      money: {
        amountMinor: -Math.abs(normalized.money.amountMinor),
        currency: normalized.money.currency,
      },
      type: "transfer",
      source: "manual",
      transferGroupId,
      tagIds: normalized.tagIds,
      idempotencyKey: command.idempotencyKey,
    });
    const toDraft = normalizeLedgerTransactionDraft({
      teamId: command.teamId,
      accountId: toAccount.id,
      description: `Transfer from ${fromAccount.name}: ${normalized.description}`,
      postedAt: normalized.postedAt,
      money: {
        amountMinor: Math.abs(normalized.money.amountMinor),
        currency: normalized.money.currency,
      },
      type: "transfer",
      source: "manual",
      transferGroupId,
      tagIds: normalized.tagIds,
      idempotencyKey: command.idempotencyKey,
    });
    const [fromDuplicateKey, toDuplicateKey] = [
      ledgerDuplicateKey(fromDraft),
      ledgerDuplicateKey(toDraft),
    ];
    const [fromDuplicate, toDuplicate] = await Promise.all([
      ledgerRepository.getTransactionByDuplicateKey(command.teamId, fromDuplicateKey),
      ledgerRepository.getTransactionByDuplicateKey(command.teamId, toDuplicateKey),
    ]);

    if (fromDuplicate || toDuplicate) {
      throw new AppError("CONFLICT", "Ledger transfer duplicate key already exists");
    }

    const fromTransaction = await ledgerRepository.createLedgerTransactionForTeam({
      draft: fromDraft,
      duplicateKey: fromDuplicateKey,
    });
    const toTransaction = await ledgerRepository.createLedgerTransactionForTeam({
      draft: toDraft,
      duplicateKey: toDuplicateKey,
    });

    await ledgerRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "transaction.transfer_pair.created",
      entityType: "transfer_group",
      entityId: transferGroupId,
      metadata: {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: normalized.money,
        transactionIds: [fromTransaction.id, toTransaction.id],
      },
    });

    await ledgerRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.transfer_pair.created",
      version: 1,
      payload: {
        transferGroupId,
        transactionIds: [fromTransaction.id, toTransaction.id],
      },
    });

    const result = {
      transferGroupId,
      fromTransaction,
      toTransaction,
      replayed: false,
    };

    await ledgerRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createLedgerTransferPairOperation,
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
    transferGroupId: draft.transferGroupId ?? null,
    providerTransactionId: draft.providerTransactionId ?? null,
    splits: draft.splits ?? [],
    tagIds: draft.tagIds ?? [],
  });
}

export function createLedgerTransferPairFingerprint(command: CreateLedgerTransferPairCommand) {
  const normalized = normalizeLedgerTransferPairCommand(command);

  return JSON.stringify(normalized);
}

export async function listBankConnections(
  repository: BankingUseCaseRepository,
  providerSource: BankingProviderSource = [],
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<{
  teamId: string;
  providers: BankingProviderDescriptor[];
  connections: BankConnectionSummary[];
}> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read bank connections for this team",
  );

  return {
    teamId: access.teamId,
    providers: listBankingProviders(providerSource).map(bankingProviderDescriptor),
    connections: await repository.listBankConnectionSummaries(access.teamId),
  };
}

export async function createBankConnectionSession(
  repository: BankingUseCaseRepository,
  providerSource: BankingProviderSource,
  context: TransactionReviewContext,
  command: CreateBankConnectionSessionCommand,
): Promise<CreateBankConnectionSessionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank provider not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot connect bank providers for this team",
    );

    const provider = resolveBankingProvider(providerSource, command.provider);

    if (!provider.createConnectionSession) {
      throw new AppError("CONFLICT", "Bank provider does not support connection sessions");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      provider: provider.provider,
      redirectUrl: command.redirectUrl,
    });
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createBankConnectionSessionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank connection session",
        );
      }

      return { ...(replayed.result as CreateBankConnectionSessionResult), replayed: true };
    }

    const session = await provider.createConnectionSession({
      teamId: command.teamId,
      actorId: context.actor.id,
      redirectUrl: command.redirectUrl,
    });
    const result = { session, replayed: false };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createBankConnectionSessionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function completeBankConnection(
  repository: BankingUseCaseRepository,
  providerSource: BankingProviderSource,
  context: TransactionReviewContext,
  command: CompleteBankConnectionCommand,
): Promise<CompleteBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank provider not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot connect bank providers for this team",
    );

    const provider = resolveBankingProvider(providerSource, command.provider);

    if (!provider.exchangeConnectionSession) {
      throw new AppError("CONFLICT", "Bank provider does not support callback completion");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      provider: provider.provider,
      providerSessionId: command.providerSessionId,
    });
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      completeBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank callback",
        );
      }

      return { ...(replayed.result as CompleteBankConnectionResult), replayed: true };
    }

    const providerConnection = await provider.exchangeConnectionSession({
      teamId: command.teamId,
      actorId: context.actor.id,
      providerSessionId: command.providerSessionId,
      publicToken: command.publicToken,
    });
    const connection = await persistBankConnection({
      repository: bankingRepository,
      provider,
      context,
      teamId: command.teamId,
      providerConnection,
    });

    await appendBankSyncRequestedEvent({
      repository: bankingRepository,
      context,
      teamId: command.teamId,
      connection,
      action: "bank_connection.sync_requested",
      eventType: "connection_completed",
      rawPayload: providerConnection.rawPayload,
    });

    const result = { connection, replayed: false };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: completeBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function connectMockBankConnection(
  repository: BankingUseCaseRepository,
  providerSource: BankingProviderSource,
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

    const provider = resolveBankingProvider(providerSource, "mock-bank");
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
    const connection = await persistBankConnection({
      repository: bankingRepository,
      provider,
      context,
      teamId: command.teamId,
      providerConnection,
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
  providerSource: BankingProviderSource,
  context: TransactionReviewContext,
  command: SyncBankConnectionCommand,
): Promise<SyncBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    if (command.enforceCallerPermission !== false) {
      await resolveTeamAccess(
        bankingRepository,
        { ...context, teamId: command.teamId },
        "bank_connections.manage",
        "You cannot sync bank providers for this team",
      );
    }

    const connection = await bankingRepository.getBankConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    const provider = resolveBankingProvider(providerSource, connection.provider);
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

    const syncRun = await bankingRepository.createProviderSyncRun({
      teamId: command.teamId,
      connectionId: connection.id,
    });
    const providerConnection = persistedProviderConnection(connection);
    const accounts: BankAccount[] = [];
    const transactions: Transaction[] = [];
    let duplicateCount = 0;

    try {
      const providerAccounts = await provider.listAccounts(providerConnection);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bank provider sync failed";
      const failedSyncRun = await bankingRepository.finishProviderSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        accountsSynced: accounts.length,
        transactionsImported: transactions.length,
        duplicateCount,
        error: message,
      });
      await bankingRepository.markBankConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
        status: "error",
      });
      await bankingRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "bank_connection.sync_failed",
        entityType: "bank_connection",
        entityId: connection.id,
        metadata: {
          provider: provider.provider,
          error: message,
        },
      });
      throw new AppError("CONFLICT", message);
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

export async function requestBankConnectionSyncFromWebhook(
  repository: BankingUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestBankConnectionSyncFromWebhookCommand,
): Promise<RequestBankConnectionSyncFromWebhookResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    if (!command.verification.verified) {
      throw new AppError("FORBIDDEN", "Bank provider webhook signature is invalid");
    }

    if (command.verification.teamId !== command.teamId) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      provider: command.verification.provider,
      providerConnectionId: command.verification.providerConnectionId,
      eventType: command.verification.eventType,
    });
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestBankConnectionSyncFromWebhookOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank webhook",
        );
      }

      return {
        ...(replayed.result as RequestBankConnectionSyncFromWebhookResult),
        replayed: true,
      };
    }

    const connection = await bankingRepository.getBankConnectionByProviderConnectionId(
      command.teamId,
      command.verification.provider,
      command.verification.providerConnectionId,
    );

    if (!connection) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    await appendBankSyncRequestedEvent({
      repository: bankingRepository,
      context,
      teamId: command.teamId,
      connection,
      action: "bank_connection.webhook_sync_requested",
      eventType: command.verification.eventType,
      rawPayload: command.verification.rawPayload,
    });

    const result = {
      connection,
      eventType: command.verification.eventType,
      replayed: false,
    };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestBankConnectionSyncFromWebhookOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function disconnectBankConnection(
  repository: BankingUseCaseRepository,
  providerSource: BankingProviderSource,
  context: TransactionReviewContext,
  command: DisconnectBankConnectionCommand,
): Promise<DisconnectBankConnectionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const bankingRepository = transactionRepository as BankingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Bank connection not found");

    await resolveTeamAccess(
      bankingRepository,
      { ...context, teamId: command.teamId },
      "bank_connections.manage",
      "You cannot disconnect bank providers for this team",
    );

    const connection = await bankingRepository.getBankConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection) {
      throw new AppError("NOT_FOUND", "Bank connection not found");
    }

    const provider = resolveBankingProvider(providerSource, connection.provider);
    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      provider: provider.provider,
    });
    const replayed = await bankingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      disconnectBankConnectionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different bank disconnect",
        );
      }

      return { ...(replayed.result as DisconnectBankConnectionResult), replayed: true };
    }

    if (provider.disconnectConnection) {
      await provider.disconnectConnection(persistedProviderConnection(connection));
    }

    const disconnected = await bankingRepository.disconnectBankConnection({
      connectionId: connection.id,
      disconnectedAt: new Date(),
    });

    await bankingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "bank_connection.disconnected",
      entityType: "bank_connection",
      entityId: connection.id,
      metadata: {
        provider: provider.provider,
        providerConnectionId: connection.providerConnectionId,
      },
    });

    await bankingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "bank_connection.disconnected",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: provider.provider,
      },
    });

    const result = { connection: disconnected, replayed: false };

    await bankingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: disconnectBankConnectionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
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
    token: null,
    rawPayload: {},
  };
}

function bankingProviderDescriptor(provider: BankingProvider): BankingProviderDescriptor {
  return {
    provider: provider.provider,
    displayName: provider.displayName,
    environment: provider.environment,
    capabilities: provider.capabilities,
  };
}

function listBankingProviders(providerSource: BankingProviderSource) {
  return resolveBankingProviderRegistry(providerSource).listProviders();
}

function resolveBankingProvider(
  providerSource: BankingProviderSource,
  providerName: string | null | undefined,
) {
  return resolveBankingProviderRegistry(providerSource).requireProvider(providerName);
}

function resolveBankingProviderRegistry(
  providerSource: BankingProviderSource,
): BankingProviderRegistry {
  if (isBankingProviderRegistry(providerSource)) {
    return providerSource;
  }

  if (Array.isArray(providerSource)) {
    return createBankingProviderRegistry(providerSource);
  }

  const provider = providerSource as BankingProvider;
  return createBankingProviderRegistry([provider]);
}

function isBankingProviderRegistry(
  providerSource: BankingProviderSource,
): providerSource is BankingProviderRegistry {
  return (
    typeof providerSource === "object" &&
    providerSource !== null &&
    "listProviders" in providerSource &&
    "requireProvider" in providerSource
  );
}

async function persistBankConnection(input: {
  repository: BankingUseCaseRepository;
  provider: BankingProvider;
  context: TransactionReviewContext;
  teamId: string;
  providerConnection: BankingProviderConnection;
}) {
  const connection = await input.repository.upsertBankConnection({
    teamId: input.teamId,
    providerConnection: input.providerConnection,
  });

  await input.repository.upsertProviderObject({
    teamId: input.teamId,
    provider: input.provider.provider,
    providerObjectType: "connection",
    providerObjectId: input.providerConnection.providerConnectionId,
    connectionId: connection.id,
    internalEntityType: "bank_connection",
    internalEntityId: connection.id,
    rawPayload: input.providerConnection.rawPayload,
  });

  await input.repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    action: "bank_connection.connected",
    entityType: "bank_connection",
    entityId: connection.id,
    metadata: {
      provider: input.provider.provider,
      providerConnectionId: input.providerConnection.providerConnectionId,
      tokenKeyId: input.providerConnection.token?.keyId ?? null,
      tokenLastFour: input.providerConnection.token?.lastFour ?? null,
    },
  });

  await input.repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    type: "bank_connection.connected",
    version: 1,
    payload: {
      connectionId: connection.id,
      provider: input.provider.provider,
    },
  });

  return connection;
}

async function appendBankSyncRequestedEvent(input: {
  repository: BankingUseCaseRepository;
  context: TransactionReviewContext;
  teamId: string;
  connection: BankConnection;
  action: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
}) {
  await input.repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    action: input.action,
    entityType: "bank_connection",
    entityId: input.connection.id,
    metadata: {
      provider: input.connection.provider,
      providerConnectionId: input.connection.providerConnectionId,
      eventType: input.eventType,
    },
  });

  await input.repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: input.context.actor.id,
    requestId: input.context.requestId,
    type: "bank_connection.sync_requested",
    version: 1,
    payload: {
      connectionId: input.connection.id,
      provider: input.connection.provider,
      providerConnectionId: input.connection.providerConnectionId,
      eventType: input.eventType,
      rawPayload: input.rawPayload,
    },
  });
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
  options: CommitCsvTransactionImportOptions = {},
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

    const account = await validateCsvTransactionImportReferences(transactionRepository, command);

    const preview = await buildCsvImportPreview(transactionRepository, command, account);
    const readyRows = preview.rows.filter((row) => row.status === "ready" && row.draft);

    if (readyRows.length === 0) {
      throw new AppError("CONFLICT", "CSV import has no rows ready to commit");
    }

    const synchronousRowLimit =
      options.synchronousRowLimit ?? csvTransactionImportSynchronousRowLimit;

    if (preview.totalRows > synchronousRowLimit) {
      if (!options.payloadStorage) {
        throw new AppError(
          "CONFLICT",
          "Large CSV imports require configured transaction import payload storage",
        );
      }

      const result = await queueCsvTransactionImport(
        transactionRepository,
        context,
        command,
        preview,
        options.payloadStorage,
      );

      await transactionRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: commitCsvTransactionImportOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }

    const result = await commitCsvTransactionImportPreviewRows(transactionRepository, context, {
      command,
      preview,
      actorId: context.actor.id,
    });

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

export async function runQueuedCsvTransactionImport(
  repository: TransactionReviewRepository,
  payloadStorage: TransactionImportPayloadStorage,
  context: TransactionReviewContext,
  command: RunQueuedCsvTransactionImportCommand,
): Promise<CommitCsvTransactionImportResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "CSV import not found");

  const fingerprint = queuedCsvTransactionImportFingerprint(command);
  const replayed = await repository.getIdempotencyResult(
    command.teamId,
    context.actor.id,
    runQueuedCsvTransactionImportOperation,
    command.idempotencyKey,
  );

  if (replayed) {
    if (replayed.fingerprint !== fingerprint) {
      throw new AppError(
        "CONFLICT",
        "Idempotency key was already used for a different queued CSV import",
      );
    }

    await payloadStorage.delete(command.payloadObjectKey);
    return { ...(replayed.result as CommitCsvTransactionImportResult), replayed: true };
  }

  const storedPayload = await payloadStorage.get(command.payloadObjectKey);

  if (!storedPayload) {
    await markQueuedCsvTransactionImportFailed(repository, command);
    throw new AppError("NOT_FOUND", "Queued CSV import payload not found");
  }

  const payload = parseQueuedCsvTransactionImportPayload(storedPayload.body);

  if (
    payload.teamId !== command.teamId ||
    payloadObjectKeyForCsvTransactionImport(payload.teamId, command.importSessionId) !==
      command.payloadObjectKey
  ) {
    await markQueuedCsvTransactionImportFailed(repository, command);
    throw new AppError("CONFLICT", "Queued CSV import payload does not match this job");
  }

  const result = await repository.withTransaction(async (transactionRepository) => {
    const account = await validateCsvTransactionImportReferences(transactionRepository, payload);
    const preview = await buildCsvImportPreview(transactionRepository, payload, account);
    const queuedResult = await commitCsvTransactionImportPreviewRows(
      transactionRepository,
      context,
      {
        command: {
          teamId: payload.teamId,
          accountId: payload.accountId,
          csvText: payload.csvText,
          fileName: payload.fileName,
          mapping: payload.mapping,
          idempotencyKey: command.idempotencyKey,
        },
        preview,
        actorId: payload.actor.id,
        existingImportSessionId: command.importSessionId,
        allowEmptyCommit: true,
      },
    );

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: runQueuedCsvTransactionImportOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: queuedResult,
    });

    return queuedResult;
  });

  await payloadStorage.delete(command.payloadObjectKey);

  return result;
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

export function queuedCsvTransactionImportFingerprint(
  command: RunQueuedCsvTransactionImportCommand,
) {
  return JSON.stringify({
    teamId: command.teamId,
    importSessionId: command.importSessionId,
    payloadObjectKey: command.payloadObjectKey,
    sourceOutboxEventId: command.sourceOutboxEventId,
  });
}

async function validateCsvTransactionImportReferences(
  repository: TransactionReviewRepository,
  command: PreviewCsvTransactionImportCommand,
) {
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

  return account;
}

async function queueCsvTransactionImport(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: CommitCsvTransactionImportCommand,
  preview: CsvTransactionImportPreview,
  payloadStorage: TransactionImportPayloadStorage,
): Promise<CommitCsvTransactionImportResult> {
  const importSession = await repository.createTransactionImportSession({
    teamId: command.teamId,
    accountId: command.accountId,
    actorId: context.actor.id,
    fileName: command.fileName ?? null,
    mapping: command.mapping,
    status: "queued",
    rowCount: preview.totalRows,
    importedCount: 0,
    duplicateCount: preview.duplicateCount,
    invalidCount: preview.invalidCount,
  });
  const payloadObjectKey = payloadObjectKeyForCsvTransactionImport(
    command.teamId,
    importSession.id,
  );
  const payload: QueuedCsvTransactionImportPayload = {
    schemaVersion: 1,
    teamId: command.teamId,
    accountId: command.accountId,
    actor: context.actor,
    fileName: command.fileName ?? null,
    csvText: command.csvText,
    mapping: command.mapping,
  };

  await payloadStorage.put({
    objectKey: payloadObjectKey,
    body: JSON.stringify(payload),
    contentType: csvTransactionImportPayloadContentType,
  });

  await repository.appendAuditEvent({
    teamId: command.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: "transaction_import.queued",
    entityType: "transaction_import",
    entityId: importSession.id,
    metadata: {
      accountId: command.accountId,
      rowCount: preview.totalRows,
      readyCount: preview.readyCount,
      duplicateCount: preview.duplicateCount,
      invalidCount: preview.invalidCount,
      payloadObjectKey,
    },
  });

  await repository.appendOutboxEvent({
    teamId: command.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: "transaction_import.queued",
    version: 1,
    payload: {
      importSessionId: importSession.id,
      payloadObjectKey,
      actorId: context.actor.id,
      accountId: command.accountId,
      fileName: command.fileName ?? null,
      rowCount: preview.totalRows,
      readyCount: preview.readyCount,
      duplicateCount: preview.duplicateCount,
      invalidCount: preview.invalidCount,
    },
  });

  return {
    mode: "queued",
    importSession,
    transactions: [],
    preview,
    replayed: false,
    queuedJob: { payloadObjectKey },
  };
}

async function commitCsvTransactionImportPreviewRows(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  input: {
    command: CommitCsvTransactionImportCommand;
    preview: CsvTransactionImportPreview;
    actorId: string;
    existingImportSessionId?: string;
    allowEmptyCommit?: boolean;
  },
): Promise<CommitCsvTransactionImportResult> {
  const readyRows = input.preview.rows.filter((row) => row.status === "ready" && row.draft);

  if (readyRows.length === 0 && !input.allowEmptyCommit) {
    throw new AppError("CONFLICT", "CSV import has no rows ready to commit");
  }

  const transactions: Transaction[] = [];

  for (const row of readyRows) {
    if (!row.draft || !row.duplicateKey) {
      continue;
    }

    transactions.push(
      await repository.createLedgerTransactionForTeam({
        draft: row.draft,
        duplicateKey: row.duplicateKey,
      }),
    );
  }

  const importSession = input.existingImportSessionId
    ? await completeQueuedCsvTransactionImportSession(repository, {
        teamId: input.command.teamId,
        importSessionId: input.existingImportSessionId,
        importedCount: transactions.length,
        duplicateCount: input.preview.duplicateCount,
        invalidCount: input.preview.invalidCount,
      })
    : await repository.createTransactionImportSession({
        teamId: input.command.teamId,
        accountId: input.command.accountId,
        actorId: input.actorId,
        fileName: input.command.fileName ?? null,
        mapping: input.command.mapping,
        status: "committed",
        rowCount: input.preview.totalRows,
        importedCount: transactions.length,
        duplicateCount: input.preview.duplicateCount,
        invalidCount: input.preview.invalidCount,
      });

  await repository.appendAuditEvent({
    teamId: input.command.teamId,
    actorId: input.actorId,
    requestId: context.requestId,
    action: "transaction_import.committed",
    entityType: "transaction_import",
    entityId: importSession.id,
    metadata: {
      accountId: input.command.accountId,
      importedCount: transactions.length,
      duplicateCount: input.preview.duplicateCount,
      invalidCount: input.preview.invalidCount,
    },
  });

  await repository.appendOutboxEvent({
    teamId: input.command.teamId,
    actorId: input.actorId,
    requestId: context.requestId,
    type: "transaction_import.committed",
    version: 1,
    payload: {
      importSessionId: importSession.id,
      transactionIds: transactions.map((transaction) => transaction.id),
      accountId: input.command.accountId,
    },
  });

  return {
    mode: "committed",
    importSession,
    transactions,
    preview: input.preview,
    replayed: false,
  };
}

async function markQueuedCsvTransactionImportFailed(
  repository: TransactionReviewRepository,
  command: RunQueuedCsvTransactionImportCommand,
) {
  await repository.withTransaction(async (transactionRepository) => {
    if (!transactionRepository.failTransactionImportSession) {
      throw new AppError("CONFLICT", "Transaction import repository cannot mark queued failures");
    }

    await transactionRepository.failTransactionImportSession({
      teamId: command.teamId,
      importSessionId: command.importSessionId,
    });
  });
}

async function completeQueuedCsvTransactionImportSession(
  repository: TransactionReviewRepository,
  input: {
    teamId: string;
    importSessionId: string;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  },
) {
  if (!repository.completeTransactionImportSession) {
    throw new AppError("CONFLICT", "Transaction import repository cannot complete queued imports");
  }

  return repository.completeTransactionImportSession(input);
}

function parseQueuedCsvTransactionImportPayload(body: string): QueuedCsvTransactionImportPayload {
  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch {
    throw new AppError("CONFLICT", "Queued CSV import payload is invalid");
  }

  if (!isQueuedCsvTransactionImportPayload(value)) {
    throw new AppError("CONFLICT", "Queued CSV import payload is invalid");
  }

  return value;
}

function isQueuedCsvTransactionImportPayload(
  value: unknown,
): value is QueuedCsvTransactionImportPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const actor = record.actor;

  if (!actor || typeof actor !== "object") {
    return false;
  }

  const actorRecord = actor as Record<string, unknown>;

  return (
    record.schemaVersion === 1 &&
    typeof record.teamId === "string" &&
    typeof record.accountId === "string" &&
    typeof record.csvText === "string" &&
    (typeof record.fileName === "string" || record.fileName === null) &&
    typeof actorRecord.id === "string" &&
    (actorRecord.type === "user" || actorRecord.type === "system") &&
    Boolean(record.mapping) &&
    typeof record.mapping === "object"
  );
}

export function payloadObjectKeyForCsvTransactionImport(teamId: string, importSessionId: string) {
  return `teams/${objectKeySegment(teamId)}/transaction-imports/${objectKeySegment(
    importSessionId,
  )}.json`;
}

function objectKeySegment(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
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
    headers: Object.keys(rows[0]?.values ?? {}),
    detectedMapping: {
      ...detectCsvTransactionColumnMapping(rows),
      categoryId: null,
    },
    rows: previewRows,
    totalRows: previewRows.length,
    readyCount: previewRows.filter((row) => row.status === "ready").length,
    duplicateCount: previewRows.filter((row) => row.status === "duplicate").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length,
    summary: csvImportPreviewSummary(previewRows),
  };
}

function csvImportPreviewSummary(
  rows: readonly CsvTransactionImportPreviewRow[],
): CsvTransactionImportPreviewSummary {
  const readyDrafts = rows
    .filter((row) => row.status === "ready" && row.draft)
    .map((row) => row.draft!);
  const postedTimes = readyDrafts.map((draft) => new Date(draft.postedAt).getTime());
  const readyDateRange =
    postedTimes.length > 0
      ? {
          from: new Date(Math.min(...postedTimes)).toISOString(),
          to: new Date(Math.max(...postedTimes)).toISOString(),
        }
      : null;

  return {
    readyDateRange,
    readyCurrencyTotals: moneyTotals(readyDrafts.map((draft) => draft.money)),
    readyIncomeCount: readyDrafts.filter((draft) => draft.money.amountMinor > 0).length,
    readyExpenseCount: readyDrafts.filter((draft) => draft.money.amountMinor < 0).length,
    readyZeroAmountCount: readyDrafts.filter((draft) => draft.money.amountMinor === 0).length,
  };
}

function moneyTotals(moneyValues: readonly Money[]) {
  const totals: Record<string, Money> = {};

  for (const money of moneyValues) {
    totals[money.currency] = {
      currency: money.currency,
      amountMinor: (totals[money.currency]?.amountMinor ?? 0) + money.amountMinor,
    };
  }

  return totals;
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
    baseMoney: command.baseMoney ?? null,
    type: command.type,
    source: command.source,
    categoryId: command.categoryId ?? null,
    counterpartyId: command.counterpartyId ?? null,
    transferGroupId: command.transferGroupId?.trim() || null,
    providerTransactionId: command.providerTransactionId?.trim() || null,
    splits: command.splits ?? [],
    tagIds: command.tagIds ?? [],
  } satisfies LedgerTransactionDraft;

  assertLedgerTransactionDraft(draft);

  return draft;
}

function normalizeLedgerTransferPairCommand(command: CreateLedgerTransferPairCommand) {
  const description = command.description.trim();
  const postedAt = new Date(command.postedAt).toISOString();
  const money = {
    amountMinor: Math.abs(command.money.amountMinor),
    currency: command.money.currency,
  };

  if (!description) {
    throw new AppError("CONFLICT", "Ledger transfer description is required");
  }

  if (Number.isNaN(new Date(command.postedAt).getTime())) {
    throw new AppError("CONFLICT", "Ledger transfer posted date is invalid");
  }

  if (money.amountMinor <= 0) {
    throw new AppError("CONFLICT", "Ledger transfer amount must be positive");
  }

  return {
    teamId: command.teamId,
    fromAccountId: command.fromAccountId,
    toAccountId: command.toAccountId,
    postedAt,
    description,
    money,
    tagIds: [...new Set(command.tagIds ?? [])],
  };
}

async function validateLedgerDraftReferences(
  repository: LedgerRepository,
  draft: LedgerTransactionDraft,
) {
  if (draft.categoryId) {
    const category = await repository.getCategoryForTeam(draft.teamId, draft.categoryId);

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }
  }

  if (draft.counterpartyId) {
    const counterparty = await repository.getCounterpartyForTeam(
      draft.teamId,
      draft.counterpartyId,
    );

    if (!counterparty) {
      throw new AppError("NOT_FOUND", "Counterparty not found");
    }
  }

  await validateTransactionTags(repository, draft.teamId, draft.tagIds ?? []);
}

async function validateTransactionTags(
  repository: LedgerRepository,
  teamId: string,
  tagIds: readonly string[],
) {
  for (const tagId of new Set(tagIds)) {
    const tag = await repository.getTransactionTagForTeam(teamId, tagId);

    if (!tag) {
      throw new AppError("NOT_FOUND", "Transaction tag not found");
    }
  }
}

function normalizeLedgerMetadataName(name: string, errorMessage: string) {
  const normalized = name.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new AppError("CONFLICT", errorMessage);
  }

  return normalized;
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message = "Resource not found",
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}
