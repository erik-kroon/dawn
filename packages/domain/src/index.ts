export type Actor = {
  id: string;
  type: "user";
  email?: string;
};

export type TeamRole = "owner" | "admin" | "member" | "accountant" | "viewer";

export type Permission =
  | "transactions.read"
  | "transactions.write"
  | "transactions.categorize"
  | "documents.read"
  | "documents.write"
  | "invoices.read"
  | "invoices.write"
  | "invoices.send"
  | "bank_connections.manage"
  | "team.manage"
  | "settings.billing"
  | "api_keys.manage"
  | "assistant.use"
  | "assistant.mutate";

export type Team = {
  id: string;
  name: string;
};

export type TeamMembership = {
  teamId: string;
  userId: string;
  role: TeamRole;
};

export type TeamMember = TeamMembership & {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type TeamInvite = {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  invitedByActorId: string;
  expiresAt: string;
};

export type Money = {
  amountMinor: number;
  currency: string;
};

export type TransactionType = "income" | "expense" | "transfer" | "fee" | "refund" | "adjustment";

export type TransactionSource = "manual" | "csv_import" | "bank_sync" | "provider_webhook";

export type TransactionReviewState = "needs_review" | "reviewed";

export type Transaction = {
  id: string;
  teamId: string;
  accountId?: string | null;
  description: string;
  postedAt: string;
  money: Money;
  type?: TransactionType;
  source?: TransactionSource;
  counterpartyId?: string | null;
  providerTransactionId?: string | null;
  categoryId: string | null;
  reviewState: TransactionReviewState;
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
  type: TransactionType;
  source: TransactionSource;
  categoryId?: string | null;
  counterpartyId?: string | null;
  providerTransactionId?: string | null;
  splits?: readonly Omit<TransactionSplit, "id" | "transactionId">[];
  tagIds?: readonly string[];
};

export type CsvTransactionColumnMapping = {
  postedAt: string;
  description: string;
  amount: string;
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

export type AuditEvent = {
  id: string;
  teamId: string;
  actorId: string;
  action: "transaction.reviewed";
  entityType: "transaction";
  entityId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type OutboxEvent = {
  id: string;
  teamId: string;
  type: "transaction.reviewed";
  version: 1;
  payload: Record<string, unknown>;
  occurredAt: string;
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

export const rolePermissions: Record<TeamRole, readonly Permission[]> = {
  owner: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "settings.billing",
    "api_keys.manage",
    "assistant.use",
    "assistant.mutate",
  ],
  admin: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "invoices.read",
    "invoices.write",
    "invoices.send",
    "bank_connections.manage",
    "team.manage",
    "api_keys.manage",
    "assistant.use",
    "assistant.mutate",
  ],
  member: [
    "transactions.read",
    "transactions.write",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "invoices.read",
    "invoices.write",
    "assistant.use",
  ],
  accountant: [
    "transactions.read",
    "transactions.categorize",
    "documents.read",
    "documents.write",
    "invoices.read",
    "invoices.write",
    "assistant.use",
  ],
  viewer: ["transactions.read", "documents.read", "invoices.read", "assistant.use"],
};

export function roleHasPermission(role: TeamRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function permissionsForRole(role: TeamRole) {
  return rolePermissions[role];
}

export function assertTeamRole(role: string): asserts role is TeamRole {
  if (!["owner", "admin", "member", "accountant", "viewer"].includes(role)) {
    throw new Error("Unknown team role");
  }
}

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

  if (input.fields.totalAmountMinor != null) {
    if (Math.abs(transaction.money.amountMinor) === Math.abs(input.fields.totalAmountMinor)) {
      signals.amount = 0.35;
      explanation.push("Amount matches exactly");
    }
  }

  if (
    input.fields.currency &&
    transaction.money.currency.toUpperCase() === input.fields.currency.toUpperCase()
  ) {
    signals.currency = 0.1;
    explanation.push("Currency matches");
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
  return Math.min(1, Math.round(score * 100) / 100);
}

export function assertValidMoney(money: Money) {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("Money amount must use safe integer minor units");
  }

  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }
}

export function parseMoneyAmountMinor(amount: string, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const trimmedAmount = amount.trim();

  if (!trimmedAmount) {
    throw new Error("Money amount is required");
  }

  const isParenthesizedNegative = /^\(.*\)$/.test(trimmedAmount);
  const normalizedAmount = trimmedAmount
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$€£¥\s_]/g, "")
    .replace(/,/g, "");
  const sign = normalizedAmount.startsWith("-") ? -1 : 1;
  const unsignedAmount = normalizedAmount.replace(/^[+-]/, "");

  if (!/^\d+(\.\d+)?$/.test(unsignedAmount)) {
    throw new Error("Money amount must be a decimal number");
  }

  const minorUnitDigits = currencyMinorUnitDigits(currency);
  const [majorUnits = "0", minorUnits = ""] = unsignedAmount.split(".");

  if (minorUnits.length > minorUnitDigits) {
    throw new Error("Money amount has too many decimal places for currency");
  }

  const amountMinor =
    sign *
    Number(
      `${majorUnits}${minorUnits.padEnd(minorUnitDigits, "0")}`.replace(/^0+(?=\d)/, "") || "0",
    );
  const money = {
    amountMinor: isParenthesizedNegative ? -Math.abs(amountMinor) : amountMinor,
    currency,
  };

  assertValidMoney(money);

  return money.amountMinor;
}

export function assertSameCurrency(left: Money, right: Money) {
  assertValidMoney(left);
  assertValidMoney(right);

  if (left.currency !== right.currency) {
    throw new Error("Money currency mismatch");
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  const result = {
    amountMinor: left.amountMinor + right.amountMinor,
    currency: left.currency,
  };

  assertValidMoney(result);

  return result;
}

export function subtractMoney(left: Money, right: Money): Money {
  return addMoney(left, negateMoney(right));
}

export function negateMoney(money: Money): Money {
  assertValidMoney(money);

  const result = {
    amountMinor: -money.amountMinor,
    currency: money.currency,
  };

  assertValidMoney(result);

  return result;
}

export function zeroMoney(currency: string): Money {
  const money = { amountMinor: 0, currency };
  assertValidMoney(money);
  return money;
}

export function sumMoney(values: readonly Money[], currency: string): Money {
  return values.reduce((total, money) => addMoney(total, money), zeroMoney(currency));
}

export function assertBalancedSplits(transactionMoney: Money, splits: readonly { money: Money }[]) {
  if (splits.length === 0) {
    return;
  }

  const splitTotal = sumMoney(
    splits.map((split) => split.money),
    transactionMoney.currency,
  );

  if (splitTotal.amountMinor !== transactionMoney.amountMinor) {
    throw new Error("Transaction splits must equal the transaction amount");
  }
}

export function assertLedgerTransactionDraft(draft: LedgerTransactionDraft) {
  assertValidMoney(draft.money);

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
  const amountMinor = parseMoneyAmountMinor(
    requiredCsvValue(input.row, input.mapping.amount, "amount"),
    currency,
  );
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

function requiredCsvValue(row: CsvTransactionImportRow, column: string, label: string) {
  const value = row.values[column]?.trim();

  if (!value) {
    throw new Error(`CSV row ${label} is required`);
  }

  return value;
}

function parseCsvRecords(csv: string) {
  const normalizedCsv = csv
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
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

    if (char === "," && !inQuotes) {
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

export function currencyMinorUnitDigits(currency: string, locale = "en-US") {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }

  const minorUnitDigits = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;

  return minorUnitDigits ?? 2;
}

export function formatMoney(money: Money, options: { locale?: string } = {}) {
  assertValidMoney(money);

  const locale = options.locale ?? "en-US";
  const minorUnitDigits = currencyMinorUnitDigits(money.currency, locale);
  const amountMinor = BigInt(money.amountMinor);
  const isNegative = amountMinor < 0n;
  const absoluteMinor = isNegative ? -amountMinor : amountMinor;
  const minorUnitDivisor = 10n ** BigInt(minorUnitDigits);
  const majorUnits = absoluteMinor / minorUnitDivisor;
  const minorUnits = absoluteMinor % minorUnitDivisor;
  const formattedMajorUnits = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(majorUnits);
  const formattedMinorUnits =
    minorUnitDigits === 0 ? "" : `.${minorUnits.toString().padStart(minorUnitDigits, "0")}`;

  return `${isNegative ? "-" : ""}${money.currency} ${formattedMajorUnits}${formattedMinorUnits}`;
}
