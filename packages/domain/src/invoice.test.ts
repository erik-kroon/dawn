import { describe, expect, test } from "bun:test";

import {
  assertCanEditInvoiceDraft,
  assertInvoiceDraftInput,
  calculateInvoiceTotals,
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
});
