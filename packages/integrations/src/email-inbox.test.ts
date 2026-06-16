import { describe, expect, test } from "bun:test";

import {
  createEmailInboxTokenCodec,
  createGmailEmailInboxProvider,
  createMockEmailInboxProvider,
  EmailInboxProviderAuthError,
  emailInboxArtifactFileName,
  emailInboxEvidenceDeduplicationKey,
  InboxConnector,
} from "./index";

describe("email inbox connector", () => {
  test("creates encrypted connections and syncs attachment plus body evidence", async () => {
    const connector = new InboxConnector({
      provider: createMockEmailInboxProvider(),
      tokenCodec: createEmailInboxTokenCodec({
        secret: "test_secret_that_is_long_enough_for_aes",
        keyId: "test-email-token",
      }),
      now: () => new Date("2026-06-15T15:59:30.000Z"),
    });
    const authUrl = connector.createAuthUrl({
      redirectUrl: "http://localhost:3001/inbox",
      state: "state_1",
      loginHint: "owner@example.com",
    });
    const connected = await connector.exchangeCodeForConnection({
      code: "oauth_code_1",
      redirectUrl: "http://localhost:3001/inbox",
    });
    const synced = await connector.syncEvidence({
      teamId: "team_1",
      connection: connected.connection,
      token: connected.token,
    });

    expect(authUrl).toContain("state=state_1");
    expect(authUrl).toContain("login_hint=owner%40example.com");
    expect(connected.connection).toMatchObject({
      provider: "mock-email-inbox",
      providerConnectionId: "mock_email_account_1",
      accountEmail: "receipts@example.com",
      status: "connected",
    });
    expect(connected.token.encryptedToken).not.toContain("mock_refresh_oauth_code_1");
    expect(synced.refreshedToken?.encryptedToken).not.toBe(connected.token.encryptedToken);
    expect(synced.evidence.map((evidence) => evidence.artifact.kind)).toEqual([
      "attachment",
      "body",
    ]);
    expect(synced.evidence[0]).toMatchObject({
      providerMessageId: "mock_message_pdf_1",
      artifact: {
        kind: "attachment",
        fileName: "mock-receipt.pdf",
        contentType: "application/pdf",
      },
    });
    expect(synced.evidence[1]).toMatchObject({
      providerMessageId: "mock_message_body_1",
      artifact: {
        kind: "body",
        contentType: "text/plain",
      },
    });
    expect(emailInboxArtifactFileName(synced.evidence[1]!)).toBe(
      "coffee-shop-receipt-mock_message_body_1.txt",
    );
    expect(new Set(synced.evidence.map(emailInboxEvidenceDeduplicationKey)).size).toBe(2);
  });

  test("redacts raw Gmail token exchange failure responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "bad secret GOCSPX-do-not-surface-this-value",
          }),
          { status: 400 },
        ),
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    try {
      const provider = createGmailEmailInboxProvider({
        clientId: "1234567890-test.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
      });
      let capturedError: unknown;

      try {
        await provider.exchangeCodeForTokens({
          code: "oauth_code_1",
          redirectUrl: "http://localhost:3001/inbox",
        });
      } catch (error) {
        capturedError = error;
      }

      expect(capturedError).toBeInstanceOf(EmailInboxProviderAuthError);
      expect((capturedError as Error).message).toBe(
        "Gmail token exchange failed with 400 (invalid_grant)",
      );
      expect((capturedError as Error).message).not.toContain("GOCSPX");
      expect((capturedError as Error).message).not.toContain("bad secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
