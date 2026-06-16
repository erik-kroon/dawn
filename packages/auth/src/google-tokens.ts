export type GoogleAuthAccountTokens = {
  provider: "google";
  providerAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  idToken?: string | null;
  scopes: string[];
  rawPayload: Record<string, unknown>;
};

export type BetterAuthGoogleRefreshTokenResult = {
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  refreshTokenExpiresAt?: Date | string | null;
  idToken?: string | null;
  scope?: string | null;
  providerId?: string | null;
  accountId?: string | null;
};

export type BetterAuthGoogleAccessTokenResult = {
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  idToken?: string | null;
  scopes?: readonly string[] | null;
};

export function googleAuthTokensFromRefreshResult(
  tokens: BetterAuthGoogleRefreshTokenResult,
): GoogleAuthAccountTokens | null {
  if (!tokens.accessToken || !tokens.accountId) {
    return null;
  }

  const scopes = parseOAuthScopes(tokens.scope);

  return {
    provider: "google",
    providerAccountId: tokens.accountId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: toIsoStringOrNull(tokens.accessTokenExpiresAt),
    idToken: tokens.idToken ?? null,
    scopes,
    rawPayload: {
      providerId: tokens.providerId ?? "google",
      providerAccountId: tokens.accountId,
      scopes,
      accessTokenExpiresAt: toIsoStringOrNull(tokens.accessTokenExpiresAt),
      refreshTokenExpiresAt: toIsoStringOrNull(tokens.refreshTokenExpiresAt),
      hasRefreshToken: Boolean(tokens.refreshToken),
    },
  };
}

export function googleAuthTokensFromAccessTokenResult(
  tokens: BetterAuthGoogleAccessTokenResult,
): GoogleAuthAccountTokens | null {
  if (!tokens.accessToken) {
    return null;
  }

  const scopes = [...(tokens.scopes ?? [])];

  return {
    provider: "google",
    providerAccountId: "google",
    accessToken: tokens.accessToken,
    refreshToken: null,
    expiresAt: toIsoStringOrNull(tokens.accessTokenExpiresAt),
    idToken: tokens.idToken ?? null,
    scopes,
    rawPayload: {
      providerId: "google",
      providerAccountId: "google",
      scopes,
      accessTokenExpiresAt: toIsoStringOrNull(tokens.accessTokenExpiresAt),
      refreshTokenExpiresAt: null,
      hasRefreshToken: false,
    },
  };
}

function parseOAuthScopes(scope: string | null | undefined) {
  return scope
    ? scope
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function toIsoStringOrNull(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}
