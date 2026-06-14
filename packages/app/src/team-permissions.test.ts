import { describe, expect, test } from "bun:test";
import type { Actor, Category, TeamInvite, TeamRole, Transaction } from "@dawn/domain";

import {
  AppError,
  type ActorTeam,
  type IdempotencyResult,
  type InviteTeamMemberResult,
  type ReviewWorkspaceData,
  type TransactionReviewRepository,
  inviteTeamMember,
  resolveTeamAccess,
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
}

const actor = { id: "user_1", type: "user" } as const;
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
});
