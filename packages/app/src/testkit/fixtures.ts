import type { Category, LedgerAccount, TeamRole, Transaction } from "@dawn/domain";

import { MemoryAppRepository } from "./memory-repository";

export const testActor = { id: "user_1", type: "user" } as const;
export const testRequestId = "request_1";
export const testTeamId = "team_1";
export const testCategoryId = "cat_1";
export const testAccountId = "acct_1";
export const testTransactionId = "txn_1";

export const testContext = {
  actor: testActor,
  requestId: testRequestId,
  teamId: testTeamId,
};

export function createTestCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: testCategoryId,
    teamId: testTeamId,
    name: "Software",
    ...overrides,
  };
}

export function createTestLedgerAccount(overrides: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: testAccountId,
    teamId: testTeamId,
    name: "Operating",
    currency: "USD",
    type: "bank",
    ...overrides,
  };
}

export function createTestTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: testTransactionId,
    teamId: testTeamId,
    accountId: testAccountId,
    description: "Figma",
    postedAt: "2026-06-14",
    money: { amountMinor: -1200, currency: "USD" },
    categoryId: null,
    reviewState: "needs_review",
    accountantStatus: "needs_review",
    accountantStatusReason: null,
    accountantStatusUpdatedAt: null,
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

export function createReviewRepository(role: TeamRole = "member") {
  const repository = new MemoryAppRepository();

  repository.memberships.set(`${testActor.id}:${testTeamId}`, role);
  repository.accounts.set(testAccountId, createTestLedgerAccount());
  repository.categories.set(testCategoryId, createTestCategory());
  repository.transactions.set(testTransactionId, createTestTransaction());

  return repository;
}
