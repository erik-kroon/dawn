import { describe, expect, test } from "bun:test";

import {
  googleAuthTokensFromAccessTokenResult,
  googleAuthTokensFromRefreshResult,
} from "./google-tokens";
import { googleGmailReadonlyScope } from "@dawn/env/google-oauth";

describe("Google auth account token mapping", () => {
  test("maps refresh-backed Better Auth Google tokens into Dawn Gmail bridge tokens", () => {
    const tokens = googleAuthTokensFromRefreshResult({
      providerId: "google",
      accountId: "google_account_1",
      accessToken: "access_token_1",
      refreshToken: "refresh_token_1",
      accessTokenExpiresAt: new Date("2026-06-16T10:00:00.000Z"),
      refreshTokenExpiresAt: "2026-07-16T10:00:00.000Z",
      idToken: "id_token_1",
      scope: `openid,email profile ${googleGmailReadonlyScope}`,
    });

    expect(tokens).toMatchObject({
      provider: "google",
      providerAccountId: "google_account_1",
      accessToken: "access_token_1",
      refreshToken: "refresh_token_1",
      expiresAt: "2026-06-16T10:00:00.000Z",
      idToken: "id_token_1",
      scopes: ["openid", "email", "profile", googleGmailReadonlyScope],
      rawPayload: {
        providerId: "google",
        providerAccountId: "google_account_1",
        accessTokenExpiresAt: "2026-06-16T10:00:00.000Z",
        refreshTokenExpiresAt: "2026-07-16T10:00:00.000Z",
        hasRefreshToken: true,
      },
    });
  });

  test("maps access-token-only Better Auth Google tokens for immediate Gmail sync", () => {
    const tokens = googleAuthTokensFromAccessTokenResult({
      accessToken: "access_token_1",
      accessTokenExpiresAt: "2026-06-16T10:00:00.000Z",
      idToken: "id_token_1",
      scopes: ["openid", "email", "profile", googleGmailReadonlyScope],
    });

    expect(tokens).toMatchObject({
      provider: "google",
      providerAccountId: "google",
      accessToken: "access_token_1",
      refreshToken: null,
      expiresAt: "2026-06-16T10:00:00.000Z",
      idToken: "id_token_1",
      scopes: ["openid", "email", "profile", googleGmailReadonlyScope],
      rawPayload: {
        providerId: "google",
        providerAccountId: "google",
        hasRefreshToken: false,
        refreshTokenExpiresAt: null,
      },
    });
  });

  test("rejects unusable Better Auth token results", () => {
    expect(googleAuthTokensFromRefreshResult({ accountId: "google_account_1" })).toBeNull();
    expect(googleAuthTokensFromRefreshResult({ accessToken: "access_token_1" })).toBeNull();
    expect(
      googleAuthTokensFromAccessTokenResult({ scopes: [googleGmailReadonlyScope] }),
    ).toBeNull();
  });
});
