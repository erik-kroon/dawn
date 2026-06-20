import type {
  AccountantPacketExportRecord,
  AccountantPacketManifest,
  ActorTeam,
  AccountantPacketTransactionRow,
  AuditLogEntry,
  BankAccount,
  BankConnection,
  BankConnectionSummary,
  BusinessDocument,
  BusinessDocumentVersion,
  CsvTransactionImportMapping,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionAttempt,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  DocumentExtractionSource,
  HardNegativeTransactionMatch,
  IdempotencyResult,
  InboxItem,
  InboxTransactionMatchSuggestion,
  InboxSource,
  InboxSourceType,
  IntegrationConnectionSecrets,
  JobRun,
  MatchFeedback,
  OutboxDispatchRepository,
  OutboxEvent,
  ProviderObjectRecord,
  ProviderSyncRun,
  ReviewWorkspaceData,
  TeamAlias,
  TransactionImportSession,
} from "@dawn/app";
import type {
  Account,
  AccountContactSummary,
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
  Contact,
  CommercialDocument,
  CommercialDocumentLine,
  CommercialDocumentLineDraft,
  CommercialDocumentVersion,
  CommercialDocumentVersionSnapshot,
  CommercialDocumentWithLines,
  CrmFieldSecurityPolicy,
  CrmFieldDefinition,
  CrmObjectTypeDefinition,
  CrmOptionSet,
  CrmOptionValue,
  CrmRecord,
  CrmRecordFieldValue,
  CrmRecordFieldValueDraft,
  CrmRecordGrant,
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
  LegalEntity,
  OAuthApp,
  OAuthGrant,
  Opportunity,
  Organization,
  Party,
  PartyType,
  Person,
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
  TransactionAccountantStatus,
  TransactionTag,
  WebhookDelivery,
  WebhookSubscription,
  InboxMatchCandidate,
  InboxMatchSuggestion,
} from "@dawn/domain";
import {
  calculateCommercialDocumentTotals,
  calculateInvoiceTotals,
  deriveTransactionAccountantStatus,
  ledgerDuplicateKey,
} from "@dawn/domain";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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
    const attachmentCounts = await this.transactionAttachmentCounts(
      teamId,
      transactions.map((transaction) => transaction.id),
    );

    return {
      teamId,
      teamName: team?.name ?? "Workspace",
      categories: categories.map(mapCategory),
      transactions: transactions.map((transaction) =>
        mapTransaction(transaction, attachmentCounts.get(transaction.id) ?? 0),
      ),
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

    if (!transaction) {
      return null;
    }

    return mapTransaction(
      transaction,
      await this.countTransactionAttachmentsForTeam({ teamId, transactionId }),
    );
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

  async countTransactionAttachmentsForTeam(input: {
    teamId: string;
    transactionId: string;
  }): Promise<number> {
    const counts = await this.transactionAttachmentCounts(input.teamId, [input.transactionId]);

    return counts.get(input.transactionId) ?? 0;
  }

  private async transactionAttachmentCounts(teamId: string, transactionIds: readonly string[]) {
    if (transactionIds.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.client
      .select({
        transactionId: schema.transactionAttachment.transactionId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.transactionAttachment)
      .where(
        and(
          eq(schema.transactionAttachment.teamId, teamId),
          inArray(schema.transactionAttachment.transactionId, [...transactionIds]),
        ),
      )
      .groupBy(schema.transactionAttachment.transactionId);

    return new Map(rows.map((row) => [row.transactionId, Number(row.count)]));
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
    provider: string;
    providerObjectType: string;
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

  async getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }): Promise<ProviderObjectRecord | null> {
    const [object] = await this.client
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

    return object
      ? {
          id: object.id,
          teamId: object.teamId,
          provider: object.provider,
          providerObjectType: object.providerObjectType,
          providerObjectId: object.providerObjectId,
          internalEntityType: object.internalEntityType,
          internalEntityId: object.internalEntityId,
          rawPayload: object.rawPayload,
        }
      : null;
  }

  async listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }): Promise<ProviderObjectRecord[]> {
    if (input.providerObjectTypes.length === 0) {
      return [];
    }

    const objects = await this.client
      .select()
      .from(schema.providerObject)
      .where(
        and(
          eq(schema.providerObject.teamId, input.teamId),
          eq(schema.providerObject.provider, input.provider),
          inArray(schema.providerObject.providerObjectType, [...input.providerObjectTypes]),
        ),
      )
      .orderBy(
        asc(schema.providerObject.providerObjectType),
        asc(schema.providerObject.providerObjectId),
      );

    return objects.map((object) => ({
      id: object.id,
      teamId: object.teamId,
      provider: object.provider,
      providerObjectType: object.providerObjectType,
      providerObjectId: object.providerObjectId,
      internalEntityType: object.internalEntityType,
      internalEntityId: object.internalEntityId,
      rawPayload: object.rawPayload,
    }));
  }

  async listIntegrationConnectionSummaries(teamId: string) {
    return integrationPersistence.listIntegrationConnectionSummaries(this.client, teamId);
  }

  async listIntegrationConnectionsForTeam(teamId: string): Promise<IntegrationConnection[]> {
    const connections = await this.client
      .select()
      .from(schema.integrationConnection)
      .where(eq(schema.integrationConnection.teamId, teamId))
      .orderBy(desc(schema.integrationConnection.createdAt));

    return connections.map(integrationPersistence.mapIntegrationConnection);
  }

  async listEmailInboxSyncCandidateConnections(): Promise<IntegrationConnection[]> {
    const connections = await this.client
      .select()
      .from(schema.integrationConnection)
      .where(
        and(
          eq(schema.integrationConnection.category, "email"),
          eq(schema.integrationConnection.status, "connected"),
          inArray(schema.integrationConnection.provider, ["gmail", "mock-email-inbox"]),
        ),
      )
      .orderBy(asc(schema.integrationConnection.lastSyncAt));

    return connections.map(integrationPersistence.mapIntegrationConnection);
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

  async getIntegrationConnectionSecretsForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnectionSecrets | null> {
    const [connection] = await this.client
      .select()
      .from(schema.integrationConnection)
      .where(
        and(
          eq(schema.integrationConnection.teamId, teamId),
          eq(schema.integrationConnection.id, connectionId),
        ),
      )
      .limit(1);

    return connection
      ? {
          token: {
            encryptedToken: connection.tokenCiphertext,
            keyId: connection.tokenKeyId,
            lastFour: connection.tokenLastFour,
          },
          rawPayload: connection.rawPayload,
        }
      : null;
  }

  async updateIntegrationConnectionTokenAndRawPayload(input: {
    connectionId: string;
    token?: IntegrationConnectionSecrets["token"] | null;
    rawPayload: Record<string, unknown>;
    status?: IntegrationConnection["status"];
    lastError?: string | null;
    lastSyncAt?: Date | null;
  }): Promise<IntegrationConnection> {
    const update: Partial<typeof schema.integrationConnection.$inferInsert> = {
      rawPayload: input.rawPayload,
      updatedAt: new Date(),
    };

    if (input.token) {
      update.tokenCiphertext = input.token.encryptedToken;
      update.tokenKeyId = input.token.keyId;
      update.tokenLastFour = input.token.lastFour;
    }

    if (input.status) {
      update.status = input.status;
    }

    if (input.lastError !== undefined) {
      update.lastError = input.lastError;
    }

    if (input.lastSyncAt !== undefined) {
      update.lastSyncAt = input.lastSyncAt;
    }

    const [connection] = await this.client
      .update(schema.integrationConnection)
      .set(update)
      .where(eq(schema.integrationConnection.id, input.connectionId))
      .returning();

    if (!connection) {
      throw new Error("Integration connection was not updated");
    }

    return integrationPersistence.mapIntegrationConnection(connection);
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

  async createEmailInboxSyncRunIfIdle(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }): Promise<IntegrationSyncRun | null> {
    return integrationPersistence.createIntegrationSyncRunIfIdle(this.client, input);
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
    sourceType?: InboxSourceType;
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
        sourceType: input.sourceType ?? "document_upload",
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

  async createDocumentExtractionAttempt(input: {
    attemptId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    extractionId?: string | null;
    attemptNumber: number;
    source: Exclude<DocumentExtractionSource, "user_correction">;
    provider?: string | null;
    model?: string | null;
    status: DocumentExtractionAttempt["status"];
    durationMs?: number | null;
    qualityScore?: number | null;
    errorClass?: string | null;
    errorMessage?: string | null;
    rawTextPresent: boolean;
    metadata: Record<string, unknown>;
  }): Promise<DocumentExtractionAttempt> {
    const [attempt] = await this.client
      .insert(schema.documentExtractionAttempt)
      .values({
        id: input.attemptId,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        extractionId: input.extractionId ?? null,
        attemptNumber: input.attemptNumber,
        source: input.source,
        provider: input.provider ?? null,
        model: input.model ?? null,
        status: input.status,
        durationMs: input.durationMs ?? null,
        qualityScore: encodeScore(input.qualityScore),
        errorClass: input.errorClass ?? null,
        errorMessage: input.errorMessage ?? null,
        rawTextPresent: input.rawTextPresent,
        metadata: input.metadata,
      })
      .returning();

    if (!attempt) {
      throw new Error("Document extraction attempt was not created");
    }

    return mapDocumentExtractionAttempt(attempt);
  }

  async listDocumentExtractionAttemptsForInboxItem(
    teamId: string,
    inboxItemId: string,
  ): Promise<DocumentExtractionAttempt[]> {
    const attempts = await this.client
      .select()
      .from(schema.documentExtractionAttempt)
      .where(
        and(
          eq(schema.documentExtractionAttempt.teamId, teamId),
          eq(schema.documentExtractionAttempt.inboxItemId, inboxItemId),
        ),
      )
      .orderBy(
        asc(schema.documentExtractionAttempt.attemptNumber),
        asc(schema.documentExtractionAttempt.createdAt),
      );

    return attempts.map(mapDocumentExtractionAttempt);
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
        status: "needs_review",
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

  async markDocumentExtractionPending(input: {
    teamId: string;
    inboxItemId: string;
    requestedAt: Date;
  }) {
    const [item] = await this.client
      .update(schema.inboxItem)
      .set({
        status: "pending_extraction",
        extractionStatus: "pending",
        updatedAt: input.requestedAt,
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

  async dismissInboxItem(input: { teamId: string; inboxItemId: string; dismissedAt: Date }) {
    const [item] = await this.client
      .update(schema.inboxItem)
      .set({
        status: "dismissed",
        updatedAt: input.dismissedAt,
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
    const signalConditions: SQL[] = [];
    const issuedAt = parseCandidateDate(extraction.fields.issuedAt);

    if (extraction.fields.totalAmountMinor != null) {
      const amountMinor = Math.abs(extraction.fields.totalAmountMinor);
      const amountTolerance = Math.max(1, Math.ceil(amountMinor * 0.25));

      signalConditions.push(
        currency
          ? sql`(
              ${schema.transaction.currency} = ${currency}
              and abs(abs(${schema.transaction.amountMinor}) - ${amountMinor}) <= ${amountTolerance}
            )`
          : sql`abs(abs(${schema.transaction.amountMinor}) - ${amountMinor}) <= ${amountTolerance}`,
      );

      if (currency && issuedAt && amountMinor > 0 && !hasBaseMoneyEvidence) {
        signalConditions.push(
          transactionCrossCurrencyAmountCandidateCondition({
            currency,
            amountMinor,
          }),
        );
      }
    }

    if (hasBaseMoneyEvidence) {
      const baseTolerance = Math.max(50, Math.ceil((baseAmountMinor ?? 0) * 0.15));

      signalConditions.push(sql`
        ${schema.transaction.baseCurrency} = ${baseCurrency}
        and abs(abs(${schema.transaction.baseAmountMinor}) - ${baseAmountMinor}) <= ${baseTolerance}
      `);
    }

    for (const term of normalizedSearchTerms(
      extraction.fields.merchantName,
      extraction.fields.invoiceNumber,
    )) {
      signalConditions.push(transactionTextIncludesTerm(term));
    }

    if (signalConditions.length === 0) {
      return [];
    }

    conditions.push(or(...signalConditions) ?? sql`false`);

    if (issuedAt) {
      const window = matchCandidateDateWindow(extraction.fields.documentType);

      conditions.push(gte(schema.transaction.postedAt, daysFrom(issuedAt, window.beforeDays)));
      conditions.push(lte(schema.transaction.postedAt, daysFrom(issuedAt, window.afterDays)));
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
    const signalConditions: SQL[] = [];
    const amountTolerance = Math.max(1, Math.ceil(amountMinor * 0.25));

    signalConditions.push(sql`
      (
        ${schema.documentExtraction.fields}->>'totalAmountMinor' is not null
        and ${schema.documentExtraction.fields}->>'totalAmountMinor' ~ '^-?[0-9]+$'
        and (
          ${schema.documentExtraction.fields}->>'currency' is null
          or upper(${schema.documentExtraction.fields}->>'currency') = ${currency}
        )
        and abs(abs((${schema.documentExtraction.fields}->>'totalAmountMinor')::numeric) - ${amountMinor}) <= ${amountTolerance}
      )
    `);

    if (amountMinor > 0) {
      signalConditions.push(
        extractionCrossCurrencyAmountCandidateCondition({
          currency,
          amountMinor,
        }),
      );
    }

    if (hasBaseMoneyEvidence) {
      const baseTolerance = Math.max(50, Math.ceil((baseAmountMinor ?? 0) * 0.15));

      signalConditions.push(sql`
        (
          upper(${schema.documentExtraction.fields}->>'baseCurrency') = ${baseCurrency}
          and ${schema.documentExtraction.fields}->>'baseAmountMinor' is not null
          and ${schema.documentExtraction.fields}->>'baseAmountMinor' ~ '^-?[0-9]+$'
          and abs(abs((${schema.documentExtraction.fields}->>'baseAmountMinor')::numeric) - ${baseAmountMinor}) <= ${baseTolerance}
        )
      `);
    }

    for (const term of normalizedSearchTerms(
      input.transaction.description,
      input.transaction.providerTransactionId,
    )) {
      signalConditions.push(extractionTextIncludesTerm(term));
    }

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
          hasPostedAt
            ? sql`(
                ${schema.documentExtraction.fields}->>'issuedAt' is null
                or (${schema.documentExtraction.fields}->>'issuedAt')::timestamptz
                  between
                    case
                      when ${schema.documentExtraction.fields}->>'documentType' in ('invoice_received', 'invoice_sent')
                        then ${timestamptzParam(daysFrom(postedAt, -123))}
                      else ${timestamptzParam(daysFrom(postedAt, -30))}
                    end
                    and
                    case
                      when ${schema.documentExtraction.fields}->>'documentType' in ('invoice_received', 'invoice_sent')
                        then ${timestamptzParam(daysFrom(postedAt, 90))}
                      else ${timestamptzParam(daysFrom(postedAt, 90))}
                    end
              )`
            : sql`true`,
          or(...signalConditions) ?? sql`false`,
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
    suggestions: InboxMatchSuggestion[];
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
          signalScores: suggestion.signals,
          signalDetails: suggestion.signalDetails,
          thresholds: suggestion.thresholds,
          calibration: suggestion.calibration ?? null,
          matchType: suggestion.matchType,
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
          signalScores: sql`excluded.signal_scores`,
          signalDetails: sql`excluded.signal_details`,
          thresholds: sql`excluded.thresholds`,
          calibration: sql`excluded.calibration`,
          matchType: sql`excluded.match_type`,
          status: "suggested",
          updatedAt: new Date(),
        },
        setWhere: inArray(schema.inboxMatchSuggestion.status, ["suggested", "expired"]),
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
        and(
          eq(schema.inboxMatchSuggestion.teamId, teamId),
          ne(schema.inboxMatchSuggestion.status, "expired"),
          inboxItemId ? eq(schema.inboxMatchSuggestion.inboxItemId, inboxItemId) : undefined,
        ),
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

    if (suggestion.status !== "suggested") {
      throw new Error("Inbox match suggestion is not suggestable");
    }

    if (item.status === "resolved") {
      throw new Error("Inbox item is already resolved");
    }

    const [existingAttachment] = await this.client
      .select()
      .from(schema.transactionAttachment)
      .where(
        and(
          eq(schema.transactionAttachment.teamId, input.teamId),
          or(
            eq(schema.transactionAttachment.documentId, item.documentId),
            eq(schema.transactionAttachment.inboxItemId, item.id),
          ),
        ),
      )
      .limit(1);

    if (existingAttachment) {
      throw new Error("Document is already attached to a transaction");
    }

    await this.client.insert(schema.transactionAttachment).values({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      transactionId: suggestion.transactionId,
      documentId: item.documentId,
      inboxItemId: item.id,
      createdByActorId: input.actorId,
    });

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
          eq(schema.inboxMatchSuggestion.status, "suggested"),
        ),
      )
      .returning();

    if (!accepted) {
      throw new Error("Inbox match suggestion was not accepted");
    }

    await this.client
      .update(schema.inboxMatchSuggestion)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.inboxMatchSuggestion.teamId, input.teamId),
          eq(schema.inboxMatchSuggestion.inboxItemId, suggestion.inboxItemId),
          eq(schema.inboxMatchSuggestion.status, "suggested"),
        ),
      );

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
    const attachmentCounts = await this.transactionAttachmentCounts(
      input.teamId,
      transactions.map((transaction) => transaction.id),
    );

    return transactions.map((transaction) =>
      mapTransaction(transaction, attachmentCounts.get(transaction.id) ?? 0),
    );
  }

  async createAccountantPacketExportRecord(
    input: AccountantPacketExportRecord,
  ): Promise<AccountantPacketExportRecord> {
    const [record] = await this.client
      .insert(schema.accountantPacketExport)
      .values({
        id: input.packetId,
        teamId: input.teamId,
        actorId: input.actorId,
        objectKey: input.objectKey,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        status: input.status,
        revokedAt: input.revokedAt ? new Date(input.revokedAt) : null,
        revokedByActorId: input.revokedByActorId,
        revokeReason: input.revokeReason,
        manifest: input.manifest,
        createdAt: new Date(input.createdAt),
      })
      .onConflictDoUpdate({
        target: schema.accountantPacketExport.id,
        set: {
          actorId: input.actorId,
          objectKey: input.objectKey,
          fileName: input.fileName,
          contentType: input.contentType,
          byteSize: input.byteSize,
          status: input.status,
          revokedAt: input.revokedAt ? new Date(input.revokedAt) : null,
          revokedByActorId: input.revokedByActorId,
          revokeReason: input.revokeReason,
          manifest: input.manifest,
        },
      })
      .returning();

    if (!record) {
      throw new Error("Accountant packet export record was not created");
    }

    return mapAccountantPacketExportRecord(record);
  }

  async getAccountantPacketExportForTeam(teamId: string, packetId: string) {
    const [record] = await this.client
      .select()
      .from(schema.accountantPacketExport)
      .where(
        and(
          eq(schema.accountantPacketExport.teamId, teamId),
          eq(schema.accountantPacketExport.id, packetId),
        ),
      )
      .limit(1);

    return record ? mapAccountantPacketExportRecord(record) : null;
  }

  async listAccountantPacketExports(teamId: string, limit: number) {
    const records = await this.client
      .select()
      .from(schema.accountantPacketExport)
      .where(eq(schema.accountantPacketExport.teamId, teamId))
      .orderBy(desc(schema.accountantPacketExport.createdAt))
      .limit(limit);

    return records.map(mapAccountantPacketExportRecord);
  }

  async revokeAccountantPacketExportForTeam(input: {
    teamId: string;
    packetId: string;
    revokedAt: string;
    revokedByActorId: string;
    reason?: string | null;
  }): Promise<AccountantPacketExportRecord | null> {
    const [record] = await this.client
      .update(schema.accountantPacketExport)
      .set({
        status: "revoked",
        revokedAt: new Date(input.revokedAt),
        revokedByActorId: input.revokedByActorId,
        revokeReason: input.reason ?? null,
      })
      .where(
        and(
          eq(schema.accountantPacketExport.teamId, input.teamId),
          eq(schema.accountantPacketExport.id, input.packetId),
        ),
      )
      .returning();

    return record ? mapAccountantPacketExportRecord(record) : null;
  }

  async listAccountantPacketTransactionRows(input: {
    teamId: string;
    from: string;
    to: string;
    transactionIds?: readonly string[];
  }): Promise<AccountantPacketTransactionRow[]> {
    const conditions: SQL[] = [
      eq(schema.transaction.teamId, input.teamId),
      eq(schema.transaction.reviewState, "reviewed"),
      gte(schema.transaction.postedAt, new Date(input.from)),
      lte(schema.transaction.postedAt, new Date(input.to)),
    ];
    const transactionIds = [...(input.transactionIds ?? [])];

    if (transactionIds.length > 0) {
      conditions.push(inArray(schema.transaction.id, transactionIds));
    }

    const rows = await this.client
      .select({
        transaction: schema.transaction,
        account: schema.ledgerAccount,
        category: schema.transactionCategory,
        counterparty: schema.counterparty,
      })
      .from(schema.transaction)
      .leftJoin(schema.ledgerAccount, eq(schema.ledgerAccount.id, schema.transaction.accountId))
      .leftJoin(
        schema.transactionCategory,
        eq(schema.transactionCategory.id, schema.transaction.categoryId),
      )
      .leftJoin(schema.counterparty, eq(schema.counterparty.id, schema.transaction.counterpartyId))
      .where(and(...conditions))
      .orderBy(asc(schema.transaction.postedAt), asc(schema.transaction.id));

    if (rows.length === 0) {
      return [];
    }

    const exportedTransactionIds = rows.map((row) => row.transaction.id);
    const [tagRows, attachmentRows] = await Promise.all([
      this.client
        .select({
          transactionId: schema.transactionTagAssignment.transactionId,
          tag: schema.transactionTag,
        })
        .from(schema.transactionTagAssignment)
        .innerJoin(
          schema.transactionTag,
          eq(schema.transactionTag.id, schema.transactionTagAssignment.tagId),
        )
        .where(inArray(schema.transactionTagAssignment.transactionId, exportedTransactionIds))
        .orderBy(asc(schema.transactionTag.name)),
      this.client
        .select({
          attachment: schema.transactionAttachment,
          document: schema.businessDocument,
          version: schema.documentVersion,
        })
        .from(schema.transactionAttachment)
        .innerJoin(
          schema.businessDocument,
          eq(schema.businessDocument.id, schema.transactionAttachment.documentId),
        )
        .leftJoin(
          schema.documentVersion,
          eq(schema.documentVersion.id, schema.businessDocument.currentVersionId),
        )
        .where(
          and(
            eq(schema.transactionAttachment.teamId, input.teamId),
            inArray(schema.transactionAttachment.transactionId, exportedTransactionIds),
          ),
        )
        .orderBy(asc(schema.documentVersion.fileName)),
    ]);
    const tagsByTransactionId = new Map<string, TransactionTag[]>();
    const attachmentsByTransactionId = new Map<
      string,
      AccountantPacketTransactionRow["attachments"]
    >();

    for (const row of tagRows) {
      const current = tagsByTransactionId.get(row.transactionId) ?? [];
      current.push(mapTransactionTag(row.tag));
      tagsByTransactionId.set(row.transactionId, current);
    }

    for (const row of attachmentRows) {
      if (!row.version || row.document.status !== "uploaded") {
        continue;
      }

      const current = attachmentsByTransactionId.get(row.attachment.transactionId) ?? [];
      current.push({
        transactionId: row.attachment.transactionId,
        documentId: row.attachment.documentId,
        inboxItemId: row.attachment.inboxItemId,
        versionId: row.version.id,
        objectKey: row.version.objectKey,
        fileName: row.version.fileName,
        contentType: row.version.contentType,
        byteSize: row.version.byteSize,
        title: row.document.title,
      });
      attachmentsByTransactionId.set(row.attachment.transactionId, current);
    }

    return rows.map((row) => {
      const attachments = attachmentsByTransactionId.get(row.transaction.id) ?? [];

      return {
        transaction: mapTransaction(row.transaction, attachments.length),
        account: row.account
          ? {
              id: row.account.id,
              name: row.account.name,
              currency: row.account.currency,
            }
          : null,
        category: row.category ? { id: row.category.id, name: row.category.name } : null,
        counterparty: row.counterparty
          ? { id: row.counterparty.id, name: row.counterparty.name }
          : null,
        tags: tagsByTransactionId.get(row.transaction.id) ?? [],
        attachments,
      };
    });
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
    const attachmentCounts = await this.transactionAttachmentCounts(
      input.teamId,
      transactions.map((transaction) => transaction.id),
    );

    return transactions.map((transaction) =>
      mapTransaction(transaction, attachmentCounts.get(transaction.id) ?? 0),
    );
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
    status?: TransactionImportSession["status"];
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
        status: input.status ?? "committed",
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

  async completeTransactionImportSession(input: {
    teamId: string;
    importSessionId: string;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
  }) {
    const [importSession] = await this.client
      .update(schema.transactionImportSession)
      .set({
        status: "committed",
        importedCount: input.importedCount,
        duplicateCount: input.duplicateCount,
        invalidCount: input.invalidCount,
        committedAt: new Date(),
      })
      .where(
        and(
          eq(schema.transactionImportSession.id, input.importSessionId),
          eq(schema.transactionImportSession.teamId, input.teamId),
        ),
      )
      .returning();

    if (!importSession) {
      throw new Error("Transaction import session was not found");
    }

    return mapTransactionImportSession(importSession);
  }

  async failTransactionImportSession(input: { teamId: string; importSessionId: string }) {
    const [importSession] = await this.client
      .update(schema.transactionImportSession)
      .set({
        status: "failed",
      })
      .where(
        and(
          eq(schema.transactionImportSession.id, input.importSessionId),
          eq(schema.transactionImportSession.teamId, input.teamId),
        ),
      )
      .returning();

    if (!importSession) {
      throw new Error("Transaction import session was not found");
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

  async updateTransactionAccountantStatusForTeam(input: {
    teamId: string;
    transactionId: string;
    accountantStatus: TransactionAccountantStatus;
    reason?: string | null;
  }) {
    const [transaction] = await this.client
      .update(schema.transaction)
      .set({
        accountantStatus: input.accountantStatus,
        accountantStatusReason: input.reason ?? null,
        accountantStatusUpdatedAt: new Date(),
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
      throw new Error("Transaction accountant status was not updated");
    }

    return mapTransaction(
      transaction,
      await this.countTransactionAttachmentsForTeam({
        teamId: input.teamId,
        transactionId: input.transactionId,
      }),
    );
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
    metadata?: Record<string, string>;
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

    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        filters.push(sql`${schema.auditLog.metadata}->>${key} = ${value}`);
      }
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

  async getCrmRecordForTeam(teamId: string, recordId: string): Promise<CrmRecord | null> {
    const [record] = await this.client
      .select()
      .from(schema.crmRecord)
      .where(and(eq(schema.crmRecord.teamId, teamId), eq(schema.crmRecord.id, recordId)))
      .limit(1);

    return record ? mapCrmRecord(record) : null;
  }

  async listCrmRecordGrantsForPrincipal(input: {
    teamId: string;
    recordId: string;
    principalId: string;
  }): Promise<CrmRecordGrant[]> {
    const grants = await this.client
      .select()
      .from(schema.crmRecordGrant)
      .where(
        and(
          eq(schema.crmRecordGrant.teamId, input.teamId),
          eq(schema.crmRecordGrant.recordId, input.recordId),
          eq(schema.crmRecordGrant.principalId, input.principalId),
        ),
      );

    return grants.map(mapCrmRecordGrant);
  }

  async listCrmFieldSecurityPolicies(input: {
    teamId: string;
    objectTypeId: string;
    recordId: string | null;
    principalId: string;
  }): Promise<CrmFieldSecurityPolicy[]> {
    const policies = await this.client
      .select()
      .from(schema.crmFieldSecurityPolicy)
      .where(
        and(
          eq(schema.crmFieldSecurityPolicy.teamId, input.teamId),
          eq(schema.crmFieldSecurityPolicy.objectTypeId, input.objectTypeId),
          input.recordId
            ? or(
                isNull(schema.crmFieldSecurityPolicy.targetRecordId),
                eq(schema.crmFieldSecurityPolicy.targetRecordId, input.recordId),
              )
            : isNull(schema.crmFieldSecurityPolicy.targetRecordId),
          or(
            isNull(schema.crmFieldSecurityPolicy.principalId),
            eq(schema.crmFieldSecurityPolicy.principalId, input.principalId),
          ),
        ),
      );

    return policies.map(mapCrmFieldSecurityPolicy);
  }

  async getOrganizationForTeam(teamId: string, recordId: string): Promise<Organization | null> {
    const [organization] = await this.client
      .select()
      .from(schema.crmOrganization)
      .where(
        and(
          eq(schema.crmOrganization.teamId, teamId),
          eq(schema.crmOrganization.recordId, recordId),
        ),
      )
      .limit(1);

    return organization ? mapOrganization(organization) : null;
  }

  async listOrganizationsForDuplicateCheck(input: {
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    limit: number;
  }): Promise<Organization[]> {
    const duplicateConditions: SQL[] = [
      sql`lower(${schema.crmOrganization.legalName}) = ${input.legalName.toLocaleLowerCase(
        "sv-SE",
      )}`,
    ];

    if (input.organizationNumber) {
      duplicateConditions.push(
        eq(schema.crmOrganization.organizationNumber, input.organizationNumber),
      );
    }

    const organizations = await this.client
      .select()
      .from(schema.crmOrganization)
      .where(and(eq(schema.crmOrganization.teamId, input.teamId), or(...duplicateConditions)))
      .orderBy(desc(schema.crmOrganization.createdAt))
      .limit(input.limit);

    return organizations.map(mapOrganization);
  }

  async getPersonForTeam(teamId: string, recordId: string): Promise<Person | null> {
    const [person] = await this.client
      .select()
      .from(schema.crmPerson)
      .where(and(eq(schema.crmPerson.teamId, teamId), eq(schema.crmPerson.recordId, recordId)))
      .limit(1);

    return person ? mapPerson(person) : null;
  }

  async getLegalEntityForTeam(teamId: string, recordId: string): Promise<LegalEntity | null> {
    const [legalEntity] = await this.client
      .select()
      .from(schema.crmLegalEntity)
      .where(
        and(eq(schema.crmLegalEntity.teamId, teamId), eq(schema.crmLegalEntity.recordId, recordId)),
      )
      .limit(1);

    return legalEntity ? mapLegalEntity(legalEntity) : null;
  }

  async getAccountForTeam(teamId: string, recordId: string): Promise<Account | null> {
    const [account] = await this.client
      .select()
      .from(schema.crmAccount)
      .where(and(eq(schema.crmAccount.teamId, teamId), eq(schema.crmAccount.recordId, recordId)))
      .limit(1);

    return account ? mapAccount(account) : null;
  }

  async getContactForTeam(teamId: string, recordId: string): Promise<Contact | null> {
    const [contact] = await this.client
      .select()
      .from(schema.crmContact)
      .where(and(eq(schema.crmContact.teamId, teamId), eq(schema.crmContact.recordId, recordId)))
      .limit(1);

    return contact ? mapContact(contact) : null;
  }

  async listAccountsForTeam(input: {
    teamId: string;
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"] | null;
    accountType?: Account["accountType"] | null;
    recordIds?: readonly string[] | null;
    organizationIds?: readonly string[] | null;
  }): Promise<Account[]> {
    const conditions: SQL[] = [eq(schema.crmAccount.teamId, input.teamId)];

    if (input.recordIds) {
      if (input.recordIds.length === 0) {
        return [];
      }

      conditions.push(inArray(schema.crmAccount.recordId, [...input.recordIds]));
    }

    if (input.organizationIds) {
      if (input.organizationIds.length === 0) {
        return [];
      }

      conditions.push(inArray(schema.crmAccount.organizationId, [...input.organizationIds]));
    }

    if (input.legalEntityId) {
      conditions.push(eq(schema.crmAccount.legalEntityId, input.legalEntityId));
    }

    if (input.relationshipStatus) {
      conditions.push(eq(schema.crmAccount.relationshipStatus, input.relationshipStatus));
    }

    if (input.accountType) {
      conditions.push(eq(schema.crmAccount.accountType, input.accountType));
    }

    const accounts = await this.client
      .select()
      .from(schema.crmAccount)
      .where(and(...conditions))
      .orderBy(desc(schema.crmAccount.createdAt));

    return accounts.map(mapAccount);
  }

  async listContactsForAccount(
    teamId: string,
    accountId: string,
  ): Promise<AccountContactSummary[]> {
    const contacts = await this.client
      .select({ contact: schema.crmContact, person: schema.crmPerson })
      .from(schema.crmContact)
      .innerJoin(schema.crmPerson, eq(schema.crmContact.personId, schema.crmPerson.recordId))
      .where(and(eq(schema.crmContact.teamId, teamId), eq(schema.crmContact.accountId, accountId)))
      .orderBy(desc(schema.crmContact.isPrimary), asc(schema.crmPerson.displayName));

    return contacts.map((row) => ({
      contact: mapContact(row.contact),
      person: mapPerson(row.person),
    }));
  }

  async getCrmObjectTypeDefinitionForTeam(
    teamId: string,
    objectTypeId: string,
  ): Promise<CrmObjectTypeDefinition | null> {
    const [objectType] = await this.client
      .select()
      .from(schema.crmObjectTypeDefinition)
      .where(
        and(
          eq(schema.crmObjectTypeDefinition.teamId, teamId),
          eq(schema.crmObjectTypeDefinition.objectTypeId, objectTypeId),
        ),
      )
      .limit(1);

    return objectType ? mapCrmObjectTypeDefinition(objectType) : null;
  }

  async createCrmObjectTypeDefinition(input: {
    id: string;
    teamId: string;
    objectTypeId: string;
    label: string;
    isCustom: boolean;
    createdByActorId: string;
  }): Promise<CrmObjectTypeDefinition> {
    const now = new Date();
    const [objectType] = await this.client
      .insert(schema.crmObjectTypeDefinition)
      .values({
        id: input.id,
        teamId: input.teamId,
        objectTypeId: input.objectTypeId,
        label: input.label,
        isCustom: input.isCustom,
        createdByActorId: input.createdByActorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!objectType) {
      throw new Error("CRM object type definition was not created");
    }

    return mapCrmObjectTypeDefinition(objectType);
  }

  async getCrmFieldDefinitionForTeam(
    teamId: string,
    fieldDefinitionId: string,
  ): Promise<CrmFieldDefinition | null> {
    const [fieldDefinition] = await this.client
      .select()
      .from(schema.crmFieldDefinition)
      .where(
        and(
          eq(schema.crmFieldDefinition.teamId, teamId),
          eq(schema.crmFieldDefinition.id, fieldDefinitionId),
        ),
      )
      .limit(1);

    return fieldDefinition ? mapCrmFieldDefinition(fieldDefinition) : null;
  }

  async getCrmFieldDefinitionByStableKey(input: {
    teamId: string;
    objectTypeId: string;
    stableKey: string;
  }): Promise<CrmFieldDefinition | null> {
    const [fieldDefinition] = await this.client
      .select()
      .from(schema.crmFieldDefinition)
      .where(
        and(
          eq(schema.crmFieldDefinition.teamId, input.teamId),
          eq(schema.crmFieldDefinition.objectTypeId, input.objectTypeId),
          eq(schema.crmFieldDefinition.stableKey, input.stableKey),
        ),
      )
      .limit(1);

    return fieldDefinition ? mapCrmFieldDefinition(fieldDefinition) : null;
  }

  async createCrmFieldDefinition(input: {
    id: string;
    teamId: string;
    objectTypeDefinitionId: string;
    objectTypeId: string;
    stableKey: string;
    label: string;
    fieldType: CrmFieldDefinition["fieldType"];
    cardinality: CrmFieldDefinition["cardinality"];
    isRequired: boolean;
    isUnique: boolean;
    allowedReferenceObjectTypeId: string | null;
    createdByActorId: string;
  }): Promise<CrmFieldDefinition> {
    const now = new Date();
    const [fieldDefinition] = await this.client
      .insert(schema.crmFieldDefinition)
      .values({
        id: input.id,
        teamId: input.teamId,
        objectTypeDefinitionId: input.objectTypeDefinitionId,
        objectTypeId: input.objectTypeId,
        stableKey: input.stableKey,
        label: input.label,
        fieldType: input.fieldType,
        cardinality: input.cardinality,
        isRequired: input.isRequired,
        isUnique: input.isUnique,
        allowedReferenceObjectTypeId: input.allowedReferenceObjectTypeId,
        createdByActorId: input.createdByActorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!fieldDefinition) {
      throw new Error("CRM field definition was not created");
    }

    return mapCrmFieldDefinition(fieldDefinition);
  }

  async createCrmOptionSet(input: {
    id: string;
    teamId: string;
    fieldDefinitionId: string;
    stableKey: string;
    label: string;
    createdByActorId: string;
  }): Promise<CrmOptionSet> {
    const now = new Date();
    const [optionSet] = await this.client
      .insert(schema.crmOptionSet)
      .values({
        id: input.id,
        teamId: input.teamId,
        fieldDefinitionId: input.fieldDefinitionId,
        stableKey: input.stableKey,
        label: input.label,
        createdByActorId: input.createdByActorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!optionSet) {
      throw new Error("CRM option set was not created");
    }

    return mapCrmOptionSet(optionSet);
  }

  async createCrmOptionValues(
    input: {
      id: string;
      teamId: string;
      optionSetId: string;
      stableKey: string;
      label: string;
      sortOrder: number;
    }[],
  ): Promise<CrmOptionValue[]> {
    if (input.length === 0) {
      return [];
    }

    const now = new Date();
    const optionValues = await this.client
      .insert(schema.crmOptionValue)
      .values(
        input.map((optionValue) => ({
          id: optionValue.id,
          teamId: optionValue.teamId,
          optionSetId: optionValue.optionSetId,
          stableKey: optionValue.stableKey,
          label: optionValue.label,
          sortOrder: optionValue.sortOrder,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning();

    return optionValues.map(mapCrmOptionValue);
  }

  async listCrmOptionValuesForField(input: {
    teamId: string;
    fieldDefinitionId: string;
  }): Promise<CrmOptionValue[]> {
    const optionValues = await this.client
      .select({ optionValue: schema.crmOptionValue })
      .from(schema.crmOptionValue)
      .innerJoin(schema.crmOptionSet, eq(schema.crmOptionValue.optionSetId, schema.crmOptionSet.id))
      .where(
        and(
          eq(schema.crmOptionSet.teamId, input.teamId),
          eq(schema.crmOptionSet.fieldDefinitionId, input.fieldDefinitionId),
        ),
      )
      .orderBy(asc(schema.crmOptionValue.sortOrder));

    return optionValues.map((row) => mapCrmOptionValue(row.optionValue));
  }

  async upsertCrmRecordFieldValue(input: {
    id: string;
    teamId: string;
    recordId: string;
    fieldDefinitionId: string;
    position?: number;
    value: CrmRecordFieldValueDraft;
    updatedByActorId: string;
  }): Promise<CrmRecordFieldValue> {
    const now = new Date();
    const position = input.position ?? 0;
    const values = {
      id: input.id,
      teamId: input.teamId,
      recordId: input.recordId,
      fieldDefinitionId: input.fieldDefinitionId,
      position,
      textValue: input.value.textValue,
      integerValue: input.value.integerValue,
      booleanValue: input.value.booleanValue,
      dateValue: input.value.dateValue ? new Date(input.value.dateValue) : null,
      amountMinor: input.value.amountMinor,
      currencyCode: input.value.currencyCode,
      optionValueId: input.value.optionValueId,
      referenceRecordId: input.value.referenceRecordId,
      updatedByActorId: input.updatedByActorId,
      createdAt: now,
      updatedAt: now,
    };
    const [fieldValue] = await this.client
      .insert(schema.crmRecordFieldValue)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.crmRecordFieldValue.teamId,
          schema.crmRecordFieldValue.recordId,
          schema.crmRecordFieldValue.fieldDefinitionId,
          schema.crmRecordFieldValue.position,
        ],
        set: {
          textValue: values.textValue,
          integerValue: values.integerValue,
          booleanValue: values.booleanValue,
          dateValue: values.dateValue,
          amountMinor: values.amountMinor,
          currencyCode: values.currencyCode,
          optionValueId: values.optionValueId,
          referenceRecordId: values.referenceRecordId,
          updatedByActorId: values.updatedByActorId,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    if (!fieldValue) {
      throw new Error("CRM record field value was not written");
    }

    return mapCrmRecordFieldValue(fieldValue);
  }

  async findCrmRecordFieldValueByFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
    excludeRecordId?: string | null;
  }): Promise<CrmRecordFieldValue | null> {
    const conditions = [
      eq(schema.crmRecordFieldValue.teamId, input.teamId),
      eq(schema.crmRecordFieldValue.fieldDefinitionId, input.fieldDefinitionId),
      ...crmRecordFieldValueConditions(input.value),
    ];

    if (input.excludeRecordId) {
      conditions.push(ne(schema.crmRecordFieldValue.recordId, input.excludeRecordId));
    }

    const [fieldValue] = await this.client
      .select()
      .from(schema.crmRecordFieldValue)
      .where(and(...conditions))
      .limit(1);

    return fieldValue ? mapCrmRecordFieldValue(fieldValue) : null;
  }

  async listRecordIdsByCrmFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
  }): Promise<string[]> {
    const fieldValues = await this.client
      .select({ recordId: schema.crmRecordFieldValue.recordId })
      .from(schema.crmRecordFieldValue)
      .where(
        and(
          eq(schema.crmRecordFieldValue.teamId, input.teamId),
          eq(schema.crmRecordFieldValue.fieldDefinitionId, input.fieldDefinitionId),
          ...crmRecordFieldValueConditions(input.value),
        ),
      );

    return fieldValues.map((fieldValue) => fieldValue.recordId);
  }

  async incrementCrmRecordVersion(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }): Promise<CrmRecord | null> {
    const [record] = await this.client
      .update(schema.crmRecord)
      .set({
        version: input.expectedVersion + 1,
        updatedByActorId: input.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.crmRecord.teamId, input.teamId),
          eq(schema.crmRecord.id, input.recordId),
          eq(schema.crmRecord.version, input.expectedVersion),
        ),
      )
      .returning();

    return record ? mapCrmRecord(record) : null;
  }

  async archiveCrmRecord(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }): Promise<CrmRecord | null> {
    const now = new Date();
    const [record] = await this.client
      .update(schema.crmRecord)
      .set({
        lifecycleState: "archived",
        version: input.expectedVersion + 1,
        updatedByActorId: input.actorId,
        updatedAt: now,
        archivedAt: now,
      })
      .where(
        and(
          eq(schema.crmRecord.teamId, input.teamId),
          eq(schema.crmRecord.id, input.recordId),
          eq(schema.crmRecord.version, input.expectedVersion),
          eq(schema.crmRecord.lifecycleState, "active"),
        ),
      )
      .returning();

    return record ? mapCrmRecord(record) : null;
  }

  async getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null> {
    const [opportunity] = await this.client
      .select()
      .from(schema.crmOpportunity)
      .where(
        and(eq(schema.crmOpportunity.teamId, teamId), eq(schema.crmOpportunity.recordId, recordId)),
      )
      .limit(1);

    return opportunity ? mapOpportunity(opportunity) : null;
  }

  async listOpenOpportunitiesForAccount(teamId: string, accountId: string): Promise<Opportunity[]> {
    const opportunities = await this.client
      .select()
      .from(schema.crmOpportunity)
      .where(
        and(
          eq(schema.crmOpportunity.teamId, teamId),
          eq(schema.crmOpportunity.accountId, accountId),
          eq(schema.crmOpportunity.status, "open"),
        ),
      )
      .orderBy(desc(schema.crmOpportunity.createdAt));

    return opportunities.map(mapOpportunity);
  }

  async listOpportunitiesForAccount(teamId: string, accountId: string): Promise<Opportunity[]> {
    const opportunities = await this.client
      .select()
      .from(schema.crmOpportunity)
      .where(
        and(
          eq(schema.crmOpportunity.teamId, teamId),
          eq(schema.crmOpportunity.accountId, accountId),
        ),
      )
      .orderBy(desc(schema.crmOpportunity.createdAt));

    return opportunities.map(mapOpportunity);
  }

  async createCrmRecord(input: {
    recordId: string;
    teamId: string;
    objectTypeId: string;
    createdByActorId: string;
    ownerPrincipalId?: string | null;
  }): Promise<CrmRecord> {
    const now = new Date();
    const [record] = await this.client
      .insert(schema.crmRecord)
      .values({
        id: input.recordId,
        teamId: input.teamId,
        objectTypeId: input.objectTypeId,
        ownerPrincipalId: input.ownerPrincipalId ?? input.createdByActorId,
        lifecycleState: "active",
        version: 1,
        createdByActorId: input.createdByActorId,
        updatedByActorId: input.createdByActorId,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      })
      .returning();

    if (!record) {
      throw new Error("CRM record was not created");
    }

    return mapCrmRecord(record);
  }

  async createCrmParty(input: {
    recordId: string;
    teamId: string;
    partyType: PartyType;
  }): Promise<Party> {
    const [party] = await this.client
      .insert(schema.crmParty)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        partyType: input.partyType,
      })
      .returning();

    if (!party) {
      throw new Error("CRM party was not created");
    }

    return mapParty(party);
  }

  async createOrganization(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    displayName?: string | null;
    organizationNumber?: string | null;
    countryCode?: string | null;
    vatNumber?: string | null;
    websiteDomain?: string | null;
  }): Promise<Organization> {
    const now = new Date();
    const [organization] = await this.client
      .insert(schema.crmOrganization)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        legalName: input.legalName,
        displayName: input.displayName ?? null,
        organizationNumber: input.organizationNumber ?? null,
        countryCode: input.countryCode ?? null,
        vatNumber: input.vatNumber ?? null,
        websiteDomain: input.websiteDomain ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!organization) {
      throw new Error("Organization was not created");
    }

    return mapOrganization(organization);
  }

  async createPerson(input: {
    recordId: string;
    teamId: string;
    givenName?: string | null;
    familyName?: string | null;
    displayName: string;
    email?: string | null;
    phoneNumber?: string | null;
  }): Promise<Person> {
    const now = new Date();
    const [person] = await this.client
      .insert(schema.crmPerson)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        displayName: input.displayName,
        email: input.email ?? null,
        phoneNumber: input.phoneNumber ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!person) {
      throw new Error("Person was not created");
    }

    return mapPerson(person);
  }

  async updatePerson(input: {
    teamId: string;
    personId: string;
    givenName: string | null;
    familyName: string | null;
    displayName: string;
    email: string | null;
    phoneNumber: string | null;
  }): Promise<Person | null> {
    const [person] = await this.client
      .update(schema.crmPerson)
      .set({
        givenName: input.givenName,
        familyName: input.familyName,
        displayName: input.displayName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.crmPerson.teamId, input.teamId),
          eq(schema.crmPerson.recordId, input.personId),
        ),
      )
      .returning();

    return person ? mapPerson(person) : null;
  }

  async createLegalEntity(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    vatNumber?: string | null;
    countryCode: string;
    baseCurrency: string;
    fiscalYearStartMonth: number;
    status: LegalEntity["status"];
  }): Promise<LegalEntity> {
    const now = new Date();
    const [legalEntity] = await this.client
      .insert(schema.crmLegalEntity)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        legalName: input.legalName,
        organizationNumber: input.organizationNumber ?? null,
        vatNumber: input.vatNumber ?? null,
        countryCode: input.countryCode,
        baseCurrency: input.baseCurrency,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        status: input.status,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!legalEntity) {
      throw new Error("Legal entity was not created");
    }

    return mapLegalEntity(legalEntity);
  }

  async createAccount(input: {
    recordId: string;
    teamId: string;
    organizationId: string;
    accountType?: Account["accountType"];
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"];
    lifecycleStage?: Account["lifecycleStage"];
    segment?: string | null;
    territory?: string | null;
    primaryOwnerPrincipalId?: string | null;
    customerSince?: string | null;
    churnedAt?: string | null;
  }): Promise<Account> {
    const now = new Date();
    const [account] = await this.client
      .insert(schema.crmAccount)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        organizationId: input.organizationId,
        accountType: input.accountType ?? "prospect",
        relationshipStatus: input.relationshipStatus ?? "active",
        legalEntityId: input.legalEntityId ?? null,
        lifecycleStage: input.lifecycleStage ?? null,
        segment: input.segment ?? null,
        territory: input.territory ?? null,
        primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
        customerSince: input.customerSince ? new Date(input.customerSince) : null,
        churnedAt: input.churnedAt ? new Date(input.churnedAt) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!account) {
      throw new Error("Account was not created");
    }

    return mapAccount(account);
  }

  async updateAccount(input: {
    teamId: string;
    accountId: string;
    accountType: Account["accountType"];
    legalEntityId: string | null;
    relationshipStatus: Account["relationshipStatus"];
    lifecycleStage: Account["lifecycleStage"];
    segment: string | null;
    territory: string | null;
    primaryOwnerPrincipalId: string | null;
    customerSince: string | null;
    churnedAt: string | null;
  }): Promise<Account | null> {
    const [account] = await this.client
      .update(schema.crmAccount)
      .set({
        accountType: input.accountType,
        legalEntityId: input.legalEntityId,
        relationshipStatus: input.relationshipStatus,
        lifecycleStage: input.lifecycleStage,
        segment: input.segment,
        territory: input.territory,
        primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
        customerSince: input.customerSince ? new Date(input.customerSince) : null,
        churnedAt: input.churnedAt ? new Date(input.churnedAt) : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.crmAccount.teamId, input.teamId),
          eq(schema.crmAccount.recordId, input.accountId),
        ),
      )
      .returning();

    return account ? mapAccount(account) : null;
  }

  async createContact(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    personId: string;
    role?: string | null;
    isPrimary?: boolean | null;
  }): Promise<Contact> {
    const now = new Date();
    const [contact] = await this.client
      .insert(schema.crmContact)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        accountId: input.accountId,
        personId: input.personId,
        role: input.role ?? null,
        isPrimary: input.isPrimary ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!contact) {
      throw new Error("Contact was not created");
    }

    return mapContact(contact);
  }

  async updateContact(input: {
    teamId: string;
    contactId: string;
    role: string | null;
    isPrimary: boolean;
  }): Promise<Contact | null> {
    const [contact] = await this.client
      .update(schema.crmContact)
      .set({
        role: input.role,
        isPrimary: input.isPrimary,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.crmContact.teamId, input.teamId),
          eq(schema.crmContact.recordId, input.contactId),
        ),
      )
      .returning();

    return contact ? mapContact(contact) : null;
  }

  async createOpportunity(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    expectedCloseDate?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }): Promise<Opportunity> {
    const now = new Date();
    const [opportunity] = await this.client
      .insert(schema.crmOpportunity)
      .values({
        recordId: input.recordId,
        teamId: input.teamId,
        accountId: input.accountId,
        name: input.name,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        status: input.status,
        stage: input.stage,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
        wonAt: null,
        lostAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!opportunity) {
      throw new Error("Opportunity was not created");
    }

    return mapOpportunity(opportunity);
  }

  async updateOpportunity(input: {
    teamId: string;
    opportunityId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    expectedCloseDate: string | null;
    primaryOwnerPrincipalId: string | null;
  }): Promise<Opportunity | null> {
    const [opportunity] = await this.client
      .update(schema.crmOpportunity)
      .set({
        name: input.name,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.crmOpportunity.teamId, input.teamId),
          eq(schema.crmOpportunity.recordId, input.opportunityId),
        ),
      )
      .returning();

    return opportunity ? mapOpportunity(opportunity) : null;
  }

  async updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }): Promise<Opportunity | null> {
    const existing = await this.getOpportunityForTeam(input.teamId, input.opportunityId);

    if (!existing) {
      return null;
    }

    const now = new Date();
    const [opportunity] = await this.client
      .update(schema.crmOpportunity)
      .set({
        stage: input.stage,
        status: input.status,
        wonAt:
          input.status === "won"
            ? existing.wonAt
              ? new Date(existing.wonAt)
              : now
            : existing.wonAt
              ? new Date(existing.wonAt)
              : null,
        lostAt:
          input.stage === "lost"
            ? existing.lostAt
              ? new Date(existing.lostAt)
              : now
            : existing.lostAt
              ? new Date(existing.lostAt)
              : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.crmOpportunity.teamId, input.teamId),
          eq(schema.crmOpportunity.recordId, input.opportunityId),
        ),
      )
      .returning();

    return opportunity ? mapOpportunity(opportunity) : null;
  }

  async getCommercialDocumentForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentWithLines | null> {
    const [document] = await this.client
      .select()
      .from(schema.commercialDocument)
      .where(
        and(
          eq(schema.commercialDocument.teamId, teamId),
          eq(schema.commercialDocument.id, documentId),
        ),
      )
      .limit(1);

    if (!document) {
      return null;
    }

    const lines = await this.client
      .select()
      .from(schema.commercialDocumentLine)
      .where(eq(schema.commercialDocumentLine.documentId, document.id))
      .orderBy(asc(schema.commercialDocumentLine.sortOrder));

    return mapCommercialDocumentWithLines(document, lines);
  }

  async listCommercialDocumentsForOpportunity(
    teamId: string,
    opportunityId: string,
  ): Promise<CommercialDocumentWithLines[]> {
    const documents = await this.client
      .select()
      .from(schema.commercialDocument)
      .where(
        and(
          eq(schema.commercialDocument.teamId, teamId),
          eq(schema.commercialDocument.opportunityId, opportunityId),
        ),
      )
      .orderBy(desc(schema.commercialDocument.updatedAt));
    const documentIds = documents.map((document) => document.id);
    const lines =
      documentIds.length === 0
        ? []
        : await this.client
            .select()
            .from(schema.commercialDocumentLine)
            .where(inArray(schema.commercialDocumentLine.documentId, documentIds))
            .orderBy(asc(schema.commercialDocumentLine.sortOrder));

    return documents.map((document) =>
      mapCommercialDocumentWithLines(
        document,
        lines.filter((line) => line.documentId === document.id),
      ),
    );
  }

  async getLatestCommercialDocumentVersionForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentVersion | null> {
    const [version] = await this.client
      .select()
      .from(schema.commercialDocumentVersion)
      .where(
        and(
          eq(schema.commercialDocumentVersion.teamId, teamId),
          eq(schema.commercialDocumentVersion.documentId, documentId),
        ),
      )
      .orderBy(desc(schema.commercialDocumentVersion.versionNumber))
      .limit(1);

    return version ? mapCommercialDocumentVersion(version) : null;
  }

  async getCommercialDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<CommercialDocumentVersion | null> {
    const [version] = await this.client
      .select()
      .from(schema.commercialDocumentVersion)
      .where(
        and(
          eq(schema.commercialDocumentVersion.teamId, teamId),
          eq(schema.commercialDocumentVersion.id, versionId),
        ),
      )
      .limit(1);

    return version ? mapCommercialDocumentVersion(version) : null;
  }

  async createCommercialDocument(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    lines: CommercialDocumentLineDraft[];
    createdByActorId: string;
  }): Promise<CommercialDocumentWithLines> {
    const now = new Date();
    const [document] = await this.client
      .insert(schema.commercialDocument)
      .values({
        id: input.documentId,
        teamId: input.teamId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
        documentType: input.documentType,
        title: input.title,
        status: "draft",
        currency: input.currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        paymentTerms: input.paymentTerms ?? null,
        termsVersion: input.termsVersion,
        templateId: input.templateId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        scope: input.scope ?? null,
        activeVersionId: null,
        recipientAccessTokenHash: null,
        recipientAccessTokenExpiresAt: null,
        sentAt: null,
        viewedAt: null,
        declinedAt: null,
        declineReason: null,
        createdByActorId: input.createdByActorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!document) {
      throw new Error("Commercial document was not created");
    }

    await this.insertCommercialDocumentLines({
      teamId: input.teamId,
      documentId: input.documentId,
      currency: input.currency,
      lines: input.lines,
    });

    return (
      (await this.getCommercialDocumentForTeam(input.teamId, input.documentId)) ??
      mapCommercialDocumentWithLines(document, [])
    );
  }

  async updateCommercialDocumentDraft(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    lines: CommercialDocumentLineDraft[];
  }): Promise<CommercialDocumentWithLines> {
    const [document] = await this.client
      .update(schema.commercialDocument)
      .set({
        documentType: input.documentType,
        title: input.title,
        currency: input.currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        paymentTerms: input.paymentTerms ?? null,
        termsVersion: input.termsVersion,
        templateId: input.templateId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        scope: input.scope ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
          eq(schema.commercialDocument.status, "draft"),
        ),
      )
      .returning();

    if (!document) {
      throw new Error("Commercial document draft was not updated");
    }

    await this.client
      .delete(schema.commercialDocumentLine)
      .where(eq(schema.commercialDocumentLine.documentId, input.documentId));
    await this.insertCommercialDocumentLines({
      teamId: input.teamId,
      documentId: input.documentId,
      currency: input.currency,
      lines: input.lines,
    });

    return (
      (await this.getCommercialDocumentForTeam(input.teamId, input.documentId)) ??
      mapCommercialDocumentWithLines(document, [])
    );
  }

  async finalizeCommercialDocument(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    versionNumber: number;
    snapshot: CommercialDocumentVersionSnapshot;
    pdfObjectKey: string;
    pdfBodyBase64: string;
    pdfSha256: string;
    byteSize: number;
    finalizedByActorId: string;
  }): Promise<{ document: CommercialDocumentWithLines; version: CommercialDocumentVersion }> {
    const [claimedDocument] = await this.client
      .update(schema.commercialDocument)
      .set({
        status: "finalised",
        activeVersionId: input.versionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
          eq(schema.commercialDocument.status, "draft"),
        ),
      )
      .returning();

    if (!claimedDocument) {
      throw new Error("Commercial document was already finalised");
    }

    const [version] = await this.client
      .insert(schema.commercialDocumentVersion)
      .values({
        id: input.versionId,
        teamId: input.teamId,
        documentId: input.documentId,
        versionNumber: input.versionNumber,
        status: "finalised",
        snapshot: input.snapshot,
        pdfObjectKey: input.pdfObjectKey,
        pdfBodyBase64: input.pdfBodyBase64,
        pdfSha256: input.pdfSha256,
        byteSize: input.byteSize,
        finalizedByActorId: input.finalizedByActorId,
      })
      .returning();

    if (!version) {
      throw new Error("Commercial document version was not created");
    }

    const document = await this.getCommercialDocumentForTeam(input.teamId, input.documentId);

    if (!document) {
      throw new Error("Commercial document disappeared during finalisation");
    }

    return { document, version: mapCommercialDocumentVersion(version) };
  }

  async reviseCommercialDocument(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    lines: CommercialDocumentLineDraft[];
  }): Promise<{
    document: CommercialDocumentWithLines;
    supersededVersion: CommercialDocumentVersion | null;
  }> {
    const existing = await this.getCommercialDocumentForTeam(input.teamId, input.documentId);
    const activeVersionId = existing?.activeVersionId ?? null;
    let supersededVersion: CommercialDocumentVersion | null = null;

    if (activeVersionId) {
      const [version] = await this.client
        .update(schema.commercialDocumentVersion)
        .set({ status: "superseded" })
        .where(
          and(
            eq(schema.commercialDocumentVersion.teamId, input.teamId),
            eq(schema.commercialDocumentVersion.id, activeVersionId),
          ),
        )
        .returning();
      supersededVersion = version ? mapCommercialDocumentVersion(version) : null;
    }

    const [document] = await this.client
      .update(schema.commercialDocument)
      .set({
        documentType: input.documentType,
        title: input.title,
        status: "draft",
        currency: input.currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        paymentTerms: input.paymentTerms ?? null,
        termsVersion: input.termsVersion,
        templateId: input.templateId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        scope: input.scope ?? null,
        activeVersionId: null,
        recipientAccessTokenHash: null,
        recipientAccessTokenExpiresAt: null,
        sentAt: null,
        viewedAt: null,
        declinedAt: null,
        declineReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
        ),
      )
      .returning();

    if (!document) {
      throw new Error("Commercial document revision was not created");
    }

    await this.client
      .delete(schema.commercialDocumentLine)
      .where(eq(schema.commercialDocumentLine.documentId, input.documentId));
    await this.insertCommercialDocumentLines({
      teamId: input.teamId,
      documentId: input.documentId,
      currency: input.currency,
      lines: input.lines,
    });

    return {
      document:
        (await this.getCommercialDocumentForTeam(input.teamId, input.documentId)) ??
        mapCommercialDocumentWithLines(document, []),
      supersededVersion,
    };
  }

  async sendCommercialDocument(input: {
    teamId: string;
    documentId: string;
    recipientEmail: string;
    recipientAccessTokenHash: string;
    recipientAccessTokenExpiresAt: string;
    sentAt: string;
  }): Promise<CommercialDocumentWithLines> {
    await this.client
      .update(schema.commercialDocument)
      .set({
        status: "sent",
        recipientEmail: input.recipientEmail,
        recipientAccessTokenHash: input.recipientAccessTokenHash,
        recipientAccessTokenExpiresAt: new Date(input.recipientAccessTokenExpiresAt),
        sentAt: new Date(input.sentAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
        ),
      );

    const document = await this.getCommercialDocumentForTeam(input.teamId, input.documentId);

    if (!document) {
      throw new Error("Commercial document disappeared during send");
    }

    return document;
  }

  async getCommercialDocumentByRecipientAccessTokenHash(input: {
    accessTokenHash: string;
  }): Promise<{
    document: CommercialDocumentWithLines;
    version: CommercialDocumentVersion;
  } | null> {
    const [document] = await this.client
      .select()
      .from(schema.commercialDocument)
      .where(eq(schema.commercialDocument.recipientAccessTokenHash, input.accessTokenHash))
      .limit(1);

    if (!document?.activeVersionId) {
      return null;
    }

    const fullDocument = await this.getCommercialDocumentForTeam(document.teamId, document.id);
    const version = await this.getCommercialDocumentVersionForTeam(
      document.teamId,
      document.activeVersionId,
    );

    return fullDocument && version ? { document: fullDocument, version } : null;
  }

  async markCommercialDocumentViewed(input: {
    teamId: string;
    documentId: string;
    viewedAt: string;
  }): Promise<CommercialDocumentWithLines> {
    await this.client
      .update(schema.commercialDocument)
      .set({
        status: "viewed",
        viewedAt: new Date(input.viewedAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
        ),
      );

    const document = await this.getCommercialDocumentForTeam(input.teamId, input.documentId);

    if (!document) {
      throw new Error("Commercial document disappeared during recipient view");
    }

    return document;
  }

  async declineCommercialDocument(input: {
    teamId: string;
    documentId: string;
    declinedAt: string;
    reason?: string | null;
  }): Promise<CommercialDocumentWithLines> {
    await this.client
      .update(schema.commercialDocument)
      .set({
        status: "declined",
        declinedAt: new Date(input.declinedAt),
        declineReason: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.commercialDocument.teamId, input.teamId),
          eq(schema.commercialDocument.id, input.documentId),
        ),
      );

    const document = await this.getCommercialDocumentForTeam(input.teamId, input.documentId);

    if (!document) {
      throw new Error("Commercial document disappeared during decline");
    }

    return document;
  }

  private async insertCommercialDocumentLines(input: {
    teamId: string;
    documentId: string;
    currency: string;
    lines: CommercialDocumentLineDraft[];
  }) {
    const calculated = calculateCommercialDocumentTotals({
      currency: input.currency,
      lines: input.lines,
    });
    const values = input.lines.map((line, index) => ({
      id: crypto.randomUUID(),
      teamId: input.teamId,
      documentId: input.documentId,
      source: line.source,
      provider: line.provider ?? null,
      providerConnectionId: line.providerConnectionId ?? null,
      providerObjectId: line.providerObjectId ?? null,
      providerObjectRecordId: line.providerObjectRecordId ?? null,
      articleNumber: line.articleNumber ?? null,
      description: line.description,
      unit: line.unit ?? null,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPrice.amountMinor,
      currency: line.unitPrice.currency,
      discountBasisPoints: line.discountBasisPoints ?? 0,
      vatRateBasisPoints: line.vatRateBasisPoints ?? 0,
      subtotalMinor: calculated.lines[index]?.subtotal.amountMinor ?? 0,
      discountMinor: calculated.lines[index]?.discount.amountMinor ?? 0,
      vatMinor: calculated.lines[index]?.vat.amountMinor ?? 0,
      totalMinor: calculated.lines[index]?.total.amountMinor ?? 0,
      snapshot: line.snapshot ?? null,
      sortOrder: index,
    }));

    if (values.length > 0) {
      await this.client.insert(schema.commercialDocumentLine).values(values);
    }
  }
}

function crmRecordFieldValueConditions(value: CrmRecordFieldValueDraft): SQL[] {
  if (value.textValue !== null) {
    return [eq(schema.crmRecordFieldValue.textValue, value.textValue)];
  }

  if (value.integerValue !== null) {
    return [eq(schema.crmRecordFieldValue.integerValue, value.integerValue)];
  }

  if (value.booleanValue !== null) {
    return [eq(schema.crmRecordFieldValue.booleanValue, value.booleanValue)];
  }

  if (value.dateValue !== null) {
    return [eq(schema.crmRecordFieldValue.dateValue, new Date(value.dateValue))];
  }

  if (value.amountMinor !== null && value.currencyCode !== null) {
    return [
      eq(schema.crmRecordFieldValue.amountMinor, value.amountMinor),
      eq(schema.crmRecordFieldValue.currencyCode, value.currencyCode),
    ];
  }

  if (value.optionValueId !== null) {
    return [eq(schema.crmRecordFieldValue.optionValueId, value.optionValueId)];
  }

  if (value.referenceRecordId !== null) {
    return [eq(schema.crmRecordFieldValue.referenceRecordId, value.referenceRecordId)];
  }

  return [
    isNull(schema.crmRecordFieldValue.textValue),
    isNull(schema.crmRecordFieldValue.integerValue),
    isNull(schema.crmRecordFieldValue.booleanValue),
    isNull(schema.crmRecordFieldValue.dateValue),
    isNull(schema.crmRecordFieldValue.amountMinor),
    isNull(schema.crmRecordFieldValue.currencyCode),
    isNull(schema.crmRecordFieldValue.optionValueId),
    isNull(schema.crmRecordFieldValue.referenceRecordId),
  ];
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

function matchCandidateDateWindow(documentType: unknown) {
  return documentType === "invoice_received" || documentType === "invoice_sent"
    ? { beforeDays: -90, afterDays: 123 }
    : { beforeDays: -90, afterDays: 30 };
}

function daysFrom(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function timestamptzParam(value: Date) {
  return sql`${value}::timestamptz`;
}

const crossCurrencyAmountRatioBounds = {
  minimum: 0.02,
  maximum: 200,
} as const;

function normalizedSearchTerms(...values: unknown[]) {
  const terms = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    for (const term of value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
      terms.add(term);
    }
  }

  return [...terms].slice(0, 5);
}

function transactionCrossCurrencyAmountCandidateCondition(input: {
  currency: string;
  amountMinor: number;
}): SQL {
  const lowerBound = Math.max(
    1,
    Math.floor(input.amountMinor * crossCurrencyAmountRatioBounds.minimum),
  );
  const upperBound = Math.min(
    2_147_483_647,
    Math.ceil(input.amountMinor * crossCurrencyAmountRatioBounds.maximum),
  );

  return sql`
    (
      ${schema.transaction.currency} <> ${input.currency}
      and abs(${schema.transaction.amountMinor}) between ${lowerBound} and ${upperBound}
    )
  `;
}

function extractionCrossCurrencyAmountCandidateCondition(input: {
  currency: string;
  amountMinor: number;
}): SQL {
  return sql`
    (
      ${schema.documentExtraction.fields}->>'issuedAt' is not null
      and ${schema.documentExtraction.fields}->>'totalAmountMinor' is not null
      and ${schema.documentExtraction.fields}->>'totalAmountMinor' ~ '^-?[0-9]+$'
      and abs((${schema.documentExtraction.fields}->>'totalAmountMinor')::numeric) > 0
      and ${schema.documentExtraction.fields}->>'currency' is not null
      and upper(${schema.documentExtraction.fields}->>'currency') <> ${input.currency}
      and (${input.amountMinor}::numeric / abs((${schema.documentExtraction.fields}->>'totalAmountMinor')::numeric))
        between ${crossCurrencyAmountRatioBounds.minimum} and ${crossCurrencyAmountRatioBounds.maximum}
    )
  `;
}

function transactionTextIncludesTerm(term: string): SQL {
  return sql`
    lower(concat_ws(
      ' ',
      ${schema.transaction.description},
      ${schema.counterparty.name},
      ${schema.transaction.providerTransactionId}
    )) like ${`%${term}%`}
  `;
}

function extractionTextIncludesTerm(term: string): SQL {
  return sql`
    lower(concat_ws(
      ' ',
      ${schema.documentExtraction.fields}->>'merchantName',
      ${schema.documentExtraction.fields}->>'invoiceNumber',
      ${schema.documentExtraction.rawText}
    )) like ${`%${term}%`}
  `;
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
    signals: suggestion.signalScores as InboxTransactionMatchSuggestion["signals"],
    signalDetails: suggestion.signalDetails as InboxTransactionMatchSuggestion["signalDetails"],
    thresholds: suggestion.thresholds as InboxTransactionMatchSuggestion["thresholds"],
    calibration: suggestion.calibration as InboxTransactionMatchSuggestion["calibration"],
    matchType: suggestion.matchType as InboxTransactionMatchSuggestion["matchType"],
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

function mapDocumentExtractionAttempt(
  attempt: typeof schema.documentExtractionAttempt.$inferSelect,
): DocumentExtractionAttempt {
  return {
    id: attempt.id,
    teamId: attempt.teamId,
    inboxItemId: attempt.inboxItemId,
    documentId: attempt.documentId,
    documentVersionId: attempt.documentVersionId,
    extractionId: attempt.extractionId,
    attemptNumber: attempt.attemptNumber,
    source: attempt.source as DocumentExtractionAttempt["source"],
    provider: attempt.provider,
    model: attempt.model,
    status: attempt.status as DocumentExtractionAttempt["status"],
    durationMs: attempt.durationMs,
    qualityScore: decodeScore(attempt.qualityScore),
    errorClass: attempt.errorClass,
    errorMessage: attempt.errorMessage,
    rawTextPresent: attempt.rawTextPresent,
    metadata: attempt.metadata,
    createdAt: attempt.createdAt.toISOString(),
  };
}

function encodeScore(score?: number | null) {
  return typeof score === "number" && Number.isFinite(score) ? Math.round(score * 1_000) : null;
}

function decodeScore(score: number | null) {
  return typeof score === "number" ? score / 1_000 : null;
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

function mapTransaction(
  transaction: typeof schema.transaction.$inferSelect,
  acceptedAttachmentCount = 0,
): Transaction {
  const base: Transaction = {
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
    accountantStatus: transaction.accountantStatus as TransactionAccountantStatus,
    accountantStatusReason: transaction.accountantStatusReason,
    accountantStatusUpdatedAt: transaction.accountantStatusUpdatedAt?.toISOString() ?? null,
    duplicateKey: transaction.duplicateKey,
    updatedAt: transaction.updatedAt.toISOString(),
  };

  return {
    ...base,
    accountantStatus: deriveTransactionAccountantStatus({
      transaction: base,
      acceptedAttachmentCount,
    }),
  };
}

function mapAccountantPacketExportRecord(
  record: typeof schema.accountantPacketExport.$inferSelect,
): AccountantPacketExportRecord {
  const manifest = record.manifest as AccountantPacketManifest;

  return {
    packetId: record.id,
    teamId: record.teamId,
    actorId: record.actorId,
    objectKey: record.objectKey,
    fileName: record.fileName,
    contentType: record.contentType as "application/zip",
    byteSize: record.byteSize,
    status: record.status as AccountantPacketExportRecord["status"],
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedByActorId: record.revokedByActorId,
    revokeReason: record.revokeReason,
    manifest,
    createdAt: record.createdAt.toISOString(),
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
    status: importSession.status as TransactionImportSession["status"],
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

function mapCrmRecord(record: typeof schema.crmRecord.$inferSelect): CrmRecord {
  return {
    id: record.id,
    teamId: record.teamId,
    objectTypeId: record.objectTypeId,
    ownerPrincipalId: record.ownerPrincipalId,
    lifecycleState: record.lifecycleState as CrmRecord["lifecycleState"],
    version: record.version,
    createdByActorId: record.createdByActorId,
    updatedByActorId: record.updatedByActorId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

function mapCrmRecordGrant(grant: typeof schema.crmRecordGrant.$inferSelect): CrmRecordGrant {
  return {
    id: grant.id,
    teamId: grant.teamId,
    recordId: grant.recordId,
    principalId: grant.principalId,
    action: grant.action as CrmRecordGrant["action"],
    grantedByActorId: grant.grantedByActorId,
    createdAt: grant.createdAt.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}

function mapCrmObjectTypeDefinition(
  objectType: typeof schema.crmObjectTypeDefinition.$inferSelect,
): CrmObjectTypeDefinition {
  return {
    id: objectType.id,
    teamId: objectType.teamId,
    objectTypeId: objectType.objectTypeId,
    label: objectType.label,
    isCustom: objectType.isCustom,
    createdByActorId: objectType.createdByActorId,
    createdAt: objectType.createdAt.toISOString(),
    updatedAt: objectType.updatedAt.toISOString(),
  };
}

function mapCrmFieldDefinition(
  fieldDefinition: typeof schema.crmFieldDefinition.$inferSelect,
): CrmFieldDefinition {
  return {
    id: fieldDefinition.id,
    teamId: fieldDefinition.teamId,
    objectTypeDefinitionId: fieldDefinition.objectTypeDefinitionId,
    objectTypeId: fieldDefinition.objectTypeId,
    stableKey: fieldDefinition.stableKey,
    label: fieldDefinition.label,
    fieldType: fieldDefinition.fieldType as CrmFieldDefinition["fieldType"],
    cardinality: fieldDefinition.cardinality as CrmFieldDefinition["cardinality"],
    isRequired: fieldDefinition.isRequired,
    isUnique: fieldDefinition.isUnique,
    allowedReferenceObjectTypeId: fieldDefinition.allowedReferenceObjectTypeId,
    createdByActorId: fieldDefinition.createdByActorId,
    createdAt: fieldDefinition.createdAt.toISOString(),
    updatedAt: fieldDefinition.updatedAt.toISOString(),
  };
}

function mapCrmOptionSet(optionSet: typeof schema.crmOptionSet.$inferSelect): CrmOptionSet {
  return {
    id: optionSet.id,
    teamId: optionSet.teamId,
    fieldDefinitionId: optionSet.fieldDefinitionId,
    stableKey: optionSet.stableKey,
    label: optionSet.label,
    createdByActorId: optionSet.createdByActorId,
    createdAt: optionSet.createdAt.toISOString(),
    updatedAt: optionSet.updatedAt.toISOString(),
  };
}

function mapCrmOptionValue(optionValue: typeof schema.crmOptionValue.$inferSelect): CrmOptionValue {
  return {
    id: optionValue.id,
    teamId: optionValue.teamId,
    optionSetId: optionValue.optionSetId,
    stableKey: optionValue.stableKey,
    label: optionValue.label,
    sortOrder: optionValue.sortOrder,
    isActive: optionValue.isActive,
    createdAt: optionValue.createdAt.toISOString(),
    updatedAt: optionValue.updatedAt.toISOString(),
  };
}

function mapCrmRecordFieldValue(
  fieldValue: typeof schema.crmRecordFieldValue.$inferSelect,
): CrmRecordFieldValue {
  return {
    id: fieldValue.id,
    teamId: fieldValue.teamId,
    recordId: fieldValue.recordId,
    fieldDefinitionId: fieldValue.fieldDefinitionId,
    position: fieldValue.position,
    textValue: fieldValue.textValue,
    integerValue: fieldValue.integerValue,
    booleanValue: fieldValue.booleanValue,
    dateValue: fieldValue.dateValue?.toISOString() ?? null,
    amountMinor: fieldValue.amountMinor,
    currencyCode: fieldValue.currencyCode,
    optionValueId: fieldValue.optionValueId,
    referenceRecordId: fieldValue.referenceRecordId,
    updatedByActorId: fieldValue.updatedByActorId,
    createdAt: fieldValue.createdAt.toISOString(),
    updatedAt: fieldValue.updatedAt.toISOString(),
  };
}

function mapCrmFieldSecurityPolicy(
  policy: typeof schema.crmFieldSecurityPolicy.$inferSelect,
): CrmFieldSecurityPolicy {
  return {
    id: policy.id,
    teamId: policy.teamId,
    targetRecordId: policy.targetRecordId,
    objectTypeId: policy.objectTypeId,
    principalId: policy.principalId,
    fieldId: policy.fieldId,
    action: policy.action as CrmFieldSecurityPolicy["action"],
    effect: policy.effect as CrmFieldSecurityPolicy["effect"],
  };
}

function mapParty(party: typeof schema.crmParty.$inferSelect): Party {
  return {
    recordId: party.recordId,
    teamId: party.teamId,
    partyType: party.partyType as PartyType,
  };
}

function mapOrganization(organization: typeof schema.crmOrganization.$inferSelect): Organization {
  return {
    recordId: organization.recordId,
    teamId: organization.teamId,
    legalName: organization.legalName,
    displayName: organization.displayName,
    organizationNumber: organization.organizationNumber,
    countryCode: organization.countryCode,
    vatNumber: organization.vatNumber,
    websiteDomain: organization.websiteDomain,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

function mapPerson(person: typeof schema.crmPerson.$inferSelect): Person {
  return {
    recordId: person.recordId,
    teamId: person.teamId,
    givenName: person.givenName,
    familyName: person.familyName,
    displayName: person.displayName,
    email: person.email,
    phoneNumber: person.phoneNumber,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function mapLegalEntity(legalEntity: typeof schema.crmLegalEntity.$inferSelect): LegalEntity {
  return {
    recordId: legalEntity.recordId,
    teamId: legalEntity.teamId,
    legalName: legalEntity.legalName,
    organizationNumber: legalEntity.organizationNumber,
    vatNumber: legalEntity.vatNumber,
    countryCode: legalEntity.countryCode,
    baseCurrency: legalEntity.baseCurrency,
    fiscalYearStartMonth: legalEntity.fiscalYearStartMonth,
    status: legalEntity.status as LegalEntity["status"],
    createdAt: legalEntity.createdAt.toISOString(),
    updatedAt: legalEntity.updatedAt.toISOString(),
  };
}

function mapAccount(account: typeof schema.crmAccount.$inferSelect): Account {
  return {
    recordId: account.recordId,
    teamId: account.teamId,
    legalEntityId: account.legalEntityId,
    organizationId: account.organizationId,
    accountType: account.accountType as Account["accountType"],
    relationshipStatus: account.relationshipStatus as Account["relationshipStatus"],
    lifecycleStage: account.lifecycleStage as Account["lifecycleStage"],
    segment: account.segment,
    territory: account.territory,
    primaryOwnerPrincipalId: account.primaryOwnerPrincipalId,
    customerSince: account.customerSince?.toISOString() ?? null,
    churnedAt: account.churnedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function mapContact(contact: typeof schema.crmContact.$inferSelect): Contact {
  return {
    recordId: contact.recordId,
    teamId: contact.teamId,
    accountId: contact.accountId,
    personId: contact.personId,
    role: contact.role,
    isPrimary: contact.isPrimary,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function mapOpportunity(opportunity: typeof schema.crmOpportunity.$inferSelect): Opportunity {
  return {
    recordId: opportunity.recordId,
    teamId: opportunity.teamId,
    accountId: opportunity.accountId,
    name: opportunity.name,
    amountMinor: opportunity.amountMinor,
    currencyCode: opportunity.currencyCode,
    status: opportunity.status as Opportunity["status"],
    stage: opportunity.stage as Opportunity["stage"],
    expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
    primaryOwnerPrincipalId: opportunity.primaryOwnerPrincipalId,
    wonAt: opportunity.wonAt?.toISOString() ?? null,
    lostAt: opportunity.lostAt?.toISOString() ?? null,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString(),
  };
}

function mapCommercialDocumentWithLines(
  document: typeof schema.commercialDocument.$inferSelect,
  lines: (typeof schema.commercialDocumentLine.$inferSelect)[],
): CommercialDocumentWithLines {
  const mappedLines = lines.map(mapCommercialDocumentLine);
  const totals = {
    subtotal: {
      amountMinor: mappedLines.reduce((total, line) => total + line.totals.subtotal.amountMinor, 0),
      currency: document.currency,
    },
    discount: {
      amountMinor: mappedLines.reduce((total, line) => total + line.totals.discount.amountMinor, 0),
      currency: document.currency,
    },
    vat: {
      amountMinor: mappedLines.reduce((total, line) => total + line.totals.vat.amountMinor, 0),
      currency: document.currency,
    },
    total: {
      amountMinor: mappedLines.reduce((total, line) => total + line.totals.total.amountMinor, 0),
      currency: document.currency,
    },
  };

  return {
    id: document.id,
    teamId: document.teamId,
    accountId: document.accountId,
    opportunityId: document.opportunityId,
    documentType: document.documentType as CommercialDocument["documentType"],
    title: document.title,
    status: document.status as CommercialDocument["status"],
    currency: document.currency,
    validUntil: document.validUntil?.toISOString() ?? null,
    paymentTerms: document.paymentTerms,
    termsVersion: document.termsVersion,
    templateId: document.templateId,
    recipientEmail: document.recipientEmail,
    scope: document.scope,
    activeVersionId: document.activeVersionId,
    recipientAccessTokenHash: document.recipientAccessTokenHash,
    recipientAccessTokenExpiresAt: document.recipientAccessTokenExpiresAt?.toISOString() ?? null,
    sentAt: document.sentAt?.toISOString() ?? null,
    viewedAt: document.viewedAt?.toISOString() ?? null,
    declinedAt: document.declinedAt?.toISOString() ?? null,
    declineReason: document.declineReason,
    createdByActorId: document.createdByActorId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    lines: mappedLines,
    totals,
  };
}

function mapCommercialDocumentLine(
  line: typeof schema.commercialDocumentLine.$inferSelect,
): CommercialDocumentLine {
  return {
    id: line.id,
    teamId: line.teamId,
    documentId: line.documentId,
    sortOrder: line.sortOrder,
    source: line.source as CommercialDocumentLine["source"],
    provider: line.provider,
    providerConnectionId: line.providerConnectionId,
    providerObjectId: line.providerObjectId,
    providerObjectRecordId: line.providerObjectRecordId,
    articleNumber: line.articleNumber,
    description: line.description,
    unit: line.unit,
    quantityMilli: line.quantityMilli,
    unitPrice: { amountMinor: line.unitPriceMinor, currency: line.currency },
    discountBasisPoints: line.discountBasisPoints,
    vatRateBasisPoints: line.vatRateBasisPoints,
    snapshot: line.snapshot,
    totals: {
      subtotal: { amountMinor: line.subtotalMinor, currency: line.currency },
      discount: { amountMinor: line.discountMinor, currency: line.currency },
      vat: { amountMinor: line.vatMinor, currency: line.currency },
      total: { amountMinor: line.totalMinor, currency: line.currency },
    },
    createdAt: line.createdAt.toISOString(),
  };
}

function mapCommercialDocumentVersion(
  version: typeof schema.commercialDocumentVersion.$inferSelect,
): CommercialDocumentVersion {
  return {
    id: version.id,
    teamId: version.teamId,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    status: version.status as CommercialDocumentVersion["status"],
    snapshot: version.snapshot as CommercialDocumentVersionSnapshot,
    pdfObjectKey: version.pdfObjectKey,
    pdfBodyBase64: version.pdfBodyBase64,
    pdfSha256: version.pdfSha256,
    byteSize: version.byteSize,
    finalizedByActorId: version.finalizedByActorId,
    createdAt: version.createdAt.toISOString(),
  };
}
