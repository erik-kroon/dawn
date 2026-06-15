import type {
  ActorTeam,
  AuditLogEntry,
  BankAccount,
  BankConnection,
  BankConnectionSummary,
  BusinessDocument,
  BusinessDocumentVersion,
  CsvTransactionImportMapping,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  DocumentExtractionSource,
  HardNegativeTransactionMatch,
  IdempotencyResult,
  InboxItem,
  InboxTransactionMatchSuggestion,
  InboxSource,
  InboxSourceType,
  JobRun,
  MatchFeedback,
  OutboxDispatchRepository,
  OutboxEvent,
  ProviderSyncRun,
  ReviewWorkspaceData,
  TeamAlias,
  TransactionImportSession,
} from "@dawn/app";
import type {
  Actor,
  ApiKey,
  AutomationRule,
  AutomationRun,
  AssistantActionApproval,
  AssistantMessage,
  AssistantThread,
  AssistantToolCall,
  BusinessInsight,
  Category,
  Counterparty,
  Customer,
  CustomerContact,
  IntegrationCategory,
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationSyncRunStatus,
  InvoiceEvent,
  InvoiceDraft,
  InvoiceLineDraft,
  InvoicePayment,
  OAuthApp,
  OAuthGrant,
  LedgerAccount,
  LedgerTransactionDraft,
  Product,
  Project,
  ProjectMember,
  RecurringInvoiceSchedule,
  ReportSourceRef,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  TimeEntry,
  Transaction,
  TransactionTag,
  WebhookDelivery,
  WebhookSubscription,
  InboxMatchCandidate,
} from "@dawn/domain";
import { calculateInvoiceTotals, ledgerDuplicateKey } from "@dawn/domain";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "./index";
import * as developerPersistence from "./repositories/developer";
import * as integrationPersistence from "./repositories/integrations";
import type { QueryClient } from "./repositories/types";
import * as schema from "./schema";

export type DrizzleRepository = DawnRepository & OutboxDispatchRepository;

export class DrizzleDawnRepository implements DrizzleRepository {
  constructor(private readonly client: QueryClient = db) {}

  async withTransaction<T>(callback: (repository: DrizzleRepository) => Promise<T>): Promise<T> {
    if (!("transaction" in this.client)) {
      return callback(this);
    }

    return this.client.transaction((transactionClient) =>
      callback(new DrizzleDawnRepository(transactionClient)),
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

  async listCounterparties(teamId: string): Promise<Counterparty[]> {
    const counterparties = await this.client
      .select()
      .from(schema.counterparty)
      .where(eq(schema.counterparty.teamId, teamId))
      .orderBy(asc(schema.counterparty.name));

    return counterparties.map(mapCounterparty);
  }

  async listTransactionTags(teamId: string): Promise<TransactionTag[]> {
    const tags = await this.client
      .select()
      .from(schema.transactionTag)
      .where(eq(schema.transactionTag.teamId, teamId))
      .orderBy(asc(schema.transactionTag.name));

    return tags.map(mapTransactionTag);
  }

  async getCounterpartyForTeam(teamId: string, counterpartyId: string) {
    const [counterparty] = await this.client
      .select()
      .from(schema.counterparty)
      .where(
        and(eq(schema.counterparty.teamId, teamId), eq(schema.counterparty.id, counterpartyId)),
      )
      .limit(1);

    return counterparty ? mapCounterparty(counterparty) : null;
  }

  async getTransactionTagForTeam(teamId: string, tagId: string) {
    const [tag] = await this.client
      .select()
      .from(schema.transactionTag)
      .where(and(eq(schema.transactionTag.teamId, teamId), eq(schema.transactionTag.id, tagId)))
      .limit(1);

    return tag ? mapTransactionTag(tag) : null;
  }

  async upsertCounterparty(input: { teamId: string; name: string }): Promise<Counterparty> {
    const [existing] = await this.client
      .select()
      .from(schema.counterparty)
      .where(
        and(eq(schema.counterparty.teamId, input.teamId), eq(schema.counterparty.name, input.name)),
      )
      .limit(1);

    if (existing) {
      return mapCounterparty(existing);
    }

    const [counterparty] = await this.client
      .insert(schema.counterparty)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        name: input.name,
      })
      .returning();

    if (!counterparty) {
      throw new Error("Counterparty was not created");
    }

    return mapCounterparty(counterparty);
  }

  async upsertTransactionTag(input: { teamId: string; name: string }): Promise<TransactionTag> {
    const [existing] = await this.client
      .select()
      .from(schema.transactionTag)
      .where(
        and(
          eq(schema.transactionTag.teamId, input.teamId),
          eq(schema.transactionTag.name, input.name),
        ),
      )
      .limit(1);

    if (existing) {
      return mapTransactionTag(existing);
    }

    const [tag] = await this.client
      .insert(schema.transactionTag)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        name: input.name,
      })
      .returning();

    if (!tag) {
      throw new Error("Transaction tag was not created");
    }

    return mapTransactionTag(tag);
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

  async listBankConnectionSummaries(teamId: string): Promise<BankConnectionSummary[]> {
    const [connections, accounts, syncRuns] = await Promise.all([
      this.client
        .select()
        .from(schema.bankConnection)
        .where(eq(schema.bankConnection.teamId, teamId))
        .orderBy(desc(schema.bankConnection.createdAt)),
      this.client.select().from(schema.bankAccount).where(eq(schema.bankAccount.teamId, teamId)),
      this.client
        .select()
        .from(schema.providerSyncRun)
        .where(eq(schema.providerSyncRun.teamId, teamId))
        .orderBy(desc(schema.providerSyncRun.startedAt)),
    ]);

    return connections.map((connection) => ({
      connection: mapBankConnection(connection),
      accounts: accounts
        .filter((account) => account.connectionId === connection.id)
        .map(mapBankAccount),
      latestSyncRun: syncRuns.find((syncRun) => syncRun.connectionId === connection.id)
        ? mapProviderSyncRun(syncRuns.find((syncRun) => syncRun.connectionId === connection.id)!)
        : null,
    }));
  }

  async getBankConnectionForTeam(teamId: string, connectionId: string) {
    const [connection] = await this.client
      .select()
      .from(schema.bankConnection)
      .where(
        and(eq(schema.bankConnection.teamId, teamId), eq(schema.bankConnection.id, connectionId)),
      )
      .limit(1);

    return connection ? mapBankConnection(connection) : null;
  }

  async getBankConnectionByProviderConnectionId(
    teamId: string,
    provider: BankConnection["provider"],
    providerConnectionId: string,
  ) {
    const [connection] = await this.client
      .select()
      .from(schema.bankConnection)
      .where(
        and(
          eq(schema.bankConnection.teamId, teamId),
          eq(schema.bankConnection.provider, provider),
          eq(schema.bankConnection.providerConnectionId, providerConnectionId),
        ),
      )
      .limit(1);

    return connection ? mapBankConnection(connection) : null;
  }

  async upsertBankConnection(input: {
    teamId: string;
    providerConnection: {
      provider: BankConnection["provider"];
      providerConnectionId: string;
      institutionName: string;
      status: "connected";
      token?: {
        encryptedToken: string;
        keyId: string;
        lastFour: string;
      } | null;
      rawPayload: Record<string, unknown>;
    };
  }) {
    const existing = await this.client
      .select()
      .from(schema.bankConnection)
      .where(
        and(
          eq(schema.bankConnection.teamId, input.teamId),
          eq(schema.bankConnection.provider, input.providerConnection.provider),
          eq(
            schema.bankConnection.providerConnectionId,
            input.providerConnection.providerConnectionId,
          ),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [connection] = await this.client
        .update(schema.bankConnection)
        .set({
          institutionName: input.providerConnection.institutionName,
          status: input.providerConnection.status,
          tokenCiphertext: input.providerConnection.token?.encryptedToken ?? null,
          tokenKeyId: input.providerConnection.token?.keyId ?? null,
          tokenLastFour: input.providerConnection.token?.lastFour ?? null,
          rawPayload: input.providerConnection.rawPayload,
          updatedAt: new Date(),
        })
        .where(eq(schema.bankConnection.id, existing[0].id))
        .returning();

      if (!connection) {
        throw new Error("Bank connection was not updated");
      }

      return mapBankConnection(connection);
    }

    const [connection] = await this.client
      .insert(schema.bankConnection)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        provider: input.providerConnection.provider,
        providerConnectionId: input.providerConnection.providerConnectionId,
        institutionName: input.providerConnection.institutionName,
        status: input.providerConnection.status,
        tokenCiphertext: input.providerConnection.token?.encryptedToken ?? null,
        tokenKeyId: input.providerConnection.token?.keyId ?? null,
        tokenLastFour: input.providerConnection.token?.lastFour ?? null,
        rawPayload: input.providerConnection.rawPayload,
      })
      .returning();

    if (!connection) {
      throw new Error("Bank connection was not created");
    }

    return mapBankConnection(connection);
  }

  async disconnectBankConnection(input: { connectionId: string; disconnectedAt: Date }) {
    const [connection] = await this.client
      .update(schema.bankConnection)
      .set({
        status: "disconnected",
        updatedAt: input.disconnectedAt,
      })
      .where(eq(schema.bankConnection.id, input.connectionId))
      .returning();

    if (!connection) {
      throw new Error("Bank connection was not updated");
    }

    return mapBankConnection(connection);
  }

  async upsertBankAccount(input: {
    teamId: string;
    connectionId: string;
    providerAccount: {
      providerAccountId: string;
      name: string;
      currency: string;
      type: BankAccount["type"];
      currentBalance: BankAccount["currentBalance"];
      rawPayload: Record<string, unknown>;
    };
  }) {
    const [existing] = await this.client
      .select()
      .from(schema.bankAccount)
      .where(
        and(
          eq(schema.bankAccount.connectionId, input.connectionId),
          eq(schema.bankAccount.providerAccountId, input.providerAccount.providerAccountId),
        ),
      )
      .limit(1);

    if (existing) {
      const [account] = await this.client
        .update(schema.bankAccount)
        .set({
          name: input.providerAccount.name,
          currency: input.providerAccount.currency,
          type: input.providerAccount.type,
          currentBalanceMinor: input.providerAccount.currentBalance.amountMinor,
          rawPayload: input.providerAccount.rawPayload,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(schema.bankAccount.id, existing.id))
        .returning();

      if (!account) {
        throw new Error("Bank account was not updated");
      }

      return mapBankAccount(account);
    }

    const ledgerAccountId = crypto.randomUUID();

    await this.client.insert(schema.ledgerAccount).values({
      id: ledgerAccountId,
      teamId: input.teamId,
      name: input.providerAccount.name,
      currency: input.providerAccount.currency,
      type: input.providerAccount.type,
    });

    const [account] = await this.client
      .insert(schema.bankAccount)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        connectionId: input.connectionId,
        ledgerAccountId,
        providerAccountId: input.providerAccount.providerAccountId,
        name: input.providerAccount.name,
        currency: input.providerAccount.currency,
        type: input.providerAccount.type,
        currentBalanceMinor: input.providerAccount.currentBalance.amountMinor,
        rawPayload: input.providerAccount.rawPayload,
      })
      .returning();

    if (!account) {
      throw new Error("Bank account was not created");
    }

    return mapBankAccount(account);
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

  async getTransactionByProviderTransactionId(teamId: string, providerTransactionId: string) {
    const [transaction] = await this.client
      .select()
      .from(schema.transaction)
      .where(
        and(
          eq(schema.transaction.teamId, teamId),
          eq(schema.transaction.providerTransactionId, providerTransactionId),
        ),
      )
      .limit(1);

    return transaction ? mapTransaction(transaction) : null;
  }

  async createProviderSyncRun(input: { teamId: string; connectionId: string }) {
    const [syncRun] = await this.client
      .insert(schema.providerSyncRun)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        connectionId: input.connectionId,
        status: "running",
      })
      .returning();

    if (!syncRun) {
      throw new Error("Provider sync run was not created");
    }

    return mapProviderSyncRun(syncRun);
  }

  async finishProviderSyncRun(input: {
    syncRunId: string;
    status: "completed" | "failed";
    accountsSynced: number;
    transactionsImported: number;
    duplicateCount: number;
    error?: string | null;
  }) {
    const [syncRun] = await this.client
      .update(schema.providerSyncRun)
      .set({
        status: input.status,
        completedAt: new Date(),
        accountsSynced: input.accountsSynced,
        transactionsImported: input.transactionsImported,
        duplicateCount: input.duplicateCount,
        error: input.error ?? null,
      })
      .where(eq(schema.providerSyncRun.id, input.syncRunId))
      .returning();

    if (!syncRun) {
      throw new Error("Provider sync run was not updated");
    }

    return mapProviderSyncRun(syncRun);
  }

  async markBankConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: BankConnection["status"];
  }) {
    const [connection] = await this.client
      .update(schema.bankConnection)
      .set({
        lastSyncAt: input.syncedAt,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.bankConnection.id, input.connectionId))
      .returning();

    if (!connection) {
      throw new Error("Bank connection was not updated");
    }

    return mapBankConnection(connection);
  }

  async upsertProviderObject(input: {
    teamId: string;
    provider: BankConnection["provider"];
    providerObjectType: "connection" | "account" | "transaction";
    providerObjectId: string;
    connectionId?: string | null;
    bankAccountId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const [existing] = await this.client
      .select()
      .from(schema.providerObject)
      .where(
        and(
          eq(schema.providerObject.teamId, input.teamId),
          eq(schema.providerObject.provider, input.provider),
          eq(schema.providerObject.providerObjectType, input.providerObjectType),
          eq(schema.providerObject.providerObjectId, input.providerObjectId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.client
        .update(schema.providerObject)
        .set({
          connectionId: input.connectionId ?? null,
          bankAccountId: input.bankAccountId ?? null,
          internalEntityType: input.internalEntityType ?? null,
          internalEntityId: input.internalEntityId ?? null,
          rawPayload: input.rawPayload,
          updatedAt: new Date(),
        })
        .where(eq(schema.providerObject.id, existing.id));
      return;
    }

    await this.client.insert(schema.providerObject).values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      provider: input.provider,
      providerObjectType: input.providerObjectType,
      providerObjectId: input.providerObjectId,
      connectionId: input.connectionId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      internalEntityType: input.internalEntityType ?? null,
      internalEntityId: input.internalEntityId ?? null,
      rawPayload: input.rawPayload,
    });
  }

  async listIntegrationConnectionSummaries(teamId: string) {
    return integrationPersistence.listIntegrationConnectionSummaries(this.client, teamId);
  }

  async getIntegrationConnectionForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnection | null> {
    return integrationPersistence.getIntegrationConnectionForTeam(
      this.client,
      teamId,
      connectionId,
    );
  }

  async upsertIntegrationConnection(input: {
    connectionId: string;
    teamId: string;
    category: IntegrationCategory;
    provider: string;
    providerConnectionId: string;
    displayName: string;
    capabilities: string[];
    tokenCiphertext: string;
    tokenKeyId: string;
    tokenLastFour: string;
    rawPayload: Record<string, unknown>;
    createdByActorId: string;
  }): Promise<IntegrationConnection> {
    return integrationPersistence.upsertIntegrationConnection(this.client, input);
  }

  async createIntegrationSyncRun(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }): Promise<IntegrationSyncRun> {
    return integrationPersistence.createIntegrationSyncRun(this.client, input);
  }

  async finishIntegrationSyncRun(input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<IntegrationSyncRun> {
    return integrationPersistence.finishIntegrationSyncRun(this.client, input);
  }

  async markIntegrationConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: IntegrationConnection["status"];
    lastError?: string | null;
  }): Promise<IntegrationConnection> {
    return integrationPersistence.markIntegrationConnectionSynced(this.client, input);
  }

  async disableIntegrationConnection(input: {
    connectionId: string;
    disabledAt: Date;
  }): Promise<IntegrationConnection> {
    return integrationPersistence.disableIntegrationConnection(this.client, input);
  }

  async listDocuments(teamId: string): Promise<BusinessDocument[]> {
    const [documents, versions] = await Promise.all([
      this.client
        .select()
        .from(schema.businessDocument)
        .where(eq(schema.businessDocument.teamId, teamId))
        .orderBy(desc(schema.businessDocument.updatedAt)),
      this.client
        .select()
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.teamId, teamId)),
    ]);

    return documents.map((document) =>
      mapBusinessDocument(
        document,
        versions.find((version) => version.id === document.currentVersionId) ?? null,
      ),
    );
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
    const [document] = await this.client
      .insert(schema.businessDocument)
      .values({
        id: input.documentId,
        teamId: input.teamId,
        title: input.title,
        status: "uploading",
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!document) {
      throw new Error("Document was not created");
    }

    const [version] = await this.client
      .insert(schema.documentVersion)
      .values({
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
        uploadedByActorId: input.createdByActorId,
      })
      .returning();

    if (!version) {
      throw new Error("Document version was not created");
    }

    return {
      document: mapBusinessDocument(document, null),
      version: mapBusinessDocumentVersion(version),
    };
  }

  async getDocumentForTeam(teamId: string, documentId: string) {
    const [document] = await this.client
      .select()
      .from(schema.businessDocument)
      .where(
        and(eq(schema.businessDocument.teamId, teamId), eq(schema.businessDocument.id, documentId)),
      )
      .limit(1);

    if (!document) {
      return null;
    }

    const currentVersion = document.currentVersionId
      ? (
          await this.client
            .select()
            .from(schema.documentVersion)
            .where(eq(schema.documentVersion.id, document.currentVersionId))
            .limit(1)
        )[0]
      : null;

    return mapBusinessDocument(document, currentVersion ?? null);
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const [version] = await this.client
      .select()
      .from(schema.documentVersion)
      .where(
        and(eq(schema.documentVersion.teamId, teamId), eq(schema.documentVersion.id, versionId)),
      )
      .limit(1);

    return version ? mapBusinessDocumentVersion(version) : null;
  }

  async completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }) {
    const [version] = await this.client
      .update(schema.documentVersion)
      .set({
        status: "uploaded",
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256 ?? null,
        uploadedAt: input.uploadedAt,
      })
      .where(
        and(
          eq(schema.documentVersion.teamId, input.teamId),
          eq(schema.documentVersion.documentId, input.documentId),
          eq(schema.documentVersion.id, input.versionId),
        ),
      )
      .returning();

    if (!version) {
      throw new Error("Document version was not uploaded");
    }

    const [document] = await this.client
      .update(schema.businessDocument)
      .set({
        status: "uploaded",
        currentVersionId: input.versionId,
        updatedAt: input.uploadedAt,
      })
      .where(
        and(
          eq(schema.businessDocument.teamId, input.teamId),
          eq(schema.businessDocument.id, input.documentId),
        ),
      )
      .returning();

    if (!document) {
      throw new Error("Document was not uploaded");
    }

    return {
      document: mapBusinessDocument(document, version),
      version: mapBusinessDocumentVersion(version),
    };
  }

  async listInboxItems(teamId: string): Promise<InboxItem[]> {
    const [items, sources, documents, versions, extractions, matchSuggestions] = await Promise.all([
      this.client
        .select()
        .from(schema.inboxItem)
        .where(eq(schema.inboxItem.teamId, teamId))
        .orderBy(desc(schema.inboxItem.updatedAt)),
      this.client.select().from(schema.inboxSource).where(eq(schema.inboxSource.teamId, teamId)),
      this.client
        .select()
        .from(schema.businessDocument)
        .where(eq(schema.businessDocument.teamId, teamId)),
      this.client
        .select()
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.teamId, teamId)),
      this.client
        .select()
        .from(schema.documentExtraction)
        .where(eq(schema.documentExtraction.teamId, teamId)),
      this.listInboxMatchSuggestions(teamId),
    ]);

    return items.map((item) =>
      mapInboxItem(item, {
        source: sources.find((source) => source.id === item.sourceId) ?? null,
        document: documents.find((document) => document.id === item.documentId) ?? null,
        version: versions.find((version) => version.id === item.documentVersionId) ?? null,
        latestExtraction: latestExtractionForItem(extractions, item.id),
        matchSuggestions: matchSuggestions.filter(
          (suggestion) => suggestion.inboxItemId === item.id,
        ),
      }),
    );
  }

  async ensureInboxSource(input: {
    sourceId: string;
    teamId: string;
    type: InboxSourceType;
    name: string;
  }) {
    const [existing] = await this.client
      .select()
      .from(schema.inboxSource)
      .where(
        and(
          eq(schema.inboxSource.teamId, input.teamId),
          eq(schema.inboxSource.type, input.type),
          eq(schema.inboxSource.name, input.name),
        ),
      )
      .limit(1);

    if (existing) {
      return mapInboxSource(existing);
    }

    const [source] = await this.client
      .insert(schema.inboxSource)
      .values({
        id: input.sourceId,
        teamId: input.teamId,
        type: input.type,
        name: input.name,
      })
      .returning();

    if (!source) {
      throw new Error("Inbox source was not created");
    }

    return mapInboxSource(source);
  }

  async createInboxItemForDocumentUpload(input: {
    inboxItemId: string;
    sourceId: string;
    teamId: string;
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }) {
    const [existing] = await this.client
      .select()
      .from(schema.inboxItem)
      .where(
        and(
          eq(schema.inboxItem.teamId, input.teamId),
          eq(schema.inboxItem.documentVersionId, input.documentVersionId),
        ),
      )
      .limit(1);

    if (existing) {
      return mapInboxItem(existing);
    }

    const [item] = await this.client
      .insert(schema.inboxItem)
      .values({
        id: input.inboxItemId,
        teamId: input.teamId,
        sourceId: input.sourceId,
        sourceType: "document_upload",
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        status: "pending_extraction",
        extractionStatus: "pending",
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!item) {
      throw new Error("Inbox item was not created");
    }

    return mapInboxItem(item);
  }

  async getInboxItemForTeam(teamId: string, inboxItemId: string) {
    const [item] = await this.client
      .select()
      .from(schema.inboxItem)
      .where(and(eq(schema.inboxItem.teamId, teamId), eq(schema.inboxItem.id, inboxItemId)))
      .limit(1);

    if (!item) {
      return null;
    }

    const [source, document, version, latestExtraction, matchSuggestions] = await Promise.all([
      this.client
        .select()
        .from(schema.inboxSource)
        .where(eq(schema.inboxSource.id, item.sourceId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.client
        .select()
        .from(schema.businessDocument)
        .where(eq(schema.businessDocument.id, item.documentId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.client
        .select()
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.id, item.documentVersionId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.client
        .select()
        .from(schema.documentExtraction)
        .where(eq(schema.documentExtraction.inboxItemId, item.id))
        .orderBy(desc(schema.documentExtraction.extractionVersion))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.listInboxMatchSuggestions(teamId, inboxItemId),
    ]);

    return mapInboxItem(item, { source, document, version, latestExtraction, matchSuggestions });
  }

  async createDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
    createdByActorId: string;
  }) {
    const extractionVersion = await this.nextDocumentExtractionVersion(input.inboxItemId);
    const [extraction] = await this.client
      .insert(schema.documentExtraction)
      .values({
        id: input.extractionId,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        extractionVersion,
        source: input.source,
        status: "completed",
        fields: input.fields,
        confidence: input.confidence,
        rawText: input.rawText ?? null,
        error: null,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!extraction) {
      throw new Error("Document extraction was not created");
    }

    const [item] = await this.client
      .update(schema.inboxItem)
      .set({
        status: "needs_review",
        extractionStatus: "completed",
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.inboxItem.teamId, input.teamId), eq(schema.inboxItem.id, input.inboxItemId)),
      )
      .returning();

    if (!item) {
      throw new Error("Inbox item was not updated");
    }

    return {
      inboxItem: mapInboxItem(item, { latestExtraction: extraction }),
      extraction: mapDocumentExtraction(extraction),
    };
  }

  async createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }) {
    const item = await this.getInboxItemForTeam(input.teamId, input.inboxItemId);

    if (!item) {
      throw new Error("Inbox item not found");
    }

    const extractionVersion = await this.nextDocumentExtractionVersion(input.inboxItemId);
    const [extraction] = await this.client
      .insert(schema.documentExtraction)
      .values({
        id: input.extractionId,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        documentId: item.documentId,
        documentVersionId: item.documentVersionId,
        extractionVersion,
        source: "user_correction",
        status: "completed",
        fields: input.fields,
        confidence: input.confidence,
        rawText: item.latestExtraction?.rawText ?? null,
        error: null,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!extraction) {
      throw new Error("Document extraction correction was not created");
    }

    const [updatedItem] = await this.client
      .update(schema.inboxItem)
      .set({
        status: "needs_review",
        extractionStatus: "completed",
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.inboxItem.teamId, input.teamId), eq(schema.inboxItem.id, input.inboxItemId)),
      )
      .returning();

    if (!updatedItem) {
      throw new Error("Inbox item was not updated");
    }

    return {
      inboxItem: mapInboxItem(updatedItem, { latestExtraction: extraction }),
      extraction: mapDocumentExtraction(extraction),
    };
  }

  async markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }) {
    const [item] = await this.client
      .update(schema.inboxItem)
      .set({
        extractionStatus: "failed",
        updatedAt: input.failedAt,
      })
      .where(
        and(eq(schema.inboxItem.teamId, input.teamId), eq(schema.inboxItem.id, input.inboxItemId)),
      )
      .returning();

    if (!item) {
      throw new Error("Inbox item was not updated");
    }

    return mapInboxItem(item);
  }

  async listTeamAliases(teamId: string): Promise<TeamAlias[]> {
    const aliases = await this.client
      .select()
      .from(schema.teamAlias)
      .where(eq(schema.teamAlias.teamId, teamId))
      .orderBy(desc(schema.teamAlias.createdAt));

    return aliases.map(mapTeamAlias);
  }

  async listTeamMatchFeedback(teamId: string): Promise<MatchFeedback[]> {
    const rows = await this.client
      .select({
        suggestion: schema.inboxMatchSuggestion,
        extraction: schema.documentExtraction,
        transaction: schema.transaction,
      })
      .from(schema.inboxMatchSuggestion)
      .innerJoin(
        schema.documentExtraction,
        eq(schema.documentExtraction.inboxItemId, schema.inboxMatchSuggestion.inboxItemId),
      )
      .innerJoin(
        schema.transaction,
        eq(schema.transaction.id, schema.inboxMatchSuggestion.transactionId),
      )
      .where(
        and(
          eq(schema.inboxMatchSuggestion.teamId, teamId),
          inArray(schema.inboxMatchSuggestion.status, ["accepted", "rejected"]),
        ),
      )
      .orderBy(
        desc(schema.inboxMatchSuggestion.updatedAt),
        desc(schema.documentExtraction.extractionVersion),
      )
      .limit(400);
    const latestRowsBySuggestion = new Map<string, (typeof rows)[number]>();

    for (const row of rows) {
      if (!latestRowsBySuggestion.has(row.suggestion.id)) {
        latestRowsBySuggestion.set(row.suggestion.id, row);
      }
    }

    const feedbackByKey = new Map<string, MatchFeedback>();

    for (const row of latestRowsBySuggestion.values()) {
      const source =
        typeof row.extraction.fields.merchantName === "string"
          ? row.extraction.fields.merchantName
          : null;
      const target = row.transaction.description;
      const status = row.suggestion.status === "accepted" ? "accepted" : "rejected";

      if (!source || !target) {
        continue;
      }

      const key = `${status}:${source}:${target}`;
      const existing = feedbackByKey.get(key);

      feedbackByKey.set(key, {
        teamId,
        source,
        target,
        status,
        count: (existing?.count ?? 0) + 1,
        lastOccurredAt: existing?.lastOccurredAt ?? row.suggestion.updatedAt.toISOString(),
      });
    }

    return [...feedbackByKey.values()];
  }

  async listHardNegativeMatches(
    teamId: string,
    inboxItemId: string,
  ): Promise<HardNegativeTransactionMatch[]> {
    const matches = await this.client
      .select()
      .from(schema.hardNegativeMatch)
      .where(
        and(
          eq(schema.hardNegativeMatch.teamId, teamId),
          eq(schema.hardNegativeMatch.inboxItemId, inboxItemId),
        ),
      );

    return matches.map(mapHardNegativeMatch);
  }

  async listTransactionMatchCandidatesForInboxItem(input: {
    teamId: string;
    inboxItem: InboxItem;
    limit: number;
  }): Promise<InboxMatchCandidate[]> {
    const extraction = input.inboxItem.latestExtraction;

    if (!extraction) {
      return [];
    }

    const conditions: SQL[] = [
      eq(schema.transaction.teamId, input.teamId),
      sql`not exists (
        select 1
        from ${schema.transactionAttachment}
        where ${schema.transactionAttachment.teamId} = ${input.teamId}
          and (
            ${schema.transactionAttachment.transactionId} = ${schema.transaction.id}
            or ${schema.transactionAttachment.documentId} = ${input.inboxItem.documentId}
          )
      )`,
      sql`not exists (
        select 1
        from ${schema.inboxMatchSuggestion}
        where ${schema.inboxMatchSuggestion.teamId} = ${input.teamId}
          and ${schema.inboxMatchSuggestion.inboxItemId} = ${input.inboxItem.id}
          and ${schema.inboxMatchSuggestion.transactionId} = ${schema.transaction.id}
          and ${schema.inboxMatchSuggestion.status} in ('suggested', 'accepted')
      )`,
    ];
    const currency = extraction.fields.currency?.trim().toUpperCase();
    const baseCurrency = extraction.fields.baseCurrency?.trim().toUpperCase();
    const baseAmountMinor =
      typeof extraction.fields.baseAmountMinor === "number" &&
      Number.isSafeInteger(extraction.fields.baseAmountMinor)
        ? Math.abs(extraction.fields.baseAmountMinor)
        : null;
    const hasBaseMoneyEvidence = Boolean(baseCurrency && baseAmountMinor != null);

    if (currency) {
      conditions.push(
        hasBaseMoneyEvidence
          ? sql`(
              ${schema.transaction.currency} = ${currency}
              or (
                ${schema.transaction.baseCurrency} = ${baseCurrency}
                and abs(${schema.transaction.baseAmountMinor}) = ${baseAmountMinor}
              )
            )`
          : eq(schema.transaction.currency, currency),
      );
    }

    if (extraction.fields.totalAmountMinor != null) {
      const amountMinor = Math.abs(extraction.fields.totalAmountMinor);
      conditions.push(
        hasBaseMoneyEvidence
          ? sql`(
              abs(${schema.transaction.amountMinor}) = ${amountMinor}
              or (
                ${schema.transaction.baseCurrency} = ${baseCurrency}
                and abs(${schema.transaction.baseAmountMinor}) = ${baseAmountMinor}
              )
            )`
          : sql`abs(${schema.transaction.amountMinor}) = ${amountMinor}`,
      );
    } else if (hasBaseMoneyEvidence) {
      conditions.push(sql`
        ${schema.transaction.baseCurrency} = ${baseCurrency}
        and abs(${schema.transaction.baseAmountMinor}) = ${baseAmountMinor}
      `);
    }

    const issuedAt = parseCandidateDate(extraction.fields.issuedAt);

    if (issuedAt) {
      conditions.push(gte(schema.transaction.postedAt, daysFrom(issuedAt, -14)));
      conditions.push(lte(schema.transaction.postedAt, daysFrom(issuedAt, 14)));
    }

    const rows = await this.client
      .select({
        transaction: schema.transaction,
        counterparty: schema.counterparty,
      })
      .from(schema.transaction)
      .leftJoin(schema.counterparty, eq(schema.counterparty.id, schema.transaction.counterpartyId))
      .where(and(...conditions))
      .orderBy(desc(schema.transaction.postedAt), asc(schema.transaction.id))
      .limit(input.limit);

    return rows.map((row) => ({
      transaction: mapTransaction(row.transaction),
      counterpartyName: row.counterparty?.name ?? null,
      providerReference: row.transaction.providerTransactionId,
    }));
  }

  async listInboxMatchCandidatesForTransaction(input: {
    teamId: string;
    transaction: Transaction;
    limit: number;
  }): Promise<InboxItem[]> {
    const postedAt = new Date(input.transaction.postedAt);
    const hasPostedAt = !Number.isNaN(postedAt.getTime());
    const amountMinor = Math.abs(input.transaction.money.amountMinor);
    const currency = input.transaction.money.currency.toUpperCase();
    const baseCurrency = input.transaction.baseMoney?.currency.toUpperCase();
    const baseAmountMinor =
      input.transaction.baseMoney && Number.isSafeInteger(input.transaction.baseMoney.amountMinor)
        ? Math.abs(input.transaction.baseMoney.amountMinor)
        : null;
    const hasBaseMoneyEvidence = Boolean(baseCurrency && baseAmountMinor != null);
    const rows = await this.client
      .select({
        item: schema.inboxItem,
        source: schema.inboxSource,
        document: schema.businessDocument,
        version: schema.documentVersion,
        extraction: schema.documentExtraction,
      })
      .from(schema.inboxItem)
      .innerJoin(schema.inboxSource, eq(schema.inboxSource.id, schema.inboxItem.sourceId))
      .innerJoin(
        schema.businessDocument,
        eq(schema.businessDocument.id, schema.inboxItem.documentId),
      )
      .innerJoin(
        schema.documentVersion,
        eq(schema.documentVersion.id, schema.inboxItem.documentVersionId),
      )
      .innerJoin(
        schema.documentExtraction,
        and(
          eq(schema.documentExtraction.inboxItemId, schema.inboxItem.id),
          eq(schema.documentExtraction.status, "completed"),
        ),
      )
      .where(
        and(
          eq(schema.inboxItem.teamId, input.teamId),
          eq(schema.inboxItem.status, "needs_review"),
          eq(schema.inboxItem.extractionStatus, "completed"),
          hasBaseMoneyEvidence
            ? sql`(
                ${schema.documentExtraction.fields}->>'currency' is null
                or upper(${schema.documentExtraction.fields}->>'currency') = ${currency}
                or upper(${schema.documentExtraction.fields}->>'baseCurrency') = ${baseCurrency}
              )`
            : sql`(
                ${schema.documentExtraction.fields}->>'currency' is null
                or upper(${schema.documentExtraction.fields}->>'currency') = ${currency}
              )`,
          hasBaseMoneyEvidence
            ? sql`(
                ${schema.documentExtraction.fields}->>'totalAmountMinor' is null
                or abs((${schema.documentExtraction.fields}->>'totalAmountMinor')::integer) = ${amountMinor}
                or abs((${schema.documentExtraction.fields}->>'baseAmountMinor')::integer) = ${baseAmountMinor}
              )`
            : sql`(
                ${schema.documentExtraction.fields}->>'totalAmountMinor' is null
                or abs((${schema.documentExtraction.fields}->>'totalAmountMinor')::integer) = ${amountMinor}
              )`,
          hasPostedAt
            ? sql`(
                ${schema.documentExtraction.fields}->>'issuedAt' is null
                or (${schema.documentExtraction.fields}->>'issuedAt')::timestamptz
                  between ${daysFrom(postedAt, -14)} and ${daysFrom(postedAt, 14)}
              )`
            : sql`true`,
          sql`not exists (
            select 1
            from ${schema.transactionAttachment}
            where ${schema.transactionAttachment.teamId} = ${input.teamId}
              and (
                ${schema.transactionAttachment.inboxItemId} = ${schema.inboxItem.id}
                or ${schema.transactionAttachment.documentId} = ${schema.inboxItem.documentId}
              )
          )`,
          sql`not exists (
            select 1
            from ${schema.inboxMatchSuggestion}
            where ${schema.inboxMatchSuggestion.teamId} = ${input.teamId}
              and ${schema.inboxMatchSuggestion.inboxItemId} = ${schema.inboxItem.id}
              and ${schema.inboxMatchSuggestion.transactionId} = ${input.transaction.id}
              and ${schema.inboxMatchSuggestion.status} in ('suggested', 'accepted')
          )`,
        ),
      )
      .orderBy(desc(schema.inboxItem.updatedAt), desc(schema.documentExtraction.extractionVersion))
      .limit(input.limit * 3);

    const candidates = new Map<string, InboxItem>();

    for (const row of rows) {
      if (candidates.has(row.item.id)) {
        continue;
      }

      candidates.set(
        row.item.id,
        mapInboxItem(row.item, {
          source: row.source,
          document: row.document,
          version: row.version,
          latestExtraction: row.extraction,
        }),
      );

      if (candidates.size >= input.limit) {
        break;
      }
    }

    return [...candidates.values()];
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: {
      inboxItemId: string;
      transactionId: string;
      score: number;
      confidence: InboxTransactionMatchSuggestion["confidence"];
      explanation: string[];
    }[];
  }): Promise<InboxTransactionMatchSuggestion[]> {
    if (input.suggestions.length === 0) {
      return [];
    }

    await this.client
      .insert(schema.inboxMatchSuggestion)
      .values(
        input.suggestions.map((suggestion) => ({
          id: crypto.randomUUID(),
          teamId: input.teamId,
          inboxItemId: input.inboxItemId,
          transactionId: suggestion.transactionId,
          score: Math.round(suggestion.score * 1_000),
          confidence: suggestion.confidence,
          explanation: suggestion.explanation,
          status: "suggested",
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.inboxMatchSuggestion.teamId,
          schema.inboxMatchSuggestion.inboxItemId,
          schema.inboxMatchSuggestion.transactionId,
        ],
        set: {
          score: sql`excluded.score`,
          confidence: sql`excluded.confidence`,
          explanation: sql`excluded.explanation`,
          updatedAt: new Date(),
        },
        setWhere: eq(schema.inboxMatchSuggestion.status, "suggested"),
      });

    return this.listInboxMatchSuggestions(input.teamId, input.inboxItemId);
  }

  async listInboxMatchSuggestions(
    teamId: string,
    inboxItemId?: string,
  ): Promise<InboxTransactionMatchSuggestion[]> {
    const rows = await this.client
      .select({
        suggestion: schema.inboxMatchSuggestion,
        transaction: schema.transaction,
      })
      .from(schema.inboxMatchSuggestion)
      .leftJoin(
        schema.transaction,
        eq(schema.transaction.id, schema.inboxMatchSuggestion.transactionId),
      )
      .where(
        inboxItemId
          ? and(
              eq(schema.inboxMatchSuggestion.teamId, teamId),
              eq(schema.inboxMatchSuggestion.inboxItemId, inboxItemId),
            )
          : eq(schema.inboxMatchSuggestion.teamId, teamId),
      )
      .orderBy(
        desc(schema.inboxMatchSuggestion.score),
        desc(schema.inboxMatchSuggestion.updatedAt),
      );

    return rows.map((row) => mapInboxMatchSuggestion(row.suggestion, row.transaction));
  }

  async getInboxMatchSuggestionForTeam(teamId: string, suggestionId: string) {
    const [row] = await this.client
      .select({
        suggestion: schema.inboxMatchSuggestion,
        transaction: schema.transaction,
      })
      .from(schema.inboxMatchSuggestion)
      .leftJoin(
        schema.transaction,
        eq(schema.transaction.id, schema.inboxMatchSuggestion.transactionId),
      )
      .where(
        and(
          eq(schema.inboxMatchSuggestion.teamId, teamId),
          eq(schema.inboxMatchSuggestion.id, suggestionId),
        ),
      )
      .limit(1);

    return row ? mapInboxMatchSuggestion(row.suggestion, row.transaction) : null;
  }

  async acceptInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    actorId: string;
  }): Promise<{ suggestion: InboxTransactionMatchSuggestion; inboxItem: InboxItem }> {
    const suggestion = await this.getInboxMatchSuggestionForTeam(input.teamId, input.suggestionId);

    if (!suggestion) {
      throw new Error("Inbox match suggestion not found");
    }

    const item = await this.getInboxItemForTeam(input.teamId, suggestion.inboxItemId);

    if (!item) {
      throw new Error("Inbox item not found");
    }

    await this.client
      .insert(schema.transactionAttachment)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        transactionId: suggestion.transactionId,
        documentId: item.documentId,
        inboxItemId: item.id,
        createdByActorId: input.actorId,
      })
      .onConflictDoNothing();

    if (item.latestExtraction?.fields.merchantName && suggestion.transaction?.description) {
      await this.client
        .insert(schema.teamAlias)
        .values({
          id: crypto.randomUUID(),
          teamId: input.teamId,
          source: item.latestExtraction.fields.merchantName,
          target: suggestion.transaction.description,
          createdByActorId: input.actorId,
        })
        .onConflictDoNothing();
    }

    const [accepted] = await this.client
      .update(schema.inboxMatchSuggestion)
      .set({
        status: "accepted",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inboxMatchSuggestion.teamId, input.teamId),
          eq(schema.inboxMatchSuggestion.id, input.suggestionId),
        ),
      )
      .returning();

    if (!accepted) {
      throw new Error("Inbox match suggestion was not accepted");
    }

    const [updatedItem] = await this.client
      .update(schema.inboxItem)
      .set({
        status: "resolved",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inboxItem.teamId, input.teamId),
          eq(schema.inboxItem.id, suggestion.inboxItemId),
        ),
      )
      .returning();

    if (!updatedItem) {
      throw new Error("Inbox item was not resolved");
    }

    const [hydratedSuggestion, hydratedItem] = await Promise.all([
      this.getInboxMatchSuggestionForTeam(input.teamId, input.suggestionId),
      this.getInboxItemForTeam(input.teamId, suggestion.inboxItemId),
    ]);

    return {
      suggestion: hydratedSuggestion ?? mapInboxMatchSuggestion(accepted, null),
      inboxItem: hydratedItem ?? mapInboxItem(updatedItem),
    };
  }

  async rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
    actorId: string;
  }): Promise<InboxTransactionMatchSuggestion> {
    const suggestion = await this.getInboxMatchSuggestionForTeam(input.teamId, input.suggestionId);

    if (!suggestion) {
      throw new Error("Inbox match suggestion not found");
    }

    if (suggestion.status === "accepted") {
      await this.client
        .delete(schema.transactionAttachment)
        .where(
          and(
            eq(schema.transactionAttachment.teamId, input.teamId),
            eq(schema.transactionAttachment.inboxItemId, suggestion.inboxItemId),
            eq(schema.transactionAttachment.transactionId, suggestion.transactionId),
          ),
        );
      await this.client
        .update(schema.inboxItem)
        .set({
          status: "needs_review",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.inboxItem.teamId, input.teamId),
            eq(schema.inboxItem.id, suggestion.inboxItemId),
          ),
        );
    }

    await this.client
      .insert(schema.hardNegativeMatch)
      .values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        inboxItemId: suggestion.inboxItemId,
        transactionId: suggestion.transactionId,
        reason: input.reason ?? null,
        createdByActorId: input.actorId,
      })
      .onConflictDoNothing();

    const [rejected] = await this.client
      .update(schema.inboxMatchSuggestion)
      .set({
        status: "rejected",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inboxMatchSuggestion.teamId, input.teamId),
          eq(schema.inboxMatchSuggestion.id, input.suggestionId),
        ),
      )
      .returning();

    if (!rejected) {
      throw new Error("Inbox match suggestion was not rejected");
    }

    return (
      (await this.getInboxMatchSuggestionForTeam(input.teamId, input.suggestionId)) ??
      mapInboxMatchSuggestion(rejected, null)
    );
  }

  async listCustomers(teamId: string): Promise<Customer[]> {
    const customers = await this.client
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.teamId, teamId))
      .orderBy(desc(schema.customer.updatedAt));

    return customers.map(mapCustomer);
  }

  async listCustomerContacts(teamId: string): Promise<CustomerContact[]> {
    const contacts = await this.client
      .select()
      .from(schema.customerContact)
      .where(eq(schema.customerContact.teamId, teamId))
      .orderBy(asc(schema.customerContact.name));

    return contacts.map(mapCustomerContact);
  }

  async listProducts(teamId: string): Promise<Product[]> {
    const products = await this.client
      .select()
      .from(schema.product)
      .where(eq(schema.product.teamId, teamId))
      .orderBy(asc(schema.product.name));

    return products.map(mapProduct);
  }

  async listInvoices(teamId: string): Promise<InvoiceDraft[]> {
    const [invoices, lines] = await Promise.all([
      this.client
        .select()
        .from(schema.invoice)
        .where(eq(schema.invoice.teamId, teamId))
        .orderBy(desc(schema.invoice.updatedAt)),
      this.client.select().from(schema.invoiceLine).where(eq(schema.invoiceLine.teamId, teamId)),
    ]);

    return invoices.map((invoice) =>
      mapInvoiceDraft(
        invoice,
        lines
          .filter((line) => line.invoiceId === invoice.id)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      ),
    );
  }

  async listDraftInvoices(teamId: string): Promise<InvoiceDraft[]> {
    const [invoices, lines] = await Promise.all([
      this.client
        .select()
        .from(schema.invoice)
        .where(and(eq(schema.invoice.teamId, teamId), eq(schema.invoice.status, "draft")))
        .orderBy(desc(schema.invoice.updatedAt)),
      this.client.select().from(schema.invoiceLine).where(eq(schema.invoiceLine.teamId, teamId)),
    ]);

    return invoices.map((invoice) =>
      mapInvoiceDraft(
        invoice,
        lines
          .filter((line) => line.invoiceId === invoice.id)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      ),
    );
  }

  async listInvoicePayments(teamId: string): Promise<InvoicePayment[]> {
    const payments = await this.client
      .select()
      .from(schema.invoicePayment)
      .where(eq(schema.invoicePayment.teamId, teamId))
      .orderBy(desc(schema.invoicePayment.paidAt));

    return payments.map(mapInvoicePayment);
  }

  async listRecurringInvoiceSchedules(teamId: string): Promise<RecurringInvoiceSchedule[]> {
    const schedules = await this.client
      .select()
      .from(schema.recurringInvoice)
      .where(eq(schema.recurringInvoice.teamId, teamId))
      .orderBy(asc(schema.recurringInvoice.nextRunAt));

    return schedules.map(mapRecurringInvoiceSchedule);
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const [customer] = await this.client
      .select()
      .from(schema.customer)
      .where(and(eq(schema.customer.teamId, teamId), eq(schema.customer.id, customerId)))
      .limit(1);

    return customer ? mapCustomer(customer) : null;
  }

  async getCustomerContactForCustomer(teamId: string, customerId: string) {
    const [contact] = await this.client
      .select()
      .from(schema.customerContact)
      .where(
        and(
          eq(schema.customerContact.teamId, teamId),
          eq(schema.customerContact.customerId, customerId),
        ),
      )
      .orderBy(asc(schema.customerContact.createdAt))
      .limit(1);

    return contact ? mapCustomerContact(contact) : null;
  }

  async getProductForTeam(teamId: string, productId: string) {
    const [product] = await this.client
      .select()
      .from(schema.product)
      .where(and(eq(schema.product.teamId, teamId), eq(schema.product.id, productId)))
      .limit(1);

    return product ? mapProduct(product) : null;
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    const [invoice] = await this.client
      .select()
      .from(schema.invoice)
      .where(and(eq(schema.invoice.teamId, teamId), eq(schema.invoice.id, invoiceId)))
      .limit(1);

    if (!invoice) {
      return null;
    }

    const lines = await this.client
      .select()
      .from(schema.invoiceLine)
      .where(eq(schema.invoiceLine.invoiceId, invoice.id))
      .orderBy(asc(schema.invoiceLine.sortOrder));

    return mapInvoiceDraft(invoice, lines);
  }

  async getRecurringInvoiceScheduleForTeam(teamId: string, scheduleId: string) {
    const [schedule] = await this.client
      .select()
      .from(schema.recurringInvoice)
      .where(
        and(eq(schema.recurringInvoice.teamId, teamId), eq(schema.recurringInvoice.id, scheduleId)),
      )
      .limit(1);

    return schedule ? mapRecurringInvoiceSchedule(schedule) : null;
  }

  async createCustomer(input: {
    customerId: string;
    contactId?: string | null;
    teamId: string;
    name: string;
    email?: string | null;
    billingAddress?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactRole?: string | null;
    createdByActorId: string;
  }): Promise<{ customer: Customer; contact?: CustomerContact | null }> {
    const [customer] = await this.client
      .insert(schema.customer)
      .values({
        id: input.customerId,
        teamId: input.teamId,
        name: input.name,
        email: input.email ?? null,
        billingAddress: input.billingAddress ?? null,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!customer) {
      throw new Error("Customer was not created");
    }

    let contact: typeof schema.customerContact.$inferSelect | null = null;

    if (input.contactId && input.contactName && input.contactEmail) {
      const [createdContact] = await this.client
        .insert(schema.customerContact)
        .values({
          id: input.contactId,
          teamId: input.teamId,
          customerId: input.customerId,
          name: input.contactName,
          email: input.contactEmail,
          role: input.contactRole ?? null,
          createdByActorId: input.createdByActorId,
        })
        .returning();
      contact = createdContact ?? null;
    }

    return {
      customer: mapCustomer(customer),
      contact: contact ? mapCustomerContact(contact) : null,
    };
  }

  async createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: Product["type"];
    description?: string | null;
    unitPrice: Product["unitPrice"];
    defaultTaxRateBasisPoints: number;
    createdByActorId: string;
  }): Promise<Product> {
    const [product] = await this.client
      .insert(schema.product)
      .values({
        id: input.productId,
        teamId: input.teamId,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        unitPriceMinor: input.unitPrice.amountMinor,
        currency: input.unitPrice.currency,
        defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!product) {
      throw new Error("Product was not created");
    }

    return mapProduct(product);
  }

  async createDraftInvoice(input: {
    invoiceId: string;
    teamId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
    createdByActorId: string;
  }): Promise<InvoiceDraft> {
    const calculated = calculateInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });
    const [invoice] = await this.client
      .insert(schema.invoice)
      .values({
        id: input.invoiceId,
        teamId: input.teamId,
        customerId: input.customerId,
        invoiceNumber: input.invoiceNumber,
        status: "draft",
        issueDate: new Date(input.issueDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        currency: input.currency,
        discountBasisPoints: input.discountBasisPoints,
        subtotalMinor: calculated.totals.subtotal.amountMinor,
        discountMinor: calculated.totals.discount.amountMinor,
        taxMinor: calculated.totals.tax.amountMinor,
        totalMinor: calculated.totals.total.amountMinor,
        notes: input.notes ?? null,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!invoice) {
      throw new Error("Invoice was not created");
    }

    await this.insertInvoiceLines({
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      lines: input.lines,
      calculatedLines: calculated.lines,
    });

    return (
      (await this.getInvoiceForTeam(input.teamId, input.invoiceId)) ?? mapInvoiceDraft(invoice, [])
    );
  }

  async updateDraftInvoice(input: {
    teamId: string;
    invoiceId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
  }): Promise<InvoiceDraft> {
    const calculated = calculateInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });
    const [invoice] = await this.client
      .update(schema.invoice)
      .set({
        customerId: input.customerId,
        invoiceNumber: input.invoiceNumber,
        issueDate: new Date(input.issueDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        currency: input.currency,
        discountBasisPoints: input.discountBasisPoints,
        subtotalMinor: calculated.totals.subtotal.amountMinor,
        discountMinor: calculated.totals.discount.amountMinor,
        taxMinor: calculated.totals.tax.amountMinor,
        totalMinor: calculated.totals.total.amountMinor,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.invoice.teamId, input.teamId),
          eq(schema.invoice.id, input.invoiceId),
          eq(schema.invoice.status, "draft"),
        ),
      )
      .returning();

    if (!invoice) {
      throw new Error("Invoice draft was not updated");
    }

    await this.client
      .delete(schema.invoiceLine)
      .where(eq(schema.invoiceLine.invoiceId, input.invoiceId));
    await this.insertInvoiceLines({
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      lines: input.lines,
      calculatedLines: calculated.lines,
    });

    return (
      (await this.getInvoiceForTeam(input.teamId, input.invoiceId)) ?? mapInvoiceDraft(invoice, [])
    );
  }

  async markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }): Promise<InvoiceDraft> {
    const [invoice] = await this.client
      .update(schema.invoice)
      .set({
        status: "sent",
        sentAt: new Date(input.sentAt),
        deliveryToEmail: input.toEmail,
        deliveryProviderMessageId: input.providerMessageId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.invoice.teamId, input.teamId), eq(schema.invoice.id, input.invoiceId)))
      .returning();

    if (!invoice) {
      throw new Error("Invoice was not sent");
    }

    return (
      (await this.getInvoiceForTeam(input.teamId, input.invoiceId)) ?? mapInvoiceDraft(invoice, [])
    );
  }

  async recordInvoicePayment(input: {
    paymentId: string;
    teamId: string;
    invoiceId: string;
    amount: InvoicePayment["amount"];
    paidAt: string;
    method?: string | null;
    note?: string | null;
    createdByActorId: string;
    nextInvoiceStatus: InvoiceDraft["status"];
    nextAmountPaid: InvoicePayment["amount"];
    invoicePaidAt?: string | null;
  }): Promise<{ invoice: InvoiceDraft; payment: InvoicePayment }> {
    const [payment] = await this.client
      .insert(schema.invoicePayment)
      .values({
        id: input.paymentId,
        teamId: input.teamId,
        invoiceId: input.invoiceId,
        amountMinor: input.amount.amountMinor,
        currency: input.amount.currency,
        paidAt: new Date(input.paidAt),
        method: input.method ?? null,
        note: input.note ?? null,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!payment) {
      throw new Error("Invoice payment was not recorded");
    }

    const [invoice] = await this.client
      .update(schema.invoice)
      .set({
        status: input.nextInvoiceStatus,
        amountPaidMinor: input.nextAmountPaid.amountMinor,
        paidAt: input.invoicePaidAt ? new Date(input.invoicePaidAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.invoice.teamId, input.teamId), eq(schema.invoice.id, input.invoiceId)))
      .returning();

    if (!invoice) {
      throw new Error("Invoice payment did not update invoice");
    }

    return {
      invoice:
        (await this.getInvoiceForTeam(input.teamId, input.invoiceId)) ??
        mapInvoiceDraft(invoice, []),
      payment: mapInvoicePayment(payment),
    };
  }

  async createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: InvoiceEvent["type"];
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<InvoiceEvent> {
    const [event] = await this.client
      .insert(schema.invoiceEvent)
      .values({
        id: input.eventId,
        teamId: input.teamId,
        invoiceId: input.invoiceId,
        type: input.type,
        occurredAt: new Date(input.occurredAt),
        actorId: input.actorId ?? null,
        metadata: input.metadata,
      })
      .returning();

    if (!event) {
      throw new Error("Invoice event was not created");
    }

    return mapInvoiceEvent(event);
  }

  async createRecurringInvoiceSchedule(input: {
    scheduleId: string;
    teamId: string;
    sourceInvoiceId: string;
    customerId: string;
    frequency: RecurringInvoiceSchedule["frequency"];
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<RecurringInvoiceSchedule> {
    const [schedule] = await this.client
      .insert(schema.recurringInvoice)
      .values({
        id: input.scheduleId,
        teamId: input.teamId,
        sourceInvoiceId: input.sourceInvoiceId,
        customerId: input.customerId,
        frequency: input.frequency,
        nextRunAt: new Date(input.nextRunAt),
        status: "active",
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!schedule) {
      throw new Error("Recurring invoice schedule was not created");
    }

    return mapRecurringInvoiceSchedule(schedule);
  }

  async generateRecurringInvoice(input: {
    invoiceId: string;
    teamId: string;
    scheduleId: string;
    sourceInvoice: InvoiceDraft;
    runAt: string;
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<{ invoice: InvoiceDraft; schedule: RecurringInvoiceSchedule }> {
    const recurringSuffix = new Date(input.runAt).toISOString().slice(0, 10).replaceAll("-", "");
    const invoice = await this.createDraftInvoice({
      invoiceId: input.invoiceId,
      teamId: input.teamId,
      customerId: input.sourceInvoice.customerId,
      invoiceNumber: `${input.sourceInvoice.invoiceNumber}-R${recurringSuffix}`,
      issueDate: input.runAt,
      dueDate: input.sourceInvoice.dueDate
        ? new Date(
            new Date(input.runAt).getTime() +
              (new Date(input.sourceInvoice.dueDate).getTime() -
                new Date(input.sourceInvoice.issueDate).getTime()),
          ).toISOString()
        : null,
      currency: input.sourceInvoice.currency,
      discountBasisPoints: input.sourceInvoice.discountBasisPoints,
      notes: input.sourceInvoice.notes,
      lines: input.sourceInvoice.lines,
      createdByActorId: input.createdByActorId,
    });
    const [schedule] = await this.client
      .update(schema.recurringInvoice)
      .set({
        nextRunAt: new Date(input.nextRunAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.recurringInvoice.teamId, input.teamId),
          eq(schema.recurringInvoice.id, input.scheduleId),
        ),
      )
      .returning();

    if (!schedule) {
      throw new Error("Recurring invoice schedule was not updated");
    }

    return { invoice, schedule: mapRecurringInvoiceSchedule(schedule) };
  }

  async listProjects(teamId: string): Promise<Project[]> {
    const projects = await this.client
      .select()
      .from(schema.project)
      .where(eq(schema.project.teamId, teamId))
      .orderBy(desc(schema.project.updatedAt));

    return projects.map(mapProject);
  }

  async listProjectsForSync(input: { teamId: string; cursor?: string | null }) {
    const conditions = [eq(schema.project.teamId, input.teamId)];

    if (input.cursor) {
      conditions.push(gt(schema.project.updatedAt, new Date(input.cursor)));
    }

    const projects = await this.client
      .select()
      .from(schema.project)
      .where(and(...conditions))
      .orderBy(asc(schema.project.updatedAt));

    return projects.map(mapProject);
  }

  async listProjectMembers(teamId: string): Promise<ProjectMember[]> {
    const members = await this.client
      .select()
      .from(schema.projectMember)
      .where(eq(schema.projectMember.teamId, teamId))
      .orderBy(asc(schema.projectMember.createdAt));

    return members.map(mapProjectMember);
  }

  async listTimeEntries(teamId: string): Promise<TimeEntry[]> {
    const entries = await this.client
      .select()
      .from(schema.timeEntry)
      .where(eq(schema.timeEntry.teamId, teamId))
      .orderBy(desc(schema.timeEntry.occurredOn), desc(schema.timeEntry.createdAt));

    return entries.map(mapTimeEntry);
  }

  async getProjectForTeam(teamId: string, projectId: string): Promise<Project | null> {
    const [project] = await this.client
      .select()
      .from(schema.project)
      .where(and(eq(schema.project.teamId, teamId), eq(schema.project.id, projectId)))
      .limit(1);

    return project ? mapProject(project) : null;
  }

  async getTimeEntriesForTeam(teamId: string, timeEntryIds: string[]): Promise<TimeEntry[]> {
    if (timeEntryIds.length === 0) {
      return [];
    }

    const entries = await this.client
      .select()
      .from(schema.timeEntry)
      .where(and(eq(schema.timeEntry.teamId, teamId), inArray(schema.timeEntry.id, timeEntryIds)));

    return entries.map(mapTimeEntry);
  }

  async createProject(input: {
    projectId: string;
    memberId: string;
    teamId: string;
    customerId: string;
    name: string;
    description?: string | null;
    billableRate: Project["billableRate"];
    createdByActorId: string;
  }): Promise<{ project: Project; member: ProjectMember }> {
    const [project] = await this.client
      .insert(schema.project)
      .values({
        id: input.projectId,
        teamId: input.teamId,
        customerId: input.customerId,
        name: input.name,
        description: input.description ?? null,
        status: "active",
        billableRateMinor: input.billableRate.amountMinor,
        currency: input.billableRate.currency,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!project) {
      throw new Error("Project was not created");
    }

    const [member] = await this.client
      .insert(schema.projectMember)
      .values({
        id: input.memberId,
        teamId: input.teamId,
        projectId: input.projectId,
        actorId: input.createdByActorId,
        role: "manager",
        billableRateMinor: input.billableRate.amountMinor,
        currency: input.billableRate.currency,
      })
      .returning();

    if (!member) {
      throw new Error("Project member was not created");
    }

    return { project: mapProject(project), member: mapProjectMember(member) };
  }

  async createTimeEntry(input: {
    timeEntryId: string;
    teamId: string;
    projectId: string;
    actorId: string;
    description: string;
    occurredOn: string;
    durationMinutes: number;
    billableStatus: TimeEntry["billableStatus"];
    billableRate?: TimeEntry["billableRate"];
  }): Promise<TimeEntry> {
    const [entry] = await this.client
      .insert(schema.timeEntry)
      .values({
        id: input.timeEntryId,
        teamId: input.teamId,
        projectId: input.projectId,
        actorId: input.actorId,
        description: input.description,
        occurredOn: new Date(input.occurredOn),
        durationMinutes: input.durationMinutes,
        billableStatus: input.billableStatus,
        billableRateMinor: input.billableRate?.amountMinor ?? null,
        currency: input.billableRate?.currency ?? null,
        invoiceId: null,
      })
      .returning();

    if (!entry) {
      throw new Error("Time entry was not created");
    }

    return mapTimeEntry(entry);
  }

  async markTimeEntriesInvoiced(input: {
    teamId: string;
    timeEntryIds: string[];
    invoiceId: string;
  }): Promise<TimeEntry[]> {
    if (input.timeEntryIds.length === 0) {
      return [];
    }

    const entries = await this.client
      .update(schema.timeEntry)
      .set({
        billableStatus: "invoiced",
        invoiceId: input.invoiceId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.timeEntry.teamId, input.teamId),
          inArray(schema.timeEntry.id, input.timeEntryIds),
        ),
      )
      .returning();

    return entries.map(mapTimeEntry);
  }

  async listBusinessInsights(input: {
    teamId: string;
    from?: string | null;
    to?: string | null;
  }): Promise<BusinessInsight[]> {
    const filters = [eq(schema.businessInsight.teamId, input.teamId)];

    if (input.from) {
      filters.push(gte(schema.businessInsight.periodEnd, new Date(input.from)));
    }

    if (input.to) {
      filters.push(lte(schema.businessInsight.periodStart, new Date(input.to)));
    }

    const insights = await this.client
      .select()
      .from(schema.businessInsight)
      .where(and(...filters))
      .orderBy(desc(schema.businessInsight.createdAt));

    return insights.map(mapBusinessInsight);
  }

  async createBusinessInsights(input: {
    teamId: string;
    periodStart: string;
    periodEnd: string;
    insights: Array<{
      insightId: string;
      title: string;
      summary: string;
      severity: BusinessInsight["severity"];
      sourceRefs: ReportSourceRef[];
      createdAt: string;
    }>;
  }): Promise<BusinessInsight[]> {
    if (input.insights.length === 0) {
      return [];
    }

    const insights = await this.client
      .insert(schema.businessInsight)
      .values(
        input.insights.map((insight) => ({
          id: insight.insightId,
          teamId: input.teamId,
          title: insight.title,
          summary: insight.summary,
          severity: insight.severity,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          sourceRefs: insight.sourceRefs,
          createdAt: new Date(insight.createdAt),
        })),
      )
      .returning();

    return insights.map(mapBusinessInsight);
  }

  async listAssistantThreads(teamId: string): Promise<AssistantThread[]> {
    const threads = await this.client
      .select()
      .from(schema.assistantThread)
      .where(eq(schema.assistantThread.teamId, teamId))
      .orderBy(desc(schema.assistantThread.updatedAt));

    return threads.map(mapAssistantThread);
  }

  async getAssistantThreadForTeam(
    teamId: string,
    threadId: string,
  ): Promise<AssistantThread | null> {
    const [thread] = await this.client
      .select()
      .from(schema.assistantThread)
      .where(
        and(eq(schema.assistantThread.teamId, teamId), eq(schema.assistantThread.id, threadId)),
      )
      .limit(1);

    return thread ? mapAssistantThread(thread) : null;
  }

  async listAssistantMessages(threadId: string): Promise<AssistantMessage[]> {
    const messages = await this.client
      .select()
      .from(schema.assistantMessage)
      .where(eq(schema.assistantMessage.threadId, threadId))
      .orderBy(asc(schema.assistantMessage.createdAt));

    return messages.map(mapAssistantMessage);
  }

  async listAssistantToolCalls(threadId: string): Promise<AssistantToolCall[]> {
    const toolCalls = await this.client
      .select()
      .from(schema.assistantToolCall)
      .where(eq(schema.assistantToolCall.threadId, threadId))
      .orderBy(asc(schema.assistantToolCall.createdAt));

    return toolCalls.map(mapAssistantToolCall);
  }

  async createAssistantThread(input: {
    threadId: string;
    teamId: string;
    title: string;
    createdByActorId: string;
    createdAt: string;
  }): Promise<AssistantThread> {
    const [thread] = await this.client
      .insert(schema.assistantThread)
      .values({
        id: input.threadId,
        teamId: input.teamId,
        title: input.title,
        createdByActorId: input.createdByActorId,
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.createdAt),
      })
      .returning();

    if (!thread) {
      throw new Error("Failed to create assistant thread");
    }

    return mapAssistantThread(thread);
  }

  async createAssistantMessage(input: {
    messageId: string;
    threadId: string;
    teamId: string;
    role: AssistantMessage["role"];
    content: string;
    sourceRefs: ReportSourceRef[];
    createdAt: string;
  }): Promise<AssistantMessage> {
    const createdAt = new Date(input.createdAt);
    const [message] = await this.client
      .insert(schema.assistantMessage)
      .values({
        id: input.messageId,
        threadId: input.threadId,
        teamId: input.teamId,
        role: input.role,
        content: input.content,
        sourceRefs: input.sourceRefs,
        createdAt,
      })
      .returning();

    await this.client
      .update(schema.assistantThread)
      .set({ updatedAt: createdAt })
      .where(
        and(
          eq(schema.assistantThread.teamId, input.teamId),
          eq(schema.assistantThread.id, input.threadId),
        ),
      );

    if (!message) {
      throw new Error("Failed to create assistant message");
    }

    return mapAssistantMessage(message);
  }

  async createAssistantToolCalls(input: {
    toolCalls: Array<{
      toolCallId: string;
      threadId: string;
      messageId: string;
      teamId: string;
      toolName: string;
      risk: AssistantToolCall["risk"];
      status: AssistantToolCall["status"];
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      sourceRefs: ReportSourceRef[];
      createdAt: string;
    }>;
  }): Promise<AssistantToolCall[]> {
    if (input.toolCalls.length === 0) {
      return [];
    }

    const toolCalls = await this.client
      .insert(schema.assistantToolCall)
      .values(
        input.toolCalls.map((toolCall) => ({
          id: toolCall.toolCallId,
          threadId: toolCall.threadId,
          messageId: toolCall.messageId,
          teamId: toolCall.teamId,
          toolName: toolCall.toolName,
          risk: toolCall.risk,
          status: toolCall.status,
          input: toolCall.input,
          output: toolCall.output,
          sourceRefs: toolCall.sourceRefs,
          createdAt: new Date(toolCall.createdAt),
        })),
      )
      .returning();

    return toolCalls.map(mapAssistantToolCall);
  }

  async listPendingAssistantActionApprovals(teamId: string): Promise<AssistantActionApproval[]> {
    const approvals = await this.client
      .select()
      .from(schema.assistantActionApproval)
      .where(
        and(
          eq(schema.assistantActionApproval.teamId, teamId),
          eq(schema.assistantActionApproval.status, "pending"),
        ),
      )
      .orderBy(desc(schema.assistantActionApproval.createdAt));

    return approvals.map(mapAssistantActionApproval);
  }

  async listAssistantActionApprovals(threadId: string): Promise<AssistantActionApproval[]> {
    const approvals = await this.client
      .select()
      .from(schema.assistantActionApproval)
      .where(eq(schema.assistantActionApproval.threadId, threadId))
      .orderBy(asc(schema.assistantActionApproval.createdAt));

    return approvals.map(mapAssistantActionApproval);
  }

  async getAssistantActionApprovalForTeam(
    teamId: string,
    approvalId: string,
  ): Promise<AssistantActionApproval | null> {
    const [approval] = await this.client
      .select()
      .from(schema.assistantActionApproval)
      .where(
        and(
          eq(schema.assistantActionApproval.teamId, teamId),
          eq(schema.assistantActionApproval.id, approvalId),
        ),
      )
      .limit(1);

    return approval ? mapAssistantActionApproval(approval) : null;
  }

  async createAssistantActionApproval(input: {
    approvalId: string;
    threadId: string;
    requestedByMessageId: string;
    teamId: string;
    toolName: string;
    risk: AssistantActionApproval["risk"];
    input: Record<string, unknown>;
    preview: Record<string, unknown>;
    sourceRefs: ReportSourceRef[];
    requestedByActorId: string;
    createdAt: string;
  }): Promise<AssistantActionApproval> {
    const [approval] = await this.client
      .insert(schema.assistantActionApproval)
      .values({
        id: input.approvalId,
        threadId: input.threadId,
        requestedByMessageId: input.requestedByMessageId,
        teamId: input.teamId,
        toolName: input.toolName,
        risk: input.risk,
        status: "pending",
        input: input.input,
        preview: input.preview,
        sourceRefs: input.sourceRefs,
        requestedByActorId: input.requestedByActorId,
        createdAt: new Date(input.createdAt),
      })
      .returning();

    if (!approval) {
      throw new Error("Failed to create assistant action approval");
    }

    return mapAssistantActionApproval(approval);
  }

  async markAssistantActionApprovalRejected(input: {
    teamId: string;
    approvalId: string;
    rejectedByActorId: string;
    decidedAt: string;
    reason?: string | null;
  }): Promise<AssistantActionApproval> {
    const [approval] = await this.client
      .update(schema.assistantActionApproval)
      .set({
        status: "rejected",
        rejectedByActorId: input.rejectedByActorId,
        rejectionReason: input.reason ?? null,
        decidedAt: new Date(input.decidedAt),
      })
      .where(
        and(
          eq(schema.assistantActionApproval.teamId, input.teamId),
          eq(schema.assistantActionApproval.id, input.approvalId),
          eq(schema.assistantActionApproval.status, "pending"),
        ),
      )
      .returning();

    if (!approval) {
      throw new Error("Failed to reject assistant action approval");
    }

    return mapAssistantActionApproval(approval);
  }

  async markAssistantActionApprovalExecuted(input: {
    teamId: string;
    approvalId: string;
    approvedByActorId: string;
    result: Record<string, unknown>;
    decidedAt: string;
    executedAt: string;
  }): Promise<AssistantActionApproval> {
    const [approval] = await this.client
      .update(schema.assistantActionApproval)
      .set({
        status: "executed",
        approvedByActorId: input.approvedByActorId,
        result: input.result,
        decidedAt: new Date(input.decidedAt),
        executedAt: new Date(input.executedAt),
      })
      .where(
        and(
          eq(schema.assistantActionApproval.teamId, input.teamId),
          eq(schema.assistantActionApproval.id, input.approvalId),
          eq(schema.assistantActionApproval.status, "pending"),
        ),
      )
      .returning();

    if (!approval) {
      throw new Error("Failed to execute assistant action approval");
    }

    return mapAssistantActionApproval(approval);
  }

  async listAutomationRules(teamId: string): Promise<AutomationRule[]> {
    const rules = await this.client
      .select()
      .from(schema.automationRule)
      .where(eq(schema.automationRule.teamId, teamId))
      .orderBy(desc(schema.automationRule.createdAt));

    return rules.map(mapAutomationRule);
  }

  async listAutomationRuns(teamId: string, limit: number): Promise<AutomationRun[]> {
    const runs = await this.client
      .select()
      .from(schema.automationRun)
      .where(eq(schema.automationRun.teamId, teamId))
      .orderBy(desc(schema.automationRun.startedAt))
      .limit(limit);

    return runs.map(mapAutomationRun);
  }

  async listEnabledAutomationRulesForEvent(input: {
    teamId: string;
    eventType: string;
  }): Promise<AutomationRule[]> {
    const rules = await this.client
      .select()
      .from(schema.automationRule)
      .where(
        and(
          eq(schema.automationRule.teamId, input.teamId),
          eq(schema.automationRule.enabled, true),
          eq(schema.automationRule.triggerEventType, input.eventType),
        ),
      )
      .orderBy(asc(schema.automationRule.createdAt));

    return rules.map(mapAutomationRule);
  }

  async getOutboxEventForTeam(teamId: string, outboxEventId: string): Promise<OutboxEvent | null> {
    const [event] = await this.client
      .select()
      .from(schema.outboxEvent)
      .where(and(eq(schema.outboxEvent.teamId, teamId), eq(schema.outboxEvent.id, outboxEventId)))
      .limit(1);

    return event ? mapOutboxEvent(event) : null;
  }

  async createAutomationRule(input: {
    ruleId: string;
    teamId: string;
    name: string;
    trigger: AutomationRule["trigger"];
    actionType: AutomationRule["actionType"];
    actionConfig: Record<string, unknown>;
    approvalPolicy: AutomationRule["approvalPolicy"];
    createdByActorId: string;
  }): Promise<AutomationRule> {
    const [rule] = await this.client
      .insert(schema.automationRule)
      .values({
        id: input.ruleId,
        teamId: input.teamId,
        name: input.name,
        enabled: true,
        triggerType: input.trigger.type,
        triggerEventType: input.trigger.eventType,
        actionType: input.actionType,
        actionConfig: input.actionConfig,
        approvalPolicy: input.approvalPolicy,
        createdByActorId: input.createdByActorId,
      })
      .returning();

    if (!rule) {
      throw new Error("Failed to create automation rule");
    }

    return mapAutomationRule(rule);
  }

  async createAutomationRun(input: {
    runId: string;
    teamId: string;
    ruleId: string;
    sourceOutboxEventId: string;
    status: AutomationRun["status"];
    actionType: AutomationRule["actionType"];
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    error?: string | null;
    startedAt: string;
    finishedAt?: string | null;
  }): Promise<AutomationRun> {
    const [run] = await this.client
      .insert(schema.automationRun)
      .values({
        id: input.runId,
        teamId: input.teamId,
        ruleId: input.ruleId,
        sourceOutboxEventId: input.sourceOutboxEventId,
        status: input.status,
        actionType: input.actionType,
        input: input.input,
        output: input.output,
        error: input.error ?? null,
        startedAt: new Date(input.startedAt),
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : null,
      })
      .returning();

    if (!run) {
      throw new Error("Failed to create automation run");
    }

    return mapAutomationRun(run);
  }

  async listApiKeys(teamId: string): Promise<ApiKey[]> {
    return developerPersistence.listApiKeys(this.client, teamId);
  }

  async listOAuthApps(teamId: string): Promise<OAuthApp[]> {
    return developerPersistence.listOAuthApps(this.client, teamId);
  }

  async listOAuthGrants(teamId: string): Promise<OAuthGrant[]> {
    return developerPersistence.listOAuthGrants(this.client, teamId);
  }

  async listWebhookSubscriptions(teamId: string): Promise<WebhookSubscription[]> {
    return developerPersistence.listWebhookSubscriptions(this.client, teamId);
  }

  async listWebhookDeliveries(teamId: string, limit: number): Promise<WebhookDelivery[]> {
    return developerPersistence.listWebhookDeliveries(this.client, teamId, limit);
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    return developerPersistence.getApiKeyByHash(this.client, keyHash);
  }

  async getOAuthAppForTeam(teamId: string, appId: string): Promise<OAuthApp | null> {
    return developerPersistence.getOAuthAppForTeam(this.client, teamId, appId);
  }

  async markApiKeyUsed(input: { apiKeyId: string; lastUsedAt: string }): Promise<void> {
    return developerPersistence.markApiKeyUsed(this.client, input);
  }

  async createApiKey(input: {
    apiKeyId: string;
    teamId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKey["scopes"];
    createdByActorId: string;
  }): Promise<ApiKey> {
    return developerPersistence.createApiKey(this.client, input);
  }

  async createOAuthApp(input: {
    appId: string;
    teamId: string;
    name: string;
    redirectUris: string[];
    scopes: OAuthApp["scopes"];
    createdByActorId: string;
  }): Promise<OAuthApp> {
    return developerPersistence.createOAuthApp(this.client, input);
  }

  async createOAuthGrant(input: {
    grantId: string;
    teamId: string;
    appId: string;
    actorId: string;
    scopes: OAuthGrant["scopes"];
  }): Promise<OAuthGrant> {
    return developerPersistence.createOAuthGrant(this.client, input);
  }

  async createWebhookSubscription(input: {
    subscriptionId: string;
    teamId: string;
    url: string;
    eventTypes: string[];
    signingSecretHash: string;
    createdByActorId: string;
  }): Promise<WebhookSubscription> {
    return developerPersistence.createWebhookSubscription(this.client, input);
  }

  async listActiveWebhookSubscriptionsForEvent(input: {
    teamId: string;
    eventType: string;
  }): Promise<WebhookSubscription[]> {
    return developerPersistence.listActiveWebhookSubscriptionsForEvent(this.client, input);
  }

  async createWebhookDelivery(input: {
    deliveryId: string;
    teamId: string;
    subscriptionId: string;
    outboxEventId: string;
    status: WebhookDelivery["status"];
    attempt: number;
    requestPayload: Record<string, unknown>;
    responseStatus?: number | null;
    responseBody?: string | null;
    error?: string | null;
    nextAttemptAt?: string | null;
    deliveredAt?: string | null;
  }): Promise<WebhookDelivery> {
    return developerPersistence.createWebhookDelivery(this.client, input);
  }

  private async insertInvoiceLines(input: {
    teamId: string;
    invoiceId: string;
    lines: InvoiceLineDraft[];
    calculatedLines: ReturnType<typeof calculateInvoiceTotals>["lines"];
  }) {
    await this.client.insert(schema.invoiceLine).values(
      input.lines.map((line, index) => ({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        invoiceId: input.invoiceId,
        productId: line.productId ?? null,
        description: line.description,
        quantityMilli: line.quantityMilli,
        unitPriceMinor: line.unitPrice.amountMinor,
        currency: line.unitPrice.currency,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
        subtotalMinor: input.calculatedLines[index]?.subtotal.amountMinor ?? 0,
        discountMinor: input.calculatedLines[index]?.discount.amountMinor ?? 0,
        taxMinor: input.calculatedLines[index]?.tax.amountMinor ?? 0,
        totalMinor: input.calculatedLines[index]?.total.amountMinor ?? 0,
        sortOrder: index,
      })),
    );
  }

  private async nextDocumentExtractionVersion(inboxItemId: string) {
    const [latest] = await this.client
      .select({ extractionVersion: schema.documentExtraction.extractionVersion })
      .from(schema.documentExtraction)
      .where(eq(schema.documentExtraction.inboxItemId, inboxItemId))
      .orderBy(desc(schema.documentExtraction.extractionVersion))
      .limit(1);

    return (latest?.extractionVersion ?? 0) + 1;
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
        baseAmountMinor: input.draft.baseMoney?.amountMinor ?? null,
        baseCurrency: input.draft.baseMoney?.currency ?? null,
        type: input.draft.type,
        source: input.draft.source,
        counterpartyId: input.draft.counterpartyId ?? null,
        transferGroupId: input.draft.transferGroupId ?? null,
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

  async listAuditEvents(input: {
    teamId: string;
    limit: number;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
  }): Promise<AuditLogEntry[]> {
    const filters = [eq(schema.auditLog.teamId, input.teamId)];

    if (input.action) {
      filters.push(eq(schema.auditLog.action, input.action));
    }

    if (input.entityType) {
      filters.push(eq(schema.auditLog.entityType, input.entityType));
    }

    if (input.entityId) {
      filters.push(eq(schema.auditLog.entityId, input.entityId));
    }

    if (input.requestId) {
      filters.push(eq(schema.auditLog.requestId, input.requestId));
    }

    const events = await this.client
      .select()
      .from(schema.auditLog)
      .where(and(...filters))
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(input.limit);

    return events.map(mapAuditLogEntry);
  }

  async listOutboxEvents(teamId: string, limit: number): Promise<OutboxEvent[]> {
    const events = await this.client
      .select()
      .from(schema.outboxEvent)
      .where(eq(schema.outboxEvent.teamId, teamId))
      .orderBy(desc(schema.outboxEvent.occurredAt))
      .limit(limit);

    return events.map(mapOutboxEvent);
  }

  async listJobRuns(teamId: string, limit: number): Promise<JobRun[]> {
    const runs = await this.client
      .select()
      .from(schema.jobRun)
      .where(eq(schema.jobRun.teamId, teamId))
      .orderBy(desc(schema.jobRun.createdAt))
      .limit(limit);

    return runs.map(mapJobRun);
  }

  async listProviderSyncRuns(teamId: string, limit: number): Promise<ProviderSyncRun[]> {
    const runs = await this.client
      .select()
      .from(schema.providerSyncRun)
      .where(eq(schema.providerSyncRun.teamId, teamId))
      .orderBy(desc(schema.providerSyncRun.startedAt))
      .limit(limit);

    return runs.map(mapProviderSyncRun);
  }

  async listIntegrationSyncRuns(teamId: string, limit: number): Promise<IntegrationSyncRun[]> {
    const runs = await this.client
      .select()
      .from(schema.integrationSyncRun)
      .where(eq(schema.integrationSyncRun.teamId, teamId))
      .orderBy(desc(schema.integrationSyncRun.startedAt))
      .limit(limit);

    return runs.map(integrationPersistence.mapIntegrationSyncRun);
  }

  async listDispatchableOutboxEvents(input: { limit: number; now: Date }): Promise<OutboxEvent[]> {
    const events = await this.client
      .select()
      .from(schema.outboxEvent)
      .where(
        or(
          and(
            inArray(schema.outboxEvent.status, ["pending", "failed"]),
            or(
              isNull(schema.outboxEvent.nextAttemptAt),
              lte(schema.outboxEvent.nextAttemptAt, input.now),
            ),
          ),
          and(
            eq(schema.outboxEvent.status, "dispatching"),
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
    leaseExpiresAt: Date;
  }): Promise<OutboxEvent | null> {
    const [event] = await this.client
      .update(schema.outboxEvent)
      .set({
        status: "dispatching",
        dispatchAttempts: sql`${schema.outboxEvent.dispatchAttempts} + 1`,
        lastError: null,
        nextAttemptAt: input.leaseExpiresAt,
      })
      .where(
        and(
          eq(schema.outboxEvent.id, input.outboxEventId),
          or(
            and(
              inArray(schema.outboxEvent.status, ["pending", "failed"]),
              or(
                isNull(schema.outboxEvent.nextAttemptAt),
                lte(schema.outboxEvent.nextAttemptAt, input.now),
              ),
            ),
            and(
              eq(schema.outboxEvent.status, "dispatching"),
              lte(schema.outboxEvent.nextAttemptAt, input.now),
            ),
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

function mapCounterparty(counterparty: typeof schema.counterparty.$inferSelect): Counterparty {
  return {
    id: counterparty.id,
    teamId: counterparty.teamId,
    name: counterparty.name,
  };
}

function mapTransactionTag(tag: typeof schema.transactionTag.$inferSelect): TransactionTag {
  return {
    id: tag.id,
    teamId: tag.teamId,
    name: tag.name,
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

function mapBankConnection(connection: typeof schema.bankConnection.$inferSelect): BankConnection {
  return {
    id: connection.id,
    teamId: connection.teamId,
    provider: connection.provider as BankConnection["provider"],
    providerConnectionId: connection.providerConnectionId,
    institutionName: connection.institutionName,
    status: connection.status as BankConnection["status"],
    tokenKeyId: connection.tokenKeyId,
    tokenLastFour: connection.tokenLastFour,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function mapBankAccount(account: typeof schema.bankAccount.$inferSelect): BankAccount {
  return {
    id: account.id,
    teamId: account.teamId,
    connectionId: account.connectionId,
    ledgerAccountId: account.ledgerAccountId,
    providerAccountId: account.providerAccountId,
    name: account.name,
    currency: account.currency,
    type: account.type as BankAccount["type"],
    currentBalance: {
      amountMinor: account.currentBalanceMinor,
      currency: account.currency,
    },
    status: account.status as BankAccount["status"],
  };
}

function parseCandidateDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFrom(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function mapBusinessDocument(
  document: typeof schema.businessDocument.$inferSelect,
  currentVersion: typeof schema.documentVersion.$inferSelect | null,
): BusinessDocument {
  return {
    id: document.id,
    teamId: document.teamId,
    title: document.title,
    status: document.status as BusinessDocument["status"],
    currentVersionId: document.currentVersionId,
    createdByActorId: document.createdByActorId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    currentVersion: currentVersion ? mapBusinessDocumentVersion(currentVersion) : null,
  };
}

function mapBusinessDocumentVersion(
  version: typeof schema.documentVersion.$inferSelect,
): BusinessDocumentVersion {
  return {
    id: version.id,
    documentId: version.documentId,
    teamId: version.teamId,
    versionNumber: version.versionNumber,
    objectKey: version.objectKey,
    fileName: version.fileName,
    contentType: version.contentType,
    byteSize: version.byteSize,
    checksumSha256: version.checksumSha256,
    status: version.status as BusinessDocumentVersion["status"],
    uploadedAt: version.uploadedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
  };
}

function mapInboxSource(source: typeof schema.inboxSource.$inferSelect): InboxSource {
  return {
    id: source.id,
    teamId: source.teamId,
    type: source.type as InboxSource["type"],
    name: source.name,
    createdAt: source.createdAt.toISOString(),
  };
}

function mapInboxItem(
  item: typeof schema.inboxItem.$inferSelect,
  related: {
    source?: typeof schema.inboxSource.$inferSelect | null;
    document?: typeof schema.businessDocument.$inferSelect | null;
    version?: typeof schema.documentVersion.$inferSelect | null;
    latestExtraction?: typeof schema.documentExtraction.$inferSelect | null;
    matchSuggestions?: InboxTransactionMatchSuggestion[];
  } = {},
): InboxItem {
  return {
    id: item.id,
    teamId: item.teamId,
    sourceId: item.sourceId,
    sourceType: item.sourceType as InboxItem["sourceType"],
    documentId: item.documentId,
    documentVersionId: item.documentVersionId,
    status: item.status as InboxItem["status"],
    extractionStatus: item.extractionStatus as InboxItem["extractionStatus"],
    createdByActorId: item.createdByActorId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    source: related.source ? mapInboxSource(related.source) : null,
    document: related.document
      ? mapBusinessDocument(
          related.document,
          related.version?.documentId === related.document.id ? related.version : null,
        )
      : null,
    latestExtraction: related.latestExtraction
      ? mapDocumentExtraction(related.latestExtraction)
      : null,
    matchSuggestions: related.matchSuggestions ?? [],
  };
}

function mapInboxMatchSuggestion(
  suggestion: typeof schema.inboxMatchSuggestion.$inferSelect,
  transaction: typeof schema.transaction.$inferSelect | null,
): InboxTransactionMatchSuggestion {
  return {
    id: suggestion.id,
    teamId: suggestion.teamId,
    inboxItemId: suggestion.inboxItemId,
    transactionId: suggestion.transactionId,
    score: suggestion.score / 1_000,
    confidence: suggestion.confidence as InboxTransactionMatchSuggestion["confidence"],
    explanation: suggestion.explanation,
    status: suggestion.status as InboxTransactionMatchSuggestion["status"],
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
    transaction: transaction ? mapTransaction(transaction) : null,
  };
}

function mapTeamAlias(alias: typeof schema.teamAlias.$inferSelect): TeamAlias {
  return {
    id: alias.id,
    teamId: alias.teamId,
    source: alias.source,
    target: alias.target,
    createdAt: alias.createdAt.toISOString(),
  };
}

function mapHardNegativeMatch(
  match: typeof schema.hardNegativeMatch.$inferSelect,
): HardNegativeTransactionMatch {
  return {
    id: match.id,
    teamId: match.teamId,
    inboxItemId: match.inboxItemId,
    transactionId: match.transactionId,
    reason: match.reason,
    createdAt: match.createdAt.toISOString(),
  };
}

function mapCustomer(customer: typeof schema.customer.$inferSelect): Customer {
  return {
    id: customer.id,
    teamId: customer.teamId,
    name: customer.name,
    email: customer.email,
    billingAddress: customer.billingAddress,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function mapCustomerContact(contact: typeof schema.customerContact.$inferSelect): CustomerContact {
  return {
    id: contact.id,
    teamId: contact.teamId,
    customerId: contact.customerId,
    name: contact.name,
    email: contact.email,
    role: contact.role,
    createdAt: contact.createdAt.toISOString(),
  };
}

function mapProduct(product: typeof schema.product.$inferSelect): Product {
  return {
    id: product.id,
    teamId: product.teamId,
    name: product.name,
    type: product.type as Product["type"],
    description: product.description,
    unitPrice: {
      amountMinor: product.unitPriceMinor,
      currency: product.currency,
    },
    defaultTaxRateBasisPoints: product.defaultTaxRateBasisPoints,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function mapInvoiceDraft(
  invoice: typeof schema.invoice.$inferSelect,
  lines: (typeof schema.invoiceLine.$inferSelect)[],
): InvoiceDraft {
  return {
    id: invoice.id,
    teamId: invoice.teamId,
    customerId: invoice.customerId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status as InvoiceDraft["status"],
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    currency: invoice.currency,
    discountBasisPoints: invoice.discountBasisPoints,
    notes: invoice.notes,
    lines: lines.map(mapInvoiceLine),
    totals: {
      subtotal: { amountMinor: invoice.subtotalMinor, currency: invoice.currency },
      discount: { amountMinor: invoice.discountMinor, currency: invoice.currency },
      tax: { amountMinor: invoice.taxMinor, currency: invoice.currency },
      total: { amountMinor: invoice.totalMinor, currency: invoice.currency },
    },
    amountPaid: { amountMinor: invoice.amountPaidMinor, currency: invoice.currency },
    sentAt: invoice.sentAt?.toISOString() ?? null,
    viewedAt: invoice.viewedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    overdueAt: invoice.overdueAt?.toISOString() ?? null,
    voidedAt: invoice.voidedAt?.toISOString() ?? null,
    deliveryToEmail: invoice.deliveryToEmail,
    deliveryProviderMessageId: invoice.deliveryProviderMessageId,
    createdByActorId: invoice.createdByActorId,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

function mapInvoiceLine(
  line: typeof schema.invoiceLine.$inferSelect,
): InvoiceDraft["lines"][number] {
  return {
    id: line.id,
    invoiceId: line.invoiceId,
    productId: line.productId,
    description: line.description,
    quantityMilli: line.quantityMilli,
    unitPrice: {
      amountMinor: line.unitPriceMinor,
      currency: line.currency,
    },
    discountBasisPoints: line.discountBasisPoints,
    taxRateBasisPoints: line.taxRateBasisPoints,
    sortOrder: line.sortOrder,
    totals: {
      subtotal: { amountMinor: line.subtotalMinor, currency: line.currency },
      discount: { amountMinor: line.discountMinor, currency: line.currency },
      tax: { amountMinor: line.taxMinor, currency: line.currency },
      total: { amountMinor: line.totalMinor, currency: line.currency },
    },
  };
}

function mapInvoicePayment(payment: typeof schema.invoicePayment.$inferSelect): InvoicePayment {
  return {
    id: payment.id,
    teamId: payment.teamId,
    invoiceId: payment.invoiceId,
    amount: {
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    },
    paidAt: payment.paidAt.toISOString(),
    method: payment.method,
    note: payment.note,
    createdByActorId: payment.createdByActorId,
    createdAt: payment.createdAt.toISOString(),
  };
}

function mapInvoiceEvent(event: typeof schema.invoiceEvent.$inferSelect): InvoiceEvent {
  return {
    id: event.id,
    teamId: event.teamId,
    invoiceId: event.invoiceId,
    type: event.type as InvoiceEvent["type"],
    occurredAt: event.occurredAt.toISOString(),
    actorId: event.actorId,
    metadata: event.metadata,
  };
}

function mapRecurringInvoiceSchedule(
  schedule: typeof schema.recurringInvoice.$inferSelect,
): RecurringInvoiceSchedule {
  return {
    id: schedule.id,
    teamId: schedule.teamId,
    sourceInvoiceId: schedule.sourceInvoiceId,
    customerId: schedule.customerId,
    frequency: schedule.frequency as RecurringInvoiceSchedule["frequency"],
    nextRunAt: schedule.nextRunAt.toISOString(),
    status: schedule.status as RecurringInvoiceSchedule["status"],
    createdByActorId: schedule.createdByActorId,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

function mapProject(project: typeof schema.project.$inferSelect): Project {
  return {
    id: project.id,
    teamId: project.teamId,
    customerId: project.customerId,
    name: project.name,
    description: project.description,
    status: project.status as Project["status"],
    billableRate: {
      amountMinor: project.billableRateMinor,
      currency: project.currency,
    },
    createdByActorId: project.createdByActorId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function mapProjectMember(member: typeof schema.projectMember.$inferSelect): ProjectMember {
  return {
    id: member.id,
    teamId: member.teamId,
    projectId: member.projectId,
    actorId: member.actorId,
    role: member.role as ProjectMember["role"],
    billableRate:
      member.billableRateMinor !== null && member.currency
        ? {
            amountMinor: member.billableRateMinor,
            currency: member.currency,
          }
        : null,
    createdAt: member.createdAt.toISOString(),
  };
}

function mapTimeEntry(entry: typeof schema.timeEntry.$inferSelect): TimeEntry {
  return {
    id: entry.id,
    teamId: entry.teamId,
    projectId: entry.projectId,
    actorId: entry.actorId,
    description: entry.description,
    occurredOn: entry.occurredOn.toISOString(),
    durationMinutes: entry.durationMinutes,
    billableStatus: entry.billableStatus as TimeEntry["billableStatus"],
    billableRate:
      entry.billableRateMinor !== null && entry.currency
        ? {
            amountMinor: entry.billableRateMinor,
            currency: entry.currency,
          }
        : null,
    invoiceId: entry.invoiceId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function mapBusinessInsight(insight: typeof schema.businessInsight.$inferSelect): BusinessInsight {
  return {
    id: insight.id,
    teamId: insight.teamId,
    title: insight.title,
    summary: insight.summary,
    severity: insight.severity as BusinessInsight["severity"],
    periodStart: insight.periodStart.toISOString(),
    periodEnd: insight.periodEnd.toISOString(),
    sourceRefs: insight.sourceRefs as ReportSourceRef[],
    createdAt: insight.createdAt.toISOString(),
  };
}

function mapAssistantThread(thread: typeof schema.assistantThread.$inferSelect): AssistantThread {
  return {
    id: thread.id,
    teamId: thread.teamId,
    title: thread.title,
    createdByActorId: thread.createdByActorId,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function mapAssistantMessage(
  message: typeof schema.assistantMessage.$inferSelect,
): AssistantMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    teamId: message.teamId,
    role: message.role as AssistantMessage["role"],
    content: message.content,
    sourceRefs: message.sourceRefs as ReportSourceRef[],
    createdAt: message.createdAt.toISOString(),
  };
}

function mapAssistantToolCall(
  toolCall: typeof schema.assistantToolCall.$inferSelect,
): AssistantToolCall {
  return {
    id: toolCall.id,
    threadId: toolCall.threadId,
    messageId: toolCall.messageId,
    teamId: toolCall.teamId,
    toolName: toolCall.toolName,
    risk: toolCall.risk as AssistantToolCall["risk"],
    status: toolCall.status as AssistantToolCall["status"],
    input: toolCall.input,
    output: toolCall.output,
    sourceRefs: toolCall.sourceRefs as ReportSourceRef[],
    createdAt: toolCall.createdAt.toISOString(),
  };
}

function mapAssistantActionApproval(
  approval: typeof schema.assistantActionApproval.$inferSelect,
): AssistantActionApproval {
  return {
    id: approval.id,
    threadId: approval.threadId,
    requestedByMessageId: approval.requestedByMessageId,
    teamId: approval.teamId,
    toolName: approval.toolName,
    risk: approval.risk as AssistantActionApproval["risk"],
    status: approval.status as AssistantActionApproval["status"],
    input: approval.input,
    preview: approval.preview,
    result: approval.result,
    sourceRefs: approval.sourceRefs as ReportSourceRef[],
    requestedByActorId: approval.requestedByActorId,
    approvedByActorId: approval.approvedByActorId,
    rejectedByActorId: approval.rejectedByActorId,
    createdAt: approval.createdAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    executedAt: approval.executedAt?.toISOString() ?? null,
  };
}

function mapAutomationRule(rule: typeof schema.automationRule.$inferSelect): AutomationRule {
  return {
    id: rule.id,
    teamId: rule.teamId,
    name: rule.name,
    enabled: rule.enabled,
    trigger: {
      type: rule.triggerType as AutomationRule["trigger"]["type"],
      eventType: rule.triggerEventType,
    },
    actionType: rule.actionType as AutomationRule["actionType"],
    actionConfig: rule.actionConfig,
    approvalPolicy: rule.approvalPolicy as AutomationRule["approvalPolicy"],
    createdByActorId: rule.createdByActorId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function mapAutomationRun(run: typeof schema.automationRun.$inferSelect): AutomationRun {
  return {
    id: run.id,
    teamId: run.teamId,
    ruleId: run.ruleId,
    sourceOutboxEventId: run.sourceOutboxEventId,
    status: run.status as AutomationRun["status"],
    actionType: run.actionType as AutomationRun["actionType"],
    input: run.input,
    output: run.output,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

function mapDocumentExtraction(
  extraction: typeof schema.documentExtraction.$inferSelect,
): DocumentExtraction {
  return {
    id: extraction.id,
    teamId: extraction.teamId,
    inboxItemId: extraction.inboxItemId,
    documentId: extraction.documentId,
    documentVersionId: extraction.documentVersionId,
    extractionVersion: extraction.extractionVersion,
    source: extraction.source as DocumentExtraction["source"],
    status: extraction.status as DocumentExtraction["status"],
    fields: extraction.fields as DocumentExtractionFields,
    confidence: extraction.confidence as DocumentExtractionConfidence,
    rawText: extraction.rawText,
    error: extraction.error,
    createdByActorId: extraction.createdByActorId,
    createdAt: extraction.createdAt.toISOString(),
  };
}

function latestExtractionForItem(
  extractions: (typeof schema.documentExtraction.$inferSelect)[],
  inboxItemId: string,
) {
  return (
    extractions
      .filter((extraction) => extraction.inboxItemId === inboxItemId)
      .sort((left, right) => right.extractionVersion - left.extractionVersion)[0] ?? null
  );
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
    baseMoney:
      transaction.baseAmountMinor != null && transaction.baseCurrency
        ? {
            amountMinor: transaction.baseAmountMinor,
            currency: transaction.baseCurrency,
          }
        : null,
    type: transaction.type as Transaction["type"],
    source: transaction.source as Transaction["source"],
    counterpartyId: transaction.counterpartyId,
    transferGroupId: transaction.transferGroupId,
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

function mapAuditLogEntry(event: typeof schema.auditLog.$inferSelect): AuditLogEntry {
  return {
    id: event.id,
    teamId: event.teamId,
    actorId: event.actorId,
    requestId: event.requestId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
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

function mapProviderSyncRun(syncRun: typeof schema.providerSyncRun.$inferSelect): ProviderSyncRun {
  return {
    id: syncRun.id,
    teamId: syncRun.teamId,
    connectionId: syncRun.connectionId,
    status: syncRun.status as ProviderSyncRun["status"],
    startedAt: syncRun.startedAt.toISOString(),
    completedAt: syncRun.completedAt?.toISOString() ?? null,
    accountsSynced: syncRun.accountsSynced,
    transactionsImported: syncRun.transactionsImported,
    duplicateCount: syncRun.duplicateCount,
    error: syncRun.error,
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
