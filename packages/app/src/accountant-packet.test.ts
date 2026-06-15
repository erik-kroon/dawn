import { describe, expect, test } from "bun:test";

import { AppError, exportAccountantPacket } from "./index";
import {
  createReviewRepository,
  createTestCategory,
  createTestTransaction,
  testActor,
} from "./testkit/fixtures";

describe("exportAccountantPacket", () => {
  test("generates a ZIP with CSV, manifest, available attachments, audit, and outbox", async () => {
    const repository = createReviewRepository("member");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        description: "Figma subscription",
        postedAt: "2026-06-14T00:00:00.000Z",
        categoryId: "cat_1",
        reviewState: "reviewed",
      }),
    );
    repository.categories.set("cat_1", createTestCategory({ id: "cat_1", name: "Software" }));
    repository.counterparties.set("merchant_1", {
      id: "merchant_1",
      teamId: "team_1",
      name: "Figma",
    });
    repository.tags.set("tag_1", { id: "tag_1", teamId: "team_1", name: "SaaS" });
    repository.tagAssignments.push({ transactionId: "txn_1", tagId: "tag_1" });
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 13,
      title: "Receipt",
    });

    const result = await exportAccountantPacket(
      repository,
      { actor: testActor, requestId: "request_1" },
      {
        teamId: "team_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        idempotencyKey: "packet_1",
      },
      {
        async readAttachment(attachment) {
          expect(attachment.objectKey).toBe(
            "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
          );
          return {
            body: new TextEncoder().encode("receipt bytes"),
            contentType: attachment.contentType,
          };
        },
      },
    );
    const zipText = Buffer.from(result.bodyBase64, "base64").toString("utf8");

    expect(result.contentType).toBe("application/zip");
    expect(result.manifest).toMatchObject({
      teamId: "team_1",
      transactionCount: 1,
      attachmentCount: 1,
      skippedAttachmentCount: 0,
      currencyTotals: { USD: { amountMinor: -1200, currency: "USD" } },
    });
    expect(result.manifest.files.map((file) => file.path)).toEqual([
      "transactions.csv",
      "manifest.json",
      "attachments/2026-06-14-txn_1-receipt.pdf",
    ]);
    expect(zipText).toContain("transactions.csv");
    expect(zipText).toContain("manifest.json");
    expect(zipText).toContain("Figma subscription");
    expect(zipText).toContain("receipt bytes");
    expect(repository.auditEvents).toMatchObject([{ action: "accountant_packet.exported" }]);
    expect(repository.outboxEvents).toMatchObject([{ type: "accountant_packet.exported" }]);
  });

  test("rejects viewers", async () => {
    const repository = createReviewRepository("viewer");

    await expect(
      exportAccountantPacket(
        repository,
        { actor: testActor, requestId: "request_1" },
        {
          teamId: "team_1",
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          idempotencyKey: "packet_1",
        },
      ),
    ).rejects.toEqual(
      new AppError("FORBIDDEN", "You cannot export accountant packets for this team"),
    );
  });

  test("replays idempotent exports without duplicate side effects", async () => {
    const repository = createReviewRepository("owner");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        categoryId: "cat_1",
        reviewState: "reviewed",
      }),
    );
    const command = {
      teamId: "team_1",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      idempotencyKey: "packet_1",
    };

    const first = await exportAccountantPacket(
      repository,
      { actor: testActor, requestId: "request_1" },
      command,
    );
    const second = await exportAccountantPacket(
      repository,
      { actor: testActor, requestId: "request_2" },
      command,
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.packetId).toBe(first.packetId);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });
});
