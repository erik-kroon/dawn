import { describe, expect, test } from "bun:test";

import {
  categorizationGoldenCases,
  matchingGoldenCases,
  type CategorizationGoldenCase,
  type MatchingGoldenCase,
  validateCategorizationGoldenCases,
  validateMatchingGoldenCases,
} from "./__fixtures__/golden-datasets";
import { suggestInboxTransactionMatches, suggestTransactionCategory } from "./index";

describe("domain golden datasets", () => {
  test("validates matching and categorization golden case structure", () => {
    expect(() => validateMatchingGoldenCases(matchingGoldenCases)).not.toThrow();
    expect(() => validateCategorizationGoldenCases(categorizationGoldenCases)).not.toThrow();

    expect(() =>
      validateMatchingGoldenCases([
        ...matchingGoldenCases,
        { ...matchingGoldenCases[0]! } as MatchingGoldenCase,
      ]),
    ).toThrow("Duplicate golden case id");
    expect(() =>
      validateCategorizationGoldenCases([
        {
          ...categorizationGoldenCases[0]!,
          expected: { categoryId: "missing_category" },
        } as CategorizationGoldenCase,
      ]),
    ).toThrow("expects an unknown category");
  });

  test("matches receipts to transactions across golden cases", () => {
    for (const goldenCase of matchingGoldenCases) {
      const suggestions = suggestInboxTransactionMatches(
        goldenCase.input,
        goldenCase.candidates,
        goldenCase.memory,
      );
      const topSuggestion = suggestions[0] ?? null;

      if (goldenCase.expected.topTransactionId !== undefined) {
        expect(topSuggestion?.transactionId ?? null).toBe(goldenCase.expected.topTransactionId);
      }

      if (goldenCase.expected.topConfidence) {
        expect(topSuggestion?.confidence).toBe(goldenCase.expected.topConfidence);
      }

      if (goldenCase.expected.minimumTopScore != null) {
        expect(topSuggestion?.score ?? 0).toBeGreaterThanOrEqual(
          goldenCase.expected.minimumTopScore,
        );
      }

      for (const excludedId of goldenCase.expected.excludedTransactionIds ?? []) {
        expect(suggestions.some((suggestion) => suggestion.transactionId === excludedId)).toBe(
          false,
        );
      }

      for (const [transactionId, maximumScore] of Object.entries(
        goldenCase.expected.maximumScoreByTransactionId ?? {},
      )) {
        const suggestion = suggestions.find(
          (candidate) => candidate.transactionId === transactionId,
        );

        expect(suggestion?.score ?? 0).toBeLessThanOrEqual(maximumScore);
      }
    }
  });

  test("suggests stable transaction categories across golden cases", () => {
    for (const goldenCase of categorizationGoldenCases) {
      const suggestion = suggestTransactionCategory({
        transaction: goldenCase.transaction,
        categories: goldenCase.categories,
      });

      expect(suggestion.categoryId).toBe(goldenCase.expected.categoryId);

      if (goldenCase.expected.minimumConfidence != null) {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(goldenCase.expected.minimumConfidence);
      }

      if (goldenCase.expected.maximumConfidence != null) {
        expect(suggestion.confidence).toBeLessThanOrEqual(goldenCase.expected.maximumConfidence);
      }
    }
  });

  test("keeps golden dataset checks small enough for the default suite", () => {
    const startedAt = performance.now();

    for (let index = 0; index < 100; index += 1) {
      for (const goldenCase of matchingGoldenCases) {
        suggestInboxTransactionMatches(goldenCase.input, goldenCase.candidates, goldenCase.memory);
      }

      for (const goldenCase of categorizationGoldenCases) {
        suggestTransactionCategory({
          transaction: goldenCase.transaction,
          categories: goldenCase.categories,
        });
      }
    }

    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
