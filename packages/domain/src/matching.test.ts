import { describe, expect, test } from "bun:test";

import {
  calibrateMatchPolicy,
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
      matched: true,
    });
    expect(suggestions[0]?.signalDetails.name?.score ?? 0).toBeGreaterThanOrEqual(0.17);
    expect(suggestions[0]?.signals.counterparty ?? 0).toBeGreaterThanOrEqual(0.17);
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

  test("uses accepted feedback to strengthen future merchant pairs", () => {
    const baseline = suggestInboxTransactionMatches(baseInput, [
      {
        transaction: transaction({ id: "txn_feedback", description: "Figma subscription" }),
        counterpartyName: "Figma",
      },
    ]);
    const withFeedback = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({ id: "txn_feedback", description: "Figma subscription" }),
          counterpartyName: "Figma",
        },
      ],
      {
        feedback: [
          {
            source: "Figma Inc",
            target: "Figma subscription",
            status: "accepted",
            count: 2,
            lastOccurredAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      },
    );

    expect(withFeedback[0]?.score ?? 0).toBeGreaterThan(baseline[0]?.score ?? 0);
    expect(withFeedback[0]?.signals.feedback).toBeGreaterThan(0);
    expect(withFeedback[0]?.explanation).toContain("Team feedback supports this match");
  });

  test("decays similar rejected feedback without permanently blocking matches", () => {
    const baseline = suggestInboxTransactionMatches(baseInput, [
      {
        transaction: transaction({ id: "txn_feedback_penalty", description: "Figma subscription" }),
        counterpartyName: "Figma",
      },
    ]);
    const penalized = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({
            id: "txn_feedback_penalty",
            description: "Figma subscription",
          }),
          counterpartyName: "Figma",
        },
      ],
      {
        feedbackReferenceAt: "2026-06-14T00:00:00.000Z",
        feedback: [
          {
            source: "Figma Inc",
            target: "Figma subscription",
            status: "rejected",
            count: 3,
            lastOccurredAt: "2026-03-01T00:00:00.000Z",
          },
        ],
      },
    );

    expect(penalized[0]?.transactionId).toBe("txn_feedback_penalty");
    expect(penalized[0]?.score ?? 0).toBeLessThan(baseline[0]?.score ?? 0);
    expect(penalized[0]?.signals.feedback).toBeLessThan(0);
  });

  test("lets repeated confirmations override stale negative feedback", () => {
    const suggestions = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({ id: "txn_feedback_override", description: "Figma subscription" }),
          counterpartyName: "Figma",
        },
      ],
      {
        feedbackReferenceAt: "2026-06-14T00:00:00.000Z",
        feedback: [
          {
            source: "Figma Inc",
            target: "Figma subscription",
            status: "rejected",
            count: 3,
            lastOccurredAt: "2025-12-01T00:00:00.000Z",
          },
          {
            source: "Figma Inc",
            target: "Figma subscription",
            status: "accepted",
            count: 3,
            lastOccurredAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      },
    );

    expect(suggestions[0]?.transactionId).toBe("txn_feedback_override");
    expect(suggestions[0]?.signals.feedback).toBeGreaterThan(0);
    expect(suggestions[0]?.explanation).toContain("Team feedback supports this match");
  });

  test("uses conservative default thresholds for low-sample teams", () => {
    const policy = calibrateMatchPolicy({
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma subscription",
          status: "accepted",
          count: 2,
        },
      ],
    });

    expect(policy.suggestedScoreThreshold).toBe(0.35);
    expect(policy.autoMatchScoreThreshold).toBe(0.95);
    expect(policy.calibration).toMatchObject({
      sampleCount: 2,
      acceptedCount: 2,
      rejectedCount: 0,
      precision: 1,
      posture: "low_sample",
    });
  });

  test("lowers suggested thresholds for high-precision team feedback", () => {
    const policy = calibrateMatchPolicy({
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma subscription",
          status: "accepted",
          count: 4,
        },
        {
          source: "Acme",
          target: "Acme Consulting",
          status: "rejected",
          count: 1,
        },
      ],
    });

    expect(policy.suggestedScoreThreshold).toBe(0.32);
    expect(policy.autoMatchScoreThreshold).toBe(0.92);
    expect(policy.calibration).toMatchObject({
      sampleCount: 5,
      acceptedCount: 4,
      rejectedCount: 1,
      precision: 0.8,
      posture: "high_precision",
    });
  });

  test("raises suggested thresholds for low-precision team feedback", () => {
    const policy = calibrateMatchPolicy({
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma subscription",
          status: "accepted",
          count: 1,
        },
        {
          source: "Acme",
          target: "Acme Consulting",
          status: "rejected",
          count: 3,
        },
      ],
    });

    expect(policy.suggestedScoreThreshold).toBe(0.42);
    expect(policy.autoMatchScoreThreshold).toBe(0.97);
    expect(policy.calibration).toMatchObject({
      sampleCount: 4,
      acceptedCount: 1,
      rejectedCount: 3,
      precision: 0.25,
      posture: "low_precision",
    });
  });

  test("emits calibrated thresholds and metadata with match decisions", () => {
    const policy = calibrateMatchPolicy({
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma subscription",
          status: "accepted",
          count: 4,
        },
      ],
    });
    const document: DocumentMatchSubject = {
      id: baseInput.documentId,
      inboxItemId: baseInput.inboxItemId,
      documentText: baseInput.documentText,
      fields: baseInput.fields,
    };
    const decision = scoreDocumentTransactionMatch({
      document,
      transaction: {
        transaction: transaction({ id: "txn_calibrated" }),
        counterpartyName: "Figma Inc",
      },
      policy,
    });

    expect(decision.thresholds).toEqual({
      suggested: 0.32,
      autoMatch: 0.92,
    });
    expect(decision.calibration).toMatchObject({
      posture: "high_precision",
      sampleCount: 4,
    });
  });

  test("bounds explicit thresholds before emitting match decisions", () => {
    const document: DocumentMatchSubject = {
      id: baseInput.documentId,
      inboxItemId: baseInput.inboxItemId,
      documentText: baseInput.documentText,
      fields: baseInput.fields,
    };
    const decision = scoreDocumentTransactionMatch({
      document,
      transaction: {
        transaction: transaction({ id: "txn_bounded" }),
        counterpartyName: "Figma Inc",
      },
      policy: {
        suggestedScoreThreshold: 0.1,
        autoMatchScoreThreshold: 0.2,
      },
    });

    expect(decision.thresholds).toEqual({
      suggested: 0.3,
      autoMatch: 0.9,
    });
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

  test("scores delayed bank posting for receipts as plausible", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        fields: { ...baseInput.fields, documentType: "receipt" },
      },
      [
        {
          transaction: transaction({
            id: "txn_delayed",
            postedAt: "2026-06-17T10:20:00.000Z",
          }),
          counterpartyName: "Figma Inc",
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_delayed");
    expect(suggestions[0]?.confidence).toBe("high");
    expect(suggestions[0]?.signalDetails.date?.matched).toBe(true);
  });

  test("supports common invoice payment windows", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: "Acme Consulting invoice INV-30 total 1000.00 USD",
        fields: {
          documentType: "invoice_received",
          merchantName: "Acme Consulting LLC",
          issuedAt: "2026-06-01T00:00:00.000Z",
          invoiceNumber: "INV-30",
          totalAmountMinor: 100000,
          currency: "USD",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_net_30",
            description: "ACME CONSULTING PAYMENT INV-30",
            postedAt: "2026-07-01T00:00:00.000Z",
            money: { amountMinor: -100000, currency: "USD" },
          }),
          counterpartyName: "Acme Consulting",
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_net_30");
    expect(suggestions[0]?.confidence).toBe("high");
    expect(suggestions[0]?.explanation).toContain("Invoice payment timing matches common terms");
  });

  test("lets invoice numbers lift otherwise weak merchant text", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        fields: {
          ...baseInput.fields,
          merchantName: null,
          invoiceNumber: "INV-900",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_reference",
            description: "Card payment",
            providerTransactionId: "INV-900",
          }),
          providerReference: "INV-900",
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_reference");
    expect(suggestions[0]?.confidence).toBe("high");
    expect(suggestions[0]?.signals.reference).toBe(0.1);
  });

  test("uses sender domain hints when merchant text is unavailable", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        sender: "billing@vercel.com",
        fields: { ...baseInput.fields, merchantName: null, invoiceNumber: null },
      },
      [
        {
          transaction: transaction({
            id: "txn_domain",
            description: "Vercel subscription",
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_domain");
    expect(suggestions[0]?.signals.senderDomain).toBe(0.05);
    expect(suggestions[0]?.explanation).toContain("Sender domain matches transaction details");
  });

  test("keeps amount-only false positives below safe thresholds", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          totalAmountMinor: 1200,
          currency: "USD",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_amount_only",
            description: "Unknown merchant",
            postedAt: "2026-07-14T00:00:00.000Z",
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_amount_only");
    expect(suggestions[0]?.score ?? 0).toBeLessThan(0.75);
    expect(suggestions[0]?.confidence).not.toBe("high");
    expect(suggestions[0]?.signals.risk).toBeLessThan(0);
  });

  test("keeps name-only false positives below safe thresholds", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          merchantName: "Figma Inc",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_name_only",
            description: "Figma annual plan",
            money: { amountMinor: -99900, currency: "USD" },
            postedAt: "2026-07-14T00:00:00.000Z",
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_name_only");
    expect(suggestions[0]?.score ?? 0).toBeLessThan(0.75);
    expect(suggestions[0]?.confidence).toBe("low");
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
