import { describe, expect, test } from "bun:test";

import {
  createCustomer,
  createDraftInvoice,
  createProduct,
  listBillingWorkspace,
  updateDraftInvoice,
  type DawnRepository,
} from "./index";
import type {
  Actor,
  Customer,
  CustomerContact,
  InvoiceDraft,
  InvoiceLineDraft,
  Product,
  TeamRole,
} from "@dawn/domain";
import { calculateInvoiceTotals } from "@dawn/domain";

class MemoryBillingRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  customers = new Map<string, Customer>();
  contacts = new Map<string, CustomerContact>();
  products = new Map<string, Product>();
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

  async listCustomerContacts(teamId: string) {
    return [...this.contacts.values()].filter((contact) => contact.teamId === teamId);
  }

  async listProducts(teamId: string) {
    return [...this.products.values()].filter((product) => product.teamId === teamId);
  }

  async listDraftInvoices(teamId: string) {
    return [...this.invoices.values()].filter(
      (invoice) => invoice.teamId === teamId && invoice.status === "draft",
    );
  }

  async getCustomerForTeam(teamId: string, customerId: string) {
    const customer = this.customers.get(customerId);
    return customer?.teamId === teamId ? customer : null;
  }

  async getProductForTeam(teamId: string, productId: string) {
    const product = this.products.get(productId);
    return product?.teamId === teamId ? product : null;
  }

  async getInvoiceForTeam(teamId: string, invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    return invoice?.teamId === teamId ? invoice : null;
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
});
