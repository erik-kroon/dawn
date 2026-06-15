import type { LedgerTransactionDraft } from "@dawn/domain";

import type { BankingProviderName, BankingProviderTransaction } from "../index";

type BankingNormalizationFixture = {
  name: string;
  input: {
    teamId: string;
    ledgerAccountId: string;
    provider: BankingProviderName;
    providerConnectionId: string;
    transaction: BankingProviderTransaction;
  };
  expected: LedgerTransactionDraft;
};

export const bankingNormalizationFixtures: readonly BankingNormalizationFixture[] = [
  {
    name: "mock bank expense trims descriptions and keeps canonical provider identity",
    input: {
      teamId: "team_fixture",
      ledgerAccountId: "ledger_checking",
      provider: "mock-bank",
      providerConnectionId: "mock_conn_team_fixture",
      transaction: {
        providerTransactionId: "mock_txn_software_001",
        providerAccountId: "mock_checking",
        description: "  Figma subscription  ",
        postedAt: "2026-06-14T00:00:00.000Z",
        amount: { amountMinor: -1200, currency: "USD" },
        rawPayload: {
          source: "mock-bank",
          category: "Software",
          pending: false,
          providerReference: "fit_001",
        },
      },
    },
    expected: {
      teamId: "team_fixture",
      accountId: "ledger_checking",
      description: "Figma subscription",
      postedAt: "2026-06-14T00:00:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "mock-bank:mock_conn_team_fixture:mock_checking:mock_txn_software_001",
    },
  },
  {
    name: "sandbox bank income preserves ISO date and currency casing",
    input: {
      teamId: "team_fixture",
      ledgerAccountId: "ledger_operating",
      provider: "sandbox-bank",
      providerConnectionId: "sandbox_item_team_fixture",
      transaction: {
        providerTransactionId: "sandbox_txn_client_payment_001",
        providerAccountId: "sandbox_checking",
        description: "Northstar project payment",
        postedAt: "2026-06-15T00:00:00.000Z",
        amount: { amountMinor: 1200000, currency: "USD" },
        rawPayload: {
          provider: "sandbox-bank",
          category: "Income",
          pending: false,
          counterparty: "Northstar Studio",
        },
      },
    },
    expected: {
      teamId: "team_fixture",
      accountId: "ledger_operating",
      description: "Northstar project payment",
      postedAt: "2026-06-15T00:00:00.000Z",
      money: { amountMinor: 1200000, currency: "USD" },
      type: "income",
      source: "bank_sync",
      providerTransactionId:
        "sandbox-bank:sandbox_item_team_fixture:sandbox_checking:sandbox_txn_client_payment_001",
    },
  },
  {
    name: "sandbox card expense keeps account-specific canonical identity",
    input: {
      teamId: "team_fixture",
      ledgerAccountId: "ledger_card",
      provider: "sandbox-bank",
      providerConnectionId: "sandbox_item_team_fixture",
      transaction: {
        providerTransactionId: "sandbox_txn_card_software_001",
        providerAccountId: "sandbox_credit",
        description: "Linear subscription",
        postedAt: "2026-06-13T00:00:00.000Z",
        amount: { amountMinor: -8000, currency: "USD" },
        rawPayload: {
          provider: "sandbox-bank",
          category: "Software",
          pending: false,
          accountSubtype: "credit_card",
        },
      },
    },
    expected: {
      teamId: "team_fixture",
      accountId: "ledger_card",
      description: "Linear subscription",
      postedAt: "2026-06-13T00:00:00.000Z",
      money: { amountMinor: -8000, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId:
        "sandbox-bank:sandbox_item_team_fixture:sandbox_credit:sandbox_txn_card_software_001",
    },
  },
];
