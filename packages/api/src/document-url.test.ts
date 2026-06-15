import { describe, expect, test } from "bun:test";

import { createDocumentUrlSigner, verifyDocumentUrlToken } from "./document-url";

describe("document URL signer", () => {
  test("creates and verifies signed upload tokens", async () => {
    const signer = createDocumentUrlSigner({
      baseUrl: "https://files.example.com",
      secret: "test_secret",
      uploadTtlSeconds: 60,
    });
    const signed = await signer.createUploadUrl({
      teamId: "team_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 7,
      actorId: "user_1",
      requestId: "request_1",
    });
    const token = new URL(signed.url).pathname.split("/").pop();

    expect(token).toBeTruthy();
    await expect(
      verifyDocumentUrlToken({
        secret: "test_secret",
        token: token ?? "",
        kind: "upload",
      }),
    ).resolves.toMatchObject({
      kind: "upload",
      teamId: "team_1",
      documentId: "doc_1",
      versionId: "ver_1",
      byteSize: 7,
      actorId: "user_1",
    });
  });

  test("rejects wrong kind and tampered tokens", async () => {
    const signer = createDocumentUrlSigner({
      baseUrl: "https://files.example.com",
      secret: "test_secret",
    });
    const signed = await signer.createDownloadUrl({
      teamId: "team_1",
      documentId: "doc_1",
      versionId: "ver_1",
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
    });
    const token = new URL(signed.url).pathname.split("/").pop() ?? "";

    await expect(
      verifyDocumentUrlToken({ secret: "test_secret", token, kind: "upload" }),
    ).rejects.toThrow("Invalid document URL token");
    await expect(
      verifyDocumentUrlToken({
        secret: "test_secret",
        token: `${token.slice(0, -2)}xx`,
        kind: "download",
      }),
    ).rejects.toThrow("Invalid document URL token");
  });
});
