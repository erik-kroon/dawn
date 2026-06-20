import type {
  AssistantToolRisk,
  BusinessInsightSeverity,
  BusinessReport,
  CsvTransactionColumnMapping,
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
  | "suggest_invoice_email_copy"
  | "create_invoice_draft"
  | "categorize_transaction"
  | "send_invoice";

export type AssistantToolDefinition = {
  name: AssistantToolName;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<Record<string, unknown>>;
  requiredPermission: Permission;
  risk: AssistantToolRisk;
  approvalRequired: boolean;
  mutatesState: boolean;
  auditEvent: string;
  rateLimitPolicy: "standard" | "mutation" | "external_side_effect";
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
const genericOutputSchema = z.record(z.string(), z.unknown());
const createInvoiceDraftInputSchema = z.object({
  customerId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1).max(80).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  quantityMilli: z.number().int().positive().optional(),
});
const categorizeTransactionInputSchema = z.object({
  transactionId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
});
const sendInvoiceInputSchema = z.object({
  invoiceId: z.string().min(1).optional(),
  toEmail: z.string().email().nullable().optional(),
  subject: z.string().trim().min(1).max(200).nullable().optional(),
  message: z.string().trim().min(1).max(2_000).nullable().optional(),
});

export const assistantToolRegistry = {
  search_transactions: {
    name: "search_transactions",
    description: "Search team-scoped ledger transactions.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "transactions.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.search_transactions",
    rateLimitPolicy: "standard",
  },
  list_open_invoices: {
    name: "list_open_invoices",
    description: "List unpaid team invoices.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "invoices.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.list_open_invoices",
    rateLimitPolicy: "standard",
  },
  search_documents: {
    name: "search_documents",
    description: "Search team-scoped documents and inbox extraction summaries.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "documents.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.search_documents",
    rateLimitPolicy: "standard",
  },
  list_customers: {
    name: "list_customers",
    description: "List customers and contacts.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "invoices.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.list_customers",
    rateLimitPolicy: "standard",
  },
  list_projects: {
    name: "list_projects",
    description: "List projects and time-tracking summaries.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "projects.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.list_projects",
    rateLimitPolicy: "standard",
  },
  get_report_overview: {
    name: "get_report_overview",
    description: "Read the current business reporting overview and weekly insights.",
    inputSchema: z.object({
      from: z.string().datetime().nullable().optional(),
      to: z.string().datetime().nullable().optional(),
    }),
    outputSchema: genericOutputSchema,
    requiredPermission: "transactions.read",
    risk: "read",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.get_report_overview",
    rateLimitPolicy: "standard",
  },
  suggest_transaction_category: {
    name: "suggest_transaction_category",
    description: "Suggest likely transaction categories without applying them.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "transactions.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.suggest_transaction_category",
    rateLimitPolicy: "standard",
  },
  suggest_inbox_match: {
    name: "suggest_inbox_match",
    description: "Suggest likely inbox-to-transaction matches without accepting them.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "documents.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.suggest_inbox_match",
    rateLimitPolicy: "standard",
  },
  suggest_invoice_email_copy: {
    name: "suggest_invoice_email_copy",
    description: "Draft invoice email copy without sending it.",
    inputSchema: optionalQuerySchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "invoices.read",
    risk: "suggest",
    approvalRequired: false,
    mutatesState: false,
    auditEvent: "assistant.tool.suggest_invoice_email_copy",
    rateLimitPolicy: "standard",
  },
  create_invoice_draft: {
    name: "create_invoice_draft",
    description: "Prepare an editable draft invoice through an approval-gated app use case.",
    inputSchema: createInvoiceDraftInputSchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "invoices.write",
    risk: "draft",
    approvalRequired: true,
    mutatesState: true,
    auditEvent: "assistant.action.create_invoice_draft",
    rateLimitPolicy: "mutation",
  },
  categorize_transaction: {
    name: "categorize_transaction",
    description: "Categorize and review a transaction after explicit approval.",
    inputSchema: categorizeTransactionInputSchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "transactions.categorize",
    risk: "mutate",
    approvalRequired: true,
    mutatesState: true,
    auditEvent: "assistant.action.categorize_transaction",
    rateLimitPolicy: "mutation",
  },
  send_invoice: {
    name: "send_invoice",
    description:
      "Send an invoice through the configured delivery provider after explicit confirmation.",
    inputSchema: sendInvoiceInputSchema,
    outputSchema: genericOutputSchema,
    requiredPermission: "invoices.send",
    risk: "external_side_effect",
    approvalRequired: true,
    mutatesState: true,
    auditEvent: "assistant.action.send_invoice",
    rateLimitPolicy: "external_side_effect",
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

  if (matchesAny(normalized, ["draft invoice", "create invoice draft", "invoice draft"])) {
    planned.add("create_invoice_draft");
  }

  if (matchesAny(normalized, ["apply category", "categorize transaction", "review transaction"])) {
    planned.add("categorize_transaction");
  }

  if (matchesAny(normalized, ["send invoice", "email invoice", "deliver invoice"])) {
    planned.add("send_invoice");
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

export type CsvTransactionMappingSuggestionInput = {
  headers: string[];
  sampleRows: Record<string, string>[];
  detectedMapping: CsvTransactionColumnMapping;
  prompt: string;
};

export type CsvTransactionMappingSuggestionProvider = {
  provider: string;
  suggestCsvTransactionMapping(
    input: CsvTransactionMappingSuggestionInput,
  ): Promise<Partial<CsvTransactionColumnMapping> | null>;
};

const csvTransactionMappingFields = [
  "postedAt",
  "description",
  "amount",
  "debit",
  "credit",
  "currency",
  "balance",
] as const;

export function buildCsvTransactionMappingPrompt(input: {
  headers: readonly string[];
  sampleRows: readonly Record<string, string>[];
  detectedMapping: CsvTransactionColumnMapping;
}) {
  const headers = normalizeCsvMappingHeaders(input.headers);
  const sampleRows = compactCsvMappingSampleRows(input.sampleRows, headers);
  const columnList = headers.map((header) => `<column>${header}</column>`).join("\n");
  const sampleRowList = sampleRows.map((row) => JSON.stringify(row)).join("\n") || "(none)";

  return [
    "<role>",
    "You map bank transaction CSV columns to Dawn's canonical import schema.",
    "</role>",
    "",
    "<task>",
    `Map CSV columns to: ${csvTransactionMappingFields.join(", ")}.`,
    "</task>",
    "",
    "<rules>",
    "1) Return only exact CSV column names for mapped fields.",
    "2) If no matching column exists, omit that field.",
    "3) Never invent column names.",
    "4) postedAt is the booked, posted, transaction, or value date used for ledger ordering.",
    "5) description is the transaction memo, merchant, reference, counterparty text, or narrative used as the transaction label.",
    "6) Use amount only when one column already contains signed transaction amounts.",
    "7) Use debit and credit when money movement is split across two amount columns.",
    "8) debit is money leaving the account; credit is money entering the account.",
    "9) balance is a running account balance column, not the transaction amount.",
    "10) currency is a currency-code column only; omit it when currency comes from the selected account.",
    "</rules>",
    "",
    "<deterministic_guess>",
    JSON.stringify(input.detectedMapping),
    "</deterministic_guess>",
    "",
    "<csv_columns>",
    columnList,
    "</csv_columns>",
    "",
    "<sample_rows>",
    sampleRowList,
    "</sample_rows>",
    "",
    "<output_contract>",
    "Return only a JSON object with canonical field names and exact CSV column names.",
    "</output_contract>",
  ].join("\n");
}

export function normalizeCsvMappingHeaders(headers: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const header of headers) {
    const trimmed = header.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function compactCsvMappingSampleRows(
  rows: readonly Record<string, string>[],
  headers: readonly string[],
) {
  const allowedHeaders = new Set(headers);

  return rows.slice(0, 5).map((row) => {
    const compact: Record<string, string> = {};

    for (const [key, value] of Object.entries(row)) {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();

      if (!trimmedKey || !trimmedValue || !allowedHeaders.has(trimmedKey)) {
        continue;
      }

      compact[trimmedKey] =
        trimmedValue.length > 80 ? `${trimmedValue.slice(0, 80)}...` : trimmedValue;
    }

    return compact;
  });
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
