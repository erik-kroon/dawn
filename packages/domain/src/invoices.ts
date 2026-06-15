import type { Money } from "./money";
import { assertValidMoney } from "./money";
import {
  assertBasisPoints,
  assertCurrencyCode,
  assertIsoDate,
  multiplyMinorByQuantity,
  roundBasisPoints,
  roundRatio,
} from "./shared";

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
  | "invoice.reminder_sent"
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

export function assertCanSendInvoiceReminder(invoice: { status: InvoiceStatus }): void {
  if (
    invoice.status !== "sent" &&
    invoice.status !== "viewed" &&
    invoice.status !== "overdue" &&
    invoice.status !== "partially_paid"
  ) {
    throw new Error("Only open sent invoices can receive reminders");
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
