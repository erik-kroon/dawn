import type {
  Actor,
  Category,
  Counterparty,
  LedgerAccount,
  LedgerTransactionDraft,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  Transaction,
  TransactionAccountantStatus,
  TransactionTag,
} from "@dawn/domain";
import { deriveTransactionAccountantStatus } from "@dawn/domain";

import type {
  AccountantPacketAttachment,
  AccountantPacketExportRecord,
  AccountantPacketTransactionRow,
  IdempotencyResult,
  LedgerRepository,
  ReviewWorkspaceData,
  TransactionImportSession,
} from "../index";

export class MemoryAppRepository implements LedgerRepository {
  accounts = new Map<string, LedgerAccount>();
  auditEvents: unknown[] = [];
  categories = new Map<string, Category>();
  counterparties = new Map<string, Counterparty>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];
  importSessions: TransactionImportSession[] = [];
  accountantPacketExports = new Map<string, AccountantPacketExportRecord>();
  packetAttachments: AccountantPacketAttachment[] = [];
  tagAssignments: { transactionId: string; tagId: string }[] = [];
  tags = new Map<string, TransactionTag>();
  transactions = new Map<string, Transaction>();

  reset() {
    this.accounts.clear();
    this.auditEvents.length = 0;
    this.categories.clear();
    this.counterparties.clear();
    this.idempotency.clear();
    this.memberships.clear();
    this.outboxEvents.length = 0;
    this.importSessions.length = 0;
    this.accountantPacketExports.clear();
    this.packetAttachments.length = 0;
    this.tagAssignments.length = 0;
    this.tags.clear();
    this.transactions.clear();
  }

  async withTransaction<T>(callback: (repository: LedgerRepository) => Promise<T>): Promise<T> {
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

  async listWorkspace(_actor: Actor, teamId: string): Promise<ReviewWorkspaceData> {
    return {
      teamId,
      teamName: "Test Team",
      categories: [...this.categories.values()].filter((category) => category.teamId === teamId),
      transactions: [...this.transactions.values()]
        .filter((transaction) => transaction.teamId === teamId)
        .map((transaction) => this.transactionWithDerivedAccountantStatus(transaction)),
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
    return transaction?.teamId === teamId
      ? this.transactionWithDerivedAccountantStatus(transaction)
      : null;
  }

  async getCategoryForTeam(teamId: string, categoryId: string) {
    const category = this.categories.get(categoryId);
    return category?.teamId === teamId ? category : null;
  }

  async listCounterparties(teamId: string) {
    return [...this.counterparties.values()].filter(
      (counterparty) => counterparty.teamId === teamId,
    );
  }

  async listTransactionTags(teamId: string) {
    return [...this.tags.values()].filter((tag) => tag.teamId === teamId);
  }

  async createAccountantPacketExportRecord(input: AccountantPacketExportRecord) {
    this.accountantPacketExports.set(input.packetId, input);

    return input;
  }

  async getAccountantPacketExportForTeam(teamId: string, packetId: string) {
    const packet = this.accountantPacketExports.get(packetId);

    return packet?.teamId === teamId ? packet : null;
  }

  async listAccountantPacketExports(teamId: string, limit: number) {
    return [...this.accountantPacketExports.values()]
      .filter((packet) => packet.teamId === teamId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async revokeAccountantPacketExportForTeam(input: {
    teamId: string;
    packetId: string;
    revokedAt: string;
    revokedByActorId: string;
    reason?: string | null;
  }) {
    const packet = await this.getAccountantPacketExportForTeam(input.teamId, input.packetId);

    if (!packet) {
      return null;
    }

    const updated: AccountantPacketExportRecord = {
      ...packet,
      status: "revoked",
      revokedAt: input.revokedAt,
      revokedByActorId: input.revokedByActorId,
      revokeReason: input.reason ?? null,
    };

    this.accountantPacketExports.set(input.packetId, updated);

    return updated;
  }

  async getCounterpartyForTeam(teamId: string, counterpartyId: string) {
    const counterparty = this.counterparties.get(counterpartyId);
    return counterparty?.teamId === teamId ? counterparty : null;
  }

  async getTransactionTagForTeam(teamId: string, tagId: string) {
    const tag = this.tags.get(tagId);
    return tag?.teamId === teamId ? tag : null;
  }

  async upsertCounterparty(input: { teamId: string; name: string }) {
    const existing = [...this.counterparties.values()].find(
      (counterparty) => counterparty.teamId === input.teamId && counterparty.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const counterparty = {
      id: `counterparty_${this.counterparties.size + 1}`,
      teamId: input.teamId,
      name: input.name,
    };
    this.counterparties.set(counterparty.id, counterparty);
    return counterparty;
  }

  async upsertTransactionTag(input: { teamId: string; name: string }) {
    const existing = [...this.tags.values()].find(
      (tag) => tag.teamId === input.teamId && tag.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const tag = {
      id: `tag_${this.tags.size + 1}`,
      teamId: input.teamId,
      name: input.name,
    };
    this.tags.set(tag.id, tag);
    return tag;
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
    return [...this.transactions.values()]
      .filter(
        (transaction) =>
          transaction.teamId === input.teamId &&
          (!input.accountId || transaction.accountId === input.accountId),
      )
      .map((transaction) => this.transactionWithDerivedAccountantStatus(transaction));
  }

  async listAccountantPacketTransactionRows(input: {
    teamId: string;
    from: string;
    to: string;
    transactionIds?: readonly string[];
  }): Promise<AccountantPacketTransactionRow[]> {
    const from = new Date(input.from).getTime();
    const to = new Date(input.to).getTime();
    const transactionIds = new Set(input.transactionIds ?? []);

    return [...this.transactions.values()]
      .filter((transaction) => transaction.teamId === input.teamId)
      .filter((transaction) => transaction.reviewState === "reviewed")
      .filter((transaction) => {
        const postedAt = new Date(transaction.postedAt).getTime();
        return postedAt >= from && postedAt <= to;
      })
      .filter((transaction) => transactionIds.size === 0 || transactionIds.has(transaction.id))
      .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
      .map((transaction) => {
        const attachments = this.packetAttachments.filter(
          (attachment) => attachment.transactionId === transaction.id,
        );

        return {
          transaction: this.transactionWithDerivedAccountantStatus(transaction),
          account: transaction.accountId
            ? (this.accounts.get(transaction.accountId) ?? null)
            : null,
          category: transaction.categoryId
            ? (this.categories.get(transaction.categoryId) ?? null)
            : null,
          counterparty: transaction.counterpartyId
            ? (this.counterparties.get(transaction.counterpartyId) ?? null)
            : null,
          tags: this.tagAssignments
            .filter((assignment) => assignment.transactionId === transaction.id)
            .map((assignment) => this.tags.get(assignment.tagId))
            .filter((tag): tag is TransactionTag => Boolean(tag)),
          attachments,
        };
      });
  }

  async listTransactionsForSync(input: { teamId: string; cursor?: string | null }) {
    const cursorTime = input.cursor ? new Date(input.cursor).getTime() : null;

    return [...this.transactions.values()]
      .filter((transaction) => transaction.teamId === input.teamId)
      .filter((transaction) => {
        if (cursorTime === null) {
          return true;
        }

        return transaction.updatedAt
          ? new Date(transaction.updatedAt).getTime() > cursorTime
          : false;
      })
      .sort(
        (left, right) =>
          new Date(left.updatedAt ?? 0).getTime() - new Date(right.updatedAt ?? 0).getTime(),
      )
      .map((transaction) => this.transactionWithDerivedAccountantStatus(transaction));
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
      baseMoney: input.draft.baseMoney ?? null,
      type: input.draft.type,
      source: input.draft.source,
      counterpartyId: input.draft.counterpartyId ?? null,
      transferGroupId: input.draft.transferGroupId ?? null,
      providerTransactionId: input.draft.providerTransactionId ?? null,
      categoryId: input.draft.categoryId ?? null,
      reviewState: "needs_review" as const,
      accountantStatus: "needs_review" as const,
      accountantStatusReason: null,
      accountantStatusUpdatedAt: null,
      duplicateKey: input.duplicateKey,
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(transaction.id, transaction);
    this.tagAssignments.push(
      ...(input.draft.tagIds ?? []).map((tagId) => ({ transactionId: transaction.id, tagId })),
    );
    return transaction;
  }

  async createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
    status?: TransactionImportSession["status"];
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const importSession = {
      id: `import_${this.importSessions.length + 1}`,
      teamId: input.teamId,
      accountId: input.accountId,
      source: "csv" as const,
      fileName: input.fileName ?? null,
      status: input.status ?? ("committed" as const),
      rowCount: input.rowCount,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions.push(importSession);
    return importSession;
  }

  async completeTransactionImportSession(input: {
    teamId: string;
    importSessionId: string;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const index = this.importSessions.findIndex(
      (session) => session.id === input.importSessionId && session.teamId === input.teamId,
    );

    if (index === -1) {
      throw new Error("missing import session");
    }

    const importSession = {
      ...this.importSessions[index]!,
      status: "committed" as const,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions[index] = importSession;
    return importSession;
  }

  async failTransactionImportSession(input: { teamId: string; importSessionId: string }) {
    const index = this.importSessions.findIndex(
      (session) => session.id === input.importSessionId && session.teamId === input.teamId,
    );

    if (index === -1) {
      throw new Error("missing import session");
    }

    const importSession = {
      ...this.importSessions[index]!,
      status: "failed" as const,
    };
    this.importSessions[index] = importSession;
    return importSession;
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
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(input.transactionId, updated);
    return this.transactionWithDerivedAccountantStatus(updated);
  }

  async countTransactionAttachmentsForTeam(input: { teamId: string; transactionId: string }) {
    return this.packetAttachments.filter(
      (attachment) =>
        attachment.transactionId === input.transactionId &&
        this.transactions.get(attachment.transactionId)?.teamId === input.teamId,
    ).length;
  }

  async updateTransactionAccountantStatusForTeam(input: {
    teamId: string;
    transactionId: string;
    accountantStatus: TransactionAccountantStatus;
    reason?: string | null;
  }) {
    const transaction = this.transactions.get(input.transactionId);

    if (!transaction || transaction.teamId !== input.teamId) {
      throw new Error("missing transaction");
    }

    const updated = {
      ...transaction,
      accountantStatus: input.accountantStatus,
      accountantStatusReason: input.reason ?? null,
      accountantStatusUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(input.transactionId, updated);
    return this.transactionWithDerivedAccountantStatus(updated);
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

  async createTeamInvite(_input: {
    teamId: string;
    email: string;
    role: TeamRole;
    invitedByActorId: string;
    expiresAt: Date;
  }): Promise<TeamInvite> {
    throw new Error("Unexpected invite creation");
  }

  async listTeamMembers(_teamId: string): Promise<TeamMember[]> {
    throw new Error("Unexpected team member list");
  }

  async listPendingTeamInvites(_teamId: string): Promise<TeamInvite[]> {
    throw new Error("Unexpected invite list");
  }

  async getTeamInvite(_inviteId: string): Promise<TeamInvite | null> {
    throw new Error("Unexpected invite lookup");
  }

  async addTeamMembership(_input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMembership> {
    throw new Error("Unexpected membership creation");
  }

  async markTeamInviteAccepted(_input: {
    inviteId: string;
    acceptedAt: Date;
  }): Promise<TeamInvite> {
    throw new Error("Unexpected invite acceptance");
  }

  async getTeamMemberByUserId(_teamId: string, _userId: string): Promise<TeamMember | null> {
    throw new Error("Unexpected team member lookup");
  }

  async updateTeamMemberRole(_input: {
    teamId: string;
    userId: string;
    role: TeamRole;
  }): Promise<TeamMember> {
    throw new Error("Unexpected team member role update");
  }

  private transactionWithDerivedAccountantStatus(transaction: Transaction): Transaction {
    return {
      ...transaction,
      accountantStatus: deriveTransactionAccountantStatus({
        transaction,
        acceptedAttachmentCount: this.packetAttachments.filter(
          (attachment) => attachment.transactionId === transaction.id,
        ).length,
      }),
    };
  }
}
