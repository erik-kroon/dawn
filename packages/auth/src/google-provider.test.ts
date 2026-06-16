import { describe, expect, test } from "bun:test";

import { googleEmailInboxScopes, googleGmailReadonlyScope } from "@dawn/env/google-oauth";
import { google } from "better-auth/social-providers";

describe("Better Auth Google provider", () => {
  test("builds the first-login URL with identity, Gmail readonly, and offline consent scopes", async () => {
    const provider = google({
      clientId: "test.apps.googleusercontent.com",
      clientSecret: "GOCSPX-test_secret_value_for_local_smoke",
      scope: googleEmailInboxScopes,
      accessType: "offline",
      prompt: "select_account consent",
    });

    const authorizationUrl = await provider.createAuthorizationURL({
      state: "state_1",
      codeVerifier: "code_verifier_1",
      redirectURI: "http://localhost:3000/api/auth/callback/google",
    });
    const scopes = authorizationUrl.searchParams.get("scope")?.split(" ") ?? [];

    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
    expect(scopes).toContain("profile");
    expect(scopes).toContain(googleGmailReadonlyScope);
    expect(scopes).toHaveLength(new Set(scopes).size);
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("prompt")).toBe("select_account consent");
    expect(authorizationUrl.searchParams.get("include_granted_scopes")).toBe("true");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
  });
});
