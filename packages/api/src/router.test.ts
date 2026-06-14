import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type {
  Actor,
  Category,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import type {
  ActorTeam,
  IdempotencyResult,
  ReviewWorkspaceData,
  TransactionReviewRepository,
} from "@dawn/app";

class MemoryTransactionReviewRepository implements TransactionReviewRepository {
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];
  categories = new Map<string, Category>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  invites = new Map<string, TeamInvite>();
  memberships = new Map<string, TeamRole>();
  teams = new Map<string, string>();
  transactions = new Map<string, Transaction>();
  users = new Map<string, { email: string; name: string }>();

  async withTransaction<T>(
    callback: (repository: TransactionReviewRepository) => Promise<T>,
  ): Promise<T> {
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

function testContext(user?: { id: string; email: string }) {
  return {
    auth: null,
    requestId: "request_1",
    session: user ? { user } : null,
  };
}

async function createTestRouter(repository: TransactionReviewRepository) {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";

  const { createAppRouter } = await import("./routers/index");
  return createAppRouter({ transactionReviewRepository: repository });
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
});
