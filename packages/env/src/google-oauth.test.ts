import { describe, expect, test } from "bun:test";

import {
  assertGoogleOAuthCredentialConfig,
  googleOAuthCredentialStatus,
  resolveGoogleOAuthCredentials,
} from "./google-oauth";

const validCredentials = {
  GMAIL_CLIENT_ID: "dawn-test.apps.googleusercontent.com",
  GMAIL_CLIENT_SECRET: "GOCSPX-abcdefghijklmnopqrstuvwxyz",
};

describe("Google OAuth credential config", () => {
  test("treats absent Gmail credentials as missing", () => {
    expect(googleOAuthCredentialStatus({})).toBe("missing");
    expect(resolveGoogleOAuthCredentials({})).toBeNull();
  });

  test("resolves configured real-looking Gmail credentials", () => {
    expect(googleOAuthCredentialStatus(validCredentials)).toBe("configured");
    expect(resolveGoogleOAuthCredentials(validCredentials)).toEqual({
      clientId: validCredentials.GMAIL_CLIENT_ID,
      clientSecret: validCredentials.GMAIL_CLIENT_SECRET,
    });
  });

  test("rejects half-configured Gmail credentials", () => {
    expect(
      googleOAuthCredentialStatus({
        GMAIL_CLIENT_ID: validCredentials.GMAIL_CLIENT_ID,
      }),
    ).toBe("partial");
    expect(() =>
      assertGoogleOAuthCredentialConfig({
        GMAIL_CLIENT_ID: validCredentials.GMAIL_CLIENT_ID,
      }),
    ).toThrow("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set together");
  });

  test("rejects placeholder-like Gmail credentials", () => {
    expect(
      googleOAuthCredentialStatus({
        GMAIL_CLIENT_ID: "your-client.apps.googleusercontent.com",
        GMAIL_CLIENT_SECRET: "GOCSPX-replace-with-real-secret",
      }),
    ).toBe("invalid");
    expect(() =>
      assertGoogleOAuthCredentialConfig({
        GMAIL_CLIENT_ID: "your-client.apps.googleusercontent.com",
        GMAIL_CLIENT_SECRET: "GOCSPX-replace-with-real-secret",
      }),
    ).toThrow("Gmail OAuth credentials are invalid");
  });
});
