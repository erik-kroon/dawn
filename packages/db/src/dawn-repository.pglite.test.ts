import { describe, expect, test } from "bun:test";
import {
  AppError,
  commitCsvTransactionImport,
  createLedgerCounterparty,
  createLedgerTransaction,
  createLedgerTransferPair,
  createTransactionTag,
  listLedgerSummary,
} from "@dawn/app";
import { eq } from "drizzle-orm";

import * as schema from "./schema";
import { createPgliteDawnRepository } from "./testkit/pglite";

type PgliteKit = Awaited<ReturnType<typeof createPgliteDawnRepository>>;

type TestActor = {
  id: string;
  type: "user";
};

describe("DrizzleDawnRepository PGlite contracts", () => {
  test("preserves financial state boundaries, idempotency, tags, transfers, and rollbacks", async () => {
    const kit = await createPgliteDawnRepository();

    try {
      const workspace = await createWorkspace(kit, {
        actorId: "user_pglite_1",
        email: "pglite-owner@example.com",
        name: "PGlite Owner",
        teamName: "PGlite Team",
      });
      const otherWorkspace = await createWorkspace(kit, {
        actorId: "user_pglite_2",
        email: "other-pglite-owner@example.com",
        name: "Other PGlite Owner",
        teamName: "Other PGlite Team",
      });
      const savingsAccount = await createLedgerAccount(kit, workspace.team.id, {
        name: "Savings",
      });
      const counterparty = await createLedgerCounterparty(kit.repository, workspace.context, {
        teamId: workspace.team.id,
        name: "Acme Inc",
        idempotencyKey: "pglite_counterparty_1",
      });
      const tag = await createTransactionTag(kit.repository, workspace.context, {
        teamId: workspace.team.id,
        name: "SaaS",
        idempotencyKey: "pglite_tag_1",
      });
      const transactionCommand = {
        teamId: workspace.team.id,
        accountId: workspace.account.id,
        description: "Acme subscription",
        postedAt: "2026-06-16T00:00:00.000Z",
        money: { amountMinor: -2500, currency: "USD" },
        type: "expense",
        source: "manual",
        counterpartyId: counterparty.counterparty.id,
        tagIds: [tag.tag.id],
        idempotencyKey: "pglite_txn_1",
      } as const;

      const created = await createLedgerTransaction(
        kit.repository,
        workspace.context,
        transactionCommand,
      );
      const replayed = await createLedgerTransaction(
        kit.repository,
        workspace.context,
        transactionCommand,
      );

      await expect(
        createLedgerTransaction(kit.repository, workspace.context, {
          ...transactionCommand,
          idempotencyKey: "pglite_txn_duplicate",
        }),
      ).rejects.toEqual(
        new AppError("CONFLICT", "Ledger transaction duplicate key already exists"),
      );
      await expect(
        createLedgerTransaction(kit.repository, workspace.context, {
          ...transactionCommand,
          money: { amountMinor: -2600, currency: "USD" },
        }),
      ).rejects.toEqual(
        new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different ledger transaction",
        ),
      );

      const transfer = await createLedgerTransferPair(kit.repository, workspace.context, {
        teamId: workspace.team.id,
        fromAccountId: workspace.account.id,
        toAccountId: savingsAccount.id,
        postedAt: "2026-06-17T00:00:00.000Z",
        description: "Owner reserve",
        money: { amountMinor: 5000, currency: "USD" },
        tagIds: [tag.tag.id],
        idempotencyKey: "pglite_transfer_1",
      });
      const transferReplay = await createLedgerTransferPair(kit.repository, workspace.context, {
        teamId: workspace.team.id,
        fromAccountId: workspace.account.id,
        toAccountId: savingsAccount.id,
        postedAt: "2026-06-17T00:00:00.000Z",
        description: "Owner reserve",
        money: { amountMinor: 5000, currency: "USD" },
        tagIds: [tag.tag.id],
        idempotencyKey: "pglite_transfer_1",
      });
      const summary = await listLedgerSummary(kit.repository, workspace.context, {
        teamId: workspace.team.id,
      });
      const auditEvents = await kit.repository.listAuditEvents({
        teamId: workspace.team.id,
        limit: 10,
      });
      const outboxEvents = await kit.repository.listOutboxEvents(workspace.team.id, 10);
      const rawOutboxEvents = await kit.db
        .select({
          type: schema.outboxEvent.type,
          payload: schema.outboxEvent.payload,
          status: schema.outboxEvent.status,
        })
        .from(schema.outboxEvent)
        .where(eq(schema.outboxEvent.teamId, workspace.team.id));
      const tagAssignments = await kit.db.select().from(schema.transactionTagAssignment);

      expect(replayed).toEqual({ ...created, replayed: true });
      expect(transferReplay).toEqual({ ...transfer, replayed: true });
      expect(summary.transactionCount).toBe(4);
      expect(summary.totals.expenses).toEqual({ amountMinor: -8700, currency: "USD" });
      expect(summary.totals.profit).toEqual({ amountMinor: -3700, currency: "USD" });
      expect(transfer.fromTransaction.transferGroupId).toBe(transfer.transferGroupId);
      expect(transfer.toTransaction.transferGroupId).toBe(transfer.transferGroupId);
      expect(tagAssignments.map((assignment) => assignment.transactionId).sort()).toEqual(
        [created.transaction.id, transfer.fromTransaction.id, transfer.toTransaction.id].sort(),
      );
      expect(tagAssignments.every((assignment) => assignment.tagId === tag.tag.id)).toBe(true);
      expect(auditEvents.map((event) => event.action).sort()).toEqual([
        "ledger.counterparty.created",
        "ledger.transaction_tag.created",
        "transaction.created",
        "transaction.transfer_pair.created",
      ]);
      expect(outboxEvents.map((event) => event.type).sort()).toEqual([
        "transaction.created",
        "transaction.transfer_pair.created",
      ]);
      expect(rawOutboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              actorId: workspace.actor.id,
              requestId: workspace.context.requestId,
              transactionId: created.transaction.id,
            }),
            status: "pending",
            type: "transaction.created",
          }),
          expect.objectContaining({
            payload: expect.objectContaining({
              transferGroupId: transfer.transferGroupId,
            }),
            status: "pending",
            type: "transaction.transfer_pair.created",
          }),
        ]),
      );
      expect(
        await kit.repository.getLedgerAccountForTeam(otherWorkspace.team.id, workspace.account.id),
      ).toBeNull();
      await expect(
        listLedgerSummary(kit.repository, workspace.context, { teamId: otherWorkspace.team.id }),
      ).rejects.toEqual(new AppError("FORBIDDEN", "You cannot read ledger data for this team"));

      await expect(
        kit.repository.withTransaction(async (transactionRepository) => {
          await transactionRepository.upsertCounterparty({
            teamId: workspace.team.id,
            name: "Rolled Back LLC",
          });
          throw new Error("force rollback");
        }),
      ).rejects.toThrow("force rollback");
      expect(
        (await kit.repository.listCounterparties(workspace.team.id)).some(
          (item) => item.name === "Rolled Back LLC",
        ),
      ).toBe(false);
    } finally {
      await kit.dispose();
    }
  });

  test("persists CSV import sessions, imported transactions, audit, outbox, and replay state", async () => {
    const kit = await createPgliteDawnRepository();

    try {
      const workspace = await createWorkspace(kit, {
        actorId: "user_pglite_import_1",
        email: "pglite-import-owner@example.com",
        name: "PGlite Import Owner",
        teamName: "PGlite Import Team",
      });
      const workspaceData = await kit.repository.listWorkspace(workspace.actor, workspace.team.id);
      const softwareCategory = workspaceData.categories.find(
        (category) => category.name === "Software",
      );

      if (!softwareCategory) {
        throw new Error("Expected seeded Software category");
      }

      const command = {
        teamId: workspace.team.id,
        accountId: workspace.account.id,
        fileName: "transactions.csv",
        csvText:
          "Date,Description,Amount\n2026-06-18,Cloudflare,-12.00\n2026-06-19,Consulting,50.00\n",
        mapping: {
          postedAt: "Date",
          description: "Description",
          amount: "Amount",
          categoryId: softwareCategory.id,
        },
        idempotencyKey: "pglite_import_1",
      } as const;

      const result = await commitCsvTransactionImport(kit.repository, workspace.context, command);
      const replayed = await commitCsvTransactionImport(kit.repository, workspace.context, command);
      const importSessions = await kit.db
        .select()
        .from(schema.transactionImportSession)
        .where(eq(schema.transactionImportSession.teamId, workspace.team.id));
      const auditEvents = await kit.repository.listAuditEvents({
        teamId: workspace.team.id,
        limit: 10,
        action: "transaction_import.committed",
      });
      const outboxEvents = await kit.repository.listOutboxEvents(workspace.team.id, 10);

      expect(replayed).toEqual({ ...result, replayed: true });
      expect(result.importSession.importedCount).toBe(2);
      expect(result.transactions).toHaveLength(2);
      expect(importSessions).toEqual([
        expect.objectContaining({
          accountId: workspace.account.id,
          duplicateCount: 0,
          fileName: "transactions.csv",
          importedCount: 2,
          invalidCount: 0,
          rowCount: 2,
          teamId: workspace.team.id,
        }),
      ]);
      expect(auditEvents).toEqual([
        expect.objectContaining({
          action: "transaction_import.committed",
          actorId: workspace.actor.id,
          entityId: result.importSession.id,
          entityType: "transaction_import",
          requestId: workspace.context.requestId,
        }),
      ]);
      expect(outboxEvents).toContainEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            importSessionId: result.importSession.id,
            transactionIds: result.transactions.map((transaction) => transaction.id),
          }),
          status: "pending",
          type: "transaction_import.committed",
        }),
      );
    } finally {
      await kit.dispose();
    }
  });
});

async function createWorkspace(
  kit: PgliteKit,
  input: {
    actorId: string;
    email: string;
    name: string;
    teamName: string;
  },
) {
  const actor = { id: input.actorId, type: "user" } satisfies TestActor;

  await kit.db.insert(schema.user).values({
    id: actor.id,
    name: input.name,
    email: input.email,
  });

  const team = await kit.repository.createTeam({ actor, name: input.teamName });
  const [account] = await kit.repository.listLedgerAccounts(team.id);

  if (!account) {
    throw new Error("Expected createTeam to seed an operating ledger account");
  }

  return {
    actor,
    team,
    account,
    context: {
      actor,
      requestId: `request_${input.actorId}`,
      teamId: team.id,
    },
  };
}

async function createLedgerAccount(
  kit: PgliteKit,
  teamId: string,
  input: {
    name: string;
    currency?: string;
    type?: string;
  },
) {
  const account = {
    id: crypto.randomUUID(),
    teamId,
    name: input.name,
    currency: input.currency ?? "USD",
    type: input.type ?? "bank",
  };

  await kit.db.insert(schema.ledgerAccount).values(account);

  return account;
}
