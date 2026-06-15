import type {
  AssistantToolRisk,
  BusinessInsightSeverity,
  BusinessReport,
  Permission,
  ReportSourceRef,
} from "@dawn/domain";
import { z } from "zod";

export type AssistantToolName =
  | "search_transactions"
  | "list_open_invoices"
  | "search_documents"
  | "list_customers"
  | "list_projects"
  | "get_report_overview"
  | "suggest_transaction_category"
  | "suggest_inbox_match"
  | "suggest_invoice_email_copy";

export type AssistantToolDefinition = {
  name: AssistantToolName;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  requiredPermission: Permission;
  risk: AssistantToolRisk;
  approvalRequired: boolean;
  mutatesState: boolean;
};

export type AssistantToolResult = {
  toolName: AssistantToolName;
  risk: AssistantToolRisk;
  status: "completed" | "refused";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  sourceRefs: ReportSourceRef[];
};

export type AssistantResponseInput = {
  question: string;
  toolResults: AssistantToolResult[];
};

export type AssistantResponse = {
  content: string;
  sourceRefs: ReportSourceRef[];
};

export type AssistantResponseProvider = {
  provider: "mock-assistant";
  generateResponse(input: AssistantResponseInput): Promise<AssistantResponse>;
};

const optionalQuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
});

export const assistantToolRegistry = {
  search_transactions: {
    name: "search_transactions",
    description: "Search team-scoped ledger transactions.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "transactions.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  list_open_invoices: {
    name: "list_open_invoices",
    description: "List unpaid team invoices.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "invoices.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  search_documents: {
    name: "search_documents",
    description: "Search team-scoped documents and inbox extraction summaries.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "documents.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  list_customers: {
    name: "list_customers",
    description: "List customers and contacts.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "invoices.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  list_projects: {
    name: "list_projects",
    description: "List projects and time-tracking summaries.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "projects.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  get_report_overview: {
    name: "get_report_overview",
    description: "Read the current business reporting overview and weekly insights.",
    inputSchema: z.object({
      from: z.string().datetime().nullable().optional(),
      to: z.string().datetime().nullable().optional(),
    }),
    requiredPermission: "transactions.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
  },
  suggest_transaction_category: {
    name: "suggest_transaction_category",
    description: "Suggest likely transaction categories without applying them.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "transactions.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
  },
  suggest_inbox_match: {
    name: "suggest_inbox_match",
    description: "Suggest likely inbox-to-transaction matches without accepting them.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "documents.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
  },
  suggest_invoice_email_copy: {
    name: "suggest_invoice_email_copy",
    description: "Draft invoice email copy without sending it.",
    inputSchema: optionalQuerySchema,
    requiredPermission: "invoices.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
  },
} satisfies Record<AssistantToolName, AssistantToolDefinition>;

export const assistantTools = Object.values(assistantToolRegistry);

export function getAssistantTool(name: AssistantToolName) {
  return assistantToolRegistry[name];
}

export function planAssistantTools(question: string): AssistantToolName[] {
  const normalized = question.toLowerCase();
  const planned = new Set<AssistantToolName>();

  if (matchesAny(normalized, ["cashflow", "profit", "revenue", "expense", "report", "insight"])) {
    planned.add("get_report_overview");
  }

  if (matchesAny(normalized, ["transaction", "payment", "spend", "expense", "category"])) {
    planned.add("search_transactions");
  }

  if (matchesAny(normalized, ["invoice", "unpaid", "overdue", "email copy", "send email"])) {
    planned.add("list_open_invoices");
  }

  if (matchesAny(normalized, ["document", "receipt", "inbox", "extraction", "match"])) {
    planned.add("search_documents");
  }

  if (matchesAny(normalized, ["customer", "client"])) {
    planned.add("list_customers");
  }

  if (matchesAny(normalized, ["project", "time", "utilization", "billable"])) {
    planned.add("list_projects");
  }

  if (matchesAny(normalized, ["suggest category", "categorize", "category suggestion"])) {
    planned.add("suggest_transaction_category");
  }

  if (matchesAny(normalized, ["suggest match", "match inbox", "match receipt"])) {
    planned.add("suggest_inbox_match");
  }

  if (matchesAny(normalized, ["invoice email", "email copy", "follow up"])) {
    planned.add("suggest_invoice_email_copy");
  }

  if (planned.size === 0) {
    planned.add("get_report_overview");
    planned.add("search_transactions");
    planned.add("list_open_invoices");
  }

  return [...planned];
}

export function createMockAssistantResponseProvider(): AssistantResponseProvider {
  return {
    provider: "mock-assistant",
    async generateResponse(input) {
      const completed = input.toolResults.filter((result) => result.status === "completed");
      const refused = input.toolResults.filter((result) => result.status === "refused");
      const sourceRefs = dedupeSources(completed.flatMap((result) => result.sourceRefs));
      const lines = completed.map(formatToolSummary).filter(Boolean);

      if (refused.length > 0 && completed.length === 0) {
        return {
          content: `I could not answer that with your current permissions. Refused tools: ${refused
            .map((result) => result.toolName)
            .join(", ")}.`,
          sourceRefs: [],
        };
      }

      return {
        content:
          lines.length > 0
            ? lines.join("\n")
            : "I checked the available business records and did not find matching records.",
        sourceRefs,
      };
    },
  };
}

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

function matchesAny(value: string, needles: readonly string[]) {
  return needles.some((needle) => value.includes(needle));
}

function formatToolSummary(result: AssistantToolResult) {
  const summary = typeof result.output.summary === "string" ? result.output.summary : null;

  if (summary) {
    return summary;
  }

  return `${result.toolName} returned ${result.sourceRefs.length} cited sources.`;
}

function dedupeSources(sources: readonly ReportSourceRef[]) {
  const seen = new Set<string>();
  const deduped: ReportSourceRef[] = [];

  for (const source of sources) {
    const key = `${source.type}:${source.id}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(source);
    }
  }

  return deduped.slice(0, 10);
}
