import { describe, expect, test } from "bun:test";

import {
  assistantTools,
  createMockAssistantResponseProvider,
  createMockInsightGenerationProvider,
  getAssistantTool,
  planAssistantTools,
} from "./index";
import type { BusinessReport } from "@dawn/domain";

const report: BusinessReport = {
  teamId: "team_1",
  currency: "USD",
  range: {
    from: "2026-06-08T00:00:00.000Z",
    to: "2026-06-15T00:00:00.000Z",
  },
  totals: {
    revenue: { amountMinor: 100_00, currency: "USD" },
    expenses: { amountMinor: -250_00, currency: "USD" },
    profit: { amountMinor: -150_00, currency: "USD" },
    balance: { amountMinor: -150_00, currency: "USD" },
    categoryTotals: {},
  },
  cashflow: { amountMinor: -150_00, currency: "USD" },
  revenueByCustomer: [],
  expensesByCategory: [
    {
      id: "cat_software",
      label: "Software",
      amount: { amountMinor: -250_00, currency: "USD" },
      sources: [{ type: "transaction", id: "txn_1", label: "Figma" }],
    },
  ],
  unpaidInvoices: [
    {
      invoiceId: "invoice_1",
      invoiceNumber: "INV-001",
      customerId: "customer_1",
      customerName: "Acme Co",
      amountDue: { amountMinor: 500_00, currency: "USD" },
      dueDate: "2026-06-15T00:00:00.000Z",
      sources: [{ type: "invoice", id: "invoice_1", label: "INV-001" }],
    },
  ],
  taxSummary: {
    invoiceTax: { amountMinor: 50_00, currency: "USD" },
    sources: [{ type: "invoice", id: "invoice_1", label: "INV-001" }],
  },
  timeUtilization: {
    totalMinutes: 120,
    billableMinutes: 90,
    nonBillableMinutes: 30,
    invoicedMinutes: 0,
    billableValue: { amountMinor: 225_00, currency: "USD" },
    utilizationBasisPoints: 7_500,
  },
  inboxBacklog: {
    pendingExtraction: 1,
    needsReview: 2,
    suggestedMatches: 1,
    sources: [{ type: "inbox_item", id: "inbox_1", label: "receipt.pdf" }],
  },
};

describe("mock insight generation provider", () => {
  test("generates source-cited weekly insights from report data", async () => {
    const provider = createMockInsightGenerationProvider();
    const insights = await provider.generateWeeklyInsights({
      teamId: "team_1",
      periodStart: "2026-06-08T00:00:00.000Z",
      periodEnd: "2026-06-15T00:00:00.000Z",
      report,
    });

    expect(insights.map((insight) => insight.title)).toEqual([
      "Cashflow was negative",
      "Unpaid invoices need follow-up",
      "Inbox backlog is building",
    ]);
    expect(insights[0]?.sourceRefs).toEqual([{ type: "transaction", id: "txn_1", label: "Figma" }]);
  });
});

describe("assistant tool registry", () => {
  test("defines permissioned tools with approval, audit, and rate-limit metadata", () => {
    expect(assistantTools.length).toBeGreaterThanOrEqual(12);
    expect(
      assistantTools.every((tool) => tool.auditEvent && tool.rateLimitPolicy && tool.outputSchema),
    ).toBe(true);
    expect(
      assistantTools
        .filter((tool) => tool.risk === "read" || tool.risk === "suggest")
        .every((tool) => tool.approvalRequired === false && tool.mutatesState === false),
    ).toBe(true);
    expect(getAssistantTool("search_transactions")).toMatchObject({
      requiredPermission: "transactions.read",
      risk: "read",
    });
    expect(getAssistantTool("suggest_invoice_email_copy")).toMatchObject({
      requiredPermission: "invoices.read",
      risk: "suggest",
    });
    expect(getAssistantTool("create_invoice_draft")).toMatchObject({
      requiredPermission: "invoices.write",
      risk: "draft",
      approvalRequired: true,
      mutatesState: true,
      rateLimitPolicy: "mutation",
    });
    expect(getAssistantTool("send_invoice")).toMatchObject({
      requiredPermission: "invoices.send",
      risk: "external_side_effect",
      approvalRequired: true,
      rateLimitPolicy: "external_side_effect",
    });
  });

  test("validates tool inputs through schemas", () => {
    expect(
      getAssistantTool("search_transactions").inputSchema.parse({ query: "cashflow" }),
    ).toEqual({
      query: "cashflow",
    });
    expect(() =>
      getAssistantTool("get_report_overview").inputSchema.parse({ from: "not-a-date" }),
    ).toThrow();
    expect(
      getAssistantTool("create_invoice_draft").inputSchema.parse({
        customerId: "customer_1",
        productId: "product_1",
      }),
    ).toEqual({ customerId: "customer_1", productId: "product_1" });
  });

  test("plans grounded tools from natural language questions", () => {
    expect(planAssistantTools("Explain cashflow and unpaid invoices")).toEqual([
      "get_report_overview",
      "list_open_invoices",
    ]);
    expect(planAssistantTools("Suggest invoice email copy")).toContain(
      "suggest_invoice_email_copy",
    );
    expect(planAssistantTools("Draft invoice for Acme")).toContain("create_invoice_draft");
    expect(planAssistantTools("Send invoice")).toContain("send_invoice");
  });

  test("mock assistant response cites completed tool sources and refuses without permissions", async () => {
    const provider = createMockAssistantResponseProvider();
    const response = await provider.generateResponse({
      question: "Explain cashflow",
      toolResults: [
        {
          toolName: "get_report_overview",
          risk: "read",
          status: "completed",
          input: {},
          output: { summary: "Cashflow is positive." },
          sourceRefs: [{ type: "transaction", id: "txn_1", label: "Client payment" }],
        },
      ],
    });
    const refused = await provider.generateResponse({
      question: "Explain documents",
      toolResults: [
        {
          toolName: "search_documents",
          risk: "read",
          status: "refused",
          input: {},
          output: { summary: "Permission documents.read is required." },
          sourceRefs: [],
        },
      ],
    });

    expect(response.sourceRefs).toEqual([
      { type: "transaction", id: "txn_1", label: "Client payment" },
    ]);
    expect(refused.content).toContain("current permissions");
  });
});
