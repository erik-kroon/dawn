import { describe, expect, test } from "bun:test";

import { applyTransactionReview, deriveTransactionAccountantStatus } from "./index";

const transaction = {
  id: "txn_1",
  teamId: "team_1",
  description: "Figma",
  postedAt: "2026-06-14",
  money: { amountMinor: -1200, currency: "USD" },
  categoryId: null,
  reviewState: "needs_review" as const,
};

describe("applyTransactionReview", () => {
  test("returns the reviewed transaction and event metadata", () => {
    const review = applyTransactionReview(transaction, {
      id: "cat_1",
      teamId: "team_1",
      name: "Software",
    });

    expect(review.transaction.categoryId).toBe("cat_1");
    expect(review.transaction.reviewState).toBe("reviewed");
    expect(review.auditMetadata).toEqual({
      previousCategoryId: null,
      nextCategoryId: "cat_1",
      previousReviewState: "needs_review",
      nextReviewState: "reviewed",
    });
    expect(review.outboxPayload).toEqual({
      transactionId: "txn_1",
      categoryId: "cat_1",
      previousCategoryId: null,
      previousReviewState: "needs_review",
      nextReviewState: "reviewed",
    });
  });

  test("rejects categories from another team", () => {
    expect(() =>
      applyTransactionReview(transaction, {
        id: "cat_2",
        teamId: "team_2",
        name: "Travel",
      }),
    ).toThrow("Transaction category must belong to the transaction team");
  });
});

describe("deriveTransactionAccountantStatus", () => {
  test("separates review, receipt, and export-ready states", () => {
    expect(
      deriveTransactionAccountantStatus({
        transaction: { reviewState: "needs_review" },
        acceptedAttachmentCount: 0,
      }),
    ).toBe("needs_review");
    expect(
      deriveTransactionAccountantStatus({
        transaction: { reviewState: "needs_review" },
        acceptedAttachmentCount: 1,
      }),
    ).toBe("receipt_found");
    expect(
      deriveTransactionAccountantStatus({
        transaction: { reviewState: "reviewed" },
        acceptedAttachmentCount: 0,
      }),
    ).toBe("missing_receipt");
    expect(
      deriveTransactionAccountantStatus({
        transaction: { reviewState: "reviewed" },
        acceptedAttachmentCount: 1,
      }),
    ).toBe("ready_to_export");
  });

  test("persistent export and exclusion states override derived queue state", () => {
    for (const accountantStatus of [
      "exporting",
      "exported",
      "export_failed",
      "excluded",
      "archived",
    ] as const) {
      expect(
        deriveTransactionAccountantStatus({
          transaction: { reviewState: "reviewed", accountantStatus },
          acceptedAttachmentCount: 1,
        }),
      ).toBe(accountantStatus);
    }
  });
});
