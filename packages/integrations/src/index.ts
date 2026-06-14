import type { LedgerTransactionDraft, Money } from "@dawn/domain";

export type BankingProviderName = "mock-bank";

export type BankingProviderCapability =
  | "createConnection"
  | "listAccounts"
  | "syncAccount"
  | "normalizeTransaction";

export type ProviderRawPayload = Record<string, unknown>;

export type BankingProviderConnection = {
  provider: BankingProviderName;
  providerConnectionId: string;
  institutionName: string;
  status: "connected";
  rawPayload: ProviderRawPayload;
};

export type BankingProviderAccount = {
  providerAccountId: string;
  name: string;
  currency: string;
  type: "bank" | "cash" | "credit_card" | "loan" | "other";
  currentBalance: Money;
  rawPayload: ProviderRawPayload;
};

export type BankingProviderTransaction = {
  providerTransactionId: string;
  providerAccountId: string;
  description: string;
  postedAt: string;
  amount: Money;
  rawPayload: ProviderRawPayload;
};

export type BankingProvider = {
  provider: BankingProviderName;
  capabilities: readonly BankingProviderCapability[];
  createConnection(input: { teamId: string; actorId: string }): Promise<BankingProviderConnection>;
  listAccounts(connection: BankingProviderConnection): Promise<BankingProviderAccount[]>;
  syncAccount(input: {
    connection: BankingProviderConnection;
    account: BankingProviderAccount;
  }): Promise<BankingProviderTransaction[]>;
};

export function canonicalProviderTransactionId(input: {
  provider: BankingProviderName;
  providerConnectionId: string;
  providerAccountId: string;
  providerTransactionId: string;
}) {
  return [
    input.provider,
    input.providerConnectionId,
    input.providerAccountId,
    input.providerTransactionId,
  ].join(":");
}

export function providerTransactionToLedgerDraft(input: {
  teamId: string;
  ledgerAccountId: string;
  provider: BankingProviderName;
  providerConnectionId: string;
  transaction: BankingProviderTransaction;
}): LedgerTransactionDraft {
  return {
    teamId: input.teamId,
    accountId: input.ledgerAccountId,
    description: input.transaction.description.trim(),
    postedAt: input.transaction.postedAt,
    money: input.transaction.amount,
    type: input.transaction.amount.amountMinor >= 0 ? "income" : "expense",
    source: "bank_sync",
    providerTransactionId: canonicalProviderTransactionId({
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      providerAccountId: input.transaction.providerAccountId,
      providerTransactionId: input.transaction.providerTransactionId,
    }),
  };
}

export function createMockBankingProvider(): BankingProvider {
  return {
    provider: "mock-bank",
    capabilities: ["createConnection", "listAccounts", "syncAccount", "normalizeTransaction"],
    async createConnection(input) {
      return {
        provider: "mock-bank",
        providerConnectionId: `mock_conn_${input.teamId}`,
        institutionName: "Mock Bank",
        status: "connected",
        rawPayload: {
          mock: true,
          teamId: input.teamId,
          actorId: input.actorId,
          institution: "Mock Bank",
        },
      };
    },
    async listAccounts(connection) {
      return [
        {
          providerAccountId: "mock_checking",
          name: "Mock Checking",
          currency: "USD",
          type: "bank",
          currentBalance: { amountMinor: 12_500_00, currency: "USD" },
          rawPayload: {
            providerConnectionId: connection.providerConnectionId,
            accountSubtype: "checking",
            mask: "0001",
          },
        },
        {
          providerAccountId: "mock_savings",
          name: "Mock Savings",
          currency: "USD",
          type: "bank",
          currentBalance: { amountMinor: 25_000_00, currency: "USD" },
          rawPayload: {
            providerConnectionId: connection.providerConnectionId,
            accountSubtype: "savings",
            mask: "0002",
          },
        },
      ];
    },
    async syncAccount(input) {
      if (input.account.providerAccountId === "mock_savings") {
        return [];
      }

      return [
        {
          providerTransactionId: "mock_txn_figma",
          providerAccountId: input.account.providerAccountId,
          description: "Figma subscription",
          postedAt: "2026-06-14T00:00:00.000Z",
          amount: { amountMinor: -1200, currency: input.account.currency },
          rawPayload: {
            category: "Software",
            pending: false,
            source: "mock-bank",
          },
        },
        {
          providerTransactionId: "mock_txn_invoice",
          providerAccountId: input.account.providerAccountId,
          description: "Acme invoice payment",
          postedAt: "2026-06-15T00:00:00.000Z",
          amount: { amountMinor: 5000_00, currency: input.account.currency },
          rawPayload: {
            category: "Income",
            pending: false,
            source: "mock-bank",
          },
        },
      ];
    },
  };
}
