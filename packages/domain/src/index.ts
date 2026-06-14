export type Actor = {
  id: string;
  type: "user";
};

export type TeamRole = "owner" | "admin" | "member" | "accountant" | "viewer";

export type Permission = "transactions:read" | "transactions:review";

export type Team = {
  id: string;
  name: string;
};

export type TeamMembership = {
  teamId: string;
  userId: string;
  role: TeamRole;
};

export type Money = {
  amountMinor: number;
  currency: string;
};

export type TransactionReviewState = "needs_review" | "reviewed";

export type Transaction = {
  id: string;
  teamId: string;
  description: string;
  postedAt: string;
  money: Money;
  categoryId: string | null;
  reviewState: TransactionReviewState;
};

export type Category = {
  id: string;
  teamId: string;
  name: string;
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

export const rolePermissions: Record<TeamRole, readonly Permission[]> = {
  owner: ["transactions:read", "transactions:review"],
  admin: ["transactions:read", "transactions:review"],
  member: ["transactions:read", "transactions:review"],
  accountant: ["transactions:read", "transactions:review"],
  viewer: ["transactions:read"],
};

export function roleHasPermission(role: TeamRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
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

export function assertValidMoney(money: Money) {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("Money amount must use safe integer minor units");
  }

  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }
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
