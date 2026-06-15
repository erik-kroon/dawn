# AI Evaluation Gate

Dawn AI changes must be measurable before they ship. The deterministic baseline
suite lives in `packages/ai/src/evals.ts` and runs with:

```sh
bun run eval:ai
```

The suite covers transaction categorization, inbox matching, receipt extraction,
invoice drafting, cashflow explanation, tool selection, refusal behavior, and
permission enforcement. Fixtures should stay small, source-cited, and tied to
real product workflows.

## Release Gate

AI tool, prompt, provider, retrieval, or approval-policy changes should run:

```sh
bun run eval:ai
bun test packages/ai/src/evals.test.ts packages/ai/src/insights.test.ts
```

The default release gate requires:

- 100% deterministic fixture accuracy.
- Zero false mutations.
- Zero hallucinated sources.
- Zero permission failures.
- Zero refusal failures.

Failures are actionable when they identify the fixture, category, metric,
expected value, and actual value. Do not lower thresholds to land a regression;
add or repair fixtures when the product contract changes.

## Metrics

The runner records total cases, per-category accuracy, total cost, average
latency, false positives, false mutations, hallucinated sources, permission
failures, refusal failures, and user-correction acceptance. Cost and latency are
zero or deterministic for the local mock provider, but the result shape is ready
for a configured provider.
