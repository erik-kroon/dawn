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

  test("uses sync range dates for first Gmail evidence queries", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        urls.push(input.toString());
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    try {
      const provider = createGmailEmailInboxProvider({
        clientId: "1234567890-test.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
      });
      const synced = await provider.syncEvidence({
        teamId: "team_1",
        connection: gmailConnection(),
        tokens: gmailTokens(),
        syncRange: {
          receivedFrom: "2025-01-01T00:00:00.000Z",
          receivedTo: "2026-06-16T12:00:00.000Z",
          source: "accountant_backfill",
        },
      });
      const query = new URL(urls[0]!).searchParams.get("q") ?? "";

      expect(query).toContain("has:attachment");
      expect(query).toContain("filename:pdf");
      expect(query).toContain("after:2025/01/01");
      expect(query).toContain("before:2026/06/17");
      expect(query).not.toContain(" OR ");
      expect(query).not.toContain("receipt");
      expect(query).not.toContain("order");
      expect(query).not.toContain("payment");
      expect(query).not.toContain("newer_than:30d");
      expect(synced.nextCursor?.receivedAfter).toBe("2026-06-16T12:00:00.000Z");
      expect(synced.rawPayload).toMatchObject({
        query,
        syncRange: {
          source: "accountant_backfill",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses Gmail cursor dates instead of range dates for incremental queries", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        urls.push(input.toString());
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    try {
      const provider = createGmailEmailInboxProvider({
        clientId: "1234567890-test.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
      });
      await provider.syncEvidence({
        teamId: "team_1",
        connection: gmailConnection(),
        tokens: gmailTokens(),
        cursor: { receivedAfter: "2026-06-15T08:30:00.000Z" },
        syncRange: {
          receivedFrom: "2025-01-01T00:00:00.000Z",
          receivedTo: "2026-06-16T12:00:00.000Z",
          source: "accountant_backfill",
        },
      });
      const query = new URL(urls[0]!).searchParams.get("q") ?? "";

      expect(query).toContain("after:2026/06/15");
      expect(query).toContain("has:attachment");
      expect(query).toContain("filename:pdf");
      expect(query).not.toContain("after:2025/01/01");
      expect(query).not.toContain("before:2026/06/17");
      expect(query).not.toContain("receipt");
      expect(query).not.toContain("order");
      expect(query).not.toContain("payment");
      expect(query).not.toContain("newer_than:30d");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not import Gmail body-only receipt-like messages", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = new URL(input.toString());
        urls.push(url.toString());

        if (url.pathname.endsWith("/gmail/v1/users/me/messages")) {
          return new Response(JSON.stringify({ messages: [{ id: "gmail_body_only_1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (url.pathname.endsWith("/gmail/v1/users/me/messages/gmail_body_only_1")) {
          return new Response(
            JSON.stringify({
              id: "gmail_body_only_1",
              threadId: "thread_body_only_1",
              internalDate: String(Date.parse("2026-06-15T12:00:00.000Z")),
              snippet: "Invoice total paid",
              payload: {
                headers: [
                  { name: "Subject", value: "Your receipt from Marketing Store" },
                  { name: "From", value: "Deals <info@dpj.se>" },
                  { name: "To", value: "owner@example.com" },
                ],
                parts: [
                  {
                    partId: "body_text",
                    mimeType: "text/plain",
                    body: {
                      data: Buffer.from("Receipt total amount paid").toString("base64url"),
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ error: "unexpected url" }), { status: 404 });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    try {
      const provider = createGmailEmailInboxProvider({
        clientId: "1234567890-test.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
      });
      const synced = await provider.syncEvidence({
        teamId: "team_1",
        connection: gmailConnection(),
        tokens: gmailTokens(),
        syncRange: {
          receivedFrom: "2025-01-01T00:00:00.000Z",
          receivedTo: "2026-06-16T12:00:00.000Z",
          source: "accountant_backfill",
        },
      });
      const query = new URL(urls[0]!).searchParams.get("q") ?? "";

      expect(query).toContain("has:attachment");
      expect(query).toContain("filename:pdf");
      expect(synced.evidence).toEqual([]);
      expect(synced.rawPayload).toMatchObject({
        messagesScanned: 1,
        evidenceFound: 0,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("imports Gmail PDF attachments for downstream classification", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = new URL(input.toString());

        if (url.pathname.endsWith("/gmail/v1/users/me/messages")) {
          return new Response(JSON.stringify({ messages: [{ id: "gmail_job_pdf_1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (url.pathname.endsWith("/gmail/v1/users/me/messages/gmail_job_pdf_1")) {
          return new Response(
            JSON.stringify({
              id: "gmail_job_pdf_1",
              threadId: "thread_job_pdf_1",
              internalDate: String(Date.parse("2026-06-15T12:00:00.000Z")),
              snippet: "Document attached",
              payload: {
                headers: [
                  { name: "Subject", value: "Attached document" },
                  { name: "From", value: "Sender <no-reply@example.com>" },
                  { name: "To", value: "owner@example.com" },
                ],
                parts: [
                  {
                    partId: "poster_pdf",
                    mimeType: "application/pdf",
                    filename: "attached-document.pdf",
                    body: {
                      size: 128,
                      data: Buffer.from("%PDF-1.4 generic document").toString("base64url"),
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ error: "unexpected url" }), { status: 404 });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    try {
      const provider = createGmailEmailInboxProvider({
        clientId: "1234567890-test.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
      });
      const synced = await provider.syncEvidence({
        teamId: "team_1",
        connection: gmailConnection(),
        tokens: gmailTokens(),
        syncRange: {
          receivedFrom: "2025-01-01T00:00:00.000Z",
          receivedTo: "2026-06-16T12:00:00.000Z",
          source: "accountant_backfill",
        },
      });

      expect(synced.evidence).toHaveLength(1);
      expect(synced.evidence[0]).toMatchObject({
        providerMessageId: "gmail_job_pdf_1",
        from: { email: "no-reply@example.com" },
        artifact: {
          kind: "attachment",
          fileName: "attached-document.pdf",
          contentType: "application/pdf",
        },
      });
      expect(synced.rawPayload).toMatchObject({
        messagesScanned: 1,
        evidenceFound: 1,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function gmailConnection() {
  return {
    provider: "gmail" as const,
    providerConnectionId: "gmail_user_1",
    accountEmail: "owner@example.com",
    status: "connected" as const,
    grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    expiresAt: "2026-06-16T16:00:00.000Z",
    rawPayload: {},
  };
}

function gmailTokens() {
  return {
    accessToken: "gmail_access_token",
    refreshToken: "gmail_refresh_token",
    expiresAt: "2026-06-16T16:00:00.000Z",
    tokenType: "Bearer",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    rawPayload: {},
  };
}
