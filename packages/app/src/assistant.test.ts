import { describe, expect, test } from "bun:test";

import {
  sendAssistantMessage,
  type BusinessDocument,
  type DawnRepository,
  type InboxItem,
} from ".";
import type {
  Actor,
  AssistantMessage,
  AssistantThread,
  AssistantToolCall,
  BusinessInsight,
  Category,
  Customer,
  InvoiceDraft,
  Project,
  ReportSourceRef,
  TeamRole,
  Transaction,
} from "@dawn/domain";

class MemoryAssistantRepository {
  role: TeamRole | null = "owner";
  categories: Category[] = [{ id: "software", teamId: "team_1", name: "Software" }];
  transactions: Transaction[] = [];
  customers: Customer[] = [];
  invoices: InvoiceDraft[] = [];
  documents: BusinessDocument[] = [];
  inboxItems: InboxItem[] = [];
  projects: Project[] = [];
  insights: BusinessInsight[] = [];
  threads = new Map<string, AssistantThread>();
  messages = new Map<string, AssistantMessage>();
  toolCalls = new Map<string, AssistantToolCall>();
  auditEvents: unknown[] = [];

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

  async listCustomers(teamId: string) {
    return this.customers.filter((customer) => customer.teamId === teamId);
  }

  async listInvoices(teamId: string) {
    return this.invoices.filter((invoice) => invoice.teamId === teamId);
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

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
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
});

function fixtureRepository() {
  const repository = new MemoryAssistantRepository();
  repository.customers = [{ id: "customer_1", teamId: "team_1", name: "Acme Co" }];
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
    status: "sent",
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
