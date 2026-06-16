import { googleGmailReadonlyScope } from "@dawn/env/google-oauth";

export const gmailReadonlyScope = googleGmailReadonlyScope;

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
