import type {
  ActorTeam,
  CsvTransactionImportMapping,
  IdempotencyResult,
  JobRun,
  OutboxDispatchRepository,
  OutboxEvent,
  ReviewWorkspaceData,
  TransactionImportSession,
  TransactionReviewRepository,
} from "@dawn/app";
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
import { ledgerDuplicateKey } from "@dawn/domain";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "./index";
import * as schema from "./schema";

type Database = typeof db;
type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];
type QueryClient = Database | TransactionClient;
type DrizzleRepository = TransactionReviewRepository & OutboxDispatchRepository;

export class DrizzleTransactionReviewRepository implements DrizzleRepository {
  constructor(private readonly client: QueryClient = db) {}

  async withTransaction<T>(callback: (repository: DrizzleRepository) => Promise<T>): Promise<T> {
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
    const accountId = crypto.randomUUID();
    const softwareCategoryId = crypto.randomUUID();
    const mealsCategoryId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    const seedTransactionDraft = {
      teamId,
      accountId,
      description: "Figma subscription",
      postedAt: "2026-06-14T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "manual",
      categoryId: null,
    } satisfies LedgerTransactionDraft;

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
    await this.client.insert(schema.ledgerAccount).values({
      id: accountId,
      teamId,
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    await this.client.insert(schema.transaction).values({
      id: transactionId,
      teamId,
      accountId,
      description: seedTransactionDraft.description,
      postedAt: new Date(seedTransactionDraft.postedAt),
      amountMinor: seedTransactionDraft.money.amountMinor,
      currency: seedTransactionDraft.money.currency,
      type: seedTransactionDraft.type,
      source: seedTransactionDraft.source,
      reviewState: "needs_review",
      duplicateKey: ledgerDuplicateKey(seedTransactionDraft),
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

  async listLedgerAccounts(teamId: string) {
    const accounts = await this.client
      .select()
      .from(schema.ledgerAccount)
      .where(eq(schema.ledgerAccount.teamId, teamId));

    return accounts.map(mapLedgerAccount);
  }

  async getLedgerAccountForTeam(teamId: string, accountId: string) {
    const [account] = await this.client
      .select()
      .from(schema.ledgerAccount)
      .where(and(eq(schema.ledgerAccount.teamId, teamId), eq(schema.ledgerAccount.id, accountId)))
      .limit(1);

    return account ? mapLedgerAccount(account) : null;
  }

  async getTransactionByDuplicateKey(teamId: string, duplicateKey: string) {
    const [transaction] = await this.client
      .select()
      .from(schema.transaction)
      .where(
        and(
          eq(schema.transaction.teamId, teamId),
          eq(schema.transaction.duplicateKey, duplicateKey),
        ),
      )
      .limit(1);

    return transaction ? mapTransaction(transaction) : null;
  }

  async listTransactionsForReport(input: {
    teamId: string;
    accountId?: string;
    from?: string;
    to?: string;
  }) {
    const conditions = [eq(schema.transaction.teamId, input.teamId)];

    if (input.accountId) {
      conditions.push(eq(schema.transaction.accountId, input.accountId));
    }

    if (input.from) {
      conditions.push(gte(schema.transaction.postedAt, new Date(input.from)));
    }

    if (input.to) {
      conditions.push(lte(schema.transaction.postedAt, new Date(input.to)));
    }

    const transactions = await this.client
      .select()
      .from(schema.transaction)
      .where(and(...conditions))
      .orderBy(desc(schema.transaction.postedAt));

    return transactions.map(mapTransaction);
  }

  async listTransactionsForSync(input: { teamId: string; cursor?: string | null }) {
    const conditions = [eq(schema.transaction.teamId, input.teamId)];

    if (input.cursor) {
      conditions.push(gt(schema.transaction.updatedAt, new Date(input.cursor)));
    }

    const transactions = await this.client
      .select()
      .from(schema.transaction)
      .where(and(...conditions))
      .orderBy(asc(schema.transaction.updatedAt));

    return transactions.map(mapTransaction);
  }

  async createLedgerTransactionForTeam(input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }) {
    const transactionId = crypto.randomUUID();
    const [transaction] = await this.client
      .insert(schema.transaction)
      .values({
        id: transactionId,
        teamId: input.draft.teamId,
        accountId: input.draft.accountId,
        description: input.draft.description,
        postedAt: new Date(input.draft.postedAt),
        amountMinor: input.draft.money.amountMinor,
        currency: input.draft.money.currency,
        type: input.draft.type,
        source: input.draft.source,
        counterpartyId: input.draft.counterpartyId ?? null,
        providerTransactionId: input.draft.providerTransactionId ?? null,
        duplicateKey: input.duplicateKey,
        categoryId: input.draft.categoryId ?? null,
        reviewState: "needs_review",
      })
      .returning();

    if (!transaction) {
      throw new Error("Ledger transaction was not created");
    }

    if (input.draft.splits?.length) {
      await this.client.insert(schema.transactionSplit).values(
        input.draft.splits.map((split) => ({
          id: crypto.randomUUID(),
          transactionId,
          categoryId: split.categoryId ?? null,
          amountMinor: split.money.amountMinor,
          currency: split.money.currency,
          note: split.note ?? null,
        })),
      );
    }

    if (input.draft.tagIds?.length) {
      await this.client.insert(schema.transactionTagAssignment).values(
        input.draft.tagIds.map((tagId) => ({
          transactionId,
          tagId,
        })),
      );
    }

    return mapTransaction(transaction);
  }

  async createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    mapping: CsvTransactionImportMapping;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const [importSession] = await this.client
      .insert(schema.transactionImportSession)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        accountId: input.accountId,
        source: "csv",
        fileName: input.fileName ?? null,
        status: "committed",
        createdByActorId: input.actorId,
        mapping: input.mapping as Record<string, unknown>,
        rowCount: input.rowCount,
        importedCount: input.importedCount,
        duplicateCount: input.duplicateCount,
        invalidCount: input.invalidCount,
      })
      .returning();

    if (!importSession) {
      throw new Error("Transaction import session was not created");
    }

    return mapTransactionImportSession(importSession);
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

  async listDispatchableOutboxEvents(input: { limit: number; now: Date }): Promise<OutboxEvent[]> {
    const events = await this.client
      .select()
      .from(schema.outboxEvent)
      .where(
        and(
          inArray(schema.outboxEvent.status, ["pending", "failed"]),
          or(
            isNull(schema.outboxEvent.nextAttemptAt),
            lte(schema.outboxEvent.nextAttemptAt, input.now),
          ),
        ),
      )
      .orderBy(asc(schema.outboxEvent.occurredAt))
      .limit(input.limit);

    return events.map(mapOutboxEvent);
  }

  async claimOutboxEventForDispatch(input: {
    outboxEventId: string;
    now: Date;
  }): Promise<OutboxEvent | null> {
    const [event] = await this.client
      .update(schema.outboxEvent)
      .set({
        status: "dispatching",
        dispatchAttempts: sql`${schema.outboxEvent.dispatchAttempts} + 1`,
        lastError: null,
        nextAttemptAt: null,
      })
      .where(
        and(
          eq(schema.outboxEvent.id, input.outboxEventId),
          inArray(schema.outboxEvent.status, ["pending", "failed"]),
          or(
            isNull(schema.outboxEvent.nextAttemptAt),
            lte(schema.outboxEvent.nextAttemptAt, input.now),
          ),
        ),
      )
      .returning();

    return event ? mapOutboxEvent(event) : null;
  }

  async createJobRun(input: {
    teamId: string;
    outboxEventId: string;
    jobType: JobRun["jobType"];
    queueName: string;
    status: JobRun["status"];
    attempt: number;
    idempotencyKey: string;
    error?: string | null;
  }): Promise<JobRun> {
    const [jobRun] = await this.client
      .insert(schema.jobRun)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        outboxEventId: input.outboxEventId,
        jobType: input.jobType,
        queueName: input.queueName,
        status: input.status,
        attempt: input.attempt,
        idempotencyKey: input.idempotencyKey,
        error: input.error ?? null,
      })
      .returning();

    if (!jobRun) {
      throw new Error("Job run was not created");
    }

    return mapJobRun(jobRun);
  }

  async markOutboxEventDispatched(input: { outboxEventId: string; now: Date }) {
    await this.client
      .update(schema.outboxEvent)
      .set({
        status: "dispatched",
        processedAt: input.now,
        lastError: null,
        nextAttemptAt: null,
      })
      .where(eq(schema.outboxEvent.id, input.outboxEventId));
  }

  async markOutboxEventDispatchFailed(input: {
    outboxEventId: string;
    error: string;
    nextAttemptAt: Date;
  }) {
    await this.client
      .update(schema.outboxEvent)
      .set({
        status: "failed",
        lastError: input.error.slice(0, 2_000),
        nextAttemptAt: input.nextAttemptAt,
      })
      .where(eq(schema.outboxEvent.id, input.outboxEventId));
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

function mapLedgerAccount(account: typeof schema.ledgerAccount.$inferSelect): LedgerAccount {
  return {
    id: account.id,
    teamId: account.teamId,
    name: account.name,
    currency: account.currency,
    type: account.type as LedgerAccount["type"],
  };
}

function mapTransaction(transaction: typeof schema.transaction.$inferSelect): Transaction {
  return {
    id: transaction.id,
    teamId: transaction.teamId,
    accountId: transaction.accountId,
    description: transaction.description,
    postedAt: transaction.postedAt.toISOString(),
    money: {
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
    },
    type: transaction.type as Transaction["type"],
    source: transaction.source as Transaction["source"],
    counterpartyId: transaction.counterpartyId,
    providerTransactionId: transaction.providerTransactionId,
    categoryId: transaction.categoryId,
    reviewState: transaction.reviewState === "reviewed" ? "reviewed" : "needs_review",
    duplicateKey: transaction.duplicateKey,
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

function mapTransactionImportSession(
  importSession: typeof schema.transactionImportSession.$inferSelect,
): TransactionImportSession {
  return {
    id: importSession.id,
    teamId: importSession.teamId,
    accountId: importSession.accountId,
    source: "csv",
    fileName: importSession.fileName,
    status: "committed",
    rowCount: importSession.rowCount,
    importedCount: importSession.importedCount,
    duplicateCount: importSession.duplicateCount,
    invalidCount: importSession.invalidCount,
  };
}

function mapOutboxEvent(event: typeof schema.outboxEvent.$inferSelect): OutboxEvent {
  return {
    id: event.id,
    teamId: event.teamId,
    type: event.type,
    version: event.version,
    payload: event.payload,
    status: event.status as OutboxEvent["status"],
    dispatchAttempts: event.dispatchAttempts,
    occurredAt: event.occurredAt.toISOString(),
    processedAt: event.processedAt?.toISOString() ?? null,
    lastError: event.lastError,
    nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
  };
}

function mapJobRun(jobRun: typeof schema.jobRun.$inferSelect): JobRun {
  return {
    id: jobRun.id,
    teamId: jobRun.teamId,
    outboxEventId: jobRun.outboxEventId,
    jobType: jobRun.jobType as JobRun["jobType"],
    queueName: jobRun.queueName,
    status: jobRun.status as JobRun["status"],
    attempt: jobRun.attempt,
    idempotencyKey: jobRun.idempotencyKey,
    error: jobRun.error,
    createdAt: jobRun.createdAt.toISOString(),
    updatedAt: jobRun.updatedAt.toISOString(),
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
