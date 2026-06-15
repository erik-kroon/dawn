import { afterEach, describe, expect, test } from "bun:test";
import {
  AppError,
  createLedgerCounterparty,
  createLedgerTransaction,
  createLedgerTransferPair,
  createTransactionTag,
  listLedgerSummary,
} from "@dawn/app";

import {
  cleanupPostgresTestSchemas,
  createPostgresDawnRepository,
  getPostgresTestDatabaseUrl,
  seedPostgresTestUser,
} from "./testkit/postgres";

const databaseUrl = getPostgresTestDatabaseUrl();
const postgresTest = databaseUrl ? test : test.skip;

afterEach(cleanupPostgresTestSchemas);

describe("DrizzleDawnRepository Postgres parity", () => {
  postgresTest("persists ledger metadata, reports, tenant predicates, and rollbacks", async () => {
    if (!databaseUrl) {
      return;
    }

    const kit = await createPostgresDawnRepository(databaseUrl);
    const actor = { id: "user_integration_1", type: "user" } as const;
    const otherActor = { id: "user_integration_2", type: "user" } as const;
    const { pool, repository, schemaName } = kit;

    try {
      await seedPostgresTestUser(pool, schemaName, {
        id: actor.id,
        name: "Integration Owner",
        email: "integration-owner@example.com",
      });
      await seedPostgresTestUser(pool, schemaName, {
        id: otherActor.id,
        name: "Other Integration Owner",
        email: "other-integration-owner@example.com",
      });

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
      expect(summary.totals.expenses).toEqual({ amountMinor: -8700, currency: "USD" });
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
      await kit.dispose();
    }
  });
});
