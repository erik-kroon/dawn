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

export function assertValidMoney(money: Money) {
  if (!Number.isInteger(money.amountMinor)) {
    throw new Error("Money amount must use integer minor units");
  }

  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 code");
  }
}
