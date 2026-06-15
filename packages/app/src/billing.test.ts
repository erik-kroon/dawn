import { describe, expect, test } from "bun:test";

import {
  createDeterministicInvoicePdfRenderer,
  createCustomer,
  createDraftInvoice,
  createProduct,
  createRecurringInvoiceSchedule,
  generateRecurringInvoice,
  listBillingWorkspace,
  previewInvoicePdf,
  recordInvoicePayment,
  sendInvoice,
  sendInvoiceReminder,
  updateDraftInvoice,
  type DawnRepository,
} from "./index";
import type {
  Actor,
  Customer,
  CustomerContact,
  InvoiceDraft,
  InvoiceEvent,
  InvoiceLineDraft,
  InvoicePayment,
  Product,
  RecurringInvoiceSchedule,
  TeamRole,
} from "@dawn/domain";
import { calculateInvoiceTotals } from "@dawn/domain";
import { createMockInvoiceEmailDeliveryProvider } from "@dawn/integrations";

class MemoryBillingRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  customers = new Map<string, Customer>();
  contacts = new Map<string, CustomerContact>();
  products = new Map<string, Product>();
  invoices = new Map<string, InvoiceDraft>();
  payments = new Map<string, InvoicePayment>();
  invoiceEvents = new Map<string, InvoiceEvent>();
  schedules = new Map<string, RecurringInvoiceSchedule>();
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

  async listCustomerContacts(teamId: string) {
    return [...this.contacts.values()].filter((contact) => contact.teamId === teamId);
  }

  async listProducts(teamId: string) {
    return [...this.products.values()].filter((product) => product.teamId === teamId);
  }

  async listInvoices(teamId: string) {
    return [...this.invoices.values()].filter((invoice) => invoice.teamId === teamId);
  }

  async listDraftInvoices(teamId: string) {
    return [...this.invoices.values()].filter(
      (invoice) => invoice.teamId === teamId && invoice.status === "draft",
    );
  }

  async listInvoicePayments(teamId: string) {
    return [...this.payments.values()].filter((payment) => payment.teamId === teamId);
  }

  async listRecurringInvoiceSchedules(teamId: string) {
    return [...this.schedules.values()].filter((schedule) => schedule.teamId === teamId);
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const customer = this.customers.get(customerId);
    return customer?.teamId === teamId ? customer : null;
  }

  async getCustomerContactForCustomer(teamId: string, customerId: string) {
    return (
      [...this.contacts.values()].find(
        (contact) => contact.teamId === teamId && contact.customerId === customerId,
      ) ?? null
    );
  }

  async getProductForTeam(teamId: string, productId: string) {
    const product = this.products.get(productId);
    return product?.teamId === teamId ? product : null;
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    return invoice?.teamId === teamId ? invoice : null;
  }

  async getRecurringInvoiceScheduleForTeam(teamId: string, scheduleId: string) {
    const schedule = this.schedules.get(scheduleId);
    return schedule?.teamId === teamId ? schedule : null;
  }

  async createCustomer(input: {
    customerId: string;
    contactId?: string | null;
    teamId: string;
    name: string;
    email?: string | null;
    billingAddress?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactRole?: string | null;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const customer: Customer = {
      id: input.customerId,
      teamId: input.teamId,
      name: input.name,
      email: input.email ?? null,
      billingAddress: input.billingAddress ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const contact =
      input.contactId && input.contactName && input.contactEmail
        ? {
            id: input.contactId,
            teamId: input.teamId,
            customerId: input.customerId,
            name: input.contactName,
            email: input.contactEmail,
            role: input.contactRole ?? null,
            createdAt: now,
          }
        : null;
    this.customers.set(customer.id, customer);

    if (contact) {
      this.contacts.set(contact.id, contact);
    }

    return { customer, contact };
  }

  async createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: Product["type"];
    description?: string | null;
    unitPrice: Product["unitPrice"];
    defaultTaxRateBasisPoints: number;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const product: Product = {
      id: input.productId,
      teamId: input.teamId,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      unitPrice: input.unitPrice,
      defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints,
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    return product;
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
    const invoice = this.invoiceFromInput(input.invoiceId, input, input.createdByActorId);
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async updateDraftInvoice(input: {
    teamId: string;
    invoiceId: string;
    customerId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    discountBasisPoints: number;
    notes?: string | null;
    lines: InvoiceLineDraft[];
  }) {
    const existing = this.invoices.get(input.invoiceId);
    const invoice = this.invoiceFromInput(
      input.invoiceId,
      input,
      existing?.createdByActorId ?? "user_1",
    );
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }) {
    const invoice = this.invoices.get(input.invoiceId);

    if (!invoice || invoice.teamId !== input.teamId) {
      throw new Error("Invoice was not sent");
    }

    const sent: InvoiceDraft = {
      ...invoice,
      status: "sent",
      sentAt: input.sentAt,
      deliveryToEmail: input.toEmail,
      deliveryProviderMessageId: input.providerMessageId,
      updatedAt: input.sentAt,
    };
    this.invoices.set(sent.id, sent);
    return sent;
  }

  async recordInvoicePayment(input: {
    paymentId: string;
    teamId: string;
    invoiceId: string;
    amount: InvoicePayment["amount"];
    paidAt: string;
    method?: string | null;
    note?: string | null;
    createdByActorId: string;
    nextInvoiceStatus: InvoiceDraft["status"];
    nextAmountPaid: InvoicePayment["amount"];
    invoicePaidAt?: string | null;
  }) {
    const invoice = this.invoices.get(input.invoiceId);

    if (!invoice || invoice.teamId !== input.teamId) {
      throw new Error("Invoice payment did not update invoice");
    }

    const payment: InvoicePayment = {
      id: input.paymentId,
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      paidAt: input.paidAt,
      method: input.method ?? null,
      note: input.note ?? null,
      createdByActorId: input.createdByActorId,
      createdAt: input.paidAt,
    };
    const updated: InvoiceDraft = {
      ...invoice,
      status: input.nextInvoiceStatus,
      amountPaid: input.nextAmountPaid,
      paidAt: input.invoicePaidAt ?? null,
      updatedAt: input.paidAt,
    };
    this.payments.set(payment.id, payment);
    this.invoices.set(updated.id, updated);
    return { invoice: updated, payment };
  }

  async createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: InvoiceEvent["type"];
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }) {
    const event: InvoiceEvent = {
      id: input.eventId,
      teamId: input.teamId,
      invoiceId: input.invoiceId,
      type: input.type,
      occurredAt: input.occurredAt,
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    };
    this.invoiceEvents.set(event.id, event);
    return event;
  }

  async createRecurringInvoiceSchedule(input: {
    scheduleId: string;
    teamId: string;
    sourceInvoiceId: string;
    customerId: string;
    frequency: RecurringInvoiceSchedule["frequency"];
    nextRunAt: string;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const schedule: RecurringInvoiceSchedule = {
      id: input.scheduleId,
      teamId: input.teamId,
      sourceInvoiceId: input.sourceInvoiceId,
      customerId: input.customerId,
      frequency: input.frequency,
      nextRunAt: input.nextRunAt,
      status: "active",
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    this.schedules.set(schedule.id, schedule);
    return schedule;
  }

  async generateRecurringInvoice(input: {
    invoiceId: string;
    teamId: string;
    scheduleId: string;
    sourceInvoice: InvoiceDraft;
    runAt: string;
    nextRunAt: string;
    createdByActorId: string;
  }) {
    const schedule = this.schedules.get(input.scheduleId);

    if (!schedule || schedule.teamId !== input.teamId) {
      throw new Error("Recurring invoice schedule was not updated");
    }

    const invoice = this.invoiceFromInput(
      input.invoiceId,
      {
        teamId: input.teamId,
        customerId: input.sourceInvoice.customerId,
        invoiceNumber: `${input.sourceInvoice.invoiceNumber}-R20260715`,
        issueDate: input.runAt,
        dueDate: input.sourceInvoice.dueDate,
        currency: input.sourceInvoice.currency,
        discountBasisPoints: input.sourceInvoice.discountBasisPoints,
        notes: input.sourceInvoice.notes,
        lines: input.sourceInvoice.lines,
      },
      input.createdByActorId,
    );
    const nextSchedule = { ...schedule, nextRunAt: input.nextRunAt, updatedAt: input.runAt };
    this.invoices.set(invoice.id, invoice);
    this.schedules.set(nextSchedule.id, nextSchedule);
    return { invoice, schedule: nextSchedule };
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

  private invoiceFromInput(
    invoiceId: string,
    input: {
      teamId: string;
      customerId: string;
      invoiceNumber: string;
      issueDate: string;
      dueDate?: string | null;
      currency: string;
      discountBasisPoints: number;
      notes?: string | null;
      lines: InvoiceLineDraft[];
    },
    createdByActorId: string,
  ): InvoiceDraft {
    const calculated = calculateInvoiceTotals({
      currency: input.currency,
      discountBasisPoints: input.discountBasisPoints,
      lines: input.lines,
    });

    return {
      id: invoiceId,
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
        invoiceId,
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
      sentAt: null,
      viewedAt: null,
      paidAt: null,
      overdueAt: null,
      voidedAt: null,
      deliveryToEmail: null,
      deliveryProviderMessageId: null,
      createdByActorId,
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

describe("billing use cases", () => {
  test("creates customers with contacts and products with idempotency", async () => {
    const repository = new MemoryBillingRepository();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "  Acme Co  ",
      email: "BILLING@ACME.test",
      contactName: "Ada Buyer",
      contactEmail: "ADA@ACME.test",
      contactRole: "Finance",
      idempotencyKey: "customer_1",
    });
    const replayedCustomer = await createCustomer(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        name: "Acme Co",
        email: "billing@acme.test",
        contactName: "Ada Buyer",
        contactEmail: "ada@acme.test",
        contactRole: "Finance",
        idempotencyKey: "customer_1",
      },
    );
    const product = await createProduct(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Implementation",
      type: "service",
      unitPrice: { amountMinor: 50_00, currency: "usd" },
      defaultTaxRateBasisPoints: 2_500,
      idempotencyKey: "product_1",
    });

    expect(customer.customer).toMatchObject({ name: "Acme Co", email: "billing@acme.test" });
    expect(customer.contact).toMatchObject({ name: "Ada Buyer", email: "ada@acme.test" });
    expect(replayedCustomer.replayed).toBe(true);
    expect(product.product.unitPrice).toEqual({ amountMinor: 50_00, currency: "USD" });
    expect(repository.auditEvents).toHaveLength(2);
    expect(repository.outboxEvents).toHaveLength(2);
  });

  test("creates and edits draft invoices with domain totals", async () => {
    const repository = new MemoryBillingRepository();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Acme Co",
      idempotencyKey: "customer_1",
    });
    const product = await createProduct(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Implementation",
      type: "service",
      unitPrice: { amountMinor: 50_00, currency: "USD" },
      defaultTaxRateBasisPoints: 2_500,
      idempotencyKey: "product_1",
    });
    const created = await createDraftInvoice(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      customerId: customer.customer.id,
      invoiceNumber: "INV-001",
      issueDate: "2026-06-15T00:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
      currency: "USD",
      discountBasisPoints: 0,
      lines: [
        {
          productId: product.product.id,
          description: "Implementation",
          quantityMilli: 2_000,
          unitPrice: { amountMinor: 50_00, currency: "USD" },
          taxRateBasisPoints: 2_500,
        },
      ],
      idempotencyKey: "invoice_1",
    });
    const updated = await updateDraftInvoice(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      invoiceId: created.invoice.id,
      customerId: customer.customer.id,
      invoiceNumber: "INV-001",
      issueDate: "2026-06-15T00:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
      currency: "USD",
      discountBasisPoints: 1_000,
      lines: [
        {
          productId: product.product.id,
          description: "Implementation",
          quantityMilli: 2_000,
          unitPrice: { amountMinor: 50_00, currency: "USD" },
          taxRateBasisPoints: 2_500,
        },
      ],
      idempotencyKey: "invoice_update_1",
    });

    expect(created.invoice.totals.total).toEqual({ amountMinor: 125_00, currency: "USD" });
    expect(updated.invoice.totals.discount).toEqual({ amountMinor: 10_00, currency: "USD" });
    expect(updated.invoice.totals.total).toEqual({ amountMinor: 112_50, currency: "USD" });
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "invoice_draft.updated" });
  });

  test("lists billing workspace data and rejects non-draft edits", async () => {
    const repository = new MemoryBillingRepository();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Acme Co",
      idempotencyKey: "customer_1",
    });
    const created = await createDraftInvoice(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      customerId: customer.customer.id,
      invoiceNumber: "INV-001",
      issueDate: "2026-06-15T00:00:00.000Z",
      currency: "USD",
      lines: [
        {
          description: "Consulting",
          quantityMilli: 1_000,
          unitPrice: { amountMinor: 100_00, currency: "USD" },
        },
      ],
      idempotencyKey: "invoice_1",
    });
    repository.invoices.set(created.invoice.id, { ...created.invoice, status: "sent" });

    const workspace = await listBillingWorkspace(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
    });

    expect(workspace.customers).toHaveLength(1);
    expect(workspace.draftInvoices).toHaveLength(0);
    await expect(
      updateDraftInvoice(repository as unknown as DawnRepository, context, {
        teamId: "team_1",
        invoiceId: created.invoice.id,
        customerId: customer.customer.id,
        invoiceNumber: "INV-001",
        issueDate: "2026-06-15T00:00:00.000Z",
        currency: "USD",
        lines: [
          {
            description: "Consulting",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 100_00, currency: "USD" },
          },
        ],
        idempotencyKey: "invoice_update_1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Only draft invoices can be edited",
    });
  });

  test("previews, sends, pays, and recurs invoices", async () => {
    const repository = new MemoryBillingRepository();
    repository.role = "admin";
    const renderer = createDeterministicInvoicePdfRenderer();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Acme Co",
      email: "billing@acme.test",
      idempotencyKey: "customer_1",
    });
    const created = await createDraftInvoice(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      customerId: customer.customer.id,
      invoiceNumber: "INV-001",
      issueDate: "2026-06-15T00:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
      currency: "USD",
      lines: [
        {
          description: "Consulting",
          quantityMilli: 1_000,
          unitPrice: { amountMinor: 100_00, currency: "USD" },
        },
      ],
      idempotencyKey: "invoice_1",
    });
    const preview = await previewInvoicePdf(
      repository as unknown as DawnRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        invoiceId: created.invoice.id,
      },
    );
    const sent = await sendInvoice(
      repository as unknown as DawnRepository,
      renderer,
      createMockInvoiceEmailDeliveryProvider(),
      context,
      {
        teamId: "team_1",
        invoiceId: created.invoice.id,
        confirm: true,
        idempotencyKey: "send_1",
      },
    );
    const partial = await recordInvoicePayment(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      invoiceId: created.invoice.id,
      amount: { amountMinor: 40_00, currency: "USD" },
      paidAt: "2026-06-20T00:00:00.000Z",
      idempotencyKey: "payment_1",
    });
    const paid = await recordInvoicePayment(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      invoiceId: created.invoice.id,
      amount: { amountMinor: 60_00, currency: "USD" },
      paidAt: "2026-06-21T00:00:00.000Z",
      idempotencyKey: "payment_2",
    });
    const schedule = await createRecurringInvoiceSchedule(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        sourceInvoiceId: created.invoice.id,
        frequency: "monthly",
        nextRunAt: "2026-07-15T00:00:00.000Z",
        idempotencyKey: "schedule_1",
      },
    );
    const generated = await generateRecurringInvoice(repository as unknown as DawnRepository, {
      teamId: "team_1",
      scheduleId: schedule.schedule.id,
      runAt: "2026-07-15T00:00:00.000Z",
      idempotencyKey: "recurring_job_1",
    });

    expect(Buffer.from(preview.pdf.bodyBase64, "base64").toString().startsWith("%PDF-1.4")).toBe(
      true,
    );
    expect(sent.invoice).toMatchObject({
      status: "sent",
      deliveryToEmail: "billing@acme.test",
      deliveryProviderMessageId: "mock_email_team_1_" + created.invoice.id,
    });
    expect(partial.invoice.status).toBe("partially_paid");
    expect(paid.invoice.status).toBe("paid");
    expect(repository.invoiceEvents.size).toBe(4);
    expect(generated.invoice.invoiceNumber).toBe("INV-001-R20260715");
    expect(generated.schedule.nextRunAt).toBe("2026-08-15T00:00:00.000Z");
  });

  test("sends invoice reminders for open sent invoices", async () => {
    const repository = new MemoryBillingRepository();
    repository.role = "admin";
    const renderer = createDeterministicInvoicePdfRenderer();
    const emailProvider = createMockInvoiceEmailDeliveryProvider();
    const customer = await createCustomer(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      name: "Acme Co",
      email: "billing@acme.test",
      idempotencyKey: "customer_1",
    });
    const created = await createDraftInvoice(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      customerId: customer.customer.id,
      invoiceNumber: "INV-REM-001",
      issueDate: "2026-06-15T00:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
      currency: "USD",
      lines: [
        {
          description: "Consulting",
          quantityMilli: 1_000,
          unitPrice: { amountMinor: 100_00, currency: "USD" },
        },
      ],
      idempotencyKey: "invoice_1",
    });

    await sendInvoice(repository as unknown as DawnRepository, renderer, emailProvider, context, {
      teamId: "team_1",
      invoiceId: created.invoice.id,
      confirm: true,
      idempotencyKey: "send_1",
    });

    const reminder = await sendInvoiceReminder(
      repository as unknown as DawnRepository,
      renderer,
      emailProvider,
      context,
      {
        teamId: "team_1",
        invoiceId: created.invoice.id,
        confirm: true,
        idempotencyKey: "reminder_1",
      },
    );
    const replayed = await sendInvoiceReminder(
      repository as unknown as DawnRepository,
      renderer,
      emailProvider,
      context,
      {
        teamId: "team_1",
        invoiceId: created.invoice.id,
        confirm: true,
        idempotencyKey: "reminder_1",
      },
    );
    const events = [...repository.invoiceEvents.values()];

    expect(reminder.invoice.status).toBe("sent");
    expect(reminder.providerMessageId).toBe("mock_email_team_1_" + created.invoice.id);
    expect(replayed.replayed).toBe(true);
    expect(events.map((event) => event.type)).toEqual(["invoice.sent", "invoice.reminder_sent"]);
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "invoice.reminder.sent" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "invoice.reminder_sent" });
  });
});
