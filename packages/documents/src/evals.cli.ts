import {
  createDocumentEvalProviderFromEnv,
  createFixtureDocumentEvalExtractor,
  createProviderDocumentEvalExtractor,
  documentEvalFixtures,
  evaluateDocumentExtractionCases,
  shouldRunProviderDocumentEvals,
} from "./evals";

const options = parseArgs(Bun.argv.slice(2));
const report = await runDocumentEvals(options);

console.log(JSON.stringify(report, null, 2));

type CliOptions = {
  provider: boolean;
};

async function runDocumentEvals(options: CliOptions) {
  if (!options.provider) {
    return evaluateDocumentExtractionCases({
      cases: documentEvalFixtures,
      extractor: createFixtureDocumentEvalExtractor(),
    });
  }

  if (!shouldRunProviderDocumentEvals()) {
    return {
      skipped: true,
      reason:
        "Provider document evals require GEMINI_API_KEY, OPENROUTER_API_KEY, or an OpenAI-compatible key and base URL.",
      totalCases: documentEvalFixtures.length,
    };
  }

  const provider = createDocumentEvalProviderFromEnv();

  if (!provider) {
    return {
      skipped: true,
      reason: "Provider document evals are not configured.",
      totalCases: documentEvalFixtures.length,
    };
  }

  return evaluateDocumentExtractionCases({
    cases: documentEvalFixtures,
    extractor: createProviderDocumentEvalExtractor(provider),
  });
}

function parseArgs(args: string[]): CliOptions {
  return {
    provider: args.includes("--provider"),
  };
}
