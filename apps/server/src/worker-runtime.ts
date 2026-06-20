import { createMockInsightGenerationProvider } from "@dawn/ai";
import {
  createBankingProviderRegistry,
  deliverWebhooksForOutboxEvent,
  gateTeamDataDeletion,
  generateRecurringInvoice,
  generateWeeklyInsights,
  generateInboxMatchSuggestions,
  matchBidirectionalBatch,
  matchPendingInboxForTransaction,
  requestDueEmailInboxSyncs,
  resolveSystemAppRequest,
  runAutomationsForOutboxEvent,
  syncIntegration,
  syncEmailInbox,
  syncBankConnection,
  type WebhookDeliveryProvider,
} from "@dawn/app";
import { DrizzleDawnRepository } from "@dawn/db/dawn-repository";
import {
  googleOAuthCredentialStatus,
  resolveGoogleOAuthCredentials,
  type GoogleOAuthCredentialStatus,
} from "@dawn/env/google-oauth";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import {
  createDawnQueueMessageHandlerRegistry,
  type DawnQueueMessage,
  type DawnQueueMessageHandlers,
  type DawnQueueMessageType,
} from "@dawn/jobs";
import {
  createEmailInboxTokenCodec,
  createGmailEmailInboxProvider,
  createMockBankingProvider,
  createMockEmailInboxProvider,
  createConfiguredIntegrationProviders,
  createSandboxBankingProvider,
  InboxConnector,
  type IntegrationProvider,
} from "@dawn/integrations";

import { processAccountantPacketExportJob } from "./accountant-packet-export";
import { processQueuedCsvTransactionImportJob } from "./csv-transaction-import";
import { processTeamDataExportJob } from "./data-export";
import { processDocumentExtractionJob } from "./document-extraction";
import { createR2DocumentObjectStorage } from "./document-storage";
import { logServerError } from "./observability";
import { publishTenantSyncInvalidation } from "./tenant-sync";

export type DawnWorkerHealth = {
  service: "dawn-worker";
  status: "ok";
  environment: DawnCloudflareBindings["ENVIRONMENT"];
  handlers: DawnQueueMessageType[];
  bindings: Record<
    "database" | "documents" | "jobs" | "deadLetter" | "tenantCoordinator",
    "bound" | "missing"
  >;
  configuration: {
    gmail: GoogleOAuthCredentialStatus;
  };
};

export type DawnWorkerRuntime = {
  handleMessage(message: DawnQueueMessage): Promise<void>;
  health(): DawnWorkerHealth;
};

export function createDawnWorkerRuntime(env: DawnCloudflareBindings): DawnWorkerRuntime {
  const handlers = createDawnWorkerJobHandlers(env);
  const registry = createDawnQueueMessageHandlerRegistry(handlers);

  return {
    async handleMessage(message) {
      await registry.handle(message);
    },
    health() {
      return {
        service: "dawn-worker",
        status: "ok",
        environment: env.ENVIRONMENT,
        handlers: (Object.keys(handlers) as DawnQueueMessageType[]).sort(),
        bindings: {
          database: env.DATABASE_URL || env.DAWN_HYPERDRIVE ? "bound" : "missing",
          documents: env.DAWN_DOCUMENTS ? "bound" : "missing",
          jobs: env.DAWN_JOBS ? "bound" : "missing",
          deadLetter: env.DAWN_JOBS_DLQ ? "bound" : "missing",
          tenantCoordinator: env.DAWN_TENANT_COORDINATOR ? "bound" : "missing",
        },
        configuration: {
          gmail: googleOAuthCredentialStatus(env),
        },
      };
    },
  };
}

export async function handleDawnWorkerQueueBatch(
  batch: MessageBatch<DawnQueueMessage>,
  env: DawnCloudflareBindings,
) {
  const runtime = createDawnWorkerRuntime(env);

  for (const message of batch.messages) {
    try {
      await runtime.handleMessage(message.body);
      message.ack();
    } catch (error) {
      logServerError(error, {
        operation: message.body.type,
        requestId: message.body.idempotencyKey,
        teamId: message.body.teamId,
        actorType: "system",
      });
      message.retry();
    }
  }
}

export function createDawnWorkerJobHandlers(env: DawnCloudflareBindings): DawnQueueMessageHandlers {
  return {
    "outbox.dispatch": async () => {},
    "sync.invalidate": async (message) => {
      await publishTenantSyncInvalidation(env, message);
    },
    "document.extract": async (message) => {
      await processDocumentExtractionJob({
        repository: new DrizzleDawnRepository(),
        storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
        message,
      });
    },
    "transaction.match_pending_inbox": async (message) => {
      await matchPendingInboxForTransaction(
        new DrizzleDawnRepository(),
        resolveSystemAppRequest({
          actorId: "system:matching",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          transactionId: message.transactionId,
          sourceOutboxEventId: message.sourceOutboxEventId,
          idempotencyKey: message.idempotencyKey,
          enforceCallerPermission: false,
        },
      );
    },
    "inbox.match_bidirectional_batch": async (message) => {
      await matchBidirectionalBatch(
        new DrizzleDawnRepository(),
        resolveSystemAppRequest({
          actorId: "system:matching",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          transactionIds: message.transactionIds,
          inboxItemIds: message.inboxItemIds,
          sourceOutboxEventId: message.sourceOutboxEventId,
          idempotencyKey: message.idempotencyKey,
          enforceCallerPermission: false,
        },
      );
    },
    "transaction_import.commit": async (message) => {
      await processQueuedCsvTransactionImportJob({
        repository: new DrizzleDawnRepository(),
        storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
        message,
      });
    },
    "inbox.match_suggestions": async (message) => {
      await generateInboxMatchSuggestions(
        new DrizzleDawnRepository(),
        resolveSystemAppRequest({
          actorId: "system:matching",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          inboxItemId: message.inboxItemId,
          enforceCallerPermission: false,
        },
      );
    },
    "inbox.provider.sync": async (message) => {
      await syncEmailInbox(
        new DrizzleDawnRepository(),
        createWorkerEmailInboxConnectors(env),
        createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
        resolveSystemAppRequest({
          actorId: "system:email-inbox",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          connectionId: message.connectionId,
          idempotencyKey: message.idempotencyKey,
          enforceCallerPermission: false,
        },
      );
    },
    "invoice.recurring.generate": async (message) => {
      await generateRecurringInvoice(new DrizzleDawnRepository(), {
        teamId: message.teamId,
        scheduleId: message.scheduleId,
        runAt: message.runAt,
        idempotencyKey: message.idempotencyKey,
      });
    },
    "insights.weekly.generate": async (message) => {
      await generateWeeklyInsights(
        new DrizzleDawnRepository(),
        createMockInsightGenerationProvider(),
        {
          teamId: message.teamId,
          periodStart: message.periodStart,
          periodEnd: message.periodEnd,
          idempotencyKey: message.idempotencyKey,
        },
      );
    },
    "automation.run": async (message) => {
      await runAutomationsForOutboxEvent(
        new DrizzleDawnRepository(),
        resolveSystemAppRequest({
          actorId: "system:automation",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          outboxEventId: message.sourceOutboxEventId,
          enforceCallerPermission: false,
        },
      );
    },
    "bank.sync": async (message) => {
      await syncBankConnection(
        new DrizzleDawnRepository(),
        createWorkerBankingProviderRegistry(env),
        resolveSystemAppRequest({
          actorId: "system:bank-sync",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          connectionId: message.connectionId,
          idempotencyKey: message.idempotencyKey,
          enforceCallerPermission: false,
        },
      );
    },
    "fortnox.sync": async (message) => {
      await syncIntegration(
        new DrizzleDawnRepository(),
        createWorkerIntegrationProviders(env),
        resolveSystemAppRequest({
          actorId: "system:fortnox-sync",
          requestId: message.idempotencyKey,
          teamId: message.teamId,
        }),
        {
          teamId: message.teamId,
          connectionId: message.connectionId,
          syncMode: message.syncMode,
          cursor: message.cursor ?? null,
          idempotencyKey: message.idempotencyKey,
          enforceCallerPermission: false,
        },
      );
    },
    "webhook.deliver": async (message) => {
      const result = await deliverWebhooksForOutboxEvent(
        new DrizzleDawnRepository(),
        createFetchWebhookDeliveryProvider(),
        {
          teamId: message.teamId,
          outboxEventId: message.sourceOutboxEventId,
        },
      );

      if (result.failed > 0) {
        throw new Error(`${result.failed} webhook deliveries failed`);
      }
    },
    "team_data.export": async (message) => {
      await processTeamDataExportJob({
        repository: new DrizzleDawnRepository(),
        storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
        message,
      });
    },
    "accountant_packet.export": async (message) => {
      await processAccountantPacketExportJob({
        repository: new DrizzleDawnRepository(),
        storage: createR2DocumentObjectStorage(env.DAWN_DOCUMENTS),
        message,
      });
    },
    "team_data.delete": async (message) => {
      await gateTeamDataDeletion(new DrizzleDawnRepository(), {
        teamId: message.teamId,
        sourceOutboxEventId: message.sourceOutboxEventId,
        idempotencyKey: message.idempotencyKey,
      });
    },
  };
}

export async function requestScheduledEmailInboxSyncs(input: {
  env: DawnCloudflareBindings;
  scheduledTime: number;
}) {
  const repository = new DrizzleDawnRepository();
  const now = new Date(input.scheduledTime);
  const connections = await repository.listEmailInboxSyncCandidateConnections();
  const teamIds = [...new Set(connections.map((connection) => connection.teamId))];

  for (const teamId of teamIds) {
    await requestDueEmailInboxSyncs(
      repository,
      resolveSystemAppRequest({
        actorId: "system:email-inbox-scheduler",
        requestId: `email-inbox-schedule:${now.toISOString()}:${teamId}`,
        teamId,
      }),
      {
        teamId,
        now,
        idempotencyKey: `email-inbox-schedule:${now.toISOString()}:${teamId}`,
        enforceCallerPermission: false,
      },
    );
  }
}

function createFetchWebhookDeliveryProvider(): WebhookDeliveryProvider {
  return {
    async deliver(input) {
      const response = await fetch(input.url, {
        method: "POST",
        headers: input.headers,
        body: JSON.stringify(input.body),
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    },
  };
}

function createWorkerBankingProviderRegistry(env: DawnCloudflareBindings) {
  return createBankingProviderRegistry([
    createMockBankingProvider(),
    createSandboxBankingProvider({
      appUrl: env.BETTER_AUTH_URL,
      webhookSecret: env.BETTER_AUTH_SECRET,
    }),
  ]);
}

function createWorkerIntegrationProviders(env: DawnCloudflareBindings): IntegrationProvider[] {
  return createConfiguredIntegrationProviders({
    fortnoxClientId: env.FORTNOX_CLIENT_ID,
    fortnoxClientSecret: env.FORTNOX_CLIENT_SECRET,
    tokenSecret: env.BETTER_AUTH_SECRET,
  });
}

function createWorkerEmailInboxConnectors(env: DawnCloudflareBindings) {
  const tokenCodec = createEmailInboxTokenCodec({
    secret: env.BETTER_AUTH_SECRET,
    keyId: "worker-email-inbox-token-v1",
  });
  const googleOAuthCredentials = resolveGoogleOAuthCredentials(env);
  const providers = [
    createMockEmailInboxProvider(),
    ...(googleOAuthCredentials
      ? [
          createGmailEmailInboxProvider({
            clientId: googleOAuthCredentials.clientId,
            clientSecret: googleOAuthCredentials.clientSecret,
          }),
        ]
      : []),
  ];

  return providers.map((provider) => new InboxConnector({ provider, tokenCodec }));
}
