import { describe, expect, test } from "bun:test";

import { matchingEvaluationFixtures } from "./__fixtures__/matching-evaluation";
import { evaluateMatchingCases } from "./matching-evaluation";

describe("matching evaluation", () => {
  test("reports lifecycle buckets, score quality, and review findings", () => {
    const report = evaluateMatchingCases({ cases: matchingEvaluationFixtures });

    expect(report.totalCases).toBe(6);
    expect(report.buckets.confirmed.total).toBe(2);
    expect(report.buckets.rejected.total).toBe(1);
    expect(report.buckets.unmatched.total).toBe(1);
    expect(report.buckets.suggested.total).toBe(1);
    expect(report.buckets.auto_matched.total).toBe(1);
    expect(report.thresholdQuality.aboveSuggestedThreshold).toBeGreaterThan(0);
    expect(report.scoreDistribution.max).toBeGreaterThanOrEqual(0.95);
    expect(report.likelyFalsePositives.map((finding) => finding.caseId)).toEqual(
      expect.arrayContaining(["eval-rejected-wrong-match", "eval-unmatched-amount-only"]),
    );
    expect(report.likelyFalseNegatives.map((finding) => finding.caseId)).toContain(
      "eval-confirmed-missed",
    );
    expect(report.reviewCandidates.length).toBeGreaterThanOrEqual(
      report.likelyFalsePositives.length + report.likelyFalseNegatives.length,
    );
  });

  test("supports team and date filters", () => {
    const report = evaluateMatchingCases({
      cases: matchingEvaluationFixtures,
      filters: {
        teamId: "team_eval_a",
        from: "2026-06-15T00:00:00.000Z",
        to: "2026-06-18T23:59:59.999Z",
      },
    });

    expect(report.totalCases).toBe(2);
    expect(report.buckets.suggested.total).toBe(1);
    expect(report.buckets.auto_matched.total).toBe(1);
    expect(report.buckets.rejected.total).toBe(0);
  });

  test("supports a fixed suggested threshold override", () => {
    const defaultReport = evaluateMatchingCases({ cases: matchingEvaluationFixtures });
    const strictReport = evaluateMatchingCases({
      cases: matchingEvaluationFixtures,
      filters: { suggestedScoreThreshold: 0.9 },
    });

    expect(strictReport.filters.suggestedScoreThreshold).toBe(0.9);
    expect(strictReport.thresholdQuality.aboveSuggestedThreshold).toBeLessThanOrEqual(
      defaultReport.thresholdQuality.aboveSuggestedThreshold,
    );
  });
});
