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
    expect(zipText).toContain("transactions.csv");
    expect(zipText).toContain("manifest.json");
  });
});
