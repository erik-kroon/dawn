import { describe, expect, test } from "bun:test";

import {
  createAutomationRule,
  listAutomationWorkspace,
  runAutomationsForOutboxEvent,
  type DawnRepository,
  type IdempotencyResult,
  type OutboxEvent,
} from ".";
import type {
  Actor,
  AutomationRule,
  AutomationRun,
  Category,
  TeamRole,
  Transaction,
} from "@dawn/domain";

class MemoryAutomationRepository {
  role: TeamRole | null = "owner";
  categories = new Map<string, Category>();
  transactions = new Map<string, Transaction>();
  rules = new Map<string, AutomationRule>();
  runs = new Map<string, AutomationRun>();
  outboxEvents = new Map<string, OutboxEvent>();
  auditEvents: unknown[] = [];
  emittedOutboxEvents: unknown[] = [];
  idempotency = new Map<string, IdempotencyResult<unknown>>();

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(_actor: Actor, teamId: string) {
    return this.role && teamId === "team_1" ? { role: this.role } : null;
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
    this.emittedOutboxEvents.push(input);
  }

  async listAutomationRules(teamId: string) {
    return [...this.rules.values()].filter((rule) => rule.teamId === teamId);
  }

  async listAutomationRuns(teamId: string, limit: number) {
    return [...this.runs.values()].filter((run) => run.teamId === teamId).slice(0, limit);
  }

  async listEnabledAutomationRulesForEvent(input: { teamId: string; eventType: string }) {
    return [...this.rules.values()].filter(
      (rule) =>
        rule.teamId === input.teamId && rule.enabled && rule.trigger.eventType === input.eventType,
    );
  }

  async getOutboxEventForTeam(teamId: string, outboxEventId: string) {
    const event = this.outboxEvents.get(outboxEventId);
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
    const rule: AutomationRule = {
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
    this.rules.set(rule.id, rule);
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
    const run: AutomationRun = {
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
    this.runs.set(run.id, run);
    return run;
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    const transaction = this.transactions.get(transactionId);
    return transaction?.teamId === teamId ? transaction : null;
  }

  async getCategoryForTeam(teamId: string, categoryId: string) {
    const category = this.categories.get(categoryId);
    return category?.teamId === teamId ? category : null;
  }

  async updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }) {
    const transaction = this.transactions.get(input.transactionId);
    if (!transaction || transaction.teamId !== input.teamId) {
      throw new Error("Transaction not found");
    }
    const updated = {
      ...transaction,
      categoryId: input.categoryId,
      reviewState: input.reviewState,
    };
    this.transactions.set(updated.id, updated);
    return updated;
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

function seedReviewEvent(repository: MemoryAutomationRepository) {
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
  repository.outboxEvents.set("outbox_1", {
    id: "outbox_1",
    teamId: "team_1",
    type: "transaction.created",
    version: 1,
    payload: { transactionId: "txn_1" },
    dispatchAttempts: 0,
    status: "pending",
    occurredAt: "2026-06-15T00:00:00.000Z",
  });
}

describe("automation use cases", () => {
  test("creates and lists team-scoped automation rules", async () => {
    const repository = new MemoryAutomationRepository();
    const result = await createAutomationRule(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Notify on new transaction",
      trigger: { type: "outbox_event", eventType: "transaction.created" },
      actionType: "create_notification",
      actionConfig: { message: "Review a new transaction" },
      approvalPolicy: "require_approval",
      idempotencyKey: "rule_1",
    });
    const workspace = await listAutomationWorkspace(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
      },
    );

    expect(result.rule).toMatchObject({
      teamId: "team_1",
      actionType: "create_notification",
    });
    expect(workspace.rules).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(1);
  });

  test("runs a matching categorization rule through the transaction review use case", async () => {
    const repository = new MemoryAutomationRepository();
    seedReviewEvent(repository);
    await createAutomationRule(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Auto-categorize Figma",
      trigger: { type: "outbox_event", eventType: "transaction.created" },
      actionType: "categorize_transaction",
      actionConfig: { categoryId: "cat_software" },
      approvalPolicy: "auto_approve",
      idempotencyKey: "rule_1",
    });

    const result = await runAutomationsForOutboxEvent(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        outboxEventId: "outbox_1",
      },
    );

    expect(result.scanned).toBe(1);
    expect(result.runs[0]).toMatchObject({
      status: "succeeded",
      actionType: "categorize_transaction",
    });
    expect(repository.transactions.get("txn_1")).toMatchObject({
      categoryId: "cat_software",
      reviewState: "reviewed",
    });
    expect(repository.emittedOutboxEvents).toContainEqual(
      expect.objectContaining({ type: "transaction.reviewed" }),
    );
  });

  test("logs approval-required runs for risky external actions", async () => {
    const repository = new MemoryAutomationRepository();
    seedReviewEvent(repository);
    await createAutomationRule(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Export reviewed transaction",
      trigger: { type: "outbox_event", eventType: "transaction.created" },
      actionType: "request_accounting_export",
      actionConfig: { exportType: "transactions" },
      approvalPolicy: "require_approval",
      idempotencyKey: "rule_1",
    });

    const result = await runAutomationsForOutboxEvent(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        outboxEventId: "outbox_1",
      },
    );

    expect(result.runs[0]).toMatchObject({
      status: "approval_required",
      actionType: "request_accounting_export",
    });
    expect(repository.emittedOutboxEvents).toHaveLength(0);
  });
});
