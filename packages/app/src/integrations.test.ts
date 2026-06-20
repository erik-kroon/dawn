import { describe, expect, test } from "bun:test";

import {
  completeFortnoxOAuth,
  connectIntegration,
  createFortnoxAuthorizationUrl,
  createFortnoxOAuthStateCodec,
  disableIntegration,
  disconnectFortnox,
  exportAccountingIntegration,
  listFortnoxCatalog,
  listIntegrationWorkspace,
  recordPaymentProviderEvent,
  sendIntegrationEmail,
  sendIntegrationMessage,
  syncIntegration,
  type DawnRepository,
  type FortnoxProviderObjectRecord,
  type IdempotencyResult,
} from ".";
import type {
  Actor,
  IntegrationCategory,
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationSyncRunStatus,
  InvoiceDraft,
  InvoicePayment,
  TeamRole,
  Transaction,
} from "@dawn/domain";
import {
  createFortnoxTokenCodec,
  createMockFortnoxIntegrationProvider,
  createMockIntegrationProviders,
  type IntegrationProvider,
  type IntegrationProviderToken,
} from "@dawn/integrations";

class MemoryIntegrationRepository {
  role: TeamRole | null = "owner";
  connections = new Map<string, IntegrationConnection & { tokenCiphertext: string }>();
  syncRuns = new Map<string, IntegrationSyncRun>();
  transactions: Transaction[] = [];
  invoices: InvoiceDraft[] = [];
  payments: InvoicePayment[] = [];
  invoiceEvents: unknown[] = [];
  providerObjects = new Map<string, FortnoxProviderObjectRecord>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(_actor: Actor, teamId: string) {
    return this.role && teamId === "team_1" ? { role: this.role } : null;
  }

  async listTransactionsForReport(input: { teamId: string }) {
    return this.transactions.filter((transaction) => transaction.teamId === input.teamId);
  }

  async listInvoices(teamId: string) {
    return this.invoices.filter((invoice) => invoice.teamId === teamId);
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    return (
      this.invoices.find((invoice) => invoice.teamId === teamId && invoice.id === invoiceId) ?? null
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
  }) {
    const invoice = await this.getInvoiceForTeam(input.teamId, input.invoiceId);

    if (!invoice) {
      throw new Error("Invoice payment did not update invoice");
    }

    const payment = {
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
    const updated = {
      ...invoice,
      status: input.nextInvoiceStatus,
      amountPaid: input.nextAmountPaid,
      paidAt: input.invoicePaidAt ?? null,
      updatedAt: input.paidAt,
    };

    this.payments.push(payment);
    this.invoices = this.invoices.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );

    return { invoice: updated, payment };
  }

  async createInvoiceEvent(input: unknown) {
    this.invoiceEvents.push(input);
    return input;
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

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }

  async listIntegrationConnectionSummaries(teamId: string) {
    return [...this.connections.values()]
      .filter((connection) => connection.teamId === teamId)
      .map((connection) => ({
        connection,
        latestSyncRun:
          [...this.syncRuns.values()]
            .filter((run) => run.integrationConnectionId === connection.id)
            .at(-1) ?? null,
      }));
  }

  async getIntegrationConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.connections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async getIntegrationConnectionSecretsForTeam(teamId: string, connectionId: string) {
    const connection = this.connections.get(connectionId);

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
    const existing = [...this.connections.values()].find(
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
    this.connections.set(connection.id, connection);
    return connection;
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
    this.syncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async finishIntegrationSyncRun(input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const existing = this.syncRuns.get(input.syncRunId);

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
    this.syncRuns.set(syncRun.id, syncRun);
    return syncRun;
  }

  async markIntegrationConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: IntegrationConnection["status"];
    lastError?: string | null;
  }) {
    const connection = this.connections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const updated = {
      ...connection,
      status: input.status,
      lastSyncAt: input.syncedAt.toISOString(),
      lastError: input.lastError ?? null,
    };
    this.connections.set(updated.id, updated);
    return updated;
  }

  async updateIntegrationConnectionTokenAndRawPayload(input: {
    connectionId: string;
    token?: IntegrationProviderToken | null;
    rawPayload: Record<string, unknown>;
    status?: IntegrationConnection["status"];
    lastError?: string | null;
    lastSyncAt?: Date | null;
  }) {
    const connection = this.connections.get(input.connectionId);

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
      lastError: input.lastError === undefined ? connection.lastError : input.lastError,
      lastSyncAt:
        input.lastSyncAt === undefined ? connection.lastSyncAt : input.lastSyncAt?.toISOString(),
    };
    this.connections.set(updated.id, updated);
    return updated;
  }

  async disableIntegrationConnection(input: { connectionId: string; disabledAt: Date }) {
    const connection = this.connections.get(input.connectionId);

    if (!connection) {
      throw new Error("missing connection");
    }

    const disabled = {
      ...connection,
      status: "disabled" as const,
      disabledAt: input.disabledAt.toISOString(),
    };
    this.connections.set(disabled.id, disabled);
    return disabled;
  }

  async upsertProviderObject(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const object: FortnoxProviderObjectRecord = {
      id: providerObjectKey(input),
      teamId: input.teamId,
      provider: input.provider,
      providerObjectType: input.providerObjectType,
      providerObjectId: input.providerObjectId,
      internalEntityType: input.internalEntityType ?? null,
      internalEntityId: input.internalEntityId ?? null,
      rawPayload: input.rawPayload,
    };
    this.providerObjects.set(providerObjectKey(input), object);
  }

  async listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }) {
    return [...this.providerObjects.values()]
      .filter((object) => object.teamId === input.teamId)
      .filter((object) => object.provider === input.provider)
      .filter((object) => input.providerObjectTypes.includes(object.providerObjectType));
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};
const fortnoxOAuthStateCodec = createFortnoxOAuthStateCodec({
  secret: "test_fortnox_oauth_state_secret",
  allowedRedirectOrigins: ["http://localhost:3001"],
  now: () => new Date("2026-06-15T10:00:00.000Z"),
});

function providerObjectKey(input: {
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
}) {
  return `${input.teamId}:${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
}

describe("integration use cases", () => {
  test("connects adapters with encrypted token metadata and declared capabilities", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();

    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-accounting",
        idempotencyKey: "connect_1",
      },
    );
    const replayed = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-accounting",
        idempotencyKey: "connect_1",
      },
    );
    const workspace = await listIntegrationWorkspace(
      repository as unknown as DawnRepository,
      providers,
      context,
      { teamId: "team_1" },
    );

    expect(connected.connection).toMatchObject({
      category: "accounting",
      provider: "mock-accounting",
      status: "connected",
      capabilities: ["connect", "sync", "disable", "exportTransactions", "exportInvoices"],
      tokenKeyId: "mock-kms-local",
    });
    expect(
      repository.connections.get(connected.connection.id)?.tokenCiphertext.includes("mock_secret"),
    ).toBe(false);
    expect(replayed).toMatchObject({ replayed: true });
    expect(workspace.providers.map((provider) => provider.provider)).toContain("fortnox");
    expect(workspace.connections).toHaveLength(1);
  });

  test("syncs Fortnox catalog mappings idempotently for quote building", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "fortnox",
        idempotencyKey: "connect_fortnox_1",
      },
    );

    const synced = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_fortnox_1",
      },
    );
    const replayed = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_fortnox_1",
      },
    );
    const catalog = await listFortnoxCatalog(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
    });

    expect(connected.connection).toMatchObject({
      provider: "fortnox",
      tokenKeyId: "mock-fortnox-token",
      rawPayload: { oauth: { stateValidated: true } },
    });
    expect(synced.syncRun).toMatchObject({ status: "completed", recordsSynced: 8 });
    expect(replayed).toMatchObject({ replayed: true });
    const providerObjects = [...repository.providerObjects.values()];
    expect(providerObjects).toHaveLength(8);
    expect(catalog.company?.rawPayload).toMatchObject({
      providerConnectionId: "fortnox_team_1",
      organizationNumber: "5566778899",
    });
    expect(catalog.customers.map((customer) => customer.providerObjectId)).toEqual([
      "1001",
      "1002",
    ]);
    expect(catalog.articles.map((article) => article.providerObjectId)).toEqual([
      "KONSULT",
      "SUPPORT",
    ]);
    expect(providerObjects.find((object) => object.providerObjectType === "invoice")).toMatchObject(
      {
        providerObjectId: "9001",
        rawPayload: { paymentState: "paid", integrationConnectionId: connected.connection.id },
      },
    );
    expect(providerObjects.find((object) => object.providerObjectType === "payment")).toMatchObject(
      {
        providerObjectId: "7001",
        rawPayload: { invoiceNumber: "9001", integrationConnectionId: connected.connection.id },
      },
    );
  });

  test("refreshes Fortnox tokens during sync and persists actionable health warnings", async () => {
    const repository = new MemoryIntegrationRepository();
    const tokenCodec = createFortnoxTokenCodec({
      secret: "fortnox_token_refresh_secret",
      keyId: "test-fortnox-token",
    });
    const providers = [
      createMockFortnoxIntegrationProvider({
        tokenCodec,
        grantedScopes: ["companyinformation", "customer"],
        licensedScopes: ["companyinformation", "customer", "article"],
        now: () => new Date("2026-06-15T10:29:00.000Z"),
      }),
    ];
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "fortnox",
        idempotencyKey: "connect_fortnox_refresh_1",
      },
    );
    const originalToken = repository.connections.get(connected.connection.id)?.tokenCiphertext;

    const synced = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_fortnox_refresh_1",
      },
    );
    const refreshedToken = repository.connections.get(connected.connection.id)?.tokenCiphertext;

    expect(refreshedToken).toStartWith("v1:");
    expect(refreshedToken).not.toBe(originalToken);
    expect(synced.connection.rawPayload?.health).toMatchObject({
      status: "warning",
      missingScopes: ["article", "invoice"],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "missing_scope", scope: "article" }),
        expect.objectContaining({ code: "missing_license", scope: "invoice" }),
      ]),
    });
    expect(synced.syncRun.rawPayload).toMatchObject({
      health: {
        status: "warning",
      },
    });
  });

  test("keeps successful Fortnox partial sync imports and resumes from recovery cursor", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = [createMockFortnoxIntegrationProvider({ partialFailure: true })];
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "fortnox",
        idempotencyKey: "connect_fortnox_partial_1",
      },
    );

    const partial = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        syncMode: "initial",
        idempotencyKey: "sync_fortnox_partial_1",
      },
    );
    const recovery = partial.syncRun.rawPayload.recovery as {
      retryCursor: Record<string, unknown>;
    };
    const resumed = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        syncMode: "initial",
        cursor: recovery.retryCursor,
        idempotencyKey: "sync_fortnox_resume_1",
      },
    );
    const catalog = await listFortnoxCatalog(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
    });

    expect(partial.syncRun).toMatchObject({
      status: "partial",
      recordsSynced: 4,
      error: "Fortnox article sync partially failed",
      rawPayload: {
        recovery: {
          retryCursor: {
            resumeFrom: "fortnox:article:SUPPORT",
          },
        },
      },
    });
    expect(partial.connection).toMatchObject({
      status: "error",
      lastError: "Fortnox article sync partially failed",
    });
    expect(repository.providerObjects).toHaveLength(5);
    expect(resumed.syncRun).toMatchObject({ status: "completed", recordsSynced: 1 });
    expect(resumed.connection).toMatchObject({ status: "connected", lastError: null });
    expect(catalog.articles.map((article) => article.providerObjectId)).toEqual([
      "KONSULT",
      "SUPPORT",
    ]);
  });

  test("starts and completes Fortnox OAuth with signed state validation", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const authorization = await createFortnoxAuthorizationUrl(
      repository as unknown as DawnRepository,
      providers,
      fortnoxOAuthStateCodec,
      context,
      {
        teamId: "team_1",
        redirectUrl: "http://localhost:3001/settings",
      },
    );

    const completed = await completeFortnoxOAuth(
      repository as unknown as DawnRepository,
      providers,
      fortnoxOAuthStateCodec,
      context,
      {
        teamId: "team_1",
        code: "fortnox_authorization_code_1234",
        redirectUrl: "http://localhost:3001/settings",
        state: authorization.state,
        idempotencyKey: "fortnox_oauth_callback_1",
      },
    );
    const replayed = await completeFortnoxOAuth(
      repository as unknown as DawnRepository,
      providers,
      fortnoxOAuthStateCodec,
      context,
      {
        teamId: "team_1",
        code: "fortnox_authorization_code_1234",
        redirectUrl: "http://localhost:3001/settings",
        state: authorization.state,
        idempotencyKey: "fortnox_oauth_callback_1",
      },
    );

    expect(new URL(authorization.authorizationUrl).searchParams.get("state")).toBe(
      authorization.state,
    );
    expect(completed.connection).toMatchObject({
      provider: "fortnox",
      status: "connected",
      rawPayload: {
        oauth: {
          source: "authorization_code",
          stateValidated: true,
          authorizationCodeLastFour: "1234",
        },
      },
    });
    expect(repository.connections.get(completed.connection.id)?.tokenCiphertext).toStartWith("v1:");
    expect(replayed).toMatchObject({ replayed: true });
    expect(repository.connections).toHaveLength(1);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "integration.connected",
      payload: { provider: "fortnox" },
    });

    await expect(
      completeFortnoxOAuth(
        repository as unknown as DawnRepository,
        providers,
        fortnoxOAuthStateCodec,
        { ...context, actor: { id: "user_2", type: "user" } },
        {
          teamId: "team_1",
          code: "fortnox_authorization_code_1234",
          redirectUrl: "http://localhost:3001/settings",
          state: authorization.state,
          idempotencyKey: "fortnox_oauth_callback_2",
        },
      ),
    ).rejects.toThrow("Fortnox OAuth state is invalid");
  });

  test("disconnects Fortnox through the provider before disabling the connection", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const authorization = await createFortnoxAuthorizationUrl(
      repository as unknown as DawnRepository,
      providers,
      fortnoxOAuthStateCodec,
      context,
      {
        teamId: "team_1",
        redirectUrl: "http://localhost:3001/settings",
      },
    );
    const connected = await completeFortnoxOAuth(
      repository as unknown as DawnRepository,
      providers,
      fortnoxOAuthStateCodec,
      context,
      {
        teamId: "team_1",
        code: "fortnox_authorization_code_1234",
        redirectUrl: "http://localhost:3001/settings",
        state: authorization.state,
        idempotencyKey: "fortnox_oauth_callback_1",
      },
    );

    const disconnected = await disconnectFortnox(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "fortnox_disconnect_1",
      },
    );
    const replayed = await disconnectFortnox(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "fortnox_disconnect_1",
      },
    );

    expect(disconnected.connection.status).toBe("disabled");
    expect(replayed).toMatchObject({ replayed: true });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "integration.disabled",
      payload: {
        provider: "fortnox",
        revoked: true,
        preservesHistoricalData: true,
      },
    });
  });

  test("logs idempotent sync runs and surfaces provider failures", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-payments",
        idempotencyKey: "connect_1",
      },
    );

    const synced = await syncIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_1",
      },
    );
    const failed = await syncIntegration(
      repository as unknown as DawnRepository,
      [
        {
          ...providers.find((provider) => provider.provider === "mock-payments")!,
          async sync() {
            throw new Error("provider unavailable");
          },
        } satisfies IntegrationProvider,
      ],
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        idempotencyKey: "sync_2",
      },
    );

    expect(synced.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 2,
      rawPayload: { provider: "mock-payments" },
    });
    expect(failed.syncRun).toMatchObject({ status: "failed", error: "provider unavailable" });
    expect(failed.connection).toMatchObject({
      status: "error",
      lastError: "provider unavailable",
    });
  });

  test("exports accounting transactions and invoices through connected adapters", async () => {
    const repository = new MemoryIntegrationRepository();
    repository.transactions.push({
      id: "txn_1",
      teamId: "team_1",
      description: "Consulting payment",
      postedAt: "2026-06-15T00:00:00.000Z",
      money: { amountMinor: 5_000_00, currency: "USD" },
      categoryId: null,
      reviewState: "reviewed",
      source: "manual",
    });
    repository.invoices.push({
      id: "invoice_1",
      teamId: "team_1",
      customerId: "customer_1",
      invoiceNumber: "INV-001",
      status: "sent",
      issueDate: "2026-06-15T00:00:00.000Z",
      currency: "USD",
      discountBasisPoints: 0,
      lines: [],
      totals: {
        subtotal: { amountMinor: 5_000_00, currency: "USD" },
        discount: { amountMinor: 0, currency: "USD" },
        tax: { amountMinor: 0, currency: "USD" },
        total: { amountMinor: 5_000_00, currency: "USD" },
      },
      amountPaid: { amountMinor: 0, currency: "USD" },
      createdByActorId: "user_1",
    });
    const providers = createMockIntegrationProviders();
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-accounting",
        idempotencyKey: "connect_1",
      },
    );

    const transactionExport = await exportAccountingIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        exportType: "transactions",
        idempotencyKey: "export_transactions_1",
      },
    );
    const transactionReplay = await exportAccountingIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        exportType: "transactions",
        idempotencyKey: "export_transactions_1",
      },
    );
    const invoiceExport = await exportAccountingIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        exportType: "invoices",
        idempotencyKey: "export_invoices_1",
      },
    );

    expect(transactionExport.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { exportType: "transactions" },
    });
    expect(transactionReplay).toMatchObject({ replayed: true });
    expect(invoiceExport.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { exportType: "invoices" },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "integration.accounting_exported",
      payload: { exportType: "invoices", recordsExported: 1 },
    });
  });

  test("records payment provider events through invoice payment rules", async () => {
    const repository = new MemoryIntegrationRepository();
    repository.invoices.push({
      id: "invoice_1",
      teamId: "team_1",
      customerId: "customer_1",
      invoiceNumber: "INV-001",
      status: "sent",
      issueDate: "2026-06-15T00:00:00.000Z",
      currency: "USD",
      discountBasisPoints: 0,
      lines: [],
      totals: {
        subtotal: { amountMinor: 5_000_00, currency: "USD" },
        discount: { amountMinor: 0, currency: "USD" },
        tax: { amountMinor: 0, currency: "USD" },
        total: { amountMinor: 5_000_00, currency: "USD" },
      },
      amountPaid: { amountMinor: 0, currency: "USD" },
      sentAt: "2026-06-15T10:00:00.000Z",
      createdByActorId: "user_1",
    });
    const providers = createMockIntegrationProviders();
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-payments",
        idempotencyKey: "connect_payments_1",
      },
    );

    const recorded = await recordPaymentProviderEvent(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        rawPayload: {
          providerEventId: "evt_payment_1",
          invoiceId: "invoice_1",
          amountMinor: 5_000_00,
          currency: "usd",
          paidAt: "2026-06-16T00:00:00.000Z",
          method: "card",
        },
        idempotencyKey: "payment_event_1",
      },
    );
    const replay = await recordPaymentProviderEvent(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: connected.connection.id,
        rawPayload: {
          providerEventId: "evt_payment_1",
          invoiceId: "invoice_1",
          amountMinor: 5_000_00,
          currency: "usd",
          paidAt: "2026-06-16T00:00:00.000Z",
          method: "card",
        },
        idempotencyKey: "payment_event_1",
      },
    );

    expect(recorded.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { paymentEventId: "evt_payment_1" },
    });
    expect(recorded.invoice).toMatchObject({ status: "paid" });
    expect(recorded.payment).toMatchObject({
      amount: { amountMinor: 5_000_00, currency: "USD" },
      method: "card",
      note: "Provider payment event evt_payment_1",
    });
    expect(replay).toMatchObject({ replayed: true });
    expect(repository.invoiceEvents).toHaveLength(1);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "invoice.payment_recorded",
      payload: { provider: "mock-payments", providerEventId: "evt_payment_1" },
    });
  });

  test("sends messaging and email deliveries through connected adapters", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const messaging = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-messaging",
        idempotencyKey: "connect_messaging_1",
      },
    );
    const email = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-email",
        idempotencyKey: "connect_email_1",
      },
    );

    const message = await sendIntegrationMessage(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: messaging.connection.id,
        channel: "#finance",
        text: "Invoice paid",
        confirm: true,
        idempotencyKey: "message_1",
      },
    );
    const messageReplay = await sendIntegrationMessage(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: messaging.connection.id,
        channel: "#finance",
        text: "Invoice paid",
        confirm: true,
        idempotencyKey: "message_1",
      },
    );
    const sentEmail = await sendIntegrationEmail(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        connectionId: email.connection.id,
        to: "Owner@Example.com",
        subject: "Invoice paid",
        text: "Acme paid INV-001.",
        confirm: true,
        idempotencyKey: "email_1",
      },
    );

    expect(message.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { channel: "#finance" },
    });
    expect(messageReplay).toMatchObject({ replayed: true });
    expect(sentEmail.syncRun).toMatchObject({
      status: "completed",
      recordsSynced: 1,
      rawPayload: { to: "owner@example.com", subject: "Invoice paid" },
    });
    expect(repository.outboxEvents.at(-2)).toMatchObject({
      type: "integration.message_sent",
      payload: { channel: "#finance", textLength: 12 },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "integration.email_sent",
      payload: { to: "owner@example.com", subject: "Invoice paid" },
    });
  });

  test("disables integrations without deleting connection or sync history", async () => {
    const repository = new MemoryIntegrationRepository();
    const providers = createMockIntegrationProviders();
    const connected = await connectIntegration(
      repository as unknown as DawnRepository,
      providers,
      context,
      {
        teamId: "team_1",
        provider: "mock-email",
        idempotencyKey: "connect_1",
      },
    );
    await syncIntegration(repository as unknown as DawnRepository, providers, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
      idempotencyKey: "sync_1",
    });

    const disabled = await disableIntegration(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      connectionId: connected.connection.id,
      idempotencyKey: "disable_1",
    });

    expect(disabled.connection.status).toBe("disabled");
    expect(repository.connections).toHaveLength(1);
    expect(repository.syncRuns).toHaveLength(1);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "integration.disabled",
      payload: { preservesHistoricalData: true },
    });
  });
});
