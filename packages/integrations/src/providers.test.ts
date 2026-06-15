import { describe, expect, test } from "bun:test";

import { createMockIntegrationProviders } from "./index";

describe("integration provider contracts", () => {
  test("declares capabilities for accounting, payments, messaging, and email adapters", async () => {
    const providers = createMockIntegrationProviders();

    expect(providers.map((provider) => [provider.category, provider.provider])).toEqual([
      ["accounting", "mock-accounting"],
      ["payments", "mock-payments"],
      ["messaging", "mock-messaging"],
      ["email", "mock-email"],
    ]);
    expect(providers.every((provider) => provider.capabilities.includes("connect"))).toBe(true);
    expect(providers.every((provider) => provider.capabilities.includes("disable"))).toBe(true);
  });

  test("returns encrypted token metadata instead of raw provider secrets", async () => {
    const provider = createMockIntegrationProviders()[0]!;
    const connection = await provider.connect({
      teamId: "team_1",
      actorId: "user_1",
      idempotencyKey: "connect_1",
    });

    expect(connection.token.encryptedToken).toStartWith("mockkms:");
    expect(connection.token.encryptedToken).not.toContain("mock_secret");
    expect(connection.token.keyId).toBe("mock-kms-local");
    expect(connection.token.lastFour).toHaveLength(4);
  });

  test("exports accounting transactions and invoices through typed contracts", async () => {
    const accounting = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-accounting",
    )!;
    const payments = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-payments",
    )!;

    const transactionExport = await accounting.exportTransactions!({
      teamId: "team_1",
      providerConnectionId: "mock-accounting_team_1",
      transactions: [
        {
          id: "txn_1",
          teamId: "team_1",
          description: "Consulting payment",
          postedAt: "2026-06-15T00:00:00.000Z",
          money: { amountMinor: 5_000_00, currency: "USD" },
          categoryId: null,
          reviewState: "reviewed",
          source: "manual",
        },
      ],
    });
    const invoiceExport = await accounting.exportInvoices!({
      teamId: "team_1",
      providerConnectionId: "mock-accounting_team_1",
      invoices: [
        {
          id: "invoice_1",
          teamId: "team_1",
          customerId: "customer_1",
          invoiceNumber: "INV-001",
          status: "sent",
          issueDate: "2026-06-15T00:00:00.000Z",
          currency: "USD",
          discountBasisPoints: 0,
          lines: [],
          totals: {
            subtotal: { amountMinor: 5_000_00, currency: "USD" },
            discount: { amountMinor: 0, currency: "USD" },
            tax: { amountMinor: 0, currency: "USD" },
            total: { amountMinor: 5_000_00, currency: "USD" },
          },
          amountPaid: { amountMinor: 0, currency: "USD" },
          createdByActorId: "user_1",
        },
      ],
    });

    expect(transactionExport).toMatchObject({
      recordsExported: 1,
      rawPayload: { exportType: "transactions" },
    });
    expect(invoiceExport).toMatchObject({
      recordsExported: 1,
      rawPayload: { exportType: "invoices" },
    });
    await expect(
      payments.exportTransactions!({
        teamId: "team_1",
        providerConnectionId: "mock-payments_team_1",
        transactions: [],
      }),
    ).rejects.toThrow("mock-payments does not export transactions");
  });

  test("normalizes payment provider events through typed contracts", async () => {
    const payments = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-payments",
    )!;
    const messaging = createMockIntegrationProviders().find(
      (provider) => provider.provider === "mock-messaging",
    )!;

    const result = await payments.receivePaymentEvent!({
      teamId: "team_1",
      providerConnectionId: "mock-payments_team_1",
      rawPayload: {
        providerEventId: "evt_payment_1",
        invoiceId: "invoice_1",
        amountMinor: 5_000_00,
        currency: "usd",
        paidAt: "2026-06-15T12:00:00.000Z",
        method: "card",
      },
    });

    expect(result.paymentEvent).toMatchObject({
      providerEventId: "evt_payment_1",
      invoiceId: "invoice_1",
      amount: { amountMinor: 5_000_00, currency: "USD" },
      method: "card",
    });
    await expect(
      messaging.receivePaymentEvent!({
        teamId: "team_1",
        providerConnectionId: "mock-messaging_team_1",
        rawPayload: {},
      }),
    ).rejects.toThrow("mock-messaging does not receive payment events");
  });

  test("sends messaging and email deliveries through typed contracts", async () => {
    const providers = createMockIntegrationProviders();
    const messaging = providers.find((provider) => provider.provider === "mock-messaging")!;
    const email = providers.find((provider) => provider.provider === "mock-email")!;
    const accounting = providers.find((provider) => provider.provider === "mock-accounting")!;

    const message = await messaging.sendMessage!({
      teamId: "team_1",
      providerConnectionId: "mock-messaging_team_1",
      channel: "#finance",
      text: "Invoice paid",
    });
    const sentEmail = await email.sendEmail!({
      teamId: "team_1",
      providerConnectionId: "mock-email_team_1",
      to: "owner@example.com",
      subject: "Invoice paid",
      text: "Acme paid INV-001.",
    });

    expect(message).toMatchObject({
      status: "completed",
      rawPayload: { channel: "#finance", textLength: 12 },
    });
    expect(sentEmail).toMatchObject({
      status: "completed",
      rawPayload: { to: "owner@example.com", subject: "Invoice paid" },
    });
    await expect(
      accounting.sendMessage!({
        teamId: "team_1",
        providerConnectionId: "mock-accounting_team_1",
        channel: "#finance",
        text: "Invoice paid",
      }),
    ).rejects.toThrow("mock-accounting does not send messages");
  });
});
