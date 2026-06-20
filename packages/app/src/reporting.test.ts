import { describe, expect, test } from "bun:test";

import { generateWeeklyInsights, listBusinessReport, type DawnRepository, type InboxItem } from ".";
import { createMockInsightGenerationProvider } from "@dawn/ai";
import type {
  Actor,
  BusinessInsight,
  Customer,
  InvoiceDraft,
  Project,
  TeamRole,
  TimeEntry,
  Transaction,
} from "@dawn/domain";

class MemoryReportingRepository {
  role: TeamRole = "owner";
  actor: Actor = { id: "user_1", type: "user" };
  transactions: Transaction[] = [];
  customers: Customer[] = [];
  invoices: InvoiceDraft[] = [];
  timeEntries: TimeEntry[] = [];
  inboxItems: InboxItem[] = [];
  projects: Project[] = [];
  insights: BusinessInsight[] = [];
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    return actor.id === this.actor.id && teamId === "team_1" ? { role: this.role } : null;
  }

  async listTransactionsForReport(input: { teamId: string; from?: string; to?: string }) {
    return this.transactions.filter(
      (transaction) =>
        transaction.teamId === input.teamId &&
        (!input.from ||
          new Date(transaction.postedAt).getTime() >= new Date(input.from).getTime()) &&
        (!input.to || new Date(transaction.postedAt).getTime() <= new Date(input.to).getTime()),
    );
  }

  async listCustomers(teamId: string) {
    return this.customers.filter((customer) => customer.teamId === teamId);
  }

  async listInvoices(teamId: string) {
    return this.invoices.filter((invoice) => invoice.teamId === teamId);
  }

  async listTimeEntries(teamId: string) {
    return this.timeEntries.filter((entry) => entry.teamId === teamId);
  }

  async listInboxItems(teamId: string) {
    return this.inboxItems.filter((item) => item.teamId === teamId);
  }

  async listProjects(teamId: string) {
    return this.projects.filter((project) => project.teamId === teamId);
  }

  async listBusinessInsights(input: { teamId: string; from?: string | null; to?: string | null }) {
    return this.insights.filter(
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
      sourceRefs: BusinessInsight["sourceRefs"];
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
    this.insights.push(...insights);
    return insights;
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
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

describe("business reporting use cases", () => {
  test("builds source-cited report metrics from fixtures", async () => {
    const repository = fixtureRepository();
    const result = await listBusinessReport(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      from: "2026-06-08T00:00:00.000Z",
      to: "2026-06-15T23:59:59.000Z",
    });

    expect(result.report.totals.revenue).toEqual({ amountMinor: 500_00, currency: "USD" });
    expect(result.report.totals.expenses).toEqual({ amountMinor: -125_00, currency: "USD" });
    expect(result.report.cashflow).toEqual({ amountMinor: 375_00, currency: "USD" });
    expect(result.report.revenueByCustomer[0]).toMatchObject({
      label: "Acme Co",
      amount: { amountMinor: 1000_00, currency: "USD" },
      sources: [{ type: "invoice", id: "invoice_1", label: "INV-001" }],
    });
    expect(result.report.unpaidInvoices[0]).toMatchObject({
      invoiceNumber: "INV-001",
      amountDue: { amountMinor: 750_00, currency: "USD" },
    });
    expect(result.report.taxSummary.invoiceTax).toEqual({ amountMinor: 200_00, currency: "USD" });
    expect(result.report.timeUtilization.billableValue).toEqual({
      amountMinor: 225_00,
      currency: "USD",
    });
    expect(result.report.inboxBacklog).toMatchObject({
      pendingExtraction: 1,
      needsReview: 1,
      suggestedMatches: 1,
    });
  });

  test("builds reports for the dominant transaction currency when data is mixed-currency", async () => {
    const repository = fixtureRepository();
    repository.transactions.push(
      {
        id: "txn_sek_income",
        teamId: "team_1",
        description: "Owner transfer",
        postedAt: "2026-06-13T00:00:00.000Z",
        money: { amountMinor: 360_00, currency: "SEK" },
        categoryId: "owner",
        reviewState: "reviewed",
      },
      {
        id: "txn_sek_card",
        teamId: "team_1",
        description: "100003655822",
        postedAt: "2026-06-13T00:00:00.000Z",
        money: { amountMinor: -130_00, currency: "SEK" },
        categoryId: "software",
        reviewState: "reviewed",
      },
      {
        id: "txn_sek_fee",
        teamId: "team_1",
        description: "AVI OVERDRAG",
        postedAt: "2026-06-13T00:00:00.000Z",
        money: { amountMinor: -100_00, currency: "SEK" },
        categoryId: "fees",
        reviewState: "reviewed",
      },
    );

    const result = await listBusinessReport(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      from: "2026-06-08T00:00:00.000Z",
      to: "2026-06-15T23:59:59.000Z",
    });

    expect(result.report.currency).toBe("SEK");
    expect(result.report.totals.revenue).toEqual({ amountMinor: 360_00, currency: "SEK" });
    expect(result.report.totals.expenses).toEqual({ amountMinor: -230_00, currency: "SEK" });
    expect(result.report.cashflow).toEqual({ amountMinor: 130_00, currency: "SEK" });
    expect(result.report.unpaidInvoices).toEqual([]);
    expect(result.report.timeUtilization.billableValue).toEqual({
      amountMinor: 0,
      currency: "SEK",
    });
  });

  test("generates weekly insights with source citations through provider", async () => {
    const repository = fixtureRepository();
    const result = await generateWeeklyInsights(
      repository as unknown as DawnRepository,
      createMockInsightGenerationProvider(),
      {
        teamId: "team_1",
        periodStart: "2026-06-08T00:00:00.000Z",
        periodEnd: "2026-06-15T23:59:59.000Z",
        idempotencyKey: "insights_1",
      },
    );

    expect(result.insights.map((insight) => insight.title)).toContain(
      "Unpaid invoices need follow-up",
    );
    expect(result.insights.some((insight) => insight.sourceRefs.length > 0)).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });
});

function fixtureRepository() {
  const repository = new MemoryReportingRepository();
  repository.customers = [
    {
      id: "customer_1",
      teamId: "team_1",
      name: "Acme Co",
    },
  ];
  repository.transactions = [
    {
      id: "txn_income",
      teamId: "team_1",
      description: "Client payment",
      postedAt: "2026-06-10T00:00:00.000Z",
      money: { amountMinor: 500_00, currency: "USD" },
      categoryId: "revenue",
      reviewState: "reviewed",
    },
    {
      id: "txn_expense",
      teamId: "team_1",
      description: "Software",
      postedAt: "2026-06-11T00:00:00.000Z",
      money: { amountMinor: -125_00, currency: "USD" },
      categoryId: "software",
      reviewState: "reviewed",
    },
  ];
  repository.invoices = [invoiceFixture()];
  repository.projects = [
    {
      id: "project_1",
      teamId: "team_1",
      customerId: "customer_1",
      name: "Website rebuild",
      status: "active",
      billableRate: { amountMinor: 150_00, currency: "USD" },
      createdByActorId: "user_1",
    },
  ];
  repository.timeEntries = [
    {
      id: "time_1",
      teamId: "team_1",
      projectId: "project_1",
      actorId: "user_1",
      description: "Design review",
      occurredOn: "2026-06-12T00:00:00.000Z",
      durationMinutes: 90,
      billableStatus: "billable",
      billableRate: { amountMinor: 150_00, currency: "USD" },
    },
  ];
  repository.inboxItems = [
    {
      id: "inbox_1",
      teamId: "team_1",
      sourceId: "source_1",
      sourceType: "document_upload",
      documentId: "doc_1",
      documentVersionId: "version_1",
      status: "needs_review",
      extractionStatus: "pending",
      createdByActorId: "user_1",
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
      matchSuggestions: [
        {
          id: "match_1",
          teamId: "team_1",
          inboxItemId: "inbox_1",
          transactionId: "txn_expense",
          score: 900,
          confidence: "high",
          explanation: ["Amount matches"],
          status: "suggested",
          createdAt: "2026-06-12T00:00:00.000Z",
          updatedAt: "2026-06-12T00:00:00.000Z",
        },
      ],
    },
  ];
  return repository;
}

function invoiceFixture(): InvoiceDraft {
  return {
    id: "invoice_1",
    teamId: "team_1",
    customerId: "customer_1",
    invoiceNumber: "INV-001",
    status: "sent",
    issueDate: "2026-06-12T00:00:00.000Z",
    dueDate: "2026-06-20T00:00:00.000Z",
    currency: "USD",
    discountBasisPoints: 0,
    lines: [],
    totals: {
      subtotal: { amountMinor: 800_00, currency: "USD" },
      discount: { amountMinor: 0, currency: "USD" },
      tax: { amountMinor: 200_00, currency: "USD" },
      total: { amountMinor: 1000_00, currency: "USD" },
    },
    amountPaid: { amountMinor: 250_00, currency: "USD" },
    createdByActorId: "user_1",
  };
}
