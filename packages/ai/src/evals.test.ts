import { describe, expect, test } from "bun:test";

import {
  defaultAiEvalFixtures,
  evaluateAiEvalCase,
  runAiEvaluationSuite,
  type AiEvalCaseOutput,
} from "./evals";

describe("AI evaluation harness", () => {
  test("runs deterministic fixtures with release-gate metrics", async () => {
    const result = await runAiEvaluationSuite();

    expect(result.releaseGate.passed).toBe(true);
    expect(result.metrics.totalCases).toBe(defaultAiEvalFixtures.length);
    expect(result.metrics.accuracy).toBe(1);
    expect(result.metrics.falseMutations).toBe(0);
    expect(result.metrics.hallucinatedSources).toBe(0);
    expect(result.metrics.permissionFailures).toBe(0);
    expect(result.metrics.refusalFailures).toBe(0);
    expect(result.metrics.userCorrections).toBe(1);
    expect(result.metrics.acceptedCorrections).toBe(1);
    expect(result.metrics.byCategory.permission_enforcement.passed).toBe(1);
  });

  test("reports actionable failures for unsafe or ungrounded outputs", async () => {
    const fixture = defaultAiEvalFixtures.find(
      (candidate) => candidate.id === "refuse-send-without-permission",
    );
    if (!fixture) {
      throw new Error("Missing permission eval fixture");
    }

    const unsafeOutput: AiEvalCaseOutput = {
      prediction: { refusedToolNames: [] },
      sourceRefs: [{ type: "invoice", id: "invoice_1", label: "INV-001" }],
      toolNames: ["send_invoice"],
      refused: false,
      mutationRequested: true,
      approvalRequested: false,
      costMicros: 20,
      latencyMs: 10,
      correctionAccepted: false,
    };

    const result = evaluateAiEvalCase(fixture, unsafeOutput);

    expect(result.passed).toBe(false);
    expect(result.failures.map((failure) => failure.metric)).toContain("permission");
    expect(result.failures.map((failure) => failure.metric)).toContain("refusal");
    expect(result.failures.map((failure) => failure.metric)).toContain("false_mutation");
    expect(result.failures[0]?.message).toBeTruthy();
  });

  test("fails the release gate when provider output regresses", async () => {
    const [fixture] = defaultAiEvalFixtures;
    if (!fixture) {
      throw new Error("Missing eval fixture");
    }

    const result = await runAiEvaluationSuite({
      fixtures: [fixture],
      provider: {
        name: "bad-provider",
        async runCase() {
          return {
            prediction: { categoryId: "cat_meals", confidence: 0.95 },
            sourceRefs: [],
            toolNames: [],
            refused: false,
            mutationRequested: false,
            approvalRequested: false,
            costMicros: 100,
            latencyMs: 12,
            correctionAccepted: false,
          };
        },
      },
    });

    expect(result.releaseGate.passed).toBe(false);
    expect(result.metrics.falsePositives).toBe(1);
    expect(result.releaseGate.failures.some((failure) => failure.caseId === fixture.id)).toBe(true);
  });
});
