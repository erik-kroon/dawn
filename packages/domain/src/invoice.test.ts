import { describe, expect, test } from "bun:test";

import {
  assertCanEditInvoiceDraft,
  assertInvoiceDraftInput,
  calculateInvoiceTotals,
  invoiceStatusAfterPayment,
  markInvoiceOverdue,
  markInvoiceSent,
  markInvoiceViewed,
  nextRecurringInvoiceRun,
  voidInvoice,
  type InvoiceDraft,
  type InvoiceDraftInput,
} from "./index";

const draft: InvoiceDraftInput = {
  teamId: "team_1",
  customerId: "customer_1",
  invoiceNumber: "INV-001",
  issueDate: "2026-06-15T00:00:00.000Z",
  dueDate: "2026-07-15T00:00:00.000Z",
  currency: "USD",
  discountBasisPoints: 500,
  lines: [
    {
      description: "Design retainer",
      quantityMilli: 1_000,
      unitPrice: { amountMinor: 100_00, currency: "USD" },
      taxRateBasisPoints: 2_500,
    },
    {
      description: "Implementation hours",
      quantityMilli: 2_500,
      unitPrice: { amountMinor: 50_00, currency: "USD" },
      discountBasisPoints: 1_000,
      taxRateBasisPoints: 2_500,
    },
  ],
};

const invoice: InvoiceDraft = {
  id: "invoice_1",
  teamId: "team_1",
  customerId: "customer_1",
  invoiceNumber: "INV-001",
  status: "draft",
  issueDate: "2026-06-15T00:00:00.000Z",
  dueDate: "2026-07-15T00:00:00.000Z",
  currency: "USD",
  discountBasisPoints: 0,
  notes: null,
  lines: [],
  totals: {
    subtotal: { amountMinor: 100_00, currency: "USD" },
    discount: { amountMinor: 0, currency: "USD" },
    tax: { amountMinor: 25_00, currency: "USD" },
    total: { amountMinor: 125_00, currency: "USD" },
  },
  amountPaid: { amountMinor: 0, currency: "USD" },
  sentAt: null,
  viewedAt: null,
  paidAt: null,
  overdueAt: null,
  voidedAt: null,
  deliveryToEmail: null,
  deliveryProviderMessageId: null,
  createdByActorId: "user_1",
  createdAt: "2026-06-15T10:00:00.000Z",
  updatedAt: "2026-06-15T10:00:00.000Z",
};

describe("invoice domain", () => {
  test("calculates invoice totals with exact minor-unit tax and discounts", () => {
    const totals = calculateInvoiceTotals({
      currency: draft.currency,
      discountBasisPoints: draft.discountBasisPoints,
      lines: draft.lines,
    });

    expect(totals.lines[0]?.subtotal).toEqual({ amountMinor: 100_00, currency: "USD" });
    expect(totals.lines[1]?.subtotal).toEqual({ amountMinor: 125_00, currency: "USD" });
    expect(totals.totals.subtotal).toEqual({ amountMinor: 225_00, currency: "USD" });
    expect(totals.totals.discount).toEqual({ amountMinor: 23_13, currency: "USD" });
    expect(totals.totals.tax).toEqual({ amountMinor: 50_47, currency: "USD" });
    expect(totals.totals.total).toEqual({ amountMinor: 252_34, currency: "USD" });
  });

  test("validates draft invoice state and dates", () => {
    expect(() => assertInvoiceDraftInput(draft)).not.toThrow();
    expect(() =>
      assertInvoiceDraftInput({
        ...draft,
        dueDate: "2026-06-01T00:00:00.000Z",
      }),
    ).toThrow("Invoice due date cannot be before issue date");
  });

  test("requires one currency and positive line quantities", () => {
    expect(() =>
      assertInvoiceDraftInput({
        ...draft,
        lines: [{ ...draft.lines[0]!, unitPrice: { amountMinor: 100_00, currency: "EUR" } }],
      }),
    ).toThrow("Invoice line currency must match invoice currency");
    expect(() =>
      assertInvoiceDraftInput({
        ...draft,
        lines: [{ ...draft.lines[0]!, quantityMilli: 0 }],
      }),
    ).toThrow("Invoice line quantity must be positive");
  });

  test("only draft invoices can be edited", () => {
    expect(() => assertCanEditInvoiceDraft({ status: "draft" })).not.toThrow();
    expect(() => assertCanEditInvoiceDraft({ status: "sent" })).toThrow(
      "Only draft invoices can be edited",
    );
  });

  test("moves invoices through send, view, overdue, and void states", () => {
    const sent = markInvoiceSent(invoice, "2026-06-16T00:00:00.000Z");
    const viewed = markInvoiceViewed(sent, "2026-06-17T00:00:00.000Z");
    const overdue = markInvoiceOverdue(viewed, "2026-07-16T00:00:00.000Z");
    const voided = voidInvoice(overdue, "2026-07-17T00:00:00.000Z");

    expect(sent.status).toBe("sent");
    expect(viewed.status).toBe("viewed");
    expect(overdue.status).toBe("overdue");
    expect(voided.status).toBe("void");
    expect(() => markInvoiceViewed(invoice, "2026-06-17T00:00:00.000Z")).toThrow(
      "Only sent invoices can be viewed",
    );
    expect(() => voidInvoice({ ...invoice, status: "paid" }, "2026-07-17T00:00:00.000Z")).toThrow(
      "Paid or void invoices cannot be voided",
    );
  });

  test("records partial and full payment status without overpayment", () => {
    const firstPayment = invoiceStatusAfterPayment({
      invoice: { ...invoice, status: "sent" },
      payment: { amountMinor: 50_00, currency: "USD" },
      paidAt: "2026-06-20T00:00:00.000Z",
    });
    const finalPayment = invoiceStatusAfterPayment({
      invoice: { ...invoice, status: firstPayment.status, amountPaid: firstPayment.amountPaid },
      payment: { amountMinor: 75_00, currency: "USD" },
      paidAt: "2026-06-21T00:00:00.000Z",
    });

    expect(firstPayment).toEqual({
      amountPaid: { amountMinor: 50_00, currency: "USD" },
      status: "partially_paid",
      paidAt: null,
    });
    expect(finalPayment).toEqual({
      amountPaid: { amountMinor: 125_00, currency: "USD" },
      status: "paid",
      paidAt: "2026-06-21T00:00:00.000Z",
    });
    expect(() =>
      invoiceStatusAfterPayment({
        invoice: { ...invoice, status: "sent" },
        payment: { amountMinor: 126_00, currency: "USD" },
        paidAt: "2026-06-20T00:00:00.000Z",
      }),
    ).toThrow("Invoice payment cannot exceed invoice balance");
  });

  test("calculates next recurring invoice run dates", () => {
    expect(
      nextRecurringInvoiceRun({
        frequency: "weekly",
        from: "2026-06-15T00:00:00.000Z",
      }),
    ).toBe("2026-06-22T00:00:00.000Z");
    expect(
      nextRecurringInvoiceRun({
        frequency: "quarterly",
        from: "2026-06-15T00:00:00.000Z",
      }),
    ).toBe("2026-09-15T00:00:00.000Z");
  });
});
