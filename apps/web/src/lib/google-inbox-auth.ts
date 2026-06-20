import { googleGmailReadonlyScope } from "@dawn/env/google-oauth";

export const gmailReadonlyScope = googleGmailReadonlyScope;

const googleInboxConnectIntentKey = "dawn:google-inbox-connect-intent";
const googleInboxConnectIntentTtlMs = 10 * 60 * 1000;

type GoogleInboxConnectIntent = {
  createdAt: number;
  teamId?: string;
};

export function googleInboxAuthScopes() {
  return [gmailReadonlyScope];
}

export function googleInboxCallbackUrl(teamId?: string) {
  const url = new URL("/inbox", window.location.origin);

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  url.searchParams.set("connectGoogleLogin", "1");
  return url.toString();
}

export function rememberGoogleInboxConnectIntent(teamId?: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const intent: GoogleInboxConnectIntent = {
    createdAt: Date.now(),
    ...(teamId ? { teamId } : {}),
  };

  window.localStorage.setItem(googleInboxConnectIntentKey, JSON.stringify(intent));
}

export function consumeGoogleInboxConnectIntent(teamId?: string) {
  const intent = peekGoogleInboxConnectIntent(teamId);

  if (intent) {
    clearGoogleInboxConnectIntent();
  }

  return Boolean(intent);
}

export function clearGoogleInboxConnectIntent() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(googleInboxConnectIntentKey);
}

function peekGoogleInboxConnectIntent(teamId?: string) {
  if (!canUseLocalStorage()) {
    return null;
  }

  const stored = window.localStorage.getItem(googleInboxConnectIntentKey);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<GoogleInboxConnectIntent>;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const isFresh = Date.now() - createdAt <= googleInboxConnectIntentTtlMs;
    const matchesTeam = !parsed.teamId || !teamId || parsed.teamId === teamId;

    if (!isFresh || !matchesTeam) {
      clearGoogleInboxConnectIntent();
      return null;
    }

    return parsed;
  } catch {
    clearGoogleInboxConnectIntent();
    return null;
  }
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}
