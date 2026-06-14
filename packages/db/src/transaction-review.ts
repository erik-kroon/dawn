import type {
  ActorTeam,
  IdempotencyResult,
  ReviewWorkspaceData,
  TransactionReviewRepository,
} from "@dawn/app";
import type {
  Actor,
  Category,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./index";
import * as schema from "./schema";

type Database = typeof db;
type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];
type QueryClient = Database | TransactionClient;

export class DrizzleTransactionReviewRepository implements TransactionReviewRepository {
  constructor(private readonly client: QueryClient = db) {}

  async withTransaction<T>(
    callback: (repository: TransactionReviewRepository) => Promise<T>,
  ): Promise<T> {
    if (!("transaction" in this.client)) {
      return callback(this);
    }

    return this.client.transaction((transactionClient) =>
      callback(new DrizzleTransactionReviewRepository(transactionClient)),
    );
  }

  async ensureDefaultWorkspace(actor: Actor) {
    const existingMembership = await this.client
      .select({ teamId: schema.teamMembership.teamId })
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.userId, actor.id))
      .limit(1);

    if (existingMembership[0]) {
      return { teamId: existingMembership[0].teamId };
    }

    const team = await this.createTeam({ actor, name: "Acme Studio" });

    return { teamId: team.id };
  }

  async listActorTeams(actor: Actor): Promise<ActorTeam[]> {
    const teams = await this.client
      .select({
        id: schema.team.id,
        name: schema.team.name,
        role: schema.teamMembership.role,
      })
      .from(schema.teamMembership)
      .innerJoin(schema.team, eq(schema.team.id, schema.teamMembership.teamId))
      .where(eq(schema.teamMembership.userId, actor.id));

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      role: team.role as TeamRole,
    }));
  }

  async createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam> {
    const teamId = crypto.randomUUID();
    const softwareCategoryId = crypto.randomUUID();
    const mealsCategoryId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();

    await this.client.insert(schema.team).values({
      id: teamId,
      name: input.name,
    });
    await this.client.insert(schema.teamMembership).values({
      id: crypto.randomUUID(),
      teamId,
      userId: input.actor.id,
      role: "owner",
    });
    await this.client.insert(schema.transactionCategory).values([
      { id: softwareCategoryId, teamId, name: "Software" },
      { id: mealsCategoryId, teamId, name: "Meals" },
    ]);
    await this.client.insert(schema.transaction).values({
      id: transactionId,
      teamId,
      description: "Figma subscription",
      postedAt: new Date("2026-06-14T00:00:00.000Z"),
      amountMinor: -1200,
      currency: "USD",
      reviewState: "needs_review",
    });

    return { id: teamId, name: input.name, role: "owner" };
  }

  async listWorkspace(_actor: Actor, teamId: string): Promise<ReviewWorkspaceData> {
    const [team] = await this.client
      .select({ id: schema.team.id, name: schema.team.name })
      .from(schema.team)
      .where(eq(schema.team.id, teamId))
      .limit(1);

    const categories = await this.client
      .select()
      .from(schema.transactionCategory)
      .where(eq(schema.transactionCategory.teamId, teamId));

    const transactions = await this.client
      .select()
      .from(schema.transaction)
      .where(eq(schema.transaction.teamId, teamId))
      .orderBy(desc(schema.transaction.postedAt));

    return {
      teamId,
      teamName: team?.name ?? "Workspace",
      categories: categories.map(mapCategory),
      transactions: transactions.map(mapTransaction),
      sync: {
        collection: "transactions",
        cursor: transactions[0]?.updatedAt.toISOString() ?? null,
        conflictPolicy: "server_wins_for_financial_state",
      },
    };
  }

  async getMembership(actor: Actor, teamId: string) {
    const [membership] = await this.client
      .select({ role: schema.teamMembership.role })
      .from(schema.teamMembership)
      .where(
        and(eq(schema.teamMembership.teamId, teamId), eq(schema.teamMembership.userId, actor.id)),
      )
      .limit(1);

    if (!membership) {
      return null;
    }

    return { role: membership.role as TeamRole };
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    const [transaction] = await this.client
      .select()
      .from(schema.transaction)
      .where(and(eq(schema.transaction.teamId, teamId), eq(schema.transaction.id, transactionId)))
      .limit(1);

    return transaction ? mapTransaction(transaction) : null;
  }

  async getCategoryForTeam(teamId: string, categoryId: string) {
    const [category] = await this.client
      .select()
      .from(schema.transactionCategory)
      .where(
        and(
          eq(schema.transactionCategory.teamId, teamId),
          eq(schema.transactionCategory.id, categoryId),
        ),
      )
      .limit(1);

    return category ? mapCategory(category) : null;
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    const [record] = await this.client
      .select({
        fingerprint: schema.idempotencyKey.fingerprint,
        result: schema.idempotencyKey.result,
      })
      .from(schema.idempotencyKey)
      .where(
        and(
          eq(schema.idempotencyKey.teamId, teamId),
          eq(schema.idempotencyKey.actorId, actorId),
          eq(schema.idempotencyKey.operation, operation),
          eq(schema.idempotencyKey.key, key),
        ),
      )
      .limit(1);

    return record
      ? ({
          fingerprint: record.fingerprint,
          result: record.result,
        } satisfies IdempotencyResult<unknown>)
      : null;
  }

  async updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }) {
    const [transaction] = await this.client
      .update(schema.transaction)
      .set({
        categoryId: input.categoryId,
        reviewState: input.reviewState,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.transaction.teamId, input.teamId),
          eq(schema.transaction.id, input.transactionId),
        ),
      )
      .returning();

    if (!transaction) {
      throw new Error("Transaction disappeared during review");
    }

    return mapTransaction(transaction);
  }

  async appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) {
    await this.client.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      actorId: input.actorId,
      requestId: input.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    });
  }

  async appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }) {
    await this.client.insert(schema.outboxEvent).values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      type: input.type,
      version: input.version,
      payload: {
        ...input.payload,
        actorId: input.actorId,
        requestId: input.requestId,
      },
    });
  }

  async saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }) {
    await this.client.insert(schema.idempotencyKey).values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      actorId: input.actorId,
      key: input.key,
      operation: input.operation,
      fingerprint: input.fingerprint,
      result: input.result as Record<string, unknown>,
    });
  }

  async createTeamInvite(input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }) {
    const [invite] = await this.client
      .insert(schema.teamInvite)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        email: input.email,
        role: input.role,
        status: "pending",
        invitedByActorId: input.invitedByActorId,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!invite) {
      throw new Error("Team invite was not created");
    }

    return mapTeamInvite(invite);
  }

  async listTeamMembers(teamId: string) {
    const members = await this.client
      .select({
        id: schema.teamMembership.id,
        teamId: schema.teamMembership.teamId,
        userId: schema.teamMembership.userId,
        role: schema.teamMembership.role,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.teamMembership)
      .innerJoin(schema.user, eq(schema.user.id, schema.teamMembership.userId))
      .where(eq(schema.teamMembership.teamId, teamId));

    return members.map((member) => ({
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      role: member.role as TeamRole,
      name: member.name,
      email: member.email,
    }));
  }

  async listPendingTeamInvites(teamId: string) {
    const invites = await this.client
      .select()
      .from(schema.teamInvite)
      .where(and(eq(schema.teamInvite.teamId, teamId), eq(schema.teamInvite.status, "pending")));

    return invites.map(mapTeamInvite);
  }

  async getTeamInvite(inviteId: string) {
    const [invite] = await this.client
      .select()
      .from(schema.teamInvite)
      .where(eq(schema.teamInvite.id, inviteId))
      .limit(1);

    return invite ? mapTeamInvite(invite) : null;
  }

  async addTeamMembership(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership> {
    const [membership] = await this.client
      .insert(schema.teamMembership)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        userId: input.userId,
        role: input.role,
      })
      .returning();

    if (!membership) {
      throw new Error("Team membership was not created");
    }

    return mapTeamMembership(membership);
  }

  async markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }) {
    const [invite] = await this.client
      .update(schema.teamInvite)
      .set({
        status: "accepted",
        acceptedAt: input.acceptedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.teamInvite.id, input.inviteId), eq(schema.teamInvite.status, "pending")))
      .returning();

    if (!invite) {
      throw new Error("Team invite was not accepted");
    }

    return mapTeamInvite(invite);
  }

  async getTeamMemberByUserId(teamId: string, userId: string) {
    const [membership] = await this.client
      .select()
      .from(schema.teamMembership)
      .where(
        and(eq(schema.teamMembership.teamId, teamId), eq(schema.teamMembership.userId, userId)),
      )
      .limit(1);

    return membership ? mapTeamMember(membership) : null;
  }

  async updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember> {
    const [membership] = await this.client
      .update(schema.teamMembership)
      .set({
        role: input.role,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.teamMembership.teamId, input.teamId),
          eq(schema.teamMembership.userId, input.userId),
        ),
      )
      .returning();

    if (!membership) {
      throw new Error("Team membership was not updated");
    }

    return mapTeamMember(membership);
  }
}

function mapCategory(category: typeof schema.transactionCategory.$inferSelect): Category {
  return {
    id: category.id,
    teamId: category.teamId,
    name: category.name,
  };
}

function mapTransaction(transaction: typeof schema.transaction.$inferSelect): Transaction {
  return {
    id: transaction.id,
    teamId: transaction.teamId,
    description: transaction.description,
    postedAt: transaction.postedAt.toISOString(),
    money: {
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
    },
    categoryId: transaction.categoryId,
    reviewState: transaction.reviewState === "reviewed" ? "reviewed" : "needs_review",
  };
}

function mapTeamInvite(invite: typeof schema.teamInvite.$inferSelect): TeamInvite {
  return {
    id: invite.id,
    teamId: invite.teamId,
    email: invite.email,
    role: invite.role as TeamRole,
    status: invite.status === "pending" ? "pending" : (invite.status as TeamInvite["status"]),
    invitedByActorId: invite.invitedByActorId,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

function mapTeamMembership(membership: typeof schema.teamMembership.$inferSelect): TeamMembership {
  return {
    teamId: membership.teamId,
    userId: membership.userId,
    role: membership.role as TeamRole,
  };
}

function mapTeamMember(membership: typeof schema.teamMembership.$inferSelect): TeamMember {
  return {
    id: membership.id,
    ...mapTeamMembership(membership),
  };
}
