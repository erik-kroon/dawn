import type {
  Customer,
  CustomerContact,
  InvoiceDraft,
  InvoiceDraftInput,
  InvoiceEvent,
  InvoiceLineDraft,
  InvoicePayment,
  Money,
  Product,
  ProductType,
  RecurringInvoiceFrequency,
  RecurringInvoiceSchedule,
} from "@dawn/domain";
import {
  assertCanEditInvoiceDraft,
  assertCanSendInvoice,
  assertCanSendInvoiceReminder,
  assertInvoiceDraftInput,
  formatMoney,
  invoiceStatusAfterPayment,
  markInvoiceSent,
  nextRecurringInvoiceRun,
} from "@dawn/domain";
import type { InvoiceEmailDeliveryProvider } from "@dawn/integrations";

import {
  AppError,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

type NormalizedInvoiceDraftInput = Omit<InvoiceDraftInput, "discountBasisPoints" | "lines"> & {
  discountBasisPoints: number;
  lines: InvoiceLineDraft[];
};

export type BillingWorkspace = {
  teamId: string;
  customers: Customer[];
  contacts: CustomerContact[];
  products: Product[];
  invoices: InvoiceDraft[];
  draftInvoices: InvoiceDraft[];
  payments: InvoicePayment[];
  recurringSchedules: RecurringInvoiceSchedule[];
};

export type CreateCustomerCommand = {
  teamId: string;
  name: string;
  email?: string | null;
  billingAddress?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactRole?: string | null;
  idempotencyKey: string;
};

export type CreateCustomerResult = {
  customer: Customer;
  contact?: CustomerContact | null;
  replayed: boolean;
};

export type CreateProductCommand = {
  teamId: string;
  name: string;
  type: ProductType;
  description?: string | null;
  unitPrice: Money;
  defaultTaxRateBasisPoints?: number | null;
  idempotencyKey: string;
};

export type CreateProductResult = {
  product: Product;
  replayed: boolean;
};

export type CreateDraftInvoiceCommand = InvoiceDraftInput & {
  idempotencyKey: string;
};

export type CreateDraftInvoiceResult = {
  invoice: InvoiceDraft;
  replayed: boolean;
};

export type UpdateDraftInvoiceCommand = InvoiceDraftInput & {
  invoiceId: string;
  idempotencyKey: string;
};

export type UpdateDraftInvoiceResult = {
  invoice: InvoiceDraft;
  replayed: boolean;
};

export type InvoicePdfDocument = {
  fileName: string;
  contentType: "application/pdf";
  bodyBase64: string;
  byteSize: number;
};

export type InvoicePdfRenderer = {
  render(input: {
    invoice: InvoiceDraft;
    customer: Customer;
    contact?: CustomerContact | null;
  }): Promise<InvoicePdfDocument>;
};

export type PreviewInvoicePdfCommand = {
  teamId: string;
  invoiceId: string;
};

export type PreviewInvoicePdfResult = {
  invoice: InvoiceDraft;
  pdf: InvoicePdfDocument;
};

export type SendInvoiceCommand = {
  teamId: string;
  invoiceId: string;
  toEmail?: string | null;
  subject?: string | null;
  message?: string | null;
  confirm: boolean;
  idempotencyKey: string;
};

export type SendInvoiceResult = {
  invoice: InvoiceDraft;
  providerMessageId: string;
  replayed: boolean;
};

export type SendInvoiceReminderCommand = {
  teamId: string;
  invoiceId: string;
  toEmail?: string | null;
  subject?: string | null;
  message?: string | null;
  confirm: boolean;
  idempotencyKey: string;
};

export type SendInvoiceReminderResult = {
  invoice: InvoiceDraft;
  providerMessageId: string;
  replayed: boolean;
};

export type RecordInvoicePaymentCommand = {
  teamId: string;
  invoiceId: string;
  amount: Money;
  paidAt: string;
  method?: string | null;
  note?: string | null;
  idempotencyKey: string;
};

export type RecordInvoicePaymentResult = {
  invoice: InvoiceDraft;
  payment: InvoicePayment;
  replayed: boolean;
};

export type CreateRecurringInvoiceScheduleCommand = {
  teamId: string;
  sourceInvoiceId: string;
  frequency: RecurringInvoiceFrequency;
  nextRunAt: string;
  idempotencyKey: string;
};

export type CreateRecurringInvoiceScheduleResult = {
  schedule: RecurringInvoiceSchedule;
  replayed: boolean;
};

export type GenerateRecurringInvoiceCommand = {
  teamId: string;
  scheduleId: string;
  runAt: string;
  idempotencyKey: string;
};

export type GenerateRecurringInvoiceResult = {
  invoice: InvoiceDraft;
  schedule: RecurringInvoiceSchedule;
  replayed: boolean;
};

export type BillingRepository = {
  listCustomers(teamId: string): Promise<Customer[]>;
  listCustomerContacts(teamId: string): Promise<CustomerContact[]>;
  listProducts(teamId: string): Promise<Product[]>;
  listInvoices(teamId: string): Promise<InvoiceDraft[]>;
  listDraftInvoices(teamId: string): Promise<InvoiceDraft[]>;
  listInvoicePayments(teamId: string): Promise<InvoicePayment[]>;
  listRecurringInvoiceSchedules(teamId: string): Promise<RecurringInvoiceSchedule[]>;
  getCustomerForTeam(teamId: string, customerId: string): Promise<Customer | null>;
  getCustomerContactForCustomer(
    teamId: string,
    customerId: string,
  ): Promise<CustomerContact | null>;
  getProductForTeam(teamId: string, productId: string): Promise<Product | null>;
  getInvoiceForTeam(teamId: string, invoiceId: string): Promise<InvoiceDraft | null>;
  getRecurringInvoiceScheduleForTeam(
    teamId: string,
    scheduleId: string,
  ): Promise<RecurringInvoiceSchedule | null>;
  createCustomer(input: {
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
  }): Promise<{ customer: Customer; contact?: CustomerContact | null }>;
  createProduct(input: {
    productId: string;
    teamId: string;
    name: string;
    type: ProductType;
    description?: string | null;
    unitPrice: Money;
    defaultTaxRateBasisPoints: number;
    createdByActorId: string;
  }): Promise<Product>;
  createDraftInvoice(input: {
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
  }): Promise<InvoiceDraft>;
  updateDraftInvoice(input: {
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
  }): Promise<InvoiceDraft>;
  markInvoiceSent(input: {
    teamId: string;
    invoiceId: string;
    sentAt: string;
    toEmail: string;
    providerMessageId: string;
  }): Promise<InvoiceDraft>;
  recordInvoicePayment(input: {
    paymentId: string;
    teamId: string;
    invoiceId: string;
    amount: Money;
    paidAt: string;
    method?: string | null;
    note?: string | null;
    createdByActorId: string;
    nextInvoiceStatus: InvoiceDraft["status"];
    nextAmountPaid: Money;
    invoicePaidAt?: string | null;
  }): Promise<{ invoice: InvoiceDraft; payment: InvoicePayment }>;
  createInvoiceEvent(input: {
    eventId: string;
    teamId: string;
    invoiceId: string;
    type: InvoiceEvent["type"];
    occurredAt: string;
    actorId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<InvoiceEvent>;
  createRecurringInvoiceSchedule(input: {
    scheduleId: string;
    teamId: string;
    sourceInvoiceId: string;
    customerId: string;
    frequency: RecurringInvoiceFrequency;
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<RecurringInvoiceSchedule>;
  generateRecurringInvoice(input: {
    invoiceId: string;
    teamId: string;
    scheduleId: string;
    sourceInvoice: InvoiceDraft;
    runAt: string;
    nextRunAt: string;
    createdByActorId: string;
  }): Promise<{ invoice: InvoiceDraft; schedule: RecurringInvoiceSchedule }>;
};

export type BillingUseCaseRepository = TransactionReviewRepository & BillingRepository;

const createCustomerOperation = "customer.create";
const createProductOperation = "product.create";
const createDraftInvoiceOperation = "invoice.draft.create";
const updateDraftInvoiceOperation = "invoice.draft.update";
const sendInvoiceOperation = "invoice.send";
const sendInvoiceReminderOperation = "invoice.reminder.send";
const recordInvoicePaymentOperation = "invoice.payment.record";
const createRecurringInvoiceScheduleOperation = "invoice.recurring.create";
const generateRecurringInvoiceOperation = "invoice.recurring.generate";

export async function listBillingWorkspace(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  input: { teamId?: string } = {},
): Promise<BillingWorkspace> {
  const access = await resolveTeamAccess(
    repository,
    { ...context, teamId: input.teamId ?? context.teamId },
    "invoices.read",
    "You cannot read billing data for this team",
  );
  const [customers, contacts, products, invoices, payments, recurringSchedules] = await Promise.all(
    [
      repository.listCustomers(access.teamId),
      repository.listCustomerContacts(access.teamId),
      repository.listProducts(access.teamId),
      repository.listInvoices(access.teamId),
      repository.listInvoicePayments(access.teamId),
      repository.listRecurringInvoiceSchedules(access.teamId),
    ],
  );
  const draftInvoices = invoices.filter((invoice) => invoice.status === "draft");

  return {
    teamId: access.teamId,
    customers,
    contacts,
    products,
    invoices,
    draftInvoices,
    payments,
    recurringSchedules,
  };
}

export async function createCustomer(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateCustomerCommand,
): Promise<CreateCustomerResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Customer not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create customers for this team",
    );

    const normalized = normalizeCreateCustomerCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createCustomerOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different customer");
      }

      return { ...(replayed.result as CreateCustomerResult), replayed: true };
    }

    const result = await billingRepository.createCustomer({
      customerId: crypto.randomUUID(),
      contactId: normalized.contactEmail ? crypto.randomUUID() : null,
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "customer.created",
      entityType: "customer",
      entityId: result.customer.id,
      metadata: {
        contactId: result.contact?.id ?? null,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "customer.created",
      version: 1,
      payload: {
        customerId: result.customer.id,
        contactId: result.contact?.id ?? null,
      },
    });

    const finalResult = { ...result, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createCustomerOperation,
      key: command.idempotencyKey,
      fingerprint,
      result: finalResult,
    });

    return finalResult;
  });
}

export async function createProduct(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateProductCommand,
): Promise<CreateProductResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Product not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create products for this team",
    );

    const normalized = normalizeCreateProductCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createProductOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different product");
      }

      return { ...(replayed.result as CreateProductResult), replayed: true };
    }

    const product = await billingRepository.createProduct({
      productId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      metadata: {
        type: product.type,
        unitPrice: product.unitPrice,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "product.created",
      version: 1,
      payload: {
        productId: product.id,
      },
    });

    const result = { product, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createProductOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createDraftInvoice(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateDraftInvoiceCommand,
): Promise<CreateDraftInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create invoice drafts for this team",
    );

    const normalized = normalizeInvoiceDraftInput(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createDraftInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invoice draft",
        );
      }

      return { ...(replayed.result as CreateDraftInvoiceResult), replayed: true };
    }

    await assertInvoiceReferencesExist(billingRepository, normalized);
    assertInvoiceDraftInput(normalized);

    const invoice = await billingRepository.createDraftInvoice({
      invoiceId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_draft.created",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.totals.total,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice_draft.created",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        total: invoice.totals.total,
      },
    });

    const result = { invoice, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createDraftInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateDraftInvoice(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateDraftInvoiceCommand,
): Promise<UpdateDraftInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot edit invoice drafts for this team",
    );

    const normalized = normalizeInvoiceDraftInput(command);
    const fingerprint = JSON.stringify({
      invoiceId: command.invoiceId,
      ...normalized,
    });
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateDraftInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different invoice draft update",
        );
      }

      return { ...(replayed.result as UpdateDraftInvoiceResult), replayed: true };
    }

    const existing = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!existing) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    try {
      assertCanEditInvoiceDraft(existing);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    await assertInvoiceReferencesExist(billingRepository, normalized);
    assertInvoiceDraftInput(normalized);

    const invoice = await billingRepository.updateDraftInvoice({
      invoiceId: command.invoiceId,
      ...normalized,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_draft.updated",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.totals.total,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice_draft.updated",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        total: invoice.totals.total,
      },
    });

    const result = { invoice, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateDraftInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function previewInvoicePdf(
  repository: BillingUseCaseRepository,
  renderer: InvoicePdfRenderer,
  context: TransactionReviewContext,
  command: PreviewInvoicePdfCommand,
): Promise<PreviewInvoicePdfResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

  await resolveTeamAccess(
    repository,
    { ...context, teamId: command.teamId },
    "invoices.read",
    "You cannot preview invoices for this team",
  );

  const invoice = await repository.getInvoiceForTeam(command.teamId, command.invoiceId);

  if (!invoice) {
    throw new AppError("NOT_FOUND", "Invoice not found");
  }

  const customer = await repository.getCustomerForTeam(command.teamId, invoice.customerId);

  if (!customer) {
    throw new AppError("NOT_FOUND", "Customer not found");
  }

  const contact = await repository.getCustomerContactForCustomer(command.teamId, customer.id);
  const pdf = await renderer.render({ invoice, customer, contact });

  return { invoice, pdf };
}

export async function sendInvoice(
  repository: BillingUseCaseRepository,
  renderer: InvoicePdfRenderer,
  emailProvider: InvoiceEmailDeliveryProvider,
  context: TransactionReviewContext,
  command: SendInvoiceCommand,
): Promise<SendInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.send",
      "You cannot send invoices for this team",
    );

    if (!command.confirm) {
      throw new AppError("CONFLICT", "Invoice send requires explicit confirmation");
    }

    const normalized = {
      teamId: command.teamId,
      invoiceId: command.invoiceId,
      toEmail: normalizeOptionalEmail(command.toEmail),
      subject: command.subject?.trim() || null,
      message: command.message?.trim() || null,
      confirm: command.confirm,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      sendInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different send");
      }

      return { ...(replayed.result as SendInvoiceResult), replayed: true };
    }

    const invoice = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!invoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    try {
      assertCanSendInvoice(invoice);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const customer = await billingRepository.getCustomerForTeam(command.teamId, invoice.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    const contact = await billingRepository.getCustomerContactForCustomer(
      command.teamId,
      customer.id,
    );
    const toEmail = normalized.toEmail ?? contact?.email ?? customer.email;

    if (!toEmail) {
      throw new AppError("CONFLICT", "Invoice send requires a recipient email");
    }

    const pdf = await renderer.render({ invoice, customer, contact });
    const subject = normalized.subject ?? `Invoice ${invoice.invoiceNumber}`;
    const delivery = await emailProvider.sendInvoice({
      teamId: command.teamId,
      invoiceId: invoice.id,
      to: toEmail,
      subject,
      text: normalized.message ?? `Attached invoice ${invoice.invoiceNumber}`,
      attachment: {
        fileName: pdf.fileName,
        contentType: pdf.contentType,
        bodyBase64: pdf.bodyBase64,
      },
    });
    const sent = markInvoiceSent(invoice, delivery.acceptedAt);
    const stored = await billingRepository.markInvoiceSent({
      teamId: command.teamId,
      invoiceId: invoice.id,
      sentAt: sent.sentAt,
      toEmail,
      providerMessageId: delivery.providerMessageId,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      type: "invoice.sent",
      occurredAt: delivery.acceptedAt,
      actorId: context.actor.id,
      metadata: {
        toEmail,
        provider: emailProvider.provider,
        providerMessageId: delivery.providerMessageId,
      },
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice.sent",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        toEmail,
        providerMessageId: delivery.providerMessageId,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice.sent",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        toEmail,
        providerMessageId: delivery.providerMessageId,
      },
    });

    const result = {
      invoice: stored,
      providerMessageId: delivery.providerMessageId,
      replayed: false,
    };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: sendInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function sendInvoiceReminder(
  repository: BillingUseCaseRepository,
  renderer: InvoicePdfRenderer,
  emailProvider: InvoiceEmailDeliveryProvider,
  context: TransactionReviewContext,
  command: SendInvoiceReminderCommand,
): Promise<SendInvoiceReminderResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.send",
      "You cannot send invoice reminders for this team",
    );

    if (!command.confirm) {
      throw new AppError("CONFLICT", "Invoice reminder requires explicit confirmation");
    }

    const normalized = {
      teamId: command.teamId,
      invoiceId: command.invoiceId,
      toEmail: normalizeOptionalEmail(command.toEmail),
      subject: command.subject?.trim() || null,
      message: command.message?.trim() || null,
      confirm: command.confirm,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      sendInvoiceReminderOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different reminder");
      }

      return { ...(replayed.result as SendInvoiceReminderResult), replayed: true };
    }

    const invoice = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!invoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    try {
      assertCanSendInvoiceReminder(invoice);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const amountDueMinor = invoice.totals.total.amountMinor - invoice.amountPaid.amountMinor;

    if (amountDueMinor <= 0) {
      throw new AppError("CONFLICT", "Invoice reminder requires an outstanding balance");
    }

    const customer = await billingRepository.getCustomerForTeam(command.teamId, invoice.customerId);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    const contact = await billingRepository.getCustomerContactForCustomer(
      command.teamId,
      customer.id,
    );
    const toEmail =
      normalized.toEmail ?? invoice.deliveryToEmail ?? contact?.email ?? customer.email;

    if (!toEmail) {
      throw new AppError("CONFLICT", "Invoice reminder requires a recipient email");
    }

    const pdf = await renderer.render({ invoice, customer, contact });
    const amountDue = formatMoney({ amountMinor: amountDueMinor, currency: invoice.currency });
    const subject = normalized.subject ?? `Reminder: Invoice ${invoice.invoiceNumber}`;
    const delivery = await emailProvider.sendInvoice({
      teamId: command.teamId,
      invoiceId: invoice.id,
      to: toEmail,
      subject,
      text:
        normalized.message ??
        `Reminder for invoice ${invoice.invoiceNumber}. Amount due: ${amountDue}.`,
      attachment: {
        fileName: pdf.fileName,
        contentType: pdf.contentType,
        bodyBase64: pdf.bodyBase64,
      },
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      type: "invoice.reminder_sent",
      occurredAt: delivery.acceptedAt,
      actorId: context.actor.id,
      metadata: {
        toEmail,
        provider: emailProvider.provider,
        providerMessageId: delivery.providerMessageId,
        amountDue: { amountMinor: amountDueMinor, currency: invoice.currency },
      },
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice.reminder.sent",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        toEmail,
        providerMessageId: delivery.providerMessageId,
        amountDue: { amountMinor: amountDueMinor, currency: invoice.currency },
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice.reminder_sent",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        toEmail,
        providerMessageId: delivery.providerMessageId,
        amountDue: { amountMinor: amountDueMinor, currency: invoice.currency },
      },
    });

    const result = {
      invoice,
      providerMessageId: delivery.providerMessageId,
      replayed: false,
    };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: sendInvoiceReminderOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function recordInvoicePayment(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: RecordInvoicePaymentCommand,
): Promise<RecordInvoicePaymentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot record invoice payments for this team",
    );

    const normalized = {
      teamId: command.teamId,
      invoiceId: command.invoiceId,
      amount: { ...command.amount, currency: command.amount.currency.toUpperCase() },
      paidAt: command.paidAt,
      method: command.method?.trim() || null,
      note: command.note?.trim() || null,
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      recordInvoicePaymentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different payment");
      }

      return { ...(replayed.result as RecordInvoicePaymentResult), replayed: true };
    }

    const invoice = await billingRepository.getInvoiceForTeam(command.teamId, command.invoiceId);

    if (!invoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    let nextPaymentState: ReturnType<typeof invoiceStatusAfterPayment>;

    try {
      nextPaymentState = invoiceStatusAfterPayment({
        invoice,
        payment: normalized.amount,
        paidAt: normalized.paidAt,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const paymentResult = await billingRepository.recordInvoicePayment({
      paymentId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      amount: normalized.amount,
      paidAt: normalized.paidAt,
      method: normalized.method,
      note: normalized.note,
      createdByActorId: context.actor.id,
      nextInvoiceStatus: nextPaymentState.status,
      nextAmountPaid: nextPaymentState.amountPaid,
      invoicePaidAt: nextPaymentState.paidAt,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: invoice.id,
      type: "invoice.payment_recorded",
      occurredAt: normalized.paidAt,
      actorId: context.actor.id,
      metadata: {
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_payment.recorded",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "invoice.payment_recorded",
      version: 1,
      payload: {
        invoiceId: invoice.id,
        paymentId: paymentResult.payment.id,
        amount: normalized.amount,
        nextStatus: paymentResult.invoice.status,
      },
    });

    const result = { ...paymentResult, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: recordInvoicePaymentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createRecurringInvoiceSchedule(
  repository: BillingUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateRecurringInvoiceScheduleCommand,
): Promise<CreateRecurringInvoiceScheduleResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Invoice not found");

    await resolveTeamAccess(
      billingRepository,
      { ...context, teamId: command.teamId },
      "invoices.write",
      "You cannot create recurring invoice schedules for this team",
    );

    const normalized = {
      teamId: command.teamId,
      sourceInvoiceId: command.sourceInvoiceId,
      frequency: command.frequency,
      nextRunAt: new Date(command.nextRunAt).toISOString(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createRecurringInvoiceScheduleOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different recurring schedule",
        );
      }

      return { ...(replayed.result as CreateRecurringInvoiceScheduleResult), replayed: true };
    }

    const sourceInvoice = await billingRepository.getInvoiceForTeam(
      command.teamId,
      command.sourceInvoiceId,
    );

    if (!sourceInvoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    const schedule = await billingRepository.createRecurringInvoiceSchedule({
      scheduleId: crypto.randomUUID(),
      teamId: command.teamId,
      sourceInvoiceId: sourceInvoice.id,
      customerId: sourceInvoice.customerId,
      frequency: normalized.frequency,
      nextRunAt: normalized.nextRunAt,
      createdByActorId: context.actor.id,
    });

    await billingRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "recurring_invoice.created",
      entityType: "recurring_invoice",
      entityId: schedule.id,
      metadata: {
        sourceInvoiceId: sourceInvoice.id,
        frequency: schedule.frequency,
        nextRunAt: schedule.nextRunAt,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "recurring_invoice.schedule_created",
      version: 1,
      payload: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
        nextRunAt: schedule.nextRunAt,
      },
    });

    const result = { schedule, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createRecurringInvoiceScheduleOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function generateRecurringInvoice(
  repository: BillingUseCaseRepository,
  command: GenerateRecurringInvoiceCommand,
): Promise<GenerateRecurringInvoiceResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const billingRepository = transactionRepository as BillingUseCaseRepository;
    const actorId = "system:recurring-invoices";
    const normalized = {
      teamId: command.teamId,
      scheduleId: command.scheduleId,
      runAt: new Date(command.runAt).toISOString(),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await billingRepository.getIdempotencyResult(
      command.teamId,
      actorId,
      generateRecurringInvoiceOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different recurring invoice generation",
        );
      }

      return { ...(replayed.result as GenerateRecurringInvoiceResult), replayed: true };
    }

    const schedule = await billingRepository.getRecurringInvoiceScheduleForTeam(
      command.teamId,
      command.scheduleId,
    );

    if (!schedule || schedule.status !== "active") {
      throw new AppError("NOT_FOUND", "Recurring invoice schedule not found");
    }

    const sourceInvoice = await billingRepository.getInvoiceForTeam(
      command.teamId,
      schedule.sourceInvoiceId,
    );

    if (!sourceInvoice) {
      throw new AppError("NOT_FOUND", "Invoice not found");
    }

    const generated = await billingRepository.generateRecurringInvoice({
      invoiceId: crypto.randomUUID(),
      teamId: command.teamId,
      scheduleId: schedule.id,
      sourceInvoice,
      runAt: normalized.runAt,
      nextRunAt: nextRecurringInvoiceRun({
        frequency: schedule.frequency,
        from: normalized.runAt,
      }),
      createdByActorId: actorId,
    });

    await billingRepository.createInvoiceEvent({
      eventId: crypto.randomUUID(),
      teamId: command.teamId,
      invoiceId: generated.invoice.id,
      type: "recurring_invoice.generated",
      occurredAt: normalized.runAt,
      actorId,
      metadata: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
      },
    });

    await billingRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId,
      requestId: command.idempotencyKey,
      type: "recurring_invoice.generated",
      version: 1,
      payload: {
        scheduleId: schedule.id,
        sourceInvoiceId: sourceInvoice.id,
        invoiceId: generated.invoice.id,
      },
    });

    const result = { ...generated, replayed: false };

    await billingRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId,
      operation: generateRecurringInvoiceOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export function createDeterministicInvoicePdfRenderer(): InvoicePdfRenderer {
  return {
    async render(input) {
      const lines = input.invoice.lines
        .map(
          (line) =>
            `${line.description} ${line.quantityMilli / 1_000} ${line.totals.total.amountMinor}`,
        )
        .join("\\n");
      const pdfText = [
        "%PDF-1.4",
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
        `4 0 obj << /Length 120 >> stream\\nBT /F1 12 Tf 72 720 Td (${escapePdfText(
          `Invoice ${input.invoice.invoiceNumber} for ${input.customer.name}`,
        )}) Tj 0 -18 Td (${escapePdfText(`Total ${input.invoice.totals.total.amountMinor} ${input.invoice.currency}`)}) Tj 0 -18 Td (${escapePdfText(lines)}) Tj ET\\nendstream endobj`,
        "trailer << /Root 1 0 R >>",
        "%%EOF",
      ].join("\n");
      const bodyBase64 = Buffer.from(pdfText).toString("base64");

      return {
        fileName: `${input.invoice.invoiceNumber}.pdf`,
        contentType: "application/pdf",
        bodyBase64,
        byteSize: Buffer.byteLength(pdfText),
      };
    },
  };
}

function escapePdfText(value: string) {
  return value.replace(/[\\()]/g, (character) => `\\${character}`).replace(/\r?\n/g, " ");
}

function normalizeCreateCustomerCommand(command: CreateCustomerCommand) {
  const name = command.name.trim();
  const email = normalizeOptionalEmail(command.email);
  const billingAddress = command.billingAddress?.trim() || null;
  const contactName = command.contactName?.trim() || null;
  const contactEmail = normalizeOptionalEmail(command.contactEmail);
  const contactRole = command.contactRole?.trim() || null;

  if (!name) {
    throw new AppError("CONFLICT", "Customer name is required");
  }

  if ((contactName && !contactEmail) || (contactEmail && !contactName)) {
    throw new AppError("CONFLICT", "Customer contact requires both name and email");
  }

  return {
    teamId: command.teamId,
    name,
    email,
    billingAddress,
    contactName,
    contactEmail,
    contactRole,
  };
}

function normalizeCreateProductCommand(command: CreateProductCommand) {
  const name = command.name.trim();
  const description = command.description?.trim() || null;
  const defaultTaxRateBasisPoints = command.defaultTaxRateBasisPoints ?? 0;
  const unitPrice = {
    amountMinor: command.unitPrice.amountMinor,
    currency: command.unitPrice.currency.trim().toUpperCase(),
  };

  if (!name) {
    throw new AppError("CONFLICT", "Product name is required");
  }

  if (!["product", "service"].includes(command.type)) {
    throw new AppError("CONFLICT", "Product type is invalid");
  }

  try {
    assertInvoiceDraftInput({
      teamId: command.teamId,
      customerId: "customer_validation",
      invoiceNumber: "validation",
      issueDate: new Date(0).toISOString(),
      currency: unitPrice.currency,
      lines: [
        {
          description: name,
          quantityMilli: 1_000,
          unitPrice,
          taxRateBasisPoints: defaultTaxRateBasisPoints,
        },
      ],
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return {
    teamId: command.teamId,
    name,
    type: command.type,
    description,
    unitPrice,
    defaultTaxRateBasisPoints,
  };
}

function normalizeInvoiceDraftInput(
  command: CreateDraftInvoiceCommand | UpdateDraftInvoiceCommand,
): NormalizedInvoiceDraftInput {
  const currency = command.currency.trim().toUpperCase();
  const lines = command.lines.map((line) => ({
    productId: line.productId?.trim() || null,
    description: line.description.trim(),
    quantityMilli: line.quantityMilli,
    unitPrice: {
      amountMinor: line.unitPrice.amountMinor,
      currency: line.unitPrice.currency.trim().toUpperCase(),
    },
    discountBasisPoints: line.discountBasisPoints ?? 0,
    taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
  }));
  const normalized = {
    teamId: command.teamId,
    customerId: command.customerId.trim(),
    invoiceNumber: command.invoiceNumber.trim(),
    issueDate: new Date(command.issueDate).toISOString(),
    dueDate: command.dueDate ? new Date(command.dueDate).toISOString() : null,
    currency,
    discountBasisPoints: command.discountBasisPoints ?? 0,
    notes: command.notes?.trim() || null,
    lines,
  };

  try {
    assertInvoiceDraftInput(normalized);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return normalized;
}

async function assertInvoiceReferencesExist(
  repository: BillingUseCaseRepository,
  input: InvoiceDraftInput,
): Promise<void> {
  const customer = await repository.getCustomerForTeam(input.teamId, input.customerId);

  if (!customer) {
    throw new AppError("NOT_FOUND", "Customer not found");
  }

  for (const line of input.lines) {
    if (!line.productId) {
      continue;
    }

    const product = await repository.getProductForTeam(input.teamId, line.productId);

    if (!product) {
      throw new AppError("NOT_FOUND", "Product not found");
    }
  }
}

function normalizeOptionalEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() || null;

  if (!normalized) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("CONFLICT", "Email is invalid");
  }

  return normalized;
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message = "Resource not found",
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected application error";
}
