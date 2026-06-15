const roots = ["apps", "packages"];
const testFiles: string[] = [];

for (const root of roots) {
  const glob = new Bun.Glob("**/*.test.ts");

  for await (const path of glob.scan({ cwd: root, dot: false, onlyFiles: true })) {
    testFiles.push(`${root}/${path}`);
  }
}

testFiles.sort();

if (testFiles.length === 0) {
  console.error("No Dawn test files found.");
  process.exit(1);
}

const result = Bun.spawnSync(["bun", "test", ...testFiles], {
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(result.exitCode);

export {};
