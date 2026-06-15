import type { Transaction } from "./transactions";

export type DocumentMatchFields = {
  merchantName?: string | null;
  issuedAt?: string | null;
  invoiceNumber?: string | null;
  totalAmountMinor?: number | null;
  currency?: string | null;
};

export type DocumentMatchSubject = {
  id: string;
  inboxItemId?: string | null;
  sender?: string | null;
  documentText?: string | null;
  fields: DocumentMatchFields;
};

export type TransactionMatchSubject = {
  transaction: Transaction;
  counterpartyName?: string | null;
  providerReference?: string | null;
};

export type MatchSignal = {
  score: number;
  matched: boolean;
  reason: string;
  evidence?: Record<string, string | number | boolean | null>;
};

export type MatchSignals = {
  amount?: MatchSignal;
  currency?: MatchSignal;
  date?: MatchSignal;
  name?: MatchSignal;
  reference?: MatchSignal;
  sender?: MatchSignal;
  senderDomain?: MatchSignal;
  documentText?: MatchSignal;
  alias?: MatchSignal;
  hardNegative?: MatchSignal;
};

export type MatchPolicy = {
  minimumScore: number;
  mediumConfidenceScore: number;
  highConfidenceScore: number;
};

export type MatchType = "suggested" | "none" | "hard_negative";

export type MatchDecision = {
  document: DocumentMatchSubject;
  transaction: TransactionMatchSubject;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  matchType: MatchType;
  explanation: string[];
  signals: MatchSignals;
};

export type MatchCandidate = {
  document: DocumentMatchSubject;
  transaction: TransactionMatchSubject;
  memory?: InboxMatchMemory;
  policy?: Partial<MatchPolicy>;
};

export type InboxMatchInput = {
  inboxItemId: string;
  documentId: string;
  sender?: string | null;
  documentText?: string | null;
  fields: DocumentMatchFields;
};

export type InboxMatchCandidate = TransactionMatchSubject;

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

export type InboxMatchSignalScores = {
  amount?: number;
  currency?: number;
  date?: number;
  counterparty?: number;
  name?: number;
  reference?: number;
  sender?: number;
  senderDomain?: number;
  documentText?: number;
  alias?: number;
  hardNegative?: number;
};

export type InboxMatchSuggestion = {
  inboxItemId: string;
  transactionId: string;
  score: number;
  confidence: InboxMatchConfidence;
  explanation: string[];
  signals: InboxMatchSignalScores;
  signalDetails: MatchSignals;
  matchType: Extract<MatchType, "suggested">;
};

export const defaultMatchPolicy: MatchPolicy = {
  minimumScore: 0,
  mediumConfidenceScore: 0.5,
  highConfidenceScore: 0.75,
};

export function suggestInboxTransactionMatches(
  input: InboxMatchInput,
  candidates: readonly InboxMatchCandidate[],
  memory: InboxMatchMemory = {},
): InboxMatchSuggestion[] {
  return scoreDocumentTransactionMatches(
    inboxInputToDocumentSubject(input),
    candidates,
    memory,
  )
    .filter((decision) => decision.matchType === "suggested")
    .map(inboxSuggestionFromDecision)
    .sort(
      (left, right) =>
        right.score - left.score || left.transactionId.localeCompare(right.transactionId),
    );
}

export function scoreDocumentTransactionMatches(
  document: DocumentMatchSubject,
  transactions: readonly TransactionMatchSubject[],
  memory: InboxMatchMemory = {},
  policy: Partial<MatchPolicy> = {},
): MatchDecision[] {
  return transactions
    .map((transaction) =>
      scoreDocumentTransactionMatch({
        document,
        transaction,
        memory,
        policy,
      }),
    )
    .filter((decision) => decision.matchType !== "none" || decision.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.transactionId.localeCompare(right.transactionId),
    );
}

export function scoreDocumentTransactionMatch(candidate: MatchCandidate): MatchDecision {
  const policy = normalizeMatchPolicy(candidate.policy);
  const hardNegative = candidate.memory?.hardNegatives?.find(
    (negative) =>
      negative.inboxItemId === candidate.document.inboxItemId &&
      negative.transactionId === candidate.transaction.transaction.id,
  );

  if (hardNegative) {
    const signals: MatchSignals = {
      hardNegative: {
        score: -1,
        matched: true,
        reason: "Pair was previously rejected",
        evidence: {
          inboxItemId: hardNegative.inboxItemId,
          transactionId: hardNegative.transactionId,
        },
      },
    };

    return {
      document: candidate.document,
      transaction: candidate.transaction,
      transactionId: candidate.transaction.transaction.id,
      score: 0,
      confidence: "low",
      matchType: "hard_negative",
      explanation: ["Pair was previously rejected"],
      signals,
    };
  }

  const signals: MatchSignals = {};
  const explanation: string[] = [];
  const transaction = candidate.transaction.transaction;
  const searchText = normalizeSearchText(
    [
      transaction.description,
      candidate.transaction.counterpartyName,
      candidate.transaction.providerReference,
      transaction.providerTransactionId,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const documentText = normalizeSearchText(candidate.document.documentText ?? "");
  const sender = normalizeSearchText(candidate.document.sender ?? "");
  const senderDomain = normalizeSearchText(extractDomain(candidate.document.sender));
  const merchantName = normalizeSearchText(candidate.document.fields.merchantName ?? "");
  const invoiceNumber = normalizeSearchText(candidate.document.fields.invoiceNumber ?? "");
  const inputCurrency = candidate.document.fields.currency?.trim().toUpperCase() ?? "";
  const currencyMatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() === inputCurrency;
  const currencyMismatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() !== inputCurrency;

  if (candidate.document.fields.totalAmountMinor != null) {
    if (
      !currencyMismatches &&
      Math.abs(transaction.money.amountMinor) ===
        Math.abs(candidate.document.fields.totalAmountMinor)
    ) {
      addSignal(signals, explanation, "amount", {
        score: 0.35,
        matched: true,
        reason: "Amount matches exactly",
        evidence: {
          documentAmountMinor: candidate.document.fields.totalAmountMinor,
          transactionAmountMinor: transaction.money.amountMinor,
        },
      });
    }
  }

  if (currencyMatches) {
    addSignal(signals, explanation, "currency", {
      score: 0.1,
      matched: true,
      reason: "Currency matches",
      evidence: {
        currency: inputCurrency,
      },
    });
  } else if (currencyMismatches) {
    addSignal(signals, explanation, "currency", {
      score: -0.35,
      matched: false,
      reason: "Currency differs",
      evidence: {
        documentCurrency: inputCurrency,
        transactionCurrency: transaction.money.currency.toUpperCase(),
      },
    });
  }

  const dateScore = dateProximityScore(candidate.document.fields.issuedAt, transaction.postedAt);
  if (dateScore > 0) {
    addSignal(signals, explanation, "date", {
      score: dateScore,
      matched: true,
      reason: dateScore >= 0.2 ? "Transaction date is the same day" : "Transaction date is close",
      evidence: {
        documentDate: candidate.document.fields.issuedAt ?? null,
        transactionDate: transaction.postedAt,
      },
    });
  }

  if (merchantName && searchTextIncludesTerm(searchText, merchantName)) {
    addSignal(signals, explanation, "name", {
      score: 0.2,
      matched: true,
      reason: "Counterparty text matches merchant",
      evidence: {
        merchantName,
      },
    });
  }

  if (invoiceNumber && searchTextIncludesTerm(searchText, invoiceNumber)) {
    addSignal(signals, explanation, "reference", {
      score: 0.1,
      matched: true,
      reason: "Payment reference matches invoice number",
      evidence: {
        invoiceNumber,
      },
    });
  }

  if (sender && searchTextIncludesTerm(searchText, sender)) {
    addSignal(signals, explanation, "sender", {
      score: 0.05,
      matched: true,
      reason: "Sender matches transaction details",
      evidence: {
        sender,
      },
    });
  } else if (senderDomain && searchTextIncludesTerm(searchText, senderDomain)) {
    addSignal(signals, explanation, "senderDomain", {
      score: 0.05,
      matched: true,
      reason: "Sender domain matches transaction details",
      evidence: {
        senderDomain,
      },
    });
  }

  if (documentText && searchText) {
    const transactionText = normalizeSearchText(transaction.description);
    const counterpartyText = normalizeSearchText(candidate.transaction.counterpartyName ?? "");

    if (
      (transactionText && searchTextIncludesTerm(documentText, transactionText)) ||
      (counterpartyText && searchTextIncludesTerm(documentText, counterpartyText))
    ) {
      addSignal(signals, explanation, "documentText", {
        score: 0.05,
        matched: true,
        reason: "Document text contains transaction details",
      });
    }
  }

  const alias = (candidate.memory?.aliases ?? []).find((entry) => {
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
    addSignal(signals, explanation, "alias", {
      score: 0.1,
      matched: true,
      reason: "Team alias links merchant to this counterparty",
      evidence: {
        source: alias.source,
        target: alias.target,
      },
    });
  }

  const score = clampMatchScore(
    Object.values(signals).reduce((total, signal) => total + signal.score, 0),
  );

  return {
    document: candidate.document,
    transaction: candidate.transaction,
    transactionId: transaction.id,
    score,
    confidence: confidenceForScore(score, policy),
    matchType: score > policy.minimumScore ? "suggested" : "none",
    explanation,
    signals,
  };
}

function inboxInputToDocumentSubject(input: InboxMatchInput): DocumentMatchSubject {
  return {
    id: input.documentId,
    inboxItemId: input.inboxItemId,
    sender: input.sender,
    documentText: input.documentText,
    fields: input.fields,
  };
}

function inboxSuggestionFromDecision(decision: MatchDecision): InboxMatchSuggestion {
  return {
    inboxItemId: decision.document.inboxItemId ?? decision.document.id,
    transactionId: decision.transactionId,
    score: decision.score,
    confidence: decision.confidence,
    explanation: decision.explanation,
    signals: legacySignalScores(decision.signals),
    signalDetails: decision.signals,
    matchType: "suggested",
  };
}

function legacySignalScores(signals: MatchSignals): InboxMatchSignalScores {
  return {
    amount: signals.amount?.score,
    currency: signals.currency?.score,
    date: signals.date?.score,
    counterparty: signals.name?.score,
    name: signals.name?.score,
    reference: signals.reference?.score,
    sender: signals.sender?.score,
    senderDomain: signals.senderDomain?.score,
    documentText: signals.documentText?.score,
    alias: signals.alias?.score,
    hardNegative: signals.hardNegative?.score,
  };
}

function addSignal(
  signals: MatchSignals,
  explanation: string[],
  name: keyof MatchSignals,
  signal: MatchSignal,
) {
  signals[name] = signal;
  explanation.push(signal.reason);
}

function normalizeMatchPolicy(policy: Partial<MatchPolicy> | undefined): MatchPolicy {
  return {
    minimumScore:
      typeof policy?.minimumScore === "number"
        ? clampMatchScore(policy.minimumScore)
        : defaultMatchPolicy.minimumScore,
    mediumConfidenceScore:
      typeof policy?.mediumConfidenceScore === "number"
        ? clampMatchScore(policy.mediumConfidenceScore)
        : defaultMatchPolicy.mediumConfidenceScore,
    highConfidenceScore:
      typeof policy?.highConfidenceScore === "number"
        ? clampMatchScore(policy.highConfidenceScore)
        : defaultMatchPolicy.highConfidenceScore,
  };
}

function confidenceForScore(score: number, policy: MatchPolicy): InboxMatchConfidence {
  if (score >= policy.highConfidenceScore) {
    return "high";
  }

  if (score >= policy.mediumConfidenceScore) {
    return "medium";
  }

  return "low";
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

function extractDomain(value: string | null | undefined) {
  const emailDomain = value?.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1];

  if (emailDomain) {
    return emailDomain;
  }

  return value?.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i)?.[1] ?? "";
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clampMatchScore(score: number) {
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
