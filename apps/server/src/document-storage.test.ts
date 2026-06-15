import { describe, expect, test } from "bun:test";

import { createMemoryDocumentObjectStorage } from "./document-storage";

describe("document object storage", () => {
  test("stores and retrieves document bytes with content metadata", async () => {
    const storage = createMemoryDocumentObjectStorage();
    const body = new TextEncoder().encode("receipt").buffer;

    await storage.put({
      objectKey: "teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf",
      body,
      contentType: "application/pdf",
    });

    await expect(
      storage.get("teams/team_1/documents/doc_1/versions/ver_1/receipt.pdf"),
    ).resolves.toMatchObject({
      contentType: "application/pdf",
      byteSize: body.byteLength,
    });
  });
});
