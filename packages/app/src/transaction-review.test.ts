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
  type IdempotencyResult,
  type ReviewTransactionResult,
  type TransactionImportSession,
  type TransactionReviewRepository,
  listTransactionReviewWorkspace,
  reviewTransaction,
} from "./index";

class MemoryTransactionReviewRepository implements TransactionReviewRepository {
  auditEvents = 0;
  outboxEvents = 0;
  memberships = new Map<string, TeamRole>();
  transactions = new Map<string, Transaction>();
  categories = new Map<string, Category>();
  idempotency = new Map<string, IdempotencyResult<ReviewTransactionResult>>();
  invites = new Map<string, TeamInvite>();

  async withTransaction<T>(
    callback: (repository: TransactionReviewRepository) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  async ensureDefaultWorkspace(_actor: Actor) {
    return { teamId: "team_1" };
  }

  async listActorTeams(actor: Actor) {
    const memberships = [...this.memberships.entries()].filter(([key]) =>
      key.startsWith(`${actor.id}:`),
    );

    return memberships.map(([key, role]) => {
      const teamId = key.split(":")[1] ?? "team_1";
      return { id: teamId, name: teamId, role };
    });
  }

  async createTeam(input: { actor: Actor; name: string }) {
    const teamId = `team_${this.memberships.size + 1}`;
    this.memberships.set(`${input.actor.id}:${teamId}`, "owner");
    return { id: teamId, name: input.name, role: "owner" as const };
  }

  async listWorkspace(_actor: Actor, teamId: string) {
    return {
      teamId,
      teamName: "Test Team",
      categories: [...this.categories.values()].filter((category) => category.teamId === teamId),
      transactions: [...this.transactions.values()].filter(
        (transaction) => transaction.teamId === teamId,
      ),
      sync: {
        collection: "transactions" as const,
        cursor: null,
        conflictPolicy: "server_wins_for_financial_state" as const,
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

  async listLedgerAccounts(): Promise<LedgerAccount[]> {
    throw new Error("Unexpected ledger account list");
  }

  async getLedgerAccountForTeam(): Promise<LedgerAccount | null> {
    throw new Error("Unexpected ledger account lookup");
  }

  async getTransactionByDuplicateKey(): Promise<Transaction | null> {
    throw new Error("Unexpected duplicate transaction lookup");
  }

  async listTransactionsForReport(): Promise<Transaction[]> {
    throw new Error("Unexpected report transaction list");
  }

  async createLedgerTransactionForTeam(_input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }): Promise<Transaction> {
    throw new Error("Unexpected ledger transaction creation");
  }

  async createTransactionImportSession(): Promise<TransactionImportSession> {
    throw new Error("Unexpected transaction import session creation");
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

  async appendAuditEvent() {
    this.auditEvents += 1;
  }

  async appendOutboxEvent() {
    this.outboxEvents += 1;
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
      result: input.result as ReviewTransactionResult,
    });
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

  async listTeamMembers(): Promise<TeamMember[]> {
    throw new Error("Unexpected team member list");
  }

  async listPendingTeamInvites(): Promise<TeamInvite[]> {
    throw new Error("Unexpected team invite list");
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

function seededRepository(role: TeamRole) {
  const repository = new MemoryTransactionReviewRepository();
  repository.memberships.set("user_1:team_1", role);
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
  return repository;
}

describe("reviewTransaction", () => {
  test("categorizes, marks reviewed, audits, and emits outbox", async () => {
    const repository = seededRepository("member");

    const result = await reviewTransaction(
      repository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1" },
      { teamId: "team_1", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
    );

    expect(result.transaction.categoryId).toBe("cat_1");
    expect(result.transaction.reviewState).toBe("reviewed");
    expect(result.replayed).toBe(false);
    expect(repository.auditEvents).toBe(1);
    expect(repository.outboxEvents).toBe(1);
  });

  test("rejects a forbidden actor", async () => {
    const repository = seededRepository("viewer");

    await expect(
      reviewTransaction(
        repository,
        { actor: { id: "user_1", type: "user" }, requestId: "request_1" },
        {
          teamId: "team_1",
          transactionId: "txn_1",
          categoryId: "cat_1",
          idempotencyKey: "idem_1",
        },
      ),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot review transactions for this team"));
  });

  test("replays an idempotent mutation without duplicate side effects", async () => {
    const repository = seededRepository("owner");
    const context = { actor: { id: "user_1", type: "user" } as const, requestId: "request_1" };
    const command = {
      teamId: "team_1",
      transactionId: "txn_1",
      categoryId: "cat_1",
      idempotencyKey: "idem_1",
    };

    await reviewTransaction(repository, context, command);
    const replay = await reviewTransaction(repository, context, command);

    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toBe(1);
    expect(repository.outboxEvents).toBe(1);
  });

  test("rejects idempotency key reuse for a different review command", async () => {
    const repository = seededRepository("owner");
    const context = { actor: { id: "user_1", type: "user" } as const, requestId: "request_1" };
    const command = {
      teamId: "team_1",
      transactionId: "txn_1",
      categoryId: "cat_1",
      idempotencyKey: "idem_1",
    };

    await reviewTransaction(repository, context, command);
    repository.categories.set("cat_2", { id: "cat_2", teamId: "team_1", name: "Meals" });

    await expect(
      reviewTransaction(repository, context, { ...command, categoryId: "cat_2" }),
    ).rejects.toEqual(
      new AppError("CONFLICT", "Idempotency key was already used for a different review"),
    );
    expect(repository.auditEvents).toBe(1);
    expect(repository.outboxEvents).toBe(1);
  });

  test("does not leak a selected team's query across memberships", async () => {
    const repository = seededRepository("owner");

    await expect(
      listTransactionReviewWorkspace(repository, {
        actor: { id: "user_1", type: "user" },
        requestId: "request_1",
        teamId: "team_2",
      }),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot read transactions for this team"));
  });

  test("returns not found when selected team does not own the transaction", async () => {
    const repository = seededRepository("owner");
    repository.memberships.set("user_1:team_2", "owner");

    await expect(
      reviewTransaction(
        repository,
        { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_2" },
        { teamId: "team_2", transactionId: "txn_1", categoryId: "cat_1", idempotencyKey: "idem_1" },
      ),
    ).rejects.toEqual(new AppError("NOT_FOUND", "Transaction not found"));
  });
});
