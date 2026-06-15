import { describe, expect, test } from "bun:test";

import {
  assertDocumentUrlPayloadPolicy,
  createDocumentUrlSigner,
  verifyDocumentUrlToken,
} from "./document-url";

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

  test("creates and verifies signed accountant packet download tokens", async () => {
    const signer = createDocumentUrlSigner({
      baseUrl: "https://files.example.com",
      secret: "test_secret",
    });
    const signed = await signer.createDownloadUrl({
      teamId: "team_1",
      documentId: "packet_1",
      versionId: "packet_1",
      objectKey: "teams/team_1/accountant-packets/packet_1.zip",
      fileName: "accountant-packet.zip",
      contentType: "application/zip",
    });
    const token = new URL(signed.url).pathname.split("/").pop() ?? "";

    await expect(
      verifyDocumentUrlToken({ secret: "test_secret", token, kind: "download" }),
    ).resolves.toMatchObject({
      kind: "download",
      teamId: "team_1",
      documentId: "packet_1",
      versionId: "packet_1",
      objectKey: "teams/team_1/accountant-packets/packet_1.zip",
    });
  });

  test("enforces scoped object keys and upload actor metadata", () => {
    expect(() =>
      assertDocumentUrlPayloadPolicy({
        kind: "download",
        teamId: "team_1",
        documentId: "doc_1",
        versionId: "ver_1",
        objectKey: "teams/team_2/documents/doc_1/versions/ver_1/receipt.pdf",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toThrow("Document URL object key is out of scope");
    expect(() =>
      assertDocumentUrlPayloadPolicy({
        kind: "download",
        teamId: "team_1",
        documentId: "doc_1",
        versionId: "ver_1",
        objectKey: "teams/team_1/documents/doc_1/versions/ver_1/../secret.pdf",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toThrow("Document URL object key is out of scope");
    expect(() =>
      assertDocumentUrlPayloadPolicy({
        kind: "upload",
        teamId: "team_1",
        documentId: "doc_1",
        versionId: "ver_1",
        objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toThrow("Upload URL is missing required actor metadata");
  });

  test("caps signed URL TTLs", async () => {
    const signer = createDocumentUrlSigner({
      baseUrl: "https://files.example.com",
      secret: "test_secret",
      downloadTtlSeconds: 60 * 60,
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
    const payload = await verifyDocumentUrlToken({
      secret: "test_secret",
      token,
      kind: "download",
    });

    expect(new Date(payload.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1_000);
  });
});
