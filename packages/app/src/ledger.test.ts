import { describe, expect, test } from "bun:test";
import type {
  Actor,
  Category,
  Counterparty,
  LedgerAccount,
  LedgerTransactionDraft,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
  TransactionTag,
} from "@dawn/domain";

import {
  AppError,
  createLedgerCounterparty,
  createLedgerTransaction,
  createLedgerTransferPair,
  createTransactionTag,
  type IdempotencyResult,
  type LedgerRepository,
  type ReviewWorkspaceData,
  type TransactionImportPayloadStorage,
  type TransactionImportSession,
  commitCsvTransactionImport,
  listLedgerSummary,
  previewCsvTransactionImport,
  runQueuedCsvTransactionImport,
  suggestCsvTransactionImportMapping,
} from "./index";

class MemoryTransactionImportPayloadStorage implements TransactionImportPayloadStorage {
  objects = new Map<string, { body: string; contentType: string; byteSize: number }>();
  deletedKeys: string[] = [];

  async put(input: { objectKey: string; body: string; contentType: string }) {
    this.objects.set(input.objectKey, {
      body: input.body,
      contentType: input.contentType,
      byteSize: new TextEncoder().encode(input.body).byteLength,
    });
  }

  async get(objectKey: string) {
    return this.objects.get(objectKey) ?? null;
  }

  async delete(objectKey: string) {
    this.deletedKeys.push(objectKey);
    this.objects.delete(objectKey);
  }
}

class MemoryLedgerRepository implements LedgerRepository {
  accounts = new Map<string, LedgerAccount>();
  auditEvents: unknown[] = [];
  categories = new Map<string, Category>();
  counterparties = new Map<string, Counterparty>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];
  importSessions: TransactionImportSession[] = [];
  tagAssignments: { transactionId: string; tagId: string }[] = [];
  tags = new Map<string, TransactionTag>();
  transactions = new Map<string, Transaction>();

  async withTransaction<T>(callback: (repository: LedgerRepository) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async ensureDefaultWorkspace(_actor: Actor) {
    return { teamId: "team_1" };
  }

  async listActorTeams(actor: Actor) {
    return [...this.memberships.entries()]
      .filter(([key]) => key.startsWith(`${actor.id}:`))
      .map(([key, role]) => ({ id: key.split(":")[1] ?? "team_1", name: "Team", role }));
  }

  async createTeam(input: { actor: Actor; name: string }) {
    this.memberships.set(`${input.actor.id}:team_1`, "owner");
    return { id: "team_1", name: input.name, role: "owner" as const };
  }

  async listWorkspace(): Promise<ReviewWorkspaceData> {
    throw new Error("Unexpected workspace list");
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

  async listCounterparties(teamId: string) {
    return [...this.counterparties.values()].filter(
      (counterparty) => counterparty.teamId === teamId,
    );
  }

  async listTransactionTags(teamId: string) {
    return [...this.tags.values()].filter((tag) => tag.teamId === teamId);
  }

  async getCounterpartyForTeam(teamId: string, counterpartyId: string) {
    const counterparty = this.counterparties.get(counterpartyId);
    return counterparty?.teamId === teamId ? counterparty : null;
  }

  async getTransactionTagForTeam(teamId: string, tagId: string) {
    const tag = this.tags.get(tagId);
    return tag?.teamId === teamId ? tag : null;
  }

  async upsertCounterparty(input: { teamId: string; name: string }) {
    const existing = [...this.counterparties.values()].find(
      (counterparty) => counterparty.teamId === input.teamId && counterparty.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const counterparty = {
      id: `counterparty_${this.counterparties.size + 1}`,
      teamId: input.teamId,
      name: input.name,
    };
    this.counterparties.set(counterparty.id, counterparty);
    return counterparty;
  }

  async upsertTransactionTag(input: { teamId: string; name: string }) {
    const existing = [...this.tags.values()].find(
      (tag) => tag.teamId === input.teamId && tag.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const tag = {
      id: `tag_${this.tags.size + 1}`,
      teamId: input.teamId,
      name: input.name,
    };
    this.tags.set(tag.id, tag);
    return tag;
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
      transferGroupId: input.draft.transferGroupId ?? null,
      providerTransactionId: input.draft.providerTransactionId ?? null,
      categoryId: input.draft.categoryId ?? null,
      reviewState: "needs_review" as const,
      duplicateKey: input.duplicateKey,
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(transaction.id, transaction);
    this.tagAssignments.push(
      ...(input.draft.tagIds ?? []).map((tagId) => ({ transactionId: transaction.id, tagId })),
    );
    return transaction;
  }

  async createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    status?: TransactionImportSession["status"];
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
      status: input.status ?? ("committed" as const),
      rowCount: input.rowCount,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions.push(importSession);
    return importSession;
  }

  async completeTransactionImportSession(input: {
    teamId: string;
    importSessionId: string;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const index = this.importSessions.findIndex(
      (session) => session.id === input.importSessionId && session.teamId === input.teamId,
    );

    if (index === -1) {
      throw new Error("missing import session");
    }

    const importSession = {
      ...this.importSessions[index]!,
      status: "committed" as const,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions[index] = importSession;
    return importSession;
  }

  async failTransactionImportSession(input: { teamId: string; importSessionId: string }) {
    const index = this.importSessions.findIndex(
      (session) => session.id === input.importSessionId && session.teamId === input.teamId,
    );

    if (index === -1) {
      throw new Error("missing import session");
    }

    const importSession = {
      ...this.importSessions[index]!,
      status: "failed" as const,
    };
    this.importSessions[index] = importSession;
    return importSession;
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
  }

  async updateTransactionReviewForTeam(): Promise<Transaction> {
    throw new Error("Unexpected transaction review update");
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

  async createTeamInvite(): Promise<TeamInvite> {
    throw new Error("Unexpected invite creation");
  }

  async listTeamMembers(): Promise<TeamMember[]> {
    throw new Error("Unexpected team member list");
  }

  async listPendingTeamInvites(): Promise<TeamInvite[]> {
    throw new Error("Unexpected invite list");
  }

  async getTeamInvite(): Promise<TeamInvite | null> {
    throw new Error("Unexpected invite lookup");
  }

  async addTeamMembership(): Promise<TeamMembership> {
    throw new Error("Unexpected membership creation");
  }

  async markTeamInviteAccepted(): Promise<TeamInvite> {
    throw new Error("Unexpected invite acceptance");
  }

  async getTeamMemberByUserId(): Promise<TeamMember | null> {
    throw new Error("Unexpected team member lookup");
  }

  async updateTeamMemberRole(): Promise<TeamMember> {
    throw new Error("Unexpected team member role update");
  }
}

const actor = { id: "user_1", type: "user" } as const;
const context = { actor, requestId: "request_1", teamId: "team_1" };

function seededRepository(role: TeamRole) {
  const repository = new MemoryLedgerRepository();
  repository.memberships.set("user_1:team_1", role);
  repository.accounts.set("acct_1", {
    id: "acct_1",
    teamId: "team_1",
    name: "Operating",
    currency: "USD",
    type: "bank",
  });
  repository.accounts.set("acct_2", {
    id: "acct_2",
    teamId: "team_1",
    name: "Savings",
    currency: "USD",
    type: "bank",
  });
  repository.categories.set("cat_software", {
    id: "cat_software",
    teamId: "team_1",
    name: "Software",
  });
  return repository;
}

describe("ledger use cases", () => {
  test("creates a ledger transaction with audit, outbox, duplicate key, and idempotency", async () => {
    const repository = seededRepository("member");
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      description: " Figma subscription ",
      postedAt: "2026-06-14",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense" as const,
      source: "manual" as const,
      categoryId: "cat_software",
      idempotencyKey: "idem_1",
    };

    const result = await createLedgerTransaction(repository, context, command);
    const replay = await createLedgerTransaction(repository, context, command);

    expect(result.transaction.description).toBe("Figma subscription");
    expect(result.transaction.duplicateKey).toBe(
      "team_1:manual:acct_1:2026-06-14:USD:-1200:figma subscription",
    );
    expect(replay.replayed).toBe(true);
    expect(repository.transactions.size).toBe(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("creates counterparties and tags idempotently", async () => {
    const repository = seededRepository("member");

    const counterparty = await createLedgerCounterparty(repository, context, {
      teamId: "team_1",
      name: "  Acme   Inc ",
      idempotencyKey: "idem_counterparty",
    });
    const counterpartyReplay = await createLedgerCounterparty(repository, context, {
      teamId: "team_1",
      name: "Acme Inc",
      idempotencyKey: "idem_counterparty",
    });
    const tag = await createTransactionTag(repository, context, {
      teamId: "team_1",
      name: "  SaaS ",
      idempotencyKey: "idem_tag",
    });
    const tagReplay = await createTransactionTag(repository, context, {
      teamId: "team_1",
      name: "SaaS",
      idempotencyKey: "idem_tag",
    });

    expect(counterparty.counterparty.name).toBe("Acme Inc");
    expect(counterpartyReplay).toEqual({ ...counterparty, replayed: true });
    expect(tag.tag.name).toBe("SaaS");
    expect(tagReplay).toEqual({ ...tag, replayed: true });
    expect(repository.counterparties.size).toBe(1);
    expect(repository.tags.size).toBe(1);
    expect(repository.auditEvents).toHaveLength(2);
  });

  test("creates tagged counterparty transactions with validated references", async () => {
    const repository = seededRepository("member");
    const counterparty = await repository.upsertCounterparty({
      teamId: "team_1",
      name: "Acme Inc",
    });
    const tag = await repository.upsertTransactionTag({ teamId: "team_1", name: "SaaS" });

    const result = await createLedgerTransaction(repository, context, {
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme subscription",
      postedAt: "2026-06-14",
      money: { amountMinor: -2500, currency: "USD" },
      type: "expense",
      source: "manual",
      counterpartyId: counterparty.id,
      tagIds: [tag.id],
      idempotencyKey: "idem_tagged_txn",
    });

    expect(result.transaction.counterpartyId).toBe(counterparty.id);
    expect(repository.tagAssignments).toEqual([
      { transactionId: result.transaction.id, tagId: tag.id },
    ]);
    await expect(
      createLedgerTransaction(repository, context, {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Missing tag",
        postedAt: "2026-06-15",
        money: { amountMinor: -100, currency: "USD" },
        type: "expense",
        source: "manual",
        tagIds: ["tag_missing"],
        idempotencyKey: "idem_missing_tag",
      }),
    ).rejects.toEqual(new AppError("NOT_FOUND", "Transaction tag not found"));
  });

  test("creates transfer pairs with a durable group id and sync outbox", async () => {
    const repository = seededRepository("member");
    const tag = await repository.upsertTransactionTag({ teamId: "team_1", name: "Transfer" });

    const result = await createLedgerTransferPair(repository, context, {
      teamId: "team_1",
      fromAccountId: "acct_1",
      toAccountId: "acct_2",
      postedAt: "2026-06-14",
      description: "Owner reserve",
      money: { amountMinor: 7500, currency: "USD" },
      tagIds: [tag.id],
      idempotencyKey: "idem_transfer_pair",
    });
    const replay = await createLedgerTransferPair(repository, context, {
      teamId: "team_1",
      fromAccountId: "acct_1",
      toAccountId: "acct_2",
      postedAt: "2026-06-14",
      description: "Owner reserve",
      money: { amountMinor: 7500, currency: "USD" },
      tagIds: [tag.id],
      idempotencyKey: "idem_transfer_pair",
    });

    expect(result.fromTransaction.money).toEqual({ amountMinor: -7500, currency: "USD" });
    expect(result.toTransaction.money).toEqual({ amountMinor: 7500, currency: "USD" });
    expect(result.fromTransaction.type).toBe("transfer");
    expect(result.toTransaction.type).toBe("transfer");
    expect(result.fromTransaction.transferGroupId).toBe(result.transferGroupId);
    expect(result.toTransaction.transferGroupId).toBe(result.transferGroupId);
    expect(repository.tagAssignments).toEqual([
      { transactionId: result.fromTransaction.id, tagId: tag.id },
      { transactionId: result.toTransaction.id, tagId: tag.id },
    ]);
    expect(repository.outboxEvents).toMatchObject([
      {
        type: "transaction.transfer_pair.created",
        payload: {
          transferGroupId: result.transferGroupId,
          transactionIds: [result.fromTransaction.id, result.toTransaction.id],
        },
      },
    ]);
    expect(replay).toEqual({ ...result, replayed: true });
    expect(repository.transactions.size).toBe(2);
  });

  test("rejects duplicate ledger transactions outside idempotent replay", async () => {
    const repository = seededRepository("owner");
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      postedAt: "2026-06-14",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense" as const,
      source: "manual" as const,
      categoryId: "cat_software",
      idempotencyKey: "idem_1",
    };

    await createLedgerTransaction(repository, context, command);

    await expect(
      createLedgerTransaction(repository, context, {
        ...command,
        idempotencyKey: "idem_2",
      }),
    ).rejects.toEqual(new AppError("CONFLICT", "Ledger transaction duplicate key already exists"));
  });

  test("blocks viewers from ledger writes", async () => {
    const repository = seededRepository("viewer");

    await expect(
      createLedgerTransaction(repository, context, {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Figma subscription",
        postedAt: "2026-06-14",
        money: { amountMinor: -1200, currency: "USD" },
        type: "expense",
        source: "manual",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(
      new AppError("FORBIDDEN", "You cannot create ledger transactions for this team"),
    );
  });

  test("returns account-scoped report totals", async () => {
    const repository = seededRepository("accountant");
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Invoice paid",
      postedAt: "2026-06-14",
      money: { amountMinor: 5000, currency: "USD" },
      type: "income",
      source: "manual",
      categoryId: "cat_revenue",
      reviewState: "reviewed",
    });
    repository.transactions.set("txn_2", {
      id: "txn_2",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Software",
      postedAt: "2026-06-14",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "manual",
      categoryId: "cat_software",
      reviewState: "reviewed",
    });

    const summary = await listLedgerSummary(repository, context, {
      teamId: "team_1",
      accountId: "acct_1",
    });

    expect(summary.transactionCount).toBe(2);
    expect(summary.totals.profit).toEqual({ amountMinor: 3800, currency: "USD" });
    expect(summary.totals.categoryTotals.cat_software).toEqual({
      amountMinor: -1200,
      currency: "USD",
    });
  });

  test("summarizes mixed-currency ledgers using the dominant transaction currency", async () => {
    const repository = seededRepository("accountant");
    repository.accounts.set("acct_sek", {
      id: "acct_sek",
      teamId: "team_1",
      name: "SEK checking",
      currency: "SEK",
      type: "bank",
    });
    repository.transactions.set("txn_usd", {
      id: "txn_usd",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      postedAt: "2026-06-10",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "manual",
      categoryId: "cat_software",
      reviewState: "reviewed",
    });
    repository.transactions.set("txn_sek_income", {
      id: "txn_sek_income",
      teamId: "team_1",
      accountId: "acct_sek",
      description: "Owner transfer",
      postedAt: "2026-06-14",
      money: { amountMinor: 360_00, currency: "SEK" },
      type: "income",
      source: "csv_import",
      categoryId: null,
      reviewState: "reviewed",
    });
    repository.transactions.set("txn_sek_expense", {
      id: "txn_sek_expense",
      teamId: "team_1",
      accountId: "acct_sek",
      description: "100003655822",
      postedAt: "2026-06-14",
      money: { amountMinor: -130_00, currency: "SEK" },
      type: "expense",
      source: "csv_import",
      categoryId: "cat_software",
      reviewState: "reviewed",
    });

    const summary = await listLedgerSummary(repository, context, {
      teamId: "team_1",
    });

    expect(summary.transactionCount).toBe(3);
    expect(summary.totals.revenue).toEqual({ amountMinor: 360_00, currency: "SEK" });
    expect(summary.totals.expenses).toEqual({ amountMinor: -130_00, currency: "SEK" });
    expect(summary.totals.profit).toEqual({ amountMinor: 230_00, currency: "SEK" });
  });
});

describe("CSV transaction import", () => {
  test("previews ready, duplicate, and invalid rows", async () => {
    const repository = seededRepository("member");
    repository.transactions.set("existing_txn", {
      id: "existing_txn",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      postedAt: "2026-06-14",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "csv_import",
      categoryId: "cat_software",
      reviewState: "needs_review",
      duplicateKey: "team_1:csv_import:acct_1:2026-06-14:USD:-1200:figma subscription",
    });

    const preview = await previewCsvTransactionImport(repository, context, {
      teamId: "team_1",
      accountId: "acct_1",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\nnot-a-date,Broken,-1.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        categoryId: "cat_software",
      },
    });

    expect(preview.readyCount).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.invalidCount).toBe(1);
    expect(preview.summary).toEqual({
      readyDateRange: {
        from: "2026-06-15T00:00:00.000Z",
        to: "2026-06-15T00:00:00.000Z",
      },
      readyCurrencyTotals: { USD: { amountMinor: 5000, currency: "USD" } },
      readyIncomeCount: 1,
      readyExpenseCount: 0,
      readyZeroAmountCount: 0,
    });
    expect(preview.headers).toEqual(["Date", "Description", "Amount"]);
    expect(preview.detectedMapping).toMatchObject({
      postedAt: "Date",
      description: "Description",
      amount: "Amount",
    });
    expect(preview.rows.map((row) => row.status)).toEqual(["duplicate", "ready", "invalid"]);
  });

  test("commits ready CSV rows with import session, audit, outbox, and idempotency", async () => {
    const repository = seededRepository("owner");
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "transactions.csv",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        categoryId: "cat_software",
      },
      idempotencyKey: "idem_1",
    };

    const result = await commitCsvTransactionImport(repository, context, command);
    const replay = await commitCsvTransactionImport(repository, context, command);

    expect(result.importSession.importedCount).toBe(2);
    expect(result.transactions).toHaveLength(2);
    expect(replay.replayed).toBe(true);
    expect(repository.importSessions).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("imports semicolon CSV exports with debit and credit columns", async () => {
    const repository = seededRepository("owner");
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "bank-export.csv",
      csvText:
        "Date;Description;Debit;Credit;Currency\n2026-06-14;Figma subscription;12,34;;USD\n2026-06-15;Invoice;;50,00;USD\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
        currency: "Currency",
        categoryId: "cat_software",
      },
      idempotencyKey: "idem_debit_credit",
    };

    const preview = await previewCsvTransactionImport(repository, context, command);
    const result = await commitCsvTransactionImport(repository, context, command);

    expect(preview.readyCount).toBe(2);
    expect(preview.summary).toEqual({
      readyDateRange: {
        from: "2026-06-14T00:00:00.000Z",
        to: "2026-06-15T00:00:00.000Z",
      },
      readyCurrencyTotals: { USD: { amountMinor: 3766, currency: "USD" } },
      readyIncomeCount: 1,
      readyExpenseCount: 1,
      readyZeroAmountCount: 0,
    });
    expect(result.transactions.map((transaction) => transaction.money)).toEqual([
      { amountMinor: -1234, currency: "USD" },
      { amountMinor: 5000, currency: "USD" },
    ]);
    expect(result.preview.rows.map((row) => row.status)).toEqual(["ready", "ready"]);
  });

  test("suggests a generic mapping for split amount CSV exports before preview", async () => {
    const repository = seededRepository("owner");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "SEK",
      type: "bank",
    });
    const csvText = [
      "A,B,C,D,E,F,G",
      "2026-06-16,2026-06-16,ERIK KROON C,Transfer,360.00,,130.00",
      "2026-06-16,2026-06-16,AVI OVERDRAFT,Other,,-100.00,-230.00",
      "2026-06-02,2026-06-02,100003843496,Other,,-130.00,-130.00",
      "2026-05-12,2026-05-12,ERIK KROON C,Transfer,127.00,,0.00",
    ].join("\n");

    const suggestion = await suggestCsvTransactionImportMapping(repository, context, {
      teamId: "team_1",
      csvText,
    });
    const preview = await previewCsvTransactionImport(repository, context, {
      teamId: "team_1",
      accountId: "acct_1",
      csvText,
      mapping: suggestion.mapping,
    });

    expect(suggestion).toMatchObject({
      source: "heuristic",
      mapping: {
        postedAt: "A",
        description: "C",
        amount: null,
        credit: "E",
        debit: "F",
        balance: "G",
      },
    });
    expect(preview.readyCount).toBe(4);
    expect(preview.summary.readyCurrencyTotals).toEqual({
      SEK: { amountMinor: 25700, currency: "SEK" },
    });
    expect(preview.rows.every((row) => row.draft?.money.currency === "SEK")).toBe(true);
  });

  test("imports bank exports whose signed amount convention needs inversion", async () => {
    const repository = seededRepository("owner");
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "bank-export.csv",
      csvText:
        "Transaction Date,Merchant,Amount,Currency\n2026-06-14,Figma subscription,12.34,USD\n",
      mapping: {
        postedAt: "Transaction Date",
        description: "Merchant",
        amount: "Amount",
        currency: "Currency",
        invertAmount: true,
      },
      idempotencyKey: "idem_invert",
    };

    const result = await commitCsvTransactionImport(repository, context, command);

    expect(result.transactions[0]?.money).toEqual({ amountMinor: -1234, currency: "USD" });
    expect(result.transactions[0]?.type).toBe("expense");
  });

  test("queues large CSV imports without committing rows inline", async () => {
    const repository = seededRepository("owner");
    const payloadStorage = new MemoryTransactionImportPayloadStorage();
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "large-bank-export.csv",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n2026-06-16,Office,-24.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
      },
      idempotencyKey: "idem_large_import",
    };

    const result = await commitCsvTransactionImport(repository, context, command, {
      payloadStorage,
      synchronousRowLimit: 2,
    });

    expect(result.mode).toBe("queued");
    expect(result.importSession).toMatchObject({
      status: "queued",
      rowCount: 3,
      importedCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
    });
    expect(result.transactions).toEqual([]);
    expect(repository.transactions).toHaveLength(0);
    expect(payloadStorage.objects.size).toBe(1);
    expect([...payloadStorage.objects.values()][0]?.body).toContain("large-bank-export.csv");
    expect(repository.auditEvents[0]).toMatchObject({ action: "transaction_import.queued" });
    expect(repository.outboxEvents[0]).toMatchObject({
      type: "transaction_import.queued",
      payload: {
        importSessionId: "import_1",
        payloadObjectKey: expect.stringContaining("transaction-imports/import_1.json"),
        readyCount: 3,
      },
    });
  });

  test("runs queued CSV imports through the committed import path and deletes payload", async () => {
    const repository = seededRepository("owner");
    const payloadStorage = new MemoryTransactionImportPayloadStorage();
    const command = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "large-bank-export.csv",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n2026-06-16,Office,-24.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
      },
      idempotencyKey: "idem_large_import_execute",
    };
    const queued = await commitCsvTransactionImport(repository, context, command, {
      payloadStorage,
      synchronousRowLimit: 2,
    });
    const payloadObjectKey = queued.queuedJob?.payloadObjectKey;

    if (!payloadObjectKey) {
      throw new Error("Expected queued import payload object key");
    }

    const result = await runQueuedCsvTransactionImport(
      repository,
      payloadStorage,
      {
        actor: { id: "system:transaction-import", type: "system" },
        requestId: "transaction-import:outbox_1",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        importSessionId: queued.importSession.id,
        payloadObjectKey,
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "transaction-import:commit:outbox_1",
      },
    );

    expect(result.mode).toBe("committed");
    expect(result.importSession).toMatchObject({ status: "committed", importedCount: 3 });
    expect(result.transactions).toHaveLength(3);
    expect(payloadStorage.deletedKeys).toEqual([payloadObjectKey]);
    expect(payloadStorage.objects.size).toBe(0);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "transaction_import.committed",
      payload: {
        importSessionId: "import_1",
        transactionIds: ["txn_1", "txn_2", "txn_3"],
      },
    });
  });

  test("blocks viewers from CSV import", async () => {
    const repository = seededRepository("viewer");

    await expect(
      previewCsvTransactionImport(repository, context, {
        teamId: "team_1",
        accountId: "acct_1",
        csvText: "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n",
        mapping: {
          postedAt: "Date",
          description: "Description",
          amount: "Amount",
        },
      }),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot import transactions for this team"));
  });
});
