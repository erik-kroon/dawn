import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  capturePayloadFromFile,
  dashboardUrlForContext,
  notificationForContext,
  parseDesktopUrl,
  supportedCaptureContentType,
} from "./shell";

const tempFiles: string[] = [];

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((path) => Bun.file(path).delete()));
});

describe("desktop shell helpers", () => {
  test("parses product record deep links into dashboard context", () => {
    expect(parseDesktopUrl("dawn://open/document/doc_1?teamId=team_1")).toEqual({
      kind: "record",
      recordType: "document",
      recordId: "doc_1",
      teamId: "team_1",
    });
    expect(
      dashboardUrlForContext("http://localhost:3001", {
        kind: "record",
        recordType: "document",
        recordId: "doc_1",
        teamId: "team_1",
      }),
    ).toBe(
      "http://localhost:3001/dashboard?teamId=team_1&desktopFocusType=document&desktopFocusId=doc_1#documents",
    );
  });

  test("parses capture URLs and prepares supported files for web upload", async () => {
    const path = join(import.meta.dir, `sample-${crypto.randomUUID()}.txt`);
    await Bun.write(path, "receipt text");
    tempFiles.push(path);

    expect(parseDesktopUrl(`file://${path}`)).toEqual({
      kind: "capture",
      filePath: path,
      teamId: null,
    });
    expect(supportedCaptureContentType(path)).toBe("text/plain");
    await expect(capturePayloadFromFile(path, "team_1")).resolves.toMatchObject({
      fileName: path.split("/").at(-1),
      contentType: "text/plain",
      bodyBase64: "cmVjZWlwdCB0ZXh0",
      byteSize: 12,
      teamId: "team_1",
    });
  });

  test("rejects unsupported file capture types", async () => {
    const path = join(import.meta.dir, `sample-${crypto.randomUUID()}.exe`);
    await Bun.write(path, "nope");
    tempFiles.push(path);

    expect(supportedCaptureContentType(path)).toBeNull();
    await expect(capturePayloadFromFile(path)).rejects.toThrow("Unsupported capture file type");
  });

  test("builds notification copy for capture and record contexts", () => {
    expect(notificationForContext({ kind: "capture", filePath: "/tmp/receipt.pdf" })).toEqual({
      title: "Dawn capture ready",
      body: "receipt.pdf is ready to upload into the inbox.",
    });
    expect(
      notificationForContext({ kind: "record", recordType: "inbox_item", recordId: "inbox_1" }),
    ).toEqual({
      title: "Dawn opened",
      body: "Opened inbox item inbox_1.",
    });
  });
});
