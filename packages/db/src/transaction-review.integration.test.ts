import { afterEach, describe, expect, test } from "bun:test";
import {
  AppError,
  createLedgerCounterparty,
  createLedgerTransaction,
  createLedgerTransferPair,
  createTransactionTag,
  listLedgerSummary,
} from "@dawn/app";
import { drizzle } from "drizzle-orm/node-postgres";
import { readdirSync, readFileSync } from "node:fs";
import { Client, Pool } from "pg";

import * as schema from "./schema";

const databaseUrl = process.env.DAWN_DATABASE_TEST_URL;
const integrationTest = databaseUrl ? test : test.skip;
const createdSchemas: string[] = [];

afterEach(async () => {
  while (createdSchemas.length > 0) {
    const schemaName = createdSchemas.pop();

    if (schemaName && databaseUrl) {
      await dropSchema(databaseUrl, schemaName);
    }
  }
});

describe("DrizzleTransactionReviewRepository integration", () => {
  integrationTest(
    "persists ledger metadata, reports, tenant predicates, and rollbacks",
    async () => {
      if (!databaseUrl) {
        return;
      }

      const { pool, repository, schemaName } = await createMigratedRepository(databaseUrl);
      const actor = { id: "user_integration_1", type: "user" } as const;
      const otherActor = { id: "user_integration_2", type: "user" } as const;

      try {
        const team = await repository.createTeam({ actor, name: "Integration Team" });
        const otherTeam = await repository.createTeam({ actor: otherActor, name: "Other Team" });
        const context = { actor, requestId: "request_integration_1", teamId: team.id };
        const account = (await repository.listLedgerAccounts(team.id))[0];

        expect(account).toBeDefined();

        const counterparty = await createLedgerCounterparty(repository, context, {
          teamId: team.id,
          name: "Acme Inc",
          idempotencyKey: "counterparty_1",
        });
        const tag = await createTransactionTag(repository, context, {
          teamId: team.id,
          name: "SaaS",
          idempotencyKey: "tag_1",
        });
        const transaction = await createLedgerTransaction(repository, context, {
          teamId: team.id,
          accountId: account!.id,
          description: "Acme subscription",
          postedAt: "2026-06-16T00:00:00.000Z",
          money: { amountMinor: -2500, currency: "USD" },
          type: "expense",
          source: "manual",
          counterpartyId: counterparty.counterparty.id,
          tagIds: [tag.tag.id],
          idempotencyKey: "txn_1",
        });
        const transactionReplay = await createLedgerTransaction(repository, context, {
          teamId: team.id,
          accountId: account!.id,
          description: "Acme subscription",
          postedAt: "2026-06-16T00:00:00.000Z",
          money: { amountMinor: -2500, currency: "USD" },
          type: "expense",
          source: "manual",
          counterpartyId: counterparty.counterparty.id,
          tagIds: [tag.tag.id],
          idempotencyKey: "txn_1",
        });

        await pool.query(
          `insert into "${schemaName}"."ledger_account" ("id", "team_id", "name", "currency", "type") values ($1, $2, $3, $4, $5)`,
          ["acct_transfer_to", team.id, "Savings", "USD", "bank"],
        );

        const transfer = await createLedgerTransferPair(repository, context, {
          teamId: team.id,
          fromAccountId: account!.id,
          toAccountId: "acct_transfer_to",
          postedAt: "2026-06-17T00:00:00.000Z",
          description: "Reserve",
          money: { amountMinor: 5000, currency: "USD" },
          tagIds: [tag.tag.id],
          idempotencyKey: "transfer_1",
        });

        const summary = await listLedgerSummary(repository, context, { teamId: team.id });

        expect(transactionReplay).toEqual({ ...transaction, replayed: true });
        expect(summary.counterparties).toEqual([counterparty.counterparty]);
        expect(summary.tags).toEqual([tag.tag]);
        expect(summary.transactionCount).toBe(4);
        expect(summary.totals.expenses).toEqual({ amountMinor: -3700, currency: "USD" });
        expect(summary.totals.profit).toEqual({ amountMinor: -3700, currency: "USD" });
        expect(transfer.fromTransaction.transferGroupId).toBe(transfer.transferGroupId);
        expect(transfer.toTransaction.transferGroupId).toBe(transfer.transferGroupId);
        expect(await repository.getLedgerAccountForTeam(otherTeam.id, account!.id)).toBeNull();
        await expect(
          listLedgerSummary(repository, context, { teamId: otherTeam.id }),
        ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot read ledger data for this team"));

        await expect(
          repository.withTransaction(async (transactionRepository) => {
            await transactionRepository.upsertCounterparty({
              teamId: team.id,
              name: "Rolled Back LLC",
            });
            throw new Error("force rollback");
          }),
        ).rejects.toThrow("force rollback");

        expect(
          (await repository.listCounterparties(team.id)).some(
            (item) => item.name === "Rolled Back LLC",
          ),
        ).toBe(false);
      } finally {
        await pool.end();
        await dropSchema(databaseUrl, schemaName);
        const schemaIndex = createdSchemas.indexOf(schemaName);

        if (schemaIndex >= 0) {
          createdSchemas.splice(schemaIndex, 1);
        }
      }
    },
  );
});

async function createMigratedRepository(connectionString: string) {
  const schemaName = `dawn_integration_${crypto.randomUUID().replaceAll("-", "_")}`;
  const adminClient = new Client({ connectionString });

  assertTestSchemaName(schemaName);
  await adminClient.connect();

  try {
    await adminClient.query(`create schema "${schemaName}"`);
    createdSchemas.push(schemaName);
    await adminClient.query(`set search_path to "${schemaName}"`);
    await runMigrations(adminClient, schemaName);
  } finally {
    await adminClient.end();
  }

  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schemaName}`,
  });
  const db = drizzle(pool, { schema });
  seedServerEnvForRepositoryImport(connectionString);
  const { DrizzleTransactionReviewRepository } = await import("./transaction-review");

  return {
    pool,
    repository: new DrizzleTransactionReviewRepository(db),
    schemaName,
  };
}

async function runMigrations(client: Client, schemaName: string) {
  const migrationsUrl = new URL("./migrations/", import.meta.url);
  const migrationFiles = readdirSync(migrationsUrl)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sqlText = readFileSync(new URL(migrationFile, migrationsUrl), "utf8").replaceAll(
      '"public".',
      `"${schemaName}".`,
    );

    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();

      if (trimmed) {
        await client.query(trimmed);
      }
    }
  }
}

async function dropSchema(connectionString: string, schemaName: string) {
  const client = new Client({ connectionString });

  assertTestSchemaName(schemaName);
  await client.connect();

  try {
    await client.query(`drop schema if exists "${schemaName}" cascade`);
  } finally {
    await client.end();
  }
}

function assertTestSchemaName(schemaName: string) {
  if (!/^dawn_integration_[a-f0-9_]+$/.test(schemaName)) {
    throw new Error(`Unsafe integration test schema name: ${schemaName}`);
  }
}

function seedServerEnvForRepositoryImport(databaseUrlValue: string) {
  process.env.DATABASE_URL ??= databaseUrlValue;
  process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.POLAR_ACCESS_TOKEN ??= "test";
  process.env.POLAR_SUCCESS_URL ??= "http://localhost:3000/success";
  process.env.CORS_ORIGIN ??= "http://localhost:3001";
}
