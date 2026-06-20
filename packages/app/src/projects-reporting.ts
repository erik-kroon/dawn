import type { InsightDraft, InsightGenerationProvider } from "@dawn/ai";
import type {
  BusinessInsight,
  BusinessReport,
  Customer,
  InvoiceDraft,
  Money,
  Product,
  Project,
  ProjectInput,
  ProjectMember,
  ReportSourceRef,
  TimeEntry,
  TimeEntryInput,
  TimeEntryReport,
  Transaction,
} from "@dawn/domain";
import {
  assertInvoiceDraftInput,
  assertProjectInput,
  assertTimeEntryInput,
  createReportTotals,
  summarizeTimeEntries,
  timeEntryToInvoiceLine,
} from "@dawn/domain";
import {
  buildProjectSyncResponse,
  projectSyncCollectionContract,
  type ProjectSyncResponse,
} from "@dawn/sync";

import { type BillingRepository } from "./billing";
import type { BusinessDocument, InboxItem, InboxRepository } from "./documents-inbox";
import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type ProjectWorkspace = {
  teamId: string;
  customers: Customer[];
  projects: Project[];
  projectMembers: ProjectMember[];
  timeEntries: TimeEntry[];
  report: TimeEntryReport;
};

export type ListProjectSyncCommand = {
  teamId?: string;
  cursor?: string | null;
};

export type CreateProjectCommand = ProjectInput & {
  idempotencyKey: string;
};

export type CreateProjectResult = {
  project: Project;
  member: ProjectMember;
  replayed: boolean;
};

export type CreateTimeEntryCommand = Omit<TimeEntryInput, "actorId"> & {
  actorId?: string | null;
  idempotencyKey: string;
};

export type CreateTimeEntryResult = {
  timeEntry: TimeEntry;
  replayed: boolean;
};

export type CreateInvoiceFromTimeEntriesCommand = {
  teamId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  timeEntryIds: string[];
  idempotencyKey: string;
};

export type CreateInvoiceFromTimeEntriesResult = {
  invoice: InvoiceDraft;
  timeEntries: TimeEntry[];
  replayed: boolean;
};

export type BusinessReportWorkspace = {
  teamId: string;
  report: BusinessReport;
  insights: BusinessInsight[];
};

export type ListBusinessReportCommand = {
  teamId?: string;
  from?: string | null;
  to?: string | null;
};

export type GenerateWeeklyInsightsCommand = {
  teamId: string;
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
};

export type GenerateWeeklyInsightsResult = {
  insights: BusinessInsight[];
  replayed: boolean;
};

export type ProjectRepository = {
  listProjects(teamId: string): Promise<Project[]>;
  listProjectsForSync(input: { teamId: string; cursor?: string | null }): Promise<Project[]>;
  listProjectMembers(teamId: string): Promise<ProjectMember[]>;
  listTimeEntries(teamId: string): Promise<TimeEntry[]>;
  getProjectForTeam(teamId: string, projectId: string): Promise<Project | null>;
  getTimeEntriesForTeam(teamId: string, timeEntryIds: string[]): Promise<TimeEntry[]>;
  createProject(input: {
    projectId: string;
    memberId: string;
    teamId: string;
    customerId: string;
    name: string;
    description?: string | null;
    billableRate: Money;
    createdByActorId: string;
  }): Promise<{ project: Project; member: ProjectMember }>;
  createTimeEntry(input: {
    timeEntryId: string;
    teamId: string;
    projectId: string;
    actorId: string;
    description: string;
    occurredOn: string;
    durationMinutes: number;
    billableStatus: TimeEntry["billableStatus"];
    billableRate?: Money | null;
  }): Promise<TimeEntry>;
  markTimeEntriesInvoiced(input: {
    teamId: string;
    timeEntryIds: string[];
    invoiceId: string;
  }): Promise<TimeEntry[]>;
};

export type ReportingRepository = {
  listBusinessInsights(input: {
    teamId: string;
    from?: string | null;
    to?: string | null;
  }): Promise<BusinessInsight[]>;
  createBusinessInsights(input: {
    teamId: string;
    periodStart: string;
    periodEnd: string;
    insights: Array<
      InsightDraft & {
        insightId: string;
        createdAt: string;
      }
    >;
  }): Promise<BusinessInsight[]>;
};
export type ProjectReportingUseCaseRepository = TransactionReviewRepository &
  BillingRepository &
  InboxRepository &
  ProjectRepository &
  ReportingRepository;

const createProjectOperation = "project.create";
const createTimeEntryOperation = "time_entry.create";
const createInvoiceFromTimeEntriesOperation = "time_entry.invoice.create";
const generateWeeklyInsightsOperation = "insights.weekly.generate";

export async function listProjectWorkspace(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<ProjectWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "projects.read",
    "You cannot read projects for this team",
  );
  const [customers, projects, projectMembers, timeEntries] = await Promise.all([
    repository.listCustomers(access.teamId),
    repository.listProjects(access.teamId),
    repository.listProjectMembers(access.teamId),
    repository.listTimeEntries(access.teamId),
  ]);
  const currency = projects[0]?.billableRate.currency ?? "USD";

  return {
    teamId: access.teamId,
    customers,
    projects,
    projectMembers,
    timeEntries,
    report: summarizeTimeEntries(timeEntries, currency),
  };
}

export async function listProjectSyncCollection(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  command: ListProjectSyncCommand = {},
): Promise<ProjectSyncResponse> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    projectSyncCollectionContract.authorization.permission,
    projectSyncCollectionContract.authorization.syncForbiddenMessage,
  );
  const projects = await repository.listProjectsForSync({
    teamId: access.teamId,
    cursor: command.cursor ?? null,
  });

  return buildProjectSyncResponse({
    teamId: access.teamId,
    projects,
  });
}

export async function createProject(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateProjectCommand,
): Promise<CreateProjectResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as ProjectReportingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot create projects for this team",
    );

    const normalized = {
      teamId: command.teamId,
      customerId: command.customerId,
      name: command.name.trim(),
      description: command.description?.trim() || null,
      billableRate: {
        amountMinor: command.billableRate.amountMinor,
        currency: command.billableRate.currency.toUpperCase(),
      },
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createProjectOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different project");
      }

      return { ...(replayed.result as CreateProjectResult), replayed: true };
    }

    const customer = await projectRepository.getCustomerForTeam(command.teamId, command.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    try {
      assertProjectInput(normalized);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const created = await projectRepository.createProject({
      projectId: crypto.randomUUID(),
      memberId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "project.created",
      entityType: "project",
      entityId: created.project.id,
      metadata: {
        customerId: created.project.customerId,
        billableRate: created.project.billableRate,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "project.created",
      version: 1,
      payload: {
        projectId: created.project.id,
        customerId: created.project.customerId,
      },
    });

    const result = { ...created, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createProjectOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createTimeEntry(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateTimeEntryCommand,
): Promise<CreateTimeEntryResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as ProjectReportingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot track time for this team",
    );

    const project = await projectRepository.getProjectForTeam(command.teamId, command.projectId);

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found");
    }

    const normalized = {
      teamId: command.teamId,
      projectId: command.projectId,
      actorId: command.actorId?.trim() || context.actor.id,
      description: command.description.trim(),
      occurredOn: new Date(command.occurredOn).toISOString(),
      durationMinutes: command.durationMinutes,
      billableStatus: command.billableStatus,
      billableRate:
        command.billableStatus === "billable"
          ? {
              amountMinor: command.billableRate?.amountMinor ?? project.billableRate.amountMinor,
              currency: (
                command.billableRate?.currency ?? project.billableRate.currency
              ).toUpperCase(),
            }
          : null,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createTimeEntryOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different time entry",
        );
      }

      return { ...(replayed.result as CreateTimeEntryResult), replayed: true };
    }

    try {
      assertTimeEntryInput(normalized);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const timeEntry = await projectRepository.createTimeEntry({
      timeEntryId: crypto.randomUUID(),
      ...normalized,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "time_entry.created",
      entityType: "time_entry",
      entityId: timeEntry.id,
      metadata: {
        projectId: timeEntry.projectId,
        durationMinutes: timeEntry.durationMinutes,
        billableStatus: timeEntry.billableStatus,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "time_entry.created",
      version: 1,
      payload: {
        timeEntryId: timeEntry.id,
        projectId: timeEntry.projectId,
      },
    });

    const result = { timeEntry, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createTimeEntryOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createInvoiceFromTimeEntries(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateInvoiceFromTimeEntriesCommand,
): Promise<CreateInvoiceFromTimeEntriesResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const projectRepository = transactionRepository as ProjectReportingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Project not found");

    await resolveTeamAccess(
      projectRepository,
      { ...context, teamId: command.teamId },
      "projects.write",
      "You cannot invoice time for this team",
    );

    const normalized = {
      teamId: command.teamId,
      customerId: command.customerId,
      invoiceNumber: command.invoiceNumber.trim(),
      issueDate: new Date(command.issueDate).toISOString(),
      dueDate: command.dueDate ? new Date(command.dueDate).toISOString() : null,
      timeEntryIds: [...new Set(command.timeEntryIds)].sort(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await projectRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createInvoiceFromTimeEntriesOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different time invoice",
        );
      }

      return { ...(replayed.result as CreateInvoiceFromTimeEntriesResult), replayed: true };
    }

    if (normalized.timeEntryIds.length === 0) {
      throw new AppError("CONFLICT", "At least one time entry is required");
    }

    const customer = await projectRepository.getCustomerForTeam(command.teamId, command.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    const [timeEntries, projects] = await Promise.all([
      projectRepository.getTimeEntriesForTeam(command.teamId, normalized.timeEntryIds),
      projectRepository.listProjects(command.teamId),
    ]);

    if (timeEntries.length !== normalized.timeEntryIds.length) {
      throw new AppError("NOT_FOUND", "Time entry not found");
    }

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const lines = timeEntries.map((timeEntry) => {
      const project = projectById.get(timeEntry.projectId);

      if (!project || project.customerId !== normalized.customerId) {
        throw new AppError("CONFLICT", "Time entries must belong to the invoice customer");
      }

      try {
        return timeEntryToInvoiceLine({ project, entry: timeEntry });
      } catch (error) {
        throw new AppError("CONFLICT", errorMessage(error));
      }
    });
    const currency = lines[0]?.unitPrice.currency ?? "USD";
    const invoiceInput = {
      teamId: command.teamId,
      customerId: normalized.customerId,
      invoiceNumber: normalized.invoiceNumber,
      issueDate: normalized.issueDate,
      dueDate: normalized.dueDate,
      currency,
      discountBasisPoints: 0,
      lines,
    };

    assertInvoiceDraftInput(invoiceInput);

    const invoice = await projectRepository.createDraftInvoice({
      invoiceId: crypto.randomUUID(),
      ...invoiceInput,
      createdByActorId: context.actor.id,
    });
    const invoicedEntries = await projectRepository.markTimeEntriesInvoiced({
      teamId: command.teamId,
      timeEntryIds: normalized.timeEntryIds,
      invoiceId: invoice.id,
    });

    await projectRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "time_entries.invoiced",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        timeEntryIds: normalized.timeEntryIds,
        total: invoice.totals.total,
      },
    });

    await projectRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "time_entries.invoiced",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        timeEntryIds: normalized.timeEntryIds,
      },
    });

    const result = { invoice, timeEntries: invoicedEntries, replayed: false };

    await projectRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createInvoiceFromTimeEntriesOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function listBusinessReport(
  repository: ProjectReportingUseCaseRepository,
  context: TransactionReviewContext,
  command: ListBusinessReportCommand = {},
): Promise<BusinessReportWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId ?? context.teamId },
    "transactions.read",
    "You cannot read reports for this team",
  );
  const range = normalizeReportRange(command);

  return {
    teamId: access.teamId,
    report: await loadBusinessReport(repository, access.teamId, range),
    insights: await repository.listBusinessInsights({
      teamId: access.teamId,
      from: range.from,
      to: range.to,
    }),
  };
}

export async function generateWeeklyInsights(
  repository: ProjectReportingUseCaseRepository,
  provider: InsightGenerationProvider,
  command: GenerateWeeklyInsightsCommand,
): Promise<GenerateWeeklyInsightsResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const reportingRepository = transactionRepository as ProjectReportingUseCaseRepository;
    const actorId = "system:weekly-insights";
    const normalized = {
      teamId: command.teamId,
      periodStart: new Date(command.periodStart).toISOString(),
      periodEnd: new Date(command.periodEnd).toISOString(),
      provider: provider.provider,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await reportingRepository.getIdempotencyResult(
      command.teamId,
      actorId,
      generateWeeklyInsightsOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different weekly insight run",
        );
      }

      return { ...(replayed.result as GenerateWeeklyInsightsResult), replayed: true };
    }

    const report = await loadBusinessReport(reportingRepository, command.teamId, {
      from: normalized.periodStart,
      to: normalized.periodEnd,
    });
    const drafts = await provider.generateWeeklyInsights({
      teamId: command.teamId,
      periodStart: normalized.periodStart,
      periodEnd: normalized.periodEnd,
      report,
    });
    const createdAt = new Date().toISOString();
    const insights = await reportingRepository.createBusinessInsights({
      teamId: command.teamId,
      periodStart: normalized.periodStart,
      periodEnd: normalized.periodEnd,
      insights: drafts.map((draft) => ({
        ...draft,
        insightId: crypto.randomUUID(),
        createdAt,
      })),
    });

    await reportingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      action: "insights.weekly.generated",
      entityType: "insight_run",
      entityId: normalized.periodEnd,
      metadata: {
        insightIds: insights.map((insight) => insight.id),
        periodStart: normalized.periodStart,
        periodEnd: normalized.periodEnd,
      },
    });

    await reportingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      type: "insights.weekly.generated",
      version: 1,
      payload: {
        insightIds: insights.map((insight) => insight.id),
        periodStart: normalized.periodStart,
        periodEnd: normalized.periodEnd,
      },
    });

    const result = { insights, replayed: false };

    await reportingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId,
      operation: generateWeeklyInsightsOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function loadBusinessReport(
  repository: ProjectReportingUseCaseRepository,
  teamId: string,
  range: BusinessReport["range"],
) {
  const [transactions, customers, invoices, timeEntries, inboxItems, projects] = await Promise.all([
    repository.listTransactionsForReport({
      teamId,
      from: range.from ?? undefined,
      to: range.to ?? undefined,
    }),
    repository.listCustomers(teamId),
    repository.listInvoices(teamId),
    repository.listTimeEntries(teamId),
    repository.listInboxItems(teamId),
    repository.listProjects(teamId),
  ]);
  const currency = selectReportCurrency({ transactions, invoices, projects });

  return buildBusinessReport({
    teamId,
    currency,
    range,
    transactions,
    customers,
    invoices: filterInvoicesByIssueDate(invoices, range),
    timeEntries: filterTimeEntriesByDate(timeEntries, range),
    inboxItems,
  });
}

function buildBusinessReport(input: {
  teamId: string;
  currency: string;
  range: BusinessReport["range"];
  transactions: Transaction[];
  customers: Customer[];
  invoices: InvoiceDraft[];
  timeEntries: TimeEntry[];
  inboxItems: InboxItem[];
}): BusinessReport {
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const transactions = input.transactions.filter(
    (transaction) => transaction.money.currency === input.currency,
  );
  const invoices = input.invoices.filter((invoice) => invoice.currency === input.currency);
  const timeEntries = input.timeEntries.filter(
    (entry) => !entry.billableRate || entry.billableRate.currency === input.currency,
  );
  const totals = createReportTotals(transactions, input.currency);

  return {
    teamId: input.teamId,
    currency: input.currency,
    range: input.range,
    totals,
    cashflow: totals.balance,
    revenueByCustomer: revenueByCustomer(invoices, customerById, input.currency),
    expensesByCategory: expensesByCategory(transactions, input.currency),
    unpaidInvoices: unpaidInvoices(invoices, customerById, input.currency),
    taxSummary: taxSummary(invoices, input.currency),
    timeUtilization: summarizeTimeEntries(timeEntries, input.currency),
    inboxBacklog: inboxBacklog(input.inboxItems),
  };
}

function selectReportCurrency(input: {
  transactions: readonly Transaction[];
  invoices: readonly InvoiceDraft[];
  projects: readonly Project[];
}) {
  const transactionCurrency = mostFrequentCurrency(
    input.transactions.map((transaction) => transaction.money.currency),
  );

  return (
    transactionCurrency ??
    input.invoices[0]?.currency ??
    input.projects[0]?.billableRate.currency ??
    "USD"
  );
}

function mostFrequentCurrency(currencies: readonly string[]) {
  const counts = new Map<string, number>();

  for (const currency of currencies) {
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
      rightCount - leftCount || leftCurrency.localeCompare(rightCurrency),
  )[0]?.[0];
}

function normalizeReportRange(input: ListBusinessReportCommand): BusinessReport["range"] {
  return {
    from: input.from ? new Date(input.from).toISOString() : null,
    to: input.to ? new Date(input.to).toISOString() : null,
  };
}

function filterInvoicesByIssueDate(
  invoices: readonly InvoiceDraft[],
  range: BusinessReport["range"],
) {
  return invoices.filter((invoice) => isWithinRange(invoice.issueDate, range));
}

function filterTimeEntriesByDate(entries: readonly TimeEntry[], range: BusinessReport["range"]) {
  return entries.filter((entry) => isWithinRange(entry.occurredOn, range));
}

function isWithinRange(value: string, range: BusinessReport["range"]) {
  const time = new Date(value).getTime();

  if (range.from && time < new Date(range.from).getTime()) {
    return false;
  }

  if (range.to && time > new Date(range.to).getTime()) {
    return false;
  }

  return true;
}

function revenueByCustomer(
  invoices: readonly InvoiceDraft[],
  customerById: Map<string, Customer>,
  currency: string,
) {
  const buckets = new Map<string, { amountMinor: number; sources: ReportSourceRef[] }>();

  for (const invoice of invoices) {
    if (invoice.status === "void" || invoice.currency !== currency) {
      continue;
    }

    const bucket = buckets.get(invoice.customerId) ?? { amountMinor: 0, sources: [] };
    bucket.amountMinor += invoice.totals.total.amountMinor;
    bucket.sources.push(invoiceSource(invoice));
    buckets.set(invoice.customerId, bucket);
  }

  return [...buckets.entries()]
    .map(([customerId, bucket]) => ({
      id: customerId,
      label: customerById.get(customerId)?.name ?? customerId,
      amount: { amountMinor: bucket.amountMinor, currency },
      sources: bucket.sources,
    }))
    .sort((left, right) => right.amount.amountMinor - left.amount.amountMinor);
}

function expensesByCategory(transactions: readonly Transaction[], currency: string) {
  const buckets = new Map<string, { amountMinor: number; sources: ReportSourceRef[] }>();

  for (const transaction of transactions) {
    if (transaction.money.currency !== currency || transaction.money.amountMinor >= 0) {
      continue;
    }

    const categoryId = transaction.categoryId ?? "uncategorized";
    const bucket = buckets.get(categoryId) ?? { amountMinor: 0, sources: [] };
    bucket.amountMinor += transaction.money.amountMinor;
    bucket.sources.push(transactionSource(transaction));
    buckets.set(categoryId, bucket);
  }

  return [...buckets.entries()]
    .map(([categoryId, bucket]) => ({
      id: categoryId,
      label: categoryId,
      amount: { amountMinor: bucket.amountMinor, currency },
      sources: bucket.sources,
    }))
    .sort((left, right) => left.amount.amountMinor - right.amount.amountMinor);
}

export function unpaidInvoices(
  invoices: readonly InvoiceDraft[],
  customerById: Map<string, Customer>,
  currency: string,
) {
  return invoices
    .filter(
      (invoice) =>
        invoice.currency === currency &&
        invoice.status !== "paid" &&
        invoice.status !== "void" &&
        invoice.totals.total.amountMinor > invoice.amountPaid.amountMinor,
    )
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: customerById.get(invoice.customerId)?.name ?? invoice.customerId,
      amountDue: {
        amountMinor: invoice.totals.total.amountMinor - invoice.amountPaid.amountMinor,
        currency,
      },
      dueDate: invoice.dueDate,
      sources: [invoiceSource(invoice)],
    }))
    .sort((left, right) => right.amountDue.amountMinor - left.amountDue.amountMinor);
}

function taxSummary(invoices: readonly InvoiceDraft[], currency: string) {
  const taxInvoices = invoices.filter(
    (invoice) => invoice.currency === currency && invoice.status !== "void",
  );

  return {
    invoiceTax: {
      amountMinor: taxInvoices.reduce(
        (total, invoice) => total + invoice.totals.tax.amountMinor,
        0,
      ),
      currency,
    },
    sources: taxInvoices.map(invoiceSource),
  };
}

function inboxBacklog(inboxItems: readonly InboxItem[]) {
  const pendingExtraction = inboxItems.filter((item) => item.extractionStatus === "pending").length;
  const needsReview = inboxItems.filter((item) => item.status === "needs_review").length;
  const suggestedMatches = inboxItems.reduce(
    (total, item) =>
      total +
      (item.matchSuggestions?.filter((suggestion) => suggestion.status === "suggested").length ??
        0),
    0,
  );

  return {
    pendingExtraction,
    needsReview,
    suggestedMatches,
    sources: inboxItems
      .filter((item) => item.status !== "resolved")
      .map((item) => ({
        type: "inbox_item" as const,
        id: item.id,
        label: item.document?.title ?? item.source?.name ?? item.id,
      })),
  };
}

export function invoiceSource(invoice: InvoiceDraft): ReportSourceRef {
  return {
    type: "invoice",
    id: invoice.id,
    label: invoice.invoiceNumber,
  };
}

export function documentSource(document: BusinessDocument): ReportSourceRef {
  return {
    type: "document",
    id: document.id,
    label: document.title,
  };
}

export function customerSource(customer: Customer): ReportSourceRef {
  return {
    type: "customer",
    id: customer.id,
    label: customer.name,
  };
}

export function productSource(product: Product): ReportSourceRef {
  return {
    type: "product",
    id: product.id,
    label: product.name,
  };
}

export function projectSource(project: Project): ReportSourceRef {
  return {
    type: "project",
    id: project.id,
    label: project.name,
  };
}

export function inboxItemSource(item: InboxItem): ReportSourceRef {
  return {
    type: "inbox_item",
    id: item.id,
    label: item.document?.title ?? item.source?.name ?? item.id,
  };
}

export function transactionSource(transaction: Transaction): ReportSourceRef {
  return {
    type: "transaction",
    id: transaction.id,
    label: transaction.description,
  };
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  notFoundMessage: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", notFoundMessage);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
