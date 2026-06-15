import { describe, expect, test } from "bun:test";

import { createReviewRepository, createTestTransaction } from "@dawn/app/testkit/fixtures";

import { processAccountantPacketExportJob } from "./accountant-packet-export";
import { createMemoryDocumentObjectStorage } from "./document-storage";

describe("accountant packet export worker", () => {
  test("stores packet archives with resolved receipt attachments", async () => {
    const repository = createReviewRepository("member");
    const storage = createMemoryDocumentObjectStorage();
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        categoryId: "cat_1",
        reviewState: "reviewed",
      }),
    );
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });
    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      body: new TextEncoder().encode("receipt from storage").buffer,
      contentType: "application/pdf",
    });

    const result = await processAccountantPacketExportJob({
      repository,
      storage,
      generatedAt: "2026-06-15T12:00:00.000Z",
      message: {
        type: "accountant_packet.export",
        teamId: "team_1",
        actorId: "user_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        formats: ["csv"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "accountant-packet:export:outbox_1",
      },
    });

    const archive = await storage.get(result.objectKey);

    expect(archive?.contentType).toBe("application/zip");
    expect(Buffer.from(archive?.body ?? new ArrayBuffer(0)).toString()).toContain(
      "receipt from storage",
    );
    expect(repository.transactions.get("txn_1")?.accountantStatus).toBe("exported");
  });
});
