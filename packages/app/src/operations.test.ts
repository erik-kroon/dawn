import { describe, expect, test } from "bun:test";

import {
  AppError,
  listOperationsWorkspace,
  redactOperationalText,
  redactOperationalValue,
  type AuditLogEntry,
  type DawnRepository,
  type JobRun,
  type OutboxEvent,
  type ProviderSyncRun,
} from "./index";
import type {
  Actor,
  AutomationRun,
  IntegrationSyncRun,
  TeamRole,
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

  async listAutomationRuns(teamId: string, limit: number) {
    return this.automationRuns.filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listWebhookDeliveries(teamId: string, limit: number) {
    return this.webhookDeliveries.filter((delivery) => delivery.teamId === teamId).slice(0, limit);
  }
}

const actor = { id: "user_1", type: "user" } as const;
const context = { actor, requestId: "request_1", teamId: "team_1" };

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
      repository as unknown as DawnRepository,
      context,
      {
        audit: { action: "invoice.sent", entityType: "invoice", entityId: "invoice_1" },
      },
    );

    expect(workspace.metrics).toMatchObject({
      failedJobs: 1,
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
    expect(workspace.recentJobRuns[0]?.error).toContain("[redacted-email]");
    expect(workspace.recentProviderSyncRuns[0]?.error).toContain("[redacted-token]");
    expect(workspace.recentIntegrationSyncRuns[0]?.rawPayload).toEqual({
      accessToken: "[redacted]",
      contactEmail: "[redacted]",
    });
    expect(workspace.dataWorkflows.map((workflow) => workflow.type)).toEqual([
      "team_data_export",
      "team_data_deletion",
    ]);
  });

  test("requires operations read permission", async () => {
    const repository = new MemoryOperationsRepository();
    repository.memberships.set("user_1:team_1", "viewer");

    await expect(
      listOperationsWorkspace(repository as unknown as DawnRepository, context),
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
