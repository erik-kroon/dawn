import { runAiEvaluationSuite } from "./evals";

const result = await runAiEvaluationSuite();
const summary = {
  provider: result.provider,
  metrics: result.metrics,
  releaseGate: result.releaseGate,
};

console.log(JSON.stringify(summary, null, 2));

if (!result.releaseGate.passed) {
  process.exit(1);
}
