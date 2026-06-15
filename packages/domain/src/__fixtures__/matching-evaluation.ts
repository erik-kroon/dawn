import type { MatchingGoldenCase } from "./golden-datasets";
import { matchingGoldenCases } from "./golden-datasets";
import type { MatchingEvaluationCase } from "../matching-evaluation";
import type { InboxMatchInput } from "../inbox-matching";
import type { Transaction } from "../transactions";

const exactReceipt = requiredGoldenCase("receipt-exact-provider-reference");
const ambiguousMerchant = requiredGoldenCase("ambiguous-merchant-ranks-by-reference-and-amount");

export const matchingEvaluationFixtures: readonly MatchingEvaluationCase[] = [
  fromGoldenCase(exactReceipt, {
    id: "eval-confirmed-exact",
    teamId: "team_eval_a",
    occurredAt: "2026-06-14T12:00:00.000Z",
    status: "confirmed",
    transactionId: "txn_figma",
  }),
  fromGoldenCase(ambiguousMerchant, {
    id: "eval-suggested-ambiguous",
    teamId: "team_eval_a",
    occurredAt: "2026-06-15T12:00:00.000Z",
    status: "suggested",
    transactionId: "txn_acme_invoice",
  }),
  fromGoldenCase(exactReceipt, {
    id: "eval-rejected-wrong-match",
    teamId: "team_eval_b",
    occurredAt: "2026-06-16T12:00:00.000Z",
    status: "rejected",
    transactionId: "txn_figma",
  }),
  {
    id: "eval-unmatched-amount-only",
    teamId: "team_eval_b",
    occurredAt: "2026-06-17T12:00:00.000Z",
    input: {
      inboxItemId: "inbox_unmatched",
      documentId: "doc_unmatched",
      documentText: null,
      fields: {
        totalAmountMinor: 1200,
        currency: "USD",
      },
    },
    candidates: [
      {
        transaction: transaction({
          id: "txn_unknown_amount",
          description: "Unknown merchant",
          money: { amountMinor: -1200, currency: "USD" },
          postedAt: "2026-06-17T10:00:00.000Z",
        }),
      },
    ],
    outcome: {
      status: "unmatched",
    },
  },
  {
    id: "eval-confirmed-missed",
    teamId: "team_eval_b",
    occurredAt: "2026-06-17T18:00:00.000Z",
    input: {
      inboxItemId: "inbox_missed",
      documentId: "doc_missed",
      documentText: "Receipt from Missing Vendor total 88.00 USD",
      fields: {
        merchantName: "Missing Vendor",
        totalAmountMinor: 8800,
        currency: "USD",
        issuedAt: "2026-06-17T00:00:00.000Z",
      },
    },
    candidates: [
      {
        transaction: transaction({
          id: "txn_unrelated",
          description: "Coffee Shop",
          money: { amountMinor: -500, currency: "USD" },
          postedAt: "2026-06-17T10:00:00.000Z",
        }),
      },
    ],
    outcome: {
      status: "confirmed",
      transactionId: "txn_missing_vendor",
    },
  },
  {
    ...fromGoldenCase(exactReceipt, {
      id: "eval-auto-matched-repeat",
      teamId: "team_eval_a",
      occurredAt: "2026-06-18T12:00:00.000Z",
      status: "auto_matched",
      transactionId: "txn_figma",
    }),
    memory: {
      feedback: [
        {
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "accepted",
          count: 2,
          lastOccurredAt: "2026-06-17T12:00:00.000Z",
        },
      ],
    },
  },
];

function fromGoldenCase(
  goldenCase: MatchingGoldenCase,
  input: {
    id: string;
    teamId: string;
    occurredAt: string;
    status: MatchingEvaluationCase["outcome"]["status"];
    transactionId?: string;
  },
): MatchingEvaluationCase {
  return {
    id: input.id,
    teamId: input.teamId,
    occurredAt: input.occurredAt,
    input: withTeamIds(goldenCase.input, input.teamId),
    candidates: goldenCase.candidates.map((candidate) => ({
      ...candidate,
      transaction: {
        ...candidate.transaction,
        teamId: input.teamId,
      },
    })),
    memory: goldenCase.memory,
    outcome: {
      status: input.status,
      transactionId: input.transactionId ?? goldenCase.expected.topTransactionId ?? null,
    },
  };
}

function withTeamIds(input: InboxMatchInput, _teamId: string): InboxMatchInput {
  return input;
}

function requiredGoldenCase(id: string) {
  const goldenCase = matchingGoldenCases.find((candidate) => candidate.id === id);

  if (!goldenCase) {
    throw new Error(`Missing matching golden case ${id}`);
  }

  return goldenCase;
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn_eval_default",
    teamId: "team_eval_b",
    accountId: "acct_eval",
    description: "Default transaction",
    postedAt: "2026-06-17T00:00:00.000Z",
    money: { amountMinor: -1000, currency: "USD" },
    type: "expense",
    source: "bank_sync",
    providerTransactionId: null,
    categoryId: null,
    reviewState: "needs_review",
    ...overrides,
  };
}
