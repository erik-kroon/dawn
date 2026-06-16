import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createFileDocumentObjectStorage,
  createMemoryDocumentObjectStorage,
} from "./document-storage";

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

  test("persists file-backed document bytes across storage instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "dawn-documents-"));

    try {
      const firstStorage = createFileDocumentObjectStorage(root);
      const secondStorage = createFileDocumentObjectStorage(root);
      const body = new TextEncoder().encode("persistent receipt").buffer;
      const objectKey = "teams/team_1/documents/doc_1/versions/ver_1/receipt.txt";

      await firstStorage.put({
        objectKey,
        body,
        contentType: "text/plain",
      });

      await expect(secondStorage.get(objectKey)).resolves.toMatchObject({
        contentType: "text/plain",
        byteSize: body.byteLength,
      });
      expect(new TextDecoder().decode((await secondStorage.get(objectKey))?.body)).toBe(
        "persistent receipt",
      );
      await expect(secondStorage.get("../escape.txt")).rejects.toThrow(
        "Document object key escapes local storage root",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
