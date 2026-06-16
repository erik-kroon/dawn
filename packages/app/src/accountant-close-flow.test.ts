import { describe, expect, test } from "bun:test";

import {
  commitCsvTransactionImport,
  exportAccountantPacket,
  listTransactionReviewWorkspace,
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
    const reviewWorkspace = await listTransactionReviewWorkspace(repository, context);
    const importedTransactionIds = imported.transactions.map((transaction) => transaction.id);
    const reviewQueueTransactions = reviewWorkspace.transactions.filter((transaction) =>
      importedTransactionIds.includes(transaction.id),
    );

    expect(reviewQueueTransactions.map((transaction) => transaction.id)).toEqual(
      importedTransactionIds,
    );
    expect(reviewQueueTransactions.map((transaction) => transaction.reviewState)).toEqual([
      "needs_review",
      "needs_review",
    ]);
    expect(reviewQueueTransactions.map((transaction) => transaction.accountantStatus)).toEqual([
      "needs_review",
      "needs_review",
    ]);

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
    const zipEntries = readStoredZipEntries(packet.bodyBase64);
    const manifest = JSON.parse(zipEntryText(zipEntries, "manifest.json")) as {
      transactionCount: number;
      attachmentCount: number;
      skippedAttachmentCount: number;
      filters: { transactionIds: string[] };
      settings: { formats: string[]; csvDelimiter: string };
      currencyTotals: Record<string, { amountMinor: number; currency: string }>;
      files: { path: string }[];
    };
    const expectedAttachmentPaths = imported.transactions.map(
      (transaction) =>
        `attachments/${transaction.postedAt.slice(0, 10)}-${transaction.id}-${transaction.description
          .toLowerCase()
          .replace(/\s+/g, "-")}.pdf`,
    );
    const csvText = zipEntryText(zipEntries, "transactions.csv");

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
    expect(new Set(zipEntries.keys())).toEqual(
      new Set([
        "transactions.csv",
        "transactions.xlsx",
        "manifest.json",
        ...expectedAttachmentPaths,
      ]),
    );
    expect(csvText).toContain("date,description,amount,currency");
    expect(csvText).toContain("2026-06-14,Figma subscription,-12.00,USD");
    expect(csvText).toContain("2026-06-15,Coffee Shop,-8.50,USD");
    expect(zipEntries.get("transactions.xlsx")?.byteLength ?? 0).toBeGreaterThan(0);
    expect(manifest).toMatchObject({
      transactionCount: 2,
      attachmentCount: 2,
      skippedAttachmentCount: 0,
      filters: {
        transactionIds: imported.transactions.map((transaction) => transaction.id),
      },
      settings: { formats: ["csv", "xlsx"], csvDelimiter: "," },
      currencyTotals: { USD: { amountMinor: -2050, currency: "USD" } },
    });
    expect(manifest.files.map((file) => file.path)).toEqual([
      "transactions.csv",
      "transactions.xlsx",
      ...expectedAttachmentPaths,
    ]);
    for (const [index, path] of expectedAttachmentPaths.entries()) {
      expect(zipEntryText(zipEntries, path)).toBe(
        `receipt bytes for ${imported.transactions[index]?.id}`,
      );
    }
    expect(
      [...repository.transactions.values()].map((transaction) => transaction.accountantStatus),
    ).toEqual(["exported", "exported"]);
  });
});

function readStoredZipEntries(bodyBase64: string) {
  const bytes = Buffer.from(bodyBase64, "base64");
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < bytes.byteLength) {
    const signature = bytes.readUInt32LE(offset);

    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    expect(signature).toBe(0x04034b50);
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);

    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const fileNameLength = bytes.readUInt16LE(offset + 26);
    const extraFieldLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraFieldLength;
    const contentEnd = contentStart + compressedSize;
    const name = bytes.subarray(nameStart, nameStart + fileNameLength).toString("utf8");

    expect(compressedSize).toBe(uncompressedSize);
    entries.set(name, bytes.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }

  return entries;
}

function zipEntryText(entries: Map<string, Buffer>, path: string) {
  const entry = entries.get(path);

  expect(entry).toBeDefined();

  return entry?.toString("utf8") ?? "";
}
