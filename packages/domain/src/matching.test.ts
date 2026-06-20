import { describe, expect, test } from "bun:test";

import {
  calibrateMatchPolicy,
  evaluateAutoMatch,
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

  test("uses unmatched feedback to weaken future merchant pairs", () => {
    const baseline = suggestInboxTransactionMatches(baseInput, [
      {
        transaction: transaction({
          id: "txn_unmatched_penalty",
          description: "Figma subscription",
        }),
        counterpartyName: "Figma",
      },
    ]);
    const penalized = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({
            id: "txn_unmatched_penalty",
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
            status: "unmatched",
            count: 3,
            lastOccurredAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    );

    expect(penalized[0]?.transactionId).toBe("txn_unmatched_penalty");
    expect(penalized[0]?.score ?? 0).toBeLessThan(baseline[0]?.score ?? 0);
    expect(penalized[0]?.signals.feedback).toBeLessThan(0);
    expect(penalized[0]?.signalDetails.feedback?.evidence).toMatchObject({
      unmatchedScore: 0.12,
    });
  });

  test("lets repeated confirmations override stale negative feedback", () => {
    const suggestions = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({
            id: "txn_feedback_override",
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

  test("counts unmatched outcomes as conservative calibration negatives", () => {
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
          status: "unmatched",
          count: 3,
        },
      ],
    });

    expect(policy.suggestedScoreThreshold).toBe(0.42);
    expect(policy.autoMatchScoreThreshold).toBe(0.97);
    expect(policy.calibration).toMatchObject({
      sampleCount: 4,
      acceptedCount: 1,
      rejectedCount: 0,
      unmatchedCount: 3,
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

  test("does not auto-match one-off high scores without repeated feedback", () => {
    const [suggestion] = suggestInboxTransactionMatches(baseInput, [
      {
        transaction: transaction({ id: "txn_one_off" }),
        counterpartyName: "Figma Inc",
      },
    ]);
    const evaluation = evaluateAutoMatch({
      enabled: true,
      candidate: suggestion ?? null,
      alternatives: suggestion ? [suggestion] : [],
    });

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("No repeated confirmed team pattern");
  });

  test("auto-match policy accepts repeated confirmed patterns above threshold", () => {
    const memory = {
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "accepted" as const,
          count: 2,
        },
      ],
    };
    const policy = calibrateMatchPolicy(memory);
    const [suggestion] = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({ id: "txn_repeated" }),
          counterpartyName: "Figma Inc",
        },
      ],
      memory,
      policy,
    );
    const evaluation = evaluateAutoMatch({
      enabled: true,
      candidate: suggestion ?? null,
      alternatives: suggestion ? [suggestion] : [],
      policy,
    });

    expect(evaluation).toMatchObject({
      eligible: true,
      threshold: 0.95,
    });
  });

  test("auto-match policy rejects close competing candidates", () => {
    const memory = {
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "accepted" as const,
          count: 2,
        },
      ],
    };
    const policy = calibrateMatchPolicy(memory);
    const [suggestion] = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({ id: "txn_best" }),
          counterpartyName: "Figma Inc",
        },
      ],
      memory,
      policy,
    );
    const closeAlternative = suggestion
      ? {
          ...suggestion,
          transactionId: "txn_close",
          score: Math.max(0, suggestion.score - 0.05),
        }
      : undefined;
    const evaluation = evaluateAutoMatch({
      enabled: true,
      candidate: suggestion ?? null,
      alternatives: closeAlternative && suggestion ? [suggestion, closeAlternative] : [],
      policy,
    });

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("A competing candidate is too close");
  });

  test("auto-match policy rejects positive history with material unmatched history", () => {
    const memory = {
      feedbackReferenceAt: "2026-06-14T00:00:00.000Z",
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "accepted" as const,
          count: 3,
          lastOccurredAt: "2026-06-14T00:00:00.000Z",
        },
        {
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "unmatched" as const,
          count: 2,
          lastOccurredAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    };
    const policy = calibrateMatchPolicy(memory);
    const [suggestion] = suggestInboxTransactionMatches(
      baseInput,
      [
        {
          transaction: transaction({ id: "txn_unmatched_auto" }),
          counterpartyName: "Figma Inc",
        },
      ],
      memory,
      policy,
    );
    const evaluation = evaluateAutoMatch({
      enabled: true,
      candidate: suggestion ?? null,
      alternatives: suggestion ? [suggestion] : [],
      policy,
    });

    expect(suggestion?.signals.feedback).toBeGreaterThan(0);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("Negative feedback is too recent or too strong");
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
        documentText: null,
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

  test("uses shared base amount as cross-currency evidence without outranking same-currency matches", () => {
    const crossCurrencySuggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          ...baseInput.fields,
          totalAmountMinor: 1000,
          currency: "EUR",
          baseAmountMinor: 1200,
          baseCurrency: "USD",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_cross_currency",
            description: "Figma subscription",
            money: { amountMinor: -1200, currency: "USD" },
            baseMoney: { amountMinor: -1200, currency: "USD" },
          }),
          counterpartyName: "Figma Inc",
        },
      ],
    );
    const sameCurrencySuggestions = suggestInboxTransactionMatches(baseInput, [
      {
        transaction: transaction({ id: "txn_same_currency" }),
        counterpartyName: "Figma Inc",
      },
    ]);

    expect(crossCurrencySuggestions[0]?.transactionId).toBe("txn_cross_currency");
    expect(crossCurrencySuggestions[0]?.confidence).toBe("medium");
    expect(crossCurrencySuggestions[0]?.signals.baseAmount).toBe(0.28);
    expect(crossCurrencySuggestions[0]?.signals.baseCurrency).toBe(0.06);
    expect(crossCurrencySuggestions[0]?.score ?? 0).toBeLessThan(
      sameCurrencySuggestions[0]?.score ?? 0,
    );
  });

  test("suggests cross-currency matches without base amount evidence for review", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        fields: {
          ...baseInput.fields,
          totalAmountMinor: 1000,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_missing_base",
            description: "Figma subscription",
            money: { amountMinor: -1200, currency: "USD" },
          }),
          counterpartyName: "Figma Inc",
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_missing_base");
    expect(suggestions[0]?.score ?? 0).toBeGreaterThanOrEqual(0.35);
    expect(suggestions[0]?.confidence).not.toBe("high");
    expect(suggestions[0]?.signals.crossCurrencyAmount).toBe(0.2);
    expect(suggestions[0]?.signals.currency).toBe(-0.05);
    expect(suggestions[0]?.signals.baseAmount).toBeUndefined();
  });

  test("keeps cross-currency amount-only matches below suggestion thresholds", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          totalAmountMinor: 1000,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_cross_currency_amount_only",
            description: "Unknown merchant",
            money: { amountMinor: -1200, currency: "USD" },
          }),
        },
      ],
    );

    expect(suggestions).toEqual([]);
  });

  test("suggests same-day cross-currency card charges with opaque references", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          issuedAt: "2026-06-14T00:00:00.000Z",
          totalAmountMinor: 1449,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_opaque_card_reference",
            description: "100003655822",
            money: { amountMinor: -13_000, currency: "SEK" },
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_opaque_card_reference");
    expect(suggestions[0]?.score ?? 0).toBeGreaterThanOrEqual(0.35);
    expect(suggestions[0]?.signals.crossCurrencyAmount).toBe(0.2);
    expect(suggestions[0]?.signals.date).toBe(0.2);
  });

  test("rejects implausible cross-currency ratios for the declared currencies", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: null,
        fields: {
          issuedAt: "2026-06-14T00:00:00.000Z",
          totalAmountMinor: 1449,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_wrong_currency_ratio",
            description: "100003655822",
            money: { amountMinor: -13_000, currency: "USD" },
          }),
        },
      ],
    );

    expect(suggestions).toEqual([]);
  });

  test("rejects received documents against incoming transactions", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: "Customer Erik Kroon Celander",
        fields: {
          documentType: "invoice_received",
          issuedAt: "2026-06-14T00:00:00.000Z",
          totalAmountMinor: 1449,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_incoming_owner_transfer",
            description: "ERIK KROON C",
            money: { amountMinor: 13_000, currency: "SEK" },
            type: "income",
          }),
        },
      ],
    );

    expect(suggestions).toEqual([]);
  });

  test("does not use document body text alone to lift cross-currency matches", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: "Customer Erik Kroon Celander",
        fields: {
          documentType: "invoice_received",
          issuedAt: "2026-02-05T00:00:00.000Z",
          totalAmountMinor: 758,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_customer_name_only",
            description: "ERIK KROON C",
            postedAt: "2026-04-09T00:00:00.000Z",
            money: { amountMinor: -10_000, currency: "SEK" },
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_customer_name_only");
    expect(suggestions[0]?.score ?? 0).toBeLessThan(0.35);
    expect(suggestions[0]?.signals.documentText).toBeUndefined();
  });

  test("keeps stale cross-currency merchant matches below suggestion thresholds", () => {
    const suggestions = suggestInboxTransactionMatches(
      {
        ...baseInput,
        documentText: "Hetzner Online GmbH invoice",
        fields: {
          documentType: "invoice_received",
          merchantName: "Hetzner Online GmbH",
          issuedAt: "2026-03-05T00:00:00.000Z",
          totalAmountMinor: 710,
          currency: "EUR",
        },
      },
      [
        {
          transaction: transaction({
            id: "txn_stale_hetzner",
            description: "HETZNER COM//25-12-22",
            postedAt: "2025-12-23T00:00:00.000Z",
            money: { amountMinor: -8455, currency: "SEK" },
          }),
        },
      ],
    );

    expect(suggestions[0]?.transactionId).toBe("txn_stale_hetzner");
    expect(suggestions[0]?.score ?? 0).toBeLessThan(0.35);
    expect(suggestions[0]?.signals.risk).toBe(-0.25);
  });

  test("rejects cross-currency matches with different base currencies", () => {
    const decision = scoreDocumentTransactionMatch({
      document: {
        id: baseInput.documentId,
        inboxItemId: baseInput.inboxItemId,
        documentText: baseInput.documentText,
        fields: {
          ...baseInput.fields,
          totalAmountMinor: 1000,
          currency: "EUR",
          baseAmountMinor: 1200,
          baseCurrency: "SEK",
        },
      },
      transaction: {
        transaction: transaction({
          id: "txn_base_currency_mismatch",
          description: "Figma subscription",
          money: { amountMinor: -1200, currency: "USD" },
          baseMoney: { amountMinor: -1200, currency: "USD" },
        }),
        counterpartyName: "Figma Inc",
      },
    });

    expect(decision.matchType).toBe("none");
    expect(decision.signals.baseCurrency).toMatchObject({
      matched: false,
      reason: "Base currency differs",
    });
  });

  test("rejects cross-currency matches with large base amount mismatches", () => {
    const decision = scoreDocumentTransactionMatch({
      document: {
        id: baseInput.documentId,
        inboxItemId: baseInput.inboxItemId,
        documentText: baseInput.documentText,
        fields: {
          ...baseInput.fields,
          totalAmountMinor: 1000,
          currency: "EUR",
          baseAmountMinor: 9000,
          baseCurrency: "USD",
        },
      },
      transaction: {
        transaction: transaction({
          id: "txn_base_amount_mismatch",
          description: "Figma subscription",
          money: { amountMinor: -1200, currency: "USD" },
          baseMoney: { amountMinor: -1200, currency: "USD" },
        }),
        counterpartyName: "Figma Inc",
      },
    });

    expect(decision.matchType).toBe("none");
    expect(decision.signals.baseAmount).toMatchObject({
      matched: false,
      reason: "Base amount differs",
    });
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
