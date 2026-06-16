import { googleGmailReadonlyScope } from "@dawn/env/google-oauth";
import { describe, expect, test } from "bun:test";

import { createDefaultEmailInboxConnectors } from "./email-inbox-connectors";

const betterAuthSecret = "abcdefghijklmnopqrstuvwxyz123456";

describe("default email inbox connectors", () => {
  test("keeps Gmail out of the provider catalog until credentials are configured", () => {
    const connectors = createDefaultEmailInboxConnectors({
      BETTER_AUTH_SECRET: betterAuthSecret,
    });

    expect(connectors.map((connector) => connector.provider)).toEqual(["mock-email-inbox"]);
  });

  test("adds Gmail with read-only scope when Google OAuth credentials are configured", () => {
    const connectors = createDefaultEmailInboxConnectors({
      BETTER_AUTH_SECRET: betterAuthSecret,
      GMAIL_CLIENT_ID: "1234567890-test.apps.googleusercontent.com",
      GMAIL_CLIENT_SECRET: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
    });
    const gmail = connectors.find((connector) => connector.provider === "gmail");

    expect(connectors.map((connector) => connector.provider)).toEqual([
      "mock-email-inbox",
      "gmail",
    ]);
    expect(gmail).toBeDefined();
    expect(gmail?.displayName).toBe("Gmail");
    expect(gmail?.defaultScopes).toContain(googleGmailReadonlyScope);
    expect(gmail?.capabilities).toEqual([
      "oauth",
      "refreshToken",
      "syncEvidence",
      "attachmentEvidence",
      "bodyEvidence",
    ]);
  });
});
