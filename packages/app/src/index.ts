import type {
  Actor,
  Category,
  Permission,
  Team,
  TeamInvite,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import { applyTransactionReview, permissionsForRole, roleHasPermission } from "@dawn/domain";

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
  role: TeamRole;
  permissions: readonly Permission[];
  categories: Category[];
  transactions: Transaction[];
  sync: {
    collection: "transactions";
    cursor: string | null;
    conflictPolicy: "server_wins_for_financial_state";
  };
};

export type ReviewWorkspaceData = Omit<ReviewWorkspace, "role" | "permissions">;

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

export type InviteTeamMemberCommand = {
  teamId: string;
  email: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type InviteTeamMemberResult = {
  invite: TeamInvite;
  replayed: boolean;
};

export type IdempotencyResult<T> = {
  fingerprint: string;
  result: T;
};

export type ResolvedTeamAccess = {
  teamId: string;
  role: TeamRole;
  permissions: readonly Permission[];
};

export type TransactionReviewRepository = {
  withTransaction<T>(callback: (repository: TransactionReviewRepository) => Promise<T>): Promise<T>;
  ensureDefaultWorkspace(actor: Actor): Promise<{ teamId: string }>;
  listActorTeams(actor: Actor): Promise<ActorTeam[]>;
  createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam>;
  listWorkspace(actor: Actor, teamId: string): Promise<ReviewWorkspaceData>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
  getTransactionForTeam(teamId: string, transactionId: string): Promise<Transaction | null>;
  getCategoryForTeam(teamId: string, categoryId: string): Promise<Category | null>;
  getIdempotencyResult(
    teamId: string,
    actorId: string,
    operation: string,
    key: string,
  ): Promise<IdempotencyResult<unknown> | null>;
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
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }): Promise<void>;
  saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }): Promise<void>;
  createTeamInvite(input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }): Promise<TeamInvite>;
};

const reviewTransactionOperation = "transaction.review";
const inviteTeamMemberOperation = "team.invite";

export async function listTeams(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<{ teams: ActorTeam[]; currentTeamId: string; currentRole: TeamRole }> {
  const { teamId } = await repository.ensureDefaultWorkspace(context.actor);
  const teams = await repository.listActorTeams(context.actor);
  const requestedTeamId = context.teamId ?? teamId;
  const currentTeam = teams.find((team) => team.id === requestedTeamId) ?? teams[0];

  if (!currentTeam) {
    throw new AppError("FORBIDDEN", "You do not belong to any team");
  }

  return { teams, currentTeamId: currentTeam.id, currentRole: currentTeam.role };
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
  const access = await resolveTeamAccess(
    repository,
    context,
    "transactions.read",
    "You cannot read transactions for this team",
  );
  const workspace = await repository.listWorkspace(context.actor, access.teamId);

  return {
    ...workspace,
    role: access.role,
    permissions: access.permissions,
  };
}

export async function reviewTransaction(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: ReviewTransactionCommand,
): Promise<ReviewTransactionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Transaction not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "transactions.categorize",
      "You cannot review transactions for this team",
    );

    const fingerprint = transactionReviewFingerprint(command);

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      reviewTransactionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different review");
      }

      return { ...(replayed.result as ReviewTransactionResult), replayed: true };
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
      action: "transaction.reviewed",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: reviewChange.auditMetadata,
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "transaction.reviewed",
      version: 1,
      payload: reviewChange.outboxPayload,
    });

    const result = { transaction: updatedTransaction, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: reviewTransactionOperation,
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

export async function inviteTeamMember(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: InviteTeamMemberCommand,
): Promise<InviteTeamMemberResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot invite members to this team",
    );

    const normalizedEmail = normalizeInviteEmail(command.email);
    assertInvitableRole(command.role);
    const fingerprint = inviteTeamMemberFingerprint({ ...command, email: normalizedEmail });

    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      inviteTeamMemberOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different invite");
      }

      return { ...(replayed.result as InviteTeamMemberResult), replayed: true };
    }

    const invite = await transactionRepository.createTeamInvite({
      teamId: command.teamId,
      email: normalizedEmail,
      role: command.role,
      invitedByActorId: context.actor.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_invited",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_invited",
      version: 1,
      payload: {
        inviteId: invite.id,
        email: invite.email,
        role: invite.role,
      },
    });

    const result = { invite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: inviteTeamMemberOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function resolveTeamAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  permission: Permission,
  forbiddenMessage = "You cannot access this team",
): Promise<ResolvedTeamAccess> {
  const defaultWorkspace = context.teamId
    ? null
    : await repository.ensureDefaultWorkspace(context.actor);
  const teamId = context.teamId ?? defaultWorkspace?.teamId;

  if (!teamId) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  const membership = await repository.getMembership(context.actor, teamId);

  if (!membership || !roleHasPermission(membership.role, permission)) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  return {
    teamId,
    role: membership.role,
    permissions: permissionsForRole(membership.role),
  };
}

function normalizeInviteEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("CONFLICT", "Invite email is invalid");
  }

  return normalizedEmail;
}

export function inviteTeamMemberFingerprint(command: InviteTeamMemberCommand) {
  assertInvitableRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    email: normalizeInviteEmail(command.email),
    role: command.role,
  });
}

function assertInvitableRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role cannot be assigned by invite");
  }
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}
