export type GoogleOAuthCredentialInput = {
  GMAIL_CLIENT_ID?: string | null;
  GMAIL_CLIENT_SECRET?: string | null;
};

export const googleGmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
export const googleEmailInboxScopes = [googleGmailReadonlyScope];

export type GoogleOAuthCredentialStatus = "missing" | "configured" | "partial" | "invalid";

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export function googleOAuthCredentialStatus(
  input: GoogleOAuthCredentialInput,
): GoogleOAuthCredentialStatus {
  const clientId = normalizeCredentialValue(input.GMAIL_CLIENT_ID);
  const clientSecret = normalizeCredentialValue(input.GMAIL_CLIENT_SECRET);

  if (!clientId && !clientSecret) {
    return "missing";
  }

  if (!clientId || !clientSecret) {
    return "partial";
  }

  if (
    isPlaceholderCredentialValue(clientId) ||
    isPlaceholderCredentialValue(clientSecret) ||
    !looksLikeGoogleOAuthClientId(clientId) ||
    !looksLikeGoogleOAuthClientSecret(clientSecret)
  ) {
    return "invalid";
  }

  return "configured";
}

export function resolveGoogleOAuthCredentials(
  input: GoogleOAuthCredentialInput,
): GoogleOAuthCredentials | null {
  if (googleOAuthCredentialStatus(input) !== "configured") {
    return null;
  }

  return {
    clientId: normalizeCredentialValue(input.GMAIL_CLIENT_ID) as string,
    clientSecret: normalizeCredentialValue(input.GMAIL_CLIENT_SECRET) as string,
  };
}

export function assertGoogleOAuthCredentialConfig(input: GoogleOAuthCredentialInput) {
  const status = googleOAuthCredentialStatus(input);

  if (status === "missing" || status === "configured") {
    return;
  }

  if (status === "partial") {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set together");
  }

  throw new Error(
    "Gmail OAuth credentials are invalid: expected GMAIL_CLIENT_ID to end with .apps.googleusercontent.com and GMAIL_CLIENT_SECRET to start with GOCSPX-",
  );
}

export function looksLikeGoogleOAuthClientId(value: string | undefined | null) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

export function looksLikeGoogleOAuthClientSecret(value: string | undefined | null) {
  return typeof value === "string" && /^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(value);
}

function normalizeCredentialValue(value: string | undefined | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function isPlaceholderCredentialValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "changeme" ||
    normalized === "change-me" ||
    normalized === "example" ||
    normalized === "placeholder" ||
    normalized === "test" ||
    normalized.startsWith("<") ||
    normalized.includes("your_") ||
    normalized.includes("your-") ||
    normalized.includes("replace")
  );
}
