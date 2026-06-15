const forbiddenPatterns = [
  /\/\/\s*@ts-ignore\b/,
  /\/\/\s*@ts-expect-error\b/,
  /\/\/\s*@ts-nocheck\b/,
];
const files = gitLsFiles().filter((file) => /\.(ts|tsx)$/.test(file));
const failures: string[] = [];

for (const file of files) {
  const content = await Bun.file(file).text();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (forbiddenPatterns.some((pattern) => pattern.test(line))) {
      failures.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error("Ignored TypeScript errors are not allowed:");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`No ignored TypeScript errors found in ${files.length} files.`);

function gitLsFiles() {
  const result = Bun.spawnSync(["git", "ls-files"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!result.success) {
    throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  }

  return result.stdout.toString().split("\n").filter(Boolean);
}
