import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import {
  completeDocumentUpload,
  createDeterministicCommercialDocumentPdfRenderer,
  createDeterministicDocumentExtractor,
  createDeterministicInvoicePdfRenderer,
  createEmailInboxOAuthStateCodec,
  createFortnoxOAuthStateCodec,
  processFortnoxInvoiceCreation,
  resolveSystemAppRequest,
  runStoredDocumentExtraction,
} from "@dawn/app";
import { MemoryAppRepository } from "@dawn/app/testkit/memory-repository";
import type { GoogleAuthAccountTokens } from "@dawn/auth";
import { calculateCommercialDocumentTotals } from "@dawn/domain";
import type {
  Account,
  AccountContactSummary,
  ApiKey,
  AutomationRule,
  AutomationRun,
  AssistantActionApproval,
  AssistantMessage,
  AssistantThread,
  AssistantToolCall,
  BusinessInsight,
  CommercialDocument,
  CommercialDocumentLine,
  CommercialDocumentLineDraft,
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  CrmFieldDefinition,
  Contact,
  CrmFieldSecurityPolicy,
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
  InvoiceHandoff,
  InvoiceHandoffPolicy,
  InvoiceEvent,
  InvoiceDraft,
  InvoiceLineDraft,
  InvoicePayment,
  InboxMatchSuggestion,
  LegalEntity,
  MarketCompany,
  MarketCompanySnapshot,
  MarketProspect,
  Opportunity,
  Organization,
  Party,
  PartyType,
  Person,
  Product,
  Project,
  ProjectMember,
  ReportSourceRef,
  RecurringInvoiceSchedule,
  SignatureEvidence,
  SignatureParty,
  SignatureRequest,
  TeamInvite,
  TeamMember,
  TeamMembership,
  TeamRole,
  TimeEntry,
  Transaction,
  TrustCheck,
  TrustCheckPolicy,
  OAuthApp,
  OAuthGrant,
  WebhookDelivery,
  WebhookSubscription,
} from "@dawn/domain";
import type {
  AuditLogEntry,
  BankAccount,
  BankConnection,
  BusinessDocument,
  BusinessDocumentVersion,
  DawnRepository,
  DocumentExtraction,
  DocumentExtractionConfidence,
  DocumentExtractionFields,
  DocumentUrlSigner,
  HardNegativeTransactionMatch,
  InboxItem,
  InboxTransactionMatchSuggestion,
  InboxSource,
  InboxSourceType,
  JobRun,
  OutboxEvent,
  ProviderSyncRun,
  TeamAlias,
} from "@dawn/app";
import {
  createMockBankingProvider,
  createEmailInboxTokenCodec,
  createMockEmailInboxProvider,
  createMockFortnoxInvoiceProvider,
  createSandboxBankingProvider,
  createMockIntegrationProviders,
  createMockInvoiceEmailDeliveryProvider,
  createMockTicCompanyRolesProvider,
  createMockTicSignatureProvider,
  InboxConnector,
} from "@dawn/integrations";
import { signWebhookPayload } from "@dawn/app/webhook-signature";
import {
  createApiTestContext as testContext,
  createScopedActorApiTestContext,
  createUnauthenticatedApiTestContext,
  withSelectedTeam,
} from "./testkit/context";

type RecordedOutboxEvent = Parameters<DawnRepository["appendOutboxEvent"]>[0];

class MemoryTransactionReviewRepository extends MemoryAppRepository implements DawnRepository {
  declare auditEvents: AuditLogEntry[];
  declare outboxEvents: RecordedOutboxEvent[];
  bankAccounts = new Map<string, BankAccount>();
  bankConnections = new Map<string, BankConnection>();
  customers = new Map<string, Customer>();
  customerContacts = new Map<string, CustomerContact>();
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  extractions = new Map<string, DocumentExtraction>();
  inboxItems = new Map<string, InboxItem>();
  inboxSources = new Map<string, InboxSource>();
  invites = new Map<string, TeamInvite>();
  matchSuggestions = new Map<string, InboxTransactionMatchSuggestion>();
  products = new Map<string, Product>();
  invoices = new Map<string, InvoiceDraft>();
  invoicePayments = new Map<string, InvoicePayment>();
  invoiceEvents = new Map<string, InvoiceEvent>();
  recurringInvoices = new Map<string, RecurringInvoiceSchedule>();
  projects = new Map<string, Project>();
  projectMembers = new Map<string, ProjectMember>();
  timeEntries = new Map<string, TimeEntry>();
  businessInsights = new Map<string, BusinessInsight>();
  assistantThreads = new Map<string, AssistantThread>();
  assistantMessages = new Map<string, AssistantMessage>();
  assistantToolCalls = new Map<string, AssistantToolCall>();
  assistantApprovals = new Map<string, AssistantActionApproval>();
  automationRules = new Map<string, AutomationRule>();
  automationRuns = new Map<string, AutomationRun>();
  integrationConnections = new Map<string, IntegrationConnection & { tokenCiphertext: string }>();
  integrationSyncRuns = new Map<string, IntegrationSyncRun>();
  jobRuns = new Map<string, JobRun>();
  apiKeys = new Map<string, ApiKey & { keyHash: string }>();
  oauthApps = new Map<string, OAuthApp>();
  oauthGrants = new Map<string, OAuthGrant>();
  webhookSubscriptions = new Map<string, WebhookSubscription & { signingSecretHash: string }>();
  webhookDeliveries = new Map<string, WebhookDelivery>();
  outboxEventRecords = new Map<string, OutboxEvent>();
  aliases: TeamAlias[] = [];
  hardNegatives: HardNegativeTransactionMatch[] = [];
  attachments: { transactionId: string; documentId: string }[] = [];
  providerObjects = new Map<string, Record<string, unknown>>();
  providerObjectMappings = new Map<
    string,
    { internalEntityType?: string | null; internalEntityId?: string | null }
  >();
  syncRuns: ProviderSyncRun[] = [];
  teams = new Map<string, string>();
  users = new Map<string, { email: string; name: string }>();
  crmRecords = new Map<string, CrmRecord>();
  crmParties = new Map<string, Party>();
  crmOrganizations = new Map<string, Organization>();
  crmPeople = new Map<string, Person>();
  crmLegalEntities = new Map<string, LegalEntity>();
  crmAccounts = new Map<string, Account>();
  crmContacts = new Map<string, Contact>();
  crmOpportunities = new Map<string, Opportunity>();
  crmObjectTypeDefinitions = new Map<string, CrmObjectTypeDefinition>();
  crmFieldDefinitions = new Map<string, CrmFieldDefinition>();
  crmOptionSets = new Map<string, CrmOptionSet>();
  crmOptionValues = new Map<string, CrmOptionValue>();
  crmRecordFieldValues = new Map<string, CrmRecordFieldValue>();
  crmRecordGrants: CrmRecordGrant[] = [];
  crmFieldSecurityPolicies: CrmFieldSecurityPolicy[] = [];
  marketCompanies = new Map<string, MarketCompany>();
  marketCompanySnapshots = new Map<string, MarketCompanySnapshot>();
  marketProspects = new Map<string, MarketProspect>();
  commercialDocuments = new Map<string, CommercialDocument>();
  commercialDocumentLines = new Map<string, CommercialDocumentLine[]>();
  commercialDocumentVersions = new Map<string, CommercialDocumentVersion>();
  signatureRequests = new Map<string, SignatureRequest>();
  signatureParties = new Map<string, SignatureParty>();
  signatureEvidence = new Map<string, SignatureEvidence>();
  trustPolicies = new Map<string, TrustCheckPolicy>();
  trustChecks = new Map<string, TrustCheck>();
  invoiceHandoffPolicies = new Map<string, InvoiceHandoffPolicy>();
  invoiceHandoffs = new Map<string, InvoiceHandoff>();

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
    return callback(this);
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

  async appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) {
    this.auditEvents.push({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: new Date(
        Date.parse("2026-06-15T10:00:00.000Z") + this.auditEvents.length * 1000,
      ).toISOString(),
      ...input,
    });
  }

  async appendOutboxEvent(input: RecordedOutboxEvent) {
    this.outboxEvents.push(input);
  }

  async listAuditEvents(input: {
    teamId: string;
    limit: number;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, string>;
  }) {
    return this.auditEvents
      .filter((event) => event.teamId === input.teamId)
      .filter((event) => !input.action || event.action === input.action)
      .filter((event) => !input.entityType || event.entityType === input.entityType)
      .filter((event) => !input.entityId || event.entityId === input.entityId)
      .filter((event) => !input.requestId || event.requestId === input.requestId)
      .filter(
        (event) =>
          !input.metadata ||
          Object.entries(input.metadata).every(([key, value]) => event.metadata[key] === value),
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, input.limit);
  }

  async listOutboxEvents(teamId: string, limit: number) {
    return [...this.outboxEventRecords.values()]
      .filter((event) => event.teamId === teamId)
      .slice(0, limit);
  }

  async listJobRuns(teamId: string, limit: number) {
    return [...this.jobRuns.values()].filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listProviderSyncRuns(teamId: string, limit: number) {
    return this.syncRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listIntegrationSyncRuns(teamId: string, limit: number) {
    return [...this.integrationSyncRuns.values()]
      .filter((run) => run.teamId === teamId)
      .slice(0, limit);
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

  async getBankConnectionByProviderConnectionId(
    teamId: string,
    provider: BankConnection["provider"],
    providerConnectionId: string,
  ) {
    return (
      [...this.bankConnections.values()].find(
        (connection) =>
          connection.teamId === teamId &&
          connection.provider === provider &&
          connection.providerConnectionId === providerConnectionId,
      ) ?? null
    );
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
      tokenKeyId: input.providerConnection.token?.keyId ?? null,
      tokenLastFour: input.providerConnection.token?.lastFour ?? null,
      lastSyncAt: existing?.lastSyncAt ?? null,
      createdAt: existing?.createdAt ?? "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.bankConnections.set(connection.id, connection);
    return connection;
  }

  async disconnectBankConnection(input: { connectionId: string; disconnectedAt: Date }) {
    const existing = this.bankConnections.get(input.connectionId);

    if (!existing) {
      throw new Error("Connection not found");
    }

    const connection = {
      ...existing,
      status: "disconnected" as const,
      updatedAt: input.disconnectedAt.toISOString(),
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
    const key = `${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
    this.providerObjects.set(key, input.rawPayload);
    this.providerObjectMappings.set(key, {
      internalEntityType: input.internalEntityType ?? null,
      internalEntityId: input.internalEntityId ?? null,
    });
  }

  async getProviderObjectForTeam(input: Parameters<DawnRepository["getProviderObjectForTeam"]>[0]) {
    const key = `${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
    const rawPayload = this.providerObjects.get(key);
    const mapping = this.providerObjectMappings.get(key);

    return rawPayload
      ? {
          id: key,
          teamId: input.teamId,
          provider: input.provider,
          providerObjectType: input.providerObjectType,
          providerObjectId: input.providerObjectId,
          internalEntityType: mapping?.internalEntityType ?? null,
          internalEntityId: mapping?.internalEntityId ?? null,
          rawPayload,
        }
      : null;
  }

  async listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }) {
    return [...this.providerObjects.entries()]
      .map(([key, rawPayload]) => {
        const [provider, providerObjectType, ...providerObjectIdParts] = key.split(":");
        const mapping = this.providerObjectMappings.get(key);

        return {
          id: key,
          teamId: input.teamId,
          provider: provider ?? "",
          providerObjectType: providerObjectType ?? "",
          providerObjectId: providerObjectIdParts.join(":"),
          internalEntityType: mapping?.internalEntityType ?? null,
          internalEntityId: mapping?.internalEntityId ?? null,
          rawPayload,
        };
      })
      .filter((object) => object.provider === input.provider)
      .filter((object) => input.providerObjectTypes.includes(object.providerObjectType));
  }

  async listDocuments(teamId: string) {
    return [...this.documents.values()].filter((document) => document.teamId === teamId);
  }

  async listInboxItems(teamId: string) {
    return [...this.inboxItems.values()].filter((item) => item.teamId === teamId);
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

  async ensureInboxSource(input: {
    sourceId: string;
    teamId: string;
    type: InboxSourceType;
    name: string;
  }) {
    const existing = [...this.inboxSources.values()].find(
      (source) =>
        source.teamId === input.teamId && source.type === input.type && source.name === input.name,
    );

    if (existing) {
      return existing;
    }

    const source: InboxSource = {
      id: input.sourceId,
      teamId: input.teamId,
      type: input.type,
      name: input.name,
      createdAt: "2026-06-15T10:00:00.000Z",
    };
    this.inboxSources.set(source.id, source);
    return source;
  }

  async createInboxItemForDocumentUpload(input: {
    inboxItemId: string;
    sourceId: string;
    teamId: string;
    documentId: string;
    documentVersionId: string;
    createdByActorId: string;
  }) {
    const source = this.inboxSources.get(input.sourceId) ?? null;
    const document = this.documents.get(input.documentId) ?? null;
    const inboxItem: InboxItem = {
      id: input.inboxItemId,
      teamId: input.teamId,
      sourceId: input.sourceId,
      sourceType: "document_upload",
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      status: "pending_extraction",
      extractionStatus: "pending",
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
      source,
      document,
      latestExtraction: null,
    };
    this.inboxItems.set(inboxItem.id, inboxItem);
    return inboxItem;
  }

  async getInboxItemForTeam(teamId: string, inboxItemId: string) {
    const item = this.inboxItems.get(inboxItemId);
    return item?.teamId === teamId ? item : null;
  }

  async createDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    documentId: string;
    documentVersionId: string;
    source: "local_deterministic";
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    rawText?: string | null;
    createdByActorId: string;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem) {
      throw new Error("Inbox item not found");
    }

    const extraction: DocumentExtraction = {
      id: input.extractionId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      extractionVersion: this.extractions.size + 1,
      source: input.source,
      status: "completed",
      fields: input.fields,
      confidence: input.confidence,
      rawText: input.rawText ?? null,
      error: null,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:02:00.000Z",
    };
    const updatedInboxItem: InboxItem = {
      ...inboxItem,
      status: "needs_review",
      extractionStatus: "completed",
      latestExtraction: extraction,
      updatedAt: "2026-06-15T10:02:00.000Z",
    };
    this.extractions.set(extraction.id, extraction);
    this.inboxItems.set(updatedInboxItem.id, updatedInboxItem);
    return { inboxItem: updatedInboxItem, extraction };
  }

  async createCorrectedDocumentExtraction(input: {
    extractionId: string;
    teamId: string;
    inboxItemId: string;
    fields: DocumentExtractionFields;
    confidence: DocumentExtractionConfidence;
    createdByActorId: string;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem) {
      throw new Error("Inbox item not found");
    }

    const extraction: DocumentExtraction = {
      id: input.extractionId,
      teamId: input.teamId,
      inboxItemId: input.inboxItemId,
      documentId: inboxItem.documentId,
      documentVersionId: inboxItem.documentVersionId,
      extractionVersion: this.extractions.size + 1,
      source: "user_correction",
      status: "completed",
      fields: input.fields,
      confidence: input.confidence,
      rawText: inboxItem.latestExtraction?.rawText ?? null,
      error: null,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:03:00.000Z",
    };
    const updatedInboxItem = { ...inboxItem, latestExtraction: extraction };
    this.extractions.set(extraction.id, extraction);
    this.inboxItems.set(updatedInboxItem.id, updatedInboxItem);
    return { inboxItem: updatedInboxItem, extraction };
  }

  async markDocumentExtractionFailed(input: {
    teamId: string;
    inboxItemId: string;
    error: string;
    failedAt: Date;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem || inboxItem.teamId !== input.teamId) {
      throw new Error(input.error);
    }

    const updated = {
      ...inboxItem,
      extractionStatus: "failed" as const,
      updatedAt: input.failedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }

  async markDocumentExtractionPending(input: {
    teamId: string;
    inboxItemId: string;
    requestedAt: Date;
  }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem || inboxItem.teamId !== input.teamId) {
      throw new Error("Inbox item not found");
    }

    const updated = {
      ...inboxItem,
      status: "pending_extraction" as const,
      extractionStatus: "pending" as const,
      updatedAt: input.requestedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }

  async dismissInboxItem(input: { teamId: string; inboxItemId: string; dismissedAt: Date }) {
    const inboxItem = this.inboxItems.get(input.inboxItemId);

    if (!inboxItem || inboxItem.teamId !== input.teamId) {
      throw new Error("Inbox item not found");
    }

    const updated = {
      ...inboxItem,
      status: "dismissed" as const,
      updatedAt: input.dismissedAt.toISOString(),
    };
    this.inboxItems.set(updated.id, updated);
    return updated;
  }

  async listTeamAliases(teamId: string) {
    return this.aliases.filter((alias) => alias.teamId === teamId);
  }

  async listTeamMatchFeedback() {
    return [];
  }

  async listHardNegativeMatches(teamId: string, inboxItemId: string) {
    return this.hardNegatives.filter(
      (match) => match.teamId === teamId && match.inboxItemId === inboxItemId,
    );
  }

  async listTransactionMatchCandidatesForInboxItem(input: {
    teamId: string;
    inboxItem: InboxItem;
    limit: number;
  }) {
    return [...this.transactions.values()]
      .filter((transaction) => transaction.teamId === input.teamId)
      .filter(
        (transaction) =>
          !this.attachments.some(
            (attachment) =>
              attachment.documentId === input.inboxItem.documentId ||
              attachment.transactionId === transaction.id,
          ),
      )
      .filter(
        (transaction) =>
          ![...this.matchSuggestions.values()].some(
            (suggestion) =>
              suggestion.teamId === input.teamId &&
              suggestion.inboxItemId === input.inboxItem.id &&
              suggestion.transactionId === transaction.id &&
              (suggestion.status === "suggested" || suggestion.status === "accepted"),
          ),
      )
      .sort(
        (left, right) =>
          right.postedAt.localeCompare(left.postedAt) || left.id.localeCompare(right.id),
      )
      .slice(0, input.limit)
      .map((transaction) => ({
        transaction,
        providerReference: transaction.providerTransactionId,
      }));
  }

  async listInboxMatchCandidatesForTransaction(input: {
    teamId: string;
    transaction: Transaction;
    limit: number;
  }) {
    return [...this.inboxItems.values()]
      .filter((item) => item.teamId === input.teamId)
      .filter(
        (item) =>
          item.status === "needs_review" &&
          item.extractionStatus === "completed" &&
          Boolean(item.latestExtraction),
      )
      .filter(
        (item) =>
          !this.attachments.some(
            (attachment) =>
              attachment.documentId === item.documentId ||
              attachment.transactionId === input.transaction.id,
          ),
      )
      .filter(
        (item) =>
          ![...this.matchSuggestions.values()].some(
            (suggestion) =>
              suggestion.teamId === input.teamId &&
              suggestion.inboxItemId === item.id &&
              suggestion.transactionId === input.transaction.id &&
              (suggestion.status === "suggested" || suggestion.status === "accepted"),
          ),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit);
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: InboxMatchSuggestion[];
  }) {
    const persisted = input.suggestions.map((suggestion, index) => {
      const existing = [...this.matchSuggestions.values()].find(
        (record) =>
          record.teamId === input.teamId &&
          record.inboxItemId === input.inboxItemId &&
          record.transactionId === suggestion.transactionId,
      );
      const record: InboxTransactionMatchSuggestion = {
        id: existing?.id ?? `match_${this.matchSuggestions.size + index + 1}`,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        transactionId: suggestion.transactionId,
        score: suggestion.score,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
        signals: suggestion.signals,
        signalDetails: suggestion.signalDetails,
        thresholds: suggestion.thresholds,
        calibration: suggestion.calibration ?? null,
        matchType: suggestion.matchType,
        status: existing?.status === "expired" ? "suggested" : (existing?.status ?? "suggested"),
        createdAt: existing?.createdAt ?? "2026-06-15T10:04:00.000Z",
        updatedAt: "2026-06-15T10:04:00.000Z",
        transaction: this.transactions.get(suggestion.transactionId) ?? null,
      };
      this.matchSuggestions.set(record.id, record);
      return record;
    });
    const item = this.inboxItems.get(input.inboxItemId);

    if (item?.teamId === input.teamId) {
      this.inboxItems.set(item.id, { ...item, matchSuggestions: persisted });
    }

    return persisted;
  }

  async getInboxMatchSuggestionForTeam(teamId: string, suggestionId: string) {
    const suggestion = this.matchSuggestions.get(suggestionId);
    return suggestion?.teamId === teamId ? suggestion : null;
  }

  async acceptInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    actorId: string;
  }) {
    const suggestion = this.matchSuggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const item = this.inboxItems.get(suggestion.inboxItemId);

    if (!item) {
      throw new Error("Inbox item not found");
    }

    const accepted = { ...suggestion, status: "accepted" as const };
    this.matchSuggestions.set(accepted.id, accepted);
    for (const [id, candidate] of this.matchSuggestions) {
      if (
        candidate.teamId === input.teamId &&
        candidate.inboxItemId === accepted.inboxItemId &&
        candidate.id !== accepted.id &&
        candidate.status === "suggested"
      ) {
        this.matchSuggestions.set(id, {
          ...candidate,
          status: "expired",
          updatedAt: "2026-06-15T10:04:00.000Z",
        });
      }
    }
    this.attachments.push({
      transactionId: accepted.transactionId,
      documentId: item.documentId,
    });

    if (item.latestExtraction?.fields.merchantName && accepted.transaction?.description) {
      this.aliases.push({
        id: `alias_${this.aliases.length + 1}`,
        teamId: input.teamId,
        source: item.latestExtraction.fields.merchantName,
        target: accepted.transaction.description,
        createdAt: "2026-06-15T10:04:00.000Z",
      });
    }

    const updatedItem = {
      ...item,
      status: "resolved" as const,
      matchSuggestions: [accepted],
      updatedAt: "2026-06-15T10:04:00.000Z",
    };
    this.inboxItems.set(updatedItem.id, updatedItem);

    return { suggestion: accepted, inboxItem: updatedItem };
  }

  async rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
    actorId: string;
  }) {
    const suggestion = this.matchSuggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const rejected = { ...suggestion, status: "rejected" as const };
    this.matchSuggestions.set(rejected.id, rejected);

    if (suggestion.status === "accepted") {
      const item = this.inboxItems.get(suggestion.inboxItemId);
      this.attachments = this.attachments.filter(
        (attachment) =>
          attachment.documentId !== item?.documentId ||
          attachment.transactionId !== suggestion.transactionId,
      );

      if (item) {
        this.inboxItems.set(item.id, {
          ...item,
          status: "needs_review",
          matchSuggestions: [rejected],
          updatedAt: "2026-06-15T10:04:00.000Z",
        });
      }
    }

    this.hardNegatives.push({
      id: `negative_${this.hardNegatives.length + 1}`,
      teamId: input.teamId,
      inboxItemId: rejected.inboxItemId,
      transactionId: rejected.transactionId,
      reason: input.reason,
      createdAt: "2026-06-15T10:04:00.000Z",
    });

    return rejected;
  }

  async listCustomers(teamId: string) {
    return [...this.customers.values()].filter((customer) => customer.teamId === teamId);
  }

  async listCustomerContacts(teamId: string) {
    return [...this.customerContacts.values()].filter((contact) => contact.teamId === teamId);
  }

  async listProducts(teamId: string) {
    return [...this.products.values()].filter((product) => product.teamId === teamId);
  }

  async listInvoices(teamId: string) {
    return [...this.invoices.values()].filter((invoice) => invoice.teamId === teamId);
  }

  async listDraftInvoices(teamId: string) {
    return [...this.invoices.values()].filter(
      (invoice) => invoice.teamId === teamId && invoice.status === "draft",
    );
  }

  async listInvoicePayments(teamId: string) {
    return [...this.invoicePayments.values()].filter((payment) => payment.teamId === teamId);
  }

  async listRecurringInvoiceSchedules(teamId: string) {
    return [...this.recurringInvoices.values()].filter((schedule) => schedule.teamId === teamId);
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const customer = this.customers.get(customerId);
    return customer?.teamId === teamId ? customer : null;
  }

  async getCustomerContactForCustomer(teamId: string, customerId: string) {
    return (
      [...this.customerContacts.values()].find(
        (contact) => contact.teamId === teamId && contact.customerId === customerId,
      ) ?? null
    );
  }

  async getProductForTeam(teamId: string, productId: string) {
    const product = this.products.get(productId);
    return product?.teamId === teamId ? product : null;
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    return invoice?.teamId === teamId ? invoice : null;
  }

  async getRecurringInvoiceScheduleForTeam(teamId: string, scheduleId: string) {
    const schedule = this.recurringInvoices.get(scheduleId);
    return schedule?.teamId === teamId ? schedule : null;
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
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const customer: Customer = {
      id: input.customerId,
      teamId: input.teamId,
      name: input.name,
      email: input.email ?? null,
      billingAddress: input.billingAddress ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const contact =
      input.contactId && input.contactName && input.contactEmail
        ? {
            id: input.contactId,
            teamId: input.teamId,
            customerId: input.customerId,
            name: input.contactName,
            email: input.contactEmail,
            role: input.contactRole ?? null,
            createdAt: now,
          }
        : null;
    this.customers.set(customer.id, customer);

    if (contact) {
      this.customerContacts.set(contact.id, contact);
    }

    return { customer, contact };
  }

  async createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: Product["type"];
    description?: string | null;
    unitPrice: Product["unitPrice"];
    defaultTaxRateBasisPoints: number;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const product: Product = {
      id: input.productId,
      teamId: input.teamId,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      unitPrice: input.unitPrice,
      defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints,
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    return product;
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
  }) {
    const invoice = this.invoiceFromInput(input.invoiceId, input, input.createdByActorId);
    this.invoices.set(invoice.id, invoice);
    return invoice;
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
  }) {
    const existing = this.invoices.get(input.invoiceId);
    const invoice = this.invoiceFromInput(
      input.invoiceId,
      input,
      existing?.createdByActorId ?? "user_1",
    );
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }) {
    const invoice = this.invoices.get(input.invoiceId);

    if (!invoice || invoice.teamId !== input.teamId) {
      throw new Error("Invoice was not sent");
    }

    const sent: InvoiceDraft = {
      ...invoice,
      status: "sent",
      sentAt: input.sentAt,
      deliveryToEmail: input.toEmail,
      deliveryProviderMessageId: input.providerMessageId,
      updatedAt: input.sentAt,
    };
    this.invoices.set(sent.id, sent);
    return sent;
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
  }) {
    const invoice = this.invoices.get(input.invoiceId);

    if (!invoice || invoice.teamId !== input.teamId) {
      throw new Error("Invoice payment did not update invoice");
    }

    const payment: InvoicePayment = {
      id: input.paymentId,
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      paidAt: input.paidAt,
      method: input.method ?? null,
      note: input.note ?? null,
      createdByActorId: input.createdByActorId,
      createdAt: input.paidAt,
    };
    const updated: InvoiceDraft = {
      ...invoice,
      status: input.nextInvoiceStatus,
      amountPaid: input.nextAmountPaid,
      paidAt: input.invoicePaidAt ?? null,
      updatedAt: input.paidAt,
    };
    this.invoicePayments.set(payment.id, payment);
    this.invoices.set(updated.id, updated);
    return { invoice: updated, payment };
  }

  async createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: InvoiceEvent["type"];
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }) {
    const event: InvoiceEvent = {
      id: input.eventId,
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      type: input.type,
      occurredAt: input.occurredAt,
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    };
    this.invoiceEvents.set(event.id, event);
    return event;
  }

  async createRecurringInvoiceSchedule(input: {
    scheduleId: string;
    teamId: string;
    sourceInvoiceId: string;
    customerId: string;
    frequency: RecurringInvoiceSchedule["frequency"];
    nextRunAt: string;
    createdByActorId: string;
  }) {
    const schedule: RecurringInvoiceSchedule = {
      id: input.scheduleId,
      teamId: input.teamId,
      sourceInvoiceId: input.sourceInvoiceId,
      customerId: input.customerId,
      frequency: input.frequency,
      nextRunAt: input.nextRunAt,
      status: "active",
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.recurringInvoices.set(schedule.id, schedule);
    return schedule;
  }

  async generateRecurringInvoice(input: {
    invoiceId: string;
    teamId: string;
    scheduleId: string;
    sourceInvoice: InvoiceDraft;
    runAt: string;
    nextRunAt: string;
    createdByActorId: string;
  }) {
    const schedule = this.recurringInvoices.get(input.scheduleId);

    if (!schedule || schedule.teamId !== input.teamId) {
      throw new Error("Recurring invoice schedule was not updated");
    }

    const invoice = this.invoiceFromInput(
      input.invoiceId,
      {
        teamId: input.teamId,
        customerId: input.sourceInvoice.customerId,
        invoiceNumber: `${input.sourceInvoice.invoiceNumber}-R20260715`,
        issueDate: input.runAt,
        dueDate: input.sourceInvoice.dueDate,
        currency: input.sourceInvoice.currency,
        discountBasisPoints: input.sourceInvoice.discountBasisPoints,
        notes: input.sourceInvoice.notes,
        lines: input.sourceInvoice.lines,
      },
      input.createdByActorId,
    );
    const nextSchedule = { ...schedule, nextRunAt: input.nextRunAt, updatedAt: input.runAt };
    this.invoices.set(invoice.id, invoice);
    this.recurringInvoices.set(nextSchedule.id, nextSchedule);
    return { invoice, schedule: nextSchedule };
  }

  async listProjects(teamId: string) {
    return [...this.projects.values()].filter((project) => project.teamId === teamId);
  }

  async listProjectsForSync(input: { teamId: string; cursor?: string | null }) {
    const cursorTime = input.cursor ? new Date(input.cursor).getTime() : null;

    return [...this.projects.values()]
      .filter((project) => project.teamId === input.teamId)
      .filter((project) => {
        if (cursorTime === null) {
          return true;
        }

        return project.updatedAt ? new Date(project.updatedAt).getTime() > cursorTime : false;
      })
      .sort(
        (left, right) =>
          new Date(left.updatedAt ?? 0).getTime() - new Date(right.updatedAt ?? 0).getTime(),
      );
  }

  async listProjectMembers(teamId: string) {
    return [...this.projectMembers.values()].filter((member) => member.teamId === teamId);
  }

  async listTimeEntries(teamId: string) {
    return [...this.timeEntries.values()].filter((entry) => entry.teamId === teamId);
  }

  async getProjectForTeam(teamId: string, projectId: string) {
    const project = this.projects.get(projectId);
    return project?.teamId === teamId ? project : null;
  }

  async getTimeEntriesForTeam(teamId: string, timeEntryIds: string[]) {
    return timeEntryIds
      .map((timeEntryId) => this.timeEntries.get(timeEntryId))
      .filter((entry): entry is TimeEntry => entry !== undefined && entry.teamId === teamId);
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
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const project: Project = {
      id: input.projectId,
      teamId: input.teamId,
      customerId: input.customerId,
      name: input.name,
      description: input.description ?? null,
      status: "active",
      billableRate: input.billableRate,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    const member: ProjectMember = {
      id: input.memberId,
      teamId: input.teamId,
      projectId: input.projectId,
      actorId: input.createdByActorId,
      role: "manager",
      billableRate: input.billableRate,
      createdAt: now,
    };
    this.projects.set(project.id, project);
    this.projectMembers.set(member.id, member);
    return { project, member };
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
  }) {
    const timeEntry: TimeEntry = {
      id: input.timeEntryId,
      teamId: input.teamId,
      projectId: input.projectId,
      actorId: input.actorId,
      description: input.description,
      occurredOn: input.occurredOn,
      durationMinutes: input.durationMinutes,
      billableStatus: input.billableStatus,
      billableRate: input.billableRate ?? null,
      invoiceId: null,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.timeEntries.set(timeEntry.id, timeEntry);
    return timeEntry;
  }

  async markTimeEntriesInvoiced(input: {
    teamId: string;
    timeEntryIds: string[];
    invoiceId: string;
  }) {
    return input.timeEntryIds.map((timeEntryId) => {
      const entry = this.timeEntries.get(timeEntryId);

      if (!entry || entry.teamId !== input.teamId) {
        throw new Error("Time entry not found");
      }

      const invoiced: TimeEntry = {
        ...entry,
        billableStatus: "invoiced",
        invoiceId: input.invoiceId,
      };
      this.timeEntries.set(invoiced.id, invoiced);
      return invoiced;
    });
  }

  async listBusinessInsights(input: { teamId: string; from?: string | null; to?: string | null }) {
    return [...this.businessInsights.values()].filter(
      (insight) =>
        insight.teamId === input.teamId &&
        (!input.from || new Date(insight.periodEnd).getTime() >= new Date(input.from).getTime()) &&
        (!input.to || new Date(insight.periodStart).getTime() <= new Date(input.to).getTime()),
    );
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
  }) {
    const insights = input.insights.map((insight) => ({
      id: insight.insightId,
      teamId: input.teamId,
      title: insight.title,
      summary: insight.summary,
      severity: insight.severity,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sourceRefs: insight.sourceRefs,
      createdAt: insight.createdAt,
    }));

    for (const insight of insights) {
      this.businessInsights.set(insight.id, insight);
    }

    return insights;
  }

  async listAssistantThreads(teamId: string) {
    return [...this.assistantThreads.values()]
      .filter((thread) => thread.teamId === teamId)
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
  }

  async getAssistantThreadForTeam(teamId: string, threadId: string) {
    const thread = this.assistantThreads.get(threadId);
    return thread?.teamId === teamId ? thread : null;
  }

  async listAssistantMessages(threadId: string) {
    return [...this.assistantMessages.values()]
      .filter((message) => message.threadId === threadId)
      .sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
  }

  async listAssistantToolCalls(threadId: string) {
    return [...this.assistantToolCalls.values()]
      .filter((toolCall) => toolCall.threadId === threadId)
      .sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
  }

  async createAssistantThread(input: {
    threadId: string;
    teamId: string;
    title: string;
    createdByActorId: string;
    createdAt: string;
  }) {
    const thread = {
      id: input.threadId,
      teamId: input.teamId,
      title: input.title,
      createdByActorId: input.createdByActorId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.assistantThreads.set(thread.id, thread);
    return thread;
  }

  async createAssistantMessage(input: {
    messageId: string;
    threadId: string;
    teamId: string;
    role: AssistantMessage["role"];
    content: string;
    sourceRefs: ReportSourceRef[];
    createdAt: string;
  }) {
    const message = {
      id: input.messageId,
      threadId: input.threadId,
      teamId: input.teamId,
      role: input.role,
      content: input.content,
      sourceRefs: input.sourceRefs,
      createdAt: input.createdAt,
    };
    const thread = this.assistantThreads.get(input.threadId);

    if (thread) {
      this.assistantThreads.set(thread.id, { ...thread, updatedAt: input.createdAt });
    }

    this.assistantMessages.set(message.id, message);
    return message;
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
  }) {
    const toolCalls = input.toolCalls.map((toolCall) => ({
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
      createdAt: toolCall.createdAt,
    }));

    for (const toolCall of toolCalls) {
      this.assistantToolCalls.set(toolCall.id, toolCall);
    }

    return toolCalls;
  }

  async listPendingAssistantActionApprovals(teamId: string) {
    return [...this.assistantApprovals.values()].filter(
      (approval) => approval.teamId === teamId && approval.status === "pending",
    );
  }

  async listAssistantActionApprovals(threadId: string) {
    return [...this.assistantApprovals.values()].filter(
      (approval) => approval.threadId === threadId,
    );
  }

  async getAssistantActionApprovalForTeam(teamId: string, approvalId: string) {
    const approval = this.assistantApprovals.get(approvalId);
    return approval?.teamId === teamId ? approval : null;
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
  }) {
    const approval = {
      id: input.approvalId,
      threadId: input.threadId,
      requestedByMessageId: input.requestedByMessageId,
      teamId: input.teamId,
      toolName: input.toolName,
      risk: input.risk,
      status: "pending" as const,
      input: input.input,
      preview: input.preview,
      result: null,
      sourceRefs: input.sourceRefs,
      requestedByActorId: input.requestedByActorId,
      approvedByActorId: null,
      rejectedByActorId: null,
      createdAt: input.createdAt,
      decidedAt: null,
      executedAt: null,
    };
    this.assistantApprovals.set(approval.id, approval);
    return approval;
  }

  async markAssistantActionApprovalRejected(input: {
    teamId: string;
    approvalId: string;
    rejectedByActorId: string;
    decidedAt: string;
  }) {
    const approval = this.assistantApprovals.get(input.approvalId);

    if (!approval || approval.teamId !== input.teamId || approval.status !== "pending") {
      throw new Error("Approval not found");
    }

    const rejected = {
      ...approval,
      status: "rejected" as const,
      rejectedByActorId: input.rejectedByActorId,
      decidedAt: input.decidedAt,
    };
    this.assistantApprovals.set(rejected.id, rejected);
    return rejected;
  }

  async markAssistantActionApprovalExecuted(input: {
    teamId: string;
    approvalId: string;
    approvedByActorId: string;
    result: Record<string, unknown>;
    decidedAt: string;
    executedAt: string;
  }) {
    const approval = this.assistantApprovals.get(input.approvalId);

    if (!approval || approval.teamId !== input.teamId || approval.status !== "pending") {
      throw new Error("Approval not found");
    }

    const executed = {
      ...approval,
      status: "executed" as const,
      approvedByActorId: input.approvedByActorId,
      result: input.result,
      decidedAt: input.decidedAt,
      executedAt: input.executedAt,
    };
    this.assistantApprovals.set(executed.id, executed);
    return executed;
  }

  async listAutomationRules(teamId: string) {
    return [...this.automationRules.values()].filter((rule) => rule.teamId === teamId);
  }

  async listAutomationRuns(teamId: string, limit: number) {
    return [...this.automationRuns.values()].filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listEnabledAutomationRulesForEvent(input: { teamId: string; eventType: string }) {
    return [...this.automationRules.values()].filter(
      (rule) =>
        rule.teamId === input.teamId && rule.enabled && rule.trigger.eventType === input.eventType,
    );
  }

  async getOutboxEventForTeam(teamId: string, outboxEventId: string) {
    const event = this.outboxEventRecords.get(outboxEventId);
    return event?.teamId === teamId ? event : null;
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
  }) {
    const now = new Date().toISOString();
    const rule = {
      id: input.ruleId,
      teamId: input.teamId,
      name: input.name,
      enabled: true,
      trigger: input.trigger,
      actionType: input.actionType,
      actionConfig: input.actionConfig,
      approvalPolicy: input.approvalPolicy,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    this.automationRules.set(rule.id, rule);
    return rule;
  }

  async createAutomationRun(input: {
    runId: string;
    teamId: string;
    ruleId: string;
    sourceOutboxEventId: string;
    status: AutomationRun["status"];
    actionType: AutomationRun["actionType"];
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    error?: string | null;
    startedAt: string;
    finishedAt?: string | null;
  }) {
    const run = {
      id: input.runId,
      teamId: input.teamId,
      ruleId: input.ruleId,
      sourceOutboxEventId: input.sourceOutboxEventId,
      status: input.status,
      actionType: input.actionType,
      input: input.input,
      output: input.output,
      error: input.error ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
    };
    this.automationRuns.set(run.id, run);
    return run;
  }

  async listApiKeys(teamId: string) {
    return [...this.apiKeys.values()].filter((apiKey) => apiKey.teamId === teamId);
  }

  async listOAuthApps(teamId: string) {
    return [...this.oauthApps.values()].filter((app) => app.teamId === teamId);
  }

  async listOAuthGrants(teamId: string) {
    return [...this.oauthGrants.values()].filter((grant) => grant.teamId === teamId);
  }

  async listWebhookSubscriptions(teamId: string) {
    return [...this.webhookSubscriptions.values()].filter(
      (subscription) => subscription.teamId === teamId,
    );
  }

  async listWebhookDeliveries(teamId: string, limit: number) {
    return [...this.webhookDeliveries.values()]
      .filter((delivery) => delivery.teamId === teamId)
      .slice(0, limit);
  }

  async getApiKeyByHash(keyHash: string) {
    return [...this.apiKeys.values()].find((apiKey) => apiKey.keyHash === keyHash) ?? null;
  }

  async getOAuthAppForTeam(teamId: string, appId: string) {
    const app = this.oauthApps.get(appId);
    return app?.teamId === teamId ? app : null;
  }

  async markApiKeyUsed(input: { apiKeyId: string; lastUsedAt: string }) {
    const apiKey = this.apiKeys.get(input.apiKeyId);

    if (apiKey) {
      this.apiKeys.set(apiKey.id, { ...apiKey, lastUsedAt: input.lastUsedAt });
    }
  }

  async createApiKey(input: {
    apiKeyId: string;
    teamId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKey["scopes"];
    createdByActorId: string;
  }) {
    const apiKey = {
      id: input.apiKeyId,
      teamId: input.teamId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      createdByActorId: input.createdByActorId,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-06-15T10:00:00.000Z",
    };
    this.apiKeys.set(apiKey.id, apiKey);
    return apiKey;
  }

  async createOAuthApp(input: {
    appId: string;
    teamId: string;
    name: string;
    redirectUris: string[];
    scopes: OAuthApp["scopes"];
    createdByActorId: string;
  }) {
    const app = {
      id: input.appId,
      teamId: input.teamId,
      name: input.name,
      redirectUris: input.redirectUris,
      scopes: input.scopes,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.oauthApps.set(app.id, app);
    return app;
  }

  async createOAuthGrant(input: {
    grantId: string;
    teamId: string;
    appId: string;
    actorId: string;
    scopes: OAuthGrant["scopes"];
  }) {
    const grant = {
      id: input.grantId,
      teamId: input.teamId,
      appId: input.appId,
      actorId: input.actorId,
      scopes: input.scopes,
      revokedAt: null,
      createdAt: "2026-06-15T10:00:00.000Z",
    };
    this.oauthGrants.set(grant.id, grant);
    return grant;
  }

  async createWebhookSubscription(input: {
    subscriptionId: string;
    teamId: string;
    url: string;
    eventTypes: string[];
    signingSecretHash: string;
    createdByActorId: string;
  }) {
    const subscription = {
      id: input.subscriptionId,
      teamId: input.teamId,
      url: input.url,
      eventTypes: input.eventTypes,
      signingSecretHash: input.signingSecretHash,
      status: "active" as const,
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.webhookSubscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async listActiveWebhookSubscriptionsForEvent(input: { teamId: string; eventType: string }) {
    return [...this.webhookSubscriptions.values()].filter(
      (subscription) =>
        subscription.teamId === input.teamId &&
        subscription.status === "active" &&
        subscription.eventTypes.includes(input.eventType),
    );
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
  }) {
    const delivery = {
      id: input.deliveryId,
      teamId: input.teamId,
      subscriptionId: input.subscriptionId,
      outboxEventId: input.outboxEventId,
      status: input.status,
      attempt: input.attempt,
      requestPayload: input.requestPayload,
      responseStatus: input.responseStatus ?? null,
      responseBody: input.responseBody ?? null,
      error: input.error ?? null,
      nextAttemptAt: input.nextAttemptAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.webhookDeliveries.set(delivery.id, delivery);
    return delivery;
  }

  async listIntegrationConnectionSummaries(teamId: string) {
    return [...this.integrationConnections.values()]
      .filter((connection) => connection.teamId === teamId)
      .map((connection) => ({
        connection,
        latestSyncRun:
          [...this.integrationSyncRuns.values()]
            .filter((run) => run.integrationConnectionId === connection.id)
            .at(-1) ?? null,
      }));
  }

  async listIntegrationConnectionsForTeam(teamId: string) {
    return [...this.integrationConnections.values()].filter(
      (connection) => connection.teamId === teamId,
    );
  }

  async listEmailInboxSyncCandidateConnections() {
    return [...this.integrationConnections.values()].filter(
      (connection) => connection.category === "email" && connection.status === "connected",
    );
  }

  async getIntegrationConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.integrationConnections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async getIntegrationConnectionSecretsForTeam(teamId: string, connectionId: string) {
    const connection = this.integrationConnections.get(connectionId);

    return connection?.teamId === teamId
      ? {
          token: {
            encryptedToken: connection.tokenCiphertext,
            keyId: connection.tokenKeyId,
            lastFour: connection.tokenLastFour,
          },
          rawPayload: connection.rawPayload ?? {},
        }
      : null;
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
  }) {
    const existing = [...this.integrationConnections.values()].find(
      (connection) =>
        connection.teamId === input.teamId &&
        connection.provider === input.provider &&
        connection.providerConnectionId === input.providerConnectionId,
    );
    const now = "2026-06-15T10:00:00.000Z";
    const connection = {
      id: existing?.id ?? input.connectionId,
      teamId: input.teamId,
      category: input.category,
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      displayName: input.displayName,
      status: "connected" as const,
      capabilities: input.capabilities,
      tokenCiphertext: input.tokenCiphertext,
      tokenKeyId: input.tokenKeyId,
      tokenLastFour: input.tokenLastFour,
      rawPayload: input.rawPayload,
      lastSyncAt: null,
      lastError: null,
      disabledAt: null,
      createdByActorId: input.createdByActorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.integrationConnections.set(connection.id, connection);
    return connection;
  }

  async updateIntegrationConnectionTokenAndRawPayload(input: {
    connectionId: string;
    token?: { encryptedToken: string; keyId: string; lastFour: string } | null;
    rawPayload: Record<string, unknown>;
    status?: IntegrationConnection["status"];
    lastError?: string | null;
    lastSyncAt?: Date | null;
  }) {
    const connection = this.integrationConnections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const updated = {
      ...connection,
      tokenCiphertext: input.token?.encryptedToken ?? connection.tokenCiphertext,
      tokenKeyId: input.token?.keyId ?? connection.tokenKeyId,
      tokenLastFour: input.token?.lastFour ?? connection.tokenLastFour,
      rawPayload: input.rawPayload,
      status: input.status ?? connection.status,
      lastError: input.lastError ?? connection.lastError,
      lastSyncAt: input.lastSyncAt?.toISOString() ?? connection.lastSyncAt,
    };
    this.integrationConnections.set(updated.id, updated);
    return updated;
  }

  async createIntegrationSyncRun(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }) {
    const syncRun = {
      id: input.syncRunId,
      teamId: input.teamId,
      integrationConnectionId: input.integrationConnectionId,
      category: input.category,
      provider: input.provider,
      status: "running" as const,
      startedAt: "2026-06-15T10:00:00.000Z",
      completedAt: null,
      recordsSynced: 0,
      error: null,
      rawPayload: {},
    };
    this.integrationSyncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async createEmailInboxSyncRunIfIdle(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }) {
    const running = [...this.integrationSyncRuns.values()].find(
      (syncRun) =>
        syncRun.integrationConnectionId === input.integrationConnectionId &&
        syncRun.status === "running",
    );

    if (running) {
      return null;
    }

    return this.createIntegrationSyncRun(input);
  }

  async finishIntegrationSyncRun(input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const existing = this.integrationSyncRuns.get(input.syncRunId);

    if (!existing) {
      throw new Error("missing sync run");
    }

    const syncRun = {
      ...existing,
      status: input.status,
      completedAt: "2026-06-15T10:01:00.000Z",
      recordsSynced: input.recordsSynced,
      error: input.error ?? null,
      rawPayload: input.rawPayload,
    };
    this.integrationSyncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async markIntegrationConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: IntegrationConnection["status"];
    lastError?: string | null;
  }) {
    const connection = this.integrationConnections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const updated = {
      ...connection,
      status: input.status,
      lastSyncAt: input.syncedAt.toISOString(),
      lastError: input.lastError ?? null,
    };
    this.integrationConnections.set(updated.id, updated);
    return updated;
  }

  async disableIntegrationConnection(input: { connectionId: string; disabledAt: Date }) {
    const connection = this.integrationConnections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const disabled = {
      ...connection,
      status: "disabled" as const,
      disabledAt: input.disabledAt.toISOString(),
    };
    this.integrationConnections.set(disabled.id, disabled);
    return disabled;
  }

  private invoiceFromInput(
    invoiceId: string,
    input: {
      teamId: string;
      customerId: string;
      invoiceNumber: string;
      issueDate: string;
      dueDate?: string | null;
      currency: string;
      discountBasisPoints: number;
      notes?: string | null;
      lines: InvoiceLineDraft[];
    },
    createdByActorId: string,
  ): InvoiceDraft {
    const calculated = calculateFixtureInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });

    return {
      id: invoiceId,
      teamId: input.teamId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      status: "draft",
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      notes: input.notes ?? null,
      lines: input.lines.map((line, index) => ({
        id: `line_${index + 1}`,
        invoiceId,
        productId: line.productId ?? null,
        description: line.description,
        quantityMilli: line.quantityMilli,
        unitPrice: line.unitPrice,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
        sortOrder: index,
        totals: calculated.lines[index]!,
      })),
      totals: calculated.totals,
      amountPaid: { amountMinor: 0, currency: input.currency },
      sentAt: null,
      viewedAt: null,
      paidAt: null,
      overdueAt: null,
      voidedAt: null,
      deliveryToEmail: null,
      deliveryProviderMessageId: null,
      createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
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

  async getOrganizationForTeam(teamId: string, recordId: string) {
    return this.crmOrganizations.get(recordId)?.teamId === teamId
      ? (this.crmOrganizations.get(recordId) ?? null)
      : null;
  }

  async getPersonForTeam(teamId: string, recordId: string) {
    return this.crmPeople.get(recordId)?.teamId === teamId
      ? (this.crmPeople.get(recordId) ?? null)
      : null;
  }

  async getLegalEntityForTeam(teamId: string, recordId: string) {
    return this.crmLegalEntities.get(recordId)?.teamId === teamId
      ? (this.crmLegalEntities.get(recordId) ?? null)
      : null;
  }

  async getCrmRecordForTeam(teamId: string, recordId: string) {
    const record = this.crmRecords.get(recordId);
    return record?.teamId === teamId ? record : null;
  }

  async listCrmRecordGrantsForPrincipal(input: {
    teamId: string;
    recordId: string;
    principalId: string;
  }) {
    return this.crmRecordGrants.filter(
      (grant) =>
        grant.teamId === input.teamId &&
        grant.recordId === input.recordId &&
        grant.principalId === input.principalId,
    );
  }

  async listCrmFieldSecurityPolicies(input: {
    teamId: string;
    objectTypeId: string;
    recordId: string | null;
    principalId: string;
  }) {
    return this.crmFieldSecurityPolicies.filter(
      (policy) =>
        policy.teamId === input.teamId &&
        policy.objectTypeId === input.objectTypeId &&
        (policy.targetRecordId === null || policy.targetRecordId === input.recordId) &&
        (policy.principalId === null || policy.principalId === input.principalId),
    );
  }

  async getAccountForTeam(teamId: string, recordId: string) {
    return this.crmAccounts.get(recordId)?.teamId === teamId
      ? (this.crmAccounts.get(recordId) ?? null)
      : null;
  }

  async listOrganizationsForDuplicateCheck(input: {
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    limit: number;
  }) {
    const legalNameKey = input.legalName.trim().toLocaleLowerCase("sv-SE");

    return [...this.crmOrganizations.values()]
      .filter(
        (organization) =>
          organization.teamId === input.teamId &&
          ((input.organizationNumber &&
            organization.organizationNumber === input.organizationNumber) ||
            organization.legalName.trim().toLocaleLowerCase("sv-SE") === legalNameKey),
      )
      .slice(0, input.limit);
  }

  async getContactForTeam(teamId: string, recordId: string) {
    return this.crmContacts.get(recordId)?.teamId === teamId
      ? (this.crmContacts.get(recordId) ?? null)
      : null;
  }

  async listAccountsForTeam(input: {
    teamId: string;
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"] | null;
    accountType?: Account["accountType"] | null;
    recordIds?: readonly string[] | null;
    organizationIds?: readonly string[] | null;
  }) {
    return [...this.crmAccounts.values()].filter(
      (account) =>
        account.teamId === input.teamId &&
        (!input.recordIds || input.recordIds.includes(account.recordId)) &&
        (!input.organizationIds || input.organizationIds.includes(account.organizationId)) &&
        (!input.legalEntityId || account.legalEntityId === input.legalEntityId) &&
        (!input.relationshipStatus || account.relationshipStatus === input.relationshipStatus) &&
        (!input.accountType || account.accountType === input.accountType),
    );
  }

  async listContactsForAccount(
    teamId: string,
    accountId: string,
  ): Promise<AccountContactSummary[]> {
    return [...this.crmContacts.values()]
      .filter((contact) => contact.teamId === teamId && contact.accountId === accountId)
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
      .map((contact) => ({
        contact,
        person: this.crmPeople.get(contact.personId)!,
      }));
  }

  async getCrmObjectTypeDefinitionForTeam(teamId: string, objectTypeId: string) {
    return (
      [...this.crmObjectTypeDefinitions.values()].find(
        (objectType) => objectType.teamId === teamId && objectType.objectTypeId === objectTypeId,
      ) ?? null
    );
  }

  async createCrmObjectTypeDefinition(input: {
    id: string;
    teamId: string;
    objectTypeId: string;
    label: string;
    isCustom: boolean;
    createdByActorId: string;
  }) {
    const now = new Date().toISOString();
    const objectType: CrmObjectTypeDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.crmObjectTypeDefinitions.set(objectType.id, objectType);
    return objectType;
  }

  async getCrmFieldDefinitionForTeam(teamId: string, fieldDefinitionId: string) {
    const fieldDefinition = this.crmFieldDefinitions.get(fieldDefinitionId);
    return fieldDefinition?.teamId === teamId ? fieldDefinition : null;
  }

  async getCrmFieldDefinitionByStableKey(input: {
    teamId: string;
    objectTypeId: string;
    stableKey: string;
  }) {
    return (
      [...this.crmFieldDefinitions.values()].find(
        (fieldDefinition) =>
          fieldDefinition.teamId === input.teamId &&
          fieldDefinition.objectTypeId === input.objectTypeId &&
          fieldDefinition.stableKey === input.stableKey,
      ) ?? null
    );
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
  }) {
    const now = new Date().toISOString();
    const fieldDefinition: CrmFieldDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.crmFieldDefinitions.set(fieldDefinition.id, fieldDefinition);
    return fieldDefinition;
  }

  async createCrmOptionSet(input: {
    id: string;
    teamId: string;
    fieldDefinitionId: string;
    stableKey: string;
    label: string;
    createdByActorId: string;
  }) {
    const now = new Date().toISOString();
    const optionSet: CrmOptionSet = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.crmOptionSets.set(optionSet.id, optionSet);
    return optionSet;
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
  ) {
    const now = new Date().toISOString();
    const optionValues = input.map((optionValue) => ({
      ...optionValue,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    for (const optionValue of optionValues) {
      this.crmOptionValues.set(optionValue.id, optionValue);
    }

    return optionValues;
  }

  async listCrmOptionValuesForField(input: { teamId: string; fieldDefinitionId: string }) {
    const optionSet = [...this.crmOptionSets.values()].find(
      (set) => set.teamId === input.teamId && set.fieldDefinitionId === input.fieldDefinitionId,
    );

    if (!optionSet) {
      return [];
    }

    return [...this.crmOptionValues.values()]
      .filter(
        (optionValue) =>
          optionValue.teamId === input.teamId && optionValue.optionSetId === optionSet.id,
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async upsertCrmRecordFieldValue(input: {
    id: string;
    teamId: string;
    recordId: string;
    fieldDefinitionId: string;
    position?: number;
    value: CrmRecordFieldValueDraft;
    updatedByActorId: string;
  }) {
    const existing = [...this.crmRecordFieldValues.values()].find(
      (fieldValue) =>
        fieldValue.teamId === input.teamId &&
        fieldValue.recordId === input.recordId &&
        fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
        fieldValue.position === (input.position ?? 0),
    );
    const now = new Date().toISOString();
    const fieldValue: CrmRecordFieldValue = {
      id: existing?.id ?? input.id,
      teamId: input.teamId,
      recordId: input.recordId,
      fieldDefinitionId: input.fieldDefinitionId,
      position: input.position ?? 0,
      ...input.value,
      updatedByActorId: input.updatedByActorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.crmRecordFieldValues.set(fieldValue.id, fieldValue);
    return fieldValue;
  }

  async findCrmRecordFieldValueByFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
    excludeRecordId?: string | null;
  }) {
    return (
      [...this.crmRecordFieldValues.values()].find(
        (fieldValue) =>
          fieldValue.teamId === input.teamId &&
          fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
          fieldValue.recordId !== input.excludeRecordId &&
          crmFieldValueMatches(fieldValue, input.value),
      ) ?? null
    );
  }

  async listRecordIdsByCrmFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
  }) {
    return [...this.crmRecordFieldValues.values()]
      .filter(
        (fieldValue) =>
          fieldValue.teamId === input.teamId &&
          fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
          crmFieldValueMatches(fieldValue, input.value),
      )
      .map((fieldValue) => fieldValue.recordId);
  }

  async incrementCrmRecordVersion(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }) {
    const record = this.crmRecords.get(input.recordId);

    if (!record || record.teamId !== input.teamId || record.version !== input.expectedVersion) {
      return null;
    }

    const updated: CrmRecord = {
      ...record,
      version: record.version + 1,
      updatedByActorId: input.actorId,
      updatedAt: new Date().toISOString(),
    };
    this.crmRecords.set(updated.id, updated);
    return updated;
  }

  async archiveCrmRecord(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }) {
    const record = this.crmRecords.get(input.recordId);

    if (
      !record ||
      record.teamId !== input.teamId ||
      record.version !== input.expectedVersion ||
      record.lifecycleState !== "active"
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: CrmRecord = {
      ...record,
      lifecycleState: "archived",
      version: record.version + 1,
      updatedByActorId: input.actorId,
      updatedAt: now,
      archivedAt: now,
    };
    this.crmRecords.set(updated.id, updated);
    return updated;
  }

  async getOpportunityForTeam(teamId: string, recordId: string) {
    return this.crmOpportunities.get(recordId)?.teamId === teamId
      ? (this.crmOpportunities.get(recordId) ?? null)
      : null;
  }

  async listOpenOpportunitiesForAccount(teamId: string, accountId: string) {
    return [...this.crmOpportunities.values()].filter(
      (opportunity) =>
        opportunity.teamId === teamId &&
        opportunity.accountId === accountId &&
        opportunity.status === "open",
    );
  }

  async listOpportunitiesForAccount(teamId: string, accountId: string) {
    return [...this.crmOpportunities.values()].filter(
      (opportunity) => opportunity.teamId === teamId && opportunity.accountId === accountId,
    );
  }

  async getMarketCompanyByIdentity(input: { countryCode: string; organizationNumber: string }) {
    return (
      [...this.marketCompanies.values()].find(
        (company) =>
          company.countryCode === input.countryCode &&
          company.organizationNumber === input.organizationNumber &&
          company.status === "active",
      ) ?? null
    );
  }

  async getMarketCompany(companyId: string) {
    return this.marketCompanies.get(companyId) ?? null;
  }

  async upsertMarketCompany(input: {
    companyId: string;
    countryCode: string;
    organizationNumber: string;
    legalName: string;
  }) {
    const existing = await this.getMarketCompanyByIdentity(input);
    const now = new Date().toISOString();
    const company: MarketCompany = existing
      ? { ...existing, legalName: input.legalName, updatedAt: now }
      : {
          id: input.companyId,
          countryCode: input.countryCode,
          organizationNumber: input.organizationNumber,
          legalName: input.legalName,
          status: "active",
          createdAt: now,
          updatedAt: now,
        };

    this.marketCompanies.set(company.id, company);
    return company;
  }

  async getMarketCompanySnapshot(snapshotId: string) {
    return this.marketCompanySnapshots.get(snapshotId) ?? null;
  }

  async getMarketCompanySnapshotByContentHash(input: {
    companyId: string;
    provider: string;
    providerCapability: string;
    contentHash: string;
  }) {
    return (
      [...this.marketCompanySnapshots.values()].find(
        (snapshot) =>
          snapshot.companyId === input.companyId &&
          snapshot.provider === input.provider &&
          snapshot.providerCapability === input.providerCapability &&
          snapshot.contentHash === input.contentHash,
      ) ?? null
    );
  }

  async createMarketCompanySnapshot(input: {
    snapshotId: string;
    companyId: string;
    provider: string;
    providerCapability: string;
    providerCompanyId: string | null;
    retrievedAt: string;
    normalizedFields: MarketCompanySnapshot["normalizedFields"];
    rawPayload: Record<string, unknown>;
    rawPayloadReference: string | null;
    contentHash: string;
  }) {
    const snapshot: MarketCompanySnapshot = {
      id: input.snapshotId,
      companyId: input.companyId,
      provider: input.provider,
      providerCapability: input.providerCapability,
      providerCompanyId: input.providerCompanyId,
      retrievedAt: input.retrievedAt,
      normalizedFields: input.normalizedFields,
      rawPayload: input.rawPayload,
      rawPayloadReference: input.rawPayloadReference,
      contentHash: input.contentHash,
      createdAt: new Date().toISOString(),
    };
    this.marketCompanySnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async getMarketProspectForTeam(teamId: string, prospectId: string) {
    const prospect = this.marketProspects.get(prospectId);
    return prospect?.teamId === teamId ? prospect : null;
  }

  async getMarketProspectForOpportunity(teamId: string, opportunityId: string) {
    return (
      [...this.marketProspects.values()].find(
        (prospect) =>
          prospect.teamId === teamId && prospect.promotedOpportunityId === opportunityId,
      ) ?? null
    );
  }

  async listMarketProspectsForAccount(teamId: string, accountId: string) {
    return [...this.marketProspects.values()].filter(
      (prospect) => prospect.teamId === teamId && prospect.promotedAccountId === accountId,
    );
  }

  async createMarketProspect(input: {
    prospectId: string;
    teamId: string;
    companyId: string;
    companySnapshotId: string;
    sourceGoalId: string | null;
    sourceRunId: string | null;
    icpId: string | null;
    segmentId: string | null;
    sourceProvider: string;
    sourceProviderCapability: string;
    sourceDecisionSummary: string;
    createdByActorId: string;
  }) {
    const now = new Date().toISOString();
    const prospect: MarketProspect = {
      id: input.prospectId,
      teamId: input.teamId,
      companyId: input.companyId,
      companySnapshotId: input.companySnapshotId,
      status: "created",
      sourceGoalId: input.sourceGoalId,
      sourceRunId: input.sourceRunId,
      icpId: input.icpId,
      segmentId: input.segmentId,
      sourceProvider: input.sourceProvider,
      sourceProviderCapability: input.sourceProviderCapability,
      sourceDecisionSummary: input.sourceDecisionSummary,
      createdByActorId: input.createdByActorId,
      promotedAccountId: null,
      promotedOpportunityId: null,
      promotedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.marketProspects.set(prospect.id, prospect);
    return prospect;
  }

  async promoteMarketProspect(input: {
    teamId: string;
    prospectId: string;
    accountId: string;
    opportunityId: string;
    promotedAt: string;
  }) {
    const prospect = this.marketProspects.get(input.prospectId);

    if (!prospect || prospect.teamId !== input.teamId) {
      return null;
    }

    const promoted: MarketProspect = {
      ...prospect,
      status: "promoted",
      promotedAccountId: input.accountId,
      promotedOpportunityId: input.opportunityId,
      promotedAt: input.promotedAt,
      updatedAt: input.promotedAt,
    };
    this.marketProspects.set(promoted.id, promoted);
    return promoted;
  }

  async getCommercialDocumentForTeam(teamId: string, documentId: string) {
    const document = this.commercialDocuments.get(documentId);
    return document?.teamId === teamId ? this.commercialDocumentWithLines(document) : null;
  }

  async listCommercialDocumentsForOpportunity(teamId: string, opportunityId: string) {
    return [...this.commercialDocuments.values()]
      .filter((document) => document.teamId === teamId && document.opportunityId === opportunityId)
      .map((document) => this.commercialDocumentWithLines(document));
  }

  async getLatestCommercialDocumentVersionForTeam(teamId: string, documentId: string) {
    return (
      [...this.commercialDocumentVersions.values()]
        .filter((version) => version.teamId === teamId && version.documentId === documentId)
        .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
    );
  }

  async getCommercialDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.commercialDocumentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async createCommercialDocument(input: Parameters<DawnRepository["createCommercialDocument"]>[0]) {
    const now = new Date().toISOString();
    const document: CommercialDocument = {
      id: input.documentId,
      teamId: input.teamId,
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      documentType: input.documentType,
      title: input.title,
      status: "draft",
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? null,
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
    };
    this.commercialDocuments.set(document.id, document);
    this.commercialDocumentLines.set(
      document.id,
      this.buildCommercialDocumentLines(document, input.lines),
    );
    return this.commercialDocumentWithLines(document);
  }

  async updateCommercialDocumentDraft(
    input: Parameters<DawnRepository["updateCommercialDocumentDraft"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId || current.status !== "draft") {
      throw new Error("Commercial document draft was not updated");
    }

    const document: CommercialDocument = {
      ...current,
      documentType: input.documentType,
      title: input.title,
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? current.marketOrigin,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocuments.set(document.id, document);
    this.commercialDocumentLines.set(
      document.id,
      this.buildCommercialDocumentLines(document, input.lines),
    );
    return this.commercialDocumentWithLines(document);
  }

  async finalizeCommercialDocument(
    input: Parameters<DawnRepository["finalizeCommercialDocument"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId || current.status !== "draft") {
      throw new Error("Commercial document was not finalized");
    }

    const version: CommercialDocumentVersion = {
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
      createdAt: new Date().toISOString(),
    };
    const document: CommercialDocument = {
      ...current,
      status: "finalised",
      activeVersionId: version.id,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocumentVersions.set(version.id, version);
    this.commercialDocuments.set(document.id, document);

    return { document: this.commercialDocumentWithLines(document), version };
  }

  async reviseCommercialDocument(input: Parameters<DawnRepository["reviseCommercialDocument"]>[0]) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      throw new Error("Commercial document was not revised");
    }

    const activeVersion = current.activeVersionId
      ? this.commercialDocumentVersions.get(current.activeVersionId)
      : null;
    const supersededVersion = activeVersion
      ? { ...activeVersion, status: "superseded" as const }
      : null;

    if (supersededVersion) {
      this.commercialDocumentVersions.set(supersededVersion.id, supersededVersion);
    }

    const document: CommercialDocument = {
      ...current,
      documentType: input.documentType,
      title: input.title,
      status: "draft",
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? current.marketOrigin,
      activeVersionId: null,
      recipientAccessTokenHash: null,
      recipientAccessTokenExpiresAt: null,
      sentAt: null,
      viewedAt: null,
      declinedAt: null,
      declineReason: null,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocuments.set(document.id, document);
    this.commercialDocumentLines.set(
      document.id,
      this.buildCommercialDocumentLines(document, input.lines),
    );

    return { document: this.commercialDocumentWithLines(document), supersededVersion };
  }

  async sendCommercialDocument(input: Parameters<DawnRepository["sendCommercialDocument"]>[0]) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      throw new Error("Commercial document was not sent");
    }

    const document: CommercialDocument = {
      ...current,
      status: "sent",
      recipientEmail: input.recipientEmail,
      recipientAccessTokenHash: input.recipientAccessTokenHash,
      recipientAccessTokenExpiresAt: input.recipientAccessTokenExpiresAt,
      sentAt: input.sentAt,
      updatedAt: input.sentAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.commercialDocumentWithLines(document);
  }

  async getCommercialDocumentByRecipientAccessTokenHash(
    input: Parameters<DawnRepository["getCommercialDocumentByRecipientAccessTokenHash"]>[0],
  ) {
    const document = [...this.commercialDocuments.values()].find(
      (candidate) => candidate.recipientAccessTokenHash === input.accessTokenHash,
    );

    if (!document?.activeVersionId) {
      return null;
    }

    const version = this.commercialDocumentVersions.get(document.activeVersionId);
    return version ? { document: this.commercialDocumentWithLines(document), version } : null;
  }

  async markCommercialDocumentViewed(
    input: Parameters<DawnRepository["markCommercialDocumentViewed"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      throw new Error("Commercial document was not viewed");
    }

    const document: CommercialDocument = {
      ...current,
      status: "viewed",
      viewedAt: input.viewedAt,
      updatedAt: input.viewedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.commercialDocumentWithLines(document);
  }

  async declineCommercialDocument(
    input: Parameters<DawnRepository["declineCommercialDocument"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      throw new Error("Commercial document was not declined");
    }

    const document: CommercialDocument = {
      ...current,
      status: "declined",
      declinedAt: input.declinedAt,
      declineReason: input.reason ?? null,
      updatedAt: input.declinedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.commercialDocumentWithLines(document);
  }

  async markCommercialDocumentSigning(
    input: Parameters<DawnRepository["markCommercialDocumentSigning"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const document: CommercialDocument = {
      ...current,
      status: "signing",
      updatedAt: input.signingAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.commercialDocumentWithLines(document);
  }

  async markCommercialDocumentSigned(
    input: Parameters<DawnRepository["markCommercialDocumentSigned"]>[0],
  ) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const document: CommercialDocument = {
      ...current,
      status: "signed",
      updatedAt: input.signedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.commercialDocumentWithLines(document);
  }

  async getSignatureRequestForTeam(
    teamId: string,
    signatureRequestId: string,
  ): Promise<SignatureRequest | null> {
    const request = this.signatureRequests.get(signatureRequestId);
    return request?.teamId === teamId ? request : null;
  }

  async getSignatureRequestForDocumentVersion(
    input: Parameters<DawnRepository["getSignatureRequestForDocumentVersion"]>[0],
  ) {
    return (
      [...this.signatureRequests.values()].find(
        (request) =>
          request.teamId === input.teamId &&
          request.documentId === input.documentId &&
          request.documentVersionId === input.documentVersionId,
      ) ?? null
    );
  }

  async getSignatureRequestByProviderSession(
    input: Parameters<DawnRepository["getSignatureRequestByProviderSession"]>[0],
  ) {
    return (
      [...this.signatureRequests.values()].find(
        (request) =>
          request.provider === input.provider &&
          request.providerSessionId === input.providerSessionId,
      ) ?? null
    );
  }

  async listSignatureParties(
    teamId: string,
    signatureRequestId: string,
  ): Promise<SignatureParty[]> {
    return [...this.signatureParties.values()].filter(
      (party) => party.teamId === teamId && party.signatureRequestId === signatureRequestId,
    );
  }

  async listSignatureEvidence(
    teamId: string,
    signatureRequestId: string,
  ): Promise<SignatureEvidence[]> {
    return [...this.signatureEvidence.values()].filter(
      (evidence) =>
        evidence.teamId === teamId && evidence.signatureRequestId === signatureRequestId,
    );
  }

  async getSignatureEvidenceByProviderEvent(
    input: Parameters<DawnRepository["getSignatureEvidenceByProviderEvent"]>[0],
  ) {
    return (
      [...this.signatureEvidence.values()].find(
        (evidence) =>
          evidence.provider === input.provider &&
          evidence.providerEventId === input.providerEventId,
      ) ?? null
    );
  }

  async createSignatureRequest(input: Parameters<DawnRepository["createSignatureRequest"]>[0]) {
    const now = new Date().toISOString();
    const request: SignatureRequest = {
      id: input.signatureRequestId,
      teamId: input.teamId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      status: "requested",
      signingUrl: input.signingUrl,
      expiresAt: input.expiresAt,
      signingText: input.signingText,
      hiddenSignedData: input.hiddenSignedData,
      hiddenSignedDataHash: input.hiddenSignedDataHash,
      providerRawPayload: input.providerRawPayload,
      createdByActorId: input.createdByActorId,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.signatureRequests.set(request.id, request);
    return request;
  }

  async createSignatureParty(input: Parameters<DawnRepository["createSignatureParty"]>[0]) {
    const now = new Date().toISOString();
    const party: SignatureParty = {
      id: input.partyId,
      teamId: input.teamId,
      signatureRequestId: input.signatureRequestId,
      role: input.role,
      signingOrder: input.signingOrder,
      name: input.name,
      email: input.email,
      providerPartyId: input.providerPartyId,
      status: "pending",
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.signatureParties.set(party.id, party);
    return party;
  }

  async markSignatureRequestCompleted(
    input: Parameters<DawnRepository["markSignatureRequestCompleted"]>[0],
  ) {
    const current = this.signatureRequests.get(input.signatureRequestId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const request: SignatureRequest = {
      ...current,
      status: "completed",
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    };
    this.signatureRequests.set(request.id, request);
    return request;
  }

  async markSignaturePartySigned(input: Parameters<DawnRepository["markSignaturePartySigned"]>[0]) {
    const current = this.signatureParties.get(input.partyId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const party: SignatureParty = {
      ...current,
      status: "signed",
      signedAt: input.signedAt,
      updatedAt: input.signedAt,
    };
    this.signatureParties.set(party.id, party);
    return party;
  }

  async createSignatureEvidence(input: Parameters<DawnRepository["createSignatureEvidence"]>[0]) {
    const evidence: SignatureEvidence = {
      id: input.evidenceId,
      teamId: input.teamId,
      signatureRequestId: input.signatureRequestId,
      signaturePartyId: input.signaturePartyId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      providerSessionId: input.providerSessionId,
      signedAt: input.signedAt,
      collectedAt: input.collectedAt,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      signerPersonalNumberMasked: input.signerPersonalNumberMasked,
      documentPdfSha256: input.documentPdfSha256,
      verificationStatus: input.verificationStatus,
      signatureValue: input.signatureValue,
      xmlDsig: input.xmlDsig,
      ocspResponse: input.ocspResponse,
      evidenceObjectKey: input.evidenceObjectKey,
      rawPayload: input.rawPayload,
      createdAt: input.collectedAt,
    };
    this.signatureEvidence.set(evidence.id, evidence);
    return evidence;
  }

  async getTrustPolicy(teamId: string) {
    return this.trustPolicies.get(teamId) ?? null;
  }

  async upsertTrustPolicy(input: Parameters<DawnRepository["upsertTrustPolicy"]>[0]) {
    const policy: TrustCheckPolicy = {
      teamId: input.teamId,
      mode: input.mode,
      updatedByActorId: input.updatedByActorId,
      updatedAt: input.updatedAt,
    };
    this.trustPolicies.set(policy.teamId, policy);
    return policy;
  }

  async getTrustCheckForTeam(teamId: string, trustCheckId: string) {
    const check = this.trustChecks.get(trustCheckId);
    return check?.teamId === teamId ? check : null;
  }

  async getLatestTrustCheckForSignatureRequest(
    input: Parameters<DawnRepository["getLatestTrustCheckForSignatureRequest"]>[0],
  ) {
    return (
      [...this.trustChecks.values()]
        .filter(
          (check) =>
            check.teamId === input.teamId && check.signatureRequestId === input.signatureRequestId,
        )
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0] ?? null
    );
  }

  async getLatestTrustCheckForSignatureEvidence(
    input: Parameters<DawnRepository["getLatestTrustCheckForSignatureEvidence"]>[0],
  ) {
    return (
      [...this.trustChecks.values()]
        .filter(
          (check) =>
            check.teamId === input.teamId &&
            check.signatureEvidenceId === input.signatureEvidenceId,
        )
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0] ?? null
    );
  }

  async listTrustChecksForDocument(
    input: Parameters<DawnRepository["listTrustChecksForDocument"]>[0],
  ) {
    return [...this.trustChecks.values()]
      .filter((check) => check.teamId === input.teamId && check.documentId === input.documentId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  async createTrustCheck(input: Parameters<DawnRepository["createTrustCheck"]>[0]) {
    const check: TrustCheck = {
      id: input.trustCheckId,
      teamId: input.teamId,
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      signatureRequestId: input.signatureRequestId,
      signatureEvidenceId: input.signatureEvidenceId,
      signaturePartyId: input.signaturePartyId,
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      providerRequestId: null,
      providerEventId: null,
      sourceOrganizationNumber: input.sourceOrganizationNumber,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      signerPersonalNumberMasked: input.signerPersonalNumberMasked,
      status: "pending",
      resultReason: "pending",
      companyRegistrationNumber: null,
      companyLegalName: null,
      companyStatus: null,
      roleEvidence: [],
      signatureDescription: null,
      advisoryAnalysis: null,
      originalSourceDescriptions: [],
      rawPayload: {},
      rawPayloadReference: null,
      legalBasis: input.legalBasis,
      purpose: input.purpose,
      retentionUntil: input.retentionUntil,
      requestedAt: input.requestedAt,
      completedAt: null,
      reviewedAt: null,
      reviewerActorId: null,
      reviewDecision: null,
      reviewRationale: null,
      createdAt: input.requestedAt,
      updatedAt: input.requestedAt,
    };
    this.trustChecks.set(check.id, check);
    return check;
  }

  async markTrustCheckCompleted(input: Parameters<DawnRepository["markTrustCheckCompleted"]>[0]) {
    const current = this.trustChecks.get(input.trustCheckId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const check: TrustCheck = {
      ...current,
      status: input.status,
      resultReason: input.resultReason,
      providerRequestId: input.providerRequestId,
      providerEventId: input.providerEventId,
      companyRegistrationNumber: input.companyRegistrationNumber,
      companyLegalName: input.companyLegalName,
      companyStatus: input.companyStatus,
      roleEvidence: [...input.roleEvidence],
      signatureDescription: input.signatureDescription,
      advisoryAnalysis: input.advisoryAnalysis,
      originalSourceDescriptions: [...input.originalSourceDescriptions],
      rawPayload: input.rawPayload,
      rawPayloadReference: input.rawPayloadReference,
      completedAt: input.completedAt,
      updatedAt: input.completedAt ?? new Date().toISOString(),
    };
    this.trustChecks.set(check.id, check);
    return check;
  }

  async markTrustCheckReviewed(input: Parameters<DawnRepository["markTrustCheckReviewed"]>[0]) {
    const current = this.trustChecks.get(input.trustCheckId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const check: TrustCheck = {
      ...current,
      status: input.status,
      reviewedAt: input.reviewedAt,
      reviewerActorId: input.reviewerActorId,
      reviewDecision: input.decision,
      reviewRationale: input.rationale,
      updatedAt: input.reviewedAt,
    };
    this.trustChecks.set(check.id, check);
    return check;
  }

  async getInvoiceHandoffPolicy(teamId: string) {
    return this.invoiceHandoffPolicies.get(teamId) ?? null;
  }

  async upsertInvoiceHandoffPolicy(
    input: Parameters<DawnRepository["upsertInvoiceHandoffPolicy"]>[0],
  ) {
    const policy: InvoiceHandoffPolicy = {
      teamId: input.teamId,
      mode: input.mode,
      updatedByActorId: input.updatedByActorId,
      updatedAt: input.updatedAt,
    };
    this.invoiceHandoffPolicies.set(policy.teamId, policy);
    return policy;
  }

  async getInvoiceHandoffForTeam(teamId: string, handoffId: string) {
    const handoff = this.invoiceHandoffs.get(handoffId);
    return handoff?.teamId === teamId ? handoff : null;
  }

  async getActiveInvoiceHandoffForDocumentVersion(
    input: Parameters<DawnRepository["getActiveInvoiceHandoffForDocumentVersion"]>[0],
  ) {
    return (
      [...this.invoiceHandoffs.values()]
        .filter(
          (handoff) =>
            handoff.teamId === input.teamId &&
            handoff.provider === input.provider &&
            handoff.documentVersionId === input.documentVersionId &&
            handoff.status !== "failed",
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    );
  }

  async listInvoiceHandoffsForDocument(
    input: Parameters<DawnRepository["listInvoiceHandoffsForDocument"]>[0],
  ) {
    return [...this.invoiceHandoffs.values()]
      .filter(
        (handoff) => handoff.teamId === input.teamId && handoff.documentId === input.documentId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createInvoiceHandoff(input: Parameters<DawnRepository["createInvoiceHandoff"]>[0]) {
    const existing = await this.getActiveInvoiceHandoffForDocumentVersion({
      teamId: input.teamId,
      provider: input.provider,
      documentVersionId: input.documentVersionId,
    });

    if (existing) {
      throw new Error("Active invoice handoff already exists for document version");
    }

    const handoff: InvoiceHandoff = {
      id: input.handoffId,
      teamId: input.teamId,
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      signatureRequestId: input.signatureRequestId,
      provider: input.provider,
      connectionId: input.connectionId,
      status: input.status,
      requestedByActorId: input.requestedByActorId,
      requestedAt: input.requestedAt,
      approvedByActorId: null,
      approvedAt: null,
      providerObjectRecordId: null,
      providerInvoiceId: null,
      providerInvoiceNumber: null,
      providerInvoiceUrl: null,
      providerStatus: null,
      failureCode: null,
      failureMessage: null,
      requestPayload: input.requestPayload,
      rawPayload: {},
      lastAttemptAt: null,
      completedAt: null,
      createdAt: input.requestedAt,
      updatedAt: input.requestedAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  async markInvoiceHandoffApproved(
    input: Parameters<DawnRepository["markInvoiceHandoffApproved"]>[0],
  ) {
    const current = this.invoiceHandoffs.get(input.handoffId);

    if (
      !current ||
      current.teamId !== input.teamId ||
      current.status !== "waiting_manual_approval"
    ) {
      return null;
    }

    const handoff: InvoiceHandoff = {
      ...current,
      status: "approved",
      approvedByActorId: input.approvedByActorId,
      approvedAt: input.approvedAt,
      failureCode: null,
      failureMessage: null,
      updatedAt: input.approvedAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  async markInvoiceHandoffRetryRequested(
    input: Parameters<DawnRepository["markInvoiceHandoffRetryRequested"]>[0],
  ) {
    const current = this.invoiceHandoffs.get(input.handoffId);

    if (!current || current.teamId !== input.teamId || current.status !== "failed") {
      return null;
    }

    const handoff: InvoiceHandoff = {
      ...current,
      status: "requested",
      failureCode: null,
      failureMessage: null,
      updatedAt: input.requestedAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  async markInvoiceHandoffCreating(
    input: Parameters<DawnRepository["markInvoiceHandoffCreating"]>[0],
  ) {
    const current = this.invoiceHandoffs.get(input.handoffId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const handoff: InvoiceHandoff = {
      ...current,
      status: "creating",
      failureCode: null,
      failureMessage: null,
      lastAttemptAt: input.lastAttemptAt,
      updatedAt: input.lastAttemptAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  async markInvoiceHandoffCreated(
    input: Parameters<DawnRepository["markInvoiceHandoffCreated"]>[0],
  ) {
    const current = this.invoiceHandoffs.get(input.handoffId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const handoff: InvoiceHandoff = {
      ...current,
      status: "created",
      providerObjectRecordId: input.providerObjectRecordId,
      providerInvoiceId: input.providerInvoiceId,
      providerInvoiceNumber: input.providerInvoiceNumber,
      providerInvoiceUrl: input.providerInvoiceUrl,
      providerStatus: input.providerStatus,
      failureCode: null,
      failureMessage: null,
      rawPayload: input.rawPayload,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  async markInvoiceHandoffFailed(input: Parameters<DawnRepository["markInvoiceHandoffFailed"]>[0]) {
    const current = this.invoiceHandoffs.get(input.handoffId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const handoff: InvoiceHandoff = {
      ...current,
      status: "failed",
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      rawPayload: input.rawPayload ?? {},
      updatedAt: input.failedAt,
    };
    this.invoiceHandoffs.set(handoff.id, handoff);
    return handoff;
  }

  private buildCommercialDocumentLines(
    document: CommercialDocument,
    lines: readonly CommercialDocumentLineDraft[],
  ) {
    const calculated = calculateCommercialDocumentTotals({
      currency: document.currency,
      lines,
    });

    return lines.map(
      (line, index): CommercialDocumentLine => ({
        id: `line_${document.id}_${index}`,
        teamId: document.teamId,
        documentId: document.id,
        source: line.source,
        provider: line.provider ?? null,
        providerConnectionId: line.providerConnectionId ?? null,
        providerObjectId: line.providerObjectId ?? null,
        providerObjectRecordId: line.providerObjectRecordId ?? null,
        articleNumber: line.articleNumber ?? null,
        description: line.description,
        unit: line.unit ?? null,
        quantityMilli: line.quantityMilli,
        unitPrice: line.unitPrice,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        vatRateBasisPoints: line.vatRateBasisPoints ?? 0,
        snapshot: line.snapshot ?? null,
        sortOrder: index,
        totals: calculated.lines[index]!,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  private commercialDocumentWithLines(document: CommercialDocument): CommercialDocumentWithLines {
    const lines = this.commercialDocumentLines.get(document.id) ?? [];
    const totals = {
      subtotal: {
        amountMinor: lines.reduce((total, line) => total + line.totals.subtotal.amountMinor, 0),
        currency: document.currency,
      },
      discount: {
        amountMinor: lines.reduce((total, line) => total + line.totals.discount.amountMinor, 0),
        currency: document.currency,
      },
      vat: {
        amountMinor: lines.reduce((total, line) => total + line.totals.vat.amountMinor, 0),
        currency: document.currency,
      },
      total: {
        amountMinor: lines.reduce((total, line) => total + line.totals.total.amountMinor, 0),
        currency: document.currency,
      },
    };

    return { ...document, lines, totals };
  }

  async createCrmRecord(input: {
    recordId: string;
    teamId: string;
    objectTypeId: string;
    createdByActorId: string;
    ownerPrincipalId?: string | null;
  }): Promise<CrmRecord> {
    const record: CrmRecord = {
      id: input.recordId,
      teamId: input.teamId,
      objectTypeId: input.objectTypeId,
      ownerPrincipalId: input.ownerPrincipalId ?? input.createdByActorId,
      lifecycleState: "active",
      version: 1,
      createdByActorId: input.createdByActorId,
      updatedByActorId: input.createdByActorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      deletedAt: null,
    };
    this.crmRecords.set(record.id, record);
    return record;
  }

  async createCrmParty(input: {
    recordId: string;
    teamId: string;
    partyType: PartyType;
  }): Promise<Party> {
    const party: Party = {
      recordId: input.recordId,
      teamId: input.teamId,
      partyType: input.partyType,
    };
    this.crmParties.set(party.recordId, party);
    return party;
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
    const now = new Date().toISOString();
    const organization: Organization = {
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
    };
    this.crmOrganizations.set(organization.recordId, organization);
    return organization;
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
    const now = new Date().toISOString();
    const person: Person = {
      recordId: input.recordId,
      teamId: input.teamId,
      givenName: input.givenName ?? null,
      familyName: input.familyName ?? null,
      displayName: input.displayName,
      email: input.email ?? null,
      phoneNumber: input.phoneNumber ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.crmPeople.set(person.recordId, person);
    return person;
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
    const person = this.crmPeople.get(input.personId);

    if (!person || person.teamId !== input.teamId) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Person = {
      ...person,
      givenName: input.givenName,
      familyName: input.familyName,
      displayName: input.displayName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      updatedAt: now,
    };
    this.crmPeople.set(updated.recordId, updated);
    return updated;
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
    const now = new Date().toISOString();
    const legalEntity: LegalEntity = {
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
    };
    this.crmLegalEntities.set(legalEntity.recordId, legalEntity);
    return legalEntity;
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
    const now = new Date().toISOString();
    const account: Account = {
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
      customerSince: input.customerSince ?? null,
      churnedAt: input.churnedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.crmAccounts.set(account.recordId, account);
    return account;
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
    const account = this.crmAccounts.get(input.accountId);

    if (!account || account.teamId !== input.teamId) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Account = {
      ...account,
      accountType: input.accountType,
      legalEntityId: input.legalEntityId,
      relationshipStatus: input.relationshipStatus,
      lifecycleStage: input.lifecycleStage,
      segment: input.segment,
      territory: input.territory,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
      customerSince: input.customerSince,
      churnedAt: input.churnedAt,
      updatedAt: now,
    };
    this.crmAccounts.set(updated.recordId, updated);
    return updated;
  }

  async createContact(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    personId: string;
    role?: string | null;
    isPrimary?: boolean | null;
  }): Promise<Contact> {
    const now = new Date().toISOString();
    const contact: Contact = {
      recordId: input.recordId,
      teamId: input.teamId,
      accountId: input.accountId,
      personId: input.personId,
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.crmContacts.set(contact.recordId, contact);
    return contact;
  }

  async updateContact(input: {
    teamId: string;
    contactId: string;
    role: string | null;
    isPrimary: boolean;
  }): Promise<Contact | null> {
    const contact = this.crmContacts.get(input.contactId);

    if (!contact || contact.teamId !== input.teamId) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Contact = {
      ...contact,
      role: input.role,
      isPrimary: input.isPrimary,
      updatedAt: now,
    };
    this.crmContacts.set(updated.recordId, updated);
    return updated;
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
    const now = new Date().toISOString();
    const opportunity: Opportunity = {
      recordId: input.recordId,
      teamId: input.teamId,
      accountId: input.accountId,
      name: input.name,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      status: input.status,
      stage: input.stage,
      expectedCloseDate: input.expectedCloseDate ?? null,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
      wonAt: null,
      lostAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.crmOpportunities.set(opportunity.recordId, opportunity);
    return opportunity;
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
    const opportunity = this.crmOpportunities.get(input.opportunityId);

    if (!opportunity || opportunity.teamId !== input.teamId) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Opportunity = {
      ...opportunity,
      name: input.name,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      expectedCloseDate: input.expectedCloseDate,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
      updatedAt: now,
    };
    this.crmOpportunities.set(updated.recordId, updated);
    return updated;
  }

  async updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }): Promise<Opportunity | null> {
    const now = new Date().toISOString();
    const opportunity = this.crmOpportunities.get(input.opportunityId);

    if (!opportunity || opportunity.teamId !== input.teamId) {
      return null;
    }

    const updated: Opportunity = {
      ...opportunity,
      stage: input.stage,
      status: input.status,
      wonAt: input.status === "won" ? (opportunity.wonAt ?? now) : (opportunity.wonAt ?? null),
      lostAt: input.stage === "lost" ? (opportunity.lostAt ?? now) : (opportunity.lostAt ?? null),
      updatedAt: now,
    };
    this.crmOpportunities.set(updated.recordId, updated);
    return updated;
  }
}

function crmFieldValueMatches(fieldValue: CrmRecordFieldValue, expected: CrmRecordFieldValueDraft) {
  return (
    fieldValue.textValue === expected.textValue &&
    fieldValue.integerValue === expected.integerValue &&
    fieldValue.booleanValue === expected.booleanValue &&
    fieldValue.dateValue === expected.dateValue &&
    fieldValue.amountMinor === expected.amountMinor &&
    fieldValue.currencyCode === expected.currencyCode &&
    fieldValue.optionValueId === expected.optionValueId &&
    fieldValue.referenceRecordId === expected.referenceRecordId
  );
}

function calculateFixtureInvoiceTotals(input: {
  currency: string;
  discountBasisPoints: number;
  lines: InvoiceLineDraft[];
}) {
  const lineSubtotals = input.lines.map((line) =>
    Math.round((line.unitPrice.amountMinor * line.quantityMilli) / 1_000),
  );
  const subtotalMinor = lineSubtotals.reduce((total, value) => total + value, 0);
  const invoiceDiscountMinor = Math.round((subtotalMinor * input.discountBasisPoints) / 10_000);
  let allocatedDiscount = 0;
  const lines = input.lines.map((line, index) => {
    const subtotal = lineSubtotals[index] ?? 0;
    const discount =
      index === input.lines.length - 1
        ? invoiceDiscountMinor - allocatedDiscount
        : subtotalMinor === 0
          ? 0
          : Math.round((subtotal * invoiceDiscountMinor) / subtotalMinor);
    allocatedDiscount += discount;
    const taxable = subtotal - discount;
    const tax = Math.round((taxable * (line.taxRateBasisPoints ?? 0)) / 10_000);

    return {
      subtotal: { amountMinor: subtotal, currency: input.currency },
      discount: { amountMinor: discount, currency: input.currency },
      tax: { amountMinor: tax, currency: input.currency },
      total: { amountMinor: taxable + tax, currency: input.currency },
    };
  });
  const discountMinor = lines.reduce((total, line) => total + line.discount.amountMinor, 0);
  const taxMinor = lines.reduce((total, line) => total + line.tax.amountMinor, 0);

  return {
    lines,
    totals: {
      subtotal: { amountMinor: subtotalMinor, currency: input.currency },
      discount: { amountMinor: discountMinor, currency: input.currency },
      tax: { amountMinor: taxMinor, currency: input.currency },
      total: {
        amountMinor: subtotalMinor - discountMinor + taxMinor,
        currency: input.currency,
      },
    },
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

async function createTestRouter(
  repository: DawnRepository,
  options: {
    emailInboxConnectors?: readonly InboxConnector[];
    googleAuthAccountTokensForUser?: (userId: string) => Promise<GoogleAuthAccountTokens | null>;
    ticCompanyRolesProvider?: ReturnType<typeof createMockTicCompanyRolesProvider>;
  } = {},
) {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";

  const { createAppRouter } = await import("./routers/index");
  return createAppRouter({
    dawnRepository: repository,
    bankingProviders: [
      createMockBankingProvider(),
      createSandboxBankingProvider({
        appUrl: "http://localhost:3001",
        webhookSecret: "bank_webhook_secret",
      }),
    ],
    integrationProviders: createMockIntegrationProviders(),
    emailInboxConnectors: options.emailInboxConnectors ?? [
      new InboxConnector({
        provider: createMockEmailInboxProvider(),
        tokenCodec: createEmailInboxTokenCodec({
          secret: "test_secret_that_is_long_enough_for_aes",
          keyId: "test-email-token",
        }),
      }),
    ],
    googleAuthAccountTokensForUser: options.googleAuthAccountTokensForUser,
    emailInboxOAuthStateCodec: createEmailInboxOAuthStateCodec({
      secret: "test_oauth_state_secret_that_is_long_enough",
      allowedRedirectOrigins: ["http://localhost:3001"],
      now: () => new Date("2026-06-15T10:00:00.000Z"),
    }),
    fortnoxOAuthStateCodec: createFortnoxOAuthStateCodec({
      secret: "test_fortnox_oauth_state_secret",
      allowedRedirectOrigins: ["http://localhost:3001"],
      now: () => new Date("2026-06-15T10:00:00.000Z"),
    }),
    documentUrlSigner: testDocumentUrlSigner,
    commercialDocumentPdfRenderer: createDeterministicCommercialDocumentPdfRenderer(),
    ticSignatureProvider: createMockTicSignatureProvider(),
    ticCompanyRolesProvider: options.ticCompanyRolesProvider ?? createMockTicCompanyRolesProvider(),
    ticWebhookSecret: "tic_webhook_secret_abcdefghijklmnopqrstuvwxyz",
    invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
    invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
  });
}

function createGmailMockInboxConnector() {
  return new InboxConnector({
    provider: {
      ...createMockEmailInboxProvider(),
      provider: "gmail" as const,
      displayName: "Gmail",
      defaultScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    },
    tokenCodec: createEmailInboxTokenCodec({
      secret: "test_secret_that_is_long_enough_for_aes",
      keyId: "test-gmail-token",
    }),
  });
}

describe("appRouter", () => {
  test("rejects unauthenticated protected procedures", async () => {
    const router = await createTestRouter(new MemoryTransactionReviewRepository());

    await expect(
      call(router.teams.directory, withSelectedTeam({}), {
        context: createUnauthenticatedApiTestContext(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("maps application permission denials to typed oRPC errors", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "viewer");
    const router = await createTestRouter(repository);

    await expect(
      call(router.teams.directory, withSelectedTeam({}), {
        context: createScopedActorApiTestContext({ email: "viewer@example.com" }),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot manage members for this team",
    });
  });

  test("rejects cross-team reads for critical protected resources", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Owned Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.documents.set("doc_other", {
      id: "doc_other",
      teamId: "team_2",
      title: "Other team receipt",
      status: "uploaded",
      currentVersionId: "ver_other",
      createdByActorId: "user_2",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    repository.customers.set("customer_other", {
      id: "customer_other",
      teamId: "team_2",
      name: "Other Customer",
      email: "other@example.com",
      billingAddress: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    repository.apiKeys.set("api_key_other", {
      id: "api_key_other",
      teamId: "team_2",
      name: "Other key",
      keyPrefix: "dawn_other",
      keyHash: "hash_other",
      scopes: ["transactions.read"],
      createdByActorId: "user_2",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
    });
    repository.jobRuns.set("job_other", {
      id: "job_other",
      teamId: "team_2",
      outboxEventId: "outbox_other",
      jobType: "webhook.deliver",
      queueName: "dawn-jobs",
      status: "failed",
      attempt: 1,
      idempotencyKey: "webhook:deliver:outbox_other",
      error: "other team failure",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    await expect(call(router.documents.list, { teamId: "team_2" }, context)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot read documents for this team",
    });
    await expect(call(router.billing.list, { teamId: "team_2" }, context)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot read billing data for this team",
    });
    await expect(call(router.developers.list, { teamId: "team_2" }, context)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        message: "You cannot manage developer settings for this team",
      },
    );
    await expect(call(router.operations.list, { teamId: "team_2" }, context)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        message: "You cannot read operations for this team",
      },
    );
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
        withSelectedTeam(
          {
            transactionId: "txn_1",
            categoryId: "cat_1",
            idempotencyKey: "idem_1",
          },
          "team_2",
        ),
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

  test("returns cursor-scoped project sync changes through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.teams.set("team_2", "Other Team");
    repository.memberships.set("user_1:team_1", "viewer");
    repository.projects.set("project_old", {
      id: "project_old",
      teamId: "team_1",
      customerId: "customer_1",
      name: "Old project",
      description: null,
      status: "active",
      billableRate: { amountMinor: 12_000, currency: "USD" },
      createdByActorId: "user_1",
      createdAt: "2026-06-14T09:00:00.000Z",
      updatedAt: "2026-06-14T09:00:00.000Z",
    });
    repository.projects.set("project_new", {
      id: "project_new",
      teamId: "team_1",
      customerId: "customer_1",
      name: "New project",
      description: "Recent work",
      status: "active",
      billableRate: { amountMinor: 15_000, currency: "USD" },
      createdByActorId: "user_1",
      createdAt: "2026-06-15T09:00:00.000Z",
      updatedAt: "2026-06-15T09:00:00.000Z",
    });
    repository.projects.set("project_other", {
      id: "project_other",
      teamId: "team_2",
      customerId: "customer_2",
      name: "Other team",
      description: null,
      status: "active",
      billableRate: { amountMinor: 15_000, currency: "USD" },
      createdByActorId: "user_2",
      createdAt: "2026-06-16T09:00:00.000Z",
      updatedAt: "2026-06-16T09:00:00.000Z",
    });
    const router = await createTestRouter(repository);

    const response = await call(
      router.sync.projects,
      { teamId: "team_1", cursor: "2026-06-14T12:00:00.000Z" },
      {
        context: testContext({ id: "user_1", email: "viewer@example.com" }),
      },
    );

    expect(response).toMatchObject({
      collection: "projects",
      teamId: "team_1",
      cursor: "2026-06-15T09:00:00.000Z",
      conflictPolicy: "server_wins_for_operational_state",
    });
    expect(
      response.changes.map((change) => (change.type === "upsert" ? change.record.id : "")),
    ).toEqual(["project_new"]);
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
    await expect(
      call(
        router.sync.projects,
        { teamId: "team_2", cursor: null },
        {
          context: testContext({ id: "user_1", email: "viewer@example.com" }),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot sync projects for this team",
    });
  });

  test("creates ledger transactions through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
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

  test("creates ledger metadata and transfer pairs through the protected router", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    repository.accounts.set("acct_2", {
      id: "acct_2",
      teamId: "team_1",
      name: "Savings",
      currency: "USD",
      type: "bank",
    });
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };

    const counterparty = await call(
      router.ledger.createCounterparty,
      {
        teamId: "team_1",
        name: "Acme Inc",
        idempotencyKey: "counterparty_1",
      },
      context,
    );
    const tag = await call(
      router.ledger.createTag,
      {
        teamId: "team_1",
        name: "Transfer",
        idempotencyKey: "tag_1",
      },
      context,
    );
    const transaction = await call(
      router.ledger.createTransaction,
      {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Acme fee",
        postedAt: "2026-06-14T00:00:00.000Z",
        money: { amountMinor: -1200, currency: "USD" },
        type: "expense",
        source: "manual",
        counterpartyId: counterparty.counterparty.id,
        tagIds: [tag.tag.id],
        idempotencyKey: "txn_metadata_1",
      },
      context,
    );
    const transfer = await call(
      router.ledger.createTransferPair,
      {
        teamId: "team_1",
        fromAccountId: "acct_1",
        toAccountId: "acct_2",
        postedAt: "2026-06-15T00:00:00.000Z",
        description: "Reserve",
        money: { amountMinor: 5000, currency: "USD" },
        tagIds: [tag.tag.id],
        idempotencyKey: "transfer_1",
      },
      context,
    );

    expect(transaction.transaction.counterpartyId).toBe(counterparty.counterparty.id);
    expect(repository.tagAssignments).toContainEqual({
      transactionId: transaction.transaction.id,
      tagId: tag.tag.id,
    });
    expect(transfer.fromTransaction.transferGroupId).toBe(transfer.transferGroupId);
    expect(transfer.toTransaction.transferGroupId).toBe(transfer.transferGroupId);
    expect(transfer.fromTransaction.money.amountMinor).toBe(-5000);
    expect(transfer.toTransaction.money.amountMinor).toBe(5000);
    expect(repository.outboxEvents).toMatchObject([
      { type: "transaction.created" },
      {
        type: "transaction.transfer_pair.created",
        payload: {
          transferGroupId: transfer.transferGroupId,
          transactionIds: [transfer.fromTransaction.id, transfer.toTransaction.id],
        },
      },
    ]);
  });

  test("previews and commits CSV imports through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
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

  test("imports debit and credit CSV exports through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    const router = await createTestRouter(repository);
    const input = {
      teamId: "team_1",
      accountId: "acct_1",
      csvText:
        "Date;Description;Debit;Credit;Currency\n2026-06-14;Figma subscription;12,34;;USD\n2026-06-15;Invoice;;50,00;USD\n",
      mapping: {
        postedAt: "Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
        currency: "Currency",
      },
    };

    const preview = await call(router.csvImport.preview, input, {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    });
    const result = await call(
      router.csvImport.commit,
      {
        ...input,
        fileName: "bank-export.csv",
        idempotencyKey: "idem_debit_credit",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(preview.readyCount).toBe(2);
    expect(result.transactions.map((transaction) => transaction.money)).toEqual([
      { amountMinor: -1234, currency: "USD" },
      { amountMinor: 5000, currency: "USD" },
    ]);
  });

  test("suggests CSV import mappings through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "SEK",
      type: "bank",
    });
    const router = await createTestRouter(repository);
    const csvText = [
      "A,B,C,D,E,F,G",
      "2026-06-16,2026-06-16,ERIK KROON C,Transfer,360.00,,130.00",
      "2026-06-16,2026-06-16,AVI OVERDRAFT,Other,,-100.00,-230.00",
      "2026-06-02,2026-06-02,100003843496,Other,,-130.00,-130.00",
      "2026-05-12,2026-05-12,ERIK KROON C,Transfer,127.00,,0.00",
    ].join("\n");

    const suggestion = await call(
      router.csvImport.suggestMapping,
      { teamId: "team_1", csvText },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const preview = await call(
      router.csvImport.preview,
      {
        teamId: "team_1",
        accountId: "acct_1",
        csvText,
        mapping: suggestion.mapping,
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(suggestion.mapping).toMatchObject({
      postedAt: "A",
      description: "C",
      amount: null,
      credit: "E",
      debit: "F",
      balance: "G",
    });
    expect(preview.readyCount).toBe(4);
    expect(preview.summary.readyCurrencyTotals).toEqual({
      SEK: { amountMinor: 25700, currency: "SEK" },
    });
  });

  test("creates customers, products, and draft invoices through protected billing routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };

    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        email: "billing@acme.test",
        contactName: "Ada Buyer",
        contactEmail: "ada@acme.test",
        idempotencyKey: "customer_1",
      },
      context,
    );
    const product = await call(
      router.billing.createProduct,
      {
        teamId: "team_1",
        name: "Implementation",
        type: "service",
        unitPrice: { amountMinor: 50_00, currency: "USD" },
        defaultTaxRateBasisPoints: 2_500,
        idempotencyKey: "product_1",
      },
      context,
    );
    const invoice = await call(
      router.billing.createDraftInvoice,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-07-15T00:00:00.000Z",
        currency: "USD",
        discountBasisPoints: 0,
        lines: [
          {
            productId: product.product.id,
            description: "Implementation",
            quantityMilli: 2_000,
            unitPrice: { amountMinor: 50_00, currency: "USD" },
            taxRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "invoice_1",
      },
      context,
    );
    const updated = await call(
      router.billing.updateDraftInvoice,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-07-15T00:00:00.000Z",
        currency: "USD",
        discountBasisPoints: 1_000,
        lines: [
          {
            productId: product.product.id,
            description: "Implementation",
            quantityMilli: 2_000,
            unitPrice: { amountMinor: 50_00, currency: "USD" },
            taxRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "invoice_update_1",
      },
      context,
    );
    const preview = await call(
      router.billing.previewInvoicePdf,
      { teamId: "team_1", invoiceId: invoice.invoice.id },
      context,
    );
    const sent = await call(
      router.billing.sendInvoice,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        confirm: true,
        idempotencyKey: "send_1",
      },
      context,
    );
    const reminder = await call(
      router.billing.sendReminder,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        confirm: true,
        idempotencyKey: "reminder_1",
      },
      context,
    );
    const payment = await call(
      router.billing.recordPayment,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        amount: { amountMinor: 112_50, currency: "USD" },
        paidAt: "2026-06-20T00:00:00.000Z",
        idempotencyKey: "payment_1",
      },
      context,
    );
    const recurring = await call(
      router.billing.createRecurringSchedule,
      {
        teamId: "team_1",
        sourceInvoiceId: invoice.invoice.id,
        frequency: "monthly",
        nextRunAt: "2026-07-15T00:00:00.000Z",
        idempotencyKey: "recurring_1",
      },
      context,
    );
    const list = await call(router.billing.list, { teamId: "team_1" }, context);

    expect(customer.contact).toMatchObject({ email: "ada@acme.test" });
    expect(product.product.defaultTaxRateBasisPoints).toBe(2_500);
    expect(invoice.invoice.totals.total).toEqual({ amountMinor: 125_00, currency: "USD" });
    expect(updated.invoice.totals.total).toEqual({ amountMinor: 112_50, currency: "USD" });
    expect(Buffer.from(preview.pdf.bodyBase64, "base64").toString().startsWith("%PDF-1.4")).toBe(
      true,
    );
    expect(sent.invoice.status).toBe("sent");
    expect(reminder.invoice.status).toBe("sent");
    expect(reminder.providerMessageId).toBe("mock_email_team_1_" + invoice.invoice.id);
    expect(payment.invoice.status).toBe("paid");
    expect(recurring.schedule.frequency).toBe("monthly");
    expect(list.customers).toHaveLength(1);
    expect(list.products).toHaveLength(1);
    expect(list.invoices).toHaveLength(1);
    expect(list.draftInvoices).toHaveLength(0);
    expect(list.payments).toHaveLength(1);
    expect(list.recurringSchedules).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(8);
    expect(repository.outboxEvents).toHaveLength(8);
  });

  test("creates projects, tracks time, and invoices billable entries through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        idempotencyKey: "customer_1",
      },
      context,
    );
    const project = await call(
      router.projects.createProject,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        name: "Website rebuild",
        billableRate: { amountMinor: 150_00, currency: "USD" },
        idempotencyKey: "project_1",
      },
      context,
    );
    const timeEntry = await call(
      router.projects.createTimeEntry,
      {
        teamId: "team_1",
        projectId: project.project.id,
        description: "Design review",
        occurredOn: "2026-06-15T00:00:00.000Z",
        durationMinutes: 90,
        billableStatus: "billable",
        idempotencyKey: "time_1",
      },
      context,
    );
    const list = await call(router.projects.list, { teamId: "team_1" }, context);
    const invoice = await call(
      router.projects.createInvoiceFromTimeEntries,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-TIME-001",
        issueDate: "2026-06-16T00:00:00.000Z",
        timeEntryIds: [timeEntry.timeEntry.id],
        idempotencyKey: "invoice_time_1",
      },
      context,
    );

    expect(project.member.role).toBe("manager");
    expect(list.report.billableValue).toEqual({ amountMinor: 225_00, currency: "USD" });
    expect(invoice.invoice.lines[0]).toMatchObject({
      quantityMilli: 1_500,
      unitPrice: { amountMinor: 150_00, currency: "USD" },
    });
    expect(invoice.timeEntries[0]?.billableStatus).toBe("invoiced");
    expect(repository.auditEvents).toHaveLength(4);
    expect(repository.outboxEvents).toHaveLength(4);
  });

  test("creates CRM legal entities and filters account relationships through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        organizationNumber: "556123-4567",
        idempotencyKey: "crm_org_1",
      },
      context,
    );
    const legalEntity = await call(
      router.crm.createLegalEntity,
      {
        teamId: "team_1",
        legalName: "Dawn Sverige AB",
        organizationNumber: "559001-0001",
        baseCurrency: "SEK",
        idempotencyKey: "crm_legal_entity_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType: "customer",
        relationshipStatus: "active",
        lifecycleStage: "growth",
        segment: "mid-market",
        territory: "SE",
        idempotencyKey: "crm_account_1",
      },
      context,
    );
    const duplicates = await call(
      router.crm.suggestAccountDuplicates,
      {
        teamId: "team_1",
        legalName: "ACME AB",
        organizationNumber: "556 123 4567",
      },
      context,
    );
    const contact = await call(
      router.crm.createContact,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        givenName: "Ada",
        familyName: "Buyer",
        email: "ADA@ACME.test",
        role: "CFO",
        isPrimary: true,
        idempotencyKey: "crm_contact_1",
      },
      context,
    );
    repository.integrationConnections.set("fortnox_connection_1", {
      id: "fortnox_connection_1",
      teamId: "team_1",
      category: "accounting",
      provider: "fortnox",
      providerConnectionId: "fortnox:team_1",
      displayName: "Fortnox Demo AB",
      status: "connected",
      capabilities: ["sync", "disconnect"],
      tokenKeyId: "fortnox-token",
      tokenLastFour: "1234",
      tokenCiphertext: "encrypted",
      rawPayload: {},
      lastSyncAt: null,
      lastError: null,
      disabledAt: null,
      createdByActorId: "user_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    repository.providerObjects.set("fortnox:customer:1001", {
      integrationConnectionId: "fortnox_connection_1",
      providerConnectionId: "fortnox:team_1",
      customerNumber: "1001",
      name: "Acme AB",
    });
    const fortnoxMapping = await call(
      router.crm.linkAccountFortnoxCustomer,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        connectionId: "fortnox_connection_1",
        providerCustomerId: "1001",
        idempotencyKey: "crm_fortnox_customer_link_1",
      },
      context,
    );
    const opportunity = await call(
      router.crm.createOpportunity,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        stage: "qualified",
        expectedCloseDate: "2026-09-01T00:00:00.000Z",
        idempotencyKey: "crm_opportunity_1",
      },
      context,
    );
    const summary = await call(
      router.crm.accountSummary,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
      context,
    );
    const staged = await call(
      router.crm.updateOpportunityStage,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        stage: "proposal_sent",
        expectedRecordVersion: 1,
        idempotencyKey: "crm_opportunity_stage_1",
      },
      context,
    );
    const timeline = await call(
      router.crm.accountTimeline,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
      context,
    );
    await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType: "former_customer",
        relationshipStatus: "churned",
        churnedAt: "2026-06-01T00:00:00.000Z",
        idempotencyKey: "crm_account_2",
      },
      context,
    );

    const list = await call(
      router.crm.listAccounts,
      {
        teamId: "team_1",
        legalEntityId: legalEntity.legalEntity.recordId,
        relationshipStatus: "active",
      },
      context,
    );

    expect(list.accounts).toHaveLength(1);
    expect(list.accounts[0]).toMatchObject({
      legalEntityId: legalEntity.legalEntity.recordId,
      accountType: "customer",
      relationshipStatus: "active",
      lifecycleStage: "growth",
      segment: "mid-market",
      territory: "SE",
    });
    expect(duplicates.suggestions).toHaveLength(1);
    expect(duplicates.suggestions[0]).toMatchObject({
      account: { recordId: account.account.recordId, accountType: "customer" },
      organization: {
        recordId: organization.organization.recordId,
        legalName: "Acme AB",
        organizationNumber: "5561234567",
      },
      matchReasons: ["organization_number", "legal_name"],
    });
    expect(opportunity.opportunity).toMatchObject({
      accountId: account.account.recordId,
      stage: "qualified",
      status: "open",
      amountMinor: 250_000,
      currencyCode: "SEK",
    });
    expect(contact).toMatchObject({
      person: { displayName: "Ada Buyer", email: "ada@acme.test" },
      contact: { accountId: account.account.recordId, role: "CFO", isPrimary: true },
    });
    expect(fortnoxMapping).toMatchObject({
      account: { recordId: account.account.recordId },
      providerObject: {
        provider: "fortnox",
        providerObjectType: "customer",
        providerObjectId: "1001",
        internalEntityType: "account",
        internalEntityId: account.account.recordId,
      },
    });
    expect(summary.contacts).toEqual([
      {
        contact: expect.objectContaining({
          recordId: contact.contact.recordId,
          accountId: account.account.recordId,
          role: "CFO",
          isPrimary: true,
        }),
        person: expect.objectContaining({
          recordId: contact.person.recordId,
          displayName: "Ada Buyer",
          email: "ada@acme.test",
        }),
      },
    ]);
    expect(staged).toMatchObject({
      opportunity: { stage: "proposal_sent", status: "open" },
      record: { version: 2 },
    });
    expect(timeline.entries.map((entry) => entry.action)).toEqual([
      "crm.opportunity.stage_updated",
      "crm.opportunity.created",
      "crm.account.provider_customer.linked",
      "crm.contact.created",
      "crm.account.created",
    ]);
    expect(
      timeline.entries.find((entry) => entry.action === "crm.account.provider_customer.linked"),
    ).toMatchObject({
      details: { provider: "fortnox", providerObjectType: "customer", providerObjectId: "1001" },
    });
    expect(repository.outboxEvents).toMatchObject([
      { type: "crm.organization.created" },
      { type: "crm.legal_entity.created" },
      {
        type: "crm.account.created",
        payload: {
          legalEntityId: legalEntity.legalEntity.recordId,
          organizationId: organization.organization.recordId,
        },
      },
      {
        type: "crm.contact.created",
        payload: { displayName: "Ada Buyer", email: "ada@acme.test", isPrimary: true },
      },
      {
        type: "crm.account.provider_customer.linked",
        payload: { provider: "fortnox", providerObjectId: "1001" },
      },
      {
        type: "crm.opportunity.created",
        payload: { stage: "qualified", status: "open" },
      },
      {
        type: "crm.opportunity.stage_updated",
        payload: { stage: "proposal_sent", status: "open", recordVersion: 2 },
      },
      { type: "crm.account.created" },
    ]);

    const archivedContact = await call(
      router.crm.archiveContact,
      {
        teamId: "team_1",
        contactId: contact.contact.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "crm_contact_archive_1",
      },
      context,
    );
    const archivedOpportunity = await call(
      router.crm.archiveOpportunity,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        expectedRecordVersion: 2,
        idempotencyKey: "crm_opportunity_archive_1",
      },
      context,
    );
    const archivedAccount = await call(
      router.crm.archiveAccount,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "crm_account_archive_1",
      },
      context,
    );

    expect(archivedContact).toMatchObject({
      contact: { recordId: contact.contact.recordId },
      record: { lifecycleState: "archived", version: 2 },
    });
    expect(archivedOpportunity).toMatchObject({
      opportunity: {
        recordId: opportunity.opportunity.recordId,
        stage: "archived",
        status: "lost",
      },
      record: { lifecycleState: "archived", version: 3 },
    });
    expect(archivedAccount).toMatchObject({
      account: { recordId: account.account.recordId },
      record: { lifecycleState: "archived", version: 2 },
    });
  });

  test("runs commercial document quote lifecycle through protected and recipient routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.providerObjects.set("fortnox:article:KONSULT", {
      articleNumber: "KONSULT",
      description: "Fortnox consulting article",
      unit: "h",
      vat: 25,
      sourcePayload: { ArticleNumber: "KONSULT", Description: "Immutable article snapshot" },
    });
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const recipientContext = { context: createUnauthenticatedApiTestContext() };
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "quote_org_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        accountType: "customer",
        idempotencyKey: "quote_account_1",
      },
      context,
    );
    const opportunity = await call(
      router.crm.createOpportunity,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        stage: "proposal_preparation",
        idempotencyKey: "quote_opportunity_1",
      },
      context,
    );

    const created = await call(
      router.commercialDocuments.create,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        title: "Quote for implementation package",
        validUntil: "2026-07-20T00:00:00.000Z",
        paymentTerms: "30 dagar",
        termsVersion: "2026.1",
        recipientEmail: "buyer@example.com",
        scope: "Implementation and rollout",
        lines: [
          {
            source: "fortnox_article",
            providerObjectId: "KONSULT",
            description: "Consulting",
            quantityMilli: 3_000,
            unitPrice: { amountMinor: 12_500, currency: "SEK" },
          },
        ],
        idempotencyKey: "quote_create_1",
      },
      context,
    );
    const preview = await call(
      router.commercialDocuments.previewPdf,
      {
        teamId: "team_1",
        documentId: created.document.id,
      },
      context,
    );
    const finalized = await call(
      router.commercialDocuments.finalize,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "quote_finalize_1",
      },
      context,
    );
    const downloaded = await call(
      router.commercialDocuments.getPdf,
      {
        teamId: "team_1",
        documentId: created.document.id,
      },
      context,
    );
    const sent = await call(
      router.commercialDocuments.send,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "quote_send_1",
      },
      context,
    );
    const viewed = await call(
      router.commercialDocuments.recipientView,
      {
        accessToken: sent.recipientAccessToken,
      },
      recipientContext,
    );
    const declined = await call(
      router.commercialDocuments.recipientDecline,
      {
        accessToken: sent.recipientAccessToken,
        reason: "Budget paused",
      },
      recipientContext,
    );
    const declinedAgain = await call(
      router.commercialDocuments.recipientDecline,
      {
        accessToken: sent.recipientAccessToken,
        reason: "Different reason",
      },
      recipientContext,
    );
    const revised = await call(
      router.commercialDocuments.revise,
      {
        teamId: "team_1",
        documentId: created.document.id,
        title: "Revised quote for implementation package",
        lines: [
          {
            source: "freeform",
            description: "Reduced implementation package",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 20_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "quote_revise_1",
      },
      context,
    );
    const refinalized = await call(
      router.commercialDocuments.finalize,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "quote_finalize_2",
      },
      context,
    );
    const timeline = await call(
      router.crm.accountTimeline,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
      context,
    );

    expect(created.document).toMatchObject({
      opportunityId: opportunity.opportunity.recordId,
      status: "draft",
      currency: "SEK",
    });
    expect(created.document.lines[0]).toMatchObject({
      provider: "fortnox",
      providerObjectId: "KONSULT",
      providerObjectRecordId: "fortnox:article:KONSULT",
      articleNumber: "KONSULT",
      snapshot: {
        provider: "fortnox",
        providerObjectType: "article",
        providerObjectId: "KONSULT",
      },
    });
    expect(Buffer.from(preview.pdf.bodyBase64, "base64").toString("utf8")).toStartWith("%PDF-1.4");
    expect(finalized.version).toMatchObject({
      documentId: created.document.id,
      versionNumber: 1,
      status: "finalised",
    });
    expect(downloaded.version.id).toBe(finalized.version.id);
    expect(downloaded.pdf.bodyBase64).toBe(preview.pdf.bodyBase64);
    expect(typeof sent.recipientAccessToken).toBe("string");
    expect(sent.recipientAccessToken.length).toBeGreaterThan(0);
    expect(
      repository.commercialDocuments.get(created.document.id)?.recipientAccessTokenHash,
    ).not.toBe(sent.recipientAccessToken);
    expect(viewed).toMatchObject({
      viewed: true,
      document: { status: "viewed" },
      version: { id: finalized.version.id },
    });
    expect(viewed.pdf.bodyBase64).toBe(downloaded.pdf.bodyBase64);
    expect(declined).toMatchObject({
      declined: true,
      document: { status: "declined", declineReason: "Budget paused" },
    });
    expect(declinedAgain).toMatchObject({
      declined: false,
      document: { status: "declined", declineReason: "Budget paused" },
    });
    expect(revised).toMatchObject({
      document: {
        status: "draft",
        activeVersionId: null,
        title: "Revised quote for implementation package",
      },
      supersededVersion: {
        id: finalized.version.id,
        status: "superseded",
      },
    });
    expect(refinalized.version).toMatchObject({
      documentId: created.document.id,
      versionNumber: 2,
      status: "finalised",
    });
    expect(
      timeline.entries
        .filter((entry) => entry.action.startsWith("commercial_document."))
        .map((entry) => entry.action),
    ).toEqual([
      "commercial_document.finalised",
      "commercial_document.revised",
      "commercial_document.declined",
      "commercial_document.viewed",
      "commercial_document.sent",
      "commercial_document.finalised",
      "commercial_document.created",
    ]);
    expect(
      timeline.entries.find(
        (entry) =>
          entry.action === "commercial_document.finalised" && entry.details.versionNumber === 2,
      ),
    ).toMatchObject({
      entityId: created.document.id,
      details: {
        documentId: created.document.id,
        accountId: account.account.recordId,
        opportunityId: opportunity.opportunity.recordId,
        opportunityName: "Implementation package",
        documentType: "quote",
        title: "Revised quote for implementation package",
        status: "finalised",
        versionId: refinalized.version.id,
        versionNumber: 2,
      },
    });
    expect(
      timeline.entries.find((entry) => entry.action === "commercial_document.declined"),
    ).toMatchObject({
      entityId: created.document.id,
      details: {
        documentId: created.document.id,
        status: "declined",
        reason: "Budget paused",
      },
    });
    expect(repository.outboxEvents.map((event) => event.type)).toContain(
      "commercial_document.declined",
    );
  });

  test("runs TIC signature request, webhook completion, evidence, and receipt through routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "owner");
    const router = await createTestRouter(repository, {
      ticCompanyRolesProvider: createMockTicCompanyRolesProvider({
        fixtures: {
          trust_request_1: {
            companyRegistrationNumber: "5590001111",
            legalName: "Other Buyer AB",
            companyStatus: "Aktiv",
            signatureDescription: "Firmatecknare enligt TIC CompanyRoles",
          },
        },
      }),
    });
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const recipientContext = { context: createUnauthenticatedApiTestContext() };
    const legalEntity = await call(
      router.crm.createLegalEntity,
      {
        teamId: "team_1",
        legalName: "Seller AB",
        organizationNumber: "5599998888",
        countryCode: "SE",
        baseCurrency: "SEK",
        fiscalYearStartMonth: 1,
        idempotencyKey: "signature_legal_entity_1",
      },
      context,
    );
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Buyer AB",
        organizationNumber: "5561234567",
        countryCode: "SE",
        idempotencyKey: "signature_org_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType: "customer",
        idempotencyKey: "signature_account_1",
      },
      context,
    );
    repository.integrationConnections.set("fortnox_conn_1", {
      id: "fortnox_conn_1",
      teamId: "team_1",
      category: "accounting",
      provider: "fortnox",
      providerConnectionId: "fortnox:team_1",
      displayName: "Fortnox Demo AB",
      status: "connected",
      capabilities: ["connect", "sync", "disable"],
      tokenKeyId: "fortnox-token",
      tokenLastFour: "1234",
      tokenCiphertext: "encrypted-fortnox-token",
      rawPayload: {},
      lastSyncAt: null,
      lastError: null,
      disabledAt: null,
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    });
    await repository.upsertProviderObject({
      teamId: "team_1",
      provider: "fortnox",
      providerObjectType: "customer",
      providerObjectId: "1001",
      connectionId: "fortnox_conn_1",
      internalEntityType: "account",
      internalEntityId: account.account.recordId,
      rawPayload: { integrationConnectionId: "fortnox_conn_1", customerNumber: "1001" },
    });
    const opportunity = await call(
      router.crm.createOpportunity,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Signed implementation package",
        amountMinor: 125_000,
        currencyCode: "SEK",
        stage: "proposal_sent",
        idempotencyKey: "signature_opportunity_1",
      },
      context,
    );
    const created = await call(
      router.commercialDocuments.create,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        title: "Signature quote",
        validUntil: "2026-07-20T00:00:00.000Z",
        paymentTerms: "30 dagar",
        termsVersion: "2026.1",
        recipientEmail: "buyer@example.com",
        lines: [
          {
            source: "freeform",
            description: "Implementation",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 100_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "signature_quote_create_1",
      },
      context,
    );
    const finalized = await call(
      router.commercialDocuments.finalize,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "signature_quote_finalize_1",
      },
      context,
    );
    const sent = await call(
      router.commercialDocuments.send,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "signature_quote_send_1",
      },
      context,
    );
    const started = await call(
      router.commercialDocuments.startTicSignature,
      {
        teamId: "team_1",
        documentId: created.document.id,
        signerName: "Ada Buyer",
        signerEmail: "buyer@example.com",
        idempotencyKey: "signature_start_1",
      },
      context,
    );

    const body = JSON.stringify({
      providerEventId: "tic_evt_api_1",
      providerSessionId: started.signatureRequest.providerSessionId,
      documentPdfSha256: finalized.version.pdfSha256,
      signedAt: "2026-06-20T12:00:00.000Z",
      signerName: "Ada Buyer",
      signerEmail: "buyer@example.com",
      signerPersonalNumberMasked: "********1234",
      signatureValue: "signature-value",
      xmlDsig: "<Signature />",
      ocspResponse: "ocsp-response",
      evidenceObjectKey: "signatures/team_1/tic_evt_api_1.json",
    });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const signature = await signWebhookPayload({
      secret: "tic_webhook_secret_abcdefghijklmnopqrstuvwxyz",
      timestamp,
      body,
    });

    await expect(
      call(
        router.commercialDocuments.ticSignatureWebhook,
        {
          rawBody: body,
          timestamp,
          signature: "v1=invalid",
        },
        recipientContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const completed = await call(
      router.commercialDocuments.ticSignatureWebhook,
      {
        rawBody: body,
        timestamp,
        signature,
      },
      recipientContext,
    );
    const duplicate = await call(
      router.commercialDocuments.ticSignatureWebhook,
      {
        rawBody: body,
        timestamp,
        signature,
      },
      recipientContext,
    );
    const evidence = await call(
      router.commercialDocuments.getSignatureEvidence,
      {
        teamId: "team_1",
        signatureRequestId: started.signatureRequest.id,
      },
      context,
    );
    const receipt = await call(
      router.commercialDocuments.recipientSignatureReceipt,
      {
        accessToken: sent.recipientAccessToken,
      },
      recipientContext,
    );
    const updatedPolicy = await call(
      router.trust.updatePolicy,
      {
        teamId: "team_1",
        mode: "blocking",
        idempotencyKey: "trust_policy_1",
      },
      context,
    );
    const trustCheck = await call(
      router.trust.request,
      {
        teamId: "team_1",
        signatureRequestId: started.signatureRequest.id,
        signatureEvidenceId: evidence.evidence[0]?.id,
        idempotencyKey: "trust_request_1",
      },
      context,
    );
    const fetchedTrustCheck = await call(
      router.trust.forSignature,
      {
        teamId: "team_1",
        signatureRequestId: started.signatureRequest.id,
      },
      context,
    );
    const invoicePolicy = await call(
      router.invoiceHandoff.updatePolicy,
      {
        teamId: "team_1",
        mode: "automatic",
        idempotencyKey: "invoice_handoff_policy_1",
      },
      context,
    );

    await expect(
      call(
        router.invoiceHandoff.request,
        {
          teamId: "team_1",
          documentId: created.document.id,
          connectionId: "fortnox_conn_1",
          idempotencyKey: "invoice_handoff_blocked_1",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const reviewedTrustCheck = await call(
      router.trust.review,
      {
        teamId: "team_1",
        trustCheckId: trustCheck.trustCheck.id,
        decision: "approved",
        rationale: "Reviewer confirmed authority from original source descriptions.",
        idempotencyKey: "trust_review_1",
      },
      context,
    );
    const invoiceHandoff = await call(
      router.invoiceHandoff.request,
      {
        teamId: "team_1",
        documentId: created.document.id,
        connectionId: "fortnox_conn_1",
        idempotencyKey: "invoice_handoff_request_1",
      },
      context,
    );
    const duplicateInvoiceHandoff = await call(
      router.invoiceHandoff.request,
      {
        teamId: "team_1",
        documentId: created.document.id,
        connectionId: "fortnox_conn_1",
        idempotencyKey: "invoice_handoff_request_2",
      },
      context,
    );
    const processedInvoice = await processFortnoxInvoiceCreation(
      repository,
      createMockFortnoxInvoiceProvider(),
      resolveSystemAppRequest({
        actorId: "system:fortnox-invoice",
        requestId: "fortnox_invoice_job_1",
        teamId: "team_1",
      }),
      {
        teamId: "team_1",
        handoffId: invoiceHandoff.handoff.id,
        sourceOutboxEventId: "outbox_invoice_handoff_request_1",
        idempotencyKey: "fortnox_invoice_job_1",
        enforceCallerPermission: false,
      },
    );
    const replayedProcessedInvoice = await processFortnoxInvoiceCreation(
      repository,
      createMockFortnoxInvoiceProvider(),
      resolveSystemAppRequest({
        actorId: "system:fortnox-invoice",
        requestId: "fortnox_invoice_job_1",
        teamId: "team_1",
      }),
      {
        teamId: "team_1",
        handoffId: invoiceHandoff.handoff.id,
        sourceOutboxEventId: "outbox_invoice_handoff_request_1",
        idempotencyKey: "fortnox_invoice_job_1",
        enforceCallerPermission: false,
      },
    );
    const handoffForDocument = await call(
      router.invoiceHandoff.forDocument,
      {
        teamId: "team_1",
        documentId: created.document.id,
      },
      context,
    );
    const timeline = await call(
      router.crm.accountTimeline,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
      context,
    );

    expect(started.signatureRequest.hiddenSignedData).toMatchObject({
      seller: { legalName: "Seller AB" },
      account: { customerLegalName: "Buyer AB" },
      fortnoxCustomerMapping: { providerCustomerId: "1001" },
    });
    expect(completed).toMatchObject({
      replayed: false,
      document: { status: "signed" },
      evidence: {
        providerEventId: "tic_evt_api_1",
        verificationStatus: "verified",
        ocspResponse: "ocsp-response",
      },
    });
    expect(duplicate.replayed).toBe(true);
    expect(repository.crmOpportunities.get(opportunity.opportunity.recordId)).toMatchObject({
      stage: "won",
      status: "won",
    });
    expect(evidence.evidence).toHaveLength(1);
    expect(receipt).toMatchObject({
      document: { status: "signed" },
      version: { id: finalized.version.id },
      evidence: [{ providerEventId: "tic_evt_api_1" }],
    });
    expect(updatedPolicy.policy.mode).toBe("blocking");
    expect(trustCheck).toMatchObject({
      replayed: false,
      policy: { mode: "blocking" },
      trustCheck: {
        status: "needs_review",
        resultReason: "organization_number_mismatch",
        companyRegistrationNumber: "5590001111",
        advisoryAnalysis: { label: "advisory" },
        rawPayload: expect.any(Object),
        permissions: { canReview: true, sensitiveFieldsRedacted: false },
      },
    });
    expect(fetchedTrustCheck.trustCheck).toMatchObject({
      id: trustCheck.trustCheck.id,
      status: "needs_review",
    });
    expect(reviewedTrustCheck.trustCheck).toMatchObject({
      status: "approved",
      reviewDecision: "approved",
      reviewerActorId: "user_1",
      reviewRationale: "Reviewer confirmed authority from original source descriptions.",
    });
    expect(invoicePolicy.policy.mode).toBe("automatic");
    expect(invoiceHandoff).toMatchObject({
      replayed: false,
      handoff: {
        status: "requested",
        provider: "fortnox",
        connectionId: "fortnox_conn_1",
        documentVersionId: finalized.version.id,
      },
      policy: { mode: "automatic" },
    });
    expect(duplicateInvoiceHandoff).toMatchObject({
      replayed: true,
      handoff: { id: invoiceHandoff.handoff.id },
    });
    const providerInvoiceId = processedInvoice.handoff.providerInvoiceId;
    const providerInvoiceNumber = processedInvoice.handoff.providerInvoiceNumber;

    expect(providerInvoiceId).toEqual(expect.any(String));
    expect(providerInvoiceNumber).toEqual(expect.any(String));
    expect(processedInvoice).toMatchObject({
      replayed: false,
      handoff: {
        status: "created",
        providerInvoiceId,
        providerInvoiceNumber,
        providerInvoiceUrl: expect.stringContaining("fortnox"),
      },
      providerObject: {
        provider: "fortnox",
        providerObjectType: "invoice",
        internalEntityType: "commercial_document",
        internalEntityId: created.document.id,
      },
    });
    expect(replayedProcessedInvoice.replayed).toBe(true);
    expect(repository.crmOpportunities.get(opportunity.opportunity.recordId)).toMatchObject({
      stage: "won",
      status: "won",
    });
    expect(handoffForDocument.handoffs).toHaveLength(1);
    expect(handoffForDocument.handoffs[0]).toMatchObject({
      id: invoiceHandoff.handoff.id,
      status: "created",
      providerInvoiceId,
    });
    expect(repository.providerObjects.get(`fortnox:invoice:${providerInvoiceId}`)).toMatchObject({
      invoiceHandoffId: invoiceHandoff.handoff.id,
      documentVersionId: finalized.version.id,
      invoiceNumber: providerInvoiceNumber,
      paymentStatus: "unpaid",
    });
    expect(repository.outboxEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["invoice_handoff.requested", "invoice_handoff.created"]),
    );
    expect(timeline.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "signature.requested",
        "signature.completed",
        "trust_check.requested",
        "trust_check.completed",
        "trust_check.reviewed",
        "invoice_handoff.requested",
        "invoice_handoff.created",
      ]),
    );
  });

  test("runs recipient-token signing read, start, status, and receipt through public routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const recipientContext = { context: createUnauthenticatedApiTestContext() };
    const legalEntity = await call(
      router.crm.createLegalEntity,
      {
        teamId: "team_1",
        legalName: "Seller AB",
        organizationNumber: "5599998888",
        countryCode: "SE",
        baseCurrency: "SEK",
        fiscalYearStartMonth: 1,
        idempotencyKey: "recipient_signature_legal_entity_1",
      },
      context,
    );
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Buyer AB",
        organizationNumber: "5561234567",
        countryCode: "SE",
        idempotencyKey: "recipient_signature_org_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType: "customer",
        idempotencyKey: "recipient_signature_account_1",
      },
      context,
    );
    await repository.upsertProviderObject({
      teamId: "team_1",
      provider: "fortnox",
      providerObjectType: "customer",
      providerObjectId: "2002",
      connectionId: "fortnox_conn_2",
      internalEntityType: "account",
      internalEntityId: account.account.recordId,
      rawPayload: { integrationConnectionId: "fortnox_conn_2", customerNumber: "2002" },
    });
    const opportunity = await call(
      router.crm.createOpportunity,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Recipient signed package",
        amountMinor: 175_000,
        currencyCode: "SEK",
        stage: "proposal_sent",
        idempotencyKey: "recipient_signature_opportunity_1",
      },
      context,
    );
    const created = await call(
      router.commercialDocuments.create,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        title: "Recipient signature quote",
        validUntil: "2026-07-20T00:00:00.000Z",
        paymentTerms: "30 dagar",
        termsVersion: "2026.1",
        recipientEmail: "buyer@example.com",
        lines: [
          {
            source: "freeform",
            description: "Implementation",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 140_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "recipient_signature_quote_create_1",
      },
      context,
    );
    const finalized = await call(
      router.commercialDocuments.finalize,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "recipient_signature_quote_finalize_1",
      },
      context,
    );
    const sent = await call(
      router.commercialDocuments.send,
      {
        teamId: "team_1",
        documentId: created.document.id,
        expiresAt: "2099-08-20T00:00:00.000Z",
        idempotencyKey: "recipient_signature_quote_send_1",
      },
      context,
    );
    const storedSentDocument = repository.commercialDocuments.get(created.document.id)!;

    await expect(
      call(
        router.commercialDocuments.recipientSigningStatus,
        {
          accessToken: sent.recipientAccessToken,
          teamId: "team_2",
        } as any,
        recipientContext,
      ),
    ).rejects.toThrow();

    repository.commercialDocuments.set(created.document.id, {
      ...storedSentDocument,
      recipientAccessTokenExpiresAt: "2000-01-01T00:00:00.000Z",
    });
    await expect(
      call(
        router.commercialDocuments.recipientSigningStatus,
        { accessToken: sent.recipientAccessToken },
        recipientContext,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    repository.commercialDocuments.set(created.document.id, storedSentDocument);

    await expect(
      call(
        router.commercialDocuments.recipientSigningRead,
        { accessToken: "missing_token" },
        recipientContext,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const read = await call(
      router.commercialDocuments.recipientSigningRead,
      { accessToken: sent.recipientAccessToken },
      recipientContext,
    );
    const started = await call(
      router.commercialDocuments.recipientSigningStart,
      {
        accessToken: sent.recipientAccessToken,
        idempotencyKey: "recipient_signature_start_1",
      },
      recipientContext,
    );
    const status = await call(
      router.commercialDocuments.recipientSigningStatus,
      { accessToken: sent.recipientAccessToken },
      recipientContext,
    );

    expect(read).toMatchObject({
      state: "ready",
      document: { status: "viewed", versionNumber: 1, pdfSha256: finalized.version.pdfSha256 },
      pdf: { sha256: finalized.version.pdfSha256 },
      sender: { legalName: "Seller AB" },
      customer: { legalName: "Buyer AB" },
    });
    expect(started).toMatchObject({
      replayed: false,
      surface: { state: "pending", pdf: null },
      signatureRequest: {
        teamId: "team_1",
        documentId: created.document.id,
        documentVersionId: finalized.version.id,
        createdByActorId: `recipient:${created.document.id}`,
        hiddenSignedData: {
          seller: { legalName: "Seller AB" },
          account: { customerLegalName: "Buyer AB" },
          signer: { email: "buyer@example.com", role: "external_signer" },
          fortnoxCustomerMapping: { providerCustomerId: "2002" },
        },
      },
    });
    expect(status).toMatchObject({
      state: "pending",
      pdf: null,
      signature: {
        status: "requested",
        signingUrl: started.signatureRequest.signingUrl,
      },
    });

    const body = JSON.stringify({
      providerEventId: "tic_evt_recipient_api_1",
      providerSessionId: started.signatureRequest.providerSessionId,
      documentPdfSha256: finalized.version.pdfSha256,
      signedAt: "2026-06-20T12:00:00.000Z",
      signerName: "Ada Buyer",
      signerEmail: "buyer@example.com",
      signerPersonalNumberMasked: "********1234",
      signatureValue: "signature-value",
      xmlDsig: "<Signature />",
      ocspResponse: "ocsp-response",
      evidenceObjectKey: "signatures/team_1/tic_evt_recipient_api_1.json",
    });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const signature = await signWebhookPayload({
      secret: "tic_webhook_secret_abcdefghijklmnopqrstuvwxyz",
      timestamp,
      body,
    });
    await call(
      router.commercialDocuments.ticSignatureWebhook,
      {
        rawBody: body,
        timestamp,
        signature,
      },
      recipientContext,
    );
    const signedStatus = await call(
      router.commercialDocuments.recipientSigningStatus,
      { accessToken: sent.recipientAccessToken },
      recipientContext,
    );
    const receipt = await call(
      router.commercialDocuments.recipientSigningReceipt,
      { accessToken: sent.recipientAccessToken },
      recipientContext,
    );

    expect(signedStatus).toMatchObject({
      state: "signed",
      pdf: null,
      receipt: {
        signatureRequestId: started.signatureRequest.id,
        evidence: [{ verificationStatus: "verified" }],
      },
    });
    expect(receipt).toMatchObject({
      state: "signed",
      pdf: { sha256: finalized.version.pdfSha256 },
      receipt: {
        signatureRequestId: started.signatureRequest.id,
        downloads: expect.arrayContaining([
          expect.objectContaining({ kind: "signed_pdf" }),
          expect.objectContaining({ kind: "evidence_receipt" }),
        ]),
      },
    });
  });

  test("promotes market prospect and snapshots lineage into commercial documents", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const seeded = await call(
      router.market.seedCompany,
      {
        teamId: "team_1",
        provider: "tic",
        providerCapability: "company_profile",
        providerCompanyId: "tic:5569876543",
        retrievedAt: "2026-06-20T10:00:00.000Z",
        legalName: "Beta AB",
        organizationNumber: "556987-6543",
        rawPayload: { name: "Beta AB", orgNo: "5569876543" },
        rawPayloadReference: "r2://tic/beta.json",
        idempotencyKey: "api_market_seed_1",
      },
      context,
    );
    const prospect = await call(
      router.market.createProspect,
      {
        teamId: "team_1",
        companyId: seeded.company.id,
        companySnapshotId: seeded.snapshot.id,
        sourceGoalId: "goal_api_1",
        sourceRunId: "run_api_1",
        icpId: "icp_api_1",
        segmentId: "segment_api_1",
        sourceDecisionSummary: "Seeded from TIC mock profile",
        idempotencyKey: "api_market_prospect_1",
      },
      context,
    );
    const promoted = await call(
      router.market.promoteProspect,
      {
        teamId: "team_1",
        prospectId: prospect.prospect.id,
        opportunityName: "Beta quote",
        amountMinor: 95_000,
        currencyCode: "SEK",
        idempotencyKey: "api_market_promote_1",
      },
      context,
    );
    const document = await call(
      router.commercialDocuments.create,
      {
        teamId: "team_1",
        opportunityId: promoted.opportunity.recordId,
        title: "Beta pilot quote",
        termsVersion: "terms-2026-06",
        recipientEmail: "buyer@beta.se",
        lines: [
          {
            source: "freeform",
            description: "Quote-to-cash pilot",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 95_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "api_market_document_1",
      },
      context,
    );
    const preview = await call(
      router.commercialDocuments.previewPdf,
      {
        teamId: "team_1",
        documentId: document.document.id,
      },
      context,
    );
    const timeline = await call(
      router.crm.accountTimeline,
      {
        teamId: "team_1",
        accountId: promoted.account.recordId,
      },
      context,
    );

    expect(promoted.marketOrigin).toMatchObject({
      companyId: seeded.company.id,
      companySnapshotId: seeded.snapshot.id,
      prospectId: prospect.prospect.id,
      sourceGoalId: "goal_api_1",
      sourceRunId: "run_api_1",
      icpId: "icp_api_1",
      segmentId: "segment_api_1",
      sourceProvider: "tic",
    });
    expect(document.document.marketOrigin).toEqual(promoted.marketOrigin);
    expect(preview.snapshot.marketOrigin).toEqual(promoted.marketOrigin);
    expect(timeline.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "market.company.seeded",
        "market.prospect.created",
        "market.prospect.promoted",
        "commercial_document.created",
      ]),
    );
  });

  test("creates CRM metadata, writes a typed value, and filters accounts through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "crm_metadata_org_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        accountType: "customer",
        idempotencyKey: "crm_metadata_account_1",
      },
      context,
    );
    const field = await call(
      router.crm.createFieldDefinition,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "customer_tier",
        label: "Customer tier",
        fieldType: "single_option",
        options: [
          { stableKey: "gold", label: "Gold" },
          { stableKey: "silver", label: "Silver" },
        ],
        idempotencyKey: "crm_metadata_field_1",
      },
      context,
    );
    const setValue = await call(
      router.crm.setRecordFieldValue,
      {
        teamId: "team_1",
        recordId: account.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "single_option", stableKey: "gold" },
        expectedRecordVersion: 1,
        idempotencyKey: "crm_metadata_set_1",
      },
      context,
    );
    const filtered = await call(
      router.crm.listAccounts,
      {
        teamId: "team_1",
        customFieldFilter: {
          fieldDefinitionId: field.fieldDefinition.id,
          value: { type: "single_option", stableKey: "gold" },
        },
      },
      context,
    );

    expect(field.optionValues.map((option) => option.stableKey)).toEqual(["gold", "silver"]);
    expect(setValue.record.version).toBe(2);
    expect(filtered.accounts).toHaveLength(1);
    expect(filtered.accounts[0]?.recordId).toBe(account.account.recordId);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.record_field_value.set",
    });
  });

  test("updates CRM account, contact, and opportunity through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const organization = await call(
      router.crm.createOrganization,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "crm_update_org_1",
      },
      context,
    );
    const account = await call(
      router.crm.createAccount,
      {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        idempotencyKey: "crm_update_account_create_1",
      },
      context,
    );
    const contact = await call(
      router.crm.createContact,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        givenName: "Ada",
        familyName: "Buyer",
        email: "ada@acme.test",
        role: "CFO",
        idempotencyKey: "crm_update_contact_create_1",
      },
      context,
    );
    const opportunity = await call(
      router.crm.createOpportunity,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "crm_update_opportunity_create_1",
      },
      context,
    );

    const updatedAccount = await call(
      router.crm.updateAccount,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        accountType: "customer",
        lifecycleStage: "growth",
        segment: "mid-market",
        expectedRecordVersion: 1,
        idempotencyKey: "crm_update_account_1",
      },
      context,
    );
    const updatedContact = await call(
      router.crm.updateContact,
      {
        teamId: "team_1",
        contactId: contact.contact.recordId,
        familyName: "Signer",
        email: "signer@acme.test",
        role: "Signer",
        isPrimary: true,
        expectedRecordVersion: 1,
        idempotencyKey: "crm_update_contact_1",
      },
      context,
    );
    const updatedOpportunity = await call(
      router.crm.updateOpportunity,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        name: "Implementation and rollout",
        amountMinor: 325_000,
        currencyCode: "SEK",
        expectedCloseDate: "2026-09-01T00:00:00.000Z",
        expectedRecordVersion: 1,
        idempotencyKey: "crm_update_opportunity_1",
      },
      context,
    );

    expect(updatedAccount).toMatchObject({
      account: { accountType: "customer", lifecycleStage: "growth", segment: "mid-market" },
      record: { version: 2 },
    });
    expect(updatedContact).toMatchObject({
      person: { displayName: "Ada Signer", email: "signer@acme.test" },
      contact: { role: "Signer", isPrimary: true },
      record: { version: 2 },
    });
    expect(updatedOpportunity).toMatchObject({
      opportunity: {
        name: "Implementation and rollout",
        amountMinor: 325_000,
        expectedCloseDate: "2026-09-01T00:00:00.000Z",
      },
      record: { version: 2 },
    });
    expect(repository.outboxEvents.at(-3)).toMatchObject({ type: "crm.account.updated" });
    expect(repository.outboxEvents.at(-2)).toMatchObject({ type: "crm.contact.updated" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.opportunity.updated" });
  });

  test("returns report overview metrics with drilldown sources through protected routes", async () => {
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
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        idempotencyKey: "customer_1",
      },
      context,
    );
    await call(
      router.ledger.createTransaction,
      {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Client payment",
        postedAt: "2026-06-10T00:00:00.000Z",
        money: { amountMinor: 500_00, currency: "USD" },
        type: "income",
        source: "manual",
        idempotencyKey: "txn_1",
      },
      context,
    );
    const invoice = await call(
      router.billing.createDraftInvoice,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-12T00:00:00.000Z",
        currency: "USD",
        lines: [
          {
            description: "Consulting",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 100_00, currency: "USD" },
            taxRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "invoice_1",
      },
      context,
    );
    const report = await call(
      router.reports.overview,
      {
        teamId: "team_1",
        from: "2026-06-08T00:00:00.000Z",
        to: "2026-06-15T23:59:59.000Z",
      },
      context,
    );

    expect(report.report.cashflow).toEqual({ amountMinor: 500_00, currency: "USD" });
    expect(report.report.revenueByCustomer[0]).toMatchObject({
      label: "Acme Co",
      sources: [{ type: "invoice", id: invoice.invoice.id, label: "INV-001" }],
    });
    expect(report.report.unpaidInvoices[0]).toMatchObject({
      invoiceNumber: "INV-001",
      amountDue: { amountMinor: 125_00, currency: "USD" },
    });
  });

  test("answers assistant questions with persisted cited messages through protected routes", async () => {
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
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        idempotencyKey: "assistant_customer_1",
      },
      context,
    );
    await call(
      router.ledger.createTransaction,
      {
        teamId: "team_1",
        accountId: "acct_1",
        description: "Client payment",
        postedAt: "2026-06-10T00:00:00.000Z",
        money: { amountMinor: 500_00, currency: "USD" },
        type: "income",
        source: "manual",
        idempotencyKey: "assistant_txn_1",
      },
      context,
    );
    await call(
      router.billing.createDraftInvoice,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-AI-001",
        issueDate: "2026-06-12T00:00:00.000Z",
        currency: "USD",
        lines: [
          {
            description: "Consulting",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 100_00, currency: "USD" },
          },
        ],
        idempotencyKey: "assistant_invoice_1",
      },
      context,
    );

    const answer = await call(
      router.assistant.ask,
      {
        teamId: "team_1",
        message: "Explain cashflow and unpaid invoices",
      },
      context,
    );
    const thread = await call(
      router.assistant.thread,
      { teamId: "team_1", threadId: answer.thread.id },
      context,
    );

    expect(answer.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(answer.toolCalls.map((toolCall) => toolCall.toolName)).toContain("get_report_overview");
    expect(answer.messages[1]?.sourceRefs.length).toBeGreaterThan(0);
    expect(thread.messages).toHaveLength(2);
    expect(thread.toolCalls.length).toBeGreaterThan(0);
  });

  test("approves assistant draft actions through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "member@example.com" }) };
    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        email: "billing@example.com",
        idempotencyKey: "assistant_approval_customer_1",
      },
      context,
    );
    await call(
      router.billing.createProduct,
      {
        teamId: "team_1",
        name: "Consulting",
        type: "service",
        unitPrice: { amountMinor: 100_00, currency: "USD" },
        defaultTaxRateBasisPoints: 0,
        idempotencyKey: "assistant_approval_product_1",
      },
      context,
    );

    const proposed = await call(
      router.assistant.ask,
      {
        teamId: "team_1",
        message: `Draft invoice for ${customer.customer.name}`,
      },
      context,
    );
    const approval = proposed.actionApprovals.find(
      (candidate) => candidate.toolName === "create_invoice_draft",
    );

    if (!approval) {
      throw new Error("Missing assistant draft approval");
    }

    const approved = await call(
      router.assistant.approveAction,
      {
        teamId: "team_1",
        approvalId: approval.id,
        idempotencyKey: "assistant_approval_execute_1",
      },
      context,
    );
    const billing = await call(router.billing.list, { teamId: "team_1" }, context);

    expect(approved.approval).toMatchObject({
      id: approval.id,
      status: "executed",
      risk: "draft",
    });
    expect(billing.draftInvoices).toHaveLength(1);
  });

  test("creates automation rules and runs them for protected outbox events", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.categories.set("cat_software", {
      id: "cat_software",
      teamId: "team_1",
      name: "Software",
    });
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      postedAt: "2026-06-15T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.outboxEventRecords.set("outbox_1", {
      id: "outbox_1",
      teamId: "team_1",
      type: "transaction.created",
      version: 1,
      payload: { transactionId: "txn_1" },
      dispatchAttempts: 0,
      status: "pending",
      occurredAt: "2026-06-15T00:00:00.000Z",
    });
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    const created = await call(
      router.automations.createRule,
      {
        teamId: "team_1",
        name: "Categorize new software transactions",
        trigger: { type: "outbox_event", eventType: "transaction.created" },
        actionType: "categorize_transaction",
        actionConfig: { categoryId: "cat_software" },
        approvalPolicy: "auto_approve",
        idempotencyKey: "automation_rule_1",
      },
      context,
    );
    const run = await call(
      router.automations.runForOutboxEvent,
      { teamId: "team_1", outboxEventId: "outbox_1" },
      context,
    );
    const workspace = await call(router.automations.list, { teamId: "team_1" }, context);

    expect(created.rule).toMatchObject({ actionType: "categorize_transaction" });
    expect(run.runs[0]).toMatchObject({ status: "succeeded" });
    expect(workspace.rules).toHaveLength(1);
    expect(workspace.recentRuns).toHaveLength(1);
    expect(repository.transactions.get("txn_1")).toMatchObject({
      categoryId: "cat_software",
      reviewState: "reviewed",
    });
  });

  test("manages developer API keys, OAuth consent, and webhook subscriptions through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    const apiKey = await call(
      router.developers.createApiKey,
      {
        teamId: "team_1",
        name: "Reporting client",
        scopes: ["transactions.read", "documents.read", "projects.read"],
        idempotencyKey: "api_key_1",
      },
      context,
    );
    const webhook = await call(
      router.developers.createWebhookSubscription,
      {
        teamId: "team_1",
        url: "https://example.com/webhooks/dawn",
        eventTypes: ["transaction.created"],
        idempotencyKey: "webhook_1",
      },
      context,
    );
    const oauthApp = await call(
      router.developers.createOAuthApp,
      {
        teamId: "team_1",
        name: "Partner reporting",
        redirectUris: ["https://partner.example.com/oauth/callback"],
        scopes: ["transactions.read", "documents.write", "invoices.read", "projects.write"],
        idempotencyKey: "oauth_app_1",
      },
      context,
    );
    const consent = await call(
      router.developers.previewOAuthConsent,
      {
        teamId: "team_1",
        appId: oauthApp.app.id,
        redirectUri: "https://partner.example.com/oauth/callback",
        scopes: ["transactions.read"],
      },
      context,
    );
    const grant = await call(
      router.developers.grantOAuthConsent,
      {
        teamId: "team_1",
        appId: oauthApp.app.id,
        redirectUri: "https://partner.example.com/oauth/callback",
        scopes: ["transactions.read"],
        idempotencyKey: "oauth_grant_1",
      },
      context,
    );
    const workspace = await call(router.developers.list, { teamId: "team_1" }, context);

    expect(apiKey.token.startsWith("dawn_")).toBe(true);
    expect(repository.apiKeys.get(apiKey.apiKey.id)?.keyHash).not.toBe(apiKey.token);
    expect(webhook.signingSecret.startsWith("whsec_")).toBe(true);
    expect(oauthApp.app).toMatchObject({
      name: "Partner reporting",
      scopes: ["transactions.read", "documents.write", "invoices.read", "projects.write"],
    });
    expect(consent).toMatchObject({
      app: { id: oauthApp.app.id },
      scopes: ["transactions.read"],
    });
    expect(grant.grant).toMatchObject({
      appId: oauthApp.app.id,
      actorId: "user_1",
      scopes: ["transactions.read"],
    });
    expect(workspace.apiKeys).toHaveLength(1);
    expect(workspace.oauthApps).toHaveLength(1);
    expect(workspace.oauthGrants).toHaveLength(1);
    expect(workspace.webhookSubscriptions).toHaveLength(1);
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

  test("lists inbox items and corrects extracted document fields through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.documents.set("doc_1", {
      id: "doc_1",
      teamId: "team_1",
      title: "Receipt",
      status: "uploaded",
      currentVersionId: "ver_1",
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    });
    repository.documentVersions.set("ver_1", {
      id: "ver_1",
      documentId: "doc_1",
      teamId: "team_1",
      versionNumber: 1,
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.txt",
      fileName: "receipt.txt",
      contentType: "text/plain",
      byteSize: 64,
      status: "uploaded",
      uploadedAt: "2026-06-15T10:00:00.000Z",
      createdAt: "2026-06-15T10:00:00.000Z",
    });
    repository.inboxSources.set("source_1", {
      id: "source_1",
      teamId: "team_1",
      type: "document_upload",
      name: "Document uploads",
      createdAt: "2026-06-15T10:00:00.000Z",
    });
    repository.inboxItems.set("inbox_1", {
      id: "inbox_1",
      teamId: "team_1",
      sourceId: "source_1",
      sourceType: "document_upload",
      documentId: "doc_1",
      documentVersionId: "ver_1",
      status: "needs_review",
      extractionStatus: "completed",
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:02:00.000Z",
      latestExtraction: {
        id: "extract_1",
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        documentVersionId: "ver_1",
        extractionVersion: 1,
        source: "local_deterministic",
        status: "completed",
        fields: { merchantName: "Acme", totalAmountMinor: 4250, currency: "USD" },
        confidence: { merchantName: 0.72, totalAmountMinor: 0.72, currency: 0.72 },
        rawText: "Acme\nTotal USD 42.50",
        error: null,
        createdByActorId: "user_1",
        createdAt: "2026-06-15T10:02:00.000Z",
      },
    });
    repository.extractions.set(
      "extract_1",
      repository.inboxItems.get("inbox_1")?.latestExtraction as DocumentExtraction,
    );
    const router = await createTestRouter(repository);

    const inbox = await call(
      router.inbox.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const corrected = await call(
      router.inbox.correctExtraction,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        fields: {
          merchantName: "Acme Supply Co",
          totalAmountMinor: 4300,
          currency: "USD",
        },
        idempotencyKey: "correct_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(inbox.inboxItems).toHaveLength(1);
    expect(inbox.inboxItems[0]?.latestExtraction?.fields).toMatchObject({
      merchantName: "Acme",
    });
    expect(corrected.extraction).toMatchObject({
      source: "user_correction",
      extractionVersion: 2,
      fields: { merchantName: "Acme Supply Co", totalAmountMinor: 4300 },
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "document_extraction.corrected",
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "document_extraction.corrected",
    });

    await repository.markDocumentExtractionFailed({
      teamId: "team_1",
      inboxItemId: "inbox_1",
      error: "OCR provider timed out",
      failedAt: new Date("2026-06-15T10:05:00.000Z"),
    });
    const retry = await call(
      router.inbox.retryExtraction,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        idempotencyKey: "retry_extraction_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(retry.inboxItem).toMatchObject({
      status: "pending_extraction",
      extractionStatus: "pending",
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "document_extraction.retry_requested",
      payload: {
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        versionId: "ver_1",
        actorId: "user_1",
      },
    });

    const dismissed = await call(
      router.inbox.dismissItem,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        idempotencyKey: "dismiss_inbox_1",
      },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(dismissed.inboxItem.status).toBe("dismissed");
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "inbox_item.dismissed",
    });

    const afterDismissal = await call(
      router.inbox.list,
      { teamId: "team_1" },
      {
        context: testContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(afterDismissal.inboxItems).toHaveLength(0);
  });

  test("suggests, accepts, and rejects inbox transaction matches through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supply INV-42",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_1",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.transactions.set("txn_2", {
      id: "txn_2",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supply INV-42 duplicate",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_2",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.inboxItems.set("inbox_1", {
      id: "inbox_1",
      teamId: "team_1",
      sourceId: "source_1",
      sourceType: "document_upload",
      documentId: "doc_1",
      documentVersionId: "version_1",
      status: "needs_review",
      extractionStatus: "completed",
      createdByActorId: "user_1",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:02:00.000Z",
      latestExtraction: {
        id: "extract_1",
        teamId: "team_1",
        inboxItemId: "inbox_1",
        documentId: "doc_1",
        documentVersionId: "version_1",
        extractionVersion: 1,
        source: "local_deterministic",
        status: "completed",
        fields: {
          merchantName: "Acme Supply",
          issuedAt: "2026-06-14T00:00:00.000Z",
          invoiceNumber: "INV-42",
          totalAmountMinor: 4250,
          currency: "USD",
        },
        confidence: {},
        rawText: "Acme Supply invoice INV-42 total USD 42.50",
        error: null,
        createdByActorId: "user_1",
        createdAt: "2026-06-15T10:02:00.000Z",
      },
    });
    const router = await createTestRouter(repository);
    const callerContext = {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    };

    const generated = await call(
      router.inbox.suggestMatches,
      { teamId: "team_1", inboxItemId: "inbox_1" },
      callerContext,
    );
    const accepted = await call(
      router.inbox.acceptMatch,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[0]?.id ?? "",
        idempotencyKey: "accept_match_1",
      },
      callerContext,
    );
    const rejected = await call(
      router.inbox.rejectMatch,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[1]?.id ?? "",
        reason: "wrong duplicate",
        idempotencyKey: "reject_match_1",
      },
      callerContext,
    );

    expect(generated.suggestions).toHaveLength(2);
    expect(generated.suggestions[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(accepted.suggestion.status).toBe("accepted");
    expect(accepted.inboxItem.status).toBe("resolved");
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(rejected.suggestion.status).toBe("rejected");
    expect(repository.hardNegatives).toMatchObject([
      { inboxItemId: "inbox_1", transactionId: "txn_2", reason: "wrong duplicate" },
    ]);
  });

  test("traces uploaded receipt extraction through match accept reject and re-suggest", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "member");
    repository.transactions.set("txn_1", {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supplies receipt R-100",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_1",
      categoryId: null,
      reviewState: "needs_review",
    });
    repository.transactions.set("txn_2", {
      id: "txn_2",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Acme Supplies duplicate card payment",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -4250, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_txn_2",
      categoryId: null,
      reviewState: "needs_review",
    });
    const router = await createTestRouter(repository);
    const callerContext = {
      context: testContext({ id: "user_1", email: "member@example.com" }),
    };

    const prepared = await call(
      router.documents.createUpload,
      {
        teamId: "team_1",
        fileName: "acme-receipt.txt",
        contentType: "text/plain",
        byteSize: 57,
        idempotencyKey: "manual_tracer_upload_1",
      },
      callerContext,
    );
    const completed = await completeDocumentUpload(
      repository,
      {
        actor: { id: "user_1", type: "user" },
        requestId: "manual_tracer_complete",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        byteSize: 57,
      },
    );
    const extracted = await runStoredDocumentExtraction(
      repository,
      {
        async readDocument() {
          const body = new TextEncoder().encode(
            "Acme Supplies\nReceipt R-100\nDate 2026-06-14\nTotal USD 42.50",
          ).buffer;

          return {
            body,
            contentType: "text/plain",
            byteSize: body.byteLength,
          };
        },
      },
      {
        source: "local_deterministic",
        async extract(input) {
          return createDeterministicDocumentExtractor().extract({
            ...input,
            rawText: new TextDecoder("utf-8").decode(input.body ?? new ArrayBuffer(0)),
          });
        },
      },
      {
        actor: { id: "user_1", type: "user" },
        requestId: "manual_tracer_extract",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        inboxItemId: completed.inboxItem.id,
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        idempotencyKey: "manual_tracer_extract_1",
      },
    );

    const generated = await call(
      router.inbox.suggestMatches,
      { teamId: "team_1", inboxItemId: completed.inboxItem.id, limit: 2 },
      callerContext,
    );
    const accepted = await call(
      router.inbox.acceptMatch,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[0]?.id ?? "",
        idempotencyKey: "manual_tracer_accept_1",
      },
      callerContext,
    );

    expect(repository.attachments).toEqual([
      { transactionId: "txn_1", documentId: prepared.document.id },
    ]);

    const rejectedAccepted = await call(
      router.inbox.rejectMatch,
      {
        teamId: "team_1",
        suggestionId: accepted.suggestion.id,
        reason: "wrong receipt",
        idempotencyKey: "manual_tracer_reject_accepted_1",
      },
      callerContext,
    );
    const regenerated = await call(
      router.inbox.suggestMatches,
      { teamId: "team_1", inboxItemId: completed.inboxItem.id, limit: 2 },
      callerContext,
    );

    expect(completed.inboxItem).toMatchObject({
      status: "pending_extraction",
      extractionStatus: "pending",
    });
    expect(extracted.extraction.fields).toMatchObject({
      documentType: "receipt",
      merchantName: "Acme Supplies",
      issuedAt: "2026-06-14",
      totalAmountMinor: 4250,
      currency: "USD",
    });
    expect(generated.suggestions.map((suggestion) => suggestion.transactionId)).toEqual([
      "txn_1",
      "txn_2",
    ]);
    expect(accepted).toMatchObject({
      suggestion: { status: "accepted", transactionId: "txn_1" },
      inboxItem: { status: "resolved" },
    });
    expect(rejectedAccepted).toMatchObject({
      suggestion: { status: "rejected", transactionId: "txn_1" },
    });
    expect(repository.attachments).toEqual([]);
    expect(repository.inboxItems.get(completed.inboxItem.id)?.status).toBe("needs_review");
    expect(regenerated.suggestions).toHaveLength(1);
    expect(regenerated.suggestions[0]).toMatchObject({
      transactionId: "txn_2",
      status: "suggested",
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

  test("completes sandbox bank connection, syncs, and disconnects through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "owner");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "owner@example.com" }) };

    const catalog = await call(router.banking.list, { teamId: "team_1" }, context);
    const session = await call(
      router.banking.createSession,
      {
        teamId: "team_1",
        provider: "sandbox-bank",
        redirectUrl: "http://localhost:3001/dashboard#banking",
        idempotencyKey: "session_1",
      },
      context,
    );
    const connected = await call(
      router.banking.complete,
      {
        teamId: "team_1",
        provider: "sandbox-bank",
        providerSessionId: session.session.providerSessionId,
        publicToken: "public-sandbox-token",
        idempotencyKey: "complete_1",
      },
      context,
    );
    const synced = await call(
      router.banking.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_1",
      },
      context,
    );
    const disconnected = await call(
      router.banking.disconnect,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "disconnect_1",
      },
      context,
    );

    expect(catalog.providers.map((provider) => provider.provider)).toContain("sandbox-bank");
    expect(session.session.provider).toBe("sandbox-bank");
    expect(connected.connection).toMatchObject({
      provider: "sandbox-bank",
      tokenKeyId: "mock-kms-local",
      tokenLastFour: "oken",
    });
    expect(synced.transactions).toHaveLength(3);
    expect(disconnected.connection.status).toBe("disconnected");
    expect(repository.transactions.size).toBe(3);
    expect(repository.bankAccounts.size).toBe(2);
  });

  test("manages integration adapters through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    const catalog = await call(router.integrations.list, { teamId: "team_1" }, context);
    const fortnoxAuthorization = await call(
      router.integrations.createFortnoxAuthorizationUrl,
      {
        teamId: "team_1",
        redirectUrl: "http://localhost:3001/settings",
      },
      context,
    );
    const connectedFortnox = await call(
      router.integrations.completeFortnoxOAuth,
      {
        teamId: "team_1",
        code: "fortnox_authorization_code_1234",
        redirectUrl: "http://localhost:3001/settings",
        state: fortnoxAuthorization.state,
        idempotencyKey: "integration_connect_fortnox_1",
      },
      context,
    );
    const replayedFortnoxCallback = await call(
      router.integrations.completeFortnoxOAuth,
      {
        teamId: "team_1",
        code: "fortnox_authorization_code_1234",
        redirectUrl: "http://localhost:3001/settings",
        state: fortnoxAuthorization.state,
        idempotencyKey: "integration_connect_fortnox_1",
      },
      context,
    );
    const connected = await call(
      router.integrations.connect,
      {
        teamId: "team_1",
        provider: "mock-accounting",
        idempotencyKey: "integration_connect_1",
      },
      context,
    );
    const connectedPayments = await call(
      router.integrations.connect,
      {
        teamId: "team_1",
        provider: "mock-payments",
        idempotencyKey: "integration_connect_payments_1",
      },
      context,
    );
    const connectedMessaging = await call(
      router.integrations.connect,
      {
        teamId: "team_1",
        provider: "mock-messaging",
        idempotencyKey: "integration_connect_messaging_1",
      },
      context,
    );
    const connectedEmail = await call(
      router.integrations.connect,
      {
        teamId: "team_1",
        provider: "mock-email",
        idempotencyKey: "integration_connect_email_1",
      },
      context,
    );
    repository.transactions.set("txn_export_1", {
      id: "txn_export_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Consulting payment",
      postedAt: "2026-06-15T00:00:00.000Z",
      money: { amountMinor: 5_000_00, currency: "USD" },
      type: "income",
      source: "manual",
      categoryId: null,
      reviewState: "reviewed",
    });
    const customer = await call(
      router.billing.createCustomer,
      {
        teamId: "team_1",
        name: "Acme Co",
        idempotencyKey: "integration_export_customer_1",
      },
      context,
    );
    const invoice = await call(
      router.billing.createDraftInvoice,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-EXPORT-1",
        issueDate: "2026-06-15T00:00:00.000Z",
        currency: "USD",
        lines: [
          {
            description: "Consulting",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 5_000_00, currency: "USD" },
          },
        ],
        idempotencyKey: "integration_export_invoice_1",
      },
      context,
    );
    await call(
      router.billing.sendInvoice,
      {
        teamId: "team_1",
        invoiceId: invoice.invoice.id,
        toEmail: "billing@acme.test",
        confirm: true,
        idempotencyKey: "integration_send_invoice_1",
      },
      context,
    );
    const synced = await call(
      router.integrations.sync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "integration_sync_1",
      },
      context,
    );
    const syncedFortnox = await call(
      router.integrations.sync,
      {
        teamId: "team_1",
        connectionId: connectedFortnox.connection.id,
        idempotencyKey: "integration_sync_fortnox_1",
      },
      context,
    );
    const fortnoxCatalog = await call(
      router.integrations.fortnoxCatalog,
      {
        teamId: "team_1",
        connectionId: connectedFortnox.connection.id,
      },
      context,
    );
    const exportedTransactions = await call(
      router.integrations.exportAccounting,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        exportType: "transactions",
        idempotencyKey: "integration_export_transactions_1",
      },
      context,
    );
    const exportedInvoices = await call(
      router.integrations.exportAccounting,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        exportType: "invoices",
        idempotencyKey: "integration_export_invoices_1",
      },
      context,
    );
    const recordedPayment = await call(
      router.integrations.recordPaymentEvent,
      {
        teamId: "team_1",
        connectionId: connectedPayments.connection.id,
        rawPayload: {
          providerEventId: "evt_payment_1",
          invoiceId: invoice.invoice.id,
          amountMinor: 5_000_00,
          currency: "USD",
          paidAt: "2026-06-16T00:00:00.000Z",
          method: "card",
        },
        idempotencyKey: "integration_payment_event_1",
      },
      context,
    );
    const sentMessage = await call(
      router.integrations.sendMessage,
      {
        teamId: "team_1",
        connectionId: connectedMessaging.connection.id,
        channel: "#finance",
        text: "Invoice paid",
        confirm: true,
        idempotencyKey: "integration_message_1",
      },
      context,
    );
    const sentEmail = await call(
      router.integrations.sendEmail,
      {
        teamId: "team_1",
        connectionId: connectedEmail.connection.id,
        to: "owner@example.com",
        subject: "Invoice paid",
        text: "Acme paid INV-EXPORT-1.",
        confirm: true,
        idempotencyKey: "integration_email_1",
      },
      context,
    );
    const disabled = await call(
      router.integrations.disable,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "integration_disable_1",
      },
      context,
    );
    const disconnectedFortnox = await call(
      router.integrations.disconnectFortnox,
      {
        teamId: "team_1",
        connectionId: connectedFortnox.connection.id,
        idempotencyKey: "integration_disconnect_fortnox_1",
      },
      context,
    );

    expect(catalog.providers.map((provider) => provider.provider)).toContain("fortnox");
    expect(new URL(fortnoxAuthorization.authorizationUrl).searchParams.get("response_type")).toBe(
      "code",
    );
    expect(connectedFortnox.connection).toMatchObject({
      provider: "fortnox",
      rawPayload: {
        oauth: {
          source: "authorization_code",
          stateValidated: true,
          authorizationCodeLastFour: "1234",
        },
      },
    });
    expect(replayedFortnoxCallback).toMatchObject({ replayed: true });
    expect(connected.connection).toMatchObject({
      provider: "mock-accounting",
      status: "connected",
      tokenKeyId: "mock-kms-local",
    });
    expect(
      repository.integrationConnections
        .get(connected.connection.id)
        ?.tokenCiphertext.includes("mock_secret"),
    ).toBe(false);
    expect(synced.syncRun).toMatchObject({ status: "completed", recordsSynced: 3 });
    expect(syncedFortnox.syncRun).toMatchObject({ status: "completed", recordsSynced: 8 });
    expect(fortnoxCatalog).toMatchObject({
      company: { providerObjectId: "5566778899" },
    });
    expect(fortnoxCatalog.customers.map((customer) => customer.providerObjectId)).toEqual([
      "1001",
      "1002",
    ]);
    expect(fortnoxCatalog.articles.map((article) => article.providerObjectId)).toEqual([
      "KONSULT",
      "SUPPORT",
    ]);
    expect(exportedTransactions.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { exportType: "transactions" },
    });
    expect(exportedInvoices.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { exportType: "invoices" },
    });
    expect(recordedPayment).toMatchObject({
      invoice: { status: "paid" },
      payment: { method: "card" },
      syncRun: { status: "completed", recordsSynced: 1 },
    });
    expect(sentMessage).toMatchObject({
      syncRun: { status: "completed", recordsSynced: 1 },
    });
    expect(sentEmail).toMatchObject({
      syncRun: { status: "completed", recordsSynced: 1 },
    });
    expect(disabled.connection.status).toBe("disabled");
    expect(disconnectedFortnox.connection.status).toBe("disabled");
    expect(repository.invoicePayments).toHaveLength(1);
    expect(repository.integrationSyncRuns).toHaveLength(7);
    expect(repository.providerObjects).toHaveLength(8);
  });

  test("manages email inbox OAuth, settings, and sync requests through protected routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);
    const dispatchCalls: unknown[] = [];
    const apiContext = testContext({ id: "user_1", email: "admin@example.com" });
    apiContext.outboxDispatcher = async (command) => {
      dispatchCalls.push(command);
      return { scanned: 1, dispatched: 1, failed: 0, skipped: 0, queuedMessages: 2 };
    };
    const context = { context: apiContext };

    const catalog = await call(router.emailInbox.list, { teamId: "team_1" }, context);
    const authUrl = await call(
      router.emailInbox.createAuthorizationUrl,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        redirectUrl: "http://localhost:3001/inbox?emailInboxProvider=mock-email-inbox",
      },
      context,
    );
    await expect(
      call(
        router.emailInbox.completeOAuth,
        // @ts-expect-error Missing state is intentional validation coverage.
        {
          teamId: "team_1",
          provider: "mock-email-inbox",
          code: "oauth_code_1",
          redirectUrl: "http://localhost:3001/inbox?emailInboxProvider=mock-email-inbox",
          idempotencyKey: "email_inbox_oauth_missing_state",
        },
        context,
      ),
    ).rejects.toThrow();
    const connected = await call(
      router.emailInbox.completeOAuth,
      {
        teamId: "team_1",
        provider: "mock-email-inbox",
        code: "oauth_code_1",
        redirectUrl: "http://localhost:3001/inbox?emailInboxProvider=mock-email-inbox",
        state: authUrl.state,
        idempotencyKey: "email_inbox_oauth_1",
      },
      context,
    );
    const settings = await call(
      router.emailInbox.updateSettings,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        settings: {
          senderBlocklist: ["blocked@example.com"],
          domainBlocklist: ["noise.example"],
          maxAttachmentBytes: 1_000_000,
        },
        idempotencyKey: "email_inbox_settings_1",
      },
      context,
    );
    const requested = await call(
      router.emailInbox.requestSync,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "email_inbox_sync_request_1",
      },
      context,
    );
    const workspace = await call(router.emailInbox.list, { teamId: "team_1" }, context);

    expect(catalog.providers.map((provider) => provider.provider)).toContain("mock-email-inbox");
    expect(authUrl.authorizationUrl).toContain(`state=${encodeURIComponent(authUrl.state)}`);
    expect(connected.connection).toMatchObject({
      category: "email",
      provider: "mock-email-inbox",
      displayName: "receipts@example.com",
    });
    expect(
      repository.integrationConnections.get(connected.connection.id)?.tokenCiphertext,
    ).not.toContain("mock_refresh");
    expect(settings.connection.rawPayload?.emailInbox).toMatchObject({
      settings: {
        senderBlocklist: ["blocked@example.com"],
        domainBlocklist: ["noise.example"],
        maxAttachmentBytes: 1_000_000,
      },
    });
    expect(requested.connection.id).toBe(connected.connection.id);
    expect(requested.outboxDispatch).toMatchObject({
      dispatched: 1,
      queuedMessages: 2,
    });
    expect(dispatchCalls).toEqual([{ limit: 25 }]);
    expect(workspace.connections[0]).toMatchObject({
      accountEmail: "receipts@example.com",
      grantedScopes: ["email.inbox.readonly"],
      settings: {
        senderBlocklist: ["blocked@example.com"],
        domainBlocklist: ["noise.example"],
      },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "inbox.provider.sync_requested",
      payload: { connectionId: connected.connection.id, provider: "mock-email-inbox" },
    });
  });

  test("connects Gmail inbox from the signed-in Google account", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const googleTokens: GoogleAuthAccountTokens = {
      provider: "google",
      providerAccountId: "google_user_1",
      accessToken: "google_access_token",
      refreshToken: "google_refresh_token",
      expiresAt: "2026-06-15T16:00:00.000Z",
      idToken: "google_id_token",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
      rawPayload: { providerId: "google", providerAccountId: "google_user_1" },
    };
    const router = await createTestRouter(repository, {
      emailInboxConnectors: [createGmailMockInboxConnector()],
      googleAuthAccountTokensForUser: async (userId) => (userId === "user_1" ? googleTokens : null),
    });
    const dispatchCalls: unknown[] = [];
    const apiContext = testContext({ id: "user_1", email: "admin@example.com" });
    apiContext.outboxDispatcher = async (command) => {
      dispatchCalls.push(command);
      return { scanned: 1, dispatched: 1, failed: 0, skipped: 0, queuedMessages: 2 };
    };
    const context = { context: apiContext };

    const connected = await call(
      router.emailInbox.connectGoogleLogin,
      {
        teamId: "team_1",
        idempotencyKey: "email_inbox_google_login_1",
      },
      context,
    );

    expect(connected.connection).toMatchObject({
      category: "email",
      provider: "gmail",
      displayName: "receipts@example.com",
      status: "connected",
    });
    expect(
      repository.integrationConnections.get(connected.connection.id)?.tokenCiphertext,
    ).not.toContain("google_refresh_token");
    expect(connected.connection.rawPayload?.emailInbox).toMatchObject({
      source: "google_login",
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    });
    expect(connected.syncRequest.connection.id).toBe(connected.connection.id);
    expect(connected.outboxDispatch).toMatchObject({
      dispatched: 1,
      queuedMessages: 2,
    });
    expect(dispatchCalls).toEqual([{ limit: 25 }]);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "inbox.provider.sync_requested",
      payload: {
        connectionId: connected.connection.id,
        provider: "gmail",
        manual: true,
      },
    });

    const replayed = await call(
      router.emailInbox.connectGoogleLogin,
      {
        teamId: "team_1",
        idempotencyKey: "email_inbox_google_login_1",
      },
      context,
    );

    expect(replayed.replayed).toBe(true);
    expect(replayed.syncRequest.replayed).toBe(true);
    expect(
      repository.outboxEvents.filter((event) => event.type === "inbox.provider.sync_requested"),
    ).toHaveLength(1);
  });

  test("connects Gmail inbox from Google login access token without a refresh token", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const googleTokens: GoogleAuthAccountTokens = {
      provider: "google",
      providerAccountId: "google_user_1",
      accessToken: "google_access_token",
      refreshToken: null,
      expiresAt: "2026-06-15T16:00:00.000Z",
      idToken: "google_id_token",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
      rawPayload: { providerId: "google", providerAccountId: "google_user_1" },
    };
    const router = await createTestRouter(repository, {
      emailInboxConnectors: [createGmailMockInboxConnector()],
      googleAuthAccountTokensForUser: async (userId) => (userId === "user_1" ? googleTokens : null),
    });
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    const connected = await call(
      router.emailInbox.connectGoogleLogin,
      {
        teamId: "team_1",
        idempotencyKey: "email_inbox_google_login_access_token_only",
      },
      context,
    );

    expect(connected.connection).toMatchObject({
      category: "email",
      provider: "gmail",
      displayName: "receipts@example.com",
      status: "connected",
    });
    expect(connected.connection.rawPayload?.emailInbox).toMatchObject({
      source: "google_login",
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    });
    expect(connected.syncRequest.connection.id).toBe(connected.connection.id);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "inbox.provider.sync_requested",
      payload: {
        connectionId: connected.connection.id,
        provider: "gmail",
        manual: true,
      },
    });
  });

  test("rejects Google login inbox connection without Gmail readonly scope", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository, {
      emailInboxConnectors: [createGmailMockInboxConnector()],
      googleAuthAccountTokensForUser: async () => ({
        provider: "google",
        providerAccountId: "google_user_1",
        accessToken: "google_access_token",
        refreshToken: "google_refresh_token",
        expiresAt: "2026-06-15T16:00:00.000Z",
        scopes: ["openid", "email", "profile"],
        rawPayload: {},
      }),
    });
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    await expect(
      call(
        router.emailInbox.connectGoogleLogin,
        {
          teamId: "team_1",
          idempotencyKey: "email_inbox_google_login_missing_scope",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.integrationConnections).toHaveLength(0);
  });

  test("returns operations workspace with redacted failure and audit records", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    repository.auditEvents.push({
      id: "audit_1",
      teamId: "team_1",
      actorId: "user_1",
      requestId: "request_trace_1",
      action: "webhook.delivery_failed",
      entityType: "webhook_delivery",
      entityId: "delivery_1",
      metadata: { email: "ops@example.com", safe: "value" },
      occurredAt: "2026-06-15T00:00:00.000Z",
    });
    repository.outboxEventRecords.set("outbox_1", {
      id: "outbox_1",
      teamId: "team_1",
      type: "webhook.delivery_failed",
      version: 1,
      payload: { authorization: "Bearer token123", deliveryId: "delivery_1" },
      dispatchAttempts: 8,
      status: "failed",
      lastError: "failed for ops@example.com",
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: null,
    });
    repository.jobRuns.set("job_1", {
      id: "job_1",
      teamId: "team_1",
      outboxEventId: "outbox_1",
      jobType: "webhook.deliver",
      queueName: "dawn-jobs",
      status: "failed",
      attempt: 8,
      idempotencyKey: "webhook:deliver:outbox_1",
      error: "Bearer token123 failed for ops@example.com",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:01.000Z",
    });
    repository.webhookDeliveries.set("delivery_1", {
      id: "delivery_1",
      teamId: "team_1",
      subscriptionId: "subscription_1",
      outboxEventId: "outbox_1",
      status: "failed",
      attempt: 1,
      requestPayload: { email: "ops@example.com" },
      responseStatus: 500,
      responseBody: "failed for ops@example.com",
      error: "Bearer token123 rejected",
      nextAttemptAt: null,
      deliveredAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:01.000Z",
    });
    repository.transactions.set("transaction_ready", {
      id: "transaction_ready",
      teamId: "team_1",
      accountId: "account_1",
      description: "Ready for accountant",
      postedAt: "2026-06-10T00:00:00.000Z",
      money: { amountMinor: -4200, currency: "USD" },
      type: "expense",
      source: "manual",
      counterpartyId: null,
      transferGroupId: null,
      providerTransactionId: null,
      categoryId: "category_1",
      reviewState: "reviewed",
      accountantStatus: "ready_to_export",
      accountantStatusReason: null,
      accountantStatusUpdatedAt: null,
      duplicateKey: null,
      updatedAt: "2026-06-10T00:00:00.000Z",
    });
    repository.transactions.set("transaction_outside_period", {
      id: "transaction_outside_period",
      teamId: "team_1",
      accountId: "account_1",
      description: "Outside close period",
      postedAt: "2026-07-01T00:00:00.000Z",
      money: { amountMinor: -9900, currency: "USD" },
      type: "expense",
      source: "manual",
      counterpartyId: null,
      transferGroupId: null,
      providerTransactionId: null,
      categoryId: "category_1",
      reviewState: "reviewed",
      accountantStatus: "ready_to_export",
      accountantStatusReason: null,
      accountantStatusUpdatedAt: null,
      duplicateKey: null,
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    repository.packetAttachments.push({
      transactionId: "transaction_ready",
      documentId: "document_1",
      versionId: "version_1",
      objectKey: "documents/document_1.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 128,
    });
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "admin@example.com" }) };

    const workspace = await call(
      router.operations.list,
      {
        teamId: "team_1",
        audit: {
          action: "webhook.delivery_failed",
          entityType: "webhook_delivery",
          entityId: "delivery_1",
          requestId: "request_trace_1",
        },
        accountantClose: {
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
        },
      },
      context,
    );

    expect(workspace.metrics).toMatchObject({ deadLetters: 1, failedJobs: 1, webhookFailures: 1 });
    expect(workspace.auditEvents).toHaveLength(1);
    expect(workspace.auditEvents[0]?.metadata).toEqual({ email: "[redacted]", safe: "value" });
    expect(workspace.recentOutboxEvents[0]?.payload).toEqual({
      authorization: "[redacted]",
      deliveryId: "delivery_1",
    });
    expect(workspace.recentJobRuns[0]?.error).toBe(
      "Bearer [redacted-token] failed for [redacted-email]",
    );
    expect(workspace.jobRunActions).toEqual([
      expect.objectContaining({
        jobRunId: "job_1",
        status: "dead_lettered",
        canRetry: false,
        reason: "Bearer [redacted-token] failed for [redacted-email]",
      }),
    ]);
    expect(workspace.accountantClose).toMatchObject({
      status: "ready",
      transactionCount: 1,
      readyToExportCount: 1,
      actionableCount: 0,
    });
  });

  test("queues data workflow requests through protected operations routes", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "owner");
    const router = await createTestRouter(repository);
    const context = { context: testContext({ id: "user_1", email: "owner@example.com" }) };

    const exportRequest = await call(
      router.operations.requestDataExport,
      {
        teamId: "team_1",
        idempotencyKey: "export_1",
      },
      context,
    );
    const deletionRequest = await call(
      router.operations.requestDataDeletion,
      {
        teamId: "team_1",
        confirmTeamId: "team_1",
        reason: "closing workspace",
        idempotencyKey: "delete_1",
      },
      context,
    );

    expect(exportRequest.workflow).toMatchObject({ type: "team_data_export", status: "queued" });
    expect(deletionRequest.workflow).toMatchObject({
      type: "team_data_deletion",
      status: "queued",
    });
    expect(repository.auditEvents.map((event) => event.action)).toEqual([
      "team_data.export_requested",
      "team_data.deletion_requested",
    ]);
    expect(repository.outboxEvents).toMatchObject([
      { type: "team_data.export_requested" },
      { type: "team_data.deletion_requested" },
    ]);
  });

  test("rejects tenant deletion requests from non-owners", async () => {
    const repository = new MemoryTransactionReviewRepository();
    repository.teams.set("team_1", "Test Team");
    repository.memberships.set("user_1:team_1", "admin");
    const router = await createTestRouter(repository);

    await expect(
      call(
        router.operations.requestDataDeletion,
        {
          teamId: "team_1",
          confirmTeamId: "team_1",
          idempotencyKey: "delete_1",
        },
        { context: testContext({ id: "user_1", email: "admin@example.com" }) },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only team owners can request tenant deletion",
    });
  });
});
