import type { Transaction } from "./transactions";

export type DocumentMatchFields = {
  documentType?:
    | "receipt"
    | "invoice_received"
    | "invoice_sent"
    | "bank_statement"
    | "contract"
    | "tax_document"
    | "other"
    | null;
  merchantName?: string | null;
  customerName?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  invoiceNumber?: string | null;
  totalAmountMinor?: number | null;
  currency?: string | null;
  taxAmountMinor?: number | null;
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
  risk?: MatchSignal;
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
  risk?: number;
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
  const extractedSenderDomain = extractDomain(candidate.document.sender);
  const senderDomain = normalizeSearchText(extractedSenderDomain);
  const senderDomainStem = normalizeSearchText(extractedSenderDomain.split(".")[0] ?? "");
  const merchantName = normalizeSearchText(candidate.document.fields.merchantName ?? "");
  const invoiceNumber = normalizeSearchText(candidate.document.fields.invoiceNumber ?? "");
  const inputCurrency = candidate.document.fields.currency?.trim().toUpperCase() ?? "";
  const currencyMatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() === inputCurrency;
  const currencyMismatches =
    inputCurrency.length > 0 && transaction.money.currency.toUpperCase() !== inputCurrency;

  const amountSignal = amountMatchSignal({
    documentAmountMinor: candidate.document.fields.totalAmountMinor,
    documentTaxAmountMinor: candidate.document.fields.taxAmountMinor,
    transactionAmountMinor: transaction.money.amountMinor,
    currencyMismatches,
  });

  if (amountSignal) {
    addSignal(signals, explanation, "amount", amountSignal);
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

  const dateSignal = dateMatchSignal(candidate.document.fields, transaction.postedAt);
  if (dateSignal) {
    addSignal(signals, explanation, "date", dateSignal);
  }

  const nameScore = nameSimilarityScore(candidate.document.fields.merchantName, [
    transaction.description,
    candidate.transaction.counterpartyName,
    candidate.transaction.providerReference,
    transaction.providerTransactionId,
  ]);

  if (nameScore > 0) {
    addSignal(signals, explanation, "name", {
      score: clampMatchScore(nameScore * 0.2),
      matched: true,
      reason: "Counterparty text matches merchant",
      evidence: {
        merchantName,
        nameScore,
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
  } else if (
    senderDomain &&
    (searchTextIncludesTerm(searchText, senderDomain) ||
      (senderDomainStem && searchTextIncludesTerm(searchText, senderDomainStem)))
  ) {
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

  addConservativeRiskSignals(signals, explanation, candidate.document.fields);

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
    risk: signals.risk?.score,
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

const commonVatRates = [0.05, 0.06, 0.07, 0.075, 0.08, 0.1, 0.12, 0.19, 0.2, 0.21, 0.25];
const companySuffixes = new Set([
  "ab",
  "ag",
  "as",
  "bv",
  "co",
  "corp",
  "corporation",
  "gmbh",
  "inc",
  "incorporated",
  "kg",
  "limited",
  "llc",
  "ltd",
  "nv",
  "oy",
  "plc",
  "pty",
  "sa",
  "sarl",
  "se",
  "srl",
  "ug",
]);

function amountMatchSignal(input: {
  documentAmountMinor?: number | null;
  documentTaxAmountMinor?: number | null;
  transactionAmountMinor: number;
  currencyMismatches: boolean;
}): MatchSignal | null {
  if (input.documentAmountMinor == null || input.currencyMismatches) {
    return null;
  }

  const documentAmount = Math.abs(input.documentAmountMinor);
  const transactionAmount = Math.abs(input.transactionAmountMinor);
  const difference = Math.abs(documentAmount - transactionAmount);
  const maxAmount = Math.max(documentAmount, transactionAmount);
  const percentageDifference = maxAmount > 0 ? difference / maxAmount : 0;
  const evidence = {
    documentAmountMinor: input.documentAmountMinor,
    transactionAmountMinor: input.transactionAmountMinor,
  };

  if (difference === 0) {
    return {
      score: 0.35,
      matched: true,
      reason: "Amount matches exactly",
      evidence,
    };
  }

  if (difference <= 1) {
    return {
      score: 0.33,
      matched: true,
      reason: "Amount is within rounding tolerance",
      evidence: { ...evidence, differenceMinor: difference },
    };
  }

  if (percentageDifference <= 0.01) {
    return {
      score: 0.31,
      matched: true,
      reason: "Amount is within 1 percent",
      evidence: { ...evidence, percentageDifference },
    };
  }

  if (percentageDifference <= 0.02) {
    return {
      score: 0.28,
      matched: true,
      reason: "Amount is close",
      evidence: { ...evidence, percentageDifference },
    };
  }

  if (input.documentTaxAmountMinor != null) {
    const documentSubtotal = Math.abs(input.documentAmountMinor - input.documentTaxAmountMinor);

    if (documentSubtotal === transactionAmount) {
      return {
        score: 0.25,
        matched: true,
        reason: "Transaction amount matches subtotal before tax",
        evidence: {
          ...evidence,
          documentTaxAmountMinor: input.documentTaxAmountMinor,
          documentSubtotalMinor: documentSubtotal,
        },
      };
    }
  }

  const smallerAmount = Math.max(Math.min(documentAmount, transactionAmount), 1);
  const vatLikeRate = maxAmount / smallerAmount - 1;
  const vatRate = commonVatRates.find((rate) => Math.abs(vatLikeRate - rate) <= 0.015);

  if (vatRate) {
    return {
      score: 0.24,
      matched: true,
      reason: "Amount aligns after tax/VAT adjustment",
      evidence: { ...evidence, vatRate },
    };
  }

  if (percentageDifference <= 0.05) {
    return {
      score: 0.18,
      matched: true,
      reason: "Amount is within broad tolerance",
      evidence: { ...evidence, percentageDifference },
    };
  }

  return null;
}

function dateMatchSignal(fields: DocumentMatchFields, transactionDate: string): MatchSignal | null {
  if (!fields.issuedAt || !transactionDate) {
    return null;
  }

  const documentDate = new Date(fields.issuedAt);
  const postedDate = new Date(transactionDate);

  if (Number.isNaN(documentDate.getTime()) || Number.isNaN(postedDate.getTime())) {
    return null;
  }

  const signedDays = signedUtcDays(documentDate, postedDate);
  const absoluteDays = Math.abs(signedDays);
  const evidence = {
    documentDate: fields.issuedAt,
    transactionDate,
  };

  if (absoluteDays === 0) {
    return {
      score: 0.2,
      matched: true,
      reason: "Transaction date is the same day",
      evidence,
    };
  }

  if (isInvoiceDocument(fields.documentType)) {
    const invoiceTerm = commonInvoiceTermDays(signedDays);

    if (invoiceTerm != null) {
      return {
        score: invoiceTerm === 0 ? 0.18 : 0.18,
        matched: true,
        reason: "Invoice payment timing matches common terms",
        evidence: {
          ...evidence,
          paymentTermDays: invoiceTerm,
          signedDays,
        },
      };
    }

    if (signedDays >= -3 && signedDays <= 7) {
      return {
        score: 0.12,
        matched: true,
        reason: "Transaction date is close",
        evidence: { ...evidence, signedDays },
      };
    }
  } else if (signedDays >= 0 && signedDays <= 10) {
    return {
      score: signedDays <= 3 ? 0.12 : 0.06,
      matched: true,
      reason:
        signedDays <= 3
          ? "Transaction date is close"
          : "Receipt date is before bank posting",
      evidence: { ...evidence, signedDays },
    };
  }

  if (absoluteDays <= 3) {
    return {
      score: 0.12,
      matched: true,
      reason: "Transaction date is close",
      evidence: { ...evidence, signedDays },
    };
  }

  if (absoluteDays <= 7) {
    return {
      score: 0.06,
      matched: true,
      reason: "Transaction date is close",
      evidence: { ...evidence, signedDays },
    };
  }

  return null;
}

function commonInvoiceTermDays(signedDays: number) {
  if (signedDays < 0) {
    return null;
  }

  const terms = [0, 7, 15, 30, 60, 90];
  return (
    terms.find((term) => {
      const tolerance = term === 0 ? 3 : 5;
      return Math.abs(signedDays - term) <= tolerance;
    }) ?? null
  );
}

function isInvoiceDocument(documentType: DocumentMatchFields["documentType"]) {
  return documentType === "invoice_received" || documentType === "invoice_sent";
}

function signedUtcDays(left: Date, right: Date) {
  const leftUtc = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const rightUtc = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
  return (rightUtc - leftUtc) / 86_400_000;
}

function nameSimilarityScore(sourceName: string | null | undefined, compareNames: unknown[]) {
  const sourceTokens = normalizeNameTokens(sourceName);

  if (sourceTokens.length === 0) {
    return 0;
  }

  const scores: number[] = [];

  for (const compareName of compareNames) {
    if (typeof compareName !== "string") {
      continue;
    }

    const compareTokens = normalizeNameTokens(compareName);

    if (compareTokens.length === 0) {
      continue;
    }

    const sourceSet = new Set(sourceTokens);
    const compareSet = new Set(compareTokens);
    const intersectionSize = [...sourceSet].filter((token) => compareSet.has(token)).length;
    const unionSize = new Set([...sourceSet, ...compareSet]).size;

    if (unionSize > 0) {
      scores.push(intersectionSize / unionSize);
    }

    if (sourceTokens.every((token) => compareSet.has(token))) {
      scores.push(1);
    }

    const sourceJoined = sourceTokens.join(" ");
    const compareJoined = compareTokens.join(" ");

    if (
      sourceJoined.length >= 3 &&
      compareJoined.length >= 3 &&
      (sourceJoined.includes(compareJoined) || compareJoined.includes(sourceJoined))
    ) {
      scores.push(0.85);
    }

    if (
      sourceTokens[0] &&
      compareTokens[0] &&
      sourceTokens[0].length >= 3 &&
      sourceTokens[0] === compareTokens[0]
    ) {
      scores.push(0.6);
    }

    const sourceConcatenated = sourceTokens.join("");
    const compareConcatenated = compareTokens.join("");

    if (
      sourceConcatenated.length >= 4 &&
      compareConcatenated.length >= 4 &&
      (sourceConcatenated === compareConcatenated ||
        sourceConcatenated.includes(compareConcatenated) ||
        compareConcatenated.includes(sourceConcatenated))
    ) {
      scores.push(sourceConcatenated === compareConcatenated ? 0.95 : 0.8);
    }
  }

  return scores.length > 0 ? Math.max(...scores) : 0;
}

function normalizeNameTokens(value: string | null | undefined) {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !companySuffixes.has(token));
}

function addConservativeRiskSignals(
  signals: MatchSignals,
  explanation: string[],
  fields: DocumentMatchFields,
) {
  const hasNameLikeEvidence = Boolean(
    signals.name ||
      signals.reference ||
      signals.sender ||
      signals.senderDomain ||
      signals.documentText ||
      signals.alias,
  );

  if (signals.amount && !hasNameLikeEvidence && !signals.date) {
    addSignal(signals, explanation, "risk", {
      score: -0.1,
      matched: true,
      reason: "Amount-only evidence is weak",
    });
    return;
  }

  if (fields.issuedAt && !signals.date && !hasNameLikeEvidence) {
    addSignal(signals, explanation, "risk", {
      score: -0.08,
      matched: true,
      reason: "Document date is stale",
    });
  }
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
