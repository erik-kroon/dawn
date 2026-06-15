import { createMockInsightGenerationProvider } from "@dawn/ai";
import {
  createBankingProviderRegistry,
  deliverWebhooksForOutboxEvent,
  gateTeamDataDeletion,
  generateRecurringInvoice,
  generateWeeklyInsights,
  resolveSystemAppRequest,
  runAutomationsForOutboxEvent,
  syncBankConnection,
  type WebhookDeliveryProvider,
} from "@dawn/app";
import { DrizzleDawnRepository } from "@dawn/db/dawn-repository";
import type { DawnCloudflareBindings } from "@dawn/infra/cloudflare";
import {
  createDawnQueueMessageHandlerRegistry,
  type DawnQueueMessage,
  type DawnQueueMessageHandlers,
  type DawnQueueMessageType,
} from "@dawn/jobs";
import { createMockBankingProvider, createSandboxBankingProvider } from "@dawn/integrations";

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
    "team_data.delete": async (message) => {
      await gateTeamDataDeletion(new DrizzleDawnRepository(), {
        teamId: message.teamId,
        sourceOutboxEventId: message.sourceOutboxEventId,
        idempotencyKey: message.idempotencyKey,
      });
    },
  };
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
