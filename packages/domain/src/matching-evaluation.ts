import {
  calibrateMatchPolicy,
  evaluateAutoMatch,
  suggestInboxTransactionMatches,
  type InboxMatchCandidate,
  type InboxMatchInput,
  type InboxMatchMemory,
  type InboxMatchSuggestion,
  type MatchPolicy,
} from "./inbox-matching";

export type MatchingEvaluationOutcomeStatus =
  | "confirmed"
  | "rejected"
  | "unmatched"
  | "suggested"
  | "auto_matched";

export type MatchingEvaluationCase = {
  id: string;
  teamId: string;
  occurredAt?: string | null;
  input: InboxMatchInput;
  candidates: readonly InboxMatchCandidate[];
  memory?: InboxMatchMemory;
  outcome: {
    status: MatchingEvaluationOutcomeStatus;
    transactionId?: string | null;
  };
};

export type MatchingEvaluationFilters = {
  teamId?: string | null;
  from?: string | null;
  to?: string | null;
  suggestedScoreThreshold?: number | null;
};

export type NormalizedMatchingEvaluationFilters = {
  teamId: string | null;
  from: string | null;
  to: string | null;
  suggestedScoreThreshold: number;
};

export type MatchingEvaluationBucket = {
  total: number;
  withSuggestion: number;
  aboveAutoThreshold: number;
  autoEligible: number;
  correctTop: number;
  wrongTop: number;
  missed: number;
};

export type MatchingEvaluationFinding = {
  caseId: string;
  teamId: string;
  outcome: MatchingEvaluationOutcomeStatus;
  expectedTransactionId?: string | null;
  suggestedTransactionId?: string | null;
  score?: number | null;
  reason: string;
};

export type MatchingEvaluationReport = {
  filters: NormalizedMatchingEvaluationFilters;
  totalCases: number;
  buckets: Record<MatchingEvaluationOutcomeStatus, MatchingEvaluationBucket>;
  thresholdQuality: {
    suggestedScoreThreshold: number;
    autoMatchScoreThreshold: number;
    aboveSuggestedThreshold: number;
    aboveAutoThreshold: number;
    autoEligible: number;
  };
  scoreDistribution: {
    min: number | null;
    p50: number | null;
    p90: number | null;
    max: number | null;
    average: number | null;
  };
  likelyFalsePositives: MatchingEvaluationFinding[];
  likelyFalseNegatives: MatchingEvaluationFinding[];
  reviewCandidates: MatchingEvaluationFinding[];
};

type CaseResult = {
  evaluationCase: MatchingEvaluationCase;
  suggestions: InboxMatchSuggestion[];
  topSuggestion?: InboxMatchSuggestion;
  policy: MatchPolicy;
  autoEligible: boolean;
};

export function evaluateMatchingCases(input: {
  cases: readonly MatchingEvaluationCase[];
  filters?: MatchingEvaluationFilters;
}): MatchingEvaluationReport {
  const filters = normalizeEvaluationFilters(input.filters);
  const results = input.cases
    .filter((evaluationCase) => caseMatchesFilters(evaluationCase, filters))
    .map((evaluationCase) => evaluateCase(evaluationCase, filters));
  const buckets = emptyBuckets();
  const likelyFalsePositives: MatchingEvaluationFinding[] = [];
  const likelyFalseNegatives: MatchingEvaluationFinding[] = [];
  const reviewCandidates: MatchingEvaluationFinding[] = [];
  let aboveSuggestedThreshold = 0;
  let aboveAutoThreshold = 0;
  let autoEligible = 0;

  for (const result of results) {
    const status = result.evaluationCase.outcome.status;
    const bucket = buckets[status];
    const top = result.topSuggestion;
    const expectedTransactionId = result.evaluationCase.outcome.transactionId ?? null;

    bucket.total += 1;

    if (top) {
      bucket.withSuggestion += 1;
      aboveSuggestedThreshold += 1;
    }

    if (top && top.score >= result.policy.autoMatchScoreThreshold) {
      bucket.aboveAutoThreshold += 1;
      aboveAutoThreshold += 1;
    }

    if (result.autoEligible) {
      bucket.autoEligible += 1;
      autoEligible += 1;
    }

    if (expectedTransactionId) {
      if (top?.transactionId === expectedTransactionId) {
        bucket.correctTop += 1;
      } else if (top) {
        bucket.wrongTop += 1;
      } else {
        bucket.missed += 1;
      }
    }

    const falsePositive = likelyFalsePositive(result);
    if (falsePositive) {
      likelyFalsePositives.push(falsePositive);
      reviewCandidates.push(falsePositive);
    }

    const falseNegative = likelyFalseNegative(result);
    if (falseNegative) {
      likelyFalseNegatives.push(falseNegative);
      reviewCandidates.push(falseNegative);
    }

    const thresholdReview = nearThresholdReview(result);
    if (thresholdReview) {
      reviewCandidates.push(thresholdReview);
    }
  }

  return {
    filters,
    totalCases: results.length,
    buckets,
    thresholdQuality: {
      suggestedScoreThreshold: filters.suggestedScoreThreshold,
      autoMatchScoreThreshold:
        results[0]?.policy.autoMatchScoreThreshold ??
        calibrateMatchPolicy().autoMatchScoreThreshold,
      aboveSuggestedThreshold,
      aboveAutoThreshold,
      autoEligible,
    },
    scoreDistribution: scoreDistribution(
      results
        .map((result) => result.topSuggestion?.score)
        .filter((score): score is number => typeof score === "number"),
    ),
    likelyFalsePositives,
    likelyFalseNegatives,
    reviewCandidates: uniqueFindings(reviewCandidates).slice(0, 20),
  };
}

function evaluateCase(
  evaluationCase: MatchingEvaluationCase,
  filters: NormalizedMatchingEvaluationFilters,
): CaseResult {
  const memory = evaluationCase.memory ?? {};
  const calibratedPolicy = calibrateMatchPolicy(memory);
  const policy = {
    ...calibratedPolicy,
    suggestedScoreThreshold: filters.suggestedScoreThreshold,
  };
  const suggestions = suggestInboxTransactionMatches(
    evaluationCase.input,
    evaluationCase.candidates,
    memory,
    policy,
  ).filter((suggestion) => suggestion.score >= policy.suggestedScoreThreshold);
  const topSuggestion = suggestions[0];
  const autoEvaluation = evaluateAutoMatch({
    enabled: true,
    candidate: topSuggestion ?? null,
    alternatives: suggestions,
    policy,
  });

  return {
    evaluationCase,
    suggestions,
    topSuggestion,
    policy,
    autoEligible: autoEvaluation.eligible,
  };
}

function likelyFalsePositive(result: CaseResult): MatchingEvaluationFinding | null {
  const top = result.topSuggestion;
  const outcome = result.evaluationCase.outcome;

  if (!top) {
    return null;
  }

  if (outcome.status === "rejected" || outcome.status === "unmatched") {
    return finding(result, "Suggested a match for a rejected or unmatched case");
  }

  if (outcome.transactionId && top.transactionId !== outcome.transactionId) {
    return finding(result, "Top suggestion differs from confirmed outcome");
  }

  return null;
}

function likelyFalseNegative(result: CaseResult): MatchingEvaluationFinding | null {
  const outcome = result.evaluationCase.outcome;

  if (!outcome.transactionId || outcome.status === "rejected" || outcome.status === "unmatched") {
    return null;
  }

  if (!result.topSuggestion) {
    return finding(result, "No suggestion for a case with a known outcome");
  }

  if (result.topSuggestion.transactionId !== outcome.transactionId) {
    return finding(result, "Expected transaction was not the top suggestion");
  }

  return null;
}

function nearThresholdReview(result: CaseResult): MatchingEvaluationFinding | null {
  const top = result.topSuggestion;

  if (!top) {
    return null;
  }

  const distance = Math.abs(top.score - result.policy.suggestedScoreThreshold);

  return distance <= 0.05 ? finding(result, "Top score is close to threshold") : null;
}

function finding(result: CaseResult, reason: string): MatchingEvaluationFinding {
  const outcome = result.evaluationCase.outcome;
  const top = result.topSuggestion;

  return {
    caseId: result.evaluationCase.id,
    teamId: result.evaluationCase.teamId,
    outcome: outcome.status,
    expectedTransactionId: outcome.transactionId ?? null,
    suggestedTransactionId: top?.transactionId ?? null,
    score: top?.score ?? null,
    reason,
  };
}

function emptyBuckets(): Record<MatchingEvaluationOutcomeStatus, MatchingEvaluationBucket> {
  return {
    confirmed: emptyBucket(),
    rejected: emptyBucket(),
    unmatched: emptyBucket(),
    suggested: emptyBucket(),
    auto_matched: emptyBucket(),
  };
}

function emptyBucket(): MatchingEvaluationBucket {
  return {
    total: 0,
    withSuggestion: 0,
    aboveAutoThreshold: 0,
    autoEligible: 0,
    correctTop: 0,
    wrongTop: 0,
    missed: 0,
  };
}

function scoreDistribution(scores: number[]): MatchingEvaluationReport["scoreDistribution"] {
  if (scores.length === 0) {
    return { min: null, p50: null, p90: null, max: null, average: null };
  }

  const sorted = [...scores].sort((left, right) => left - right);
  const average = sorted.reduce((total, score) => total + score, 0) / sorted.length;

  return {
    min: roundScore(sorted[0] ?? 0),
    p50: roundScore(percentile(sorted, 0.5)),
    p90: roundScore(percentile(sorted, 0.9)),
    max: roundScore(sorted.at(-1) ?? 0),
    average: roundScore(average),
  };
}

function percentile(sortedScores: number[], percentileValue: number) {
  const index = Math.min(
    sortedScores.length - 1,
    Math.max(0, Math.ceil(sortedScores.length * percentileValue) - 1),
  );
  return sortedScores[index] ?? 0;
}

function uniqueFindings(findings: MatchingEvaluationFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.caseId}:${finding.reason}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeEvaluationFilters(
  filters: MatchingEvaluationFilters | undefined,
): NormalizedMatchingEvaluationFilters {
  return {
    teamId: filters?.teamId ?? null,
    from: filters?.from ?? null,
    to: filters?.to ?? null,
    suggestedScoreThreshold:
      typeof filters?.suggestedScoreThreshold === "number"
        ? Math.max(0, Math.min(1, filters.suggestedScoreThreshold))
        : calibrateMatchPolicy().suggestedScoreThreshold,
  };
}

function caseMatchesFilters(
  evaluationCase: MatchingEvaluationCase,
  filters: NormalizedMatchingEvaluationFilters,
) {
  if (filters.teamId && evaluationCase.teamId !== filters.teamId) {
    return false;
  }

  const occurredAt = evaluationCase.occurredAt ? new Date(evaluationCase.occurredAt) : null;

  if (filters.from && (!occurredAt || occurredAt < new Date(filters.from))) {
    return false;
  }

  if (filters.to && (!occurredAt || occurredAt > new Date(filters.to))) {
    return false;
  }

  return true;
}

function roundScore(score: number) {
  return Math.round(score * 100) / 100;
}
