import { describe, expect, test } from "bun:test";

import type { AuditLogEntry, DawnRepository, OutboxEvent, ReviewWorkspaceData } from "@dawn/app";

import { processTeamDataExportJob } from "./data-export";
import { createMemoryDocumentObjectStorage } from "./document-storage";

class MemoryDataExportRepository {
  auditEvents: AuditLogEntry[] = [];
  outboxEvents: OutboxEvent[] = [
    {
      id: "outbox_1",
      teamId: "team_1",
      type: "team_data.export_requested",
      version: 1,
      payload: { email: "owner@example.com", accessToken: "secret" },
      dispatchAttempts: 0,
      status: "dispatched",
      lastError: null,
      nextAttemptAt: null,
      occurredAt: "2026-06-15T00:00:00.000Z",
      processedAt: "2026-06-15T00:00:01.000Z",
    },
  ];

  async listWorkspace(): Promise<ReviewWorkspaceData> {
    return {
      teamId: "team_1",
      teamName: "Acme Studio",
      categories: [],
      transactions: [
        {
          id: "transaction_1",
          teamId: "team_1",
          accountId: "account_1",
          description: "Figma subscription",
          postedAt: "2026-06-14T00:00:00.000Z",
          money: { amountMinor: -1200, currency: "USD" },
          type: "expense",
          source: "manual",
          categoryId: null,
          reviewState: "needs_review",
        },
      ],
      sync: {
        collection: "transactions",
        cursor: null,
        conflictPolicy: "server_wins_for_financial_state",
      },
    };
  }

  async listAuditEvents() {
    return this.auditEvents;
  }

  async listOutboxEvents() {
    return this.outboxEvents;
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

  async appendAuditEvent(input: Omit<AuditLogEntry, "id" | "occurredAt">) {
    this.auditEvents.unshift({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: "2026-06-15T00:00:03.000Z",
      ...input,
    });
  }
}

describe("team data export jobs", () => {
  test("writes a redacted JSON archive object and audits the artifact", async () => {
    const repository = new MemoryDataExportRepository();
    const storage = createMemoryDocumentObjectStorage();

    const result = await processTeamDataExportJob({
      repository: repository as unknown as DawnRepository,
      storage,
      generatedAt: "2026-06-15T00:00:02.000Z",
      message: {
        type: "team_data.export",
        teamId: "team_1",
        format: "json",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "team-data:export:outbox_1",
      },
    });

    expect(result.objectKey).toBe("teams/team_1/exports/outbox_1.json");
    expect(result.contentType).toBe("application/json; charset=utf-8");
    const stored = await storage.get(result.objectKey);
    expect(stored?.contentType).toBe("application/json; charset=utf-8");

    const archive = JSON.parse(new TextDecoder().decode(stored?.body)) as {
      operations: { outboxEvents: Array<{ payload: Record<string, unknown> }> };
    };
    expect(archive.operations.outboxEvents[0]?.payload).toEqual({
      email: "[redacted]",
      accessToken: "[redacted]",
    });
    expect(repository.auditEvents[0]).toMatchObject({
      action: "team_data.export_archive_written",
      metadata: {
        objectKey: "teams/team_1/exports/outbox_1.json",
        sourceOutboxEventId: "outbox_1",
        byteSize: result.byteSize,
      },
    });
  });
});
