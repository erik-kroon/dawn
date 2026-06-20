import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clearGoogleInboxConnectIntent,
  consumeGoogleInboxConnectIntent,
  gmailReadonlyScope,
  googleInboxAuthScopes,
  googleInboxCallbackUrl,
  rememberGoogleInboxConnectIntent,
} from "./google-inbox-auth";

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

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

  test("persists and consumes a Google login intent when callback search is stripped", () => {
    rememberGoogleInboxConnectIntent();

    expect(consumeGoogleInboxConnectIntent("team_1")).toBe(true);
    expect(consumeGoogleInboxConnectIntent("team_1")).toBe(false);
  });

  test("keeps team-scoped Google login intents scoped and temporary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T09:00:00.000Z"));
    rememberGoogleInboxConnectIntent("team_1");

    expect(consumeGoogleInboxConnectIntent("team_2")).toBe(false);

    rememberGoogleInboxConnectIntent("team_1");
    vi.setSystemTime(new Date("2026-06-16T09:11:00.000Z"));

    expect(consumeGoogleInboxConnectIntent("team_1")).toBe(false);
  });

  test("clears Google login intents explicitly", () => {
    rememberGoogleInboxConnectIntent();
    clearGoogleInboxConnectIntent();

    expect(consumeGoogleInboxConnectIntent()).toBe(false);
  });
});
