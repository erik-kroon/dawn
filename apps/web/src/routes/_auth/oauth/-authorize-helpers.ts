import type { PublicApiScope } from "@dawn/domain";

export type OAuthAuthorizeSearch = {
  teamId?: string;
  appId?: string;
  redirectUri?: string;
  scope?: string;
  scopes?: string;
  state?: string;
};

const publicApiScopes = new Set<PublicApiScope>([
  "transactions.read",
  "transactions.write",
  "invoices.read",
  "invoices.write",
  "webhooks.manage",
]);

export function searchParam(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function oauthConsentInputFromSearch(search: OAuthAuthorizeSearch) {
  const scopes = oauthScopesFromSearch(search);

  if (!search.teamId || !search.appId || !search.redirectUri || scopes.length === 0) {
    return null;
  }

  return {
    teamId: search.teamId,
    appId: search.appId,
    redirectUri: search.redirectUri,
    scopes,
  };
}

function oauthScopesFromSearch(search: OAuthAuthorizeSearch): PublicApiScope[] {
  const raw = search.scope ?? search.scopes;

  if (!raw) {
    return [];
  }

  return [...new Set(raw.split(/[\s,]+/).filter(Boolean))].filter(
    (scope): scope is PublicApiScope => publicApiScopes.has(scope as PublicApiScope),
  );
}

export function oauthConsentIdempotencyKey(
  input: NonNullable<ReturnType<typeof oauthConsentInputFromSearch>>,
  state?: string,
) {
  return [
    "oauth-consent",
    input.teamId,
    input.appId,
    input.redirectUri,
    input.scopes.join(","),
    state ?? "",
  ].join(":");
}

export function oauthGrantRedirectUrl(input: {
  redirectUri: string;
  grantId: string;
  teamId: string;
  appId: string;
  state?: string;
}) {
  const url = new URL(input.redirectUri);
  url.searchParams.set("grant_id", input.grantId);
  url.searchParams.set("team_id", input.teamId);
  url.searchParams.set("app_id", input.appId);

  if (input.state) {
    url.searchParams.set("state", input.state);
  }

  return url.toString();
}

export function oauthDeniedRedirectUrl(input: { redirectUri: string; state?: string }) {
  const url = new URL(input.redirectUri);
  url.searchParams.set("error", "access_denied");

  if (input.state) {
    url.searchParams.set("state", input.state);
  }

  return url.toString();
}
