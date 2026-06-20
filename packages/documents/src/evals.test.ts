import { describe, expect, test } from "bun:test";

import {
  createFixtureDocumentEvalExtractor,
  documentEvalFixtures,
  evaluateDocumentExtractionCases,
  shouldRunProviderDocumentEvals,
} from "./evals";

describe("document extraction evals", () => {
  test("cover representative receipt and invoice fixture shapes", () => {
    expect(documentEvalFixtures.map((fixture) => fixture.id)).toEqual([
      "body-only-receipt-email",
      "clear-image-receipt",
      "scanned-pdf-receipt",
      "readable-pdf-receipt",
      "invoice-due-date-number",
      "non-financial-pdf",
      "receipt-multiple-totals",
      "foreign-currency-receipt",
      "tax-heavy-receipt",
    ]);
    expect(documentEvalFixtures.some((fixture) => fixture.input.sourceKind === "gmail_body")).toBe(
      true,
    );
    expect(documentEvalFixtures.some((fixture) => fixture.input.sourceKind === "binary")).toBe(
      true,
    );
  });

  test("reports field accuracy, critical recall, classification, and matching impact", async () => {
    const report = await evaluateDocumentExtractionCases({
      cases: documentEvalFixtures,
      extractor: createFixtureDocumentEvalExtractor({
        overrides: {
          "body-only-receipt-email": {
            fields: {
              documentType: "receipt",
              merchantName: "Delta Coffee",
              issuedAt: null,
              totalAmountMinor: 1250,
              currency: "USD",
            },
          },
          "non-financial-pdf": {
            fields: {
              documentType: "receipt",
              merchantName: "Board Minutes",
              totalAmountMinor: 0,
              currency: "USD",
            },
          },
        },
      }),
    });

    expect(report.totalCases).toBe(9);
    expect(report.criticalFieldRecall).toMatchObject({
      expected: 34,
      extracted: 33,
      score: 0.971,
    });
    expect(report.falseFinancialDocumentClassifications).toEqual(["non-financial-pdf"]);
    expect(report.fieldAccuracy).toMatchObject({
      amount: { expected: 8, correct: 8, score: 1 },
      currency: { expected: 8, correct: 8, score: 1 },
      date: { expected: 8, correct: 7, score: 0.875 },
      merchantOrVendor: { expected: 8, correct: 8, score: 1 },
      invoiceNumber: { expected: 1, correct: 1, score: 1 },
    });
    expect(report.matchingImpact).toMatchObject({
      evaluated: 8,
      correctTop: 7,
      missed: 1,
      falsePositive: 0,
      accuracy: 0.875,
    });
    expect(report.findings.map((finding) => finding.caseId)).toEqual(
      expect.arrayContaining(["body-only-receipt-email", "non-financial-pdf"]),
    );
  });

  test("runs deterministic fixture evals without provider keys", async () => {
    const report = await evaluateDocumentExtractionCases({
      cases: documentEvalFixtures,
      extractor: createFixtureDocumentEvalExtractor(),
    });

    expect(report.totalCases).toBe(9);
    expect(report.criticalFieldRecall.score).toBe(1);
    expect(report.fieldAccuracy.amount.score).toBe(1);
    expect(report.matchingImpact.accuracy).toBe(1);
  });

  test("gates provider evals on configured provider keys", () => {
    expect(shouldRunProviderDocumentEvals({})).toBe(false);
    expect(shouldRunProviderDocumentEvals({ GEMINI_API_KEY: "gemini-key" })).toBe(true);
    expect(shouldRunProviderDocumentEvals({ OPENROUTER_API_KEY: "openrouter-key" })).toBe(true);
    expect(
      shouldRunProviderDocumentEvals({
        DAWN_DOCUMENTS_OPENAI_COMPATIBLE_API_KEY: "openai-compatible-key",
        DAWN_DOCUMENTS_OPENAI_COMPATIBLE_BASE_URL: "https://models.example/v1",
      }),
    ).toBe(true);
  });
});
