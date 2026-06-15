import { describe, expect, test } from "bun:test";

import {
  createCustomer,
  createInvoiceFromTimeEntries,
  createProject,
  createTimeEntry,
  listProjectWorkspace,
  type DawnRepository,
} from "./index";
import type {
  Actor,
  Customer,
  InvoiceDraft,
  InvoiceLineDraft,
  Project,
  ProjectMember,
  TeamRole,
  TimeEntry,
} from "@dawn/domain";
import { calculateInvoiceTotals } from "@dawn/domain";

class MemoryProjectRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  customers = new Map<string, Customer>();
  projects = new Map<string, Project>();
  projectMembers = new Map<string, ProjectMember>();
  timeEntries = new Map<string, TimeEntry>();
  invoices = new Map<string, InvoiceDraft>();
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    return actor.id === this.actor.id && teamId === "team_1" ? { role: this.role } : null;
  }

  async listCustomers(teamId: string) {
    return [...this.customers.values()].filter((customer) => customer.teamId === teamId);
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const customer = this.customers.get(customerId);
    return customer?.teamId === teamId ? customer : null;
  }

  async createCustomer(input: {
    customerId: string;
    teamId: string;
    name: string;
    email?: string | null;
    billingAddress?: string | null;
  }) {
    const customer: Customer = {
      id: input.customerId,
      teamId: input.teamId,
      name: input.name,
      email: input.email ?? null,
      billingAddress: input.billingAddress ?? null,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.customers.set(customer.id, customer);
    return { customer, contact: null };
  }

  async listProjects(teamId: string) {
    return [...this.projects.values()].filter((project) => project.teamId === teamId);
  }

  async listProjectMembers(teamId: string) {
    return [...this.projectMembers.values()].filter((member) => member.teamId === teamId);
  }

  async listTimeEntries(teamId: string) {
    return [...this.timeEntries.values()].filter((entry) => entry.teamId === teamId);
  }

  async getProjectForTeam(teamId: string, projectId: string) {
    const project = this.projects.get(projectId);
    return project?.teamId === teamId ? project : null;
  }

  async getTimeEntriesForTeam(teamId: string, timeEntryIds: string[]) {
    return timeEntryIds
      .map((timeEntryId) => this.timeEntries.get(timeEntryId))
      .filter((entry): entry is TimeEntry => entry !== undefined && entry.teamId === teamId);
  }

  async createProject(input: {
    projectId: string;
    memberId: string;
    teamId: string;
    customerId: string;
    name: string;
    description?: string | null;
    billableRate: Project["billableRate"];
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const project: Project = {
      id: input.projectId,
      teamId: input.teamId,
      customerId: input.customerId,
      name: input.name,
      description: input.description ?? null,
      status: "active",
      billableRate: input.billableRate,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    const member: ProjectMember = {
      id: input.memberId,
      teamId: input.teamId,
      projectId: input.projectId,
      actorId: input.createdByActorId,
      role: "manager",
      billableRate: input.billableRate,
      createdAt: now,
    };
    this.projects.set(project.id, project);
    this.projectMembers.set(member.id, member);
    return { project, member };
  }

  async createTimeEntry(input: {
    timeEntryId: string;
    teamId: string;
    projectId: string;
    actorId: string;
    description: string;
    occurredOn: string;
    durationMinutes: number;
    billableStatus: TimeEntry["billableStatus"];
    billableRate?: TimeEntry["billableRate"];
  }) {
    const timeEntry: TimeEntry = {
      id: input.timeEntryId,
      teamId: input.teamId,
      projectId: input.projectId,
      actorId: input.actorId,
      description: input.description,
      occurredOn: input.occurredOn,
      durationMinutes: input.durationMinutes,
      billableStatus: input.billableStatus,
      billableRate: input.billableRate ?? null,
      invoiceId: null,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.timeEntries.set(timeEntry.id, timeEntry);
    return timeEntry;
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
    const calculated = calculateInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });
    const invoice: InvoiceDraft = {
      id: input.invoiceId,
      teamId: input.teamId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      status: "draft",
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      notes: input.notes ?? null,
      lines: input.lines.map((line, index) => ({
        id: `line_${index + 1}`,
        invoiceId: input.invoiceId,
        productId: line.productId ?? null,
        description: line.description,
        quantityMilli: line.quantityMilli,
        unitPrice: line.unitPrice,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
        sortOrder: index,
        totals: calculated.lines[index]!,
      })),
      totals: calculated.totals,
      amountPaid: { amountMinor: 0, currency: input.currency },
      createdByActorId: input.createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async markTimeEntriesInvoiced(input: {
    teamId: string;
    timeEntryIds: string[];
    invoiceId: string;
  }) {
    return input.timeEntryIds.map((timeEntryId) => {
      const entry = this.timeEntries.get(timeEntryId);

      if (!entry || entry.teamId !== input.teamId) {
        throw new Error("Time entry not found");
      }

      const invoiced: TimeEntry = {
        ...entry,
        billableStatus: "invoiced",
        invoiceId: input.invoiceId,
      };
      this.timeEntries.set(invoiced.id, invoiced);
      return invoiced;
    });
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

describe("project time use cases", () => {
  test("creates projects, tracks time, reports value, and invoices billable entries", async () => {
    const repository = new MemoryProjectRepository();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Acme Co",
      idempotencyKey: "customer_1",
    });
    const project = await createProject(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      customerId: customer.customer.id,
      name: "Website rebuild",
      billableRate: { amountMinor: 150_00, currency: "USD" },
      idempotencyKey: "project_1",
    });
    const billable = await createTimeEntry(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      projectId: project.project.id,
      description: "Design review",
      occurredOn: "2026-06-15T00:00:00.000Z",
      durationMinutes: 90,
      billableStatus: "billable",
      idempotencyKey: "time_1",
    });
    await createTimeEntry(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      projectId: project.project.id,
      description: "Internal planning",
      occurredOn: "2026-06-15T00:00:00.000Z",
      durationMinutes: 30,
      billableStatus: "non_billable",
      idempotencyKey: "time_2",
    });
    const workspace = await listProjectWorkspace(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
    });
    const invoice = await createInvoiceFromTimeEntries(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        customerId: customer.customer.id,
        invoiceNumber: "INV-TIME-001",
        issueDate: "2026-06-16T00:00:00.000Z",
        timeEntryIds: [billable.timeEntry.id],
        idempotencyKey: "invoice_time_1",
      },
    );

    expect(project.member).toMatchObject({ role: "manager", actorId: "user_1" });
    expect(workspace.report).toMatchObject({
      totalMinutes: 120,
      billableMinutes: 90,
      nonBillableMinutes: 30,
      billableValue: { amountMinor: 225_00, currency: "USD" },
    });
    expect(invoice.invoice.lines[0]).toMatchObject({
      description: "Website rebuild: Design review",
      quantityMilli: 1_500,
      unitPrice: { amountMinor: 150_00, currency: "USD" },
    });
    expect(invoice.timeEntries[0]).toMatchObject({
      billableStatus: "invoiced",
      invoiceId: invoice.invoice.id,
    });
    expect(repository.auditEvents).toHaveLength(5);
    expect(repository.outboxEvents).toHaveLength(5);
  });
});
