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

import {
  AppError,
  createLedgerTransaction,
  type IdempotencyResult,
  type ReviewWorkspaceData,
  type TransactionReviewRepository,
  listLedgerSummary,
} from "./index";

class MemoryLedgerRepository implements TransactionReviewRepository {
  accounts = new Map<string, LedgerAccount>();
  auditEvents: unknown[] = [];
  categories = new Map<string, Category>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];
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

  async listTransactionsForReport(input: { teamId: string; accountId?: string }) {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.teamId === input.teamId &&
        (!input.accountId || transaction.accountId === input.accountId),
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
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
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
});
