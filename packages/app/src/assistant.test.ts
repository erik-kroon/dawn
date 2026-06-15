import { describe, expect, test } from "bun:test";

import {
  approveAssistantAction,
  createDeterministicInvoicePdfRenderer,
  rejectAssistantAction,
  sendAssistantMessage,
  type BusinessDocument,
  type DawnRepository,
  type InboxItem,
} from ".";
import { createMockInvoiceEmailDeliveryProvider } from "@dawn/integrations";
import type {
  Actor,
  AssistantActionApproval,
  AssistantMessage,
  AssistantThread,
  AssistantToolCall,
  BusinessInsight,
  Category,
  Customer,
  InvoiceDraft,
  InvoiceLineDraft,
  Project,
  Product,
  ReportSourceRef,
  TeamRole,
  Transaction,
} from "@dawn/domain";

class MemoryAssistantRepository {
  role: TeamRole | null = "owner";
  categories: Category[] = [{ id: "software", teamId: "team_1", name: "Software" }];
  transactions: Transaction[] = [];
  customers: Customer[] = [];
  products: Product[] = [];
  invoices: InvoiceDraft[] = [];
  documents: BusinessDocument[] = [];
  inboxItems: InboxItem[] = [];
  projects: Project[] = [];
  insights: BusinessInsight[] = [];
  threads = new Map<string, AssistantThread>();
  messages = new Map<string, AssistantMessage>();
  toolCalls = new Map<string, AssistantToolCall>();
  approvals = new Map<string, AssistantActionApproval>();
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(_actor: Actor, teamId: string) {
    return this.role && teamId === "team_1" ? { role: this.role } : null;
  }

  async listWorkspace(_actor: Actor, teamId: string) {
    return {
      teamId,
      teamName: "Test Team",
      categories: this.categories.filter((category) => category.teamId === teamId),
      transactions: this.transactions.filter((transaction) => transaction.teamId === teamId),
      sync: {
        collection: "transactions" as const,
        cursor: null,
        conflictPolicy: "server_wins_for_financial_state" as const,
      },
    };
  }

  async listTransactionsForReport(input: { teamId: string }) {
    return this.transactions.filter((transaction) => transaction.teamId === input.teamId);
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    return (
      this.transactions.find(
        (transaction) => transaction.teamId === teamId && transaction.id === transactionId,
      ) ?? null
    );
  }

  async getCategoryForTeam(teamId: string, categoryId: string) {
    return (
      this.categories.find(
        (category) => category.teamId === teamId && category.id === categoryId,
      ) ?? null
    );
  }

  async listCustomers(teamId: string) {
    return this.customers.filter((customer) => customer.teamId === teamId);
  }

  async listInvoices(teamId: string) {
    return this.invoices.filter((invoice) => invoice.teamId === teamId);
  }

  async listProducts(teamId: string) {
    return this.products.filter((product) => product.teamId === teamId);
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    return (
      this.customers.find((customer) => customer.teamId === teamId && customer.id === customerId) ??
      null
    );
  }

  async getCustomerContactForCustomer() {
    return null;
  }

  async getProductForTeam(teamId: string, productId: string) {
    return (
      this.products.find((product) => product.teamId === teamId && product.id === productId) ?? null
    );
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    return (
      this.invoices.find((invoice) => invoice.teamId === teamId && invoice.id === invoiceId) ?? null
    );
  }

  async listDocuments(teamId: string) {
    return this.documents.filter((document) => document.teamId === teamId);
  }

  async listInboxItems(teamId: string) {
    return this.inboxItems.filter((item) => item.teamId === teamId);
  }

  async listProjects(teamId: string) {
    return this.projects.filter((project) => project.teamId === teamId);
  }

  async listTimeEntries() {
    return [];
  }

  async listBusinessInsights(input: { teamId: string }) {
    return this.insights.filter((insight) => insight.teamId === input.teamId);
  }

  async listAssistantThreads(teamId: string) {
    return [...this.threads.values()].filter((thread) => thread.teamId === teamId);
  }

  async getAssistantThreadForTeam(teamId: string, threadId: string) {
    const thread = this.threads.get(threadId);
    return thread?.teamId === teamId ? thread : null;
  }

  async listAssistantMessages(threadId: string) {
    return [...this.messages.values()].filter((message) => message.threadId === threadId);
  }

  async listAssistantToolCalls(threadId: string) {
    return [...this.toolCalls.values()].filter((toolCall) => toolCall.threadId === threadId);
  }

  async listPendingAssistantActionApprovals(teamId: string) {
    return [...this.approvals.values()].filter(
      (approval) => approval.teamId === teamId && approval.status === "pending",
    );
  }

  async listAssistantActionApprovals(threadId: string) {
    return [...this.approvals.values()].filter((approval) => approval.threadId === threadId);
  }

  async getAssistantActionApprovalForTeam(teamId: string, approvalId: string) {
    const approval = this.approvals.get(approvalId);
    return approval?.teamId === teamId ? approval : null;
  }

  async createAssistantThread(input: {
    threadId: string;
    teamId: string;
    title: string;
    createdByActorId: string;
    createdAt: string;
  }) {
    const thread = {
      id: input.threadId,
      teamId: input.teamId,
      title: input.title,
      createdByActorId: input.createdByActorId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.threads.set(thread.id, thread);
    return thread;
  }

  async createAssistantMessage(input: {
    messageId: string;
    threadId: string;
    teamId: string;
    role: AssistantMessage["role"];
    content: string;
    sourceRefs: ReportSourceRef[];
    createdAt: string;
  }) {
    const message = {
      id: input.messageId,
      threadId: input.threadId,
      teamId: input.teamId,
      role: input.role,
      content: input.content,
      sourceRefs: input.sourceRefs,
      createdAt: input.createdAt,
    };
    this.messages.set(message.id, message);
    return message;
  }

  async createAssistantToolCalls(input: {
    toolCalls: Array<{
      toolCallId: string;
      threadId: string;
      messageId: string;
      teamId: string;
      toolName: string;
      risk: AssistantToolCall["risk"];
      status: AssistantToolCall["status"];
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      sourceRefs: ReportSourceRef[];
      createdAt: string;
    }>;
  }) {
    const calls = input.toolCalls.map((toolCall) => ({
      id: toolCall.toolCallId,
      threadId: toolCall.threadId,
      messageId: toolCall.messageId,
      teamId: toolCall.teamId,
      toolName: toolCall.toolName,
      risk: toolCall.risk,
      status: toolCall.status,
      input: toolCall.input,
      output: toolCall.output,
      sourceRefs: toolCall.sourceRefs,
      createdAt: toolCall.createdAt,
    }));

    for (const call of calls) {
      this.toolCalls.set(call.id, call);
    }

    return calls;
  }

  async createAssistantActionApproval(input: {
    approvalId: string;
    threadId: string;
    requestedByMessageId: string;
    teamId: string;
    toolName: string;
    risk: AssistantActionApproval["risk"];
    input: Record<string, unknown>;
    preview: Record<string, unknown>;
    sourceRefs: ReportSourceRef[];
    requestedByActorId: string;
    createdAt: string;
  }) {
    const approval = {
      id: input.approvalId,
      threadId: input.threadId,
      requestedByMessageId: input.requestedByMessageId,
      teamId: input.teamId,
      toolName: input.toolName,
      risk: input.risk,
      status: "pending" as const,
      input: input.input,
      preview: input.preview,
      result: null,
      sourceRefs: input.sourceRefs,
      requestedByActorId: input.requestedByActorId,
      approvedByActorId: null,
      rejectedByActorId: null,
      createdAt: input.createdAt,
      decidedAt: null,
      executedAt: null,
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async markAssistantActionApprovalRejected(input: {
    teamId: string;
    approvalId: string;
    rejectedByActorId: string;
    decidedAt: string;
  }) {
    const approval = this.approvals.get(input.approvalId);

    if (!approval || approval.teamId !== input.teamId || approval.status !== "pending") {
      throw new Error("Approval not found");
    }

    const rejected = {
      ...approval,
      status: "rejected" as const,
      rejectedByActorId: input.rejectedByActorId,
      decidedAt: input.decidedAt,
    };
    this.approvals.set(rejected.id, rejected);
    return rejected;
  }

  async markAssistantActionApprovalExecuted(input: {
    teamId: string;
    approvalId: string;
    approvedByActorId: string;
    result: Record<string, unknown>;
    decidedAt: string;
    executedAt: string;
  }) {
    const approval = this.approvals.get(input.approvalId);

    if (!approval || approval.teamId !== input.teamId || approval.status !== "pending") {
      throw new Error("Approval not found");
    }

    const executed = {
      ...approval,
      status: "executed" as const,
      approvedByActorId: input.approvedByActorId,
      result: input.result,
      decidedAt: input.decidedAt,
      executedAt: input.executedAt,
    };
    this.approvals.set(executed.id, executed);
    return executed;
  }

  async createDraftInvoice(input: {
    invoiceId: string;
    teamId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
    createdByActorId: string;
  }) {
    const product = input.lines[0]?.productId
      ? await this.getProductForTeam(input.teamId, input.lines[0].productId)
      : null;
    const line = input.lines[0];

    if (!line) {
      throw new Error("Missing line");
    }

    const total = {
      amountMinor: Math.round((line.unitPrice.amountMinor * line.quantityMilli) / 1_000),
      currency: input.currency,
    };
    const invoice: InvoiceDraft = {
      id: input.invoiceId,
      teamId: input.teamId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      status: "draft",
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      notes: input.notes,
      lines: [
        {
          ...line,
          id: "line_approval_1",
          invoiceId: input.invoiceId,
          sortOrder: 0,
          description: line.description || product?.name || "Line item",
          totals: {
            subtotal: total,
            discount: { amountMinor: 0, currency: input.currency },
            tax: { amountMinor: 0, currency: input.currency },
            total,
          },
        },
      ],
      totals: {
        subtotal: total,
        discount: { amountMinor: 0, currency: input.currency },
        tax: { amountMinor: 0, currency: input.currency },
        total,
      },
      amountPaid: { amountMinor: 0, currency: input.currency },
      createdByActorId: input.createdByActorId,
    };
    this.invoices.push(invoice);
    return invoice;
  }

  async updateTransactionReviewForTeam(input: {
    teamId: string;
    transactionId: string;
    categoryId: string;
    reviewState: Transaction["reviewState"];
  }) {
    const index = this.transactions.findIndex(
      (transaction) =>
        transaction.teamId === input.teamId && transaction.id === input.transactionId,
    );

    if (index === -1) {
      throw new Error("Transaction not found");
    }

    const transaction = {
      ...this.transactions[index],
      categoryId: input.categoryId,
      reviewState: input.reviewState,
    } as Transaction;
    this.transactions[index] = transaction;
    return transaction;
  }

  async markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }) {
    const index = this.invoices.findIndex(
      (invoice) => invoice.teamId === input.teamId && invoice.id === input.invoiceId,
    );

    if (index === -1) {
      throw new Error("Invoice not found");
    }

    const existing = this.invoices[index];

    if (!existing) {
      throw new Error("Invoice not found");
    }

    const invoice = {
      ...existing,
      status: "sent" as const,
      sentAt: input.sentAt,
      deliveryToEmail: input.toEmail,
      deliveryProviderMessageId: input.providerMessageId,
    };
    this.invoices[index] = invoice;
    return invoice;
  }

  async createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: "invoice.sent";
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }) {
    return input;
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

describe("assistant use cases", () => {
  test("answers grounded questions with persisted messages and cited tool calls", async () => {
    const repository = fixtureRepository();
    const result = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Explain cashflow and unpaid invoices",
    });

    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.toolCalls.map((toolCall) => toolCall.toolName)).toContain("get_report_overview");
    expect(result.toolCalls.map((toolCall) => toolCall.toolName)).toContain("list_open_invoices");
    expect(result.messages[1]?.sourceRefs.some((source) => source.type === "invoice")).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
  });

  test("requires assistant permission before reading team data", async () => {
    const repository = fixtureRepository();
    repository.role = null;

    await expect(
      sendAssistantMessage(repository as unknown as DawnRepository, context, {
        teamId: "team_1",
        message: "Explain cashflow",
      }),
    ).rejects.toThrow("You cannot use the assistant for this team");
  });

  test("suggest tools do not mutate authoritative transaction state", async () => {
    const repository = fixtureRepository();
    const transaction = repository.transactions[0];

    if (!transaction) {
      throw new Error("Missing fixture transaction");
    }

    repository.transactions[0] = {
      ...transaction,
      categoryId: null,
      description: "Software subscription",
    };
    const result = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Suggest category for software subscription",
    });

    const suggestion = result.toolCalls.find(
      (toolCall) => toolCall.toolName === "suggest_transaction_category",
    );

    expect(suggestion).toMatchObject({ risk: "suggest", status: "completed" });
    expect(suggestion?.output).toMatchObject({
      suggestions: [
        {
          transactionId: "txn_1",
          suggestedCategoryId: "software",
        },
      ],
    });
    expect(repository.transactions[0]?.categoryId).toBeNull();
  });

  test("approval-gated draft tools create editable drafts through app use cases", async () => {
    const repository = fixtureRepository();
    const proposed = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Draft invoice for Acme",
    });
    const approval = proposed.actionApprovals.find(
      (candidate) => candidate.toolName === "create_invoice_draft",
    );

    if (!approval) {
      throw new Error("Missing draft approval");
    }

    const approved = await approveAssistantAction(
      repository as unknown as DawnRepository,
      createDeterministicInvoicePdfRenderer(),
      createMockInvoiceEmailDeliveryProvider(),
      context,
      {
        teamId: "team_1",
        approvalId: approval.id,
        idempotencyKey: "approve_invoice_draft_1",
      },
    );

    expect(approval.status).toBe("pending");
    expect(approved.approval).toMatchObject({
      id: approval.id,
      status: "executed",
      risk: "draft",
    });
    expect(repository.invoices.some((invoice) => invoice.status === "draft")).toBe(true);
    expect(repository.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "invoice_draft.created" }),
        expect.objectContaining({ action: "assistant.action.executed" }),
      ]),
    );
  });

  test("approved mutate tools reuse transaction review permissions and use case", async () => {
    const repository = fixtureRepository();
    const transaction = repository.transactions[0];

    if (!transaction) {
      throw new Error("Missing fixture transaction");
    }

    repository.transactions[0] = { ...transaction, categoryId: null };
    const proposed = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Categorize transaction",
    });
    const approval = proposed.actionApprovals.find(
      (candidate) => candidate.toolName === "categorize_transaction",
    );

    if (!approval) {
      throw new Error("Missing categorization approval");
    }

    await approveAssistantAction(
      repository as unknown as DawnRepository,
      createDeterministicInvoicePdfRenderer(),
      createMockInvoiceEmailDeliveryProvider(),
      context,
      {
        teamId: "team_1",
        approvalId: approval.id,
        idempotencyKey: "approve_category_1",
      },
    );

    expect(repository.transactions[0]).toMatchObject({
      categoryId: "software",
      reviewState: "reviewed",
    });
  });

  test("external side-effect tools require explicit approval before sending", async () => {
    const repository = fixtureRepository();
    const proposed = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Send invoice",
    });
    const approval = proposed.actionApprovals.find(
      (candidate) => candidate.toolName === "send_invoice",
    );

    if (!approval) {
      throw new Error("Missing send approval");
    }

    expect(repository.invoices[0]?.status).toBe("draft");

    await approveAssistantAction(
      repository as unknown as DawnRepository,
      createDeterministicInvoicePdfRenderer(),
      createMockInvoiceEmailDeliveryProvider(),
      context,
      {
        teamId: "team_1",
        approvalId: approval.id,
        idempotencyKey: "approve_send_1",
      },
    );

    expect(repository.invoices[0]).toMatchObject({
      status: "sent",
      deliveryToEmail: "billing@example.com",
    });
    expect(repository.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "invoice.sent" }),
        expect.objectContaining({ action: "assistant.action.executed" }),
      ]),
    );
  });

  test("rejected approvals do not execute assistant actions", async () => {
    const repository = fixtureRepository();
    const proposed = await sendAssistantMessage(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      message: "Draft invoice for Acme",
    });
    const approval = proposed.actionApprovals.find(
      (candidate) => candidate.toolName === "create_invoice_draft",
    );

    if (!approval) {
      throw new Error("Missing draft approval");
    }

    const rejected = await rejectAssistantAction(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      approvalId: approval.id,
      reason: "Not needed",
    });

    expect(rejected.approval.status).toBe("rejected");
    expect(repository.invoices).toHaveLength(1);
    expect(repository.auditEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "assistant.action.rejected" })]),
    );
  });
});

function fixtureRepository() {
  const repository = new MemoryAssistantRepository();
  repository.customers = [
    { id: "customer_1", teamId: "team_1", name: "Acme Co", email: "billing@example.com" },
  ];
  repository.products = [
    {
      id: "product_1",
      teamId: "team_1",
      name: "Consulting",
      type: "service",
      unitPrice: { amountMinor: 100_00, currency: "USD" },
      defaultTaxRateBasisPoints: 0,
    },
  ];
  repository.transactions = [
    {
      id: "txn_1",
      teamId: "team_1",
      description: "Client payment",
      postedAt: "2026-06-10T00:00:00.000Z",
      money: { amountMinor: 500_00, currency: "USD" },
      categoryId: "revenue",
      reviewState: "reviewed",
      type: "income",
      source: "manual",
    },
  ];
  repository.invoices = [invoiceFixture()];
  return repository;
}

function invoiceFixture(): InvoiceDraft {
  return {
    id: "invoice_1",
    teamId: "team_1",
    customerId: "customer_1",
    invoiceNumber: "INV-001",
    status: "draft",
    issueDate: "2026-06-12T00:00:00.000Z",
    dueDate: "2026-06-30T00:00:00.000Z",
    currency: "USD",
    discountBasisPoints: 0,
    lines: [
      {
        id: "line_1",
        invoiceId: "invoice_1",
        sortOrder: 0,
        description: "Consulting",
        quantityMilli: 1_000,
        unitPrice: { amountMinor: 100_00, currency: "USD" },
        taxRateBasisPoints: 0,
        totals: {
          subtotal: { amountMinor: 100_00, currency: "USD" },
          discount: { amountMinor: 0, currency: "USD" },
          tax: { amountMinor: 0, currency: "USD" },
          total: { amountMinor: 100_00, currency: "USD" },
        },
      },
    ],
    totals: {
      subtotal: { amountMinor: 100_00, currency: "USD" },
      discount: { amountMinor: 0, currency: "USD" },
      tax: { amountMinor: 0, currency: "USD" },
      total: { amountMinor: 100_00, currency: "USD" },
    },
    amountPaid: { amountMinor: 0, currency: "USD" },
    createdByActorId: "user_1",
  };
}
