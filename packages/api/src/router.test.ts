import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type {
  Actor,
  Category,
  Customer,
  CustomerContact,
  InvoiceDraft,
  InvoiceLineDraft,
  LedgerAccount,
  LedgerTransactionDraft,
  Product,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import type {
  ActorTeam,
  BankAccount,
  BankConnection,
  BusinessDocument,
  BusinessDocumentVersion,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  DocumentUrlSigner,
  HardNegativeTransactionMatch,
  IdempotencyResult,
  InboxItem,
  InboxTransactionMatchSuggestion,
  InboxSource,
  InboxSourceType,
  ProviderSyncRun,
  ReviewWorkspaceData,
  TeamAlias,
  TransactionImportSession,
} from "@dawn/app";
import { createMockBankingProvider } from "@dawn/integrations";

class MemoryTransactionReviewRepository implements DawnRepository {
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];
  bankAccounts = new Map<string, BankAccount>();
  bankConnections = new Map<string, BankConnection>();
  categories = new Map<string, Category>();
  customers = new Map<string, Customer>();
  customerContacts = new Map<string, CustomerContact>();
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  extractions = new Map<string, DocumentExtraction>();
  inboxItems = new Map<string, InboxItem>();
  inboxSources = new Map<string, InboxSource>();
  accounts = new Map<string, LedgerAccount>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  importSessions: TransactionImportSession[] = [];
  invites = new Map<string, TeamInvite>();
  matchSuggestions = new Map<string, InboxTransactionMatchSuggestion>();
  products = new Map<string, Product>();
  invoices = new Map<string, InvoiceDraft>();
  aliases: TeamAlias[] = [];
  hardNegatives: HardNegativeTransactionMatch[] = [];
  attachments: { transactionId: string; documentId: string }[] = [];
  memberships = new Map<string, TeamRole>();
  providerObjects = new Map<string, Record<string, unknown>>();
  syncRuns: ProviderSyncRun[] = [];
  teams = new Map<string, string>();
  transactions = new Map<string, Transaction>();
  users = new Map<string, { email: string; name: string }>();

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async ensureDefaultWorkspace(actor: Actor) {
    const existingTeamId = [...this.memberships.keys()]
      .find((key) => key.startsWith(`${actor.id}:`))
      ?.split(":")[1];

    if (existingTeamId) {
      return { teamId: existingTeamId };
    }

    const team = await this.createTeam({ actor, name: "Default Team" });
    return { teamId: team.id };
  }

  async listActorTeams(actor: Actor): Promise<ActorTeam[]> {
    return [...this.memberships.entries()]
      .filter(([key]) => key.startsWith(`${actor.id}:`))
      .map(([key, role]) => {
        const teamId = key.split(":")[1] ?? "team_1";
        return { id: teamId, name: this.teams.get(teamId) ?? teamId, role };
      });
  }

  async createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam> {
    const teamId = `team_${this.teams.size + 1}`;
    this.teams.set(teamId, input.name);
    this.memberships.set(`${input.actor.id}:${teamId}`, "owner");
    return { id: teamId, name: input.name, role: "owner" };
  }

  async listWorkspace(_actor: Actor, teamId: string): Promise<ReviewWorkspaceData> {
    return {
      teamId,
      teamName: this.teams.get(teamId) ?? teamId,
      categories: [...this.categories.values()].filter((category) => category.teamId === teamId),
      transactions: [...this.transactions.values()].filter(
        (transaction) => transaction.teamId === teamId,
      ),
      sync: {
        collection: "transactions",
        cursor: null,
        conflictPolicy: "server_wins_for_financial_state",
      },
    };
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    const transaction = this.transactions.get(transactionId);
    return transaction?.teamId === teamId ? transaction : null;
  }

  async getCategoryForTeam(teamId: string, categoryId: string) {
    const category = this.categories.get(categoryId);
    return category?.teamId === teamId ? category : null;
  }

  async listLedgerAccounts(teamId: string) {
    return [...this.accounts.values()].filter((account) => account.teamId === teamId);
  }

  async getLedgerAccountForTeam(teamId: string, accountId: string) {
    const account = this.accounts.get(accountId);
    return account?.teamId === teamId ? account : null;
  }

  async getTransactionByDuplicateKey(teamId: string, duplicateKey: string) {
    return (
      [...this.transactions.values()].find(
        (transaction) => transaction.teamId === teamId && transaction.duplicateKey === duplicateKey,
      ) ?? null
    );
  }

  async getTransactionByProviderTransactionId(teamId: string, providerTransactionId: string) {
    return (
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.teamId === teamId &&
          transaction.providerTransactionId === providerTransactionId,
      ) ?? null
    );
  }

  async listTransactionsForReport(input: { teamId: string; accountId?: string }) {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.teamId === input.teamId &&
        (!input.accountId || transaction.accountId === input.accountId),
    );
  }

  async listTransactionsForSync(input: { teamId: string; cursor?: string | null }) {
    const cursorTime = input.cursor ? new Date(input.cursor).getTime() : null;

    return [...this.transactions.values()]
      .filter((transaction) => transaction.teamId === input.teamId)
      .filter((transaction) => {
        if (cursorTime === null) {
          return true;
        }

        return transaction.updatedAt
          ? new Date(transaction.updatedAt).getTime() > cursorTime
          : false;
      })
      .sort(
        (left, right) =>
          new Date(left.updatedAt ?? 0).getTime() - new Date(right.updatedAt ?? 0).getTime(),
      );
  }

  async createLedgerTransactionForTeam(input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }) {
    const transaction = {
      id: `txn_${this.transactions.size + 1}`,
      teamId: input.draft.teamId,
      accountId: input.draft.accountId,
      description: input.draft.description,
      postedAt: input.draft.postedAt,
      money: input.draft.money,
      type: input.draft.type,
      source: input.draft.source,
      counterpartyId: input.draft.counterpartyId ?? null,
      providerTransactionId: input.draft.providerTransactionId ?? null,
      categoryId: input.draft.categoryId ?? null,
      reviewState: "needs_review" as const,
      duplicateKey: input.duplicateKey,
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const importSession = {
      id: `import_${this.importSessions.length + 1}`,
      teamId: input.teamId,
      accountId: input.accountId,
      source: "csv" as const,
      fileName: input.fileName ?? null,
      status: "committed" as const,
      rowCount: input.rowCount,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions.push(importSession);
    return importSession;
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
  }

  async updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }) {
    const transaction = this.transactions.get(input.transactionId);

    if (!transaction || transaction.teamId !== input.teamId) {
      throw new Error("missing transaction");
    }

    const updated = {
      ...transaction,
      categoryId: input.categoryId,
      reviewState: input.reviewState,
    };
    this.transactions.set(input.transactionId, updated);
    return updated;
  }

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
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

  async listBankConnectionSummaries(teamId: string) {
    return [...this.bankConnections.values()]
      .filter((connection) => connection.teamId === teamId)
      .map((connection) => ({
        connection,
        accounts: [...this.bankAccounts.values()].filter(
          (account) => account.connectionId === connection.id,
        ),
        latestSyncRun:
          [...this.syncRuns].reverse().find((syncRun) => syncRun.connectionId === connection.id) ??
          null,
      }));
  }

  async getBankConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.bankConnections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async upsertBankConnection(input: Parameters<DawnRepository["upsertBankConnection"]>[0]) {
    const existing = [...this.bankConnections.values()].find(
      (connection) =>
        connection.teamId === input.teamId &&
        connection.provider === input.providerConnection.provider &&
        connection.providerConnectionId === input.providerConnection.providerConnectionId,
    );
    const connection = {
      id: existing?.id ?? `conn_${this.bankConnections.size + 1}`,
      teamId: input.teamId,
      provider: input.providerConnection.provider,
      providerConnectionId: input.providerConnection.providerConnectionId,
      institutionName: input.providerConnection.institutionName,
      status: "connected" as const,
      lastSyncAt: existing?.lastSyncAt ?? null,
      createdAt: existing?.createdAt ?? "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.bankConnections.set(connection.id, connection);
    return connection;
  }

  async upsertBankAccount(input: Parameters<DawnRepository["upsertBankAccount"]>[0]) {
    const existing = [...this.bankAccounts.values()].find(
      (account) =>
        account.connectionId === input.connectionId &&
        account.providerAccountId === input.providerAccount.providerAccountId,
    );
    const ledgerAccountId = existing?.ledgerAccountId ?? `acct_${this.accounts.size + 1}`;

    if (!existing) {
      this.accounts.set(ledgerAccountId, {
        id: ledgerAccountId,
        teamId: input.teamId,
        name: input.providerAccount.name,
        currency: input.providerAccount.currency,
        type: input.providerAccount.type,
      });
    }

    const account = {
      id: existing?.id ?? `bank_acct_${this.bankAccounts.size + 1}`,
      teamId: input.teamId,
      connectionId: input.connectionId,
      ledgerAccountId,
      providerAccountId: input.providerAccount.providerAccountId,
      name: input.providerAccount.name,
      currency: input.providerAccount.currency,
      type: input.providerAccount.type,
      currentBalance: input.providerAccount.currentBalance,
      status: "active" as const,
    };
    this.bankAccounts.set(account.id, account);
    return account;
  }

  async createProviderSyncRun(input: { teamId: string; connectionId: string }) {
    const syncRun = {
      id: `sync_${this.syncRuns.length + 1}`,
      teamId: input.teamId,
      connectionId: input.connectionId,
      status: "running" as const,
      startedAt: "2026-06-15T10:00:00.000Z",
      completedAt: null,
      accountsSynced: 0,
      transactionsImported: 0,
      duplicateCount: 0,
      error: null,
    };
    this.syncRuns.push(syncRun);
    return syncRun;
  }

  async finishProviderSyncRun(input: Parameters<DawnRepository["finishProviderSyncRun"]>[0]) {
    const existing = this.syncRuns.find((syncRun) => syncRun.id === input.syncRunId);

    if (!existing) {
      throw new Error("Sync run not found");
    }

    const syncRun = {
      ...existing,
      status: input.status,
      completedAt: "2026-06-15T10:01:00.000Z",
      accountsSynced: input.accountsSynced,
      transactionsImported: input.transactionsImported,
      duplicateCount: input.duplicateCount,
      error: input.error ?? null,
    };
    this.syncRuns.splice(this.syncRuns.indexOf(existing), 1, syncRun);
    return syncRun;
  }

  async markBankConnectionSynced(input: Parameters<DawnRepository["markBankConnectionSynced"]>[0]) {
    const existing = this.bankConnections.get(input.connectionId);

    if (!existing) {
      throw new Error("Connection not found");
    }

    const connection = {
      ...existing,
      status: input.status,
      lastSyncAt: input.syncedAt.toISOString(),
      updatedAt: input.syncedAt.toISOString(),
    };
    this.bankConnections.set(connection.id, connection);
    return connection;
  }

  async upsertProviderObject(input: Parameters<DawnRepository["upsertProviderObject"]>[0]) {
    this.providerObjects.set(
      `${input.provider}:${input.providerObjectType}:${input.providerObjectId}`,
      input.rawPayload,
    );
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
      throw new Error(input.error);
    }

    const updated = {
      ...inboxItem,
      extractionStatus: "failed" as const,
      updatedAt: input.failedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }

  async listTeamAliases(teamId: string) {
    return this.aliases.filter((alias) => alias.teamId === teamId);
  }

  async listHardNegativeMatches(teamId: string, inboxItemId: string) {
    return this.hardNegatives.filter(
      (match) => match.teamId === teamId && match.inboxItemId === inboxItemId,
    );
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: {
      transactionId: string;
      score: number;
      confidence: InboxTransactionMatchSuggestion["confidence"];
      explanation: string[];
    }[];
  }) {
    const persisted = input.suggestions.map((suggestion, index) => {
      const existing = [...this.matchSuggestions.values()].find(
        (record) =>
          record.teamId === input.teamId &&
          record.inboxItemId === input.inboxItemId &&
          record.transactionId === suggestion.transactionId,
      );
      const record: InboxTransactionMatchSuggestion = {
        id: existing?.id ?? `match_${this.matchSuggestions.size + index + 1}`,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        transactionId: suggestion.transactionId,
        score: suggestion.score,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
        status: existing?.status ?? "suggested",
        createdAt: existing?.createdAt ?? "2026-06-15T10:04:00.000Z",
        updatedAt: "2026-06-15T10:04:00.000Z",
        transaction: this.transactions.get(suggestion.transactionId) ?? null,
      };
      this.matchSuggestions.set(record.id, record);
      return record;
    });
    const item = this.inboxItems.get(input.inboxItemId);

    if (item?.teamId === input.teamId) {
      this.inboxItems.set(item.id, { ...item, matchSuggestions: persisted });
    }

    return persisted;
  }

  async getInboxMatchSuggestionForTeam(teamId: string, suggestionId: string) {
    const suggestion = this.matchSuggestions.get(suggestionId);
    return suggestion?.teamId === teamId ? suggestion : null;
  }

  async acceptInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    actorId: string;
  }) {
    const suggestion = this.matchSuggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const item = this.inboxItems.get(suggestion.inboxItemId);

    if (!item) {
      throw new Error("Inbox item not found");
    }

    const accepted = { ...suggestion, status: "accepted" as const };
    this.matchSuggestions.set(accepted.id, accepted);
    this.attachments.push({
      transactionId: accepted.transactionId,
      documentId: item.documentId,
    });

    if (item.latestExtraction?.fields.merchantName && accepted.transaction?.description) {
      this.aliases.push({
        id: `alias_${this.aliases.length + 1}`,
        teamId: input.teamId,
        source: item.latestExtraction.fields.merchantName,
        target: accepted.transaction.description,
        createdAt: "2026-06-15T10:04:00.000Z",
      });
    }

    const updatedItem = {
      ...item,
      status: "resolved" as const,
      matchSuggestions: [accepted],
      updatedAt: "2026-06-15T10:04:00.000Z",
    };
    this.inboxItems.set(updatedItem.id, updatedItem);

    return { suggestion: accepted, inboxItem: updatedItem };
  }

  async rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
    actorId: string;
  }) {
    const suggestion = this.matchSuggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const rejected = { ...suggestion, status: "rejected" as const };
    this.matchSuggestions.set(rejected.id, rejected);
    this.hardNegatives.push({
      id: `negative_${this.hardNegatives.length + 1}`,
      teamId: input.teamId,
      inboxItemId: rejected.inboxItemId,
      transactionId: rejected.transactionId,
      reason: input.reason,
      createdAt: "2026-06-15T10:04:00.000Z",
    });

    return rejected;
  }

  async listCustomers(teamId: string) {
    return [...this.customers.values()].filter((customer) => customer.teamId === teamId);
  }

  async listCustomerContacts(teamId: string) {
    return [...this.customerContacts.values()].filter((contact) => contact.teamId === teamId);
  }

  async listProducts(teamId: string) {
    return [...this.products.values()].filter((product) => product.teamId === teamId);
  }

  async listDraftInvoices(teamId: string) {
    return [...this.invoices.values()].filter(
      (invoice) => invoice.teamId === teamId && invoice.status === "draft",
    );
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const customer = this.customers.get(customerId);
    return customer?.teamId === teamId ? customer : null;
  }

  async getProductForTeam(teamId: string, productId: string) {
    const product = this.products.get(productId);
    return product?.teamId === teamId ? product : null;
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    return invoice?.teamId === teamId ? invoice : null;
  }

  async createCustomer(input: {
    customerId: string;
    contactId?: string | null;
    teamId: string;
    name: string;
    email?: string | null;
    billingAddress?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactRole?: string | null;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const customer: Customer = {
      id: input.customerId,
      teamId: input.teamId,
      name: input.name,
      email: input.email ?? null,
      billingAddress: input.billingAddress ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const contact =
      input.contactId && input.contactName && input.contactEmail
        ? {
            id: input.contactId,
            teamId: input.teamId,
            customerId: input.customerId,
            name: input.contactName,
            email: input.contactEmail,
            role: input.contactRole ?? null,
            createdAt: now,
          }
        : null;
    this.customers.set(customer.id, customer);

    if (contact) {
      this.customerContacts.set(contact.id, contact);
    }

    return { customer, contact };
  }

  async createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: Product["type"];
    description?: string | null;
    unitPrice: Product["unitPrice"];
    defaultTaxRateBasisPoints: number;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const product: Product = {
      id: input.productId,
      teamId: input.teamId,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      unitPrice: input.unitPrice,
      defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints,
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    return product;
  }

  async createDraftInvoice(input: {
    invoiceId: string;
    teamId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
    createdByActorId: string;
  }) {
    const invoice = this.invoiceFromInput(input.invoiceId, input, input.createdByActorId);
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async updateDraftInvoice(input: {
    teamId: string;
    invoiceId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
  }) {
    const existing = this.invoices.get(input.invoiceId);
    const invoice = this.invoiceFromInput(
      input.invoiceId,
      input,
      existing?.createdByActorId ?? "user_1",
    );
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  private invoiceFromInput(
    invoiceId: string,
    input: {
      teamId: string;
      customerId: string;
      invoiceNumber: string;
      issueDate: string;
      dueDate?: string | null;
      currency: string;
      discountBasisPoints: number;
      notes?: string | null;
      lines: InvoiceLineDraft[];
    },
    createdByActorId: string,
  ): InvoiceDraft {
    const calculated = calculateFixtureInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });

    return {
      id: invoiceId,
      teamId: input.teamId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      status: "draft",
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      notes: input.notes ?? null,
      lines: input.lines.map((line, index) => ({
        id: `line_${index + 1}`,
        invoiceId,
        productId: line.productId ?? null,
        description: line.description,
        quantityMilli: line.quantityMilli,
        unitPrice: line.unitPrice,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
        sortOrder: index,
        totals: calculated.lines[index]!,
      })),
      totals: calculated.totals,
      createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
  }

  async createTeamInvite(input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }) {
    const invite = {
      id: `invite_${this.invites.size + 1}`,
      teamId: input.teamId,
      email: input.email,
      role: input.role,
      status: "pending" as const,
      invitedByActorId: input.invitedByActorId,
      expiresAt: input.expiresAt.toISOString(),
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    return [...this.memberships.entries()]
      .filter(([key]) => key.endsWith(`:${teamId}`))
      .map(([key, role]) => {
        const userId = key.split(":")[0] ?? "user_1";
        const user = this.users.get(userId);
        return {
          id: `${teamId}:${userId}`,
          teamId,
          userId,
          role,
          name: user?.name ?? null,
          email: user?.email ?? null,
        };
      });
  }

  async listPendingTeamInvites(teamId: string) {
    return [...this.invites.values()].filter(
      (invite) => invite.teamId === teamId && invite.status === "pending",
    );
  }

  async getTeamInvite(inviteId: string) {
    return this.invites.get(inviteId) ?? null;
  }

  async addTeamMembership(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership> {
    this.memberships.set(`${input.userId}:${input.teamId}`, input.role);
    return { teamId: input.teamId, userId: input.userId, role: input.role };
  }

  async markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }) {
    const invite = this.invites.get(input.inviteId);

    if (!invite) {
      throw new Error("missing invite");
    }

    const accepted = { ...invite, status: "accepted" as const };
    this.invites.set(input.inviteId, accepted);
    return accepted;
  }

  async getTeamMemberByUserId(teamId: string, userId: string) {
    const role = this.memberships.get(`${userId}:${teamId}`);
    return role ? { id: `${teamId}:${userId}`, teamId, userId, role } : null;
  }

  async updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember> {
    this.memberships.set(`${input.userId}:${input.teamId}`, input.role);
    return {
      id: `${input.teamId}:${input.userId}`,
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
    };
  }
}

function calculateFixtureInvoiceTotals(input: {
  currency: string;
  discountBasisPoints: number;
  lines: InvoiceLineDraft[];
}) {
  const lineSubtotals = input.lines.map((line) =>
    Math.round((line.unitPrice.amountMinor * line.quantityMilli) / 1_000),
  );
  const subtotalMinor = lineSubtotals.reduce((total, value) => total + value, 0);
  const invoiceDiscountMinor = Math.round((subtotalMinor * input.discountBasisPoints) / 10_000);
  let allocatedDiscount = 0;
  const lines = input.lines.map((line, index) => {
    const subtotal = lineSubtotals[index] ?? 0;
    const discount =
      index === input.lines.length - 1
        ? invoiceDiscountMinor - allocatedDiscount
        : subtotalMinor === 0
          ? 0
          : Math.round((subtotal * invoiceDiscountMinor) / subtotalMinor);
    allocatedDiscount += discount;
    const taxable = subtotal - discount;
    const tax = Math.round((taxable * (line.taxRateBasisPoints ?? 0)) / 10_000);

    return {
      subtotal: { amountMinor: subtotal, currency: input.currency },
      discount: { amountMinor: discount, currency: input.currency },
      tax: { amountMinor: tax, currency: input.currency },
      total: { amountMinor: taxable + tax, currency: input.currency },
    };
  });
  const discountMinor = lines.reduce((total, line) => total + line.discount.amountMinor, 0);
  const taxMinor = lines.reduce((total, line) => total + line.tax.amountMinor, 0);

  return {
    lines,
    totals: {
      subtotal: { amountMinor: subtotalMinor, currency: input.currency },
      discount: { amountMinor: discountMinor, currency: input.currency },
      tax: { amountMinor: taxMinor, currency: input.currency },
      total: {
        amountMinor: subtotalMinor - discountMinor + taxMinor,
        currency: input.currency,
      },
    },
  };
}

function testContext(user?: { id: string; email: string }) {
  return {
    auth: null,
    requestId: "request_1",
    session: user ? { user } : null,
  };
}

const testDocumentUrlSigner: DocumentUrlSigner = {
  async createUploadUrl(input) {
    return {
      url: `http://localhost:3000/documents/upload/${input.versionId}`,
      expiresAt: "2026-06-15T10:15:00.000Z",
    };
  },
  async createDownloadUrl(input) {
    return {
      url: `http://localhost:3000/documents/download/${input.versionId}`,
      expiresAt: "2026-06-15T10:05:00.000Z",
    };
  },
};

async function createTestRouter(repository: DawnRepository) {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";

  const { createAppRouter } = await import("./routers/index");
  return createAppRouter({
    transactionReviewRepository: repository,
    bankingProvider: createMockBankingProvider(),
    documentUrlSigner: testDocumentUrlSigner,
  });
}

describe("appRouter", () => {
  test("rejects unauthenticated protected procedures", async () => {
    const router = await createTestRouter(new MemoryTransactionReviewRepository());

    await expect(
      call(router.teams.directory, { teamId: "team_1" }, { context: testContext() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("maps application permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.teams.directory,
        { teamId: "team_1" },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot manage members for this team",
    });
  });

  test("returns team directory data for team managers", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.users.set("user_1", { email: "admin@example.com", name: "Admin" });
    repository.users.set("user_2", { email: "viewer@example.com", name: "Viewer" });
    repository.memberships.set("user_1:team_1", "admin");
    repository.memberships.set("user_2:team_1", "viewer");
    repository.invites.set("invite_1", {
      id: "invite_1",
      teamId: "team_1",
      email: "pending@example.com",
      role: "member",
      status: "pending",
      invitedByActorId: "user_1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const router = await createTestRouter(repository);

    const directory = await call(
      router.teams.directory,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "admin@example.com" }),
      },
    );

    expect(directory.members.map((member) => [member.email, member.role])).toEqual([
      ["admin@example.com", "admin"],
      ["viewer@example.com", "viewer"],
    ]);
    expect(directory.pendingInvites.map((invite) => [invite.email, invite.role])).toEqual([
      ["pending@example.com", "member"],
    ]);
  });

  test("maps selected-team transaction misses to not found", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_2", "admin");
    repository.categories.set("cat_1", { id: "cat_1", teamId: "team_1", name: "Software" });
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      description: "Figma",
      postedAt: "2026-06-14",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
    });
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.transactionReview.review,
        {
          teamId: "team_2",
          transactionId: "txn_1",
          categoryId: "cat_1",
          idempotencyKey: "idem_1",
        },
        {
          context: testContext({ id: "user_1", email: "admin@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Transaction not found",
    });
  });

  test("returns cursor-scoped transaction sync changes through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "viewer");
    repository.transactions.set("txn_old", {
      id: "txn_old",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Old transaction",
      postedAt: "2026-06-13",
      money: { amountMinor: -500, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
      updatedAt: "2026-06-14T09:00:00.000Z",
    });
    repository.transactions.set("txn_new", {
      id: "txn_new",
      teamId: "team_1",
      accountId: "acct_1",
      description: "New transaction",
      postedAt: "2026-06-15",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: "cat_software",
      reviewState: "reviewed",
      updatedAt: "2026-06-15T09:00:00.000Z",
    });
    repository.transactions.set("txn_other", {
      id: "txn_other",
      teamId: "team_2",
      accountId: "acct_2",
      description: "Other team",
      postedAt: "2026-06-15",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
      updatedAt: "2026-06-16T09:00:00.000Z",
    });
    const router = await createTestRouter(repository);

    const response = await call(
      router.sync.transactions,
      { teamId: "team_1", cursor: "2026-06-14T12:00:00.000Z" },
      {
        context: testContext({ id: "user_1", email: "viewer@example.com" }),
      },
    );

    expect(response).toMatchObject({
      collection: "transactions",
      teamId: "team_1",
      cursor: "2026-06-15T09:00:00.000Z",
      conflictPolicy: "server_wins_for_financial_state",
    });
    expect(
      response.changes.map((change) => (change.type === "upsert" ? change.record.id : "")),
    ).toEqual(["txn_new"]);
  });

  test("maps sync permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.sync.transactions,
        { teamId: "team_2", cursor: null },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot sync transactions for this team",
    });
  });

  test("creates ledger transactions through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    repository.categories.set("cat_software", {
      id: "cat_software",
      teamId: "team_1",
      name: "Software",
    });
    const router = await createTestRouter(repository);

    const result = await call(
      router.ledger.createTransaction,
      {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Figma subscription",
        postedAt: "2026-06-14T00:00:00.000Z",
        money: { amountMinor: -1200, currency: "USD" },
        type: "expense",
        source: "manual",
        categoryId: "cat_software",
        idempotencyKey: "idem_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(result.transaction.accountId).toBe("acct_1");
    expect(result.transaction.duplicateKey).toBe(
      "team_1:manual:acct_1:2026-06-14:USD:-1200:figma subscription",
    );
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("previews and commits CSV imports through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    repository.categories.set("cat_software", {
      id: "cat_software",
      teamId: "team_1",
      name: "Software",
    });
    const router = await createTestRouter(repository);
    const input = {
      teamId: "team_1",
      accountId: "acct_1",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        categoryId: "cat_software",
      },
    };

    const preview = await call(router.csvImport.preview, input, {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    });
    const result = await call(
      router.csvImport.commit,
      {
        ...input,
        fileName: "transactions.csv",
        idempotencyKey: "idem_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(preview.readyCount).toBe(2);
    expect(result.importSession.importedCount).toBe(2);
    expect(result.transactions).toHaveLength(2);
    expect(repository.importSessions).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("creates customers, products, and draft invoices through protected billing routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };

    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        email: "billing@acme.test",
        contactName: "Ada Buyer",
        contactEmail: "ada@acme.test",
        idempotencyKey: "customer_1",
      },
      context,
    );
    const product = await call(
      router.billing.createProduct,
      {
        teamId: "team_1",
        name: "Implementation",
        type: "service",
        unitPrice: { amountMinor: 50_00, currency: "USD" },
        defaultTaxRateBasisPoints: 2_500,
        idempotencyKey: "product_1",
      },
      context,
    );
    const invoice = await call(
      router.billing.createDraftInvoice,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-07-15T00:00:00.000Z",
        currency: "USD",
        discountBasisPoints: 0,
        lines: [
          {
            productId: product.product.id,
            description: "Implementation",
            quantityMilli: 2_000,
            unitPrice: { amountMinor: 50_00, currency: "USD" },
            taxRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "invoice_1",
      },
      context,
    );
    const updated = await call(
      router.billing.updateDraftInvoice,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-07-15T00:00:00.000Z",
        currency: "USD",
        discountBasisPoints: 1_000,
        lines: [
          {
            productId: product.product.id,
            description: "Implementation",
            quantityMilli: 2_000,
            unitPrice: { amountMinor: 50_00, currency: "USD" },
            taxRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "invoice_update_1",
      },
      context,
    );
    const list = await call(router.billing.list, { teamId: "team_1" }, context);

    expect(customer.contact).toMatchObject({ email: "ada@acme.test" });
    expect(product.product.defaultTaxRateBasisPoints).toBe(2_500);
    expect(invoice.invoice.totals.total).toEqual({ amountMinor: 125_00, currency: "USD" });
    expect(updated.invoice.totals.total).toEqual({ amountMinor: 112_50, currency: "USD" });
    expect(list.customers).toHaveLength(1);
    expect(list.products).toHaveLength(1);
    expect(list.draftInvoices).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(4);
    expect(repository.outboxEvents).toHaveLength(4);
  });

  test("creates and signs document uploads and downloads through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);

    const prepared = await call(
      router.documents.createUpload,
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "doc_upload_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const listed = await call(
      router.documents.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    await repository.completeDocumentVersionUpload({
      teamId: "team_1",
      documentId: prepared.document.id,
      versionId: prepared.version.id,
      byteSize: 7,
      uploadedAt: new Date("2026-06-15T10:01:00.000Z"),
    });

    const download = await call(
      router.documents.download,
      { teamId: "team_1", documentId: prepared.document.id },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(prepared.uploadUrl).toBe(
      `http://localhost:3000/documents/upload/${prepared.version.id}`,
    );
    expect(listed.documents).toHaveLength(1);
    expect(listed.documents[0]?.status).toBe("uploading");
    expect(download.downloadUrl).toBe(
      `http://localhost:3000/documents/download/${prepared.version.id}`,
    );
  });

  test("maps document upload permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.documents.createUpload,
        {
          teamId: "team_1",
          fileName: "receipt.pdf",
          contentType: "application/pdf",
          byteSize: 7,
          idempotencyKey: "doc_upload_1",
        },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot upload documents for this team",
    });
  });

  test("lists inbox items and corrects extracted document fields through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
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
      status: "needs_review",
      extractionStatus: "completed",
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:02:00.000Z",
      latestExtraction: {
        id: "extract_1",
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        documentVersionId: "ver_1",
        extractionVersion: 1,
        source: "local_deterministic",
        status: "completed",
        fields: { merchantName: "Acme", totalAmountMinor: 4250, currency: "USD" },
        confidence: { merchantName: 0.72, totalAmountMinor: 0.72, currency: 0.72 },
        rawText: "Acme\nTotal USD 42.50",
        error: null,
        createdByActorId: "user_1",
        createdAt: "2026-06-15T10:02:00.000Z",
      },
    });
    repository.extractions.set(
      "extract_1",
      repository.inboxItems.get("inbox_1")?.latestExtraction as DocumentExtraction,
    );
    const router = await createTestRouter(repository);

    const inbox = await call(
      router.inbox.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const corrected = await call(
      router.inbox.correctExtraction,
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
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(inbox.inboxItems).toHaveLength(1);
    expect(inbox.inboxItems[0]?.latestExtraction?.fields).toMatchObject({
      merchantName: "Acme",
    });
    expect(corrected.extraction).toMatchObject({
      source: "user_correction",
      extractionVersion: 2,
      fields: { merchantName: "Acme Supply Co", totalAmountMinor: 4300 },
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "document_extraction.corrected",
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "document_extraction.corrected",
    });
  });

  test("suggests, accepts, and rejects inbox transaction matches through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supply INV-42",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_1",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.transactions.set("txn_2", {
      id: "txn_2",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supply INV-42 duplicate",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_2",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.inboxItems.set("inbox_1", {
      id: "inbox_1",
      teamId: "team_1",
      sourceId: "source_1",
      sourceType: "document_upload",
      documentId: "doc_1",
      documentVersionId: "version_1",
      status: "needs_review",
      extractionStatus: "completed",
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:02:00.000Z",
      latestExtraction: {
        id: "extract_1",
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        documentVersionId: "version_1",
        extractionVersion: 1,
        source: "local_deterministic",
        status: "completed",
        fields: {
          merchantName: "Acme Supply",
          issuedAt: "2026-06-14T00:00:00.000Z",
          invoiceNumber: "INV-42",
          totalAmountMinor: 4250,
          currency: "USD",
        },
        confidence: {},
        rawText: "Acme Supply invoice INV-42 total USD 42.50",
        error: null,
        createdByActorId: "user_1",
        createdAt: "2026-06-15T10:02:00.000Z",
      },
    });
    const router = await createTestRouter(repository);
    const callerContext = {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    };

    const generated = await call(
      router.inbox.suggestMatches,
      { teamId: "team_1", inboxItemId: "inbox_1" },
      callerContext,
    );
    const accepted = await call(
      router.inbox.acceptMatch,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[0]?.id ?? "",
        idempotencyKey: "accept_match_1",
      },
      callerContext,
    );
    const rejected = await call(
      router.inbox.rejectMatch,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[1]?.id ?? "",
        reason: "wrong duplicate",
        idempotencyKey: "reject_match_1",
      },
      callerContext,
    );

    expect(generated.suggestions).toHaveLength(2);
    expect(generated.suggestions[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(accepted.suggestion.status).toBe("accepted");
    expect(accepted.inboxItem.status).toBe("resolved");
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(rejected.suggestion.status).toBe("rejected");
    expect(repository.hardNegatives).toMatchObject([
      { inboxItemId: "inbox_1", transactionId: "txn_2", reason: "wrong duplicate" },
    ]);
  });

  test("connects and syncs a mock bank provider through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "owner");
    const router = await createTestRouter(repository);

    const connected = await call(
      router.banking.connectMock,
      { teamId: "team_1", idempotencyKey: "connect_1" },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const firstSync = await call(
      router.banking.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_1",
      },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const secondSync = await call(
      router.banking.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_2",
      },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const list = await call(
      router.banking.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );

    expect(connected.connection.provider).toBe("mock-bank");
    expect(firstSync.accounts).toHaveLength(2);
    expect(firstSync.transactions).toHaveLength(2);
    expect(secondSync.transactions).toHaveLength(0);
    expect(secondSync.duplicateCount).toBe(2);
    expect(list.connections[0]?.latestSyncRun).toMatchObject({
      status: "completed",
      transactionsImported: 0,
      duplicateCount: 2,
    });
    expect(repository.providerObjects.get("mock-bank:connection:mock_conn_team_1")).toMatchObject({
      mock: true,
    });
  });
});
