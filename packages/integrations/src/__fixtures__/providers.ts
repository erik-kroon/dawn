import type { InvoiceDraft, Transaction } from "@dawn/domain";

import type { ProviderRawPayload } from "../index";

export const accountingExportFixture: {
  providerConnectionId: string;
  transactions: readonly Transaction[];
  invoices: readonly InvoiceDraft[];
} = {
  providerConnectionId: "mock-accounting_team_fixture",
  transactions: [
    {
      id: "txn_consulting_payment",
      teamId: "team_fixture",
      description: "Consulting payment",
      postedAt: "2026-06-15T00:00:00.000Z",
      money: { amountMinor: 500000, currency: "USD" },
      categoryId: "cat_income",
      reviewState: "reviewed",
      source: "bank_sync",
      providerTransactionId:
        "sandbox-bank:sandbox_item_team_fixture:sandbox_checking:sandbox_txn_client_payment_001",
    },
    {
      id: "txn_software_subscription",
      teamId: "team_fixture",
      description: "Figma subscription",
      postedAt: "2026-06-14T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      categoryId: "cat_software",
      reviewState: "reviewed",
      source: "bank_sync",
      providerTransactionId: "mock-bank:mock_conn_team_fixture:mock_checking:mock_txn_software_001",
    },
  ],
  invoices: [
    {
      id: "invoice_fixture_001",
      teamId: "team_fixture",
      customerId: "customer_acme",
      invoiceNumber: "INV-001",
      status: "sent",
      issueDate: "2026-06-15T00:00:00.000Z",
      currency: "USD",
      discountBasisPoints: 0,
      lines: [],
      totals: {
        subtotal: { amountMinor: 500000, currency: "USD" },
        discount: { amountMinor: 0, currency: "USD" },
        tax: { amountMinor: 0, currency: "USD" },
        total: { amountMinor: 500000, currency: "USD" },
      },
      amountPaid: { amountMinor: 0, currency: "USD" },
      createdByActorId: "user_fixture",
    },
  ],
};

export const paymentEventFixture: {
  providerConnectionId: string;
  rawPayload: ProviderRawPayload;
  expectedRawPayload: ProviderRawPayload;
} = {
  providerConnectionId: "mock-payments_team_fixture",
  rawPayload: {
    providerEventId: "evt_payment_fixture_001",
    invoiceId: "invoice_fixture_001",
    amountMinor: 500000,
    currency: "eur",
    paidAt: "2026-06-15T12:30:00.000Z",
    method: "bank_transfer",
    processorReference: "pi_fixture_001",
  },
  expectedRawPayload: {
    providerEventId: "evt_payment_fixture_001",
    invoiceId: "invoice_fixture_001",
    amountMinor: 500000,
    currency: "eur",
    paidAt: "2026-06-15T12:30:00.000Z",
    method: "bank_transfer",
    processorReference: "pi_fixture_001",
  },
};

export const deliveryFixture = {
  messaging: {
    providerConnectionId: "mock-messaging_team_fixture",
    channel: "#finance",
    text: "Invoice INV-001 was paid by Acme.",
    expectedTextLength: 33,
    expectedProviderDeliveryId: "mock-messaging_mock-messaging_team_fixture_b315b546ad21",
  },
  email: {
    providerConnectionId: "mock-email_team_fixture",
    to: "owner@example.com",
    subject: "Invoice paid",
    text: "Acme paid INV-001.",
    expectedTextLength: 18,
    expectedProviderDeliveryId: "mock-email_mock-email_team_fixture_cc4cd3c3122b",
  },
};
