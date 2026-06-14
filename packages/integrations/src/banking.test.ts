import { describe, expect, test } from "bun:test";

import {
  canonicalProviderTransactionId,
  createMockBankingProvider,
  providerTransactionToLedgerDraft,
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
