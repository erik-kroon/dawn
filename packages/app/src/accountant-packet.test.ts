import { describe, expect, test } from "bun:test";

import {
  AppError,
  completeStoredAccountantPacketExport,
  createAccountantPacketDownload,
  exportAccountantPacket,
  listAccountantPacketExportHistory,
  requestAccountantPacketExport,
} from "./index";
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
    expect(repository.transactions.get("txn_1")?.accountantStatus).toBe("exported");
    expect(repository.auditEvents).toMatchObject([{ action: "accountant_packet.exported" }]);
    expect(repository.outboxEvents).toMatchObject([{ type: "accountant_packet.exported" }]);
  });

  test("supports CSV delimiter and XLSX export settings with file hashes", async () => {
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
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
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
        formats: ["csv", "xlsx"],
        csvDelimiter: ";",
        idempotencyKey: "packet_formats_1",
      },
    );
    const zipText = Buffer.from(result.bodyBase64, "base64").toString("utf8");

    expect(result.manifest.settings).toEqual({
      formats: ["csv", "xlsx"],
      csvDelimiter: ";",
    });
    expect(result.manifest.files.map((file) => file.path)).toEqual([
      "transactions.csv",
      "transactions.xlsx",
      "manifest.json",
    ]);
    expect(result.manifest.files.every((file) => file.sha256)).toBe(true);
    expect(zipText).toContain("date;description;amount;currency");
    expect(zipText).toContain("transactions.xlsx");
    expect(zipText).toContain("Figma subscription");
    expect(zipText).toContain("worksheet");
  });

  test("allows accountants to export ready packets", async () => {
    const repository = createReviewRepository("accountant");
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
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
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
        idempotencyKey: "accountant_packet_1",
      },
    );

    expect(result.manifest.transactionCount).toBe(1);
    expect(repository.transactions.get("txn_1")?.accountantStatus).toBe("exported");
  });

  test("requires at least one export format", async () => {
    const repository = createReviewRepository("member");

    await expect(
      exportAccountantPacket(
        repository,
        { actor: testActor, requestId: "request_1" },
        {
          teamId: "team_1",
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          formats: [],
          idempotencyKey: "packet_no_formats",
        },
      ),
    ).rejects.toEqual(new AppError("CONFLICT", "At least one export format is required"));
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
    repository.packetAttachments.push({
      transactionId: "txn_1",
      documentId: "doc_1",
      inboxItemId: "inbox_1",
      versionId: "ver_1",
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });
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

  test("queues stored accountant packet exports idempotently", async () => {
    const repository = createReviewRepository("member");
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
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });

    const first = await requestAccountantPacketExport(
      repository,
      { actor: testActor, requestId: "request_1" },
      {
        teamId: "team_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        formats: ["csv", "xlsx"],
        csvDelimiter: ";",
        idempotencyKey: "stored_packet_1",
      },
    );
    const replay = await requestAccountantPacketExport(
      repository,
      { actor: testActor, requestId: "request_2" },
      {
        teamId: "team_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        formats: ["csv", "xlsx"],
        csvDelimiter: ";",
        idempotencyKey: "stored_packet_1",
      },
    );

    expect(first.workflow).toMatchObject({
      type: "accountant_packet_export",
      status: "queued",
    });
    expect(replay.replayed).toBe(true);
    expect(repository.auditEvents).toMatchObject([
      { action: "accountant_packet.export_requested" },
    ]);
    expect(repository.outboxEvents).toMatchObject([
      {
        type: "accountant_packet.export_requested",
        payload: {
          actorId: "user_1",
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          transactionIds: ["txn_1"],
          formats: ["csv", "xlsx"],
          csvDelimiter: ";",
        },
      },
    ]);
  });

  test("stores queued accountant packet archives before marking transactions exported", async () => {
    const repository = createReviewRepository("member");
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
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });
    const storedObjects = new Map<
      string,
      { body: ArrayBuffer; contentType: string; byteSize: number }
    >();
    let writeCount = 0;
    const storage = {
      async put(input: { objectKey: string; body: ArrayBuffer; contentType: string }) {
        writeCount += 1;
        storedObjects.set(input.objectKey, {
          body: input.body,
          contentType: input.contentType,
          byteSize: input.body.byteLength,
        });
      },
    };
    const command = {
      teamId: "team_1",
      actorId: "user_1",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      transactionIds: ["txn_1"],
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "accountant-packet:export:outbox_1",
      generatedAt: "2026-06-15T12:00:00.000Z",
    };

    const first = await completeStoredAccountantPacketExport(repository, storage, command, {
      async readAttachment(attachment) {
        return {
          body: new TextEncoder().encode(`stored ${attachment.fileName}`),
          contentType: attachment.contentType,
        };
      },
    });
    const replay = await completeStoredAccountantPacketExport(repository, storage, command);

    expect(first.objectKey).toBe(`teams/team_1/accountant-packets/${first.packetId}.zip`);
    expect(storedObjects.get(first.objectKey)?.contentType).toBe("application/zip");
    expect(
      Buffer.from(storedObjects.get(first.objectKey)?.body ?? new ArrayBuffer(0)).toString(),
    ).toContain("stored receipt.pdf");
    expect(replay.replayed).toBe(true);
    expect(writeCount).toBe(1);
    expect(repository.transactions.get("txn_1")?.accountantStatus).toBe("exported");
    expect(repository.auditEvents).toMatchObject([{ action: "accountant_packet.exported" }]);
    expect(repository.outboxEvents).toMatchObject([
      {
        type: "accountant_packet.exported",
        payload: {
          packetId: first.packetId,
          objectKey: first.objectKey,
          byteSize: first.byteSize,
        },
      },
    ]);
  });

  test("does not mark transactions exported when stored packet upload fails", async () => {
    const repository = createReviewRepository("member");
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
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });
    const storage = {
      async put() {
        throw new Error("R2 unavailable");
      },
    };

    await expect(
      completeStoredAccountantPacketExport(repository, storage, {
        teamId: "team_1",
        actorId: "user_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "accountant-packet:export:outbox_1",
      }),
    ).rejects.toThrow("R2 unavailable");

    expect(repository.transactions.get("txn_1")?.accountantStatus).not.toBe("exported");
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.outboxEvents).toHaveLength(0);
  });

  test("creates signed download links for stored packet exports", async () => {
    const repository = createReviewRepository("member");
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
      objectKey: "receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 12,
      title: "Receipt",
    });
    const storage = {
      async put() {},
    };
    const stored = await completeStoredAccountantPacketExport(repository, storage, {
      teamId: "team_1",
      actorId: "user_1",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      transactionIds: ["txn_1"],
      sourceOutboxEventId: "outbox_1",
      idempotencyKey: "accountant-packet:export:outbox_1",
      generatedAt: "2026-06-15T12:00:00.000Z",
    });
    const signer = {
      async createUploadUrl() {
        throw new Error("upload signing should not be used");
      },
      async createDownloadUrl(input: {
        objectKey: string;
        fileName: string;
        documentId: string;
        versionId: string;
      }) {
        return {
          url: `http://localhost:3000/documents/download/${input.documentId}/${input.versionId}/${input.objectKey}`,
          expiresAt: "2026-06-15T12:05:00.000Z",
        };
      },
    };

    const download = await createAccountantPacketDownload(
      repository,
      signer,
      { actor: testActor, requestId: "request_1", teamId: "team_1" },
      { teamId: "team_1", packetId: stored.packetId },
    );

    expect(download.downloadUrl).toContain(stored.objectKey);
    expect(download.downloadExpiresAt).toBe("2026-06-15T12:05:00.000Z");
    expect(download.packet).toMatchObject({
      packetId: stored.packetId,
      objectKey: stored.objectKey,
      fileName: stored.fileName,
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "accountant_packet.download_link_created",
      entityId: stored.packetId,
    });
  });

  test("lists stored packet export history for permitted actors", async () => {
    const repository = createReviewRepository("accountant");
    repository.accountantPacketExports.set("packet_old", {
      packetId: "packet_old",
      teamId: "team_1",
      actorId: "user_1",
      objectKey: "teams/team_1/accountant-packets/packet_old.zip",
      fileName: "old.zip",
      contentType: "application/zip",
      byteSize: 100,
      manifest: {
        packetId: "packet_old",
        teamId: "team_1",
        actorId: "user_1",
        generatedAt: "2026-05-15T12:00:00.000Z",
        filters: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-31T23:59:59.999Z",
          transactionIds: ["txn_1"],
        },
        settings: { formats: ["csv"], csvDelimiter: "," },
        transactionCount: 1,
        attachmentCount: 0,
        skippedAttachmentCount: 0,
        currencyTotals: { USD: { amountMinor: -1200, currency: "USD" } },
        files: [],
      },
      createdAt: "2026-05-15T12:00:00.000Z",
    });
    repository.accountantPacketExports.set("packet_new", {
      ...repository.accountantPacketExports.get("packet_old")!,
      packetId: "packet_new",
      objectKey: "teams/team_1/accountant-packets/packet_new.zip",
      fileName: "new.zip",
      createdAt: "2026-06-15T12:00:00.000Z",
    });

    const history = await listAccountantPacketExportHistory(
      repository,
      { actor: testActor, requestId: "request_1", teamId: "team_1" },
      { teamId: "team_1", limit: 1 },
    );

    expect(history.packets.map((packet) => packet.packetId)).toEqual(["packet_new"]);
  });
});
