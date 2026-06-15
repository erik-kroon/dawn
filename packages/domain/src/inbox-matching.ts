import type { Transaction } from "./transactions";

export type InboxMatchInput = {
  inboxItemId: string;
  documentId: string;
  sender?: string | null;
  documentText?: string | null;
  fields: {
    merchantName?: string | null;
    issuedAt?: string | null;
    invoiceNumber?: string | null;
    totalAmountMinor?: number | null;
    currency?: string | null;
  };
};

export type InboxMatchCandidate = {
  transaction: Transaction;
  counterpartyName?: string | null;
  providerReference?: string | null;
};

export type TeamMatchAlias = {
  source: string;
  target: string;
};

export type HardNegativeMatch = {
  inboxItemId: string;
  transactionId: string;
};

export type InboxMatchMemory = {
  aliases?: readonly TeamMatchAlias[];
  hardNegatives?: readonly HardNegativeMatch[];
};

export type InboxMatchConfidence = "low" | "medium" | "high";

export type InboxMatchSuggestion = {
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  signals: {
    amount?: number;
    currency?: number;
    date?: number;
    counterparty?: number;
    reference?: number;
    sender?: number;
    documentText?: number;
    alias?: number;
  };
};

export function suggestInboxTransactionMatches(
  input: InboxMatchInput,
  candidates: readonly InboxMatchCandidate[],
  memory: InboxMatchMemory = {},
): InboxMatchSuggestion[] {
  const hardNegativeKeys = new Set(
    (memory.hardNegatives ?? []).map(
      (negative) => `${negative.inboxItemId}:${negative.transactionId}`,
    ),
  );

  return candidates
    .filter(
      (candidate) => !hardNegativeKeys.has(`${input.inboxItemId}:${candidate.transaction.id}`),
    )
    .map((candidate) => scoreInboxMatchCandidate(input, candidate, memory.aliases ?? []))
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.transactionId.localeCompare(right.transactionId),
    );
}

function scoreInboxMatchCandidate(
  input: InboxMatchInput,
  candidate: InboxMatchCandidate,
  aliases: readonly TeamMatchAlias[],
): InboxMatchSuggestion {
  const signals: InboxMatchSuggestion["signals"] = {};
  const explanation: string[] = [];
  const transaction = candidate.transaction;
  const searchText = normalizeSearchText(
    [
      transaction.description,
      candidate.counterpartyName,
      candidate.providerReference,
      transaction.providerTransactionId,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const documentText = normalizeSearchText(input.documentText ?? "");
  const sender = normalizeSearchText(input.sender ?? "");
  const merchantName = normalizeSearchText(input.fields.merchantName ?? "");
  const invoiceNumber = normalizeSearchText(input.fields.invoiceNumber ?? "");
  const inputCurrency = input.fields.currency?.trim().toUpperCase() ?? "";
  const currencyMatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() === inputCurrency;
  const currencyMismatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() !== inputCurrency;

  if (input.fields.totalAmountMinor != null) {
    if (
      !currencyMismatches &&
      Math.abs(transaction.money.amountMinor) === Math.abs(input.fields.totalAmountMinor)
    ) {
      signals.amount = 0.35;
      explanation.push("Amount matches exactly");
    }
  }

  if (currencyMatches) {
    signals.currency = 0.1;
    explanation.push("Currency matches");
  } else if (currencyMismatches) {
    signals.currency = -0.35;
    explanation.push("Currency differs");
  }

  const dateScore = dateProximityScore(input.fields.issuedAt, transaction.postedAt);
  if (dateScore > 0) {
    signals.date = dateScore;
    explanation.push(
      dateScore >= 0.2 ? "Transaction date is the same day" : "Transaction date is close",
    );
  }

  if (merchantName && searchTextIncludesTerm(searchText, merchantName)) {
    signals.counterparty = 0.2;
    explanation.push("Counterparty text matches merchant");
  }

  if (invoiceNumber && searchTextIncludesTerm(searchText, invoiceNumber)) {
    signals.reference = 0.1;
    explanation.push("Payment reference matches invoice number");
  }

  if (sender && searchTextIncludesTerm(searchText, sender)) {
    signals.sender = 0.05;
    explanation.push("Sender matches transaction details");
  }

  if (documentText && searchText) {
    const transactionText = normalizeSearchText(transaction.description);
    const counterpartyText = normalizeSearchText(candidate.counterpartyName ?? "");

    if (
      (transactionText && searchTextIncludesTerm(documentText, transactionText)) ||
      (counterpartyText && searchTextIncludesTerm(documentText, counterpartyText))
    ) {
      signals.documentText = 0.05;
      explanation.push("Document text contains transaction details");
    }
  }

  const alias = aliases.find((entry) => {
    const source = normalizeSearchText(entry.source);
    const target = normalizeSearchText(entry.target);

    return (
      source &&
      target &&
      ((merchantName && merchantName === source && searchTextIncludesTerm(searchText, target)) ||
        (merchantName && merchantName === target && searchTextIncludesTerm(searchText, source)))
    );
  });

  if (alias) {
    signals.alias = 0.1;
    explanation.push("Team alias links merchant to this counterparty");
  }

  const score = clampMatchScore(
    Object.values(signals).reduce((total, value) => total + (value ?? 0), 0),
  );

  return {
    inboxItemId: input.inboxItemId,
    transactionId: transaction.id,
    score,
    confidence: score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low",
    explanation,
    signals,
  };
}

function dateProximityScore(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return 0;
  }

  const leftDate = new Date(left);
  const rightDate = new Date(right);

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return 0;
  }

  const days =
    Math.abs(
      Date.UTC(leftDate.getUTCFullYear(), leftDate.getUTCMonth(), leftDate.getUTCDate()) -
        Date.UTC(rightDate.getUTCFullYear(), rightDate.getUTCMonth(), rightDate.getUTCDate()),
    ) / 86_400_000;

  if (days === 0) {
    return 0.2;
  }

  if (days <= 3) {
    return 0.12;
  }

  if (days <= 7) {
    return 0.06;
  }

  return 0;
}

function searchTextIncludesTerm(text: string, term: string) {
  return (
    text.includes(term) || term.split(" ").every((part) => part.length > 1 && text.includes(part))
  );
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clampMatchScore(score: number) {
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
