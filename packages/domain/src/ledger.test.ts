import { describe, expect, test } from "bun:test";

import { createReportTotals, ledgerDuplicateKey, type LedgerTransactionDraft } from "./index";

const draft: LedgerTransactionDraft = {
  teamId: "team_1",
  accountId: "acct_1",
  description: "  Figma Subscription ",
  postedAt: "2026-06-14T10:20:00.000Z",
  money: { amountMinor: -1200, currency: "USD" },
  type: "expense",
  source: "csv_import",
  categoryId: "cat_software",
};

describe("ledger", () => {
  test("creates deterministic duplicate keys from normalized transaction fields", () => {
    expect(ledgerDuplicateKey(draft)).toBe(
      "team_1:csv_import:acct_1:2026-06-14:USD:-1200:figma subscription",
    );
    expect(ledgerDuplicateKey({ ...draft, description: "figma   subscription" })).toBe(
      ledgerDuplicateKey(draft),
    );
  });

  test("uses provider transaction IDs as duplicate keys when available", () => {
    expect(ledgerDuplicateKey({ ...draft, providerTransactionId: "provider_txn_1" })).toBe(
      "team_1:provider_txn_1",
    );
  });

  test("rejects unbalanced split drafts", () => {
    expect(() =>
      ledgerDuplicateKey({
        ...draft,
        splits: [
          { categoryId: "cat_a", money: { amountMinor: -700, currency: "USD" } },
          { categoryId: "cat_b", money: { amountMinor: -400, currency: "USD" } },
        ],
      }),
    ).toThrow("Transaction splits must equal the transaction amount");
  });

  test("computes report totals from signed ledger transactions", () => {
    const report = createReportTotals(
      [
        {
          id: "txn_1",
          teamId: "team_1",
          accountId: "acct_1",
          description: "Invoice paid",
          postedAt: "2026-06-14",
          money: { amountMinor: 5000, currency: "USD" },
          type: "income",
          source: "manual",
          categoryId: "cat_revenue",
          reviewState: "reviewed",
          duplicateKey: "dup_1",
        },
        {
          id: "txn_2",
          teamId: "team_1",
          accountId: "acct_1",
          description: "Software",
          postedAt: "2026-06-14",
          money: { amountMinor: -1200, currency: "USD" },
          type: "expense",
          source: "manual",
          categoryId: "cat_software",
          reviewState: "reviewed",
          duplicateKey: "dup_2",
        },
      ],
      "USD",
    );

    expect(report.revenue).toEqual({ amountMinor: 5000, currency: "USD" });
    expect(report.expenses).toEqual({ amountMinor: -1200, currency: "USD" });
    expect(report.profit).toEqual({ amountMinor: 3800, currency: "USD" });
    expect(report.balance).toEqual({ amountMinor: 3800, currency: "USD" });
    expect(report.categoryTotals.cat_revenue).toEqual({ amountMinor: 5000, currency: "USD" });
    expect(report.categoryTotals.cat_software).toEqual({ amountMinor: -1200, currency: "USD" });
  });
});
