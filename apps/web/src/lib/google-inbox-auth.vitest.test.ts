import { describe, expect, test } from "vitest";

import {
  gmailReadonlyScope,
  googleInboxAuthScopes,
  googleInboxCallbackUrl,
} from "./google-inbox-auth";

describe("Google Inbox auth helpers", () => {
  test("builds the Google login callback URL for Inbox auto-connect", () => {
    window.history.replaceState(null, "", "/login");
    const origin = window.location.origin;

    expect(googleInboxCallbackUrl()).toBe(`${origin}/inbox?connectGoogleLogin=1`);
    expect(googleInboxCallbackUrl("team_1")).toBe(
      `${origin}/inbox?teamId=team_1&connectGoogleLogin=1`,
    );
  });

  test("exposes the Gmail read-only scope used by Inbox status labels", () => {
    expect(gmailReadonlyScope).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  test("requests Gmail read-only access from web Google auth flows", () => {
    expect(googleInboxAuthScopes()).toEqual([gmailReadonlyScope]);
    expect(googleInboxAuthScopes()).not.toBe(googleInboxAuthScopes());
  });
});
