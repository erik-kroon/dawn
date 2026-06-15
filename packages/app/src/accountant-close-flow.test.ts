import { describe, expect, test } from "bun:test";

import {
  commitCsvTransactionImport,
  exportAccountantPacket,
  reviewTransaction,
  type AccountantPacketAttachment,
} from ".";
import { createReviewRepository, testActor } from "./testkit/fixtures";

const context = {
  actor: testActor,
  requestId: "close_loop_request",
  teamId: "team_1",
};

describe("accountant close-loop fixture", () => {
  test("imports, reviews, attaches evidence, exports, and reruns without duplicates", async () => {
    const repository = createReviewRepository("owner");
    repository.transactions.clear();
    repository.packetAttachments.length = 0;
    const importCommand = {
      teamId: "team_1",
      accountId: "acct_1",
      fileName: "june-bank.csv",
      csvText: [
        "Date,Description,Amount,Currency",
        "2026-06-14,Figma subscription,-12.00,USD",
        "2026-06-15,Coffee Shop,-8.50,USD",
      ].join("\n"),
      mapping: {
        postedAt: "Date",
        description: "Description",
        amount: "Amount",
        currency: "Currency",
        categoryId: "cat_1",
      },
      idempotencyKey: "june_import_1",
    };

    const imported = await commitCsvTransactionImport(repository, context, importCommand);
    const importReplay = await commitCsvTransactionImport(repository, context, importCommand);

    expect(imported.transactions).toHaveLength(2);
    expect(importReplay.replayed).toBe(true);
    expect(repository.transactions).toHaveLength(2);

    for (const transaction of imported.transactions) {
      await reviewTransaction(repository, context, {
        teamId: "team_1",
        transactionId: transaction.id,
        categoryId: "cat_1",
        idempotencyKey: `review_${transaction.id}`,
      });
    }

    const attachments = imported.transactions.map<AccountantPacketAttachment>(
      (transaction, index) => ({
        transactionId: transaction.id,
        documentId: `doc_${index + 1}`,
        inboxItemId: `inbox_${index + 1}`,
        versionId: `ver_${index + 1}`,
        objectKey: `teams/team_1/documents/doc_${index + 1}/versions/ver_${index + 1}/receipt.pdf`,
        fileName: `${transaction.description.toLowerCase().replace(/\s+/g, "-")}.pdf`,
        contentType: "application/pdf",
        byteSize: 32,
        title: `${transaction.description} receipt`,
      }),
    );
    repository.packetAttachments.push(...attachments);
    const exportCommand = {
      teamId: "team_1",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      transactionIds: imported.transactions.map((transaction) => transaction.id),
      formats: ["csv", "xlsx"] as const,
      csvDelimiter: "," as const,
      idempotencyKey: "june_packet_1",
    };
    const attachmentResolver = {
      async readAttachment(attachment: AccountantPacketAttachment) {
        return {
          body: new TextEncoder().encode(`receipt bytes for ${attachment.transactionId}`),
          contentType: attachment.contentType,
        };
      },
    };

    const packet = await exportAccountantPacket(
      repository,
      context,
      exportCommand,
      attachmentResolver,
    );
    const packetReplay = await exportAccountantPacket(
      repository,
      context,
      exportCommand,
      attachmentResolver,
    );
    const zipText = Buffer.from(packet.bodyBase64, "base64").toString("utf8");

    expect(packetReplay.replayed).toBe(true);
    expect(repository.transactions).toHaveLength(2);
    expect(packet.manifest).toMatchObject({
      transactionCount: 2,
      attachmentCount: 2,
      skippedAttachmentCount: 0,
      settings: { formats: ["csv", "xlsx"] },
    });
    expect(packet.manifest.currencyTotals.USD).toEqual({
      amountMinor: -2050,
      currency: "USD",
    });
    expect(zipText).toContain("transactions.csv");
    expect(zipText).toContain("transactions.xlsx");
    expect(zipText).toContain("attachments/2026-06-14-txn_1-figma-subscription.pdf");
    expect(
      [...repository.transactions.values()].map((transaction) => transaction.accountantStatus),
    ).toEqual(["exported", "exported"]);
  });
});
