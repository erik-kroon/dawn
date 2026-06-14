import type { Actor, Category, Team, TeamRole, Transaction } from "@dawn/domain";
import { applyTransactionReview, roleHasPermission } from "@dawn/domain";

export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type TransactionReviewContext = {
  actor: Actor;
  requestId: string;
  teamId?: string;
};

export type ActorTeam = Team & {
  role: TeamRole;
};

export type ReviewWorkspace = {
  teamId: string;
  teamName: string;
  categories: Category[];
  transactions: Transaction[];
  sync: {
    collection: "transactions";
    cursor: string | null;
    conflictPolicy: "server_wins_for_financial_state";
  };
};

export type ReviewTransactionCommand = {
  teamId: string;
  transactionId: string;
  categoryId: string;
  idempotencyKey: string;
};

export type ReviewTransactionResult = {
  transaction: Transaction;
  replayed: boolean;
};

export type IdempotencyResult<T> = {
  fingerprint: string;
  result: T;
};

export type TransactionReviewRepository = {
  withTransaction<T>(callback: (repository: TransactionReviewRepository) => Promise<T>): Promise<T>;
  ensureDefaultWorkspace(actor: Actor): Promise<{ teamId: string }>;
  listActorTeams(actor: Actor): Promise<ActorTeam[]>;
  createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam>;
  listWorkspace(actor: Actor, teamId: string): Promise<ReviewWorkspace>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
  getTransactionForTeam(teamId: string, transactionId: string): Promise<Transaction | null>;
  getCategoryForTeam(teamId: string, categoryId: string): Promise<Category | null>;
  getIdempotencyResult(
    teamId: string,
    actorId: string,
    key: string,
  ): Promise<IdempotencyResult<ReviewTransactionResult> | null>;
  updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }): Promise<Transaction>;
  appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    transactionId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    transactionId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    key: string;
    fingerprint: string;
    result: ReviewTransactionResult;
  }): Promise<void>;
};

export async function listTeams(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<{ teams: ActorTeam[]; currentTeamId: string }> {
  const { teamId } = await repository.ensureDefaultWorkspace(context.actor);
  const teams = await repository.listActorTeams(context.actor);
  const requestedTeamId = context.teamId ?? teamId;
  const currentTeam = teams.find((team) => team.id === requestedTeamId) ?? teams[0];

  if (!currentTeam) {
    throw new AppError("FORBIDDEN", "You do not belong to any team");
  }

  return { teams, currentTeamId: currentTeam.id };
}

export async function createTeam(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: { name: string },
): Promise<ActorTeam> {
  const name = command.name.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Team name is required");
  }

  return repository.createTeam({ actor: context.actor, name });
}

export async function listTransactionReviewWorkspace(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<ReviewWorkspace> {
  const { teamId: defaultTeamId } = await repository.ensureDefaultWorkspace(context.actor);
  const teamId = context.teamId ?? defaultTeamId;
  const membership = await repository.getMembership(context.actor, teamId);

  if (!membership || !roleHasPermission(membership.role, "transactions:read")) {
    throw new AppError("FORBIDDEN", "You cannot read transactions for this team");
  }

  return repository.listWorkspace(context.actor, teamId);
}

export async function reviewTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ReviewTransactionCommand,
): Promise<ReviewTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    if (context.teamId && command.teamId !== context.teamId) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const membership = await transactionRepository.getMembership(context.actor, command.teamId);

    if (!membership || !roleHasPermission(membership.role, "transactions:review")) {
      throw new AppError("FORBIDDEN", "You cannot review transactions for this team");
    }

    const fingerprint = transactionReviewFingerprint(command);

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different review");
      }

      return { ...replayed.result, replayed: true };
    }

    const transaction = await transactionRepository.getTransactionForTeam(
      command.teamId,
      command.transactionId,
    );

    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }

    const category = await transactionRepository.getCategoryForTeam(
      command.teamId,
      command.categoryId,
    );

    if (!category) {
      throw new AppError("NOT_FOUND", "Category not found");
    }

    const reviewChange = applyTransactionReview(transaction, category);

    const updatedTransaction = await transactionRepository.updateTransactionReviewForTeam({
      teamId: command.teamId,
      transactionId: transaction.id,
      categoryId: reviewChange.transaction.categoryId ?? category.id,
      reviewState: reviewChange.transaction.reviewState,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      transactionId: transaction.id,
      metadata: reviewChange.auditMetadata,
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      transactionId: transaction.id,
      payload: reviewChange.outboxPayload,
    });

    const result = { transaction: updatedTransaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function transactionReviewFingerprint(command: ReviewTransactionCommand) {
  return JSON.stringify({
    teamId: command.teamId,
    transactionId: command.transactionId,
    categoryId: command.categoryId,
  });
}
