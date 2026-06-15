export type Actor = {
  id: string;
  type: "user" | "api_key" | "oauth_app" | "system" | "assistant" | "provider_webhook";
  email?: string;
  teamId?: string;
  permissions?: readonly Permission[];
};

export type TeamRole = "owner" | "admin" | "member" | "accountant" | "viewer";

export type Permission =
  | "transactions.read"
  | "transactions.write"
  | "transactions.categorize"
  | "documents.read"
  | "documents.write"
  | "projects.read"
  | "projects.write"
  | "invoices.read"
  | "invoices.write"
  | "invoices.send"
  | "bank_connections.manage"
  | "team.manage"
  | "settings.billing"
  | "api_keys.manage"
  | "integrations.read"
  | "integrations.write"
  | "assistant.use"
  | "assistant.mutate"
  | "automations.read"
  | "automations.write"
  | "automations.run"
  | "operations.read"
  | "webhooks.manage";

export type PublicApiScope =
  | "transactions.read"
  | "transactions.write"
  | "invoices.read"
  | "invoices.write"
  | "webhooks.manage";

export type Team = {
  id: string;
  name: string;
};

export type TeamMembership = {
  teamId: string;
  userId: string;
  role: TeamRole;
};

export type TeamMember = TeamMembership & {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type TeamInvite = {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  invitedByActorId: string;
  expiresAt: string;
};

export type Money = {
  amountMinor: number;
  currency: string;
};

export type TransactionType = "income" | "expense" | "transfer" | "fee" | "refund" | "adjustment";

export type TransactionSource = "manual" | "csv_import" | "bank_sync" | "provider_webhook";

export type TransactionReviewState = "needs_review" | "reviewed";

export type Transaction = {
  id: string;
  teamId: string;
  accountId?: string | null;
  description: string;
  postedAt: string;
  money: Money;
  type?: TransactionType;
  source?: TransactionSource;
  counterpartyId?: string | null;
  transferGroupId?: string | null;
  providerTransactionId?: string | null;
  categoryId: string | null;
  reviewState: TransactionReviewState;
  duplicateKey?: string | null;
  updatedAt?: string | null;
};

export type Category = {
  id: string;
  teamId: string;
  name: string;
};

export type LedgerAccount = {
  id: string;
  teamId: string;
  name: string;
  currency: string;
  type: "bank" | "cash" | "credit_card" | "loan" | "other";
};

export type Counterparty = {
  id: string;
  teamId: string;
  name: string;
};

export type TransactionTag = {
  id: string;
  teamId: string;
  name: string;
};

export type TransactionSplit = {
  id: string;
  transactionId: string;
  categoryId: string | null;
  money: Money;
  note?: string | null;
};

export type LedgerTransactionDraft = {
  teamId: string;
  accountId: string;
  description: string;
  postedAt: string;
  money: Money;
  type: TransactionType;
  source: TransactionSource;
  categoryId?: string | null;
  counterpartyId?: string | null;
  transferGroupId?: string | null;
  providerTransactionId?: string | null;
  splits?: readonly Omit<TransactionSplit, "id" | "transactionId">[];
  tagIds?: readonly string[];
};

export type CsvTransactionColumnMapping = {
  postedAt: string;
  description: string;
  amount: string;
  currency?: string | null;
};

export type CsvTransactionImportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ReportTotals = {
  revenue: Money;
  expenses: Money;
  profit: Money;
  balance: Money;
  categoryTotals: Record<string, Money>;
};

export type AuditEvent = {
  id: string;
  teamId: string;
  actorId: string;
  action: "transaction.reviewed";
  entityType: "transaction";
  entityId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type OutboxEvent = {
  id: string;
  teamId: string;
  type: "transaction.reviewed";
  version: 1;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type TransactionReviewChange = {
  transaction: Transaction;
  auditMetadata: {
    previousCategoryId: string | null;
    nextCategoryId: string;
    previousReviewState: TransactionReviewState;
    nextReviewState: TransactionReviewState;
  };
  outboxPayload: {
    transactionId: string;
    categoryId: string;
    previousCategoryId: string | null;
    previousReviewState: TransactionReviewState;
    nextReviewState: TransactionReviewState;
  };
};

export type Customer = {
  id: string;
  teamId: string;
  name: string;
  email?: string | null;
  billingAddress?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CustomerContact = {
  id: string;
  teamId: string;
  customerId: string;
  name: string;
  email: string;
  role?: string | null;
  createdAt?: string | null;
};

export type ProductType = "product" | "service";

export type Product = {
  id: string;
  teamId: string;
  name: string;
  type: ProductType;
  description?: string | null;
  unitPrice: Money;
  defaultTaxRateBasisPoints: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type InvoiceStatus =
  | "draft"
  | "scheduled"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceEventType =
  | "invoice.created"
  | "invoice.updated"
  | "invoice.sent"
  | "invoice.viewed"
  | "invoice.payment_recorded"
  | "invoice.overdue"
  | "invoice.voided"
  | "recurring_invoice.generated";

export type InvoicePayment = {
  id: string;
  teamId: string;
  invoiceId: string;
  amount: Money;
  paidAt: string;
  method?: string | null;
  note?: string | null;
  createdByActorId: string;
  createdAt?: string | null;
};

export type InvoiceEvent = {
  id: string;
  teamId: string;
  invoiceId: string;
  type: InvoiceEventType;
  occurredAt: string;
  actorId?: string | null;
  metadata: Record<string, unknown>;
};

export type RecurringInvoiceFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringInvoiceScheduleStatus = "active" | "paused";

export type RecurringInvoiceSchedule = {
  id: string;
  teamId: string;
  sourceInvoiceId: string;
  customerId: string;
  frequency: RecurringInvoiceFrequency;
  nextRunAt: string;
  status: RecurringInvoiceScheduleStatus;
  createdByActorId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type InvoiceLineDraft = {
  productId?: string | null;
  description: string;
  quantityMilli: number;
  unitPrice: Money;
  discountBasisPoints?: number | null;
  taxRateBasisPoints?: number | null;
};

export type InvoiceLine = InvoiceLineDraft & {
  id: string;
  invoiceId: string;
  sortOrder: number;
  totals: InvoiceLineTotals;
};

export type InvoiceLineTotals = {
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
};

export type InvoiceTotals = {
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
};

export type InvoiceDraft = {
  id: string;
  teamId: string;
  customerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  discountBasisPoints: number;
  notes?: string | null;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  amountPaid: Money;
  sentAt?: string | null;
  viewedAt?: string | null;
  paidAt?: string | null;
  overdueAt?: string | null;
  voidedAt?: string | null;
  deliveryToEmail?: string | null;
  deliveryProviderMessageId?: string | null;
  createdByActorId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type InvoiceDraftInput = {
  teamId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  discountBasisPoints?: number | null;
  notes?: string | null;
  lines: readonly InvoiceLineDraft[];
};

export type ProjectStatus = "active" | "archived";

export type BillableStatus = "billable" | "non_billable" | "invoiced";

export type Project = {
  id: string;
  teamId: string;
  customerId: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  billableRate: Money;
  createdByActorId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectMember = {
  id: string;
  teamId: string;
  projectId: string;
  actorId: string;
  role: "manager" | "contributor";
  billableRate?: Money | null;
  createdAt?: string | null;
};

export type TimeEntry = {
  id: string;
  teamId: string;
  projectId: string;
  actorId: string;
  description: string;
  occurredOn: string;
  durationMinutes: number;
  billableStatus: BillableStatus;
  billableRate?: Money | null;
  invoiceId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectInput = {
  teamId: string;
  customerId: string;
  name: string;
  description?: string | null;
  billableRate: Money;
};

export type TimeEntryInput = {
  teamId: string;
  projectId: string;
  actorId: string;
  description: string;
  occurredOn: string;
  durationMinutes: number;
  billableStatus: Exclude<BillableStatus, "invoiced">;
  billableRate?: Money | null;
};

export type TimeEntryReport = {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  invoicedMinutes: number;
  billableValue: Money;
  utilizationBasisPoints: number;
};

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

export type AssistantMessageRole = "user" | "assistant";

export type AssistantToolRisk = "read" | "suggest" | "draft" | "mutate" | "external_side_effect";

export type AssistantToolCallStatus = "completed" | "refused";

export type AssistantActionApprovalStatus = "pending" | "approved" | "rejected" | "executed";

export type AssistantThread = {
  id: string;
  teamId: string;
  title: string;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessage = {
  id: string;
  threadId: string;
  teamId: string;
  role: AssistantMessageRole;
  content: string;
  sourceRefs: ReportSourceRef[];
  createdAt: string;
};

export type AssistantToolCall = {
  id: string;
  threadId: string;
  messageId: string;
  teamId: string;
  toolName: string;
  risk: AssistantToolRisk;
  status: AssistantToolCallStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  sourceRefs: ReportSourceRef[];
  createdAt: string;
};

export type AssistantActionApproval = {
  id: string;
  threadId: string;
  requestedByMessageId: string;
  teamId: string;
  toolName: string;
  risk: AssistantToolRisk;
  status: AssistantActionApprovalStatus;
  input: Record<string, unknown>;
  preview: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  sourceRefs: ReportSourceRef[];
  requestedByActorId: string;
  approvedByActorId?: string | null;
  rejectedByActorId?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  executedAt?: string | null;
};

export type AutomationTriggerType = "outbox_event";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  eventType: string;
};

export type AutomationActionType =
  | "categorize_transaction"
  | "create_notification"
  | "create_invoice_draft"
  | "request_accounting_export";

export type AutomationApprovalPolicy = "require_approval" | "auto_approve";

export type AutomationRule = {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  approvalPolicy: AutomationApprovalPolicy;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRunStatus = "succeeded" | "failed" | "approval_required" | "skipped";

export type AutomationRun = {
  id: string;
  teamId: string;
  ruleId: string;
  sourceOutboxEventId: string;
  status: AutomationRunStatus;
  actionType: AutomationActionType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
};

export type ApiKey = {
  id: string;
  teamId: string;
  name: string;
  keyPrefix: string;
  scopes: PublicApiScope[];
  createdByActorId: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type OAuthApp = {
  id: string;
  teamId: string;
  name: string;
  redirectUris: string[];
  scopes: PublicApiScope[];
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type OAuthGrant = {
  id: string;
  teamId: string;
  appId: string;
  actorId: string;
  scopes: PublicApiScope[];
  revokedAt?: string | null;
  createdAt: string;
};

export type WebhookSubscription = {
  id: string;
  teamId: string;
  url: string;
  eventTypes: string[];
  status: "active" | "disabled";
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type WebhookDelivery = {
  id: string;
  teamId: string;
  subscriptionId: string;
  outboxEventId: string;
  status: WebhookDeliveryStatus;
  attempt: number;
  requestPayload: Record<string, unknown>;
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
  nextAttemptAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationCategory = "accounting" | "payments" | "messaging" | "email";

export type IntegrationConnectionStatus = "connected" | "disabled" | "error";

export type IntegrationConnection = {
  id: string;
  teamId: string;
  category: IntegrationCategory;
  provider: string;
  providerConnectionId: string;
  displayName: string;
  status: IntegrationConnectionStatus;
  capabilities: string[];
  tokenKeyId: string;
  tokenLastFour: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  disabledAt?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationSyncRunStatus = "running" | "completed" | "failed";

export type IntegrationSyncRun = {
  id: string;
  teamId: string;
  integrationConnectionId: string;
  category: IntegrationCategory;
  provider: string;
  status: IntegrationSyncRunStatus;
  startedAt: string;
  completedAt?: string | null;
  recordsSynced: number;
  error?: string | null;
  rawPayload: Record<string, unknown>;
};

export function automationActionPermission(actionType: AutomationActionType): Permission {
  if (actionType === "categorize_transaction") {
    return "transactions.categorize";
  }

  if (actionType === "create_invoice_draft") {
    return "invoices.write";
  }

  return "automations.run";
}

export function automationActionRisk(actionType: AutomationActionType): AssistantToolRisk {
  if (actionType === "create_notification") {
    return "draft";
  }

  if (actionType === "request_accounting_export") {
    return "external_side_effect";
  }

  return "mutate";
}

export function automationActionRequiresApproval(actionType: AutomationActionType) {
  return automationActionRisk(actionType) === "external_side_effect";
}

export function permissionForPublicApiScope(scope: PublicApiScope): Permission {
  if (scope === "transactions.write") {
    return "transactions.write";
  }

  if (scope === "invoices.read") {
    return "invoices.read";
  }

  if (scope === "invoices.write") {
    return "invoices.write";
  }

  if (scope === "webhooks.manage") {
    return "webhooks.manage";
  }

  return "transactions.read";
}

export function permissionsForPublicApiScopes(scopes: readonly PublicApiScope[]) {
  return scopes.map(permissionForPublicApiScope);
}

export type InboxMatchInput = {
  inboxItemId: string;
  documentId: string;
  sender?: string | null;
  documentText?: string | null;
  fields: {
    merchantName?: string | null;
    issuedAt?: string | null;
    invoiceNumber?: string | null;
    totalAmountMinor?: number | null;
    currency?: string | null;
  };
};

export type InboxMatchCandidate = {
  transaction: Transaction;
  counterpartyName?: string | null;
  providerReference?: string | null;
};

export type TeamMatchAlias = {
  source: string;
  target: string;
};

export type HardNegativeMatch = {
  inboxItemId: string;
  transactionId: string;
};

export type InboxMatchMemory = {
  aliases?: readonly TeamMatchAlias[];
  hardNegatives?: readonly HardNegativeMatch[];
};

export type InboxMatchConfidence = "low" | "medium" | "high";

export type InboxMatchSuggestion = {
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  signals: {
    amount?: number;
    currency?: number;
    date?: number;
    counterparty?: number;
    reference?: number;
    sender?: number;
    documentText?: number;
    alias?: number;
  };
};

export const rolePermissions: Record<TeamRole, readonly Permission[]> = {
  owner: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "settings.billing",
    "api_keys.manage",
    "integrations.read",
    "integrations.write",
    "assistant.use",
    "assistant.mutate",
    "automations.read",
    "automations.write",
    "automations.run",
    "operations.read",
    "webhooks.manage",
  ],
  admin: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "api_keys.manage",
    "integrations.read",
    "integrations.write",
    "assistant.use",
    "assistant.mutate",
    "automations.read",
    "automations.write",
    "automations.run",
    "operations.read",
    "webhooks.manage",
  ],
  member: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "integrations.read",
    "assistant.use",
    "automations.read",
  ],
  accountant: [
    "transactions.read",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "projects.read",
    "projects.write",
    "invoices.read",
    "invoices.write",
    "integrations.read",
    "integrations.write",
    "assistant.use",
    "automations.read",
    "automations.write",
    "automations.run",
  ],
  viewer: [
    "transactions.read",
    "documents.read",
    "projects.read",
    "invoices.read",
    "integrations.read",
    "assistant.use",
    "automations.read",
  ],
};

export function roleHasPermission(role: TeamRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function permissionsForRole(role: TeamRole) {
  return rolePermissions[role];
}

export function assertTeamRole(role: string): asserts role is TeamRole {
  if (!["owner", "admin", "member", "accountant", "viewer"].includes(role)) {
    throw new Error("Unknown team role");
  }
}

export function applyTransactionReview(
  transaction: Transaction,
  category: Category,
): TransactionReviewChange {
  if (transaction.teamId !== category.teamId) {
    throw new Error("Transaction category must belong to the transaction team");
  }

  const nextReviewState = "reviewed";

  return {
    transaction: {
      ...transaction,
      categoryId: category.id,
      reviewState: nextReviewState,
    },
    auditMetadata: {
      previousCategoryId: transaction.categoryId,
      nextCategoryId: category.id,
      previousReviewState: transaction.reviewState,
      nextReviewState,
    },
    outboxPayload: {
      transactionId: transaction.id,
      categoryId: category.id,
      previousCategoryId: transaction.categoryId,
      previousReviewState: transaction.reviewState,
      nextReviewState,
    },
  };
}

export function calculateInvoiceTotals(input: {
  currency: string;
  discountBasisPoints?: number | null;
  lines: readonly InvoiceLineDraft[];
}): { lines: InvoiceLineTotals[]; totals: InvoiceTotals } {
  assertCurrencyCode(input.currency);
  assertBasisPoints(input.discountBasisPoints ?? 0, "Invoice discount");

  if (input.lines.length === 0) {
    throw new Error("Invoice requires at least one line");
  }

  const normalizedLines = input.lines.map((line) =>
    normalizeInvoiceLineDraft(line, input.currency),
  );
  const subtotalMinor = normalizedLines.reduce(
    (total, line) =>
      total + multiplyMinorByQuantity(line.unitPrice.amountMinor, line.quantityMilli),
    0,
  );
  const lineDiscountMinor = normalizedLines.reduce(
    (total, line) =>
      total +
      roundBasisPoints(
        multiplyMinorByQuantity(line.unitPrice.amountMinor, line.quantityMilli),
        line.discountBasisPoints ?? 0,
      ),
    0,
  );
  const subtotalAfterLineDiscount = subtotalMinor - lineDiscountMinor;
  const invoiceDiscountMinor = roundBasisPoints(
    subtotalAfterLineDiscount,
    input.discountBasisPoints ?? 0,
  );
  let allocatedInvoiceDiscountMinor = 0;

  const lineTotals = normalizedLines.map((line, index) => {
    const lineSubtotalMinor = multiplyMinorByQuantity(
      line.unitPrice.amountMinor,
      line.quantityMilli,
    );
    const lineDiscountMinor = roundBasisPoints(lineSubtotalMinor, line.discountBasisPoints ?? 0);
    const lineNetMinor = lineSubtotalMinor - lineDiscountMinor;
    const invoiceDiscountShareMinor =
      index === normalizedLines.length - 1
        ? invoiceDiscountMinor - allocatedInvoiceDiscountMinor
        : subtotalAfterLineDiscount === 0
          ? 0
          : roundRatio(lineNetMinor, invoiceDiscountMinor, subtotalAfterLineDiscount);
    allocatedInvoiceDiscountMinor += invoiceDiscountShareMinor;
    const taxableBaseMinor = lineNetMinor - invoiceDiscountShareMinor;
    const taxMinor = roundBasisPoints(taxableBaseMinor, line.taxRateBasisPoints ?? 0);
    const discountMinor = lineDiscountMinor + invoiceDiscountShareMinor;

    return {
      subtotal: { amountMinor: lineSubtotalMinor, currency: input.currency },
      discount: { amountMinor: discountMinor, currency: input.currency },
      tax: { amountMinor: taxMinor, currency: input.currency },
      total: {
        amountMinor: taxableBaseMinor + taxMinor,
        currency: input.currency,
      },
    };
  });
  const discountMinor = lineDiscountMinor + invoiceDiscountMinor;
  const taxMinor = lineTotals.reduce((total, line) => total + line.tax.amountMinor, 0);
  const totalMinor = subtotalMinor - discountMinor + taxMinor;

  return {
    lines: lineTotals,
    totals: {
      subtotal: { amountMinor: subtotalMinor, currency: input.currency },
      discount: { amountMinor: discountMinor, currency: input.currency },
      tax: { amountMinor: taxMinor, currency: input.currency },
      total: { amountMinor: totalMinor, currency: input.currency },
    },
  };
}

export function assertInvoiceDraftInput(input: InvoiceDraftInput): void {
  if (!input.teamId.trim()) {
    throw new Error("Invoice team is required");
  }

  if (!input.customerId.trim()) {
    throw new Error("Invoice customer is required");
  }

  if (!input.invoiceNumber.trim()) {
    throw new Error("Invoice number is required");
  }

  const issueDate = new Date(input.issueDate);

  if (Number.isNaN(issueDate.getTime())) {
    throw new Error("Invoice issue date is invalid");
  }

  if (input.dueDate) {
    const dueDate = new Date(input.dueDate);

    if (Number.isNaN(dueDate.getTime())) {
      throw new Error("Invoice due date is invalid");
    }

    if (dueDate.getTime() < issueDate.getTime()) {
      throw new Error("Invoice due date cannot be before issue date");
    }
  }

  calculateInvoiceTotals({
    currency: input.currency,
    discountBasisPoints: input.discountBasisPoints ?? 0,
    lines: input.lines,
  });
}

export function assertCanEditInvoiceDraft(invoice: { status: InvoiceStatus }): void {
  if (invoice.status !== "draft") {
    throw new Error("Only draft invoices can be edited");
  }
}

export function assertCanSendInvoice(invoice: { status: InvoiceStatus; totals: InvoiceTotals }) {
  if (invoice.status !== "draft" && invoice.status !== "scheduled") {
    throw new Error("Only draft or scheduled invoices can be sent");
  }

  if (invoice.totals.total.amountMinor <= 0) {
    throw new Error("Invoice total must be positive before sending");
  }
}

export function markInvoiceSent<T extends { status: InvoiceStatus; totals: InvoiceTotals }>(
  invoice: T,
  sentAt: string,
): Omit<T, "status" | "sentAt"> & { status: "sent"; sentAt: string } {
  assertCanSendInvoice(invoice);
  assertIsoDate(sentAt, "Invoice sent date");

  return {
    ...invoice,
    status: "sent",
    sentAt,
  };
}

export function markInvoiceViewed<T extends { status: InvoiceStatus }>(
  invoice: T,
  viewedAt: string,
): Omit<T, "status" | "viewedAt"> & { status: "viewed"; viewedAt: string } {
  if (invoice.status !== "sent" && invoice.status !== "viewed" && invoice.status !== "overdue") {
    throw new Error("Only sent invoices can be viewed");
  }

  assertIsoDate(viewedAt, "Invoice viewed date");

  return {
    ...invoice,
    status: "viewed",
    viewedAt,
  };
}

export function markInvoiceOverdue<T extends { status: InvoiceStatus }>(
  invoice: T,
  overdueAt: string,
): Omit<T, "status" | "overdueAt"> & { status: "overdue"; overdueAt: string } {
  if (invoice.status !== "sent" && invoice.status !== "viewed" && invoice.status !== "overdue") {
    throw new Error("Only unpaid sent invoices can become overdue");
  }

  assertIsoDate(overdueAt, "Invoice overdue date");

  return {
    ...invoice,
    status: "overdue",
    overdueAt,
  };
}

export function voidInvoice<T extends { status: InvoiceStatus }>(
  invoice: T,
  voidedAt: string,
): Omit<T, "status" | "voidedAt"> & { status: "void"; voidedAt: string } {
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new Error("Paid or void invoices cannot be voided");
  }

  assertIsoDate(voidedAt, "Invoice void date");

  return {
    ...invoice,
    status: "void",
    voidedAt,
  };
}

export function invoiceStatusAfterPayment(input: {
  invoice: { status: InvoiceStatus; totals: InvoiceTotals; amountPaid: Money };
  payment: Money;
  paidAt: string;
}): { amountPaid: Money; status: InvoiceStatus; paidAt?: string | null } {
  if (input.invoice.status === "draft" || input.invoice.status === "scheduled") {
    throw new Error("Invoice must be sent before recording payment");
  }

  if (input.invoice.status === "void") {
    throw new Error("Void invoices cannot be paid");
  }

  assertValidMoney(input.payment);
  assertIsoDate(input.paidAt, "Invoice payment date");

  if (input.payment.amountMinor <= 0) {
    throw new Error("Invoice payment amount must be positive");
  }

  if (
    input.payment.currency !== input.invoice.totals.total.currency ||
    input.invoice.amountPaid.currency !== input.invoice.totals.total.currency
  ) {
    throw new Error("Invoice payment currency must match invoice currency");
  }

  const nextPaidMinor = input.invoice.amountPaid.amountMinor + input.payment.amountMinor;

  if (nextPaidMinor > input.invoice.totals.total.amountMinor) {
    throw new Error("Invoice payment cannot exceed invoice balance");
  }

  return {
    amountPaid: {
      amountMinor: nextPaidMinor,
      currency: input.invoice.totals.total.currency,
    },
    status: nextPaidMinor === input.invoice.totals.total.amountMinor ? "paid" : "partially_paid",
    paidAt: nextPaidMinor === input.invoice.totals.total.amountMinor ? input.paidAt : null,
  };
}

export function nextRecurringInvoiceRun(input: {
  frequency: RecurringInvoiceFrequency;
  from: string | Date;
}): string {
  const from = typeof input.from === "string" ? new Date(input.from) : new Date(input.from);

  if (Number.isNaN(from.getTime())) {
    throw new Error("Recurring invoice run date is invalid");
  }

  const next = new Date(from);

  if (input.frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (input.frequency === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else if (input.frequency === "quarterly") {
    next.setUTCMonth(next.getUTCMonth() + 3);
  } else if (input.frequency === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    const _exhaustive: never = input.frequency;
    return _exhaustive;
  }

  return next.toISOString();
}

export function assertProjectInput(input: ProjectInput): void {
  if (!input.teamId.trim()) {
    throw new Error("Project team is required");
  }

  if (!input.customerId.trim()) {
    throw new Error("Project customer is required");
  }

  if (!input.name.trim()) {
    throw new Error("Project name is required");
  }

  assertValidMoney(input.billableRate);

  if (input.billableRate.amountMinor < 0) {
    throw new Error("Project billable rate cannot be negative");
  }
}

export function assertTimeEntryInput(input: TimeEntryInput): void {
  if (!input.teamId.trim()) {
    throw new Error("Time entry team is required");
  }

  if (!input.projectId.trim()) {
    throw new Error("Time entry project is required");
  }

  if (!input.actorId.trim()) {
    throw new Error("Time entry actor is required");
  }

  if (!input.description.trim()) {
    throw new Error("Time entry description is required");
  }

  assertIsoDate(input.occurredOn, "Time entry date");

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("Time entry duration must be positive minutes");
  }

  if (input.billableStatus === "billable") {
    if (!input.billableRate) {
      throw new Error("Billable time requires a rate");
    }

    assertValidMoney(input.billableRate);

    if (input.billableRate.amountMinor <= 0) {
      throw new Error("Billable time rate must be positive");
    }
  }
}

export function calculateTimeEntryValue(
  entry: Pick<TimeEntry, "billableRate" | "durationMinutes">,
): Money {
  if (!entry.billableRate) {
    throw new Error("Billable value requires a rate");
  }

  assertValidMoney(entry.billableRate);

  return {
    amountMinor: roundRatio(entry.billableRate.amountMinor, entry.durationMinutes, 60),
    currency: entry.billableRate.currency,
  };
}

export function summarizeTimeEntries(
  entries: readonly TimeEntry[],
  currency: string,
): TimeEntryReport {
  assertCurrencyCode(currency);

  const totalMinutes = entries.reduce((total, entry) => total + entry.durationMinutes, 0);
  const billableEntries = entries.filter(
    (entry) => entry.billableStatus === "billable" || entry.billableStatus === "invoiced",
  );
  const billableMinutes = billableEntries.reduce(
    (total, entry) => total + entry.durationMinutes,
    0,
  );
  const invoicedMinutes = entries
    .filter((entry) => entry.billableStatus === "invoiced")
    .reduce((total, entry) => total + entry.durationMinutes, 0);
  const billableValueMinor = billableEntries.reduce((total, entry) => {
    if (!entry.billableRate) {
      return total;
    }

    if (entry.billableRate.currency !== currency) {
      throw new Error("Time entry report currency must match entry rates");
    }

    return total + calculateTimeEntryValue(entry).amountMinor;
  }, 0);

  return {
    totalMinutes,
    billableMinutes,
    nonBillableMinutes: totalMinutes - billableMinutes,
    invoicedMinutes,
    billableValue: { amountMinor: billableValueMinor, currency },
    utilizationBasisPoints:
      totalMinutes === 0 ? 0 : roundRatio(billableMinutes, 10_000, totalMinutes),
  };
}

export function timeEntryToInvoiceLine(input: {
  project: Project;
  entry: TimeEntry;
}): InvoiceLineDraft {
  if (input.entry.teamId !== input.project.teamId || input.entry.projectId !== input.project.id) {
    throw new Error("Time entry must belong to the project");
  }

  if (input.entry.billableStatus !== "billable") {
    throw new Error("Only uninvoiced billable time can become invoice lines");
  }

  if (!input.entry.billableRate) {
    throw new Error("Billable time requires a rate");
  }

  if (input.entry.billableRate.currency !== input.project.billableRate.currency) {
    throw new Error("Time entry rate currency must match project rate currency");
  }

  return {
    description: `${input.project.name}: ${input.entry.description}`,
    quantityMilli: roundRatio(input.entry.durationMinutes, 1_000, 60),
    unitPrice: input.entry.billableRate,
    discountBasisPoints: 0,
    taxRateBasisPoints: 0,
  };
}

function assertIsoDate(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid`);
  }
}

function normalizeInvoiceLineDraft(
  line: InvoiceLineDraft,
  currency: string,
): Required<InvoiceLineDraft> {
  if (!line.description.trim()) {
    throw new Error("Invoice line description is required");
  }

  if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) {
    throw new Error("Invoice line quantity must be positive");
  }

  assertValidMoney(line.unitPrice);

  if (line.unitPrice.amountMinor < 0) {
    throw new Error("Invoice line unit price cannot be negative");
  }

  if (line.unitPrice.currency !== currency) {
    throw new Error("Invoice line currency must match invoice currency");
  }

  assertBasisPoints(line.discountBasisPoints ?? 0, "Invoice line discount");
  assertBasisPoints(line.taxRateBasisPoints ?? 0, "Invoice line tax rate");

  return {
    productId: line.productId ?? null,
    description: line.description.trim(),
    quantityMilli: line.quantityMilli,
    unitPrice: line.unitPrice,
    discountBasisPoints: line.discountBasisPoints ?? 0,
    taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
  };
}

function multiplyMinorByQuantity(amountMinor: number, quantityMilli: number) {
  const product = BigInt(amountMinor) * BigInt(quantityMilli);
  const quotient = product / 1_000n;
  const remainder = product % 1_000n;
  const rounded = quotient + (remainder >= 500n ? 1n : 0n);

  return Number(rounded);
}

function roundBasisPoints(amountMinor: number, basisPoints: number) {
  return roundRatio(amountMinor, basisPoints, 10_000);
}

function roundRatio(amountMinor: number, numerator: number, denominator: number) {
  const product = BigInt(amountMinor) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const quotient = product / divisor;
  const remainder = product % divisor;
  const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);

  return Number(rounded);
}

function assertBasisPoints(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} basis points must be between 0 and 10000`);
  }
}

function assertCurrencyCode(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invoice currency must be an ISO 4217 code");
  }
}

export function suggestInboxTransactionMatches(
  input: InboxMatchInput,
  candidates: readonly InboxMatchCandidate[],
  memory: InboxMatchMemory = {},
): InboxMatchSuggestion[] {
  const hardNegativeKeys = new Set(
    (memory.hardNegatives ?? []).map(
      (negative) => `${negative.inboxItemId}:${negative.transactionId}`,
    ),
  );

  return candidates
    .filter(
      (candidate) => !hardNegativeKeys.has(`${input.inboxItemId}:${candidate.transaction.id}`),
    )
    .map((candidate) => scoreInboxMatchCandidate(input, candidate, memory.aliases ?? []))
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.transactionId.localeCompare(right.transactionId),
    );
}

function scoreInboxMatchCandidate(
  input: InboxMatchInput,
  candidate: InboxMatchCandidate,
  aliases: readonly TeamMatchAlias[],
): InboxMatchSuggestion {
  const signals: InboxMatchSuggestion["signals"] = {};
  const explanation: string[] = [];
  const transaction = candidate.transaction;
  const searchText = normalizeSearchText(
    [
      transaction.description,
      candidate.counterpartyName,
      candidate.providerReference,
      transaction.providerTransactionId,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const documentText = normalizeSearchText(input.documentText ?? "");
  const sender = normalizeSearchText(input.sender ?? "");
  const merchantName = normalizeSearchText(input.fields.merchantName ?? "");
  const invoiceNumber = normalizeSearchText(input.fields.invoiceNumber ?? "");

  if (input.fields.totalAmountMinor != null) {
    if (Math.abs(transaction.money.amountMinor) === Math.abs(input.fields.totalAmountMinor)) {
      signals.amount = 0.35;
      explanation.push("Amount matches exactly");
    }
  }

  if (
    input.fields.currency &&
    transaction.money.currency.toUpperCase() === input.fields.currency.toUpperCase()
  ) {
    signals.currency = 0.1;
    explanation.push("Currency matches");
  }

  const dateScore = dateProximityScore(input.fields.issuedAt, transaction.postedAt);
  if (dateScore > 0) {
    signals.date = dateScore;
    explanation.push(
      dateScore >= 0.2 ? "Transaction date is the same day" : "Transaction date is close",
    );
  }

  if (merchantName && searchTextIncludesTerm(searchText, merchantName)) {
    signals.counterparty = 0.2;
    explanation.push("Counterparty text matches merchant");
  }

  if (invoiceNumber && searchTextIncludesTerm(searchText, invoiceNumber)) {
    signals.reference = 0.1;
    explanation.push("Payment reference matches invoice number");
  }

  if (sender && searchTextIncludesTerm(searchText, sender)) {
    signals.sender = 0.05;
    explanation.push("Sender matches transaction details");
  }

  if (documentText && searchText) {
    const transactionText = normalizeSearchText(transaction.description);
    const counterpartyText = normalizeSearchText(candidate.counterpartyName ?? "");

    if (
      (transactionText && searchTextIncludesTerm(documentText, transactionText)) ||
      (counterpartyText && searchTextIncludesTerm(documentText, counterpartyText))
    ) {
      signals.documentText = 0.05;
      explanation.push("Document text contains transaction details");
    }
  }

  const alias = aliases.find((entry) => {
    const source = normalizeSearchText(entry.source);
    const target = normalizeSearchText(entry.target);

    return (
      source &&
      target &&
      ((merchantName && merchantName === source && searchTextIncludesTerm(searchText, target)) ||
        (merchantName && merchantName === target && searchTextIncludesTerm(searchText, source)))
    );
  });

  if (alias) {
    signals.alias = 0.1;
    explanation.push("Team alias links merchant to this counterparty");
  }

  const score = clampMatchScore(
    Object.values(signals).reduce((total, value) => total + (value ?? 0), 0),
  );

  return {
    inboxItemId: input.inboxItemId,
    transactionId: transaction.id,
    score,
    confidence: score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low",
    explanation,
    signals,
  };
}

function dateProximityScore(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return 0;
  }

  const leftDate = new Date(left);
  const rightDate = new Date(right);

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return 0;
  }

  const days =
    Math.abs(
      Date.UTC(leftDate.getUTCFullYear(), leftDate.getUTCMonth(), leftDate.getUTCDate()) -
        Date.UTC(rightDate.getUTCFullYear(), rightDate.getUTCMonth(), rightDate.getUTCDate()),
    ) / 86_400_000;

  if (days === 0) {
    return 0.2;
  }

  if (days <= 3) {
    return 0.12;
  }

  if (days <= 7) {
    return 0.06;
  }

  return 0;
}

function searchTextIncludesTerm(text: string, term: string) {
  return (
    text.includes(term) || term.split(" ").every((part) => part.length > 1 && text.includes(part))
  );
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clampMatchScore(score: number) {
  return Math.min(1, Math.round(score * 100) / 100);
}

export function assertValidMoney(money: Money) {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("Money amount must use safe integer minor units");
  }

  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }
}

export function parseMoneyAmountMinor(amount: string, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const trimmedAmount = amount.trim();

  if (!trimmedAmount) {
    throw new Error("Money amount is required");
  }

  const isParenthesizedNegative = /^\(.*\)$/.test(trimmedAmount);
  const normalizedAmount = trimmedAmount
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$€£¥\s_]/g, "")
    .replace(/,/g, "");
  const sign = normalizedAmount.startsWith("-") ? -1 : 1;
  const unsignedAmount = normalizedAmount.replace(/^[+-]/, "");

  if (!/^\d+(\.\d+)?$/.test(unsignedAmount)) {
    throw new Error("Money amount must be a decimal number");
  }

  const minorUnitDigits = currencyMinorUnitDigits(currency);
  const [majorUnits = "0", minorUnits = ""] = unsignedAmount.split(".");

  if (minorUnits.length > minorUnitDigits) {
    throw new Error("Money amount has too many decimal places for currency");
  }

  const amountMinor =
    sign *
    Number(
      `${majorUnits}${minorUnits.padEnd(minorUnitDigits, "0")}`.replace(/^0+(?=\d)/, "") || "0",
    );
  const money = {
    amountMinor: isParenthesizedNegative ? -Math.abs(amountMinor) : amountMinor,
    currency,
  };

  assertValidMoney(money);

  return money.amountMinor;
}

export function assertSameCurrency(left: Money, right: Money) {
  assertValidMoney(left);
  assertValidMoney(right);

  if (left.currency !== right.currency) {
    throw new Error("Money currency mismatch");
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  const result = {
    amountMinor: left.amountMinor + right.amountMinor,
    currency: left.currency,
  };

  assertValidMoney(result);

  return result;
}

export function subtractMoney(left: Money, right: Money): Money {
  return addMoney(left, negateMoney(right));
}

export function negateMoney(money: Money): Money {
  assertValidMoney(money);

  const result = {
    amountMinor: -money.amountMinor,
    currency: money.currency,
  };

  assertValidMoney(result);

  return result;
}

export function zeroMoney(currency: string): Money {
  const money = { amountMinor: 0, currency };
  assertValidMoney(money);
  return money;
}

export function sumMoney(values: readonly Money[], currency: string): Money {
  return values.reduce((total, money) => addMoney(total, money), zeroMoney(currency));
}

export function assertBalancedSplits(transactionMoney: Money, splits: readonly { money: Money }[]) {
  if (splits.length === 0) {
    return;
  }

  const splitTotal = sumMoney(
    splits.map((split) => split.money),
    transactionMoney.currency,
  );

  if (splitTotal.amountMinor !== transactionMoney.amountMinor) {
    throw new Error("Transaction splits must equal the transaction amount");
  }
}

export function assertLedgerTransactionDraft(draft: LedgerTransactionDraft) {
  assertValidMoney(draft.money);

  if (!draft.teamId || !draft.accountId) {
    throw new Error("Ledger transaction requires team and account");
  }

  if (!draft.description.trim()) {
    throw new Error("Ledger transaction description is required");
  }

  if (Number.isNaN(new Date(draft.postedAt).getTime())) {
    throw new Error("Ledger transaction posted date is invalid");
  }

  assertBalancedSplits(draft.money, draft.splits ?? []);
}

export function ledgerDuplicateKey(draft: LedgerTransactionDraft) {
  assertLedgerTransactionDraft(draft);

  const sourceKey =
    draft.providerTransactionId?.trim() ||
    [
      draft.source,
      draft.accountId,
      new Date(draft.postedAt).toISOString().slice(0, 10),
      draft.money.currency,
      draft.money.amountMinor,
      draft.description.trim().toLowerCase().replace(/\s+/g, " "),
    ].join(":");

  return `${draft.teamId}:${sourceKey}`;
}

export function parseCsvTransactionRows(csv: string): CsvTransactionImportRow[] {
  const rows = parseCsvRecords(csv);

  if (rows.length === 0) {
    throw new Error("CSV import file is empty");
  }

  const headers = rows[0]?.map((header) => header.trim()) ?? [];

  if (headers.every((header) => !header)) {
    throw new Error("CSV import requires a header row");
  }

  const seenHeaders = new Set<string>();

  for (const header of headers) {
    if (!header) {
      throw new Error("CSV import headers cannot be blank");
    }

    if (seenHeaders.has(header)) {
      throw new Error("CSV import headers must be unique");
    }

    seenHeaders.add(header);
  }

  return rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, columnIndex) => [header, row[columnIndex] ?? ""]),
      ),
    }));
}

export function csvRowToLedgerDraft(input: {
  teamId: string;
  accountId: string;
  accountCurrency: string;
  mapping: CsvTransactionColumnMapping;
  row: CsvTransactionImportRow;
  categoryId?: string | null;
}): LedgerTransactionDraft {
  const description = requiredCsvValue(input.row, input.mapping.description, "description");
  const postedAtValue = requiredCsvValue(input.row, input.mapping.postedAt, "posted date");
  const currency = input.mapping.currency
    ? requiredCsvValue(input.row, input.mapping.currency, "currency").toUpperCase()
    : input.accountCurrency;
  const amountMinor = parseMoneyAmountMinor(
    requiredCsvValue(input.row, input.mapping.amount, "amount"),
    currency,
  );
  const postedAt = new Date(postedAtValue);

  if (Number.isNaN(postedAt.getTime())) {
    throw new Error("CSV row posted date is invalid");
  }

  if (currency !== input.accountCurrency) {
    throw new Error("CSV row currency must match the account");
  }

  const draft = {
    teamId: input.teamId,
    accountId: input.accountId,
    description,
    postedAt: postedAt.toISOString(),
    money: { amountMinor, currency },
    type: amountMinor >= 0 ? "income" : "expense",
    source: "csv_import",
    categoryId: input.categoryId ?? null,
  } satisfies LedgerTransactionDraft;

  assertLedgerTransactionDraft(draft);

  return draft;
}

function requiredCsvValue(row: CsvTransactionImportRow, column: string, label: string) {
  const value = row.values[column]?.trim();

  if (!value) {
    throw new Error(`CSV row ${label} is required`);
  }

  return value;
}

function parseCsvRecords(csv: string) {
  const normalizedCsv = csv
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedCsv.length; index += 1) {
    const char = normalizedCsv[index];
    const nextChar = normalizedCsv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV import has an unterminated quoted field");
  }

  record.push(field);

  if (record.some((value) => value.trim())) {
    records.push(record);
  }

  return records;
}

export function createReportTotals(
  transactions: readonly Transaction[],
  currency: string,
): ReportTotals {
  let revenue = zeroMoney(currency);
  let expenses = zeroMoney(currency);
  let balance = zeroMoney(currency);
  const categoryTotals: Record<string, Money> = {};

  for (const transaction of transactions) {
    assertValidMoney(transaction.money);

    if (transaction.money.currency !== currency) {
      throw new Error("Report currency mismatch");
    }

    balance = addMoney(balance, transaction.money);

    if (transaction.money.amountMinor > 0) {
      revenue = addMoney(revenue, transaction.money);
    } else if (transaction.money.amountMinor < 0) {
      expenses = addMoney(expenses, transaction.money);
    }

    if (transaction.categoryId) {
      categoryTotals[transaction.categoryId] = addMoney(
        categoryTotals[transaction.categoryId] ?? zeroMoney(currency),
        transaction.money,
      );
    }
  }

  return {
    revenue,
    expenses,
    profit: addMoney(revenue, expenses),
    balance,
    categoryTotals,
  };
}

export function currencyMinorUnitDigits(currency: string, locale = "en-US") {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const minorUnitDigits = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;

  return minorUnitDigits ?? 2;
}

export function formatMoney(money: Money, options: { locale?: string } = {}) {
  assertValidMoney(money);

  const locale = options.locale ?? "en-US";
  const minorUnitDigits = currencyMinorUnitDigits(money.currency, locale);
  const amountMinor = BigInt(money.amountMinor);
  const isNegative = amountMinor < 0n;
  const absoluteMinor = isNegative ? -amountMinor : amountMinor;
  const minorUnitDivisor = 10n ** BigInt(minorUnitDigits);
  const majorUnits = absoluteMinor / minorUnitDivisor;
  const minorUnits = absoluteMinor % minorUnitDivisor;
  const formattedMajorUnits = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(majorUnits);
  const formattedMinorUnits =
    minorUnitDigits === 0 ? "" : `.${minorUnits.toString().padStart(minorUnitDigits, "0")}`;

  return `${isNegative ? "-" : ""}${money.currency} ${formattedMajorUnits}${formattedMinorUnits}`;
}
