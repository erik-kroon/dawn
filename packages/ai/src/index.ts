import type { BusinessInsightSeverity, BusinessReport, ReportSourceRef } from "@dawn/domain";

export type InsightDraft = {
  title: string;
  summary: string;
  severity: BusinessInsightSeverity;
  sourceRefs: ReportSourceRef[];
};

export type WeeklyInsightGenerationInput = {
  teamId: string;
  periodStart: string;
  periodEnd: string;
  report: BusinessReport;
};

export type InsightGenerationProvider = {
  provider: "mock-insights";
  generateWeeklyInsights(input: WeeklyInsightGenerationInput): Promise<InsightDraft[]>;
};

export function createMockInsightGenerationProvider(): InsightGenerationProvider {
  return {
    provider: "mock-insights",
    async generateWeeklyInsights(input) {
      const insights: InsightDraft[] = [];

      if (input.report.cashflow.amountMinor < 0) {
        insights.push({
          title: "Cashflow was negative",
          summary: `Cashflow ended at ${input.report.cashflow.amountMinor} ${input.report.currency} for the period.`,
          severity: "warning",
          sourceRefs: sourceRefsFromBuckets(input.report.expensesByCategory).slice(0, 5),
        });
      }

      if (input.report.unpaidInvoices.length > 0) {
        insights.push({
          title: "Unpaid invoices need follow-up",
          summary: `${input.report.unpaidInvoices.length} invoices remain unpaid in this reporting window.`,
          severity: "info",
          sourceRefs: input.report.unpaidInvoices.flatMap((invoice) => invoice.sources).slice(0, 5),
        });
      }

      if (input.report.inboxBacklog.needsReview + input.report.inboxBacklog.pendingExtraction > 0) {
        insights.push({
          title: "Inbox backlog is building",
          summary: `${input.report.inboxBacklog.needsReview} inbox items need review and ${input.report.inboxBacklog.pendingExtraction} are pending extraction.`,
          severity: "info",
          sourceRefs: input.report.inboxBacklog.sources.slice(0, 5),
        });
      }

      if (insights.length === 0) {
        insights.push({
          title: "Business health is steady",
          summary: "No critical cashflow, invoice, or inbox backlog changes were detected.",
          severity: "info",
          sourceRefs: [],
        });
      }

      return insights;
    },
  };
}

function sourceRefsFromBuckets(
  buckets: readonly { sources: readonly ReportSourceRef[] }[],
): ReportSourceRef[] {
  return buckets.flatMap((bucket) => [...bucket.sources]);
}
