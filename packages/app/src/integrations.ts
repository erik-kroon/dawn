import type {
  IntegrationCategory,
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationSyncRunStatus,
  InvoiceDraft,
  InvoicePayment,
} from "@dawn/domain";
import { invoiceStatusAfterPayment } from "@dawn/domain";
import type {
  IntegrationPaymentEvent,
  IntegrationProvider,
  IntegrationProviderCapability,
  IntegrationProviderExternalObject,
  IntegrationProviderName,
  IntegrationProviderToken,
} from "@dawn/integrations";

import type { BillingRepository } from "./billing";
import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type IntegrationProviderDescriptor = {
  provider: IntegrationProviderName;
  category: IntegrationCategory;
  displayName: string;
  capabilities: readonly IntegrationProviderCapability[];
};

export type IntegrationConnectionSummary = {
  connection: IntegrationConnection;
  latestSyncRun?: IntegrationSyncRun | null;
};

export type IntegrationWorkspace = {
  teamId: string;
  providers: IntegrationProviderDescriptor[];
  connections: IntegrationConnectionSummary[];
};

export type ConnectIntegrationCommand = {
  teamId: string;
  provider: IntegrationProviderName;
  idempotencyKey: string;
};

export type ConnectIntegrationResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type SyncIntegrationCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
  syncMode?: "initial" | "incremental";
  cursor?: Record<string, unknown> | null;
};

export type SyncIntegrationResult = {
  connection: IntegrationConnection;
  syncRun: IntegrationSyncRun;
  replayed: boolean;
};

export type ExportAccountingIntegrationCommand = {
  teamId: string;
  connectionId: string;
  exportType: "transactions" | "invoices";
  idempotencyKey: string;
};

export type ExportAccountingIntegrationResult = {
  connection: IntegrationConnection;
  syncRun: IntegrationSyncRun;
  replayed: boolean;
};

export type RecordPaymentProviderEventCommand = {
  teamId: string;
  connectionId: string;
  rawPayload: Record<string, unknown>;
  idempotencyKey: string;
};

export type RecordPaymentProviderEventResult = {
  connection: IntegrationConnection;
  syncRun: IntegrationSyncRun;
  invoice: InvoiceDraft | null;
  payment: InvoicePayment | null;
  replayed: boolean;
};

export type SendIntegrationMessageCommand = {
  teamId: string;
  connectionId: string;
  channel: string;
  text: string;
  confirm: true;
  idempotencyKey: string;
};

export type SendIntegrationEmailCommand = {
  teamId: string;
  connectionId: string;
  to: string;
  subject: string;
  text: string;
  confirm: true;
  idempotencyKey: string;
};

export type SendIntegrationDeliveryResult = {
  connection: IntegrationConnection;
  syncRun: IntegrationSyncRun;
  providerDeliveryId: string | null;
  replayed: boolean;
};

export type DisableIntegrationCommand = {
  teamId: string;
  connectionId: string;
  idempotencyKey: string;
};

export type DisableIntegrationResult = {
  connection: IntegrationConnection;
  replayed: boolean;
};

export type IntegrationRepository = {
  listIntegrationConnectionSummaries(teamId: string): Promise<IntegrationConnectionSummary[]>;
  getIntegrationConnectionForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnection | null>;
  getIntegrationConnectionSecretsForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<{
    token: IntegrationProviderToken;
    rawPayload: Record<string, unknown>;
  } | null>;
  upsertIntegrationConnection(input: {
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
  }): Promise<IntegrationConnection>;
  createIntegrationSyncRun(input: {
    syncRunId: string;
    teamId: string;
    integrationConnectionId: string;
    category: IntegrationCategory;
    provider: string;
  }): Promise<IntegrationSyncRun>;
  finishIntegrationSyncRun(input: {
    syncRunId: string;
    status: Exclude<IntegrationSyncRunStatus, "running">;
    recordsSynced: number;
    error?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<IntegrationSyncRun>;
  markIntegrationConnectionSynced(input: {
    connectionId: string;
    syncedAt: Date;
    status: IntegrationConnection["status"];
    lastError?: string | null;
  }): Promise<IntegrationConnection>;
  updateIntegrationConnectionTokenAndRawPayload(input: {
    connectionId: string;
    token?: IntegrationProviderToken | null;
    rawPayload: Record<string, unknown>;
    status?: IntegrationConnection["status"];
    lastError?: string | null;
    lastSyncAt?: Date | null;
  }): Promise<IntegrationConnection>;
  upsertProviderObject(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
  disableIntegrationConnection(input: {
    connectionId: string;
    disabledAt: Date;
  }): Promise<IntegrationConnection>;
};
export type IntegrationUseCaseRepository = TransactionReviewRepository &
  BillingRepository &
  IntegrationRepository;

const connectIntegrationOperation = "integration.connect";
const syncIntegrationOperation = "integration.sync";
const exportAccountingIntegrationOperation = "integration.accounting_export";
const recordPaymentProviderEventOperation = "integration.payment_event.record";
const sendIntegrationMessageOperation = "integration.message.send";
const sendIntegrationEmailOperation = "integration.email.send";
const disableIntegrationOperation = "integration.disable";

export async function listIntegrationWorkspace(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<IntegrationWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "integrations.read",
    "You cannot read integrations for this team",
  );

  return {
    teamId: access.teamId,
    providers: providers.map(integrationProviderDescriptor),
    connections: await repository.listIntegrationConnectionSummaries(access.teamId),
  };
}

export async function connectIntegration(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: ConnectIntegrationCommand,
): Promise<ConnectIntegrationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Integration not found");

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot connect integrations for this team",
    );

    const provider = requireIntegrationProvider(providers, command.provider);
    const fingerprint = JSON.stringify({ teamId: command.teamId, provider: provider.provider });
    const replayed = await integrationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      connectIntegrationOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different integration connection",
        );
      }

      return { ...(replayed.result as ConnectIntegrationResult), replayed: true };
    }

    const providerConnection = await provider.connect({
      teamId: command.teamId,
      actorId: context.actor.id,
      idempotencyKey: command.idempotencyKey,
    });
    const connection = await integrationRepository.upsertIntegrationConnection({
      connectionId: crypto.randomUUID(),
      teamId: command.teamId,
      category: providerConnection.category,
      provider: providerConnection.provider,
      providerConnectionId: providerConnection.providerConnectionId,
      displayName: providerConnection.displayName,
      capabilities: [...providerConnection.capabilities],
      tokenCiphertext: providerConnection.token.encryptedToken,
      tokenKeyId: providerConnection.token.keyId,
      tokenLastFour: providerConnection.token.lastFour,
      rawPayload: providerConnection.rawPayload,
      createdByActorId: context.actor.id,
    });

    await integrationRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "integration.connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        category: connection.category,
        capabilities: connection.capabilities,
      },
    });

    await integrationRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "integration.connected",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        category: connection.category,
      },
    });

    const result = { connection, replayed: false };

    await integrationRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: connectIntegrationOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function syncIntegration(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: SyncIntegrationCommand,
): Promise<SyncIntegrationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Integration not found");

    if (command.enforceCallerPermission !== false) {
      await resolveTeamAccess(
        integrationRepository,
        { ...context, teamId: command.teamId },
        "integrations.write",
        "You cannot sync integrations for this team",
      );
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      syncMode: command.syncMode ?? null,
      cursor: command.cursor ?? null,
    });
    const replayed = await integrationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      syncIntegrationOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different integration sync",
        );
      }

      return { ...(replayed.result as SyncIntegrationResult), replayed: true };
    }

    const connection = await integrationRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.status === "disabled") {
      throw new AppError("NOT_FOUND", "Integration not found");
    }

    const secrets = await integrationRepository.getIntegrationConnectionSecretsForTeam(
      command.teamId,
      connection.id,
    );

    if (!secrets) {
      throw new AppError("NOT_FOUND", "Integration not found");
    }

    const provider = requireIntegrationProvider(providers, connection.provider);
    const syncRun = await integrationRepository.createIntegrationSyncRun({
      syncRunId: crypto.randomUUID(),
      teamId: command.teamId,
      integrationConnectionId: connection.id,
      category: connection.category,
      provider: connection.provider,
    });

    try {
      const synced = await provider.sync({
        teamId: command.teamId,
        providerConnectionId: connection.providerConnectionId,
        token: secrets.token,
        rawPayload: secrets.rawPayload,
        syncMode: command.syncMode,
        cursor: command.cursor ?? null,
      });
      await persistProviderExternalObjects(integrationRepository, {
        teamId: command.teamId,
        provider: connection.provider,
        providerConnectionId: connection.providerConnectionId,
        integrationConnectionId: connection.id,
        objects: synced.externalObjects ?? [],
      });
      const completedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: synced.status,
        recordsSynced: synced.recordsSynced,
        error:
          synced.status === "partial"
            ? (synced.error ?? "Integration sync partially completed")
            : null,
        rawPayload: synced.rawPayload,
      });
      const nextConnectionStatus = synced.status === "partial" ? "error" : "connected";
      const nextLastError =
        synced.status === "partial"
          ? (synced.error ?? synced.recovery?.message ?? "Integration sync partially completed")
          : null;
      const syncedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
        status: nextConnectionStatus,
        lastError: nextLastError,
      });
      const refreshedConnection =
        synced.refreshedToken || synced.connectionRawPayload
          ? await integrationRepository.updateIntegrationConnectionTokenAndRawPayload({
              connectionId: connection.id,
              token: synced.refreshedToken ?? null,
              rawPayload: synced.connectionRawPayload ?? secrets.rawPayload,
              status: nextConnectionStatus,
              lastError: nextLastError,
              lastSyncAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
            })
          : syncedConnection;

      await integrationRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "integration.synced",
        entityType: "integration_connection",
        entityId: connection.id,
        metadata: {
          provider: connection.provider,
          category: connection.category,
          status: completedSyncRun.status,
          recordsSynced: completedSyncRun.recordsSynced,
          recovery: synced.recovery ?? null,
        },
      });

      await integrationRepository.appendOutboxEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: "integration.synced",
        version: 1,
        payload: {
          connectionId: connection.id,
          provider: connection.provider,
          category: connection.category,
          status: completedSyncRun.status,
          recordsSynced: completedSyncRun.recordsSynced,
          recovery: synced.recovery ?? null,
        },
      });

      const result = {
        connection: refreshedConnection,
        syncRun: completedSyncRun,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: syncIntegrationOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const message = errorMessage(error);
      const failedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        recordsSynced: 0,
        error: message,
        rawPayload: { error: message },
      });
      const failedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
        status: "error",
        lastError: message,
      });
      const result = {
        connection: failedConnection,
        syncRun: failedSyncRun,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: syncIntegrationOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }
  });
}

async function persistProviderExternalObjects(
  repository: IntegrationUseCaseRepository,
  input: {
    teamId: string;
    provider: string;
    providerConnectionId: string;
    integrationConnectionId: string;
    objects: readonly IntegrationProviderExternalObject[];
  },
) {
  for (const object of input.objects) {
    await repository.upsertProviderObject({
      teamId: input.teamId,
      provider: input.provider,
      providerObjectType: object.providerObjectType,
      providerObjectId: object.providerObjectId,
      internalEntityType: object.internalEntityType ?? null,
      internalEntityId: object.internalEntityId ?? null,
      rawPayload: {
        ...object.rawPayload,
        provider: input.provider,
        providerConnectionId: input.providerConnectionId,
        integrationConnectionId: input.integrationConnectionId,
      },
    });
  }
}

export async function exportAccountingIntegration(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: ExportAccountingIntegrationCommand,
): Promise<ExportAccountingIntegrationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Integration not found");

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot export accounting data for this team",
    );

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      command.exportType === "transactions" ? "transactions.read" : "invoices.read",
      "You cannot export accounting data for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      exportType: command.exportType,
    });
    const replayed = await integrationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      exportAccountingIntegrationOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different accounting export",
        );
      }

      return { ...(replayed.result as ExportAccountingIntegrationResult), replayed: true };
    }

    const connection = await integrationRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.status === "disabled" || connection.category !== "accounting") {
      throw new AppError("NOT_FOUND", "Accounting integration not found");
    }

    const provider = requireIntegrationProvider(providers, connection.provider);
    const syncRun = await integrationRepository.createIntegrationSyncRun({
      syncRunId: crypto.randomUUID(),
      teamId: command.teamId,
      integrationConnectionId: connection.id,
      category: connection.category,
      provider: connection.provider,
    });

    try {
      const exported =
        command.exportType === "transactions"
          ? await exportTransactionsToProvider(integrationRepository, provider, connection)
          : await exportInvoicesToProvider(integrationRepository, provider, connection);
      const completedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: exported.status,
        recordsSynced: exported.recordsExported,
        error: null,
        rawPayload: exported.rawPayload,
      });
      const syncedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
        status: "connected",
        lastError: null,
      });

      await integrationRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "integration.accounting_exported",
        entityType: "integration_connection",
        entityId: connection.id,
        metadata: {
          provider: connection.provider,
          exportType: command.exportType,
          recordsExported: completedSyncRun.recordsSynced,
        },
      });

      await integrationRepository.appendOutboxEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: "integration.accounting_exported",
        version: 1,
        payload: {
          connectionId: connection.id,
          provider: connection.provider,
          exportType: command.exportType,
          recordsExported: completedSyncRun.recordsSynced,
        },
      });

      const result = {
        connection: syncedConnection,
        syncRun: completedSyncRun,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: exportAccountingIntegrationOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const message = errorMessage(error);
      const failedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        recordsSynced: 0,
        error: message,
        rawPayload: { error: message, exportType: command.exportType },
      });
      const failedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
        status: "error",
        lastError: message,
      });
      const result = {
        connection: failedConnection,
        syncRun: failedSyncRun,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: exportAccountingIntegrationOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }
  });
}

export async function recordPaymentProviderEvent(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: RecordPaymentProviderEventCommand,
): Promise<RecordPaymentProviderEventResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Payment integration not found");

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot record payment provider events for this team",
    );

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot record payment provider events for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      rawPayload: command.rawPayload,
    });
    const replayed = await integrationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      recordPaymentProviderEventOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different payment provider event",
        );
      }

      return { ...(replayed.result as RecordPaymentProviderEventResult), replayed: true };
    }

    const connection = await integrationRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection || connection.status === "disabled" || connection.category !== "payments") {
      throw new AppError("NOT_FOUND", "Payment integration not found");
    }

    const provider = requireIntegrationProvider(providers, connection.provider);
    const syncRun = await integrationRepository.createIntegrationSyncRun({
      syncRunId: crypto.randomUUID(),
      teamId: command.teamId,
      integrationConnectionId: connection.id,
      category: connection.category,
      provider: connection.provider,
    });

    try {
      if (
        !connection.capabilities.includes("receivePaymentEvents") ||
        !provider.receivePaymentEvent
      ) {
        throw new AppError("CONFLICT", "Integration does not support payment events");
      }

      const providerResult = await provider.receivePaymentEvent({
        teamId: command.teamId,
        providerConnectionId: connection.providerConnectionId,
        rawPayload: command.rawPayload,
      });
      const paymentResult = await recordProviderPaymentInRepository(
        integrationRepository,
        context,
        providerResult.paymentEvent,
        {
          teamId: command.teamId,
          connectionId: connection.id,
          provider: connection.provider,
        },
      );
      const completedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: providerResult.status,
        recordsSynced: 1,
        error: null,
        rawPayload: providerResult.rawPayload,
      });
      const syncedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
        status: "connected",
        lastError: null,
      });

      await integrationRepository.appendAuditEvent({
        teamId: command.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: "integration.payment_event_recorded",
        entityType: "integration_connection",
        entityId: connection.id,
        metadata: {
          provider: connection.provider,
          providerEventId: providerResult.paymentEvent.providerEventId,
          invoiceId: paymentResult.invoice.id,
          paymentId: paymentResult.payment.id,
        },
      });

      const result = {
        connection: syncedConnection,
        syncRun: completedSyncRun,
        invoice: paymentResult.invoice,
        payment: paymentResult.payment,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: recordPaymentProviderEventOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const message = errorMessage(error);
      const failedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        recordsSynced: 0,
        error: message,
        rawPayload: { error: message, eventType: "payment" },
      });
      const failedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
        status: "error",
        lastError: message,
      });
      const result = {
        connection: failedConnection,
        syncRun: failedSyncRun,
        invoice: null,
        payment: null,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: recordPaymentProviderEventOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }
  });
}

export async function sendIntegrationMessage(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: SendIntegrationMessageCommand,
): Promise<SendIntegrationDeliveryResult> {
  return sendIntegrationDelivery(repository, providers, context, {
    teamId: command.teamId,
    connectionId: command.connectionId,
    category: "messaging",
    capability: "sendMessage",
    operation: sendIntegrationMessageOperation,
    idempotencyKey: command.idempotencyKey,
    fingerprint: JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      channel: command.channel.trim(),
      text: command.text.trim(),
    }),
    notFoundMessage: "Messaging integration not found",
    permissionMessage: "You cannot send integration messages for this team",
    unsupportedMessage: "Integration does not support messages",
    auditAction: "integration.message_sent",
    outboxType: "integration.message_sent",
    send: async (provider, connection) => {
      if (!provider.sendMessage) {
        throw new AppError("CONFLICT", "Integration does not support messages");
      }

      return await provider.sendMessage({
        teamId: command.teamId,
        providerConnectionId: connection.providerConnectionId,
        channel: nonEmptyString(command.channel, "Message channel"),
        text: nonEmptyString(command.text, "Message text"),
      });
    },
    metadata: {
      channel: command.channel.trim(),
      textLength: command.text.trim().length,
    },
  });
}

export async function sendIntegrationEmail(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  command: SendIntegrationEmailCommand,
): Promise<SendIntegrationDeliveryResult> {
  return sendIntegrationDelivery(repository, providers, context, {
    teamId: command.teamId,
    connectionId: command.connectionId,
    category: "email",
    capability: "sendEmail",
    operation: sendIntegrationEmailOperation,
    idempotencyKey: command.idempotencyKey,
    fingerprint: JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
      to: command.to.trim().toLowerCase(),
      subject: command.subject.trim(),
      text: command.text.trim(),
    }),
    notFoundMessage: "Email integration not found",
    permissionMessage: "You cannot send integration email for this team",
    unsupportedMessage: "Integration does not support email",
    auditAction: "integration.email_sent",
    outboxType: "integration.email_sent",
    send: async (provider, connection) => {
      if (!provider.sendEmail) {
        throw new AppError("CONFLICT", "Integration does not support email");
      }

      return await provider.sendEmail({
        teamId: command.teamId,
        providerConnectionId: connection.providerConnectionId,
        to: normalizeDeliveryEmail(command.to),
        subject: nonEmptyString(command.subject, "Email subject"),
        text: nonEmptyString(command.text, "Email text"),
      });
    },
    metadata: {
      to: command.to.trim().toLowerCase(),
      subject: command.subject.trim(),
      textLength: command.text.trim().length,
    },
  });
}

export async function disableIntegration(
  repository: IntegrationUseCaseRepository,
  context: TransactionReviewContext,
  command: DisableIntegrationCommand,
): Promise<DisableIntegrationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Integration not found");

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: command.teamId },
      "integrations.write",
      "You cannot disable integrations for this team",
    );

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      connectionId: command.connectionId,
    });
    const replayed = await integrationRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      disableIntegrationOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different integration disable",
        );
      }

      return { ...(replayed.result as DisableIntegrationResult), replayed: true };
    }

    const connection = await integrationRepository.getIntegrationConnectionForTeam(
      command.teamId,
      command.connectionId,
    );

    if (!connection) {
      throw new AppError("NOT_FOUND", "Integration not found");
    }

    const disabled = await integrationRepository.disableIntegrationConnection({
      connectionId: connection.id,
      disabledAt: new Date(),
    });

    await integrationRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "integration.disabled",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        category: connection.category,
        preservesHistoricalData: true,
      },
    });

    await integrationRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "integration.disabled",
      version: 1,
      payload: {
        connectionId: connection.id,
        provider: connection.provider,
        category: connection.category,
        preservesHistoricalData: true,
      },
    });

    const result = { connection: disabled, replayed: false };

    await integrationRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: disableIntegrationOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

function integrationProviderDescriptor(
  provider: IntegrationProvider,
): IntegrationProviderDescriptor {
  return {
    provider: provider.provider,
    category: provider.category,
    displayName: provider.displayName,
    capabilities: provider.capabilities,
  };
}

function requireIntegrationProvider(
  providers: readonly IntegrationProvider[],
  providerName: string,
): IntegrationProvider {
  const provider = providers.find((candidate) => candidate.provider === providerName);

  if (!provider) {
    throw new AppError("NOT_FOUND", "Integration provider not found");
  }

  return provider;
}

async function exportTransactionsToProvider(
  repository: IntegrationUseCaseRepository,
  provider: IntegrationProvider,
  connection: IntegrationConnection,
) {
  if (!connection.capabilities.includes("exportTransactions") || !provider.exportTransactions) {
    throw new AppError("CONFLICT", "Integration does not support transaction exports");
  }

  return await provider.exportTransactions({
    teamId: connection.teamId,
    providerConnectionId: connection.providerConnectionId,
    transactions: await repository.listTransactionsForReport({ teamId: connection.teamId }),
  });
}

async function exportInvoicesToProvider(
  repository: IntegrationUseCaseRepository,
  provider: IntegrationProvider,
  connection: IntegrationConnection,
) {
  if (!connection.capabilities.includes("exportInvoices") || !provider.exportInvoices) {
    throw new AppError("CONFLICT", "Integration does not support invoice exports");
  }

  return await provider.exportInvoices({
    teamId: connection.teamId,
    providerConnectionId: connection.providerConnectionId,
    invoices: await repository.listInvoices(connection.teamId),
  });
}

async function sendIntegrationDelivery(
  repository: IntegrationUseCaseRepository,
  providers: readonly IntegrationProvider[],
  context: TransactionReviewContext,
  input: {
    teamId: string;
    connectionId: string;
    category: IntegrationCategory;
    capability: IntegrationProviderCapability;
    operation: string;
    idempotencyKey: string;
    fingerprint: string;
    notFoundMessage: string;
    permissionMessage: string;
    unsupportedMessage: string;
    auditAction: string;
    outboxType: string;
    metadata: Record<string, unknown>;
    send: (
      provider: IntegrationProvider,
      connection: IntegrationConnection,
    ) => Promise<{
      status: "completed";
      providerDeliveryId: string;
      rawPayload: Record<string, unknown>;
    }>;
  },
): Promise<SendIntegrationDeliveryResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const integrationRepository = transactionRepository as IntegrationUseCaseRepository;

    assertCommandTeamMatchesContext(context, input.teamId, input.notFoundMessage);

    await resolveTeamAccess(
      integrationRepository,
      { ...context, teamId: input.teamId },
      "integrations.write",
      input.permissionMessage,
    );

    const replayed = await integrationRepository.getIdempotencyResult(
      input.teamId,
      context.actor.id,
      input.operation,
      input.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== input.fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different integration delivery",
        );
      }

      return { ...(replayed.result as SendIntegrationDeliveryResult), replayed: true };
    }

    const connection = await integrationRepository.getIntegrationConnectionForTeam(
      input.teamId,
      input.connectionId,
    );

    if (!connection || connection.status === "disabled" || connection.category !== input.category) {
      throw new AppError("NOT_FOUND", input.notFoundMessage);
    }

    const provider = requireIntegrationProvider(providers, connection.provider);
    const syncRun = await integrationRepository.createIntegrationSyncRun({
      syncRunId: crypto.randomUUID(),
      teamId: input.teamId,
      integrationConnectionId: connection.id,
      category: connection.category,
      provider: connection.provider,
    });

    try {
      if (!connection.capabilities.includes(input.capability)) {
        throw new AppError("CONFLICT", input.unsupportedMessage);
      }

      const delivery = await input.send(provider, connection);
      const completedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: delivery.status,
        recordsSynced: 1,
        error: null,
        rawPayload: delivery.rawPayload,
      });
      const syncedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(completedSyncRun.completedAt ?? completedSyncRun.startedAt),
        status: "connected",
        lastError: null,
      });
      const metadata = {
        provider: connection.provider,
        providerDeliveryId: delivery.providerDeliveryId,
        ...input.metadata,
      };

      await integrationRepository.appendAuditEvent({
        teamId: input.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        action: input.auditAction,
        entityType: "integration_connection",
        entityId: connection.id,
        metadata,
      });

      await integrationRepository.appendOutboxEvent({
        teamId: input.teamId,
        actorId: context.actor.id,
        requestId: context.requestId,
        type: input.outboxType,
        version: 1,
        payload: {
          connectionId: connection.id,
          ...metadata,
        },
      });

      const result = {
        connection: syncedConnection,
        syncRun: completedSyncRun,
        providerDeliveryId: delivery.providerDeliveryId,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: input.teamId,
        actorId: context.actor.id,
        operation: input.operation,
        key: input.idempotencyKey,
        fingerprint: input.fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const message = errorMessage(error);
      const failedSyncRun = await integrationRepository.finishIntegrationSyncRun({
        syncRunId: syncRun.id,
        status: "failed",
        recordsSynced: 0,
        error: message,
        rawPayload: { error: message, deliveryType: input.category },
      });
      const failedConnection = await integrationRepository.markIntegrationConnectionSynced({
        connectionId: connection.id,
        syncedAt: new Date(failedSyncRun.completedAt ?? failedSyncRun.startedAt),
        status: "error",
        lastError: message,
      });
      const result = {
        connection: failedConnection,
        syncRun: failedSyncRun,
        providerDeliveryId: null,
        replayed: false,
      };

      await integrationRepository.saveIdempotencyResult({
        teamId: input.teamId,
        actorId: context.actor.id,
        operation: input.operation,
        key: input.idempotencyKey,
        fingerprint: input.fingerprint,
        result,
      });

      return result;
    }
  });
}

async function recordProviderPaymentInRepository(
  repository: IntegrationUseCaseRepository,
  context: TransactionReviewContext,
  paymentEvent: IntegrationPaymentEvent,
  metadata: {
    teamId: string;
    connectionId: string;
    provider: string;
  },
) {
  const invoice = await repository.getInvoiceForTeam(metadata.teamId, paymentEvent.invoiceId);

  if (!invoice) {
    throw new AppError("NOT_FOUND", "Invoice not found for provider payment event");
  }

  let nextPaymentState: ReturnType<typeof invoiceStatusAfterPayment>;

  try {
    nextPaymentState = invoiceStatusAfterPayment({
      invoice,
      payment: paymentEvent.amount,
      paidAt: paymentEvent.paidAt,
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  const paymentResult = await repository.recordInvoicePayment({
    paymentId: crypto.randomUUID(),
    teamId: metadata.teamId,
    invoiceId: invoice.id,
    amount: paymentEvent.amount,
    paidAt: paymentEvent.paidAt,
    method: paymentEvent.method ?? "provider",
    note: `Provider payment event ${paymentEvent.providerEventId}`,
    createdByActorId: context.actor.id,
    nextInvoiceStatus: nextPaymentState.status,
    nextAmountPaid: nextPaymentState.amountPaid,
    invoicePaidAt: nextPaymentState.paidAt,
  });

  await repository.createInvoiceEvent({
    eventId: crypto.randomUUID(),
    teamId: metadata.teamId,
    invoiceId: invoice.id,
    type: "invoice.payment_recorded",
    occurredAt: paymentEvent.paidAt,
    actorId: context.actor.id,
    metadata: {
      paymentId: paymentResult.payment.id,
      amount: paymentEvent.amount,
      nextStatus: paymentResult.invoice.status,
      provider: metadata.provider,
      integrationConnectionId: metadata.connectionId,
      providerEventId: paymentEvent.providerEventId,
    },
  });

  await repository.appendAuditEvent({
    teamId: metadata.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: "invoice_payment.recorded",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      paymentId: paymentResult.payment.id,
      amount: paymentEvent.amount,
      nextStatus: paymentResult.invoice.status,
      provider: metadata.provider,
      integrationConnectionId: metadata.connectionId,
      providerEventId: paymentEvent.providerEventId,
    },
  });

  await repository.appendOutboxEvent({
    teamId: metadata.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: "invoice.payment_recorded",
    version: 1,
    payload: {
      invoiceId: invoice.id,
      paymentId: paymentResult.payment.id,
      amount: paymentEvent.amount,
      nextStatus: paymentResult.invoice.status,
      provider: metadata.provider,
      integrationConnectionId: metadata.connectionId,
      providerEventId: paymentEvent.providerEventId,
    },
  });

  return paymentResult;
}

function nonEmptyString(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new AppError("CONFLICT", `${field} is required`);
  }

  return normalized;
}

function normalizeDeliveryEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("CONFLICT", "Invite email is invalid");
  }

  return normalizedEmail;
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  notFoundMessage: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", notFoundMessage);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
