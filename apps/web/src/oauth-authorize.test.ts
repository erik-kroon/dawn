import { describe, expect, test } from "bun:test";

import {
  oauthConsentIdempotencyKey,
  oauthConsentInputFromSearch,
  oauthDeniedRedirectUrl,
  oauthGrantRedirectUrl,
} from "./routes/_auth/oauth/-authorize-helpers";

describe("OAuth authorization route helpers", () => {
  test("parses supported scopes from authorization search params", () => {
    expect(
      oauthConsentInputFromSearch({
        teamId: "team_1",
        appId: "app_1",
        redirectUri: "https://partner.example.com/callback",
        scope:
          "transactions.read bank_accounts.read inbox.write customers.read products.write reports.read time_entries.write unknown.scope",
      }),
    ).toEqual({
      teamId: "team_1",
      appId: "app_1",
      redirectUri: "https://partner.example.com/callback",
      scopes: [
        "transactions.read",
        "bank_accounts.read",
        "inbox.write",
        "customers.read",
        "products.write",
        "reports.read",
        "time_entries.write",
      ],
    });
  });

  test("returns null when required authorization params are missing", () => {
    expect(
      oauthConsentInputFromSearch({
        teamId: "team_1",
        appId: "app_1",
        redirectUri: "https://partner.example.com/callback",
      }),
    ).toBeNull();
  });

  test("builds grant and denied redirect URLs with state passthrough", () => {
    expect(
      oauthGrantRedirectUrl({
        redirectUri: "https://partner.example.com/callback?existing=1",
        grantId: "grant_1",
        teamId: "team_1",
        appId: "app_1",
        state: "state_1",
      }),
    ).toBe(
      "https://partner.example.com/callback?existing=1&grant_id=grant_1&team_id=team_1&app_id=app_1&state=state_1",
    );
    expect(
      oauthDeniedRedirectUrl({
        redirectUri: "https://partner.example.com/callback",
        state: "state_1",
      }),
    ).toBe("https://partner.example.com/callback?error=access_denied&state=state_1");
  });

  test("uses stable idempotency keys for identical consent requests", () => {
    const input = oauthConsentInputFromSearch({
      teamId: "team_1",
      appId: "app_1",
      redirectUri: "https://partner.example.com/callback",
      scopes: "transactions.read,invoices.read",
    });

    expect(input).not.toBeNull();
    expect(oauthConsentIdempotencyKey(input!, "state_1")).toBe(
      "oauth-consent:team_1:app_1:https://partner.example.com/callback:transactions.read,invoices.read:state_1",
    );
  });
});
