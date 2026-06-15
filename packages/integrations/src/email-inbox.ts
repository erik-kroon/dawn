import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type EmailInboxRawPayload = Record<string, unknown>;

export type EmailInboxEncryptedToken = {
  encryptedToken: string;
  keyId: string;
  lastFour: string;
};

export type EmailInboxProviderName = "mock-email-inbox" | "gmail";

export type EmailInboxProviderCapability =
  | "oauth"
  | "refreshToken"
  | "syncEvidence"
  | "attachmentEvidence"
  | "bodyEvidence"
  | "disconnect";

export type EmailInboxProviderConnectionStatus = "connected" | "reauthorization_required";

export type EmailInboxTokenBundle = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scopes: string[];
  rawPayload: EmailInboxRawPayload;
};

export type EmailInboxProviderConnection = {
  provider: EmailInboxProviderName;
  providerConnectionId: string;
  accountEmail: string;
  status: EmailInboxProviderConnectionStatus;
  grantedScopes: readonly string[];
  expiresAt?: string | null;
  rawPayload: EmailInboxRawPayload;
};

export type EmailInboxSyncCursor = {
  receivedAfter?: string | null;
  providerCursor?: string | null;
  rawPayload?: EmailInboxRawPayload;
};

export type EmailInboxAddress = {
  email: string;
  name?: string | null;
};

export type EmailInboxAttachmentArtifact = {
  kind: "attachment";
  artifactId: string;
  providerPartId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksumSha256?: string | null;
  contentBase64?: string | null;
};

export type EmailInboxBodyArtifact = {
  kind: "body";
  artifactId: string;
  contentType: "text/plain" | "text/html";
  text?: string | null;
  html?: string | null;
  byteSize: number;
  checksumSha256?: string | null;
};

export type EmailInboxEvidenceArtifact = EmailInboxAttachmentArtifact | EmailInboxBodyArtifact;

export type EmailInboxEvidence = {
  provider: EmailInboxProviderName;
  providerConnectionId: string;
  providerMessageId: string;
  providerThreadId?: string | null;
  providerEvidenceId: string;
  subject?: string | null;
  snippet?: string | null;
  receivedAt: string;
  sentAt?: string | null;
  from: EmailInboxAddress;
  to: EmailInboxAddress[];
  artifact: EmailInboxEvidenceArtifact;
  rawPayload: EmailInboxRawPayload;
};

export type EmailInboxSettings = {
  senderBlocklist: string[];
  domainBlocklist: string[];
  senderAllowlist?: string[];
  searchQuery?: string | null;
  maxAttachmentBytes: number;
};

export type EmailInboxSyncResult = {
  status: "completed";
  evidence: EmailInboxEvidence[];
  nextCursor?: EmailInboxSyncCursor | null;
  rawPayload: EmailInboxRawPayload;
};

export type EmailInboxOAuthUrlInput = {
  redirectUrl: string;
  state?: string | null;
  loginHint?: string | null;
};

export type EmailInboxTokenExchangeInput = {
  code: string;
  redirectUrl: string;
};

export type EmailInboxUserInfo = {
  id: string;
  email: string;
  name?: string | null;
  rawPayload: EmailInboxRawPayload;
};

export type EmailInboxProvider = {
  provider: EmailInboxProviderName;
  displayName: string;
  capabilities: readonly EmailInboxProviderCapability[];
  defaultScopes: readonly string[];
  createAuthUrl(input: EmailInboxOAuthUrlInput): string;
  exchangeCodeForTokens(input: EmailInboxTokenExchangeInput): Promise<EmailInboxTokenBundle>;
  refreshTokens(input: {
    refreshToken: string;
    scopes: readonly string[];
  }): Promise<EmailInboxTokenBundle>;
  getUserInfo(tokens: EmailInboxTokenBundle): Promise<EmailInboxUserInfo>;
  syncEvidence(input: {
    teamId: string;
    connection: EmailInboxProviderConnection;
    tokens: EmailInboxTokenBundle;
    cursor?: EmailInboxSyncCursor | null;
    settings?: EmailInboxSettings | null;
    maxResults?: number;
  }): Promise<EmailInboxSyncResult>;
  disconnect?(input: {
    connection: EmailInboxProviderConnection;
    tokens: EmailInboxTokenBundle;
  }): Promise<{ status: "disconnected"; rawPayload: EmailInboxRawPayload }>;
};

export type EmailInboxTokenCodec = {
  encrypt(tokens: EmailInboxTokenBundle): Promise<EmailInboxEncryptedToken>;
  decrypt(token: EmailInboxEncryptedToken): Promise<EmailInboxTokenBundle>;
};

export type InboxConnectorOptions = {
  provider: EmailInboxProvider;
  tokenCodec: EmailInboxTokenCodec;
  refreshSkewMs?: number;
  now?: () => Date;
};

export type InboxConnectorConnectionResult = {
  connection: EmailInboxProviderConnection;
  token: EmailInboxEncryptedToken;
};

export type InboxConnectorSyncResult = EmailInboxSyncResult & {
  refreshedToken?: EmailInboxEncryptedToken | null;
};

export type EmailInboxProviderAuthErrorCode =
  | "invalid_credentials"
  | "reauthorization_required"
  | "insufficient_scope";

export type EmailInboxProviderSyncErrorCode =
  | "fetch_failed"
  | "rate_limited"
  | "unsupported_response";

export class EmailInboxProviderAuthError extends Error {
  readonly name: string = "EmailInboxProviderAuthError";

  constructor(
    message: string,
    public readonly code: EmailInboxProviderAuthErrorCode,
    public readonly provider: EmailInboxProviderName,
    public readonly providerConnectionId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
  }
}

export class EmailInboxProviderSyncError extends Error {
  readonly name: string = "EmailInboxProviderSyncError";

  constructor(
    message: string,
    public readonly code: EmailInboxProviderSyncErrorCode,
    public readonly provider: EmailInboxProviderName,
    public readonly providerConnectionId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
  }
}

export class EmailInboxReauthorizationRequiredError extends EmailInboxProviderAuthError {
  readonly name = "EmailInboxReauthorizationRequiredError";

  constructor(provider: EmailInboxProviderName, providerConnectionId?: string, cause?: Error) {
    super(
      "Email inbox connection requires reauthorization",
      "reauthorization_required",
      provider,
      providerConnectionId,
      cause,
    );
  }
}

export class EmailInboxInsufficientScopeError extends EmailInboxProviderAuthError {
  readonly name = "EmailInboxInsufficientScopeError";

  constructor(provider: EmailInboxProviderName, providerConnectionId?: string) {
    super(
      "Email inbox connection is missing required mailbox scopes",
      "insufficient_scope",
      provider,
      providerConnectionId,
    );
  }
}

export class InboxConnector {
  readonly provider: EmailInboxProviderName;
  readonly displayName: string;
  readonly capabilities: readonly EmailInboxProviderCapability[];
  readonly defaultScopes: readonly string[];

  readonly #provider: EmailInboxProvider;
  readonly #tokenCodec: EmailInboxTokenCodec;
  readonly #refreshSkewMs: number;
  readonly #now: () => Date;

  constructor(options: InboxConnectorOptions) {
    this.#provider = options.provider;
    this.#tokenCodec = options.tokenCodec;
    this.#refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.#now = options.now ?? (() => new Date());
    this.provider = options.provider.provider;
    this.displayName = options.provider.displayName;
    this.capabilities = options.provider.capabilities;
    this.defaultScopes = options.provider.defaultScopes;
  }

  createAuthUrl(input: EmailInboxOAuthUrlInput) {
    return this.#provider.createAuthUrl(input);
  }

  async exchangeCodeForConnection(
    input: EmailInboxTokenExchangeInput,
  ): Promise<InboxConnectorConnectionResult> {
    const tokens = await this.#provider.exchangeCodeForTokens(input);
    const user = await this.#provider.getUserInfo(tokens);
    const token = await this.#tokenCodec.encrypt(tokens);

    return {
      connection: {
        provider: this.#provider.provider,
        providerConnectionId: user.id,
        accountEmail: user.email,
        status: "connected",
        grantedScopes: tokens.scopes,
        expiresAt: tokens.expiresAt ?? null,
        rawPayload: {
          user: user.rawPayload,
          token: {
            tokenType: tokens.tokenType ?? null,
            scopes: tokens.scopes,
            expiresAt: tokens.expiresAt ?? null,
          },
        },
      },
      token,
    };
  }

  async syncEvidence(input: {
    teamId: string;
    connection: EmailInboxProviderConnection;
    token: EmailInboxEncryptedToken;
    cursor?: EmailInboxSyncCursor | null;
    settings?: EmailInboxSettings | null;
    maxResults?: number;
  }): Promise<InboxConnectorSyncResult> {
    let tokens = await this.#tokenCodec.decrypt(input.token);
    let refreshedToken: EmailInboxEncryptedToken | null = null;

    if (this.#shouldRefresh(tokens)) {
      const refreshed = await this.#refresh(input.connection, tokens);
      tokens = refreshed.tokens;
      refreshedToken = refreshed.encrypted;
    }

    try {
      const result = await this.#provider.syncEvidence({
        teamId: input.teamId,
        connection: input.connection,
        tokens,
        cursor: input.cursor,
        settings: input.settings,
        maxResults: input.maxResults,
      });

      return { ...result, refreshedToken };
    } catch (error) {
      if (error instanceof EmailInboxProviderAuthError) {
        if (error.code === "reauthorization_required") {
          throw error;
        }

        const refreshed = await this.#refresh(input.connection, tokens, error);
        const result = await this.#provider.syncEvidence({
          teamId: input.teamId,
          connection: input.connection,
          tokens: refreshed.tokens,
          cursor: input.cursor,
          settings: input.settings,
          maxResults: input.maxResults,
        });

        return { ...result, refreshedToken: refreshed.encrypted };
      }

      if (error instanceof EmailInboxProviderSyncError) {
        throw error;
      }

      throw new EmailInboxProviderSyncError(
        errorMessage(error),
        "fetch_failed",
        this.#provider.provider,
        input.connection.providerConnectionId,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async disconnect(input: {
    connection: EmailInboxProviderConnection;
    token: EmailInboxEncryptedToken;
  }) {
    if (!this.#provider.disconnect) {
      return { status: "disconnected" as const, rawPayload: {} };
    }

    return await this.#provider.disconnect({
      connection: input.connection,
      tokens: await this.#tokenCodec.decrypt(input.token),
    });
  }

  #shouldRefresh(tokens: EmailInboxTokenBundle) {
    if (!tokens.refreshToken || !tokens.expiresAt) {
      return false;
    }

    return new Date(tokens.expiresAt).getTime() - this.#now().getTime() <= this.#refreshSkewMs;
  }

  async #refresh(
    connection: EmailInboxProviderConnection,
    tokens: EmailInboxTokenBundle,
    cause?: Error,
  ) {
    if (!tokens.refreshToken) {
      throw new EmailInboxReauthorizationRequiredError(
        this.#provider.provider,
        connection.providerConnectionId,
        cause,
      );
    }

    const refreshed = await this.#provider.refreshTokens({
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });
    const merged = {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      scopes: refreshed.scopes.length > 0 ? refreshed.scopes : tokens.scopes,
    };

    return {
      tokens: merged,
      encrypted: await this.#tokenCodec.encrypt(merged),
    };
  }
}

export function createEmailInboxTokenCodec(input: {
  secret: string;
  keyId?: string;
}): EmailInboxTokenCodec {
  const key = createHash("sha256").update(input.secret).digest();
  const keyId = input.keyId ?? "email-inbox-token-v1";

  return {
    async encrypt(tokens) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(tokens), "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const encryptedToken = [
        "v1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(":");
      const marker = tokens.refreshToken || tokens.accessToken;

      return {
        encryptedToken,
        keyId,
        lastFour: marker.slice(-4),
      };
    },
    async decrypt(token) {
      const [version, iv, tag, ciphertext] = token.encryptedToken.split(":");

      if (version !== "v1" || !iv || !tag || !ciphertext) {
        throw new EmailInboxProviderAuthError(
          "Email inbox token cannot be decrypted",
          "invalid_credentials",
          "gmail",
        );
      }

      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");

      return parseTokenBundle(JSON.parse(plaintext));
    },
  };
}

export function createMockEmailInboxProvider(): EmailInboxProvider {
  return {
    provider: "mock-email-inbox",
    displayName: "Mock Email Inbox",
    capabilities: ["oauth", "refreshToken", "syncEvidence", "attachmentEvidence", "bodyEvidence"],
    defaultScopes: ["email.inbox.readonly"],
    createAuthUrl(input) {
      const url = new URL("http://localhost/mock-email-inbox/oauth");
      url.searchParams.set("redirect_uri", input.redirectUrl);

      if (input.state) {
        url.searchParams.set("state", input.state);
      }

      if (input.loginHint) {
        url.searchParams.set("login_hint", input.loginHint);
      }

      return url.toString();
    },
    async exchangeCodeForTokens(input) {
      return {
        accessToken: `mock_access_${input.code}`,
        refreshToken: `mock_refresh_${input.code}`,
        expiresAt: "2026-06-15T16:00:00.000Z",
        tokenType: "Bearer",
        scopes: ["email.inbox.readonly"],
        rawPayload: {
          mock: true,
          code: input.code,
          redirectUrl: input.redirectUrl,
        },
      };
    },
    async refreshTokens(input) {
      return {
        accessToken: `mock_refreshed_${input.refreshToken.slice(-8)}`,
        refreshToken: input.refreshToken,
        expiresAt: "2026-06-15T22:00:00.000Z",
        tokenType: "Bearer",
        scopes: [...input.scopes],
        rawPayload: {
          mock: true,
          refreshed: true,
        },
      };
    },
    async getUserInfo() {
      return {
        id: "mock_email_account_1",
        email: "receipts@example.com",
        name: "Receipts Inbox",
        rawPayload: {
          mock: true,
          id: "mock_email_account_1",
          email: "receipts@example.com",
        },
      };
    },
    async syncEvidence(input) {
      const evidence = mockEmailInboxEvidence(input.connection);

      return {
        status: "completed",
        evidence: evidence.slice(0, input.maxResults ?? evidence.length),
        nextCursor: {
          receivedAfter: "2026-06-15T12:15:00.000Z",
          providerCursor: "mock_cursor_2",
          rawPayload: { mock: true },
        },
        rawPayload: {
          mock: true,
          provider: "mock-email-inbox",
          providerConnectionId: input.connection.providerConnectionId,
          cursor: input.cursor ?? null,
        },
      };
    },
  };
}

export function createGmailEmailInboxProvider(input: {
  clientId: string;
  clientSecret: string;
}): EmailInboxProvider {
  return {
    provider: "gmail",
    displayName: "Gmail",
    capabilities: ["oauth", "refreshToken", "syncEvidence", "attachmentEvidence", "bodyEvidence"],
    defaultScopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
    createAuthUrl(command) {
      assertConfigured(input.clientId, "Gmail client ID");
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", input.clientId);
      url.searchParams.set("redirect_uri", command.redirectUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", this.defaultScopes.join(" "));
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");

      if (command.state) {
        url.searchParams.set("state", command.state);
      }

      if (command.loginHint) {
        url.searchParams.set("login_hint", command.loginHint);
      }

      return url.toString();
    },
    async exchangeCodeForTokens(command) {
      const payload = await postGoogleToken({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        body: {
          code: command.code,
          redirect_uri: command.redirectUrl,
          grant_type: "authorization_code",
        },
      });

      return googleTokenPayloadToBundle(payload);
    },
    async refreshTokens(command) {
      const payload = await postGoogleToken({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        body: {
          refresh_token: command.refreshToken,
          grant_type: "refresh_token",
        },
      });

      return googleTokenPayloadToBundle(payload, command.scopes, command.refreshToken);
    },
    async getUserInfo(tokens) {
      const payload = await gmailFetchJson<Record<string, unknown>>(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        tokens.accessToken,
      );
      const id = requiredPayloadString(payload, "id");
      const email = requiredPayloadString(payload, "email");

      return {
        id,
        email,
        name: optionalPayloadString(payload, "name"),
        rawPayload: payload,
      };
    },
    async syncEvidence(command) {
      const messageIds = await listGmailMessageIds(command);
      const evidence: EmailInboxEvidence[] = [];

      for (const messageId of messageIds) {
        const message = await getGmailMessage(command.tokens.accessToken, messageId);
        evidence.push(...(await gmailMessageToEvidence(command, message)));

        if (command.maxResults && evidence.length >= command.maxResults) {
          break;
        }
      }

      return {
        status: "completed",
        evidence: evidence.slice(0, command.maxResults ?? evidence.length),
        nextCursor: gmailNextCursor(messageIds, evidence),
        rawPayload: {
          provider: "gmail",
          messagesScanned: messageIds.length,
          evidenceFound: evidence.length,
        },
      };
    },
  };
}

export function createInboxConnectorRegistry(connectors: readonly InboxConnector[]) {
  return {
    descriptors: connectors.map((connector) => ({
      provider: connector.provider,
      displayName: connector.displayName,
      capabilities: connector.capabilities,
      defaultScopes: connector.defaultScopes,
    })),
    require(provider: EmailInboxProviderName) {
      const connector = connectors.find((candidate) => candidate.provider === provider);

      if (!connector) {
        throw new Error(`Email inbox provider not configured: ${provider}`);
      }

      return connector;
    },
  };
}

export function emailInboxEvidenceDeduplicationKey(evidence: EmailInboxEvidence) {
  return [
    evidence.provider,
    evidence.providerConnectionId,
    evidence.providerMessageId,
    evidence.providerEvidenceId,
    evidence.artifact.checksumSha256 ?? "no-checksum",
  ].join(":");
}

export function emailInboxArtifactFileName(evidence: EmailInboxEvidence) {
  if (evidence.artifact.kind === "attachment") {
    return evidence.artifact.fileName;
  }

  const extension = evidence.artifact.contentType === "text/html" ? "html" : "txt";
  return `${safeFileSegment(evidence.subject ?? "email-receipt")}-${evidence.providerMessageId}.${extension}`;
}

function mockEmailInboxEvidence(connection: EmailInboxProviderConnection): EmailInboxEvidence[] {
  const pdf = Buffer.from("%PDF-1.4\nMock receipt PDF\nTotal 12.45 USD\n", "utf8");
  const bodyText = "Coffee Shop\nReceipt\nDate 2026-06-15\nTotal 8.50 USD\nPaid card";

  return [
    {
      provider: connection.provider,
      providerConnectionId: connection.providerConnectionId,
      providerMessageId: "mock_message_pdf_1",
      providerThreadId: "mock_thread_1",
      providerEvidenceId: "mock_message_pdf_1:part_pdf_1",
      subject: "Mock PDF receipt",
      snippet: "Receipt attached",
      receivedAt: "2026-06-15T12:00:00.000Z",
      sentAt: "2026-06-15T11:59:00.000Z",
      from: { email: "billing@example.com", name: "Example Billing" },
      to: [{ email: connection.accountEmail }],
      artifact: {
        kind: "attachment",
        artifactId: "part_pdf_1",
        providerPartId: "part_pdf_1",
        fileName: "mock-receipt.pdf",
        contentType: "application/pdf",
        byteSize: pdf.byteLength,
        checksumSha256: sha256Hex(pdf),
        contentBase64: pdf.toString("base64"),
      },
      rawPayload: { mock: true, artifact: "pdf" },
    },
    {
      provider: connection.provider,
      providerConnectionId: connection.providerConnectionId,
      providerMessageId: "mock_message_body_1",
      providerThreadId: "mock_thread_2",
      providerEvidenceId: "mock_message_body_1:body_text",
      subject: "Coffee Shop receipt",
      snippet: "Total 8.50 USD",
      receivedAt: "2026-06-15T12:15:00.000Z",
      sentAt: "2026-06-15T12:14:00.000Z",
      from: { email: "receipts@coffee.example", name: "Coffee Shop" },
      to: [{ email: connection.accountEmail }],
      artifact: {
        kind: "body",
        artifactId: "body_text",
        contentType: "text/plain",
        text: bodyText,
        byteSize: Buffer.byteLength(bodyText),
        checksumSha256: sha256Hex(Buffer.from(bodyText, "utf8")),
      },
      rawPayload: { mock: true, artifact: "body" },
    },
  ];
}

type GoogleTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
};

async function postGoogleToken(input: {
  clientId: string;
  clientSecret: string;
  body: Record<string, string>;
}) {
  assertConfigured(input.clientId, "Gmail client ID");
  assertConfigured(input.clientSecret, "Gmail client secret");
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    ...input.body,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new EmailInboxProviderAuthError(
      `Gmail token exchange failed: ${text}`,
      response.status === 400 || response.status === 401
        ? "reauthorization_required"
        : "invalid_credentials",
      "gmail",
    );
  }

  return (await response.json()) as GoogleTokenPayload;
}

function googleTokenPayloadToBundle(
  payload: GoogleTokenPayload,
  fallbackScopes: readonly string[] = [],
  fallbackRefreshToken?: string | null,
): EmailInboxTokenBundle {
  const accessToken = requiredPayloadString(payload, "access_token");
  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3_600;
  const scopes =
    typeof payload.scope === "string" && payload.scope.trim()
      ? payload.scope.trim().split(/\s+/)
      : [...fallbackScopes];

  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string" && payload.refresh_token.trim()
        ? payload.refresh_token
        : (fallbackRefreshToken ?? null),
    expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    tokenType: optionalPayloadString(payload, "token_type") ?? "Bearer",
    scopes,
    rawPayload: payload as EmailInboxRawPayload,
  };
}

async function listGmailMessageIds(input: {
  connection: EmailInboxProviderConnection;
  tokens: EmailInboxTokenBundle;
  cursor?: EmailInboxSyncCursor | null;
  settings?: EmailInboxSettings | null;
  maxResults?: number;
}) {
  const query = gmailSearchQuery(input);
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(input.maxResults ?? 25, 100)));

  if (input.cursor?.providerCursor) {
    url.searchParams.set("pageToken", input.cursor.providerCursor);
  }

  const payload = await gmailFetchJson<{
    messages?: Array<{ id?: string }>;
  }>(url.toString(), input.tokens.accessToken, input.connection.providerConnectionId);

  return (payload.messages ?? []).map((message) => message.id).filter((id): id is string => !!id);
}

function gmailSearchQuery(input: {
  connection: EmailInboxProviderConnection;
  cursor?: EmailInboxSyncCursor | null;
  settings?: EmailInboxSettings | null;
}) {
  const parts = [
    "-from:me",
    `-from:${input.connection.accountEmail}`,
    "(has:attachment OR receipt OR invoice OR order OR payment)",
  ];

  if (input.cursor?.receivedAfter) {
    parts.push(`after:${gmailDate(input.cursor.receivedAfter)}`);
  } else {
    parts.push("newer_than:30d");
  }

  if (input.settings?.searchQuery?.trim()) {
    parts.push(`(${input.settings.searchQuery.trim()})`);
  }

  return parts.join(" ");
}

async function getGmailMessage(accessToken: string, messageId: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);
  url.searchParams.set("format", "full");

  return await gmailFetchJson<GmailMessage>(url.toString(), accessToken, messageId);
}

async function gmailFetchJson<T>(
  url: string,
  accessToken: string,
  providerConnectionId?: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401 || response.status === 403) {
    throw new EmailInboxProviderAuthError(
      "Gmail credentials are invalid or missing required scopes",
      response.status === 403 ? "insufficient_scope" : "invalid_credentials",
      "gmail",
      providerConnectionId,
    );
  }

  if (!response.ok) {
    throw new EmailInboxProviderSyncError(
      `Gmail request failed with ${response.status}`,
      response.status === 429 ? "rate_limited" : "fetch_failed",
      "gmail",
      providerConnectionId,
    );
  }

  return (await response.json()) as T;
}

type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart;
};

type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

async function gmailMessageToEvidence(
  input: {
    connection: EmailInboxProviderConnection;
    tokens: EmailInboxTokenBundle;
    settings?: EmailInboxSettings | null;
  },
  message: GmailMessage,
): Promise<EmailInboxEvidence[]> {
  const payload = message.payload;
  const providerMessageId = requiredMessageId(message);
  const headers = payload?.headers ?? [];
  const subject = headerValue(headers, "subject");
  const from = parseEmailAddress(headerValue(headers, "from") ?? "");
  const to = (headerValue(headers, "to") ?? "")
    .split(",")
    .map(parseEmailAddress)
    .filter((address) => address.email);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : (headerValue(headers, "date") ?? new Date().toISOString());
  const parts = flattenGmailParts(payload);
  const attachmentEvidence = await Promise.all(
    parts
      .filter((part) => isSupportedGmailAttachment(part, input.settings))
      .map(async (part) => {
        const body = await getGmailPartBody({
          accessToken: input.tokens.accessToken,
          messageId: providerMessageId,
          part,
        });

        return baseEvidence(input.connection, {
          message,
          providerMessageId,
          subject,
          from,
          to,
          receivedAt,
          artifact: {
            kind: "attachment",
            artifactId: part.partId ?? part.body?.attachmentId ?? part.filename ?? "attachment",
            providerPartId: part.partId ?? part.body?.attachmentId ?? "attachment",
            fileName: part.filename || "gmail-attachment.pdf",
            contentType: normalizedContentType(part.mimeType ?? "application/octet-stream"),
            byteSize: body.byteLength,
            checksumSha256: sha256Hex(body),
            contentBase64: body.toString("base64"),
          },
          rawPayload: {
            headers: compactHeaders(headers),
            partId: part.partId ?? null,
            attachmentId: part.body?.attachmentId ?? null,
          },
        });
      }),
  );

  if (attachmentEvidence.length > 0) {
    return attachmentEvidence;
  }

  const body = bestGmailBodyPart(parts);

  if (!body || !looksLikeReceiptBody(body.text)) {
    return [];
  }

  return [
    baseEvidence(input.connection, {
      message,
      providerMessageId,
      subject,
      from,
      to,
      receivedAt,
      artifact: {
        kind: "body",
        artifactId: body.partId ?? "body",
        contentType: body.contentType,
        text: body.contentType === "text/plain" ? body.text : stripHtml(body.text),
        html: body.contentType === "text/html" ? body.text : null,
        byteSize: Buffer.byteLength(body.text),
        checksumSha256: sha256Hex(Buffer.from(body.text, "utf8")),
      },
      rawPayload: {
        headers: compactHeaders(headers),
        partId: body.partId ?? null,
      },
    }),
  ];
}

function baseEvidence(
  connection: EmailInboxProviderConnection,
  input: {
    message: GmailMessage;
    providerMessageId: string;
    subject?: string | null;
    from: EmailInboxAddress;
    to: EmailInboxAddress[];
    receivedAt: string;
    artifact: EmailInboxEvidenceArtifact;
    rawPayload: EmailInboxRawPayload;
  },
): EmailInboxEvidence {
  return {
    provider: connection.provider,
    providerConnectionId: connection.providerConnectionId,
    providerMessageId: input.providerMessageId,
    providerThreadId: input.message.threadId ?? null,
    providerEvidenceId: `${input.providerMessageId}:${input.artifact.artifactId}`,
    subject: input.subject ?? null,
    snippet: input.message.snippet ?? null,
    receivedAt: input.receivedAt,
    from: input.from,
    to: input.to,
    artifact: input.artifact,
    rawPayload: input.rawPayload,
  };
}

async function getGmailPartBody(input: {
  accessToken: string;
  messageId: string;
  part: GmailMessagePart;
}) {
  if (input.part.body?.data) {
    return Buffer.from(input.part.body.data, "base64url");
  }

  const attachmentId = input.part.body?.attachmentId;

  if (!attachmentId) {
    return Buffer.alloc(0);
  }

  const payload = await gmailFetchJson<{ data?: string }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}/attachments/${attachmentId}`,
    input.accessToken,
  );

  return Buffer.from(payload.data ?? "", "base64url");
}

function flattenGmailParts(part: GmailMessagePart | undefined): GmailMessagePart[] {
  if (!part) {
    return [];
  }

  return [part, ...(part.parts ?? []).flatMap(flattenGmailParts)];
}

function isSupportedGmailAttachment(part: GmailMessagePart, settings?: EmailInboxSettings | null) {
  const fileName = part.filename?.trim();

  if (!fileName || !part.body) {
    return false;
  }

  const contentType = normalizedContentType(part.mimeType ?? "");

  if (contentType !== "application/pdf" && contentType !== "application/octet-stream") {
    return false;
  }

  return (part.body.size ?? 0) <= (settings?.maxAttachmentBytes ?? 10 * 1024 * 1024);
}

function bestGmailBodyPart(parts: GmailMessagePart[]) {
  for (const contentType of ["text/plain", "text/html"] as const) {
    const part = parts.find(
      (candidate) => normalizedContentType(candidate.mimeType ?? "") === contentType,
    );

    if (part?.body?.data) {
      const text = Buffer.from(part.body.data, "base64url").toString("utf8").trim();

      if (text) {
        return {
          partId: part.partId,
          contentType,
          text,
        };
      }
    }
  }

  return null;
}

function gmailNextCursor(messageIds: readonly string[], evidence: readonly EmailInboxEvidence[]) {
  const receivedAfter = evidence
    .map((item) => item.receivedAt)
    .sort()
    .at(-1);

  return {
    receivedAfter: receivedAfter ?? null,
    providerCursor: null,
    rawPayload: {
      lastMessageId: messageIds.at(-1) ?? null,
    },
  };
}

function parseTokenBundle(value: unknown): EmailInboxTokenBundle {
  if (!isRecord(value) || typeof value.accessToken !== "string") {
    throw new Error("Invalid email inbox token bundle");
  }

  return {
    accessToken: value.accessToken,
    refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : null,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    tokenType: typeof value.tokenType === "string" ? value.tokenType : null,
    scopes: Array.isArray(value.scopes)
      ? value.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    rawPayload: isRecord(value.rawPayload) ? value.rawPayload : {},
  };
}

function requiredPayloadString(payload: Record<string, unknown>, field: string) {
  const value = payload[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new EmailInboxProviderSyncError(
      `Gmail response is missing ${field}`,
      "unsupported_response",
      "gmail",
    );
  }

  return value;
}

function optionalPayloadString(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredMessageId(message: GmailMessage) {
  if (!message.id) {
    throw new EmailInboxProviderSyncError(
      "Gmail message is missing an id",
      "unsupported_response",
      "gmail",
    );
  }

  return message.id;
}

function headerValue(headers: GmailMessagePart["headers"], name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value;
}

function parseEmailAddress(value: string): EmailInboxAddress {
  const match = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);

  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2]?.trim().toLowerCase() ?? "",
    };
  }

  return {
    email: value.trim().toLowerCase(),
  };
}

function compactHeaders(headers: GmailMessagePart["headers"]) {
  return Object.fromEntries(
    (headers ?? [])
      .filter((header) => header.name && header.value)
      .map((header) => [header.name!, header.value!]),
  );
}

function normalizedContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function looksLikeReceiptBody(text: string) {
  return /\b(receipt|invoice|order|payment|paid|total|amount)\b/i.test(stripHtml(text));
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "email-receipt";
}

function gmailDate(value: string) {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function sha256Hex(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

function assertConfigured(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is not configured`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
