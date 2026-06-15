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
    return parseMoneyAmountMinor(requiredCsvValue(row, mapping.amount, "amount"), currency);
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
