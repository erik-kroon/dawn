import { describe, expect, test } from "bun:test";

import { commitCsvTransactionImport } from "@dawn/app";
import { MemoryAppRepository } from "@dawn/app/testkit/memory-repository";
import type { TransactionImportCommitJob } from "@dawn/jobs";

import {
  createTransactionImportPayloadStorage,
  processQueuedCsvTransactionImportJob,
} from "./csv-transaction-import";
import { createMemoryDocumentObjectStorage } from "./document-storage";

describe("queued CSV transaction import worker", () => {
  test("commits a stored queued import and removes the payload", async () => {
    const repository = new MemoryAppRepository();
    repository.memberships.set("user_1:team_1", "owner");
    repository.accounts.set("acct_1", {
      id: "acct_1",
      teamId: "team_1",
      name: "Operating",
      currency: "USD",
      type: "bank",
    });
    const objectStorage = createMemoryDocumentObjectStorage();
    const payloadStorage = createTransactionImportPayloadStorage(objectStorage);
    const queued = await commitCsvTransactionImport(
      repository,
      {
        actor: { id: "user_1", type: "user" },
        requestId: "request_1",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        accountId: "acct_1",
        fileName: "large-bank-export.csv",
        csvText:
          "Date,Description,Amount\n2026-06-14,Figma subscription,-12.00\n2026-06-15,Invoice,50.00\n",
        mapping: {
          postedAt: "Date",
          description: "Description",
          amount: "Amount",
        },
        idempotencyKey: "idem_large_import",
      },
      {
        payloadStorage,
        synchronousRowLimit: 1,
      },
    );
    const payloadObjectKey = queued.queuedJob?.payloadObjectKey;

    if (!payloadObjectKey) {
      throw new Error("Expected queued import payload object key");
    }

    await processQueuedCsvTransactionImportJob({
      repository,
      storage: objectStorage,
      message: {
        type: "transaction_import.commit",
        teamId: "team_1",
        importSessionId: queued.importSession.id,
        payloadObjectKey,
        actorId: "user_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "transaction-import:commit:outbox_1:import_1",
      } satisfies TransactionImportCommitJob,
    });

    expect(repository.importSessions[0]).toMatchObject({
      id: queued.importSession.id,
      status: "committed",
      importedCount: 2,
    });
    expect(repository.transactions.size).toBe(2);
    expect(await objectStorage.get(payloadObjectKey)).toBeNull();
  });
});
