import type { Money } from "./money";
import type { TimeEntryReport } from "./projects";
import type { ReportTotals } from "./transactions";

export type ReportSourceType =
  | "transaction"
  | "invoice"
  | "document"
  | "customer"
  | "product"
  | "project"
  | "time_entry"
  | "inbox_item";

export type ReportSourceRef = {
  type: ReportSourceType;
  id: string;
  label: string;
};

export type MoneyReportBucket = {
  id: string;
  label: string;
  amount: Money;
  sources: ReportSourceRef[];
};

export type UnpaidInvoiceReportItem = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amountDue: Money;
  dueDate?: string | null;
  sources: ReportSourceRef[];
};

export type InboxBacklogReport = {
  pendingExtraction: number;
  needsReview: number;
  suggestedMatches: number;
  sources: ReportSourceRef[];
};

export type BusinessReport = {
  teamId: string;
  currency: string;
  range: {
    from?: string | null;
    to?: string | null;
  };
  totals: ReportTotals;
  cashflow: Money;
  revenueByCustomer: MoneyReportBucket[];
  expensesByCategory: MoneyReportBucket[];
  unpaidInvoices: UnpaidInvoiceReportItem[];
  taxSummary: {
    invoiceTax: Money;
    sources: ReportSourceRef[];
  };
  timeUtilization: TimeEntryReport;
  inboxBacklog: InboxBacklogReport;
};

export type BusinessInsightSeverity = "info" | "warning" | "critical";

export type BusinessInsight = {
  id: string;
  teamId: string;
  title: string;
  summary: string;
  severity: BusinessInsightSeverity;
  periodStart: string;
  periodEnd: string;
  sourceRefs: ReportSourceRef[];
  createdAt: string;
};
