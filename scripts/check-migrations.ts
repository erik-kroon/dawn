type Journal = {
  entries: Array<{ idx: number; tag: string }>;
};

const migrationDir = "packages/db/src/migrations";
const journal = (await Bun.file(`${migrationDir}/meta/_journal.json`).json()) as Journal;
const sqlFiles = gitLsFiles()
  .filter((file) => file.startsWith(`${migrationDir}/`) && file.endsWith(".sql"))
  .map((file) => file.slice(`${migrationDir}/`.length, -".sql".length))
  .sort();
const journalTags = journal.entries.map((entry) => entry.tag).sort();
const failures: string[] = [];

if (new Set(journalTags).size !== journalTags.length) {
  failures.push("migration journal contains duplicate tags");
}

for (const [index, entry] of journal.entries.entries()) {
  if (entry.idx !== index) {
    failures.push(`migration journal entry ${entry.tag} has idx ${entry.idx}, expected ${index}`);
  }
}

const missingSql = journalTags.filter((tag) => !sqlFiles.includes(tag));
const missingJournal = sqlFiles.filter((tag) => !journalTags.includes(tag));

for (const tag of missingSql) {
  failures.push(`migration ${tag} is listed in journal but has no SQL file`);
}

for (const tag of missingJournal) {
  failures.push(`migration ${tag} has a SQL file but is missing from journal`);
}

if (failures.length > 0) {
  console.error("Migration validation failed:");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Migration journal validated for ${journalTags.length} migrations.`);

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
