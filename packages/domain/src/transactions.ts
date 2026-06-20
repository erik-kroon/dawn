import type { Money } from "./money";
import {
  addMoney,
  assertBalancedSplits,
  assertValidMoney,
  parseMoneyAmountMinor,
  zeroMoney,
} from "./money";

export type TransactionType = "income" | "expense" | "transfer" | "fee" | "refund" | "adjustment";

export type TransactionSource = "manual" | "csv_import" | "bank_sync" | "provider_webhook";

export type TransactionReviewState = "needs_review" | "reviewed";

export type TransactionAccountantStatus =
  | "needs_review"
  | "receipt_found"
  | "missing_receipt"
  | "ready_to_export"
  | "exporting"
  | "exported"
  | "export_failed"
  | "excluded"
  | "archived";

export const persistentTransactionAccountantStatuses = [
  "exporting",
  "exported",
  "export_failed",
  "excluded",
  "archived",
] as const satisfies readonly TransactionAccountantStatus[];

export type Transaction = {
  id: string;
  teamId: string;
  accountId?: string | null;
  description: string;
  postedAt: string;
  money: Money;
  baseMoney?: Money | null;
  type?: TransactionType;
  source?: TransactionSource;
  counterpartyId?: string | null;
  transferGroupId?: string | null;
  providerTransactionId?: string | null;
  categoryId: string | null;
  reviewState: TransactionReviewState;
  accountantStatus?: TransactionAccountantStatus;
  accountantStatusReason?: string | null;
  accountantStatusUpdatedAt?: string | null;
  duplicateKey?: string | null;
  updatedAt?: string | null;
};

export type Category = {
  id: string;
  teamId: string;
  name: string;
};

export type LedgerAccount = {
  id: string;
  teamId: string;
  name: string;
  currency: string;
  type: "bank" | "cash" | "credit_card" | "loan" | "other";
};

export type Counterparty = {
  id: string;
  teamId: string;
  name: string;
};

export type TransactionTag = {
  id: string;
  teamId: string;
  name: string;
};

export type TransactionSplit = {
  id: string;
  transactionId: string;
  categoryId: string | null;
  money: Money;
  note?: string | null;
};

export type LedgerTransactionDraft = {
  teamId: string;
  accountId: string;
  description: string;
  postedAt: string;
  money: Money;
  baseMoney?: Money | null;
  type: TransactionType;
  source: TransactionSource;
  categoryId?: string | null;
  counterpartyId?: string | null;
  transferGroupId?: string | null;
  providerTransactionId?: string | null;
  splits?: readonly Omit<TransactionSplit, "id" | "transactionId">[];
  tagIds?: readonly string[];
};

export type CsvTransactionColumnMapping = {
  postedAt: string;
  description: string;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  currency?: string | null;
  balance?: string | null;
  invertAmount?: boolean;
};

export type CsvTransactionImportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ReportTotals = {
  revenue: Money;
  expenses: Money;
  profit: Money;
  balance: Money;
  categoryTotals: Record<string, Money>;
};

export type TransactionReviewChange = {
  transaction: Transaction;
  auditMetadata: {
    previousCategoryId: string | null;
    nextCategoryId: string;
    previousReviewState: TransactionReviewState;
    nextReviewState: TransactionReviewState;
  };
  outboxPayload: {
    transactionId: string;
    categoryId: string;
    previousCategoryId: string | null;
    previousReviewState: TransactionReviewState;
    nextReviewState: TransactionReviewState;
  };
};

export function applyTransactionReview(
  transaction: Transaction,
  category: Category,
): TransactionReviewChange {
  if (transaction.teamId !== category.teamId) {
    throw new Error("Transaction category must belong to the transaction team");
  }

  const nextReviewState = "reviewed";

  return {
    transaction: {
      ...transaction,
      categoryId: category.id,
      reviewState: nextReviewState,
    },
    auditMetadata: {
      previousCategoryId: transaction.categoryId,
      nextCategoryId: category.id,
      previousReviewState: transaction.reviewState,
      nextReviewState,
    },
    outboxPayload: {
      transactionId: transaction.id,
      categoryId: category.id,
      previousCategoryId: transaction.categoryId,
      previousReviewState: transaction.reviewState,
      nextReviewState,
    },
  };
}

export function deriveTransactionAccountantStatus(input: {
  transaction: Pick<Transaction, "reviewState" | "accountantStatus">;
  acceptedAttachmentCount: number;
}): TransactionAccountantStatus {
  const persistent = input.transaction.accountantStatus;

  if (persistent && isPersistentTransactionAccountantStatus(persistent)) {
    return persistent;
  }

  const hasReceiptEvidence = input.acceptedAttachmentCount > 0;

  if (input.transaction.reviewState !== "reviewed") {
    return hasReceiptEvidence ? "receipt_found" : "needs_review";
  }

  return hasReceiptEvidence ? "ready_to_export" : "missing_receipt";
}

export function isPersistentTransactionAccountantStatus(
  status: TransactionAccountantStatus,
): status is (typeof persistentTransactionAccountantStatuses)[number] {
  return persistentTransactionAccountantStatuses.includes(
    status as (typeof persistentTransactionAccountantStatuses)[number],
  );
}

export function isTransactionReadyForAccountantExport(
  transaction: Pick<Transaction, "reviewState" | "accountantStatus">,
) {
  return (
    transaction.accountantStatus === "ready_to_export" && transaction.reviewState === "reviewed"
  );
}

export function assertLedgerTransactionDraft(draft: LedgerTransactionDraft) {
  assertValidMoney(draft.money);
  if (draft.baseMoney) {
    assertValidMoney(draft.baseMoney);
  }

  if (!draft.teamId || !draft.accountId) {
    throw new Error("Ledger transaction requires team and account");
  }

  if (!draft.description.trim()) {
    throw new Error("Ledger transaction description is required");
  }

  if (Number.isNaN(new Date(draft.postedAt).getTime())) {
    throw new Error("Ledger transaction posted date is invalid");
  }

  assertBalancedSplits(draft.money, draft.splits ?? []);
}

export function ledgerDuplicateKey(draft: LedgerTransactionDraft) {
  assertLedgerTransactionDraft(draft);

  const sourceKey =
    draft.providerTransactionId?.trim() ||
    [
      draft.source,
      draft.accountId,
      new Date(draft.postedAt).toISOString().slice(0, 10),
      draft.money.currency,
      draft.money.amountMinor,
      draft.description.trim().toLowerCase().replace(/\s+/g, " "),
    ].join(":");

  return `${draft.teamId}:${sourceKey}`;
}

export function parseCsvTransactionRows(csv: string): CsvTransactionImportRow[] {
  const rows = parseCsvRecords(csv);

  if (rows.length === 0) {
    throw new Error("CSV import file is empty");
  }

  const headers = rows[0]?.map((header) => header.trim()) ?? [];

  if (headers.every((header) => !header)) {
    throw new Error("CSV import requires a header row");
  }

  const seenHeaders = new Set<string>();

  for (const header of headers) {
    if (!header) {
      throw new Error("CSV import headers cannot be blank");
    }

    if (seenHeaders.has(header)) {
      throw new Error("CSV import headers must be unique");
    }

    seenHeaders.add(header);
  }

  return rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, columnIndex) => [header, row[columnIndex] ?? ""]),
      ),
    }));
}

export function detectCsvTransactionColumnMapping(
  rows: readonly CsvTransactionImportRow[],
): CsvTransactionColumnMapping {
  const headers = Object.keys(rows[0]?.values ?? {});
  const headerMapping = detectCsvTransactionHeaderMapping(headers);
  const valueMapping = inferCsvTransactionColumnMappingFromValues(rows, headerMapping);

  return {
    postedAt: valueMapping.postedAt || headerMapping.postedAt,
    description: valueMapping.description || headerMapping.description,
    amount: valueMapping.amount ?? headerMapping.amount,
    debit: valueMapping.debit ?? headerMapping.debit,
    credit: valueMapping.credit ?? headerMapping.credit,
    currency: valueMapping.currency ?? headerMapping.currency,
    balance: valueMapping.balance ?? headerMapping.balance,
    invertAmount: false,
  };
}

function detectCsvTransactionHeaderMapping(
  headers: readonly string[],
): CsvTransactionColumnMapping {
  return {
    postedAt:
      preferredHeader(headers, [
        "date",
        "posted date",
        "posting date",
        "transaction date",
        "booked date",
        "value date",
      ]) ?? "",
    description:
      preferredHeader(headers, [
        "description",
        "merchant",
        "merchant name",
        "name",
        "details",
        "memo",
        "narrative",
        "transaction",
      ]) ?? "",
    amount:
      preferredHeader(headers, ["amount", "transaction amount", "net amount", "total", "value"]) ??
      null,
    debit:
      preferredHeader(headers, ["debit", "withdrawal", "withdrawals", "outflow", "paid out"]) ??
      null,
    credit:
      preferredHeader(headers, ["credit", "deposit", "deposits", "inflow", "paid in"]) ?? null,
    currency: preferredHeader(headers, ["currency", "currency code", "curr"]) ?? null,
    balance:
      preferredHeader(headers, [
        "balance",
        "running balance",
        "booked balance",
        "closing balance",
        "account balance",
      ]) ?? null,
    invertAmount: false,
  };
}

export function csvRowToLedgerDraft(input: {
  teamId: string;
  accountId: string;
  accountCurrency: string;
  mapping: CsvTransactionColumnMapping;
  row: CsvTransactionImportRow;
  categoryId?: string | null;
}): LedgerTransactionDraft {
  const description = requiredCsvValue(input.row, input.mapping.description, "description");
  const postedAtValue = requiredCsvValue(input.row, input.mapping.postedAt, "posted date");
  const currency = input.mapping.currency
    ? requiredCsvValue(input.row, input.mapping.currency, "currency").toUpperCase()
    : input.accountCurrency;
  const amountMinor = csvRowAmountMinor(input.row, input.mapping, currency);
  const postedAt = new Date(postedAtValue);

  if (Number.isNaN(postedAt.getTime())) {
    throw new Error("CSV row posted date is invalid");
  }

  if (currency !== input.accountCurrency) {
    throw new Error("CSV row currency must match the account");
  }

  const draft = {
    teamId: input.teamId,
    accountId: input.accountId,
    description,
    postedAt: postedAt.toISOString(),
    money: { amountMinor, currency },
    type: amountMinor >= 0 ? "income" : "expense",
    source: "csv_import",
    categoryId: input.categoryId ?? null,
  } satisfies LedgerTransactionDraft;

  assertLedgerTransactionDraft(draft);

  return draft;
}

function csvRowAmountMinor(
  row: CsvTransactionImportRow,
  mapping: CsvTransactionColumnMapping,
  currency: string,
) {
  if (mapping.amount) {
    const amountMinor = parseMoneyAmountMinor(
      requiredCsvValue(row, mapping.amount, "amount"),
      currency,
    );

    return mapping.invertAmount ? -amountMinor : amountMinor;
  }

  const debitAmount = mapping.debit ? optionalCsvValue(row, mapping.debit) : null;
  const creditAmount = mapping.credit ? optionalCsvValue(row, mapping.credit) : null;

  if (debitAmount && creditAmount) {
    throw new Error("CSV row cannot have both debit and credit amounts");
  }

  if (debitAmount) {
    return parseMoneyAmountMinor(negativeCsvAmount(debitAmount), currency);
  }

  if (creditAmount) {
    const amountMinor = parseMoneyAmountMinor(creditAmount, currency);

    if (amountMinor < 0) {
      throw new Error("CSV row credit amount cannot be negative");
    }

    return amountMinor;
  }

  throw new Error("CSV row amount is required");
}

function requiredCsvValue(row: CsvTransactionImportRow, column: string, label: string) {
  const value = row.values[column]?.trim();

  if (!value) {
    throw new Error(`CSV row ${label} is required`);
  }

  return value;
}

function optionalCsvValue(row: CsvTransactionImportRow, column: string) {
  return row.values[column]?.trim() || null;
}

type CsvColumnStats = {
  header: string;
  index: number;
  values: string[];
  nonEmptyValues: string[];
  nonEmptyCount: number;
  numericCount: number;
  dateCount: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  uniqueRatio: number;
  averageLength: number;
  numericRatio: number;
  dateRatio: number;
  nonEmptyRatio: number;
};

function inferCsvTransactionColumnMappingFromValues(
  rows: readonly CsvTransactionImportRow[],
  headerMapping: CsvTransactionColumnMapping,
): CsvTransactionColumnMapping {
  const headers = Object.keys(rows[0]?.values ?? {});
  const stats = headers.map((header, index) => csvColumnStats(rows, header, index));
  const postedAt = validMappedHeader(headerMapping.postedAt, headers) ?? bestDateColumn(stats);
  const currency = validMappedHeader(headerMapping.currency, headers) ?? bestCurrencyColumn(stats);
  const split = bestSplitAmountColumns(stats, rows, headerMapping);
  const amount = split
    ? null
    : (validMappedHeader(headerMapping.amount, headers) ??
      bestSignedAmountColumn(stats, rows, {
        exclude: [postedAt, currency].filter(isPresent),
      }));
  const debit = split?.debit ?? validMappedHeader(headerMapping.debit, headers) ?? null;
  const credit = split?.credit ?? validMappedHeader(headerMapping.credit, headers) ?? null;
  const amountHeader = typeof amount === "string" ? amount : null;
  const balance =
    validMappedHeader(headerMapping.balance, headers) ??
    bestBalanceColumn(stats, rows, {
      amount: amountHeader,
      debit,
      credit,
      exclude: [postedAt, currency].filter(isPresent),
    });
  const description =
    validMappedHeader(headerMapping.description, headers) ??
    bestDescriptionColumn(stats, {
      exclude: [postedAt, currency, balance, amountHeader, debit, credit].filter(isPresent),
    });

  return {
    postedAt: postedAt ?? "",
    description: description ?? "",
    amount: amountHeader,
    debit,
    credit,
    currency,
    balance,
    invertAmount: false,
  };
}

function csvColumnStats(
  rows: readonly CsvTransactionImportRow[],
  header: string,
  index: number,
): CsvColumnStats {
  const values = rows.map((row) => row.values[header]?.trim() ?? "");
  const nonEmptyValues = values.filter(Boolean);
  const numericValues = nonEmptyValues.map(parseLooseCsvNumber).filter(isPresent);
  const dateValues = nonEmptyValues.filter((value) => isLikelyCsvDate(value));
  const uniqueValues = new Set(nonEmptyValues.map(normalizeTextFingerprint));
  const averageLength =
    nonEmptyValues.length > 0
      ? nonEmptyValues.reduce((total, value) => total + value.length, 0) / nonEmptyValues.length
      : 0;

  return {
    header,
    index,
    values,
    nonEmptyValues,
    nonEmptyCount: nonEmptyValues.length,
    numericCount: numericValues.length,
    dateCount: dateValues.length,
    positiveCount: numericValues.filter((value) => value > 0).length,
    negativeCount: numericValues.filter((value) => value < 0).length,
    zeroCount: numericValues.filter((value) => value === 0).length,
    uniqueRatio: nonEmptyValues.length > 0 ? uniqueValues.size / nonEmptyValues.length : 0,
    averageLength,
    numericRatio: nonEmptyValues.length > 0 ? numericValues.length / nonEmptyValues.length : 0,
    dateRatio: nonEmptyValues.length > 0 ? dateValues.length / nonEmptyValues.length : 0,
    nonEmptyRatio: rows.length > 0 ? nonEmptyValues.length / rows.length : 0,
  };
}

function bestDateColumn(stats: readonly CsvColumnStats[]) {
  return stats
    .filter((stat) => stat.nonEmptyCount > 0 && stat.dateRatio >= 0.8)
    .sort((left, right) => right.dateRatio - left.dateRatio || left.index - right.index)[0]?.header;
}

function bestCurrencyColumn(stats: readonly CsvColumnStats[]) {
  return stats
    .filter(
      (stat) =>
        stat.nonEmptyCount > 0 &&
        stat.nonEmptyValues.every((value) => /^[A-Z]{3}$/i.test(value.trim())),
    )
    .sort((left, right) => right.nonEmptyRatio - left.nonEmptyRatio || left.index - right.index)[0]
    ?.header;
}

function bestDescriptionColumn(
  stats: readonly CsvColumnStats[],
  input: { exclude: readonly string[] },
) {
  const excluded = new Set(input.exclude);

  return stats
    .filter((stat) => !excluded.has(stat.header) && stat.nonEmptyCount > 0)
    .map((stat) => ({
      stat,
      score:
        stat.nonEmptyRatio * 20 +
        stat.uniqueRatio * 30 +
        Math.min(stat.averageLength, 40) -
        stat.numericRatio * 35 -
        stat.dateRatio * 50,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.stat.index - right.stat.index)[0]?.stat
    .header;
}

function bestSplitAmountColumns(
  stats: readonly CsvColumnStats[],
  rows: readonly CsvTransactionImportRow[],
  headerMapping: CsvTransactionColumnMapping,
) {
  const numericStats = stats.filter(
    (stat) =>
      stat.numericCount > 0 &&
      stat.numericRatio >= 0.9 &&
      stat.dateRatio < 0.2 &&
      stat.nonEmptyRatio > 0 &&
      stat.nonEmptyRatio < 0.98,
  );
  let best: {
    debit: string;
    credit: string;
    score: number;
  } | null = null;

  for (let leftIndex = 0; leftIndex < numericStats.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < numericStats.length; rightIndex += 1) {
      const left = numericStats[leftIndex]!;
      const right = numericStats[rightIndex]!;
      const coverage = splitCoverage(rows, left.header, right.header);

      if (coverage.coveredRatio < 0.75 || coverage.overlapCount > 0) {
        continue;
      }

      const assigned = assignDebitCreditColumns(left, right, headerMapping);

      if (!assigned) {
        continue;
      }

      const score = coverage.coveredRatio * 100 + assigned.confidence * 25;

      if (!best || score > best.score) {
        best = { debit: assigned.debit, credit: assigned.credit, score };
      }
    }
  }

  return best ? { debit: best.debit, credit: best.credit } : null;
}

function splitCoverage(
  rows: readonly CsvTransactionImportRow[],
  leftHeader: string,
  rightHeader: string,
) {
  let coveredCount = 0;
  let overlapCount = 0;

  for (const row of rows) {
    const hasLeft = parseLooseCsvNumber(row.values[leftHeader] ?? null) !== null;
    const hasRight = parseLooseCsvNumber(row.values[rightHeader] ?? null) !== null;

    if (hasLeft || hasRight) {
      coveredCount += 1;
    }

    if (hasLeft && hasRight) {
      overlapCount += 1;
    }
  }

  return {
    coveredRatio: rows.length > 0 ? coveredCount / rows.length : 0,
    overlapCount,
  };
}

function assignDebitCreditColumns(
  left: CsvColumnStats,
  right: CsvColumnStats,
  headerMapping: CsvTransactionColumnMapping,
) {
  const leftHeaderDebit = headerMapping.debit === left.header;
  const leftHeaderCredit = headerMapping.credit === left.header;
  const rightHeaderDebit = headerMapping.debit === right.header;
  const rightHeaderCredit = headerMapping.credit === right.header;

  if ((leftHeaderDebit || rightHeaderCredit) && !(leftHeaderCredit || rightHeaderDebit)) {
    return { debit: left.header, credit: right.header, confidence: 1 };
  }

  if ((rightHeaderDebit || leftHeaderCredit) && !(rightHeaderCredit || leftHeaderDebit)) {
    return { debit: right.header, credit: left.header, confidence: 1 };
  }

  const leftNegativeRatio = left.numericCount > 0 ? left.negativeCount / left.numericCount : 0;
  const rightNegativeRatio = right.numericCount > 0 ? right.negativeCount / right.numericCount : 0;
  const leftNonNegativeRatio =
    left.numericCount > 0 ? (left.positiveCount + left.zeroCount) / left.numericCount : 0;
  const rightNonNegativeRatio =
    right.numericCount > 0 ? (right.positiveCount + right.zeroCount) / right.numericCount : 0;

  if (leftNegativeRatio >= 0.8 && rightNonNegativeRatio >= 0.8) {
    return { debit: left.header, credit: right.header, confidence: leftNegativeRatio };
  }

  if (rightNegativeRatio >= 0.8 && leftNonNegativeRatio >= 0.8) {
    return { debit: right.header, credit: left.header, confidence: rightNegativeRatio };
  }

  return null;
}

function bestSignedAmountColumn(
  stats: readonly CsvColumnStats[],
  rows: readonly CsvTransactionImportRow[],
  input: { exclude: readonly string[] },
) {
  const excluded = new Set(input.exclude);
  const candidates = stats.filter(
    (stat) =>
      !excluded.has(stat.header) &&
      stat.numericCount > 0 &&
      stat.numericRatio >= 0.9 &&
      stat.nonEmptyRatio >= 0.8 &&
      stat.dateRatio < 0.2,
  );

  return candidates
    .map((stat) => {
      const signedDiversity = stat.positiveCount > 0 && stat.negativeCount > 0 ? 40 : 0;
      const balanceLikeScore = Math.max(
        ...candidates
          .filter((other) => other.header !== stat.header)
          .map((other) => balanceFitScore(stat.header, other.header, rows)),
        0,
      );
      const ownBalanceFit = Math.max(
        ...candidates
          .filter((other) => other.header !== stat.header)
          .map((other) => balanceFitScore(other.header, stat.header, rows)),
        0,
      );

      return {
        stat,
        score:
          stat.numericRatio * 25 +
          stat.nonEmptyRatio * 20 +
          signedDiversity +
          balanceLikeScore * 30 -
          ownBalanceFit * 50,
      };
    })
    .sort((left, right) => right.score - left.score || left.stat.index - right.stat.index)[0]?.stat
    .header;
}

function bestBalanceColumn(
  stats: readonly CsvColumnStats[],
  rows: readonly CsvTransactionImportRow[],
  input: {
    amount: string | null;
    debit: string | null;
    credit: string | null;
    exclude: readonly string[];
  },
) {
  const excluded = new Set(input.exclude);
  const amountHeaders = [input.amount, input.debit, input.credit].filter(isPresent);

  for (const amountHeader of amountHeaders) {
    excluded.add(amountHeader);
  }

  const rowAmount = (row: CsvTransactionImportRow) =>
    csvRowAmountNumber(row, {
      amount: input.amount,
      debit: input.debit,
      credit: input.credit,
    });

  return stats
    .filter(
      (stat) =>
        !excluded.has(stat.header) &&
        stat.numericCount > 0 &&
        stat.numericRatio >= 0.9 &&
        stat.nonEmptyRatio >= 0.8,
    )
    .map((stat) => ({
      stat,
      score: rowAmountBalanceFitScore(stat.header, rows, rowAmount),
    }))
    .filter(({ score }) => score >= 0.6)
    .sort((left, right) => right.score - left.score || left.stat.index - right.stat.index)[0]?.stat
    .header;
}

function balanceFitScore(
  amountHeader: string,
  balanceHeader: string,
  rows: readonly CsvTransactionImportRow[],
) {
  return rowAmountBalanceFitScore(balanceHeader, rows, (row) =>
    parseLooseCsvNumber(row.values[amountHeader] ?? null),
  );
}

function rowAmountBalanceFitScore(
  balanceHeader: string,
  rows: readonly CsvTransactionImportRow[],
  rowAmount: (row: CsvTransactionImportRow) => number | null,
) {
  let descendingMatches = 0;
  let ascendingMatches = 0;
  let comparable = 0;

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index]!;
    const next = rows[index + 1]!;
    const currentAmount = rowAmount(current);
    const nextAmount = rowAmount(next);
    const currentBalance = parseLooseCsvNumber(current.values[balanceHeader] ?? null);
    const nextBalance = parseLooseCsvNumber(next.values[balanceHeader] ?? null);

    if (currentBalance === null || nextBalance === null) {
      continue;
    }

    if (currentAmount !== null) {
      comparable += 1;
      if (nearlyEqual(currentBalance - nextBalance, currentAmount)) {
        descendingMatches += 1;
      }
    }

    if (nextAmount !== null && nearlyEqual(nextBalance - currentBalance, nextAmount)) {
      ascendingMatches += 1;
    }
  }

  if (comparable === 0) {
    return 0;
  }

  return Math.max(descendingMatches, ascendingMatches) / comparable;
}

function csvRowAmountNumber(
  row: CsvTransactionImportRow,
  mapping: Pick<CsvTransactionColumnMapping, "amount" | "debit" | "credit">,
) {
  if (mapping.amount) {
    return parseLooseCsvNumber(row.values[mapping.amount] ?? null);
  }

  if (mapping.debit) {
    const debit = parseLooseCsvNumber(row.values[mapping.debit] ?? null);

    if (debit !== null) {
      return debit <= 0 ? debit : -debit;
    }
  }

  if (mapping.credit) {
    return parseLooseCsvNumber(row.values[mapping.credit] ?? null);
  }

  return null;
}

function validMappedHeader(value: string | null | undefined, headers: readonly string[]) {
  return value && headers.includes(value) ? value : null;
}

function isLikelyCsvDate(value: string) {
  const trimmed = value.trim();

  if (
    !/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(trimmed) &&
    !/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(trimmed)
  ) {
    return false;
  }

  return !Number.isNaN(new Date(trimmed).getTime());
}

function parseLooseCsvNumber(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/−/g, "-").replace(/\s+/g, "");
  let negative = false;

  if (/^\(.*\)$/.test(normalized)) {
    negative = true;
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.replace(/[^0-9,.-]/g, "");

  if (!normalized || normalized === "-" || normalized === "." || normalized === ",") {
    return null;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,(?=\d{3}(?:\D|$))/g, "");
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -parsed : parsed;
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.005;
}

function normalizeTextFingerprint(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isPresent<T>(value: T | null | undefined | ""): value is T {
  return value !== null && value !== undefined && value !== "";
}

function preferredHeader(headers: readonly string[], candidates: readonly string[]) {
  const exactCandidates = new Set(candidates.map(normalizeHeader));
  const exact = headers.find((header) => exactCandidates.has(normalizeHeader(header)));

  if (exact) {
    return exact;
  }

  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return candidates.some((candidate) => normalized.includes(normalizeHeader(candidate)));
  });
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function negativeCsvAmount(amount: string) {
  const trimmed = amount.trim();

  if (trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed)) {
    return trimmed;
  }

  return `-${trimmed.replace(/^\+/, "")}`;
}

function parseCsvRecords(csv: string) {
  const normalizedCsv = csv
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const delimiter = detectCsvDelimiter(normalizedCsv);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedCsv.length; index += 1) {
    const char = normalizedCsv[index];
    const nextChar = normalizedCsv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV import has an unterminated quoted field");
  }

  record.push(field);

  if (record.some((value) => value.trim())) {
    records.push(record);
  }

  return records;
}

function detectCsvDelimiter(csv: string) {
  const candidates = [",", ";", "\t"] as const;
  const counts = Object.fromEntries(candidates.map((candidate) => [candidate, 0])) as Record<
    (typeof candidates)[number],
    number
  >;
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "\n" && !inQuotes) {
      break;
    }

    if (!inQuotes && candidates.includes(char as (typeof candidates)[number])) {
      counts[char as (typeof candidates)[number]] += 1;
    }
  }

  return candidates.reduce((selected, candidate) =>
    counts[candidate] > counts[selected] ? candidate : selected,
  );
}

export function createReportTotals(
  transactions: readonly Transaction[],
  currency: string,
): ReportTotals {
  let revenue = zeroMoney(currency);
  let expenses = zeroMoney(currency);
  let balance = zeroMoney(currency);
  const categoryTotals: Record<string, Money> = {};

  for (const transaction of transactions) {
    assertValidMoney(transaction.money);

    if (transaction.money.currency !== currency) {
      throw new Error("Report currency mismatch");
    }

    balance = addMoney(balance, transaction.money);

    if (transaction.money.amountMinor > 0) {
      revenue = addMoney(revenue, transaction.money);
    } else if (transaction.money.amountMinor < 0) {
      expenses = addMoney(expenses, transaction.money);
    }

    if (transaction.categoryId) {
      categoryTotals[transaction.categoryId] = addMoney(
        categoryTotals[transaction.categoryId] ?? zeroMoney(currency),
        transaction.money,
      );
    }
  }

  return {
    revenue,
    expenses,
    profit: addMoney(revenue, expenses),
    balance,
    categoryTotals,
  };
}
