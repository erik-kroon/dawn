import { describe, expect, test } from "bun:test";

import { bankingNormalizationFixtures } from "./__fixtures__/banking";
import {
  accountingExportFixture,
  deliveryFixture,
  paymentEventFixture,
} from "./__fixtures__/providers";
import { createMockIntegrationProviders, providerTransactionToLedgerDraft } from "./index";

describe("integration provider golden fixtures", () => {
  test("normalizes banking transactions into canonical ledger drafts", () => {
    for (const fixture of bankingNormalizationFixtures) {
      expect(providerTransactionToLedgerDraft(fixture.input), fixture.name).toEqual(
        fixture.expected,
      );
    }
  });

  test("exports accounting records with stable raw payload metadata", async () => {
    const accounting = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-accounting",
    )!;

    const transactionExport = await accounting.exportTransactions!({
      teamId: "team_fixture",
      providerConnectionId: accountingExportFixture.providerConnectionId,
      transactions: accountingExportFixture.transactions,
    });
    const invoiceExport = await accounting.exportInvoices!({
      teamId: "team_fixture",
      providerConnectionId: accountingExportFixture.providerConnectionId,
      invoices: accountingExportFixture.invoices,
    });

    expect(transactionExport).toEqual({
      status: "completed",
      recordsExported: 2,
      rawPayload: {
        mock: true,
        provider: "mock-accounting",
        providerConnectionId: "mock-accounting_team_fixture",
        exportType: "transactions",
        recordsExported: 2,
      },
    });
    expect(invoiceExport).toEqual({
      status: "completed",
      recordsExported: 1,
      rawPayload: {
        mock: true,
        provider: "mock-accounting",
        providerConnectionId: "mock-accounting_team_fixture",
        exportType: "invoices",
        recordsExported: 1,
      },
    });
  });

  test("normalizes payment events while preserving provider raw payloads", async () => {
    const payments = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-payments",
    )!;

    const result = await payments.receivePaymentEvent!({
      teamId: "team_fixture",
      providerConnectionId: paymentEventFixture.providerConnectionId,
      rawPayload: paymentEventFixture.rawPayload,
    });

    expect(result.paymentEvent).toEqual({
      providerEventId: "evt_payment_fixture_001",
      invoiceId: "invoice_fixture_001",
      amount: { amountMinor: 500000, currency: "EUR" },
      paidAt: "2026-06-15T12:30:00.000Z",
      method: "bank_transfer",
      rawPayload: paymentEventFixture.expectedRawPayload,
    });
    expect(result.rawPayload).toEqual({
      mock: true,
      provider: "mock-payments",
      providerConnectionId: "mock-payments_team_fixture",
      paymentEventId: "evt_payment_fixture_001",
      invoiceId: "invoice_fixture_001",
      amount: { amountMinor: 500000, currency: "EUR" },
    });
  });

  test("keeps messaging and email delivery references stable", async () => {
    const providers = createMockIntegrationProviders();
    const messaging = providers.find((provider) => provider.provider === "mock-messaging")!;
    const email = providers.find((provider) => provider.provider === "mock-email")!;

    const message = await messaging.sendMessage!({
      teamId: "team_fixture",
      providerConnectionId: deliveryFixture.messaging.providerConnectionId,
      channel: deliveryFixture.messaging.channel,
      text: deliveryFixture.messaging.text,
    });
    const sentEmail = await email.sendEmail!({
      teamId: "team_fixture",
      providerConnectionId: deliveryFixture.email.providerConnectionId,
      to: deliveryFixture.email.to,
      subject: deliveryFixture.email.subject,
      text: deliveryFixture.email.text,
    });

    expect(message).toEqual({
      status: "completed",
      providerDeliveryId: deliveryFixture.messaging.expectedProviderDeliveryId,
      rawPayload: {
        mock: true,
        provider: "mock-messaging",
        providerConnectionId: "mock-messaging_team_fixture",
        providerDeliveryId: deliveryFixture.messaging.expectedProviderDeliveryId,
        channel: "#finance",
        textLength: deliveryFixture.messaging.expectedTextLength,
      },
    });
    expect(sentEmail).toEqual({
      status: "completed",
      providerDeliveryId: deliveryFixture.email.expectedProviderDeliveryId,
      rawPayload: {
        mock: true,
        provider: "mock-email",
        providerConnectionId: "mock-email_team_fixture",
        providerDeliveryId: deliveryFixture.email.expectedProviderDeliveryId,
        to: "owner@example.com",
        subject: "Invoice paid",
        textLength: deliveryFixture.email.expectedTextLength,
      },
    });
  });
});
