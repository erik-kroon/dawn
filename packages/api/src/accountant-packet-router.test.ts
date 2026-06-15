import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import {
  createDeterministicInvoicePdfRenderer,
  type DawnRepository,
  type DocumentUrlSigner,
} from "@dawn/app";
import { createReviewRepository, createTestTransaction } from "@dawn/app/testkit/fixtures";
import { createMockInvoiceEmailDeliveryProvider } from "@dawn/integrations";

import { createApiTestContext } from "./testkit/context";

const documentUrlSigner: DocumentUrlSigner = {
  async createUploadUrl(input) {
    return {
      url: `http://localhost:3000/documents/upload/${input.versionId}`,
      expiresAt: "2026-06-15T10:15:00.000Z",
    };
  },
  async createDownloadUrl(input) {
    return {
      url: `http://localhost:3000/documents/download/${input.versionId}`,
      expiresAt: "2026-06-15T10:05:00.000Z",
    };
  },
};

describe("transactionReview.exportPacket router", () => {
  test("returns a downloadable accountant packet", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const repository = createReviewRepository("member");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
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
    const { createAppRouter } = await import("./routers/index");
    const router = createAppRouter({
      dawnRepository: repository as unknown as DawnRepository,
      bankingProviders: [],
      integrationProviders: [],
      emailInboxConnectors: [],
      documentUrlSigner,
      invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
      invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
    });

    const result = await call(
      router.transactionReview.exportPacket,
      {
        teamId: "team_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        formats: ["csv", "xlsx"],
        csvDelimiter: ";",
        idempotencyKey: "packet_1",
      },
      {
        context: createApiTestContext({ id: "user_1", email: "member@example.com" }),
      },
    );
    const zipText = Buffer.from(result.bodyBase64, "base64").toString("utf8");

    expect(result.contentType).toBe("application/zip");
    expect(result.fileName).toMatch(/^accountant-packet-team_1-/);
    expect(result.manifest.transactionCount).toBe(1);
    expect(result.manifest.settings).toEqual({ formats: ["csv", "xlsx"], csvDelimiter: ";" });
    expect(zipText).toContain("transactions.csv");
    expect(zipText).toContain("transactions.xlsx");
    expect(zipText).toContain("manifest.json");
  });

  test("queues stored accountant packet exports through the router", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const repository = createReviewRepository("member");
    repository.transactions.set(
      "txn_1",
      createTestTransaction({
        id: "txn_1",
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
    const { createAppRouter } = await import("./routers/index");
    const router = createAppRouter({
      dawnRepository: repository as unknown as DawnRepository,
      bankingProviders: [],
      integrationProviders: [],
      emailInboxConnectors: [],
      documentUrlSigner,
      invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
      invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
    });

    const result = await call(
      router.transactionReview.requestPacketExport,
      {
        teamId: "team_1",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.999Z",
        transactionIds: ["txn_1"],
        formats: ["csv"],
        idempotencyKey: "packet_request_1",
      },
      {
        context: createApiTestContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(result.workflow).toMatchObject({
      type: "accountant_packet_export",
      status: "queued",
    });
    expect(repository.outboxEvents).toMatchObject([{ type: "accountant_packet.export_requested" }]);
  });

  test("creates signed stored packet downloads through the router", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const repository = createReviewRepository("member");
    repository.accountantPacketExports.set("packet_1", {
      packetId: "packet_1",
      teamId: "team_1",
      actorId: "user_1",
      objectKey: "teams/team_1/accountant-packets/packet_1.zip",
      fileName: "accountant-packet-team_1-2026-06-01-2026-06-30.zip",
      contentType: "application/zip",
      byteSize: 128,
      manifest: {
        packetId: "packet_1",
        teamId: "team_1",
        actorId: "user_1",
        generatedAt: "2026-06-15T12:00:00.000Z",
        filters: {
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          transactionIds: ["txn_1"],
        },
        settings: { formats: ["csv"], csvDelimiter: "," },
        transactionCount: 1,
        attachmentCount: 0,
        skippedAttachmentCount: 0,
        currencyTotals: { USD: { amountMinor: -1200, currency: "USD" } },
        files: [],
      },
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    const { createAppRouter } = await import("./routers/index");
    const router = createAppRouter({
      dawnRepository: repository as unknown as DawnRepository,
      bankingProviders: [],
      integrationProviders: [],
      emailInboxConnectors: [],
      documentUrlSigner,
      invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
      invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
    });

    const result = await call(
      router.transactionReview.createPacketDownload,
      {
        teamId: "team_1",
        packetId: "packet_1",
      },
      {
        context: createApiTestContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(result.downloadUrl).toBe("http://localhost:3000/documents/download/packet_1");
    expect(result.packet.objectKey).toBe("teams/team_1/accountant-packets/packet_1.zip");
  });

  test("lists stored packet export history through the router", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const repository = createReviewRepository("accountant");
    repository.accountantPacketExports.set("packet_1", {
      packetId: "packet_1",
      teamId: "team_1",
      actorId: "user_1",
      objectKey: "teams/team_1/accountant-packets/packet_1.zip",
      fileName: "accountant-packet.zip",
      contentType: "application/zip",
      byteSize: 128,
      manifest: {
        packetId: "packet_1",
        teamId: "team_1",
        actorId: "user_1",
        generatedAt: "2026-06-15T12:00:00.000Z",
        filters: {
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-30T23:59:59.999Z",
          transactionIds: ["txn_1"],
        },
        settings: { formats: ["csv"], csvDelimiter: "," },
        transactionCount: 1,
        attachmentCount: 0,
        skippedAttachmentCount: 0,
        currencyTotals: { USD: { amountMinor: -1200, currency: "USD" } },
        files: [],
      },
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    const { createAppRouter } = await import("./routers/index");
    const router = createAppRouter({
      dawnRepository: repository as unknown as DawnRepository,
      bankingProviders: [],
      integrationProviders: [],
      emailInboxConnectors: [],
      documentUrlSigner,
      invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
      invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
    });

    const result = await call(
      router.transactionReview.listPacketExports,
      {
        teamId: "team_1",
        limit: 10,
      },
      {
        context: createApiTestContext({ id: "user_1", email: "accountant@example.com" }),
      },
    );

    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]?.packetId).toBe("packet_1");
  });

  test("updates accountant lifecycle status through the router", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const repository = createReviewRepository("member");
    const { createAppRouter } = await import("./routers/index");
    const router = createAppRouter({
      dawnRepository: repository as unknown as DawnRepository,
      bankingProviders: [],
      integrationProviders: [],
      emailInboxConnectors: [],
      documentUrlSigner,
      invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
      invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
    });

    const result = await call(
      router.transactionReview.updateAccountantStatus,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        action: "archive",
        idempotencyKey: "status_1",
      },
      {
        context: createApiTestContext({ id: "user_1", email: "member@example.com" }),
      },
    );

    expect(result.transaction.accountantStatus).toBe("archived");
    expect(result.nextStatus).toBe("archived");
  });
});
