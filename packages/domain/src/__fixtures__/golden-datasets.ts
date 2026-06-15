import type {
  HardNegativeMatch,
  InboxMatchCandidate,
  InboxMatchConfidence,
  InboxMatchInput,
  InboxMatchMemory,
} from "../inbox-matching";
import type { Category, Transaction } from "../transactions";

export type MatchingGoldenCase = {
  id: string;
  input: InboxMatchInput;
  candidates: readonly InboxMatchCandidate[];
  memory?: InboxMatchMemory;
  expected: {
    topTransactionId?: string | null;
    topConfidence?: InboxMatchConfidence;
    minimumTopScore?: number;
    maximumScoreByTransactionId?: Record<string, number>;
    excludedTransactionIds?: readonly string[];
  };
};

export type CategorizationGoldenCase = {
  id: string;
  transaction: Transaction;
  categories: readonly Category[];
  expected: {
    categoryId: string | null;
    minimumConfidence?: number;
    maximumConfidence?: number;
  };
};

export const goldenCategories: readonly Category[] = [
  { id: "cat_software", teamId: "team_golden", name: "Software" },
  { id: "cat_meals", teamId: "team_golden", name: "Meals" },
  { id: "cat_rent", teamId: "team_golden", name: "Rent" },
  { id: "cat_revenue", teamId: "team_golden", name: "Revenue" },
  { id: "cat_fees", teamId: "team_golden", name: "Bank Fees" },
];

export const matchingGoldenCases: readonly MatchingGoldenCase[] = [
  {
    id: "receipt-exact-provider-reference",
    input: receiptInput({
      inboxItemId: "inbox_figma",
      documentId: "doc_figma",
      merchantName: "Figma Inc",
      invoiceNumber: "INV-100",
      totalAmountMinor: 1200,
      currency: "USD",
      issuedAt: "2026-06-14T00:00:00.000Z",
      documentText: "Receipt from Figma Inc invoice INV-100 total 12.00 USD",
    }),
    candidates: [
      {
        transaction: transaction({
          id: "txn_figma",
          description: "Figma Inc INV-100",
          postedAt: "2026-06-14T10:20:00.000Z",
          money: { amountMinor: -1200, currency: "USD" },
          providerTransactionId: "provider_figma",
        }),
        counterpartyName: "Figma Inc",
        providerReference: "INV-100",
      },
      {
        transaction: transaction({
          id: "txn_coffee",
          description: "Coffee Shop",
          postedAt: "2026-06-14T08:00:00.000Z",
          money: { amountMinor: -500, currency: "USD" },
        }),
      },
    ],
    expected: {
      topTransactionId: "txn_figma",
      topConfidence: "high",
      minimumTopScore: 0.95,
    },
  },
  {
    id: "hard-negative-suppresses-previous-rejection",
    input: receiptInput({
      inboxItemId: "inbox_rejected",
      documentId: "doc_rejected",
      merchantName: "Figma Inc",
      invoiceNumber: "INV-101",
      totalAmountMinor: 1200,
      currency: "USD",
      issuedAt: "2026-06-14T00:00:00.000Z",
      documentText: "Receipt from Figma Inc invoice INV-101 total 12.00 USD",
    }),
    candidates: [
      {
        transaction: transaction({
          id: "txn_rejected",
          description: "Figma Inc INV-101",
          postedAt: "2026-06-14T10:20:00.000Z",
          money: { amountMinor: -1200, currency: "USD" },
        }),
        counterpartyName: "Figma Inc",
      },
      {
        transaction: transaction({
          id: "txn_backup",
          description: "Figma subscription",
          postedAt: "2026-06-14T10:20:00.000Z",
          money: { amountMinor: -1200, currency: "USD" },
        }),
        counterpartyName: "Figma",
      },
    ],
    memory: {
      hardNegatives: [{ inboxItemId: "inbox_rejected", transactionId: "txn_rejected" }],
    },
    expected: {
      topTransactionId: "txn_backup",
      excludedTransactionIds: ["txn_rejected"],
      minimumTopScore: 0.65,
    },
  },
  {
    id: "same-amount-different-currency-is-low-confidence",
    input: receiptInput({
      inboxItemId: "inbox_currency",
      documentId: "doc_currency",
      merchantName: "Figma Inc",
      invoiceNumber: "INV-102",
      totalAmountMinor: 1200,
      currency: "USD",
      issuedAt: "2026-06-14T00:00:00.000Z",
      documentText: "Receipt from Figma Inc invoice INV-102 total 12.00 USD",
    }),
    candidates: [
      {
        transaction: transaction({
          id: "txn_eur_figma",
          description: "Figma Inc INV-102",
          postedAt: "2026-06-14T10:20:00.000Z",
          money: { amountMinor: -1200, currency: "EUR" },
        }),
        counterpartyName: "Figma Inc",
        providerReference: "INV-102",
      },
    ],
    expected: {
      topTransactionId: "txn_eur_figma",
      topConfidence: "low",
      maximumScoreByTransactionId: { txn_eur_figma: 0.25 },
    },
  },
  {
    id: "nearby-date-window-still-matches",
    input: receiptInput({
      inboxItemId: "inbox_date_window",
      documentId: "doc_date_window",
      merchantName: "Workspace Co",
      invoiceNumber: null,
      totalAmountMinor: 240000,
      currency: "USD",
      issuedAt: "2026-06-12T00:00:00.000Z",
      documentText: "Workspace Co rent due 2400.00 USD",
    }),
    candidates: [
      {
        transaction: transaction({
          id: "txn_rent",
          description: "Workspace Co rent",
          postedAt: "2026-06-15T00:00:00.000Z",
          money: { amountMinor: -240000, currency: "USD" },
        }),
        counterpartyName: "Workspace Co",
      },
    ],
    expected: {
      topTransactionId: "txn_rent",
      topConfidence: "high",
      minimumTopScore: 0.8,
    },
  },
  {
    id: "ambiguous-merchant-ranks-by-reference-and-amount",
    input: receiptInput({
      inboxItemId: "inbox_acme",
      documentId: "doc_acme",
      merchantName: "Acme",
      invoiceNumber: "INV-200",
      totalAmountMinor: 500000,
      currency: "USD",
      issuedAt: "2026-06-15T00:00:00.000Z",
      documentText: "Acme invoice INV-200 total 5000.00 USD",
    }),
    candidates: [
      {
        transaction: transaction({
          id: "txn_acme_cafe",
          description: "Acme Cafe lunch",
          postedAt: "2026-06-15T00:00:00.000Z",
          money: { amountMinor: -1800, currency: "USD" },
        }),
        counterpartyName: "Acme Cafe",
      },
      {
        transaction: transaction({
          id: "txn_acme_invoice",
          description: "Acme Consulting INV-200",
          postedAt: "2026-06-15T00:00:00.000Z",
          money: { amountMinor: 500000, currency: "USD" },
        }),
        counterpartyName: "Acme Consulting",
        providerReference: "INV-200",
      },
    ],
    expected: {
      topTransactionId: "txn_acme_invoice",
      topConfidence: "high",
      minimumTopScore: 0.95,
      maximumScoreByTransactionId: { txn_acme_cafe: 0.55 },
    },
  },
];

export const categorizationGoldenCases: readonly CategorizationGoldenCase[] = [
  {
    id: "software-subscription",
    transaction: transaction({
      id: "txn_figma_subscription",
      description: "Figma monthly subscription",
      money: { amountMinor: -1200, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: "cat_software", minimumConfidence: 0.8 },
  },
  {
    id: "client-payment-income",
    transaction: transaction({
      id: "txn_client_payment",
      description: "Northstar project payment",
      money: { amountMinor: 1200000, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: "cat_revenue", minimumConfidence: 0.8 },
  },
  {
    id: "workspace-rent-expense",
    transaction: transaction({
      id: "txn_workspace_rent",
      description: "Workspace Co rent",
      money: { amountMinor: -240000, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: "cat_rent", minimumConfidence: 0.8 },
  },
  {
    id: "meal-expense",
    transaction: transaction({
      id: "txn_coffee_meeting",
      description: "Coffee meeting with client",
      money: { amountMinor: -1800, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: "cat_meals", minimumConfidence: 0.8 },
  },
  {
    id: "bank-fee-expense",
    transaction: transaction({
      id: "txn_monthly_bank_fee",
      description: "Monthly account fee",
      money: { amountMinor: -500, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: "cat_fees", minimumConfidence: 0.8 },
  },
  {
    id: "unclear-transfer-has-no-durable-category",
    transaction: transaction({
      id: "txn_transfer",
      description: "Transfer from savings",
      money: { amountMinor: 250000, currency: "USD" },
    }),
    categories: goldenCategories,
    expected: { categoryId: null, maximumConfidence: 0.2 },
  },
];

export function validateMatchingGoldenCases(cases: readonly MatchingGoldenCase[]) {
  const ids = new Set<string>();

  for (const goldenCase of cases) {
    assertUniqueCaseId(ids, goldenCase.id);

    if (goldenCase.candidates.length === 0) {
      throw new Error(`Matching golden case ${goldenCase.id} must define candidates`);
    }

    const candidateIds = new Set(
      goldenCase.candidates.map((candidate) => candidate.transaction.id),
    );

    if (
      goldenCase.expected.topTransactionId &&
      !candidateIds.has(goldenCase.expected.topTransactionId)
    ) {
      throw new Error(`Matching golden case ${goldenCase.id} expects an unknown top transaction`);
    }

    validateHardNegatives(goldenCase.id, goldenCase.memory?.hardNegatives ?? [], candidateIds);
  }
}

export function validateCategorizationGoldenCases(cases: readonly CategorizationGoldenCase[]) {
  const ids = new Set<string>();

  for (const goldenCase of cases) {
    assertUniqueCaseId(ids, goldenCase.id);

    const categoryIds = new Set(goldenCase.categories.map((category) => category.id));

    if (goldenCase.expected.categoryId && !categoryIds.has(goldenCase.expected.categoryId)) {
      throw new Error(`Categorization golden case ${goldenCase.id} expects an unknown category`);
    }
  }
}

function receiptInput(input: {
  inboxItemId: string;
  documentId: string;
  merchantName: string;
  invoiceNumber: string | null;
  totalAmountMinor: number;
  currency: string;
  issuedAt: string;
  documentText: string;
}): InboxMatchInput {
  return {
    inboxItemId: input.inboxItemId,
    documentId: input.documentId,
    documentText: input.documentText,
    fields: {
      merchantName: input.merchantName,
      issuedAt: input.issuedAt,
      invoiceNumber: input.invoiceNumber,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
    },
  };
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn_default",
    teamId: "team_golden",
    accountId: "acct_golden",
    description: "Default transaction",
    postedAt: "2026-06-14T00:00:00.000Z",
    money: { amountMinor: -1000, currency: "USD" },
    type: "expense",
    source: "bank_sync",
    providerTransactionId: null,
    categoryId: null,
    reviewState: "needs_review",
    ...overrides,
  };
}

function validateHardNegatives(
  caseId: string,
  hardNegatives: readonly HardNegativeMatch[],
  candidateIds: ReadonlySet<string>,
) {
  for (const negative of hardNegatives) {
    if (!candidateIds.has(negative.transactionId)) {
      throw new Error(`Matching golden case ${caseId} rejects an unknown transaction`);
    }
  }
}

function assertUniqueCaseId(ids: Set<string>, id: string) {
  if (!id.trim()) {
    throw new Error("Golden case id is required");
  }

  if (ids.has(id)) {
    throw new Error(`Duplicate golden case id ${id}`);
  }

  ids.add(id);
}
