import { matchingEvaluationFixtures } from "./__fixtures__/matching-evaluation";
import { evaluateMatchingCases, type MatchingEvaluationFilters } from "./matching-evaluation";

const filters = parseFilters(Bun.argv.slice(2));
const report = evaluateMatchingCases({
  cases: matchingEvaluationFixtures,
  filters,
});

console.log(JSON.stringify(report, null, 2));

function parseFilters(args: string[]): MatchingEvaluationFilters {
  const filters: MatchingEvaluationFilters = {};

  for (const arg of args) {
    const [key, value] = arg.split("=");

    if (!value) {
      continue;
    }

    if (key === "--team") {
      filters.teamId = value;
    } else if (key === "--from") {
      filters.from = value;
    } else if (key === "--to") {
      filters.to = value;
    } else if (key === "--threshold") {
      filters.suggestedScoreThreshold = Number(value);
    }
  }

  return filters;
}
