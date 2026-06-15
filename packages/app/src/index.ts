import type {
  Actor,
  Category,
  LedgerAccount,
  LedgerTransactionDraft,
  Permission,
  Team,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import { permissionsForRole, roleHasPermission } from "@dawn/domain";
import type { DawnQueueMessage, OutboxEventForJob } from "@dawn/jobs";
import {
  dawnQueueNames,
  nextOutboxRetryAt,
  outboxDispatchRetryPolicy,
  outboxEventToQueueMessages,
} from "@dawn/jobs";
import type {
  BankingUseCaseRepository,
  CsvTransactionImportMapping,
  LedgerRepository,
  ReviewWorkspaceData,
  TransactionImportSession,
} from "./banking-ledger";
import type { BillingRepository } from "./billing";
import type { DocumentsInboxUseCaseRepository } from "./documents-inbox";
import type { ProjectReportingUseCaseRepository } from "./projects-reporting";
import type { OperationsRepository } from "./operations";
import type { AssistantUseCaseRepository } from "./assistant";
import type { AutomationUseCaseRepository } from "./automation";
import type { DeveloperUseCaseRepository } from "./developer";
import type { EmailInboxUseCaseRepository } from "./email-inbox";
import type { IntegrationUseCaseRepository } from "./integrations";

export * from "./assistant";
export * from "./automation";
export * from "./banking-ledger";
export * from "./billing";
export * from "./developer";
export * from "./documents-inbox";
export * from "./email-inbox";
export * from "./integrations";
export * from "./operations";
export * from "./projects-reporting";

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

export type AppRequestSource =
  | "session"
  | "api_key"
  | "oauth_app"
  | "system_job"
  | "assistant"
  | "provider_webhook"
  | "websocket";

export type ResolvedAppRequest = TransactionReviewContext & {
  source: AppRequestSource;
  locale: string;
  timezone: string;
  idempotencyKey?: string;
};

export type ResolveAppRequestInput = {
  actor: Actor;
  source: AppRequestSource;
  requestId?: string | null;
  teamId?: string | null;
  locale?: string | null;
  timezone?: string | null;
  idempotencyKey?: string | null;
};

export type SessionAppRequestInput = Omit<ResolveAppRequestInput, "actor" | "source"> & {
  user: {
    id: string;
    email?: string | null;
  };
};

export function resolveAppRequest(input: ResolveAppRequestInput): ResolvedAppRequest {
  return {
    actor: input.actor,
    source: input.source,
    requestId: normalizeRequestId(input.requestId),
    teamId: normalizeOptionalText(input.teamId) ?? undefined,
    locale: normalizeOptionalText(input.locale) ?? "en-US",
    timezone: normalizeOptionalText(input.timezone) ?? "UTC",
    idempotencyKey: normalizeOptionalText(input.idempotencyKey) ?? undefined,
  };
}

export function resolveSessionAppRequest(input: SessionAppRequestInput): ResolvedAppRequest {
  return resolveAppRequest({
    ...input,
    source: "session",
    actor: {
      id: input.user.id,
      type: "user",
      email: input.user.email ?? undefined,
    },
  });
}

export function resolveScopedActorAppRequest(
  input: Omit<ResolveAppRequestInput, "source"> & {
    source: "api_key" | "oauth_app" | "assistant" | "provider_webhook";
  },
): ResolvedAppRequest {
  return resolveAppRequest(input);
}

export function resolveSystemAppRequest(
  input: Omit<ResolveAppRequestInput, "actor" | "source"> & { actorId: string },
): ResolvedAppRequest {
  return resolveAppRequest({
    ...input,
    source: "system_job",
    actor: { id: input.actorId, type: "system" },
  });
}

export function assertAppRequestTeam(
  context: TransactionReviewContext,
  teamId: string,
  message = "Resource not found",
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function normalizeRequestId(value: string | null | undefined) {
  return normalizeOptionalText(value) ?? crypto.randomUUID();
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type ActorTeam = Team & {
  role: TeamRole;
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

export type AcceptTeamInviteCommand = {
  inviteId: string;
  idempotencyKey: string;
};

export type AcceptTeamInviteResult = {
  membership: TeamMembership;
  invite: TeamInvite;
  replayed: boolean;
};

export type UpdateTeamMemberRoleCommand = {
  teamId: string;
  userId: string;
  role: TeamRole;
  idempotencyKey: string;
};

export type UpdateTeamMemberRoleResult = {
  membership: TeamMember;
  replayed: boolean;
};

export type OutboxEventStatus = "pending" | "dispatching" | "dispatched" | "failed";

export type OutboxEvent = OutboxEventForJob & {
  status: OutboxEventStatus;
  occurredAt: string;
  processedAt?: string | null;
  lastError?: string | null;
  nextAttemptAt?: string | null;
};

export type JobRunStatus = "queued" | "failed";

export type JobRun = {
  id: string;
  teamId: string;
  outboxEventId: string;
  jobType: DawnQueueMessage["type"];
  queueName: string;
  status: JobRunStatus;
  attempt: number;
  idempotencyKey: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  teamId: string;
  actorId: string;
  requestId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type DispatchOutboxCommand = {
  limit?: number;
  now?: Date;
};

export type DispatchOutboxResult = {
  scanned: number;
  dispatched: number;
  failed: number;
  skipped: number;
  queuedMessages: number;
};

export type OutboxQueuePublisher = {
  publish(message: DawnQueueMessage): Promise<void>;
};

export type DawnRepository = BankingUseCaseRepository &
  LedgerRepository &
  DocumentsInboxUseCaseRepository &
  BillingRepository &
  ProjectReportingUseCaseRepository &
  AssistantUseCaseRepository &
  AutomationUseCaseRepository &
  DeveloperUseCaseRepository &
  EmailInboxUseCaseRepository &
  IntegrationUseCaseRepository &
  OperationsRepository;

export type OutboxDispatchRepository = {
  withTransaction<T>(callback: (repository: OutboxDispatchRepository) => Promise<T>): Promise<T>;
  listDispatchableOutboxEvents(input: { limit: number; now: Date }): Promise<OutboxEvent[]>;
  claimOutboxEventForDispatch(input: {
    outboxEventId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OutboxEvent | null>;
  createJobRun(input: {
    teamId: string;
    outboxEventId: string;
    jobType: DawnQueueMessage["type"];
    queueName: string;
    status: JobRunStatus;
    attempt: number;
    idempotencyKey: string;
    error?: string | null;
  }): Promise<JobRun>;
  markOutboxEventDispatched(input: { outboxEventId: string; now: Date }): Promise<void>;
  markOutboxEventDispatchFailed(input: {
    outboxEventId: string;
    error: string;
    nextAttemptAt: Date;
  }): Promise<void>;
};

export type IdempotencyResult<T> = {
  fingerprint: string;
  result: T;
};

export interface TransactionalRepository<TRepository> {
  withTransaction<T>(callback: (repository: TRepository) => Promise<T>): Promise<T>;
}

export type TeamAccessRepository = {
  ensureDefaultWorkspace(actor: Actor): Promise<{ teamId: string }>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
};

export type ResolvedTeamAccess = {
  teamId: string;
  role: TeamRole;
  permissions: readonly Permission[];
};

export type TeamDirectory = {
  teamId: string;
  members: TeamMember[];
  pendingInvites: TeamInvite[];
};

export interface TransactionReviewRepository
  extends TeamAccessRepository, TransactionalRepository<TransactionReviewRepository> {
  listActorTeams(actor: Actor): Promise<ActorTeam[]>;
  createTeam(input: { actor: Actor; name: string }): Promise<ActorTeam>;
  listWorkspace(actor: Actor, teamId: string): Promise<ReviewWorkspaceData>;
  getTransactionForTeam(teamId: string, transactionId: string): Promise<Transaction | null>;
  getCategoryForTeam(teamId: string, categoryId: string): Promise<Category | null>;
  listLedgerAccounts(teamId: string): Promise<LedgerAccount[]>;
  getLedgerAccountForTeam(teamId: string, accountId: string): Promise<LedgerAccount | null>;
  getTransactionByDuplicateKey(teamId: string, duplicateKey: string): Promise<Transaction | null>;
  listTransactionsForReport(input: {
    teamId: string;
    accountId?: string;
    from?: string;
    to?: string;
  }): Promise<Transaction[]>;
  listTransactionsForSync(input: {
    teamId: string;
    cursor?: string | null;
  }): Promise<Transaction[]>;
  createLedgerTransactionForTeam(input: {
    draft: LedgerTransactionDraft;
    duplicateKey: string;
  }): Promise<Transaction>;
  createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    mapping: CsvTransactionImportMapping;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }): Promise<TransactionImportSession>;
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
  listTeamMembers(teamId: string): Promise<TeamMember[]>;
  listPendingTeamInvites(teamId: string): Promise<TeamInvite[]>;
  getTeamInvite(inviteId: string): Promise<TeamInvite | null>;
  addTeamMembership(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership>;
  markTeamInviteAccepted(input: { inviteId: string; acceptedAt: Date }): Promise<TeamInvite>;
  getTeamMemberByUserId(teamId: string, userId: string): Promise<TeamMember | null>;
  updateTeamMemberRole(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember>;
}

const inviteTeamMemberOperation = "team.invite";
const acceptTeamInviteOperation = "team.invite.accept";
const updateTeamMemberRoleOperation = "team.member.role.update";

export async function dispatchOutboxEvents(
  repository: OutboxDispatchRepository,
  publisher: OutboxQueuePublisher,
  command: DispatchOutboxCommand = {},
): Promise<DispatchOutboxResult> {
  const now = command.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + outboxDispatchRetryPolicy.leaseSeconds * 1_000);
  const events = await repository.listDispatchableOutboxEvents({
    limit: command.limit ?? 25,
    now,
  });
  const result: DispatchOutboxResult = {
    scanned: events.length,
    dispatched: 0,
    failed: 0,
    skipped: 0,
    queuedMessages: 0,
  };

  for (const event of events) {
    const claimed = await repository.claimOutboxEventForDispatch({
      outboxEventId: event.id,
      now,
      leaseExpiresAt,
    });

    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    try {
      const messages = outboxEventToQueueMessages(event);

      for (const message of messages) {
        await publisher.publish(message);
        await repository.createJobRun({
          teamId: event.teamId,
          outboxEventId: event.id,
          jobType: message.type,
          queueName: dawnQueueNames.jobs,
          status: "queued",
          attempt: event.dispatchAttempts + 1,
          idempotencyKey: message.idempotencyKey,
          error: null,
        });
        result.queuedMessages += 1;
      }

      await repository.markOutboxEventDispatched({ outboxEventId: event.id, now });
      result.dispatched += 1;
    } catch (error) {
      const message = errorMessage(error);
      const attempt = event.dispatchAttempts + 1;
      const nextAttemptAt = nextOutboxRetryAt({ attempt, now });

      await repository.createJobRun({
        teamId: event.teamId,
        outboxEventId: event.id,
        jobType: "outbox.dispatch",
        queueName: dawnQueueNames.jobs,
        status: "failed",
        attempt,
        idempotencyKey: `outbox:${event.id}:failed:${attempt}`,
        error: message,
      });
      await repository.markOutboxEventDispatchFailed({
        outboxEventId: event.id,
        error: message,
        nextAttemptAt,
      });
      result.failed += 1;
    }
  }

  return result;
}

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

export async function listTeamDirectory(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
): Promise<TeamDirectory> {
  const access = await resolveTeamAccess(
    repository,
    context,
    "team.manage",
    "You cannot manage members for this team",
  );
  const [members, pendingInvites] = await Promise.all([
    repository.listTeamMembers(access.teamId),
    repository.listPendingTeamInvites(access.teamId),
  ]);

  return {
    teamId: access.teamId,
    members,
    pendingInvites,
  };
}

export async function acceptTeamInvite(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: AcceptTeamInviteCommand,
): Promise<AcceptTeamInviteResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invite = await transactionRepository.getTeamInvite(command.inviteId);

    if (!invite) {
      throw new AppError("NOT_FOUND", "Team invite not found");
    }

    const fingerprint = acceptTeamInviteFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      invite.teamId,
      context.actor.id,
      acceptTeamInviteOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invite acceptance",
        );
      }

      return { ...(replayed.result as AcceptTeamInviteResult), replayed: true };
    }

    assertActorCanAcceptInvite(context.actor, invite);

    const existingMembership = await transactionRepository.getMembership(
      context.actor,
      invite.teamId,
    );

    if (existingMembership) {
      throw new AppError("CONFLICT", "You already belong to this team");
    }

    const membership = await transactionRepository.addTeamMembership({
      teamId: invite.teamId,
      userId: context.actor.id,
      role: invite.role,
    });
    const acceptedInvite = await transactionRepository.markTeamInviteAccepted({
      inviteId: invite.id,
      acceptedAt: new Date(),
    });

    await transactionRepository.appendAuditEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.invite_accepted",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: invite.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.invite_accepted",
      version: 1,
      payload: {
        inviteId: invite.id,
        userId: context.actor.id,
        role: invite.role,
      },
    });

    const result = { membership, invite: acceptedInvite, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: invite.teamId,
      actorId: context.actor.id,
      operation: acceptTeamInviteOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateTeamMemberRole(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  command: UpdateTeamMemberRoleCommand,
): Promise<UpdateTeamMemberRoleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    assertCommandTeamMatchesContext(context, command.teamId, "Team member not found");

    await resolveTeamAccess(
      transactionRepository,
      { ...context, teamId: command.teamId },
      "team.manage",
      "You cannot manage members for this team",
    );

    if (context.actor.id === command.userId) {
      throw new AppError("CONFLICT", "You cannot update your own role");
    }

    assertManagedRole(command.role);

    const fingerprint = updateTeamMemberRoleFingerprint(command);
    const replayed = await transactionRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateTeamMemberRoleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different role update",
        );
      }

      return { ...(replayed.result as UpdateTeamMemberRoleResult), replayed: true };
    }

    const existingMembership = await transactionRepository.getTeamMemberByUserId(
      command.teamId,
      command.userId,
    );

    if (!existingMembership) {
      throw new AppError("NOT_FOUND", "Team member not found");
    }

    assertManagedRole(existingMembership.role);

    const membership = await transactionRepository.updateTeamMemberRole({
      teamId: command.teamId,
      userId: command.userId,
      role: command.role,
    });

    await transactionRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "team.member_role_updated",
      entityType: "team_membership",
      entityId: membership.id,
      metadata: {
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    await transactionRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "team.member_role_updated",
      version: 1,
      payload: {
        membershipId: membership.id,
        userId: command.userId,
        previousRole: existingMembership.role,
        nextRole: membership.role,
      },
    });

    const result = { membership, replayed: false };

    await transactionRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateTeamMemberRoleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function resolveTeamAccess(
  repository: TeamAccessRepository,
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

  if (context.actor.type !== "user") {
    const actorPermissions = context.actor.permissions ?? [];

    if (context.actor.teamId !== teamId || !actorPermissions.includes(permission)) {
      throw new AppError("FORBIDDEN", forbiddenMessage);
    }

    return {
      teamId,
      role: "member",
      permissions: actorPermissions,
    };
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

function assertActorCanAcceptInvite(actor: Actor, invite: TeamInvite) {
  const actorEmail = actor.email ? normalizeInviteEmail(actor.email) : null;

  if (!actorEmail || actorEmail !== invite.email) {
    throw new AppError("FORBIDDEN", "You cannot accept this team invite");
  }

  if (invite.status !== "pending") {
    throw new AppError("CONFLICT", "Team invite is not pending");
  }

  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new AppError("CONFLICT", "Team invite has expired");
  }
}

function normalizeInviteEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("CONFLICT", "Invite email is invalid");
  }

  return normalizedEmail;
}

export function acceptTeamInviteFingerprint(command: AcceptTeamInviteCommand) {
  return JSON.stringify({
    inviteId: command.inviteId,
  });
}

export function inviteTeamMemberFingerprint(command: InviteTeamMemberCommand) {
  assertInvitableRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    email: normalizeInviteEmail(command.email),
    role: command.role,
  });
}

export function updateTeamMemberRoleFingerprint(command: UpdateTeamMemberRoleCommand) {
  assertManagedRole(command.role);

  return JSON.stringify({
    teamId: command.teamId,
    userId: command.userId,
    role: command.role,
  });
}

function assertInvitableRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role cannot be assigned by invite");
  }
}

function assertManagedRole(role: TeamRole) {
  if (role === "owner") {
    throw new AppError("CONFLICT", "Owner role changes require ownership transfer");
  }
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  assertAppRequestTeam(context, teamId, message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Outbox dispatch failed";
}
