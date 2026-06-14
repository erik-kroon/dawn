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
  acceptTeamInvite,
  type ActorTeam,
  type AcceptTeamInviteResult,
  type IdempotencyResult,
  type InviteTeamMemberResult,
  type ReviewWorkspaceData,
  type TransactionImportSession,
  type TransactionReviewRepository,
  inviteTeamMember,
  listTeamDirectory,
  resolveTeamAccess,
  updateTeamMemberRole,
} from "./index";

class MemoryTeamRepository implements TransactionReviewRepository {
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];
  defaultWorkspaceCalls = 0;
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  invites = new Map<string, TeamInvite>();
  memberships = new Map<string, TeamRole>();

  async withTransaction<T>(
    callback: (repository: TransactionReviewRepository) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  async ensureDefaultWorkspace(_actor: Actor) {
    this.defaultWorkspaceCalls += 1;
    return { teamId: "team_1" };
  }

  async listActorTeams(actor: Actor): Promise<ActorTeam[]> {
    return [...this.memberships.entries()]
      .filter(([key]) => key.startsWith(`${actor.id}:`))
      .map(([key, role]) => ({ id: key.split(":")[1] ?? "team_1", name: "Team", role }));
  }

  async createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam> {
    this.memberships.set(`${input.actor.id}:team_1`, "owner");
    return { id: "team_1", name: input.name, role: "owner" };
  }

  async listWorkspace(_actor: Actor, teamId: string): Promise<ReviewWorkspaceData> {
    return {
      teamId,
      teamName: "Team",
      categories: [],
      transactions: [],
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

  async getTransactionForTeam(
    _teamId: string,
    _transactionId: string,
  ): Promise<Transaction | null> {
    throw new Error("Unexpected transaction lookup");
  }

  async getCategoryForTeam(_teamId: string, _categoryId: string): Promise<Category | null> {
    throw new Error("Unexpected category lookup");
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

  async listTransactionsForSync(): Promise<Transaction[]> {
    throw new Error("Unexpected sync transaction list");
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

  async updateTransactionReviewForTeam(): Promise<Transaction> {
    throw new Error("Unexpected transaction update");
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

  async listTeamMembers(teamId: string) {
    return [...this.memberships.entries()]
      .filter(([key]) => key.endsWith(`:${teamId}`))
      .map(([key, role]) => {
        const userId = key.split(":")[0] ?? "user_1";
        return {
          id: `${teamId}:${userId}`,
          teamId,
          userId,
          role,
          name: null,
          email: null,
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
    const key = `${input.userId}:${input.teamId}`;

    if (this.memberships.has(key)) {
      throw new Error("duplicate membership");
    }

    this.memberships.set(key, input.role);
    return {
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
    };
  }

  async markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }) {
    const invite = this.invites.get(input.inviteId);

    if (!invite || invite.status !== "pending") {
      throw new Error("Team invite was not accepted");
    }

    const acceptedInvite = {
      ...invite,
      status: "accepted" as const,
    };
    this.invites.set(input.inviteId, acceptedInvite);
    return acceptedInvite;
  }

  async getTeamMemberByUserId(teamId: string, userId: string): Promise<TeamMember | null> {
    const role = this.memberships.get(`${userId}:${teamId}`);
    return role ? { id: `${teamId}:${userId}`, teamId, userId, role } : null;
  }

  async updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember> {
    const key = `${input.userId}:${input.teamId}`;

    if (!this.memberships.has(key)) {
      throw new Error("missing membership");
    }

    this.memberships.set(key, input.role);
    return {
      id: `${input.teamId}:${input.userId}`,
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
    };
  }
}

const actor = { id: "user_1", type: "user", email: "owner@example.com" } as const;
const context = { actor, requestId: "request_1", teamId: "team_1" };

describe("team permissions", () => {
  test("resolves team access with role permissions", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "accountant");

    const access = await resolveTeamAccess(repository, context, "transactions.categorize");

    expect(access).toEqual({
      teamId: "team_1",
      role: "accountant",
      permissions: [
        "transactions.read",
        "transactions.categorize",
        "documents.read",
        "documents.write",
        "invoices.read",
        "invoices.write",
        "assistant.use",
      ],
    });
    expect(repository.defaultWorkspaceCalls).toBe(0);
  });

  test("denies team management to members", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "member");

    await expect(
      inviteTeamMember(repository, context, {
        teamId: "team_1",
        email: "bookkeeper@example.com",
        role: "accountant",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot invite members to this team"));
  });

  test("lists team directory for team managers", async () => {
    const repository = new MemoryTeamRepository();
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

    const directory = await listTeamDirectory(repository, context);

    expect(directory.members.map((member) => [member.userId, member.role])).toEqual([
      ["user_1", "admin"],
      ["user_2", "viewer"],
    ]);
    expect(directory.pendingInvites).toHaveLength(1);
    expect(directory.pendingInvites[0]?.email).toBe("pending@example.com");
  });

  test("denies team directory to non-managers", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "viewer");

    await expect(listTeamDirectory(repository, context)).rejects.toEqual(
      new AppError("FORBIDDEN", "You cannot manage members for this team"),
    );
  });

  test("creates team invites with audit, outbox, and idempotent replay", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "owner");
    const command = {
      teamId: "team_1",
      email: " Bookkeeper@Example.com ",
      role: "accountant" as const,
      idempotencyKey: "idem_1",
    };

    const first = await inviteTeamMember(repository, context, command);
    const replay = await inviteTeamMember(repository, context, command);

    expect(first.invite.email).toBe("bookkeeper@example.com");
    expect(first.invite.role).toBe("accountant");
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({
      ...(first as InviteTeamMemberResult),
      replayed: true,
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("rejects idempotency key reuse for a different invite", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "owner");
    const command = {
      teamId: "team_1",
      email: "bookkeeper@example.com",
      role: "accountant" as const,
      idempotencyKey: "idem_1",
    };

    await inviteTeamMember(repository, context, command);

    await expect(
      inviteTeamMember(repository, context, { ...command, role: "viewer" }),
    ).rejects.toEqual(
      new AppError("CONFLICT", "Idempotency key was already used for a different invite"),
    );
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("does not assign ownership by invite", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "admin");

    await expect(
      inviteTeamMember(repository, context, {
        teamId: "team_1",
        email: "new-owner@example.com",
        role: "owner",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(new AppError("CONFLICT", "Owner role cannot be assigned by invite"));
    expect(repository.invites).toHaveLength(0);
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.outboxEvents).toHaveLength(0);
  });

  test("accepts a pending invite for the matching actor email", async () => {
    const repository = new MemoryTeamRepository();
    repository.invites.set("invite_1", {
      id: "invite_1",
      teamId: "team_1",
      email: "bookkeeper@example.com",
      role: "accountant",
      status: "pending",
      invitedByActorId: "user_1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const invitedContext = {
      actor: { id: "user_2", type: "user", email: "Bookkeeper@Example.com" } as const,
      requestId: "request_2",
    };
    const command = { inviteId: "invite_1", idempotencyKey: "idem_1" };

    const first = await acceptTeamInvite(repository, invitedContext, command);
    const replay = await acceptTeamInvite(repository, invitedContext, command);

    expect(first.membership).toEqual({
      teamId: "team_1",
      userId: "user_2",
      role: "accountant",
    });
    expect(first.invite.status).toBe("accepted");
    expect(replay).toEqual({
      ...(first as AcceptTeamInviteResult),
      replayed: true,
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("rejects invite acceptance from another email", async () => {
    const repository = new MemoryTeamRepository();
    repository.invites.set("invite_1", {
      id: "invite_1",
      teamId: "team_1",
      email: "bookkeeper@example.com",
      role: "accountant",
      status: "pending",
      invitedByActorId: "user_1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(
      acceptTeamInvite(
        repository,
        {
          actor: { id: "user_2", type: "user", email: "other@example.com" },
          requestId: "request_2",
        },
        { inviteId: "invite_1", idempotencyKey: "idem_1" },
      ),
    ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot accept this team invite"));
    expect(repository.memberships.has("user_2:team_1")).toBe(false);
  });

  test("rejects invite acceptance when actor already belongs to the team", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_2:team_1", "viewer");
    repository.invites.set("invite_1", {
      id: "invite_1",
      teamId: "team_1",
      email: "bookkeeper@example.com",
      role: "accountant",
      status: "pending",
      invitedByActorId: "user_1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(
      acceptTeamInvite(
        repository,
        {
          actor: { id: "user_2", type: "user", email: "bookkeeper@example.com" },
          requestId: "request_2",
        },
        { inviteId: "invite_1", idempotencyKey: "idem_1" },
      ),
    ).rejects.toEqual(new AppError("CONFLICT", "You already belong to this team"));
  });

  test("updates managed member roles with audit, outbox, and idempotent replay", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "admin");
    repository.memberships.set("user_2:team_1", "viewer");
    const command = {
      teamId: "team_1",
      userId: "user_2",
      role: "accountant" as const,
      idempotencyKey: "idem_1",
    };

    const first = await updateTeamMemberRole(repository, context, command);
    const replay = await updateTeamMemberRole(repository, context, command);

    expect(first.membership.role).toBe("accountant");
    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("does not update owner roles through generic role management", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "owner");
    repository.memberships.set("user_2:team_1", "owner");

    await expect(
      updateTeamMemberRole(repository, context, {
        teamId: "team_1",
        userId: "user_2",
        role: "admin",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(new AppError("CONFLICT", "Owner role changes require ownership transfer"));
  });

  test("does not let actors change their own role", async () => {
    const repository = new MemoryTeamRepository();
    repository.memberships.set("user_1:team_1", "admin");

    await expect(
      updateTeamMemberRole(repository, context, {
        teamId: "team_1",
        userId: "user_1",
        role: "viewer",
        idempotencyKey: "idem_1",
      }),
    ).rejects.toEqual(new AppError("CONFLICT", "You cannot update your own role"));
  });
});
