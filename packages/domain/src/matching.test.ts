import { describe, expect, test } from "bun:test";

import {
  scoreDocumentTransactionMatch,
  suggestInboxTransactionMatches,
  type DocumentMatchSubject,
  type InboxMatchInput,
  type Transaction,
} from "./index";

const baseInput: InboxMatchInput = {
  inboxItemId: "inbox_1",
  documentId: "doc_1",
  documentText: "Receipt from Figma Inc invoice INV-100 total 12.00 USD",
  fields: {
    merchantName: "Figma Inc",
    issuedAt: "2026-06-14T00:00:00.000Z",
    invoiceNumber: "INV-100",
    totalAmountMinor: 1200,
    currency: "USD",
  },
};

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: "txn_1",
  teamId: "team_1",
  accountId: "acct_1",
  description: "Figma Inc INV-100",
  postedAt: "2026-06-14T10:20:00.000Z",
  money: { amountMinor: -1200, currency: "USD" },
  type: "expense",
  source: "bank_sync",
  providerTransactionId: "provider_1",
  categoryId: null,
  reviewState: "needs_review",
  ...overrides,
});

describe("inbox transaction matching", () => {
  test("scores exact amount, currency, date, counterparty, and reference matches highly", () => {
    const suggestions = suggestInboxTransactionMatches(baseInput, [
      { transaction: transaction({ id: "txn_match" }), counterpartyName: "Figma Inc" },
      {
        transaction: transaction({
          id: "txn_weak",
          description: "Coffee Shop",
          money: { amountMinor: -500, currency: "USD" },
        }),
      },
    ]);

    expect(suggestions[0]).toMatchObject({
      transactionId: "txn_match",
      confidence: "high",
    });
    expect(suggestions[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(suggestions[0]?.explanation).toContain("Amount matches exactly");
    expect(suggestions[0]?.signalDetails.amount).toMatchObject({
      score: 0.35,
      matched: true,
    });
    expect(suggestions[0]?.signalDetails.name).toMatchObject({
      score: 0.2,
      matched: true,
    });
    expect(suggestions[0]?.signals.counterparty).toBe(0.2);
    expect(suggestions.find((suggestion) => suggestion.transactionId === "txn_weak")).toBeDefined();
  });

  test("uses team aliases to connect merchant names to known counterparties", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        fields: { ...baseInput.fields, merchantName: "Figma" },
      },
      [
        {
          transaction: transaction({ id: "txn_alias", description: "Adobe Commerce" }),
          counterpartyName: "Adobe Commerce",
        },
      ],
      { aliases: [{ source: "Figma", target: "Adobe Commerce" }] },
    );

    expect(suggestions[0]?.transactionId).toBe("txn_alias");
    expect(suggestions[0]?.signals.alias).toBe(0.1);
    expect(suggestions[0]?.explanation).toContain("Team alias links merchant to this counterparty");
  });

  test("uses sender text as a supporting signal", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        sender: "Figma Receipts",
        fields: { ...baseInput.fields, merchantName: null, invoiceNumber: null },
      },
      [
        {
          transaction: transaction({ id: "txn_sender", description: "Figma Receipts" }),
        },
      ],
    );

    expect(suggestions[0]?.signals.sender).toBe(0.05);
    expect(suggestions[0]?.explanation).toContain("Sender matches transaction details");
  });

  test("suppresses hard-negative matches before scoring", () => {
    const suggestions = suggestInboxTransactionMatches(
      baseInput,
      [{ transaction: transaction({ id: "txn_rejected" }), counterpartyName: "Figma Inc" }],
      { hardNegatives: [{ inboxItemId: "inbox_1", transactionId: "txn_rejected" }] },
    );

    expect(suggestions).toEqual([]);
  });

  test("emits structured hard-negative decisions from the pure scorer", () => {
    const document: DocumentMatchSubject = {
      id: baseInput.documentId,
      inboxItemId: baseInput.inboxItemId,
      documentText: baseInput.documentText,
      fields: baseInput.fields,
    };
    const decision = scoreDocumentTransactionMatch({
      document,
      transaction: {
        transaction: transaction({ id: "txn_rejected" }),
        counterpartyName: "Figma Inc",
      },
      memory: {
        hardNegatives: [{ inboxItemId: "inbox_1", transactionId: "txn_rejected" }],
      },
    });

    expect(decision.matchType).toBe("hard_negative");
    expect(decision.score).toBe(0);
    expect(decision.signals.hardNegative).toMatchObject({
      score: -1,
      matched: true,
      reason: "Pair was previously rejected",
    });
  });
});
