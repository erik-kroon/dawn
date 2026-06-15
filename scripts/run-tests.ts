type TestLane = "fast" | "unit" | "pglite" | "postgres" | "e2e" | "vitest";

const roots = ["apps", "packages"];
const lane = parseLane(Bun.argv);
const testFiles: string[] = [];

for (const root of roots) {
  const glob = new Bun.Glob("**/*.{test,spec}.{ts,tsx}");

  for await (const path of glob.scan({ cwd: root, dot: false, onlyFiles: true })) {
    const testPath = `${root}/${path}`;

    if (matchesLane(testPath, lane)) {
      testFiles.push(testPath);
    }
  }
}

testFiles.sort();

if (testFiles.length === 0) {
  if (lane === "fast" || lane === "unit") {
    console.error(`No Dawn ${lane} test files found.`);
    process.exit(1);
  }

  console.log(`No Dawn ${lane} test files found yet.`);
  process.exit(0);
}

const command =
  lane === "vitest"
    ? ["bun", "node_modules/vitest/vitest.mjs", "run", ...testFiles]
    : ["bun", "test", ...testFiles];

const result = Bun.spawnSync(command, {
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(result.exitCode);

export {};

function parseLane(argv: string[]): TestLane {
  const laneFlag = argv.find((arg) => arg.startsWith("--lane="));
  const laneValue = laneFlag?.slice("--lane=".length) ?? "fast";

  if (
    laneValue === "fast" ||
    laneValue === "unit" ||
    laneValue === "pglite" ||
    laneValue === "postgres" ||
    laneValue === "e2e" ||
    laneValue === "vitest"
  ) {
    return laneValue;
  }

  console.error(`Unsupported test lane: ${laneValue}`);
  process.exit(1);
}

function matchesLane(testPath: string, targetLane: TestLane) {
  const fileLane = classifyTestFile(testPath);

  if (targetLane === "fast") {
    return fileLane === "unit" || fileLane === "legacy-integration";
  }

  if (targetLane === "postgres") {
    return fileLane === "postgres" || fileLane === "legacy-integration";
  }

  return fileLane === targetLane;
}

function classifyTestFile(
  testPath: string,
): "unit" | "pglite" | "postgres" | "e2e" | "vitest" | "legacy-integration" {
  if (testPath.endsWith(".pglite.test.ts")) {
    return "pglite";
  }

  if (testPath.endsWith(".postgres.test.ts")) {
    return "postgres";
  }

  if (testPath.endsWith(".integration.test.ts")) {
    return "legacy-integration";
  }

  if (testPath.endsWith(".e2e.test.ts") || testPath.endsWith(".e2e.test.tsx")) {
    return "e2e";
  }

  if (testPath.endsWith(".vitest.test.ts") || testPath.endsWith(".vitest.test.tsx")) {
    return "vitest";
  }

  return "unit";
}
