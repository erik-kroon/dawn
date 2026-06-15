import { describe, expect, test } from "bun:test";

import {
  AppError,
  buildTeamDataExportSnapshot,
  completeTeamDataExport,
  gateTeamDataDeletion,
  listOperationsWorkspace,
  redactOperationalText,
  redactOperationalValue,
  requestTeamDataDeletion,
  requestTeamDataExport,
  type AuditLogEntry,
  type DawnRepository,
  type IdempotencyResult,
  type OperationsUseCaseRepository,
  type ReviewWorkspaceData,
  type TeamDataExportRepository,
  type JobRun,
  type OutboxEvent,
  type ProviderSyncRun,
} from "./index";
import type {
  Actor,
  AutomationRun,
  IntegrationSyncRun,
  TeamRole,
  Transaction,
  WebhookDelivery,
} from "@dawn/domain";

class MemoryOperationsRepository {
  memberships = new Map<string, TeamRole>();
  auditEvents: AuditLogEntry[] = [];
  outboxEvents: OutboxEvent[] = [];
  jobRuns: JobRun[] = [];
  providerSyncRuns: ProviderSyncRun[] = [];
  integrationSyncRuns: IntegrationSyncRun[] = [];
  automationRuns: AutomationRun[] = [];
  webhookDeliveries: WebhookDelivery[] = [];
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  workspaceTransactions: Transaction[] = [
    {
      id: "transaction_1",
      teamId: "team_1",
      accountId: "account_1",
      description: "Figma subscription",
      postedAt: "2026-06-14T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "manual",
      reviewState: "needs_review",
      accountantStatus: "needs_review",
      accountantStatusReason: null,
      accountantStatusUpdatedAt: null,
      categoryId: "category_1",
      counterpartyId: null,
      transferGroupId: null,
      updatedAt: "2026-06-14T00:00:00.000Z",
    },
  ];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async ensureDefaultWorkspace() {
    return { teamId: "team_1" };
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
  }

  async listAuditEvents(input: {
    action?: string | null;
    entityId?: string | null;
    entityType?: string | null;
    limit: number;
    requestId?: string | null;
    teamId: string;
  }) {
    return this.auditEvents
      .filter((event) => event.teamId === input.teamId)
      .filter((event) => !input.action || event.action === input.action)
      .filter((event) => !input.entityType || event.entityType === input.entityType)
      .filter((event) => !input.entityId || event.entityId === input.entityId)
      .filter((event) => !input.requestId || event.requestId === input.requestId)
      .slice(0, input.limit);
  }

  async listWorkspace(_actor: Actor, teamId = "team_1"): Promise<ReviewWorkspaceData> {
    return {
      teamId,
      teamName: "Acme Studio",
      categories: [
        {
          id: "category_1",
          teamId: "team_1",
          name: "Software",
        },
      ],
      transactions: this.workspaceTransactions.filter(
        (transaction) => transaction.teamId === teamId,
      ),
      sync: {
        collection: "transactions",
        cursor: "2026-06-14T00:00:00.000Z",
        conflictPolicy: "server_wins_for_financial_state",
      },
    };
  }

  async listBankConnectionSummaries() {
    return [
      {
        connection: {
          id: "bank_connection_1",
          teamId: "team_1",
          provider: "mock-bank",
          providerConnectionId: "provider_connection_1",
          institutionName: "Mock Bank",
          status: "error",
          tokenKeyId: "bank_tokens",
          tokenLastFour: "1234",
          lastSyncAt: null,
          createdAt: "2026-06-15T00:00:00.000Z",
          updatedAt: "2026-06-15T00:00:00.000Z",
        },
        accounts: [],
        latestSyncRun: {
          id: "provider_sync_1",
          teamId: "team_1",
          connectionId: "bank_connection_1",
          status: "failed",
          startedAt: "2026-06-15T00:00:00.000Z",
          completedAt: "2026-06-15T00:00:01.000Z",
          accountsSynced: 0,
          transactionsImported: 0,
          duplicateCount: 0,
          error: "provider failed with token sk_live_secret123456",
        },
      },
    ];
  }

  async listDocuments() {
    return [];
  }

  async listInboxItems() {
    return [];
  }

  async listTeamAliases() {
    return [];
  }

  async listCustomers() {
    return [];
  }

  async listCustomerContacts() {
    return [];
  }

  async listProducts() {
    return [];
  }

  async listInvoices() {
    return [];
  }

  async listInvoicePayments() {
    return [];
  }

  async listRecurringInvoiceSchedules() {
    return [];
  }

  async listProjects() {
    return [];
  }

  async listProjectMembers() {
    return [];
  }

  async listTimeEntries() {
    return [];
  }

  async listBusinessInsights() {
    return [];
  }

  async listAssistantThreads() {
    return [];
  }

  async listPendingAssistantActionApprovals() {
    return [];
  }

  async listAssistantMessages() {
    return [];
  }

  async listAssistantToolCalls() {
    return [];
  }

  async listAssistantActionApprovals() {
    return [];
  }

  async listAutomationRules() {
    return [];
  }

  async listOutboxEvents(teamId: string, limit: number) {
    return this.outboxEvents.filter((event) => event.teamId === teamId).slice(0, limit);
  }

  async listJobRuns(teamId: string, limit: number) {
    return this.jobRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listProviderSyncRuns(teamId: string, limit: number) {
    return this.providerSyncRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listIntegrationSyncRuns(teamId: string, limit: number) {
    return this.integrationSyncRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listIntegrationConnectionSummaries() {
    return [];
  }

  async listApiKeys() {
    return [];
  }

  async listOAuthApps() {
    return [];
  }

  async listOAuthGrants() {
    return [];
  }

  async listWebhookSubscriptions() {
    return [];
  }

  async listAutomationRuns(teamId: string, limit: number) {
    return this.automationRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listWebhookDeliveries(teamId: string, limit: number) {
    return this.webhookDeliveries.filter((delivery) => delivery.teamId === teamId).slice(0, limit);
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
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

  async appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) {
    this.auditEvents.unshift({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: new Date("2026-06-15T00:00:00.000Z").toISOString(),
      ...input,
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
    this.outboxEvents.unshift({
      id: `outbox_${this.outboxEvents.length + 1}`,
      teamId: input.teamId,
      type: input.type,
      version: input.version,
      payload: input.payload,
      status: "pending",
      dispatchAttempts: 0,
      lastError: null,
      nextAttemptAt: null,
      occurredAt: new Date("2026-06-15T00:00:00.000Z").toISOString(),
      processedAt: null,
    });
  }
}

class MemoryOperationsWorkflowRepository implements OperationsUseCaseRepository {
  memberships = new Map<string, TeamRole>();
  auditEvents: AuditLogEntry[] = [];
  outboxEvents: OutboxEvent[] = [];
  idempotency = new Map<string, IdempotencyResult<unknown>>();

  async withTransaction<T>(
    callback: (repository: OperationsUseCaseRepository) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  async ensureDefaultWorkspace() {
    return { teamId: "team_1" };
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
  }

  async listWorkspace(_actor: Actor, teamId: string): Promise<ReviewWorkspaceData> {
    return {
      teamId,
      teamName: "Acme Studio",
      categories: [],
      transactions: [],
      sync: {
        collection: "transactions",
        cursor: null,
        conflictPolicy: "server_wins_for_financial_state",
      },
    };
  }

  async listAuditEvents(input: {
    action?: string | null;
    entityId?: string | null;
    entityType?: string | null;
    limit: number;
    requestId?: string | null;
    teamId: string;
  }) {
    return this.auditEvents
      .filter((event) => event.teamId === input.teamId)
      .filter((event) => !input.action || event.action === input.action)
      .filter((event) => !input.entityType || event.entityType === input.entityType)
      .filter((event) => !input.entityId || event.entityId === input.entityId)
      .filter((event) => !input.requestId || event.requestId === input.requestId)
      .slice(0, input.limit);
  }

  async listOutboxEvents(teamId: string, limit: number) {
    return this.outboxEvents.filter((event) => event.teamId === teamId).slice(0, limit);
  }

  async listJobRuns() {
    return [];
  }

  async listProviderSyncRuns() {
    return [];
  }

  async listIntegrationSyncRuns() {
    return [];
  }

  async listAutomationRuns() {
    return [];
  }

  async listWebhookDeliveries() {
    return [];
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
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

  async appendAuditEvent(input: Omit<AuditLogEntry, "id" | "occurredAt">) {
    this.auditEvents.unshift({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: "2026-06-15T00:00:00.000Z",
      ...input,
    });
  }

  async appendOutboxEvent(input: {
    teamId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }) {
    this.outboxEvents.unshift({
      id: `outbox_${this.outboxEvents.length + 1}`,
      teamId: input.teamId,
      type: input.type,
      version: input.version,
      payload: input.payload,
      status: "pending",
      dispatchAttempts: 0,
      lastError: null,
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: null,
    });
  }
}

const actor = { id: "user_1", type: "user" } as const;
const context = { actor, requestId: "request_1", teamId: "team_1" };

function operationsTransaction(input: {
  id: string;
  postedAt: string;
  reviewState: Transaction["reviewState"];
  accountantStatus: NonNullable<Transaction["accountantStatus"]>;
}): Transaction {
  return {
    id: input.id,
    teamId: "team_1",
    accountId: "account_1",
    description: input.id,
    postedAt: input.postedAt,
    money: { amountMinor: -1200, currency: "USD" },
    type: "expense",
    source: "manual",
    reviewState: input.reviewState,
    accountantStatus: input.accountantStatus,
    accountantStatusReason: null,
    accountantStatusUpdatedAt: null,
    categoryId: "category_1",
    counterpartyId: null,
    transferGroupId: null,
    updatedAt: input.postedAt,
  };
}

describe("operations workspace", () => {
  test("exposes job failures, dead letters, audit search, and staged data workflows", async () => {
    const repository = new MemoryOperationsRepository();
    repository.memberships.set("user_1:team_1", "admin");
    repository.auditEvents.push({
      id: "audit_1",
      teamId: "team_1",
      actorId: "user_1",
      requestId: "request_1",
      action: "invoice.sent",
      entityType: "invoice",
      entityId: "invoice_1",
      metadata: { email: "customer@example.com", note: "sent with Bearer abc123" },
      occurredAt: "2026-06-15T00:00:00.000Z",
    });
    repository.outboxEvents.push({
      id: "outbox_1",
      teamId: "team_1",
      type: "invoice.sent",
      version: 1,
      payload: { invoiceId: "invoice_1", secret: "sk_live_secret123456" },
      dispatchAttempts: 8,
      status: "failed",
      lastError: "failed for customer@example.com using sk_live_secret123456",
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: null,
    });
    repository.jobRuns.push({
      id: "job_1",
      teamId: "team_1",
      outboxEventId: "outbox_1",
      jobType: "webhook.deliver",
      queueName: "dawn-jobs",
      status: "failed",
      attempt: 8,
      idempotencyKey: "webhook:deliver:outbox_1",
      error: "Authorization Bearer token123 failed for ops@example.com",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:01.000Z",
    });
    repository.outboxEvents.push({
      id: "outbox_2",
      teamId: "team_1",
      type: "accountant_packet.export_requested",
      version: 1,
      payload: { packetId: "packet_1" },
      dispatchAttempts: 2,
      status: "failed",
      lastError: "packet export failed for accountant@example.com",
      nextAttemptAt: "2026-06-15T00:05:00.000Z",
      occurredAt: "2026-06-15T00:00:02.000Z",
      processedAt: null,
    });
    repository.jobRuns.push({
      id: "job_2",
      teamId: "team_1",
      outboxEventId: "outbox_2",
      jobType: "accountant_packet.export",
      queueName: "dawn-jobs",
      status: "failed",
      attempt: 2,
      idempotencyKey: "accountant-packet:export:outbox_2",
      error: "packet export failed for accountant@example.com",
      createdAt: "2026-06-15T00:00:02.000Z",
      updatedAt: "2026-06-15T00:00:03.000Z",
    });
    repository.providerSyncRuns.push({
      id: "sync_1",
      teamId: "team_1",
      connectionId: "bank_1",
      status: "failed",
      startedAt: "2026-06-15T00:00:00.000Z",
      completedAt: "2026-06-15T00:01:00.000Z",
      accountsSynced: 0,
      transactionsImported: 0,
      duplicateCount: 0,
      error: "provider token sk_live_secret123456 expired",
    });
    repository.integrationSyncRuns.push({
      id: "integration_sync_1",
      teamId: "team_1",
      integrationConnectionId: "integration_1",
      category: "accounting",
      provider: "mock-accounting",
      status: "failed",
      startedAt: "2026-06-15T00:00:00.000Z",
      completedAt: "2026-06-15T00:01:00.000Z",
      recordsSynced: 0,
      error: "sync failed for owner@example.com",
      rawPayload: { accessToken: "secret", contactEmail: "owner@example.com" },
    });
    repository.automationRuns.push({
      id: "automation_run_1",
      teamId: "team_1",
      ruleId: "rule_1",
      sourceOutboxEventId: "outbox_1",
      status: "failed",
      actionType: "create_notification",
      input: { message: "email owner@example.com" },
      output: {},
      error: "failed for owner@example.com",
      startedAt: "2026-06-15T00:00:00.000Z",
      finishedAt: "2026-06-15T00:01:00.000Z",
    });
    repository.webhookDeliveries.push({
      id: "delivery_1",
      teamId: "team_1",
      subscriptionId: "subscription_1",
      outboxEventId: "outbox_1",
      status: "failed",
      attempt: 1,
      requestPayload: { email: "customer@example.com" },
      responseStatus: 500,
      responseBody: "failed customer@example.com",
      error: "Bearer token123 rejected",
      nextAttemptAt: null,
      deliveredAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:01.000Z",
    });

    const workspace = await listOperationsWorkspace(
      repository as unknown as OperationsUseCaseRepository,
      context,
      {
        audit: { action: "invoice.sent", entityType: "invoice", entityId: "invoice_1" },
      },
    );

    expect(workspace.metrics).toMatchObject({
      failedJobs: 2,
      deadLetters: 1,
      providerFailures: 1,
      integrationFailures: 1,
      webhookFailures: 1,
      automationFailures: 1,
    });
    expect(workspace.auditEvents).toHaveLength(1);
    expect(workspace.auditEvents[0]?.metadata).toEqual({
      email: "[redacted]",
      note: "sent with Bearer [redacted-token]",
    });
    expect(workspace.recentOutboxEvents[0]?.payload).toEqual({
      invoiceId: "invoice_1",
      secret: "[redacted]",
    });
    expect(workspace.recentJobRuns.map((run) => run.error)).toEqual([
      "Authorization Bearer [redacted-token] failed for [redacted-email]",
      "packet export failed for [redacted-email]",
    ]);
    expect(workspace.jobRunActions).toEqual([
      expect.objectContaining({
        jobRunId: "job_1",
        status: "dead_lettered",
        canRetry: false,
        reason: "Authorization Bearer [redacted-token] failed for [redacted-email]",
      }),
      expect.objectContaining({
        jobRunId: "job_2",
        status: "retryable",
        canRetry: true,
        nextAttemptAt: "2026-06-15T00:05:00.000Z",
        nextStep: "Worker retry is scheduled for 2026-06-15T00:05:00.000Z.",
      }),
    ]);
    expect(workspace.recentProviderSyncRuns[0]?.error).toContain("[redacted-token]");
    expect(workspace.recentIntegrationSyncRuns[0]?.rawPayload).toEqual({
      accessToken: "[redacted]",
      contactEmail: "[redacted]",
    });
    expect(workspace.dataWorkflows.map((workflow) => workflow.type)).toEqual([
      "team_data_export",
      "team_data_deletion",
    ]);
    expect(workspace.dataWorkflows.map((workflow) => workflow.status)).toEqual([
      "available",
      "staged",
    ]);
  });

  test("summarizes accountant close readiness for a selected period", async () => {
    const repository = new MemoryOperationsRepository();
    repository.memberships.set("user_1:team_1", "admin");
    repository.workspaceTransactions = [
      operationsTransaction({
        id: "transaction_ready",
        postedAt: "2026-05-05T00:00:00.000Z",
        reviewState: "reviewed",
        accountantStatus: "ready_to_export",
      }),
      operationsTransaction({
        id: "transaction_missing_receipt",
        postedAt: "2026-05-08T00:00:00.000Z",
        reviewState: "reviewed",
        accountantStatus: "missing_receipt",
      }),
      operationsTransaction({
        id: "transaction_needs_review",
        postedAt: "2026-05-11T00:00:00.000Z",
        reviewState: "needs_review",
        accountantStatus: "receipt_found",
      }),
      operationsTransaction({
        id: "transaction_export_failed",
        postedAt: "2026-05-16T00:00:00.000Z",
        reviewState: "reviewed",
        accountantStatus: "export_failed",
      }),
      operationsTransaction({
        id: "transaction_exported",
        postedAt: "2026-05-20T00:00:00.000Z",
        reviewState: "reviewed",
        accountantStatus: "exported",
      }),
      operationsTransaction({
        id: "transaction_outside_period",
        postedAt: "2026-06-02T00:00:00.000Z",
        reviewState: "reviewed",
        accountantStatus: "ready_to_export",
      }),
    ];

    const workspace = await listOperationsWorkspace(
      repository as unknown as OperationsUseCaseRepository,
      context,
      {
        accountantClose: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-31T23:59:59.999Z",
        },
      },
    );

    expect(workspace.accountantClose).toEqual({
      period: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-31T23:59:59.999Z",
      },
      status: "blocked",
      transactionCount: 5,
      readyToExportCount: 1,
      exportedCount: 1,
      missingReceiptCount: 1,
      needsReviewCount: 1,
      exportingCount: 0,
      exportFailedCount: 1,
      excludedCount: 0,
      archivedCount: 0,
      actionableCount: 3,
      nextStep: "Retry or resolve failed accountant exports before closing this period.",
    });
  });

  test("queues audited team data export requests idempotently", async () => {
    const repository = new MemoryOperationsWorkflowRepository();
    repository.memberships.set("user_1:team_1", "admin");

    const result = await requestTeamDataExport(repository as OperationsUseCaseRepository, context, {
      teamId: "team_1",
      idempotencyKey: "export_1",
    });
    const replay = await requestTeamDataExport(repository as OperationsUseCaseRepository, context, {
      teamId: "team_1",
      idempotencyKey: "export_1",
    });
    const workspace = await listOperationsWorkspace(repository as OperationsUseCaseRepository, {
      ...context,
      requestId: "request_2",
    });

    expect(result.workflow).toMatchObject({ type: "team_data_export", status: "queued" });
    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      action: "team_data.export_requested",
      entityType: "team",
      entityId: "team_1",
    });
    expect(repository.outboxEvents).toHaveLength(1);
    expect(repository.outboxEvents[0]).toMatchObject({
      type: "team_data.export_requested",
      payload: { workflowType: "team_data_export", format: "json" },
    });
    expect(workspace.dataWorkflows[0]).toMatchObject({
      type: "team_data_export",
      status: "queued",
    });
  });

  test("builds redacted team data export snapshots", async () => {
    const repository = new MemoryOperationsRepository();
    repository.outboxEvents.push({
      id: "outbox_1",
      teamId: "team_1",
      type: "team_data.export_requested",
      version: 1,
      payload: { accessToken: "secret", email: "owner@example.com" },
      dispatchAttempts: 0,
      status: "dispatched",
      lastError: null,
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: "2026-06-15T00:00:01.000Z",
    });
    repository.auditEvents.push({
      id: "audit_1",
      teamId: "team_1",
      actorId: "user_1",
      requestId: "request_1",
      action: "team_data.export_requested",
      entityType: "team",
      entityId: "team_1",
      metadata: { email: "owner@example.com", token: "secret" },
      occurredAt: "2026-06-15T00:00:00.000Z",
    });

    const snapshot = await buildTeamDataExportSnapshot(
      repository as unknown as TeamDataExportRepository,
      {
        teamId: "team_1",
        sourceOutboxEventId: "outbox_1",
        generatedAt: "2026-06-15T00:00:02.000Z",
      },
    );

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      teamId: "team_1",
      format: "json",
      generatedAt: "2026-06-15T00:00:02.000Z",
      sourceOutboxEventId: "outbox_1",
      ledger: {
        teamName: "Acme Studio",
        transactions: [{ id: "transaction_1" }],
      },
      banking: {
        connections: [{ connection: { id: "bank_connection_1" } }],
      },
      documents: { documents: [], inboxItems: [], aliases: [] },
      billing: { customers: [], contacts: [], products: [], invoices: [] },
      projects: { projects: [], members: [], timeEntries: [] },
      reporting: { insights: [] },
      assistant: { conversations: [], pendingApprovals: [] },
      automations: { rules: [], runs: [] },
      integrations: { connections: [], syncRuns: [] },
      developer: { apiKeys: [], oauthApps: [], oauthGrants: [], webhookSubscriptions: [] },
    });
    expect(snapshot.banking.connections[0]?.latestSyncRun?.error).toContain("[redacted-token]");
    expect(snapshot.operations.auditEvents[0]?.metadata).toEqual({
      email: "[redacted]",
      token: "[redacted]",
    });
    expect(snapshot.operations.outboxEvents[0]?.payload).toEqual({
      accessToken: "[redacted]",
      email: "[redacted]",
    });
  });

  test("completes team data export archives idempotently", async () => {
    const repository = new MemoryOperationsRepository();
    repository.outboxEvents.push({
      id: "outbox_1",
      teamId: "team_1",
      type: "team_data.export_requested",
      version: 1,
      payload: { accessToken: "secret", email: "owner@example.com" },
      dispatchAttempts: 0,
      status: "dispatched",
      lastError: null,
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: "2026-06-15T00:00:01.000Z",
    });
    const storedObjects = new Map<
      string,
      { body: ArrayBuffer; contentType: string; byteSize: number }
    >();
    let writeCount = 0;
    const storage = {
      async put(input: { objectKey: string; body: ArrayBuffer; contentType: string }) {
        writeCount += 1;
        storedObjects.set(input.objectKey, {
          body: input.body,
          contentType: input.contentType,
          byteSize: input.body.byteLength,
        });
      },
    };

    const result = await completeTeamDataExport(
      repository as unknown as TeamDataExportRepository,
      storage,
      {
        teamId: "team_1",
        format: "json",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "team-data:export:outbox_1",
        generatedAt: "2026-06-15T00:00:02.000Z",
      },
    );
    const replay = await completeTeamDataExport(
      repository as unknown as TeamDataExportRepository,
      storage,
      {
        teamId: "team_1",
        format: "json",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "team-data:export:outbox_1",
        generatedAt: "2026-06-15T00:00:04.000Z",
      },
    );

    expect(result.objectKey).toBe("teams/team_1/exports/outbox_1.json");
    expect(result.contentType).toBe("application/json; charset=utf-8");
    expect(replay.replayed).toBe(true);
    expect(writeCount).toBe(1);
    const stored = storedObjects.get(result.objectKey);
    expect(stored?.contentType).toBe("application/json; charset=utf-8");
    const archive = JSON.parse(new TextDecoder().decode(stored?.body)) as {
      operations: { outboxEvents: Array<{ payload: Record<string, unknown> }> };
    };
    expect(archive.operations.outboxEvents[0]?.payload).toEqual({
      accessToken: "[redacted]",
      email: "[redacted]",
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      actorId: "system:data-workflow",
      requestId: "team-data:export:outbox_1",
      action: "team_data.export_archive_written",
      entityType: "team",
      entityId: "team_1",
      metadata: {
        objectKey: "teams/team_1/exports/outbox_1.json",
        sourceOutboxEventId: "outbox_1",
        byteSize: result.byteSize,
        contentType: "application/json; charset=utf-8",
        generatedAt: "2026-06-15T00:00:02.000Z",
      },
    });
  });

  test("requires owner confirmation for tenant deletion requests", async () => {
    const repository = new MemoryOperationsWorkflowRepository();
    repository.memberships.set("user_1:team_1", "admin");

    await expect(
      requestTeamDataDeletion(repository as OperationsUseCaseRepository, context, {
        teamId: "team_1",
        confirmTeamId: "team_1",
        idempotencyKey: "delete_1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only team owners can request tenant deletion",
    });

    repository.memberships.set("user_1:team_1", "owner");
    await expect(
      requestTeamDataDeletion(repository as OperationsUseCaseRepository, context, {
        teamId: "team_1",
        confirmTeamId: "wrong_team",
        idempotencyKey: "delete_2",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Confirm the team ID before requesting deletion",
    });

    const result = await requestTeamDataDeletion(
      repository as OperationsUseCaseRepository,
      context,
      {
        teamId: "team_1",
        confirmTeamId: "team_1",
        reason: "customer requested closure",
        idempotencyKey: "delete_3",
      },
    );

    expect(result.workflow).toMatchObject({ type: "team_data_deletion", status: "queued" });
    expect(repository.auditEvents[0]).toMatchObject({
      action: "team_data.deletion_requested",
      metadata: { reason: "customer requested closure" },
    });
    expect(repository.outboxEvents[0]).toMatchObject({
      type: "team_data.deletion_requested",
      payload: { workflowType: "team_data_deletion", reason: "customer requested closure" },
    });
  });

  test("gates team data deletion jobs idempotently in app", async () => {
    const repository = new MemoryOperationsWorkflowRepository();

    const result = await gateTeamDataDeletion(repository as OperationsUseCaseRepository, {
      teamId: "team_1",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "team-data:delete:outbox_1",
    });
    const replay = await gateTeamDataDeletion(repository as OperationsUseCaseRepository, {
      teamId: "team_1",
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "team-data:delete:outbox_1",
    });

    expect(result).toMatchObject({
      teamId: "team_1",
      sourceOutboxEventId: "outbox_1",
      nextStep: "retention_provider_r2_cleanup_confirmation",
    });
    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({
      actorId: "system:data-workflow",
      requestId: "team-data:delete:outbox_1",
      action: "team_data.deletion_job_gated",
      entityType: "team",
      entityId: "team_1",
      metadata: {
        sourceOutboxEventId: "outbox_1",
        nextStep: "retention_provider_r2_cleanup_confirmation",
      },
    });
  });

  test("requires operations read permission", async () => {
    const repository = new MemoryOperationsWorkflowRepository();
    repository.memberships.set("user_1:team_1", "viewer");

    await expect(
      listOperationsWorkspace(repository as OperationsUseCaseRepository, context),
    ).rejects.toBeInstanceOf(AppError);
  });

  test("redacts operational values recursively", () => {
    expect(redactOperationalText("send to admin@example.com with Bearer token123")).toBe(
      "send to [redacted-email] with Bearer [redacted-token]",
    );
    expect(
      redactOperationalValue({
        nested: [{ email: "admin@example.com", note: "sk_live_secret123456" }],
      }),
    ).toEqual({
      nested: [{ email: "[redacted]", note: "[redacted-token]" }],
    });
  });
});
