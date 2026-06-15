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

  test("records storage failures without marking transactions exported", async () => {
    const jobRuns: unknown[] = [];
    const repository = Object.assign(createReviewRepository("member"), {
      async createJobRun(input: unknown) {
        jobRuns.push(input);

        return {
          id: "job_1",
          teamId: "team_1",
          outboxEventId: "outbox_1",
          jobType: "accountant_packet.export",
          queueName: "dawn-jobs",
          status: "failed",
          attempt: 1,
          idempotencyKey: "accountant-packet:export:outbox_1:failure",
          error: null,
          createdAt: "2026-06-15T12:00:00.000Z",
          updatedAt: "2026-06-15T12:00:00.000Z",
        };
      },
    });
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
        categoryId: "cat_1",
        reviewState: "reviewed",
        accountantStatus: "ready_to_export",
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
    const storage = {
      async put() {
        throw new Error("upload failed for owner@example.com using sk_live_12345678");
      },
      async get(objectKey: string) {
        if (objectKey !== "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf") {
          return null;
        }

        return {
          objectKey,
          body: new TextEncoder().encode("receipt from storage").buffer,
          contentType: "application/pdf",
          byteSize: 20,
          uploadedAt: "2026-06-15T12:00:00.000Z",
        };
      },
      async delete() {},
    };

    await expect(
      processAccountantPacketExportJob({
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
      }),
    ).rejects.toThrow("upload failed");

    expect(repository.transactions.get("txn_1")?.accountantStatus).toBe("ready_to_export");
    expect(repository.auditEvents).toMatchObject([
      {
        action: "accountant_packet.export_failed",
        entityId: "outbox_1",
        metadata: {
          error: "upload failed for [redacted-email] using [redacted-token]",
          transactionIds: ["txn_1"],
        },
      },
    ]);
    expect(repository.outboxEvents).toMatchObject([
      {
        type: "accountant_packet.export_failed",
        payload: {
          sourceOutboxEventId: "outbox_1",
          transactionIds: ["txn_1"],
          error: "upload failed for [redacted-email] using [redacted-token]",
        },
      },
    ]);
    expect(jobRuns).toEqual([
      expect.objectContaining({
        outboxEventId: "outbox_1",
        jobType: "accountant_packet.export",
        queueName: "dawn-jobs",
        status: "failed",
        idempotencyKey: "accountant-packet:export:outbox_1:failure",
        error: "upload failed for [redacted-email] using [redacted-token]",
      }),
    ]);
  });
});
