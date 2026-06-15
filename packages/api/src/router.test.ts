import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
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
import type {
  ActorTeam,
  BankAccount,
  BankConnection,
  BusinessDocument,
  BusinessDocumentVersion,
  DawnRepository,
  DocumentUrlSigner,
  IdempotencyResult,
  ProviderSyncRun,
  ReviewWorkspaceData,
  TransactionImportSession,
} from "@dawn/app";
import { createMockBankingProvider } from "@dawn/integrations";

class MemoryTransactionReviewRepository implements DawnRepository {
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];
  bankAccounts = new Map<string, BankAccount>();
  bankConnections = new Map<string, BankConnection>();
  categories = new Map<string, Category>();
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  accounts = new Map<string, LedgerAccount>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  importSessions: TransactionImportSession[] = [];
  invites = new Map<string, TeamInvite>();
  memberships = new Map<string, TeamRole>();
  providerObjects = new Map<string, Record<string, unknown>>();
  syncRuns: ProviderSyncRun[] = [];
  teams = new Map<string, string>();
  transactions = new Map<string, Transaction>();
  users = new Map<string, { email: string; name: string }>();

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
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

  async getTransactionByProviderTransactionId(teamId: string, providerTransactionId: string) {
    return (
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.teamId === teamId &&
          transaction.providerTransactionId === providerTransactionId,
      ) ?? null
    );
  }

  async listTransactionsForReport(input: { teamId: string; accountId?: string }) {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.teamId === input.teamId &&
        (!input.accountId || transaction.accountId === input.accountId),
    );
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
      );
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
      type: input.draft.type,
      source: input.draft.source,
      counterpartyId: input.draft.counterpartyId ?? null,
      providerTransactionId: input.draft.providerTransactionId ?? null,
      categoryId: input.draft.categoryId ?? null,
      reviewState: "needs_review" as const,
      duplicateKey: input.duplicateKey,
      updatedAt: new Date().toISOString(),
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async createTransactionImportSession(input: {
    teamId: string;
    accountId: string;
    actorId: string;
    fileName?: string | null;
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
      status: "committed" as const,
      rowCount: input.rowCount,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      invalidCount: input.invalidCount,
    };
    this.importSessions.push(importSession);
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

  async listBankConnectionSummaries(teamId: string) {
    return [...this.bankConnections.values()]
      .filter((connection) => connection.teamId === teamId)
      .map((connection) => ({
        connection,
        accounts: [...this.bankAccounts.values()].filter(
          (account) => account.connectionId === connection.id,
        ),
        latestSyncRun:
          [...this.syncRuns].reverse().find((syncRun) => syncRun.connectionId === connection.id) ??
          null,
      }));
  }

  async getBankConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.bankConnections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async upsertBankConnection(input: Parameters<DawnRepository["upsertBankConnection"]>[0]) {
    const existing = [...this.bankConnections.values()].find(
      (connection) =>
        connection.teamId === input.teamId &&
        connection.provider === input.providerConnection.provider &&
        connection.providerConnectionId === input.providerConnection.providerConnectionId,
    );
    const connection = {
      id: existing?.id ?? `conn_${this.bankConnections.size + 1}`,
      teamId: input.teamId,
      provider: input.providerConnection.provider,
      providerConnectionId: input.providerConnection.providerConnectionId,
      institutionName: input.providerConnection.institutionName,
      status: "connected" as const,
      lastSyncAt: existing?.lastSyncAt ?? null,
      createdAt: existing?.createdAt ?? "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.bankConnections.set(connection.id, connection);
    return connection;
  }

  async upsertBankAccount(input: Parameters<DawnRepository["upsertBankAccount"]>[0]) {
    const existing = [...this.bankAccounts.values()].find(
      (account) =>
        account.connectionId === input.connectionId &&
        account.providerAccountId === input.providerAccount.providerAccountId,
    );
    const ledgerAccountId = existing?.ledgerAccountId ?? `acct_${this.accounts.size + 1}`;

    if (!existing) {
      this.accounts.set(ledgerAccountId, {
        id: ledgerAccountId,
        teamId: input.teamId,
        name: input.providerAccount.name,
        currency: input.providerAccount.currency,
        type: input.providerAccount.type,
      });
    }

    const account = {
      id: existing?.id ?? `bank_acct_${this.bankAccounts.size + 1}`,
      teamId: input.teamId,
      connectionId: input.connectionId,
      ledgerAccountId,
      providerAccountId: input.providerAccount.providerAccountId,
      name: input.providerAccount.name,
      currency: input.providerAccount.currency,
      type: input.providerAccount.type,
      currentBalance: input.providerAccount.currentBalance,
      status: "active" as const,
    };
    this.bankAccounts.set(account.id, account);
    return account;
  }

  async createProviderSyncRun(input: { teamId: string; connectionId: string }) {
    const syncRun = {
      id: `sync_${this.syncRuns.length + 1}`,
      teamId: input.teamId,
      connectionId: input.connectionId,
      status: "running" as const,
      startedAt: "2026-06-15T10:00:00.000Z",
      completedAt: null,
      accountsSynced: 0,
      transactionsImported: 0,
      duplicateCount: 0,
      error: null,
    };
    this.syncRuns.push(syncRun);
    return syncRun;
  }

  async finishProviderSyncRun(input: Parameters<DawnRepository["finishProviderSyncRun"]>[0]) {
    const existing = this.syncRuns.find((syncRun) => syncRun.id === input.syncRunId);

    if (!existing) {
      throw new Error("Sync run not found");
    }

    const syncRun = {
      ...existing,
      status: input.status,
      completedAt: "2026-06-15T10:01:00.000Z",
      accountsSynced: input.accountsSynced,
      transactionsImported: input.transactionsImported,
      duplicateCount: input.duplicateCount,
      error: input.error ?? null,
    };
    this.syncRuns.splice(this.syncRuns.indexOf(existing), 1, syncRun);
    return syncRun;
  }

  async markBankConnectionSynced(input: Parameters<DawnRepository["markBankConnectionSynced"]>[0]) {
    const existing = this.bankConnections.get(input.connectionId);

    if (!existing) {
      throw new Error("Connection not found");
    }

    const connection = {
      ...existing,
      status: input.status,
      lastSyncAt: input.syncedAt.toISOString(),
      updatedAt: input.syncedAt.toISOString(),
    };
    this.bankConnections.set(connection.id, connection);
    return connection;
  }

  async upsertProviderObject(input: Parameters<DawnRepository["upsertProviderObject"]>[0]) {
    this.providerObjects.set(
      `${input.provider}:${input.providerObjectType}:${input.providerObjectId}`,
      input.rawPayload,
    );
  }

  async listDocuments(teamId: string) {
    return [...this.documents.values()].filter((document) => document.teamId === teamId);
  }

  async createDocumentUploadRecord(input: {
    documentId: string;
    versionId: string;
    teamId: string;
    title: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    checksumSha256?: string | null;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const version: BusinessDocumentVersion = {
      id: input.versionId,
      documentId: input.documentId,
      teamId: input.teamId,
      versionNumber: 1,
      objectKey: input.objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "pending_upload",
      uploadedAt: null,
      createdAt: now,
    };
    const document: BusinessDocument = {
      id: input.documentId,
      teamId: input.teamId,
      title: input.title,
      status: "uploading",
      currentVersionId: null,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
      currentVersion: null,
    };
    this.documents.set(document.id, document);
    this.documentVersions.set(version.id, version);

    return { document, version };
  }

  async getDocumentForTeam(teamId: string, documentId: string) {
    const document = this.documents.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.documentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }) {
    const document = this.documents.get(input.documentId);
    const version = this.documentVersions.get(input.versionId);

    if (
      !document ||
      document.teamId !== input.teamId ||
      !version ||
      version.teamId !== input.teamId
    ) {
      throw new Error("Document upload not found");
    }

    const uploadedVersion: BusinessDocumentVersion = {
      ...version,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "uploaded",
      uploadedAt: input.uploadedAt.toISOString(),
    };
    const uploadedDocument: BusinessDocument = {
      ...document,
      status: "uploaded",
      currentVersionId: uploadedVersion.id,
      currentVersion: uploadedVersion,
      updatedAt: input.uploadedAt.toISOString(),
    };
    this.documentVersions.set(uploadedVersion.id, uploadedVersion);
    this.documents.set(uploadedDocument.id, uploadedDocument);

    return { document: uploadedDocument, version: uploadedVersion };
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

const testDocumentUrlSigner: DocumentUrlSigner = {
  async createUploadUrl(input) {
    return {
      url: `http://localhost:3000/documents/upload/${input.versionId}`,
      expiresAt: "2026-06-15T10:15:00.000Z",
    };
  },
  async createDownloadUrl(input) {
    return {
      url: `http://localhost:3000/documents/download/${input.versionId}`,
      expiresAt: "2026-06-15T10:05:00.000Z",
    };
  },
};

async function createTestRouter(repository: DawnRepository) {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";

  const { createAppRouter } = await import("./routers/index");
  return createAppRouter({
    transactionReviewRepository: repository,
    bankingProvider: createMockBankingProvider(),
    documentUrlSigner: testDocumentUrlSigner,
  });
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

  test("returns cursor-scoped transaction sync changes through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "viewer");
    repository.transactions.set("txn_old", {
      id: "txn_old",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Old transaction",
      postedAt: "2026-06-13",
      money: { amountMinor: -500, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
      updatedAt: "2026-06-14T09:00:00.000Z",
    });
    repository.transactions.set("txn_new", {
      id: "txn_new",
      teamId: "team_1",
      accountId: "acct_1",
      description: "New transaction",
      postedAt: "2026-06-15",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: "cat_software",
      reviewState: "reviewed",
      updatedAt: "2026-06-15T09:00:00.000Z",
    });
    repository.transactions.set("txn_other", {
      id: "txn_other",
      teamId: "team_2",
      accountId: "acct_2",
      description: "Other team",
      postedAt: "2026-06-15",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
      updatedAt: "2026-06-16T09:00:00.000Z",
    });
    const router = await createTestRouter(repository);

    const response = await call(
      router.sync.transactions,
      { teamId: "team_1", cursor: "2026-06-14T12:00:00.000Z" },
      {
        context: testContext({ id: "user_1", email: "viewer@example.com" }),
      },
    );

    expect(response).toMatchObject({
      collection: "transactions",
      teamId: "team_1",
      cursor: "2026-06-15T09:00:00.000Z",
      conflictPolicy: "server_wins_for_financial_state",
    });
    expect(
      response.changes.map((change) => (change.type === "upsert" ? change.record.id : "")),
    ).toEqual(["txn_new"]);
  });

  test("maps sync permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.sync.transactions,
        { teamId: "team_2", cursor: null },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot sync transactions for this team",
    });
  });

  test("creates ledger transactions through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    repository.categories.set("cat_software", {
      id: "cat_software",
      teamId: "team_1",
      name: "Software",
    });
    const router = await createTestRouter(repository);

    const result = await call(
      router.ledger.createTransaction,
      {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Figma subscription",
        postedAt: "2026-06-14T00:00:00.000Z",
        money: { amountMinor: -1200, currency: "USD" },
        type: "expense",
        source: "manual",
        categoryId: "cat_software",
        idempotencyKey: "idem_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(result.transaction.accountId).toBe("acct_1");
    expect(result.transaction.duplicateKey).toBe(
      "team_1:manual:acct_1:2026-06-14:USD:-1200:figma subscription",
    );
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("previews and commits CSV imports through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    repository.categories.set("cat_software", {
      id: "cat_software",
      teamId: "team_1",
      name: "Software",
    });
    const router = await createTestRouter(repository);
    const input = {
      teamId: "team_1",
      accountId: "acct_1",
      csvText:
        "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        categoryId: "cat_software",
      },
    };

    const preview = await call(router.csvImport.preview, input, {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    });
    const result = await call(
      router.csvImport.commit,
      {
        ...input,
        fileName: "transactions.csv",
        idempotencyKey: "idem_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(preview.readyCount).toBe(2);
    expect(result.importSession.importedCount).toBe(2);
    expect(result.transactions).toHaveLength(2);
    expect(repository.importSessions).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("creates and signs document uploads and downloads through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);

    const prepared = await call(
      router.documents.createUpload,
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "doc_upload_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const listed = await call(
      router.documents.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    await repository.completeDocumentVersionUpload({
      teamId: "team_1",
      documentId: prepared.document.id,
      versionId: prepared.version.id,
      byteSize: 7,
      uploadedAt: new Date("2026-06-15T10:01:00.000Z"),
    });

    const download = await call(
      router.documents.download,
      { teamId: "team_1", documentId: prepared.document.id },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(prepared.uploadUrl).toBe(
      `http://localhost:3000/documents/upload/${prepared.version.id}`,
    );
    expect(listed.documents).toHaveLength(1);
    expect(listed.documents[0]?.status).toBe("uploading");
    expect(download.downloadUrl).toBe(
      `http://localhost:3000/documents/download/${prepared.version.id}`,
    );
  });

  test("maps document upload permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.documents.createUpload,
        {
          teamId: "team_1",
          fileName: "receipt.pdf",
          contentType: "application/pdf",
          byteSize: 7,
          idempotencyKey: "doc_upload_1",
        },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot upload documents for this team",
    });
  });

  test("connects and syncs a mock bank provider through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "owner");
    const router = await createTestRouter(repository);

    const connected = await call(
      router.banking.connectMock,
      { teamId: "team_1", idempotencyKey: "connect_1" },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const firstSync = await call(
      router.banking.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_1",
      },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const secondSync = await call(
      router.banking.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_2",
      },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );
    const list = await call(
      router.banking.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "owner@example.com" }),
      },
    );

    expect(connected.connection.provider).toBe("mock-bank");
    expect(firstSync.accounts).toHaveLength(2);
    expect(firstSync.transactions).toHaveLength(2);
    expect(secondSync.transactions).toHaveLength(0);
    expect(secondSync.duplicateCount).toBe(2);
    expect(list.connections[0]?.latestSyncRun).toMatchObject({
      status: "completed",
      transactionsImported: 0,
      duplicateCount: 2,
    });
    expect(repository.providerObjects.get("mock-bank:connection:mock_conn_team_1")).toMatchObject({
      mock: true,
    });
  });
});
