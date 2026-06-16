type SecretPattern = {
  name: string;
  pattern: RegExp;
};

const ignoredPathPatterns = [
  /^bun\.lock$/,
  /^goals\//,
  /^packages\/db\/src\/migrations\/meta\//,
  /\.test\.(ts|tsx)$/,
];
const secretPatterns: SecretPattern[] = [
  { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "aws secret access key",
    pattern: /\bAWS_SECRET_ACCESS_KEY\s*=\s*(?!changeme|example|placeholder|test\b)[^\s#'"]{16,}/i,
  },
  {
    name: "cloudflare api token",
    pattern: /\bCLOUDFLARE_API_TOKEN\s*=\s*(?!changeme|example|placeholder|test\b)[^\s#'"]{16,}/i,
  },
  {
    name: "openai api key",
    pattern: /\bOPENAI_API_KEY\s*=\s*(?!changeme|example|placeholder|test\b)sk-[A-Za-z0-9_-]{20,}/i,
  },
  {
    name: "gmail client secret",
    pattern:
      /\bGMAIL_CLIENT_SECRET\s*=\s*(?!changeme|example|placeholder|test\b)GOCSPX-[A-Za-z0-9_-]{20,}/i,
  },
  {
    name: "better auth secret",
    pattern:
      /\bBETTER_AUTH_SECRET\s*=\s*(?!changeme|example|placeholder|test\b)(?!0123456789abcdef0123456789abcdef\b)(?!12345678901234567890123456789012\b)(?!abcdefghijklmnopqrstuvwxyz123456\b)[^\s#'"]{24,}/i,
  },
  {
    name: "polar access token",
    pattern: /\bPOLAR_ACCESS_TOKEN\s*=\s*(?!changeme|example|placeholder|test\b)[^\s#'"]{16,}/i,
  },
  { name: "live secret key", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
];
const files = gitVisibleFiles().filter(
  (file) => !ignoredPathPatterns.some((pattern) => pattern.test(file)),
);
const failures: string[] = [];

for (const file of files) {
  const blob = Bun.file(file);

  if (!(await blob.exists())) {
    continue;
  }

  const content = await blob.text();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const secretPattern of secretPatterns) {
      if (secretPattern.pattern.test(line)) {
        failures.push(`${file}:${index + 1}: ${secretPattern.name}`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error("Git-visible secret scan failed:");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`No git-visible secret patterns found in ${files.length} files.`);

function gitVisibleFiles() {
  const result = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--modified", "--others", "--exclude-standard"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  if (!result.success) {
    throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  }

  return result.stdout.toString().split("\n").filter(Boolean);
}
