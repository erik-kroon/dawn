import { describe, expect, test } from "bun:test";

import { createMockInsightGenerationProvider } from "./index";
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
