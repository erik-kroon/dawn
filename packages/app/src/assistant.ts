import {
  createMockAssistantResponseProvider,
  getAssistantTool,
  planAssistantTools,
  type AssistantResponseProvider,
  type AssistantToolName,
  type AssistantToolResult,
} from "@dawn/ai";
import type {
  AssistantActionApproval,
  AssistantMessage,
  AssistantThread,
  AssistantToolCall,
  ReportSourceRef,
} from "@dawn/domain";
import { formatMoney, suggestTransactionCategory } from "@dawn/domain";
import type { InvoiceEmailDeliveryProvider } from "@dawn/integrations";

import {
  reviewTransaction,
  type BankingUseCaseRepository,
  type ReviewTransactionCommand,
} from "./banking-ledger";
import {
  createDraftInvoice,
  sendInvoice,
  type BillingRepository,
  type CreateDraftInvoiceCommand,
  type InvoicePdfRenderer,
  type SendInvoiceCommand,
} from "./billing";
import type { DocumentsInboxUseCaseRepository } from "./documents-inbox";
import {
  customerSource,
  documentSource,
  inboxItemSource,
  invoiceSource,
  loadBusinessReport,
  productSource,
  projectSource,
  transactionSource,
  unpaidInvoices,
  type ProjectReportingUseCaseRepository,
} from "./projects-reporting";
import {
  AppError,
  resolveTeamAccess,
  type ResolvedTeamAccess,
  type TransactionReviewContext,
} from "./index";

export type AssistantWorkspace = {
  teamId: string;
  threads: AssistantThread[];
  pendingApprovals: AssistantActionApproval[];
};

export type AssistantConversation = {
  teamId: string;
  thread: AssistantThread;
  messages: AssistantMessage[];
  toolCalls: AssistantToolCall[];
  actionApprovals: AssistantActionApproval[];
};

export type SendAssistantMessageCommand = {
  teamId?: string;
  threadId?: string | null;
  message: string;
};

export type SendAssistantMessageResult = AssistantConversation & {
  toolResults: AssistantToolResult[];
};

export type ApproveAssistantActionCommand = {
  teamId: string;
  approvalId: string;
  idempotencyKey: string;
};

export type RejectAssistantActionCommand = {
  teamId: string;
  approvalId: string;
  reason?: string | null;
};

export type AssistantActionApprovalResult = {
  approval: AssistantActionApproval;
};

export type AssistantRepository = {
  listAssistantThreads(teamId: string): Promise<AssistantThread[]>;
  getAssistantThreadForTeam(teamId: string, threadId: string): Promise<AssistantThread | null>;
  listAssistantMessages(threadId: string): Promise<AssistantMessage[]>;
  listAssistantToolCalls(threadId: string): Promise<AssistantToolCall[]>;
  listPendingAssistantActionApprovals(teamId: string): Promise<AssistantActionApproval[]>;
  listAssistantActionApprovals(threadId: string): Promise<AssistantActionApproval[]>;
  getAssistantActionApprovalForTeam(
    teamId: string,
    approvalId: string,
  ): Promise<AssistantActionApproval | null>;
  createAssistantThread(input: {
    threadId: string;
    teamId: string;
    title: string;
    createdByActorId: string;
    createdAt: string;
  }): Promise<AssistantThread>;
  createAssistantMessage(input: {
    messageId: string;
    threadId: string;
    teamId: string;
    role: AssistantMessage["role"];
    content: string;
    sourceRefs: ReportSourceRef[];
    createdAt: string;
  }): Promise<AssistantMessage>;
  createAssistantToolCalls(input: {
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
  }): Promise<AssistantToolCall[]>;
  createAssistantActionApproval(input: {
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
  }): Promise<AssistantActionApproval>;
  markAssistantActionApprovalRejected(input: {
    teamId: string;
    approvalId: string;
    rejectedByActorId: string;
    decidedAt: string;
    reason?: string | null;
  }): Promise<AssistantActionApproval>;
  markAssistantActionApprovalExecuted(input: {
    teamId: string;
    approvalId: string;
    approvedByActorId: string;
    result: Record<string, unknown>;
    decidedAt: string;
    executedAt: string;
  }): Promise<AssistantActionApproval>;
};
export type AssistantUseCaseRepository = BankingUseCaseRepository &
  BillingRepository &
  DocumentsInboxUseCaseRepository &
  ProjectReportingUseCaseRepository &
  AssistantRepository;

export async function listAssistantWorkspace(
  repository: AssistantUseCaseRepository,
  context: TransactionReviewContext,
  command: { teamId?: string } = {},
): Promise<AssistantWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "assistant.use",
    "You cannot use the assistant for this team",
  );

  return {
    teamId: access.teamId,
    threads: await repository.listAssistantThreads(access.teamId),
    pendingApprovals: await repository.listPendingAssistantActionApprovals(access.teamId),
  };
}

export async function getAssistantConversation(
  repository: AssistantUseCaseRepository,
  context: TransactionReviewContext,
  command: { teamId?: string; threadId: string },
): Promise<AssistantConversation> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "assistant.use",
    "You cannot use the assistant for this team",
  );
  const thread = await repository.getAssistantThreadForTeam(access.teamId, command.threadId);

  if (!thread) {
    throw new AppError("NOT_FOUND", "Assistant thread was not found");
  }

  return {
    teamId: access.teamId,
    thread,
    messages: await repository.listAssistantMessages(thread.id),
    toolCalls: await repository.listAssistantToolCalls(thread.id),
    actionApprovals: await repository.listAssistantActionApprovals(thread.id),
  };
}

export async function sendAssistantMessage(
  repository: AssistantUseCaseRepository,
  context: TransactionReviewContext,
  command: SendAssistantMessageCommand,
  provider: AssistantResponseProvider = createMockAssistantResponseProvider(),
): Promise<SendAssistantMessageResult> {
  const message = command.message.trim();

  if (!message) {
    throw new AppError("CONFLICT", "Assistant message cannot be empty");
  }

  return repository.withTransaction(async (transactionRepository) => {
    const assistantRepository = transactionRepository as AssistantUseCaseRepository;
    const access = await resolveTeamAccess(
      assistantRepository,
      { ...context, teamId: command.teamId ?? context.teamId },
      "assistant.use",
      "You cannot use the assistant for this team",
    );
    const now = new Date().toISOString();
    const thread = command.threadId
      ? await loadAssistantThread(assistantRepository, access.teamId, command.threadId)
      : await assistantRepository.createAssistantThread({
          threadId: crypto.randomUUID(),
          teamId: access.teamId,
          title: assistantThreadTitle(message),
          createdByActorId: context.actor.id,
          createdAt: now,
        });
    const userMessage = await assistantRepository.createAssistantMessage({
      messageId: crypto.randomUUID(),
      threadId: thread.id,
      teamId: access.teamId,
      role: "user",
      content: message,
      sourceRefs: [],
      createdAt: now,
    });
    const toolResults = await runAssistantTools(
      assistantRepository,
      access,
      message,
      thread,
      userMessage,
      context.actor.id,
    );
    const response = await provider.generateResponse({ question: message, toolResults });
    const assistantMessage = await assistantRepository.createAssistantMessage({
      messageId: crypto.randomUUID(),
      threadId: thread.id,
      teamId: access.teamId,
      role: "assistant",
      content: response.content,
      sourceRefs: response.sourceRefs,
      createdAt: new Date().toISOString(),
    });
    await assistantRepository.createAssistantToolCalls({
      toolCalls: toolResults.map((result) => ({
        toolCallId: crypto.randomUUID(),
        threadId: thread.id,
        messageId: assistantMessage.id,
        teamId: access.teamId,
        toolName: result.toolName,
        risk: result.risk,
        status: result.status,
        input: result.input,
        output: result.output,
        sourceRefs: result.sourceRefs,
        createdAt: assistantMessage.createdAt,
      })),
    });

    await assistantRepository.appendAuditEvent({
      teamId: access.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "assistant.message.created",
      entityType: "assistant_thread",
      entityId: thread.id,
      metadata: {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        toolNames: toolResults.map((result) => result.toolName),
      },
    });

    return {
      teamId: access.teamId,
      thread,
      messages: await assistantRepository.listAssistantMessages(thread.id),
      toolCalls: await assistantRepository.listAssistantToolCalls(thread.id),
      actionApprovals: await assistantRepository.listAssistantActionApprovals(thread.id),
      toolResults,
    };
  });
}

export async function approveAssistantAction(
  repository: AssistantUseCaseRepository,
  renderer: InvoicePdfRenderer,
  emailProvider: InvoiceEmailDeliveryProvider,
  context: TransactionReviewContext,
  command: ApproveAssistantActionCommand,
): Promise<AssistantActionApprovalResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const assistantRepository = transactionRepository as AssistantUseCaseRepository;
    const approval = await loadPendingAssistantApproval(
      assistantRepository,
      command.teamId,
      command.approvalId,
    );
    const tool = getAssistantTool(approval.toolName as AssistantToolName);

    await resolveTeamAccess(
      assistantRepository,
      { ...context, teamId: command.teamId },
      tool.requiredPermission,
      "You cannot approve this assistant action for this team",
    );

    const result = await executeApprovedAssistantAction(
      assistantRepository,
      renderer,
      emailProvider,
      context,
      approval,
      command.idempotencyKey,
    );
    const now = new Date().toISOString();
    const executed = await assistantRepository.markAssistantActionApprovalExecuted({
      teamId: command.teamId,
      approvalId: command.approvalId,
      approvedByActorId: context.actor.id,
      result,
      decidedAt: now,
      executedAt: now,
    });

    await assistantRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "assistant.action.executed",
      entityType: "assistant_action_approval",
      entityId: command.approvalId,
      metadata: {
        toolName: approval.toolName,
        risk: approval.risk,
        result,
      },
    });

    return { approval: executed };
  });
}

export async function rejectAssistantAction(
  repository: AssistantUseCaseRepository,
  context: TransactionReviewContext,
  command: RejectAssistantActionCommand,
): Promise<AssistantActionApprovalResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const assistantRepository = transactionRepository as AssistantUseCaseRepository;
    const approval = await loadPendingAssistantApproval(
      assistantRepository,
      command.teamId,
      command.approvalId,
    );

    await resolveTeamAccess(
      assistantRepository,
      { ...context, teamId: command.teamId },
      "assistant.use",
      "You cannot reject this assistant action for this team",
    );

    const rejected = await assistantRepository.markAssistantActionApprovalRejected({
      teamId: command.teamId,
      approvalId: command.approvalId,
      rejectedByActorId: context.actor.id,
      decidedAt: new Date().toISOString(),
      reason: command.reason ?? null,
    });

    await assistantRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "assistant.action.rejected",
      entityType: "assistant_action_approval",
      entityId: command.approvalId,
      metadata: {
        toolName: approval.toolName,
        risk: approval.risk,
        reason: command.reason ?? null,
      },
    });

    return { approval: rejected };
  });
}

async function loadAssistantThread(
  repository: AssistantUseCaseRepository,
  teamId: string,
  threadId: string,
) {
  const thread = await repository.getAssistantThreadForTeam(teamId, threadId);

  if (!thread) {
    throw new AppError("NOT_FOUND", "Assistant thread was not found");
  }

  return thread;
}

async function loadPendingAssistantApproval(
  repository: AssistantUseCaseRepository,
  teamId: string,
  approvalId: string,
) {
  const approval = await repository.getAssistantActionApprovalForTeam(teamId, approvalId);

  if (!approval) {
    throw new AppError("NOT_FOUND", "Assistant action approval was not found");
  }

  if (approval.status !== "pending") {
    throw new AppError("CONFLICT", "Assistant action approval is no longer pending");
  }

  return approval;
}

async function runAssistantTools(
  repository: AssistantUseCaseRepository,
  access: ResolvedTeamAccess,
  question: string,
  thread: AssistantThread,
  userMessage: AssistantMessage,
  requestedByActorId: string,
): Promise<AssistantToolResult[]> {
  const toolNames = planAssistantTools(question);
  const results: AssistantToolResult[] = [];

  for (const toolName of toolNames) {
    const tool = getAssistantTool(toolName);
    const input = tool.inputSchema.parse(toolInputForQuestion(toolName, question));

    if (!access.permissions.includes(tool.requiredPermission)) {
      results.push({
        toolName,
        risk: tool.risk,
        status: "refused",
        input,
        output: {
          summary: `Permission ${tool.requiredPermission} is required for ${toolName}.`,
          requiredPermission: tool.requiredPermission,
        },
        sourceRefs: [],
      });
      continue;
    }

    if (tool.approvalRequired) {
      results.push(
        await createAssistantActionProposal(
          repository,
          access.teamId,
          toolName,
          input,
          thread,
          userMessage,
          requestedByActorId,
        ),
      );
      continue;
    }

    results.push(await executeAssistantTool(repository, access.teamId, toolName, input));
  }

  return results;
}

function toolInputForQuestion(
  toolName: AssistantToolName,
  question: string,
): Record<string, unknown> {
  if (toolName === "get_report_overview") {
    return {};
  }

  return { query: question };
}

async function executeAssistantTool(
  repository: AssistantUseCaseRepository,
  teamId: string,
  toolName: AssistantToolName,
  input: Record<string, unknown>,
): Promise<AssistantToolResult> {
  if (toolName === "search_transactions") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await searchAssistantTransactions(repository, teamId, input),
    );
  }

  if (toolName === "list_open_invoices") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await listAssistantOpenInvoices(repository, teamId),
    );
  }

  if (toolName === "search_documents") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await searchAssistantDocuments(repository, teamId, input),
    );
  }

  if (toolName === "list_customers") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await listAssistantCustomers(repository, teamId, input),
    );
  }

  if (toolName === "list_projects") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await listAssistantProjects(repository, teamId, input),
    );
  }

  if (toolName === "get_report_overview") {
    return assistantToolResult(
      toolName,
      "read",
      input,
      await getAssistantReportOverview(repository, teamId),
    );
  }

  if (toolName === "suggest_transaction_category") {
    return assistantToolResult(
      toolName,
      "suggest",
      input,
      await suggestAssistantTransactionCategories(repository, teamId, input),
    );
  }

  if (toolName === "suggest_inbox_match") {
    return assistantToolResult(
      toolName,
      "suggest",
      input,
      await suggestAssistantInboxMatches(repository, teamId),
    );
  }

  return assistantToolResult(
    toolName,
    "suggest",
    input,
    await suggestAssistantInvoiceEmailCopy(repository, teamId),
  );
}

async function createAssistantActionProposal(
  repository: AssistantUseCaseRepository,
  teamId: string,
  toolName: AssistantToolName,
  input: Record<string, unknown>,
  thread: AssistantThread,
  userMessage: AssistantMessage,
  requestedByActorId: string,
): Promise<AssistantToolResult> {
  const tool = getAssistantTool(toolName);
  const proposal = await buildAssistantActionProposal(repository, teamId, toolName, input);
  const approval = await repository.createAssistantActionApproval({
    approvalId: crypto.randomUUID(),
    threadId: thread.id,
    requestedByMessageId: userMessage.id,
    teamId,
    toolName,
    risk: tool.risk,
    input: proposal.input,
    preview: proposal.preview,
    sourceRefs: proposal.sources,
    requestedByActorId,
    createdAt: new Date().toISOString(),
  });

  return {
    toolName,
    risk: tool.risk,
    status: "completed",
    input,
    output: {
      summary: proposal.summary,
      approvalId: approval.id,
      approvalStatus: approval.status,
      preview: proposal.preview,
    },
    sourceRefs: proposal.sources,
  };
}

async function buildAssistantActionProposal(
  repository: AssistantUseCaseRepository,
  teamId: string,
  toolName: AssistantToolName,
  input: Record<string, unknown>,
) {
  if (toolName === "create_invoice_draft") {
    return buildDraftInvoiceProposal(repository, teamId, input);
  }

  if (toolName === "categorize_transaction") {
    return buildCategorizeTransactionProposal(repository, teamId, input);
  }

  if (toolName === "send_invoice") {
    return buildSendInvoiceProposal(repository, teamId, input);
  }

  throw new AppError("CONFLICT", `Tool ${toolName} does not require approval`);
}

async function buildDraftInvoiceProposal(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const [customers, products] = await Promise.all([
    repository.listCustomers(teamId),
    repository.listProducts(teamId),
  ]);
  const customer =
    customers.find((candidate) => candidate.id === input.customerId) ?? customers[0] ?? null;
  const product =
    products.find((candidate) => candidate.id === input.productId) ?? products[0] ?? null;

  if (!customer || !product) {
    throw new AppError(
      "CONFLICT",
      "Assistant invoice drafts require at least one customer and product",
    );
  }

  const issueDate =
    typeof input.issueDate === "string" ? input.issueDate : new Date().toISOString();
  const dueDate = typeof input.dueDate === "string" ? input.dueDate : null;
  const quantityMilli = typeof input.quantityMilli === "number" ? input.quantityMilli : 1_000;
  const invoiceNumber =
    typeof input.invoiceNumber === "string" && input.invoiceNumber.trim()
      ? input.invoiceNumber.trim()
      : `AI-${new Date(issueDate).toISOString().slice(0, 10).replaceAll("-", "")}`;
  const draftInput = {
    teamId,
    customerId: customer.id,
    invoiceNumber,
    issueDate,
    dueDate,
    currency: product.unitPrice.currency,
    discountBasisPoints: 0,
    notes: "Drafted by Dawn assistant and awaiting user review.",
    lines: [
      {
        productId: product.id,
        description: product.name,
        quantityMilli,
        unitPrice: product.unitPrice,
        taxRateBasisPoints: product.defaultTaxRateBasisPoints,
      },
    ],
  };

  return {
    input: draftInput,
    preview: {
      invoiceNumber,
      customerName: customer.name,
      lineDescription: product.name,
      unitPrice: product.unitPrice,
      quantityMilli,
    },
    summary: `Prepared an editable draft invoice proposal for ${customer.name}.`,
    sources: [customerSource(customer), productSource(product)],
  };
}

async function buildCategorizeTransactionProposal(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const [workspace, transactions] = await Promise.all([
    repository.listWorkspace({ id: "assistant", type: "user" }, teamId),
    repository.listTransactionsForReport({ teamId }),
  ]);
  const transaction =
    transactions.find((candidate) => candidate.id === input.transactionId) ??
    transactions.find((candidate) => candidate.categoryId === null) ??
    null;
  const categorySuggestion = transaction
    ? suggestTransactionCategory({ transaction, categories: workspace.categories })
    : null;
  const category =
    workspace.categories.find((candidate) => candidate.id === input.categoryId) ??
    workspace.categories.find((candidate) => candidate.id === categorySuggestion?.categoryId) ??
    workspace.categories[0] ??
    null;

  if (!transaction || !category) {
    throw new AppError("CONFLICT", "Assistant categorization requires a transaction and category");
  }

  return {
    input: {
      teamId,
      transactionId: transaction.id,
      categoryId: category.id,
    },
    preview: {
      transactionDescription: transaction.description,
      transactionAmount: transaction.money,
      categoryName: category.name,
    },
    summary: `Prepared a transaction categorization proposal for ${transaction.description}.`,
    sources: [transactionSource(transaction)],
  };
}

async function buildSendInvoiceProposal(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const invoices = await repository.listInvoices(teamId);
  const invoice =
    invoices.find((candidate) => candidate.id === input.invoiceId) ??
    invoices.find(
      (candidate) => candidate.status === "draft" || candidate.status === "scheduled",
    ) ??
    null;

  if (!invoice) {
    throw new AppError("CONFLICT", "Assistant invoice send requires a draft or scheduled invoice");
  }

  const customer = await repository.getCustomerForTeam(teamId, invoice.customerId);
  const contact = customer
    ? await repository.getCustomerContactForCustomer(teamId, customer.id)
    : null;
  const toEmail =
    typeof input.toEmail === "string" && input.toEmail.trim()
      ? input.toEmail.trim()
      : (contact?.email ?? customer?.email ?? null);

  if (!toEmail) {
    throw new AppError("CONFLICT", "Assistant invoice send requires a recipient email");
  }

  const subject =
    typeof input.subject === "string" && input.subject.trim()
      ? input.subject.trim()
      : `Invoice ${invoice.invoiceNumber}`;
  const message =
    typeof input.message === "string" && input.message.trim()
      ? input.message.trim()
      : `Attached invoice ${invoice.invoiceNumber}`;

  return {
    input: {
      teamId,
      invoiceId: invoice.id,
      toEmail,
      subject,
      message,
    },
    preview: {
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer?.name ?? invoice.customerId,
      toEmail,
      subject,
      total: invoice.totals.total,
    },
    summary: `Prepared an invoice send proposal for ${invoice.invoiceNumber}.`,
    sources: [invoiceSource(invoice)],
  };
}

async function executeApprovedAssistantAction(
  repository: AssistantUseCaseRepository,
  renderer: InvoicePdfRenderer,
  emailProvider: InvoiceEmailDeliveryProvider,
  context: TransactionReviewContext,
  approval: AssistantActionApproval,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  if (approval.toolName === "create_invoice_draft") {
    const result = await createDraftInvoice(repository, context, {
      ...(approval.input as Omit<CreateDraftInvoiceCommand, "idempotencyKey">),
      idempotencyKey,
    });

    return {
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      status: result.invoice.status,
      replayed: result.replayed,
    };
  }

  if (approval.toolName === "categorize_transaction") {
    const result = await reviewTransaction(repository, context, {
      ...(approval.input as Omit<ReviewTransactionCommand, "idempotencyKey">),
      idempotencyKey,
    });

    return {
      transactionId: result.transaction.id,
      categoryId: result.transaction.categoryId,
      reviewState: result.transaction.reviewState,
      replayed: result.replayed,
    };
  }

  if (approval.toolName === "send_invoice") {
    const result = await sendInvoice(repository, renderer, emailProvider, context, {
      ...(approval.input as Omit<SendInvoiceCommand, "confirm" | "idempotencyKey">),
      confirm: true,
      idempotencyKey,
    });

    return {
      invoiceId: result.invoice.id,
      status: result.invoice.status,
      providerMessageId: result.providerMessageId,
      replayed: result.replayed,
    };
  }

  throw new AppError("CONFLICT", `Unsupported assistant action ${approval.toolName}`);
}

function assistantToolResult(
  toolName: AssistantToolName,
  risk: AssistantToolResult["risk"],
  input: Record<string, unknown>,
  output: { summary: string; sources: ReportSourceRef[] } & Record<string, unknown>,
): AssistantToolResult {
  const { sources, ...rest } = output;

  return {
    toolName,
    risk,
    status: "completed",
    input,
    output: rest,
    sourceRefs: sources,
  };
}

async function searchAssistantTransactions(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const query = normalizedAssistantQuery(input);
  const transactions = (await repository.listTransactionsForReport({ teamId }))
    .filter((transaction) =>
      matchesAssistantQuery(query, [
        transaction.description,
        transaction.categoryId,
        transaction.type,
        transaction.source,
      ]),
    )
    .slice(0, 5);

  return {
    summary: `Found ${transactions.length} matching transactions.`,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      postedAt: transaction.postedAt,
      description: transaction.description,
      amount: transaction.money,
      categoryId: transaction.categoryId,
      reviewState: transaction.reviewState,
    })),
    sources: transactions.map(transactionSource),
  };
}

async function listAssistantOpenInvoices(repository: AssistantUseCaseRepository, teamId: string) {
  const [customers, invoices] = await Promise.all([
    repository.listCustomers(teamId),
    repository.listInvoices(teamId),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const openInvoices = unpaidInvoices(invoices, customerById, invoices[0]?.currency ?? "USD").slice(
    0,
    5,
  );

  return {
    summary: `${openInvoices.length} invoices are currently unpaid.`,
    invoices: openInvoices.map((invoice) => ({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amountDue: invoice.amountDue,
      dueDate: invoice.dueDate,
    })),
    sources: openInvoices.flatMap((invoice) => invoice.sources),
  };
}

async function searchAssistantDocuments(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const query = normalizedAssistantQuery(input);
  const documents = (await repository.listDocuments(teamId))
    .filter((document) =>
      matchesAssistantQuery(query, [document.title, document.currentVersion?.fileName]),
    )
    .slice(0, 5);
  const inboxItems = (await repository.listInboxItems(teamId))
    .filter((item) =>
      matchesAssistantQuery(query, [
        item.document?.title,
        item.document?.currentVersion?.fileName,
        item.latestExtraction?.fields.merchantName,
        item.latestExtraction?.fields.invoiceNumber,
      ]),
    )
    .slice(0, 5);

  return {
    summary: `Found ${documents.length} documents and ${inboxItems.length} inbox items.`,
    documents: documents.map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.currentVersion?.fileName ?? null,
      status: document.status,
    })),
    inboxItems: inboxItems.map((item) => ({
      id: item.id,
      status: item.status,
      extractionStatus: item.extractionStatus,
      merchantName: item.latestExtraction?.fields.merchantName ?? null,
    })),
    sources: [...documents.map(documentSource), ...inboxItems.map(inboxItemSource)],
  };
}

async function listAssistantCustomers(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const query = normalizedAssistantQuery(input);
  const customers = (await repository.listCustomers(teamId))
    .filter((customer) => matchesAssistantQuery(query, [customer.name, customer.email]))
    .slice(0, 5);

  return {
    summary: `Found ${customers.length} customers.`,
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
    })),
    sources: customers.map(customerSource),
  };
}

async function listAssistantProjects(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const query = normalizedAssistantQuery(input);
  const projects = (await repository.listProjects(teamId))
    .filter((project) => matchesAssistantQuery(query, [project.name, project.description]))
    .slice(0, 5);

  return {
    summary: `Found ${projects.length} projects.`,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      billableRate: project.billableRate,
    })),
    sources: projects.map(projectSource),
  };
}

async function getAssistantReportOverview(repository: AssistantUseCaseRepository, teamId: string) {
  const report = await loadBusinessReport(repository, teamId, { from: null, to: null });
  const insights = await repository.listBusinessInsights({ teamId });

  return {
    summary: `Cashflow is ${formatMoney(report.cashflow)} with ${report.unpaidInvoices.length} unpaid invoices and ${report.inboxBacklog.needsReview} inbox items needing review.`,
    report: {
      cashflow: report.cashflow,
      profit: report.totals.profit,
      unpaidInvoiceCount: report.unpaidInvoices.length,
      utilizationBasisPoints: report.timeUtilization.utilizationBasisPoints,
      insightCount: insights.length,
    },
    sources: [
      ...report.revenueByCustomer.flatMap((bucket) => bucket.sources).slice(0, 3),
      ...report.unpaidInvoices.flatMap((invoice) => invoice.sources).slice(0, 3),
      ...insights.flatMap((insight) => insight.sourceRefs).slice(0, 3),
    ],
  };
}

async function suggestAssistantTransactionCategories(
  repository: AssistantUseCaseRepository,
  teamId: string,
  input: Record<string, unknown>,
) {
  const query = normalizedAssistantQuery(input);
  const [workspace, transactions] = await Promise.all([
    repository.listWorkspace({ id: "assistant", type: "user" }, teamId),
    repository.listTransactionsForReport({ teamId }),
  ]);
  const categories = workspace.categories;
  const candidates = transactions
    .filter((transaction) => transaction.categoryId === null)
    .filter((transaction) => matchesAssistantQuery(query, [transaction.description]))
    .slice(0, 5);
  const suggestions = candidates.map((transaction) => {
    const categorySuggestion = suggestTransactionCategory({ transaction, categories });
    const category =
      categories.find((candidate) => candidate.id === categorySuggestion.categoryId) ??
      categories[0] ??
      null;

    return {
      transactionId: transaction.id,
      description: transaction.description,
      suggestedCategoryId: category?.id ?? null,
      suggestedCategoryName: category?.name ?? null,
      confidence: categorySuggestion.categoryId
        ? categorySuggestion.confidence
        : category
          ? 0.2
          : 0,
    };
  });

  return {
    summary: `Prepared ${suggestions.length} category suggestions without changing transactions.`,
    suggestions,
    sources: candidates.map(transactionSource),
  };
}

async function suggestAssistantInboxMatches(
  repository: AssistantUseCaseRepository,
  teamId: string,
) {
  const inboxItems = (await repository.listInboxItems(teamId))
    .filter((item) => item.status !== "resolved")
    .slice(0, 5);
  const suggestions = inboxItems.flatMap((item) =>
    (item.matchSuggestions ?? [])
      .filter((suggestion) => suggestion.status === "suggested")
      .slice(0, 2)
      .map((suggestion) => ({
        inboxItemId: item.id,
        transactionId: suggestion.transactionId,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
      })),
  );

  return {
    summary: `Found ${suggestions.length} existing inbox match suggestions without accepting them.`,
    suggestions,
    sources: inboxItems.map(inboxItemSource),
  };
}

async function suggestAssistantInvoiceEmailCopy(
  repository: AssistantUseCaseRepository,
  teamId: string,
) {
  const [customers, invoices] = await Promise.all([
    repository.listCustomers(teamId),
    repository.listInvoices(teamId),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const invoice = invoices.find(
    (candidate) =>
      candidate.status !== "paid" &&
      candidate.status !== "void" &&
      candidate.totals.total.amountMinor > candidate.amountPaid.amountMinor,
  );

  if (!invoice) {
    return {
      summary: "There are no open invoices to draft follow-up copy for.",
      suggestions: [],
      sources: [],
    };
  }

  const customer = customerById.get(invoice.customerId);
  const amountDue = {
    amountMinor: invoice.totals.total.amountMinor - invoice.amountPaid.amountMinor,
    currency: invoice.currency,
  };

  return {
    summary: `Drafted follow-up email copy for ${invoice.invoiceNumber}; nothing was sent.`,
    suggestions: [
      {
        invoiceId: invoice.id,
        subject: `Following up on ${invoice.invoiceNumber}`,
        body: `Hi ${customer?.name ?? "there"},\n\nI'm following up on ${invoice.invoiceNumber} for ${formatMoney(amountDue)}. Please let me know if you need anything from us.\n\nThanks,`,
      },
    ],
    sources: [invoiceSource(invoice)],
  };
}

function normalizedAssistantQuery(input: Record<string, unknown>) {
  return typeof input.query === "string" ? input.query.toLowerCase() : "";
}

function matchesAssistantQuery(query: string, values: readonly (string | null | undefined)[]) {
  if (!query) {
    return true;
  }

  const tokens = query
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
    .filter(
      (token) => !["and", "the", "for", "with", "about", "explain", "suggest"].includes(token),
    );

  if (tokens.length === 0) {
    return true;
  }

  return values.some((value) => {
    const normalized = value?.toLowerCase();
    return normalized ? tokens.some((token) => normalized.includes(token)) : false;
  });
}

function assistantThreadTitle(message: string) {
  return message.length > 60 ? `${message.slice(0, 57)}...` : message;
}
