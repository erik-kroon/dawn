import { describe, expect, test } from "bun:test";

import {
  canonicalProviderTransactionId,
  createMockBankingProvider,
  createSandboxBankingProvider,
  providerTransactionToLedgerDraft,
  sandboxBankingWebhookSignature,
  verifySandboxBankingWebhook,
} from "./index";

describe("mock banking provider", () => {
  test("creates deterministic fake connections, accounts, and transactions", async () => {
    const provider = createMockBankingProvider();
    const connection = await provider.createConnection({ teamId: "team_1", actorId: "user_1" });
    const accounts = await provider.listAccounts(connection);
    const transactions = await provider.syncAccount({ connection, account: accounts[0]! });

    expect(connection).toMatchObject({
      provider: "mock-bank",
      providerConnectionId: "mock_conn_team_1",
      institutionName: "Mock Bank",
      status: "connected",
    });
    expect(accounts.map((account) => account.providerAccountId)).toEqual([
      "mock_checking",
      "mock_savings",
    ]);
    expect(transactions.map((transaction) => transaction.providerTransactionId)).toEqual([
      "mock_txn_figma",
      "mock_txn_invoice",
    ]);
    expect(transactions[0]?.rawPayload).toMatchObject({ source: "mock-bank" });
  });

  test("creates sandbox connection sessions, encrypted token metadata, and signed webhooks", async () => {
    const provider = createSandboxBankingProvider({
      appUrl: "http://localhost:3001",
      webhookSecret: "secret_1",
    });
    const session = await provider.createConnectionSession!({
      teamId: "team_1",
      actorId: "user_1",
      redirectUrl: "http://localhost:3001/dashboard#banking",
    });
    const connection = await provider.exchangeConnectionSession!({
      teamId: "team_1",
      actorId: "user_1",
      providerSessionId: session.providerSessionId,
      publicToken: "public-sandbox-token",
    });
    const accounts = await provider.listAccounts(connection);
    const transactions = await provider.syncAccount({ connection, account: accounts[0]! });
    const body = JSON.stringify({
      eventId: "evt_1",
      eventType: "transactions_available",
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
    });
    const signature = sandboxBankingWebhookSignature({ body, secret: "secret_1" });

    expect(session).toMatchObject({
      provider: "sandbox-bank",
      linkToken: expect.stringContaining("sandbox_link_"),
    });
    expect(connection.token?.encryptedToken).toStartWith("mockkms:");
    expect(connection.token?.encryptedToken).not.toContain("public-sandbox-token");
    expect(accounts.map((account) => account.providerAccountId)).toEqual([
      "sandbox_checking",
      "sandbox_credit",
    ]);
    expect(transactions.map((transaction) => transaction.providerTransactionId)).toEqual([
      "sandbox_txn_client_payment",
      "sandbox_txn_rent",
    ]);
    expect(verifySandboxBankingWebhook({ body, signature, secret: "secret_1" })).toMatchObject({
      verified: true,
      provider: "sandbox-bank",
      eventType: "transactions_available",
      teamId: "team_1",
      providerConnectionId: connection.providerConnectionId,
    });
    expect(
      verifySandboxBankingWebhook({ body, signature: "bad", secret: "secret_1" }),
    ).toMatchObject({ verified: false });
  });

  test("normalizes provider transactions to canonical ledger drafts", () => {
    expect(
      providerTransactionToLedgerDraft({
        teamId: "team_1",
        ledgerAccountId: "acct_1",
        provider: "mock-bank",
        providerConnectionId: "mock_conn_team_1",
        transaction: {
          providerTransactionId: "mock_txn_figma",
          providerAccountId: "mock_checking",
          description: " Figma subscription ",
          postedAt: "2026-06-14T00:00:00.000Z",
          amount: { amountMinor: -1200, currency: "USD" },
          rawPayload: { provider: "mock-bank" },
        },
      }),
    ).toMatchObject({
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma subscription",
      postedAt: "2026-06-14T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: canonicalProviderTransactionId({
        provider: "mock-bank",
        providerConnectionId: "mock_conn_team_1",
        providerAccountId: "mock_checking",
        providerTransactionId: "mock_txn_figma",
      }),
    });
  });
});
