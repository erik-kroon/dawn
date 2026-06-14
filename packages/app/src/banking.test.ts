import { describe, expect, test } from "bun:test";
import type {
  Actor,
  Category,
  LedgerAccount,
  LedgerTransactionDraft,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import { createMockBankingProvider } from "@dawn/integrations";

import {
  AppError,
  connectMockBankConnection,
  syncBankConnection,
  type BankAccount,
  type BankConnection,
  type BankingUseCaseRepository,
  type IdempotencyResult,
  type ProviderSyncRun,
  type ReviewWorkspaceData,
  type TransactionImportSession,
  type TransactionReviewRepository,
} from "./index";

class MemoryBankingRepository implements BankingUseCaseRepository {
  accounts = new Map<string, LedgerAccount>();
  auditEvents: unknown[] = [];
  bankAccounts = new Map<string, BankAccount>();
  bankConnections = new Map<string, BankConnection>();
  categories = new Map<string, Category>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  importSessions: TransactionImportSession[] = [];
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];
  providerObjects = new Map<string, Record<string, unknown>>();
  syncRuns: ProviderSyncRun[] = [];
  transactions = new Map<string, Transaction>();

  async withTransaction<T>(
    callback: (repository: TransactionReviewRepository) => Promise<T>,
  ): Promise<T> {
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

  async listTransactionsForSync(input: { teamId: string }) {
    return [...this.transactions.values()].filter(
      (transaction) => transaction.teamId === input.teamId,
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

  async createTransactionImportSession(): Promise<TransactionImportSession> {
    throw new Error("Unexpected import session");
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

  async upsertBankConnection(
    input: Parameters<BankingUseCaseRepository["upsertBankConnection"]>[0],
  ) {
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

  async upsertBankAccount(input: Parameters<BankingUseCaseRepository["upsertBankAccount"]>[0]) {
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

  async finishProviderSyncRun(
    input: Parameters<BankingUseCaseRepository["finishProviderSyncRun"]>[0],
  ) {
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

  async markBankConnectionSynced(
    input: Parameters<BankingUseCaseRepository["markBankConnectionSynced"]>[0],
  ) {
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

  async upsertProviderObject(
    input: Parameters<BankingUseCaseRepository["upsertProviderObject"]>[0],
  ) {
    this.providerObjects.set(
      `${input.provider}:${input.providerObjectType}:${input.providerObjectId}`,
      input.rawPayload,
    );
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

const provider = createMockBankingProvider();
const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

function seededRepository(role: TeamRole) {
  const repository = new MemoryBankingRepository();
  repository.memberships.set("user_1:team_1", role);
  return repository;
}

describe("banking use cases", () => {
  test("connects a mock bank connection with audit, outbox, raw payload, and idempotency", async () => {
    const repository = seededRepository("owner");
    const command = { teamId: "team_1", idempotencyKey: "idem_1" };

    const result = await connectMockBankConnection(repository, provider, context, command);
    const replay = await connectMockBankConnection(repository, provider, context, command);

    expect(result.connection).toMatchObject({
      provider: "mock-bank",
      providerConnectionId: "mock_conn_team_1",
      institutionName: "Mock Bank",
      status: "connected",
    });
    expect(replay.replayed).toBe(true);
    expect(repository.bankConnections.size).toBe(1);
    expect(repository.providerObjects.get("mock-bank:connection:mock_conn_team_1")).toMatchObject({
      mock: true,
      teamId: "team_1",
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("syncs mock provider accounts and transactions idempotently", async () => {
    const repository = seededRepository("owner");
    const connected = await connectMockBankConnection(repository, provider, context, {
      teamId: "team_1",
      idempotencyKey: "connect_1",
    });

    const firstSync = await syncBankConnection(repository, provider, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
      idempotencyKey: "sync_1",
    });
    const replay = await syncBankConnection(repository, provider, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
      idempotencyKey: "sync_1",
    });
    const secondSync = await syncBankConnection(repository, provider, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
      idempotencyKey: "sync_2",
    });

    expect(firstSync.accounts).toHaveLength(2);
    expect(firstSync.transactions).toHaveLength(2);
    expect(firstSync.syncRun).toMatchObject({
      status: "completed",
      accountsSynced: 2,
      transactionsImported: 2,
      duplicateCount: 0,
    });
    expect(replay.replayed).toBe(true);
    expect(secondSync.transactions).toHaveLength(0);
    expect(secondSync.duplicateCount).toBe(2);
    expect(repository.transactions.size).toBe(2);
    expect([...repository.transactions.values()].map((transaction) => transaction.source)).toEqual([
      "bank_sync",
      "bank_sync",
    ]);
    expect(
      repository.providerObjects.get(
        "mock-bank:transaction:mock-bank:mock_conn_team_1:mock_checking:mock_txn_figma",
      ),
    ).toMatchObject({
      source: "mock-bank",
    });
    expect(repository.outboxEvents).toHaveLength(3);
  });

  test("denies mock bank connection management to viewers", async () => {
    const repository = seededRepository("viewer");

    await expect(
      connectMockBankConnection(repository, provider, context, {
        teamId: "team_1",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot connect bank providers for this team"));
  });
});
