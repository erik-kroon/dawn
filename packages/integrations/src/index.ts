import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  type InvoiceHandoffProviderPayload,
  normalizeFortnoxArticleNumber,
  normalizeFortnoxCustomerNumber,
  normalizeSwedishOrganizationNumber,
  type InvoiceDraft,
  type LedgerTransactionDraft,
  type Money,
  type Transaction,
} from "@dawn/domain";

export * from "./email-inbox";

export type BankingProviderName = "mock-bank" | "sandbox-bank";

export type BankingProviderCapability =
  | "createConnection"
  | "createConnectionSession"
  | "exchangeConnectionSession"
  | "listAccounts"
  | "syncAccount"
  | "normalizeTransaction"
  | "verifyWebhook"
  | "disconnect";

export type ProviderRawPayload = Record<string, unknown>;

export type BankingProviderConnection = {
  provider: BankingProviderName;
  providerConnectionId: string;
  institutionName: string;
  status: "connected";
  token?: IntegrationProviderToken | null;
  rawPayload: ProviderRawPayload;
};

export type BankingProviderConnectionSession = {
  provider: BankingProviderName;
  providerSessionId: string;
  linkToken: string;
  connectUrl: string;
  expiresAt: string;
  rawPayload: ProviderRawPayload;
};

export type BankingProviderAccount = {
  providerAccountId: string;
  name: string;
  currency: string;
  type: "bank" | "cash" | "credit_card" | "loan" | "other";
  currentBalance: Money;
  rawPayload: ProviderRawPayload;
};

export type BankingProviderTransaction = {
  providerTransactionId: string;
  providerAccountId: string;
  description: string;
  postedAt: string;
  amount: Money;
  rawPayload: ProviderRawPayload;
};

export type BankingProvider = {
  provider: BankingProviderName;
  displayName: string;
  environment: "local" | "sandbox" | "production";
  capabilities: readonly BankingProviderCapability[];
  createConnection(input: { teamId: string; actorId: string }): Promise<BankingProviderConnection>;
  createConnectionSession?(input: {
    teamId: string;
    actorId: string;
    redirectUrl: string;
  }): Promise<BankingProviderConnectionSession>;
  exchangeConnectionSession?(input: {
    teamId: string;
    actorId: string;
    providerSessionId: string;
    publicToken: string;
  }): Promise<BankingProviderConnection>;
  listAccounts(connection: BankingProviderConnection): Promise<BankingProviderAccount[]>;
  syncAccount(input: {
    connection: BankingProviderConnection;
    account: BankingProviderAccount;
  }): Promise<BankingProviderTransaction[]>;
  disconnectConnection?(connection: BankingProviderConnection): Promise<{
    status: "disconnected";
    rawPayload: ProviderRawPayload;
  }>;
};

export type BankingProviderWebhookVerification = {
  provider: BankingProviderName;
  verified: boolean;
  eventType: string;
  teamId: string;
  providerConnectionId: string;
  rawPayload: ProviderRawPayload;
};

export type InvoiceEmailAttachment = {
  fileName: string;
  contentType: "application/pdf";
  bodyBase64: string;
};

export type InvoiceEmailMessage = {
  teamId: string;
  invoiceId: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  attachment: InvoiceEmailAttachment;
};

export type EmailDeliveryResult = {
  providerMessageId: string;
  acceptedAt: string;
};

export type InvoiceEmailDeliveryResult = EmailDeliveryResult;

export type InvoiceEmailDeliveryProvider = {
  provider: "mock-email";
  sendInvoice(input: InvoiceEmailMessage): Promise<InvoiceEmailDeliveryResult>;
};

export type AccountantPacketEmailMessage = {
  teamId: string;
  packetId: string;
  to: string;
  cc?: readonly string[];
  subject: string;
  text: string;
  downloadUrl: string;
  downloadExpiresAt: string;
  fileName: string;
};

export type AccountantPacketEmailDeliveryProvider = {
  provider: "mock-email";
  sendAccountantPacket(input: AccountantPacketEmailMessage): Promise<EmailDeliveryResult>;
};

export type IntegrationCategory = "accounting" | "payments" | "messaging" | "email";

export type IntegrationProviderName =
  | "fortnox"
  | "mock-accounting"
  | "mock-payments"
  | "mock-messaging"
  | "mock-email";

export type IntegrationProviderCapability =
  | "connect"
  | "sync"
  | "disable"
  | "exportTransactions"
  | "exportInvoices"
  | "receivePaymentEvents"
  | "sendMessage"
  | "sendEmail";

export type IntegrationProviderToken = {
  encryptedToken: string;
  keyId: string;
  lastFour: string;
};

export type IntegrationProviderConnection = {
  provider: IntegrationProviderName;
  category: IntegrationCategory;
  providerConnectionId: string;
  displayName: string;
  status: "connected";
  capabilities: readonly IntegrationProviderCapability[];
  token: IntegrationProviderToken;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderAuthorizationUrl = {
  provider: IntegrationProviderName;
  authorizationUrl: string;
  state: string;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderDisconnectResult = {
  status: "disconnected";
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderExternalObject = {
  providerObjectType: string;
  providerObjectId: string;
  internalEntityType?: string | null;
  internalEntityId?: string | null;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderSyncResult = {
  status: "completed" | "partial";
  recordsSynced: number;
  externalObjects?: readonly IntegrationProviderExternalObject[];
  refreshedToken?: IntegrationProviderToken | null;
  connectionRawPayload?: ProviderRawPayload | null;
  nextCursor?: ProviderRawPayload | null;
  recovery?: {
    message: string;
    retryCursor?: ProviderRawPayload | null;
  } | null;
  error?: string | null;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderExportResult = {
  status: "completed";
  recordsExported: number;
  rawPayload: ProviderRawPayload;
};

export type IntegrationPaymentEvent = {
  providerEventId: string;
  invoiceId: string;
  amount: Money;
  paidAt: string;
  method?: string | null;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderPaymentEventResult = {
  status: "completed";
  paymentEvent: IntegrationPaymentEvent;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProviderDeliveryResult = {
  status: "completed";
  providerDeliveryId: string;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProvider = {
  provider: IntegrationProviderName;
  category: IntegrationCategory;
  displayName: string;
  capabilities: readonly IntegrationProviderCapability[];
  createAuthorizationUrl?(input: {
    teamId: string;
    actorId: string;
    redirectUrl: string;
    state: string;
  }): IntegrationProviderAuthorizationUrl;
  exchangeOAuthCode?(input: {
    teamId: string;
    actorId: string;
    code: string;
    redirectUrl: string;
    state: string;
    idempotencyKey: string;
  }): Promise<IntegrationProviderConnection>;
  connect(input: {
    teamId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<IntegrationProviderConnection>;
  sync(input: {
    teamId: string;
    providerConnectionId: string;
    token?: IntegrationProviderToken | null;
    rawPayload?: ProviderRawPayload | null;
    syncMode?: "initial" | "incremental";
    cursor?: ProviderRawPayload | null;
  }): Promise<IntegrationProviderSyncResult>;
  exportTransactions?(input: {
    teamId: string;
    providerConnectionId: string;
    transactions: readonly Transaction[];
  }): Promise<IntegrationProviderExportResult>;
  exportInvoices?(input: {
    teamId: string;
    providerConnectionId: string;
    invoices: readonly InvoiceDraft[];
  }): Promise<IntegrationProviderExportResult>;
  receivePaymentEvent?(input: {
    teamId: string;
    providerConnectionId: string;
    rawPayload: ProviderRawPayload;
  }): Promise<IntegrationProviderPaymentEventResult>;
  sendMessage?(input: {
    teamId: string;
    providerConnectionId: string;
    channel: string;
    text: string;
  }): Promise<IntegrationProviderDeliveryResult>;
  sendEmail?(input: {
    teamId: string;
    providerConnectionId: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<IntegrationProviderDeliveryResult>;
  disconnect?(input: {
    teamId: string;
    providerConnectionId: string;
  }): Promise<IntegrationProviderDisconnectResult>;
};

export type TicSignatureProviderName = "tic";

export type TicSignatureRequestInput = {
  teamId: string;
  documentId: string;
  documentVersionId: string;
  signer: {
    name: string;
    email: string;
  };
  userVisibleData: string;
  userNonVisibleData: string;
  callbackUrl?: string | null;
  idempotencyKey: string;
};

export type TicSignatureSession = {
  provider: TicSignatureProviderName;
  providerSessionId: string;
  signingUrl: string;
  expiresAt: string;
  rawPayload: ProviderRawPayload;
};

export type TicSignatureCompletion = {
  providerEventId: string;
  providerSessionId: string;
  documentPdfSha256: string;
  signedAt: string;
  signerName: string;
  signerEmail?: string | null;
  signerPersonalNumberMasked?: string | null;
  signatureValue?: string | null;
  xmlDsig?: string | null;
  ocspResponse?: string | null;
  evidenceObjectKey?: string | null;
  rawPayload: ProviderRawPayload;
};

export type TicSignatureProvider = {
  provider: TicSignatureProviderName;
  displayName: string;
  createSignatureRequest(input: TicSignatureRequestInput): Promise<TicSignatureSession>;
  parseCompletionWebhook(input: { body: string }): TicSignatureCompletion;
};

export type TicCompanyRolesRequestInput = {
  teamId: string;
  providerSessionId: string;
  signatureRequestId: string;
  signatureEvidenceId: string;
  sourceOrganizationNumber: string | null;
  idempotencyKey: string;
};

export type TicCompanyRole = {
  positionType: string | null;
  positionDescription: string;
  positionStart: string | null;
  positionEnd: string | null;
};

export type TicCompanyRolesEnrichment = {
  provider: "tic";
  providerRequestId: string;
  providerEventId: string | null;
  providerSessionId: string;
  status: "completed" | "partially_completed" | "failed" | "unavailable";
  companyRegistrationNumber: string | null;
  legalName: string | null;
  legalEntityType: string | null;
  companyStatus: string | null;
  roles: TicCompanyRole[];
  signatureDescription: string | null;
  signingAuthorityAnalysis: {
    summary: string;
    confidence?: "low" | "medium" | "high" | null;
    reasons?: readonly string[];
  } | null;
  requestedAt: string;
  completedAt: string | null;
  rawPayload: ProviderRawPayload;
  rawPayloadReference?: string | null;
};

export type TicCompanyRolesProvider = {
  provider: "tic";
  displayName: string;
  requestCompanyRoles(input: TicCompanyRolesRequestInput): Promise<TicCompanyRolesEnrichment>;
};

export type FortnoxInvoiceCreateInput = {
  teamId: string;
  connectionId: string;
  providerConnectionId: string;
  token?: IntegrationProviderToken | null;
  payload: InvoiceHandoffProviderPayload;
  idempotencyKey: string;
};

export type FortnoxInvoiceCreateResult = {
  provider: "fortnox";
  providerInvoiceId: string;
  invoiceNumber: string;
  invoiceUrl: string | null;
  providerStatus: "created" | "booked" | "sent" | "paid" | "cancelled";
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  rawPayload: ProviderRawPayload;
};

export type FortnoxInvoiceProvider = {
  provider: "fortnox";
  displayName: string;
  createInvoice(input: FortnoxInvoiceCreateInput): Promise<FortnoxInvoiceCreateResult>;
};

export type FortnoxTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: "bearer" | "Bearer";
  scopes: string[];
  rawPayload: ProviderRawPayload;
};

export type FortnoxTokenCodec = {
  encrypt(tokens: FortnoxTokenBundle): Promise<IntegrationProviderToken>;
  decrypt(token: IntegrationProviderToken): Promise<FortnoxTokenBundle>;
};

export type FortnoxConnectionHealthWarning = {
  code: "missing_scope" | "missing_license" | "token_expiring";
  message: string;
  scope?: string | null;
};

export type FortnoxConnectionHealth = {
  status: "connected" | "warning";
  grantedScopes: string[];
  missingScopes: string[];
  warnings: FortnoxConnectionHealthWarning[];
  expiresAt?: string | null;
};

export const fortnoxRequiredScopes = [
  "companyinformation",
  "customer",
  "article",
  "invoice",
] as const;

export type FortnoxHttpFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FortnoxIntegrationProviderConfig = {
  clientId: string;
  clientSecret: string;
  tokenCodec: FortnoxTokenCodec;
  fetch?: FortnoxHttpFetch;
  now?: () => Date;
  scopes?: readonly string[];
  maxPagesPerSync?: number;
  endpoints?: Partial<{
    authorizationUrl: string;
    tokenUrl: string;
    apiBaseUrl: string;
  }>;
};

type FortnoxSyncResource = "company" | "customer" | "article" | "invoice" | "payment";

type FortnoxSyncCursor = {
  resource?: FortnoxSyncResource;
  page?: number;
};

const defaultFortnoxEndpoints = {
  authorizationUrl: "https://apps.fortnox.se/oauth-v1/auth",
  tokenUrl: "https://apps.fortnox.se/oauth-v1/token",
  apiBaseUrl: "https://api.fortnox.se/3",
} as const;

export function canonicalProviderTransactionId(input: {
  provider: BankingProviderName;
  providerConnectionId: string;
  providerAccountId: string;
  providerTransactionId: string;
}) {
  return [
    input.provider,
    input.providerConnectionId,
    input.providerAccountId,
    input.providerTransactionId,
  ].join(":");
}

export function providerTransactionToLedgerDraft(input: {
  teamId: string;
  ledgerAccountId: string;
  provider: BankingProviderName;
  providerConnectionId: string;
  transaction: BankingProviderTransaction;
}): LedgerTransactionDraft {
  return {
    teamId: input.teamId,
    accountId: input.ledgerAccountId,
    description: input.transaction.description.trim(),
    postedAt: input.transaction.postedAt,
    money: input.transaction.amount,
    type: input.transaction.amount.amountMinor >= 0 ? "income" : "expense",
    source: "bank_sync",
    providerTransactionId: canonicalProviderTransactionId({
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      providerAccountId: input.transaction.providerAccountId,
      providerTransactionId: input.transaction.providerTransactionId,
    }),
  };
}

export function createFortnoxTokenCodec(input: {
  secret: string;
  keyId?: string;
}): FortnoxTokenCodec {
  const key = createHash("sha256").update(input.secret).digest();
  const keyId = input.keyId ?? "fortnox-token-v1";

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

      return {
        encryptedToken,
        keyId,
        lastFour: tokens.refreshToken.slice(-4),
      };
    },
    async decrypt(token) {
      const [version, iv, tag, ciphertext] = token.encryptedToken.split(":");

      if (version !== "v1" || !iv || !tag || !ciphertext) {
        throw new Error("Fortnox token cannot be decrypted");
      }

      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");

      return parseFortnoxTokenBundle(JSON.parse(plaintext));
    },
  };
}

export function normalizeFortnoxConnectionHealth(input: {
  grantedScopes: readonly string[];
  licensedScopes?: readonly string[] | null;
  expiresAt?: string | null;
  now?: Date;
}): FortnoxConnectionHealth {
  const grantedScopes = [...new Set(input.grantedScopes.map((scope) => scope.trim()))].filter(
    Boolean,
  );
  const granted = new Set(grantedScopes);
  const licensed =
    input.licensedScopes && input.licensedScopes.length > 0 ? new Set(input.licensedScopes) : null;
  const missingScopes = fortnoxRequiredScopes.filter((scope) => !granted.has(scope));
  const warnings: FortnoxConnectionHealthWarning[] = missingScopes.map((scope) => ({
    code: "missing_scope" as const,
    scope,
    message: `Fortnox OAuth grant is missing required scope: ${scope}`,
  }));

  if (licensed) {
    for (const scope of fortnoxRequiredScopes) {
      if (!licensed.has(scope)) {
        warnings.push({
          code: "missing_license",
          scope,
          message: `Fortnox company may be missing licence access for: ${scope}`,
        });
      }
    }
  }

  if (input.expiresAt) {
    const now = input.now ?? new Date();
    const expiresSoon = new Date(input.expiresAt).getTime() - now.getTime() <= 5 * 60_000;

    if (expiresSoon) {
      warnings.push({
        code: "token_expiring",
        message: "Fortnox access token is near expiry and should be refreshed before sync",
      });
    }
  }

  return {
    status: warnings.length > 0 ? "warning" : "connected",
    grantedScopes,
    missingScopes,
    warnings,
    expiresAt: input.expiresAt ?? null,
  };
}

export function createMockBankingProvider(): BankingProvider {
  return {
    provider: "mock-bank",
    displayName: "Mock Bank",
    environment: "local",
    capabilities: ["createConnection", "listAccounts", "syncAccount", "normalizeTransaction"],
    async createConnection(input) {
      return {
        provider: "mock-bank",
        providerConnectionId: `mock_conn_${input.teamId}`,
        institutionName: "Mock Bank",
        status: "connected",
        rawPayload: {
          mock: true,
          teamId: input.teamId,
          actorId: input.actorId,
          institution: "Mock Bank",
        },
      };
    },
    async listAccounts(connection) {
      return [
        {
          providerAccountId: "mock_checking",
          name: "Mock Checking",
          currency: "USD",
          type: "bank",
          currentBalance: { amountMinor: 12_500_00, currency: "USD" },
          rawPayload: {
            providerConnectionId: connection.providerConnectionId,
            accountSubtype: "checking",
            mask: "0001",
          },
        },
        {
          providerAccountId: "mock_savings",
          name: "Mock Savings",
          currency: "USD",
          type: "bank",
          currentBalance: { amountMinor: 25_000_00, currency: "USD" },
          rawPayload: {
            providerConnectionId: connection.providerConnectionId,
            accountSubtype: "savings",
            mask: "0002",
          },
        },
      ];
    },
    async syncAccount(input) {
      if (input.account.providerAccountId === "mock_savings") {
        return [];
      }

      return [
        {
          providerTransactionId: "mock_txn_figma",
          providerAccountId: input.account.providerAccountId,
          description: "Figma subscription",
          postedAt: "2026-06-14T00:00:00.000Z",
          amount: { amountMinor: -1200, currency: input.account.currency },
          rawPayload: {
            category: "Software",
            pending: false,
            source: "mock-bank",
          },
        },
        {
          providerTransactionId: "mock_txn_invoice",
          providerAccountId: input.account.providerAccountId,
          description: "Acme invoice payment",
          postedAt: "2026-06-15T00:00:00.000Z",
          amount: { amountMinor: 5000_00, currency: input.account.currency },
          rawPayload: {
            category: "Income",
            pending: false,
            source: "mock-bank",
          },
        },
      ];
    },
  };
}

export function createSandboxBankingProvider(input: {
  appUrl: string;
  webhookSecret: string;
}): BankingProvider {
  return {
    provider: "sandbox-bank",
    displayName: "Sandbox Open Banking",
    environment: "sandbox",
    capabilities: [
      "createConnection",
      "createConnectionSession",
      "exchangeConnectionSession",
      "listAccounts",
      "syncAccount",
      "normalizeTransaction",
      "verifyWebhook",
      "disconnect",
    ],
    async createConnection(command) {
      return sandboxProviderConnection({
        teamId: command.teamId,
        actorId: command.actorId,
        providerSessionId: `sandbox_direct_${command.teamId}`,
        publicToken: `sandbox_public_${command.teamId}`,
      });
    },
    async createConnectionSession(command) {
      const providerSessionId = `sandbox_session_${command.teamId}_${command.actorId}`;
      const linkToken = `sandbox_link_${Buffer.from(providerSessionId).toString("base64url")}`;
      const connectUrl = new URL("/banking/sandbox/connect", input.appUrl);
      connectUrl.searchParams.set("session", providerSessionId);
      connectUrl.searchParams.set("redirect", command.redirectUrl);

      return {
        provider: "sandbox-bank",
        providerSessionId,
        linkToken,
        connectUrl: connectUrl.toString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
        rawPayload: {
          sandbox: true,
          provider: "sandbox-bank",
          teamId: command.teamId,
          redirectUrl: command.redirectUrl,
        },
      };
    },
    async exchangeConnectionSession(command) {
      return sandboxProviderConnection(command);
    },
    async listAccounts(connection) {
      return [
        {
          providerAccountId: "sandbox_checking",
          name: "Sandbox Operating Account",
          currency: "USD",
          type: "bank",
          currentBalance: { amountMinor: 42_150_00, currency: "USD" },
          rawPayload: {
            provider: "sandbox-bank",
            providerConnectionId: connection.providerConnectionId,
            subtype: "checking",
            mask: "4242",
          },
        },
        {
          providerAccountId: "sandbox_credit",
          name: "Sandbox Corporate Card",
          currency: "USD",
          type: "credit_card",
          currentBalance: { amountMinor: -1_850_00, currency: "USD" },
          rawPayload: {
            provider: "sandbox-bank",
            providerConnectionId: connection.providerConnectionId,
            subtype: "credit_card",
            mask: "1885",
          },
        },
      ];
    },
    async syncAccount(command) {
      if (command.account.providerAccountId === "sandbox_credit") {
        return [
          {
            providerTransactionId: "sandbox_txn_card_software",
            providerAccountId: command.account.providerAccountId,
            description: "Linear subscription",
            postedAt: "2026-06-13T00:00:00.000Z",
            amount: { amountMinor: -8000, currency: command.account.currency },
            rawPayload: {
              provider: "sandbox-bank",
              category: "Software",
              pending: false,
              accountSubtype: "credit_card",
            },
          },
        ];
      }

      return [
        {
          providerTransactionId: "sandbox_txn_client_payment",
          providerAccountId: command.account.providerAccountId,
          description: "Northstar project payment",
          postedAt: "2026-06-15T00:00:00.000Z",
          amount: { amountMinor: 12_000_00, currency: command.account.currency },
          rawPayload: {
            provider: "sandbox-bank",
            category: "Income",
            pending: false,
            counterparty: "Northstar Studio",
          },
        },
        {
          providerTransactionId: "sandbox_txn_rent",
          providerAccountId: command.account.providerAccountId,
          description: "Studio rent",
          postedAt: "2026-06-12T00:00:00.000Z",
          amount: { amountMinor: -2_400_00, currency: command.account.currency },
          rawPayload: {
            provider: "sandbox-bank",
            category: "Rent",
            pending: false,
            counterparty: "Workspace Co",
          },
        },
      ];
    },
    async disconnectConnection(connection) {
      return {
        status: "disconnected",
        rawPayload: {
          provider: "sandbox-bank",
          providerConnectionId: connection.providerConnectionId,
          disconnectedAt: new Date().toISOString(),
        },
      };
    },
  };
}

export function verifySandboxBankingWebhook(input: {
  body: string;
  signature: string | null;
  secret: string;
}): BankingProviderWebhookVerification {
  const expected = sandboxBankingWebhookSignature({
    body: input.body,
    secret: input.secret,
  });

  if (!input.signature || !constantTimeEqual(input.signature, expected)) {
    return {
      provider: "sandbox-bank",
      verified: false,
      eventType: "unknown",
      teamId: "",
      providerConnectionId: "",
      rawPayload: {},
    };
  }

  const payload = JSON.parse(input.body) as Record<string, unknown>;

  return {
    provider: "sandbox-bank",
    verified: true,
    eventType: typeof payload.eventType === "string" ? payload.eventType : "unknown",
    teamId: typeof payload.teamId === "string" ? payload.teamId : "",
    providerConnectionId:
      typeof payload.providerConnectionId === "string" ? payload.providerConnectionId : "",
    rawPayload: payload,
  };
}

export function sandboxBankingWebhookSignature(input: { body: string; secret: string }) {
  return createHmac("sha256", input.secret).update(input.body).digest("hex");
}

export function createMockInvoiceEmailDeliveryProvider(): InvoiceEmailDeliveryProvider &
  AccountantPacketEmailDeliveryProvider {
  return {
    provider: "mock-email",
    async sendInvoice(input) {
      return {
        providerMessageId: `mock_email_${input.teamId}_${input.invoiceId}`,
        acceptedAt: "2026-06-15T12:00:00.000Z",
      };
    },
    async sendAccountantPacket(input) {
      return {
        providerMessageId: `mock_email_${input.teamId}_${input.packetId}`,
        acceptedAt: "2026-06-15T12:00:00.000Z",
      };
    },
  };
}

export function createMockIntegrationProviders(): IntegrationProvider[] {
  return [
    createMockFortnoxIntegrationProvider(),
    createMockIntegrationProvider({
      provider: "mock-accounting",
      category: "accounting",
      displayName: "Mock Accounting",
      capabilities: ["connect", "sync", "disable", "exportTransactions", "exportInvoices"],
      recordsSynced: 3,
    }),
    createMockIntegrationProvider({
      provider: "mock-payments",
      category: "payments",
      displayName: "Mock Payments",
      capabilities: ["connect", "sync", "disable", "receivePaymentEvents"],
      recordsSynced: 2,
    }),
    createMockIntegrationProvider({
      provider: "mock-messaging",
      category: "messaging",
      displayName: "Mock Messaging",
      capabilities: ["connect", "sync", "disable", "sendMessage"],
      recordsSynced: 1,
    }),
    createMockIntegrationProvider({
      provider: "mock-email",
      category: "email",
      displayName: "Mock Email",
      capabilities: ["connect", "sync", "disable", "sendEmail"],
      recordsSynced: 4,
    }),
  ];
}

export function createConfiguredIntegrationProviders(input: {
  fortnoxClientId?: string | null;
  fortnoxClientSecret?: string | null;
  tokenSecret: string;
  fetch?: FortnoxHttpFetch;
}): IntegrationProvider[] {
  const hasFortnoxClientId = Boolean(input.fortnoxClientId?.trim());
  const hasFortnoxClientSecret = Boolean(input.fortnoxClientSecret?.trim());

  if (hasFortnoxClientId !== hasFortnoxClientSecret) {
    throw new Error("FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET must be set together");
  }

  return [
    hasFortnoxClientId && hasFortnoxClientSecret
      ? createFortnoxIntegrationProvider({
          clientId: input.fortnoxClientId!.trim(),
          clientSecret: input.fortnoxClientSecret!.trim(),
          tokenCodec: createFortnoxTokenCodec({
            secret: input.tokenSecret,
            keyId: "fortnox-token-v1",
          }),
          fetch: input.fetch,
        })
      : createMockFortnoxIntegrationProvider(),
    createMockIntegrationProvider({
      provider: "mock-accounting",
      category: "accounting",
      displayName: "Mock Accounting",
      capabilities: ["connect", "sync", "disable", "exportTransactions", "exportInvoices"],
      recordsSynced: 8,
    }),
    createMockIntegrationProvider({
      provider: "mock-payments",
      category: "payments",
      displayName: "Mock Payments",
      capabilities: ["connect", "sync", "disable", "receivePaymentEvents"],
      recordsSynced: 3,
    }),
    createMockIntegrationProvider({
      provider: "mock-messaging",
      category: "messaging",
      displayName: "Mock Messaging",
      capabilities: ["connect", "sync", "disable", "sendMessage"],
      recordsSynced: 2,
    }),
    createMockIntegrationProvider({
      provider: "mock-email",
      category: "email",
      displayName: "Mock Email",
      capabilities: ["connect", "sync", "disable", "sendEmail"],
      recordsSynced: 4,
    }),
  ];
}

export function createFortnoxIntegrationProvider(
  input: FortnoxIntegrationProviderConfig,
): IntegrationProvider {
  const endpoints = { ...defaultFortnoxEndpoints, ...input.endpoints };
  const fetchFn = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const scopes = [...(input.scopes ?? fortnoxRequiredScopes)];
  const maxPagesPerSync = input.maxPagesPerSync ?? 25;

  return {
    provider: "fortnox",
    category: "accounting",
    displayName: "Fortnox",
    capabilities: ["connect", "sync", "disable"],
    createAuthorizationUrl(command) {
      const authorizationUrl = new URL(endpoints.authorizationUrl);
      authorizationUrl.searchParams.set("client_id", input.clientId);
      authorizationUrl.searchParams.set("redirect_uri", command.redirectUrl);
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", command.state);
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("account_type", "service");

      return {
        provider: "fortnox",
        authorizationUrl: authorizationUrl.toString(),
        state: command.state,
        rawPayload: {
          provider: "fortnox",
          endpoint: endpoints.authorizationUrl,
          teamId: command.teamId,
          actorId: command.actorId,
          scopes,
          accessType: "offline",
          accountType: "service",
        },
      };
    },
    async exchangeOAuthCode(command) {
      const issuedAt = now();
      const tokenBundle = await requestFortnoxToken({
        fetchFn,
        tokenUrl: endpoints.tokenUrl,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        now: issuedAt,
        body: {
          grant_type: "authorization_code",
          code: command.code,
          redirect_uri: command.redirectUrl,
        },
      });
      const health = normalizeFortnoxConnectionHealth({
        grantedScopes: tokenBundle.scopes,
        expiresAt: tokenBundle.expiresAt,
        now: issuedAt,
      });

      return {
        provider: "fortnox",
        category: "accounting",
        providerConnectionId: `fortnox:${command.teamId}`,
        displayName: "Fortnox",
        status: "connected",
        capabilities: ["connect", "sync", "disable"],
        token: await input.tokenCodec.encrypt(tokenBundle),
        rawPayload: {
          provider: "fortnox",
          teamId: command.teamId,
          oauth: {
            source: "authorization_code",
            stateValidated: true,
            scopes: tokenBundle.scopes,
            tokenEndpoint: endpoints.tokenUrl,
            tokenType: tokenBundle.tokenType,
            expiresAt: tokenBundle.expiresAt,
            authorizationCodeLastFour: command.code.slice(-4),
          },
          health,
        },
      };
    },
    async connect(command) {
      throw new Error(`Fortnox requires OAuth; use createAuthorizationUrl for ${command.teamId}`);
    },
    async sync(command) {
      if (!command.token) {
        throw new Error("Fortnox sync requires an encrypted OAuth token");
      }

      const syncStartedAt = now();
      const tokenState = await ensureFortnoxAccessToken({
        fetchFn,
        tokenUrl: endpoints.tokenUrl,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        tokenCodec: input.tokenCodec,
        token: command.token,
        providerConnectionId: command.providerConnectionId,
        now: syncStartedAt,
      });
      const catalog = await syncFortnoxCatalog({
        fetchFn,
        apiBaseUrl: endpoints.apiBaseUrl,
        providerConnectionId: command.providerConnectionId,
        accessToken: tokenState.tokens.accessToken,
        cursor: parseFortnoxSyncCursor(command.cursor),
        maxPages: maxPagesPerSync,
      });
      const rawPayload = {
        provider: "fortnox",
        providerConnectionId: command.providerConnectionId,
        syncMode: command.syncMode ?? "initial",
        customerCount: catalog.externalObjects.filter(
          (object) => object.providerObjectType === "customer",
        ).length,
        articleCount: catalog.externalObjects.filter(
          (object) => object.providerObjectType === "article",
        ).length,
        invoiceCount: catalog.externalObjects.filter(
          (object) => object.providerObjectType === "invoice",
        ).length,
        paymentCount: catalog.externalObjects.filter(
          (object) => object.providerObjectType === "payment",
        ).length,
        invoicePollingFallback: true,
        paymentPollingFallback: true,
        nextCursor: catalog.nextCursor,
        recovery: catalog.recovery,
        health: tokenState.health,
        warnings: tokenState.health.warnings,
      };

      return {
        status: catalog.status,
        recordsSynced: catalog.externalObjects.length,
        externalObjects: catalog.externalObjects,
        refreshedToken: tokenState.refreshedToken,
        connectionRawPayload: tokenState.connectionRawPayload,
        nextCursor: catalog.nextCursor,
        recovery: catalog.recovery,
        error: catalog.error,
        rawPayload,
      };
    },
    async disconnect(command) {
      return {
        status: "disconnected",
        rawPayload: {
          provider: "fortnox",
          providerConnectionId: command.providerConnectionId,
          revokeDeferred: true,
        },
      };
    },
  };
}

export function createMockFortnoxIntegrationProvider(
  input: {
    tokenCodec?: FortnoxTokenCodec;
    grantedScopes?: readonly string[];
    licensedScopes?: readonly string[];
    now?: () => Date;
    partialFailure?: boolean;
  } = {},
): IntegrationProvider {
  const tokenCodec =
    input.tokenCodec ??
    createFortnoxTokenCodec({
      secret: "mock-fortnox-token-secret",
      keyId: "mock-fortnox-token",
    });
  const now = input.now ?? (() => new Date("2026-06-15T10:00:00.000Z"));

  return {
    provider: "fortnox",
    category: "accounting",
    displayName: "Fortnox",
    capabilities: ["connect", "sync", "disable"],
    createAuthorizationUrl(command) {
      const authorizationUrl = new URL("https://apps.fortnox.se/oauth-v1/auth");
      authorizationUrl.searchParams.set("client_id", "mock-fortnox-client");
      authorizationUrl.searchParams.set("redirect_uri", command.redirectUrl);
      authorizationUrl.searchParams.set(
        "scope",
        ["companyinformation", "customer", "article", "invoice"].join(" "),
      );
      authorizationUrl.searchParams.set("state", command.state);
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("account_type", "service");

      return {
        provider: "fortnox",
        authorizationUrl: authorizationUrl.toString(),
        state: command.state,
        rawPayload: {
          mock: true,
          provider: "fortnox",
          endpoint: "https://apps.fortnox.se/oauth-v1/auth",
          teamId: command.teamId,
          actorId: command.actorId,
          scopes: ["companyinformation", "customer", "article", "invoice"],
          accessType: "offline",
          accountType: "service",
        },
      };
    },
    async exchangeOAuthCode(command) {
      return await fortnoxProviderConnection({
        teamId: command.teamId,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        tokenCodec,
        grantedScopes: input.grantedScopes,
        licensedScopes: input.licensedScopes,
        now: now(),
        oauth: {
          source: "authorization_code",
          redirectUrl: command.redirectUrl,
          state: command.state,
          authorizationCodeLastFour: command.code.slice(-4),
        },
      });
    },
    async connect(command) {
      return await fortnoxProviderConnection({
        teamId: command.teamId,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        tokenCodec,
        grantedScopes: input.grantedScopes,
        licensedScopes: input.licensedScopes,
        now: now(),
        oauth: {
          source: "direct_mock",
          stateValidated: true,
        },
      });
    },
    async sync(command) {
      const company = mockFortnoxCompany(command.teamId);
      const customers = mockFortnoxCustomers();
      const articles = mockFortnoxArticles();
      const invoices = mockFortnoxInvoices();
      const payments = mockFortnoxInvoicePayments();
      const refreshed = command.token
        ? await maybeRefreshFortnoxToken({
            tokenCodec,
            token: command.token,
            providerConnectionId: command.providerConnectionId,
            now: now(),
            licensedScopes: input.licensedScopes,
          })
        : null;
      const externalObjects: IntegrationProviderExternalObject[] = [
        {
          providerObjectType: "company",
          providerObjectId: company.organizationNumber,
          rawPayload: {
            ...company,
            provider: "fortnox",
            providerConnectionId: command.providerConnectionId,
          },
        },
        ...customers.map((customer) => ({
          providerObjectType: "customer",
          providerObjectId: normalizeFortnoxCustomerNumber(customer.customerNumber),
          rawPayload: {
            ...customer,
            provider: "fortnox",
            providerConnectionId: command.providerConnectionId,
          },
        })),
        ...articles.map((article) => ({
          providerObjectType: "article",
          providerObjectId: normalizeFortnoxArticleNumber(article.articleNumber),
          rawPayload: {
            ...article,
            provider: "fortnox",
            providerConnectionId: command.providerConnectionId,
          },
        })),
        ...invoices.map((invoice) =>
          fortnoxInvoiceExternalObject(invoice, command.providerConnectionId),
        ),
        ...payments.map((payment) =>
          fortnoxInvoicePaymentExternalObject(payment, command.providerConnectionId),
        ),
      ];
      const scopedObjects = fortnoxObjectsForSync({
        objects: externalObjects,
        partialFailure: input.partialFailure === true,
        cursor: command.cursor ?? null,
      });
      const rawPayload = {
        mock: true,
        provider: "fortnox",
        providerConnectionId: command.providerConnectionId,
        syncMode: command.syncMode ?? "initial",
        companyOrganizationNumber: company.organizationNumber,
        customerCount: customers.length,
        articleCount: articles.length,
        invoiceCount: invoices.length,
        paymentCount: payments.length,
        invoicePollingFallback: true,
        paymentPollingFallback: true,
        nextCursor: scopedObjects.nextCursor,
        recovery: scopedObjects.recovery,
        health: refreshed?.health ?? null,
        warnings: refreshed?.health.warnings ?? [],
      };

      return {
        status: scopedObjects.status,
        recordsSynced: scopedObjects.objects.length,
        externalObjects: scopedObjects.objects,
        refreshedToken: refreshed?.token ?? null,
        connectionRawPayload: refreshed?.connectionRawPayload ?? null,
        nextCursor: scopedObjects.nextCursor,
        recovery: scopedObjects.recovery,
        error: scopedObjects.error,
        rawPayload,
      };
    },
    async disconnect(command) {
      return {
        status: "disconnected",
        rawPayload: {
          mock: true,
          provider: "fortnox",
          providerConnectionId: command.providerConnectionId,
          revokeEndpoint: "https://apps.fortnox.se/oauth-v1/revoke",
          tokenTypeHint: "refresh_token",
          revoked: true,
        },
      };
    },
  };
}

export function createMockFortnoxInvoiceProvider(input: { now?: () => Date } = {}) {
  const now = input.now ?? (() => new Date("2026-06-15T10:00:00.000Z"));

  return {
    provider: "fortnox" as const,
    displayName: "Fortnox invoice writer",
    async createInvoice(command: FortnoxInvoiceCreateInput): Promise<FortnoxInvoiceCreateResult> {
      const suffix = hashProviderPayload({
        teamId: command.teamId,
        connectionId: command.connectionId,
        documentVersionId: command.payload.documentVersionId,
      });
      const providerInvoiceId = `invoice_${suffix}`;
      const invoiceNumber = `${command.payload.customerNumber}-${suffix.slice(0, 6)}`;

      return {
        provider: "fortnox",
        providerInvoiceId,
        invoiceNumber,
        invoiceUrl: `https://app.fortnox.se/invoices/${providerInvoiceId}`,
        providerStatus: "created",
        paymentStatus: "unpaid",
        rawPayload: {
          mock: true,
          provider: "fortnox",
          providerConnectionId: command.providerConnectionId,
          connectionId: command.connectionId,
          idempotencyKey: command.idempotencyKey,
          createdAt: now().toISOString(),
          invoice: {
            id: providerInvoiceId,
            number: invoiceNumber,
            status: "created",
            paymentStatus: "unpaid",
            customerNumber: command.payload.customerNumber,
            total: command.payload.totals.total,
            currency: command.payload.currency,
            paymentTerms: command.payload.paymentTerms,
            documentVersionId: command.payload.documentVersionId,
            pdfSha256: command.payload.pdfSha256,
          },
        },
      };
    },
  } satisfies FortnoxInvoiceProvider;
}

export function createMockIntegrationProvider(input: {
  provider: IntegrationProviderName;
  category: IntegrationCategory;
  displayName: string;
  capabilities: readonly IntegrationProviderCapability[];
  recordsSynced: number;
}): IntegrationProvider {
  return {
    provider: input.provider,
    category: input.category,
    displayName: input.displayName,
    capabilities: input.capabilities,
    async connect(command) {
      return {
        provider: input.provider,
        category: input.category,
        providerConnectionId: `${input.provider}_${command.teamId}`,
        displayName: input.displayName,
        status: "connected",
        capabilities: input.capabilities,
        token: mockEncryptedProviderToken({
          provider: input.provider,
          teamId: command.teamId,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
        }),
        rawPayload: {
          mock: true,
          category: input.category,
          provider: input.provider,
          teamId: command.teamId,
        },
      };
    },
    async sync(command) {
      return {
        status: "completed",
        recordsSynced: input.recordsSynced,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          recordsSynced: input.recordsSynced,
        },
      };
    },
    async exportTransactions(command) {
      if (!input.capabilities.includes("exportTransactions")) {
        throw new Error(`${input.provider} does not export transactions`);
      }

      return {
        status: "completed",
        recordsExported: command.transactions.length,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          exportType: "transactions",
          recordsExported: command.transactions.length,
        },
      };
    },
    async exportInvoices(command) {
      if (!input.capabilities.includes("exportInvoices")) {
        throw new Error(`${input.provider} does not export invoices`);
      }

      return {
        status: "completed",
        recordsExported: command.invoices.length,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          exportType: "invoices",
          recordsExported: command.invoices.length,
        },
      };
    },
    async receivePaymentEvent(command) {
      if (!input.capabilities.includes("receivePaymentEvents")) {
        throw new Error(`${input.provider} does not receive payment events`);
      }

      const paymentEvent = mockPaymentEventFromPayload({
        provider: input.provider,
        providerConnectionId: command.providerConnectionId,
        rawPayload: command.rawPayload,
      });

      return {
        status: "completed",
        paymentEvent,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          paymentEventId: paymentEvent.providerEventId,
          invoiceId: paymentEvent.invoiceId,
          amount: paymentEvent.amount,
        },
      };
    },
    async sendMessage(command) {
      if (!input.capabilities.includes("sendMessage")) {
        throw new Error(`${input.provider} does not send messages`);
      }

      const providerDeliveryId = `${input.provider}_${command.providerConnectionId}_${hashMockDelivery(
        [command.channel, command.text],
      )}`;

      return {
        status: "completed",
        providerDeliveryId,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          providerDeliveryId,
          channel: command.channel,
          textLength: command.text.length,
        },
      };
    },
    async sendEmail(command) {
      if (!input.capabilities.includes("sendEmail")) {
        throw new Error(`${input.provider} does not send email`);
      }

      const providerDeliveryId = `${input.provider}_${command.providerConnectionId}_${hashMockDelivery(
        [command.to, command.subject, command.text],
      )}`;

      return {
        status: "completed",
        providerDeliveryId,
        rawPayload: {
          mock: true,
          provider: input.provider,
          providerConnectionId: command.providerConnectionId,
          providerDeliveryId,
          to: command.to,
          subject: command.subject,
          textLength: command.text.length,
        },
      };
    },
  };
}

async function requestFortnoxToken(input: {
  fetchFn: FortnoxHttpFetch;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  now: Date;
  body: Record<string, string>;
}): Promise<FortnoxTokenBundle> {
  const response = await input.fetchFn(input.tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString(
        "base64",
      )}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
    },
    body: new URLSearchParams(input.body),
  });
  const payload = await parseFortnoxJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Fortnox token request failed: ${fortnoxErrorSummary(payload)}`);
  }

  return fortnoxTokenBundleFromResponse(payload, input.now);
}

async function ensureFortnoxAccessToken(input: {
  fetchFn: FortnoxHttpFetch;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  tokenCodec: FortnoxTokenCodec;
  token: IntegrationProviderToken;
  providerConnectionId: string;
  now: Date;
}) {
  const tokens = await input.tokenCodec.decrypt(input.token);
  const expiresInMs = new Date(tokens.expiresAt).getTime() - input.now.getTime();

  if (expiresInMs > 5 * 60_000) {
    const health = normalizeFortnoxConnectionHealth({
      grantedScopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      now: input.now,
    });

    return {
      tokens,
      health,
      refreshedToken: null,
      connectionRawPayload: null,
    };
  }

  const refreshed = await requestFortnoxToken({
    fetchFn: input.fetchFn,
    tokenUrl: input.tokenUrl,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    now: input.now,
    body: {
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    },
  });
  const health = normalizeFortnoxConnectionHealth({
    grantedScopes: refreshed.scopes,
    expiresAt: refreshed.expiresAt,
    now: input.now,
  });

  return {
    tokens: refreshed,
    health,
    refreshedToken: await input.tokenCodec.encrypt(refreshed),
    connectionRawPayload: {
      provider: "fortnox",
      providerConnectionId: input.providerConnectionId,
      oauth: {
        scopes: refreshed.scopes,
        tokenType: refreshed.tokenType,
        expiresAt: refreshed.expiresAt,
        refreshedAt: input.now.toISOString(),
        tokenEndpoint: input.tokenUrl,
      },
      health,
    },
  };
}

async function syncFortnoxCatalog(input: {
  fetchFn: FortnoxHttpFetch;
  apiBaseUrl: string;
  providerConnectionId: string;
  accessToken: string;
  cursor: FortnoxSyncCursor | null;
  maxPages: number;
}): Promise<{
  status: "completed" | "partial";
  externalObjects: IntegrationProviderExternalObject[];
  nextCursor: ProviderRawPayload | null;
  recovery: { message: string; retryCursor: ProviderRawPayload } | null;
  error: string | null;
}> {
  const externalObjects: IntegrationProviderExternalObject[] = [];
  let remainingPages = Math.max(1, input.maxPages);
  let resource: FortnoxSyncResource = input.cursor?.resource ?? "company";
  let page = input.cursor?.page ?? 1;

  try {
    if (resource === "company") {
      externalObjects.push(
        await fetchFortnoxCompany({
          fetchFn: input.fetchFn,
          apiBaseUrl: input.apiBaseUrl,
          providerConnectionId: input.providerConnectionId,
          accessToken: input.accessToken,
        }),
      );
      resource = "customer";
      page = 1;
    }

    if (resource === "customer") {
      while (remainingPages > 0) {
        const customers = await fetchFortnoxPage({
          fetchFn: input.fetchFn,
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          path: "customers",
          arrayKey: "Customers",
          page,
        });
        externalObjects.push(
          ...customers.items.map((customer) =>
            fortnoxCustomerExternalObject(customer, input.providerConnectionId),
          ),
        );
        remainingPages -= 1;

        if (customers.nextPage) {
          page = customers.nextPage;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "customer",
              page,
              message: "Fortnox customer sync paused at page limit",
            });
          }
        } else {
          resource = "article";
          page = 1;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "article",
              page,
              message: "Fortnox article sync paused at page limit",
            });
          }

          break;
        }
      }
    }

    if (resource === "article") {
      while (remainingPages > 0) {
        const articles = await fetchFortnoxPage({
          fetchFn: input.fetchFn,
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          path: "articles",
          arrayKey: "Articles",
          page,
        });
        externalObjects.push(
          ...articles.items.map((article) =>
            fortnoxArticleExternalObject(article, input.providerConnectionId),
          ),
        );
        remainingPages -= 1;

        if (articles.nextPage) {
          page = articles.nextPage;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "article",
              page,
              message: "Fortnox article sync paused at page limit",
            });
          }
        } else {
          resource = "invoice";
          page = 1;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "invoice",
              page,
              message: "Fortnox invoice sync paused at page limit",
            });
          }

          break;
        }
      }
    }

    if (resource === "invoice") {
      while (remainingPages > 0) {
        const invoices = await fetchFortnoxPage({
          fetchFn: input.fetchFn,
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          path: "invoices",
          arrayKey: "Invoices",
          page,
        });
        externalObjects.push(
          ...invoices.items.map((invoice) =>
            fortnoxInvoiceExternalObject(invoice, input.providerConnectionId),
          ),
        );
        remainingPages -= 1;

        if (invoices.nextPage) {
          page = invoices.nextPage;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "invoice",
              page,
              message: "Fortnox invoice sync paused at page limit",
            });
          }
        } else {
          resource = "payment";
          page = 1;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "payment",
              page,
              message: "Fortnox invoice payment sync paused at page limit",
            });
          }

          break;
        }
      }
    }

    if (resource === "payment") {
      while (remainingPages > 0) {
        const payments = await fetchFortnoxPage({
          fetchFn: input.fetchFn,
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          path: "invoicepayments",
          arrayKey: "InvoicePayments",
          page,
        });
        externalObjects.push(
          ...payments.items.map((payment) =>
            fortnoxInvoicePaymentExternalObject(payment, input.providerConnectionId),
          ),
        );
        remainingPages -= 1;

        if (payments.nextPage) {
          page = payments.nextPage;

          if (remainingPages === 0) {
            return fortnoxPartialCatalogResult({
              externalObjects,
              resource: "payment",
              page,
              message: "Fortnox invoice payment sync paused at page limit",
            });
          }
        } else {
          return {
            status: "completed",
            externalObjects,
            nextCursor: null,
            recovery: null,
            error: null,
          };
        }
      }
    }

    return {
      status: "completed",
      externalObjects,
      nextCursor: null,
      recovery: null,
      error: null,
    };
  } catch (error) {
    if (externalObjects.length === 0) {
      throw error;
    }

    return fortnoxPartialCatalogResult({
      externalObjects,
      resource,
      page,
      message: `Fortnox ${resource} sync failed; retry with returned cursor`,
      error: error instanceof Error ? error.message : "Fortnox catalog sync failed",
    });
  }
}

function fortnoxPartialCatalogResult(input: {
  externalObjects: IntegrationProviderExternalObject[];
  resource: FortnoxSyncResource;
  page: number;
  message: string;
  error?: string;
}) {
  const retryCursor = { resource: input.resource, page: input.page };

  return {
    status: "partial" as const,
    externalObjects: input.externalObjects,
    nextCursor: retryCursor,
    recovery: {
      message: input.message,
      retryCursor,
    },
    error: input.error ?? input.message,
  };
}

async function fetchFortnoxCompany(input: {
  fetchFn: FortnoxHttpFetch;
  apiBaseUrl: string;
  providerConnectionId: string;
  accessToken: string;
}) {
  const payload = await fetchFortnoxJson({
    fetchFn: input.fetchFn,
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: "companyinformation",
  });
  const company = fortnoxEnvelope(payload, "CompanyInformation");
  const organizationNumber = maybeNormalizeSwedishOrganizationNumber(
    stringFromRecord(company, ["OrganizationNumber", "OrganisationNumber", "organizationNumber"]),
  );
  const providerObjectId =
    organizationNumber ??
    stringFromRecord(company, ["DatabaseNumber", "CompanyId", "CompanyID", "id"]) ??
    "company";

  return {
    providerObjectType: "company",
    providerObjectId,
    rawPayload: {
      provider: "fortnox",
      providerConnectionId: input.providerConnectionId,
      name: stringFromRecord(company, ["Name", "CompanyName", "name"]) ?? null,
      organizationNumber,
      sourcePayload: company,
    },
  };
}

async function fetchFortnoxPage(input: {
  fetchFn: FortnoxHttpFetch;
  apiBaseUrl: string;
  accessToken: string;
  path: string;
  arrayKey: string;
  page: number;
}) {
  const payload = await fetchFortnoxJson({
    fetchFn: input.fetchFn,
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: input.path,
    query: {
      page: String(input.page),
      limit: "100",
    },
  });
  const items = arrayFromRecord(fortnoxEnvelope(payload, input.arrayKey), input.arrayKey);
  const totalPages = numberFromRecord(payload, [
    "MetaInformation.@TotalPages",
    "MetaInformation.TotalPages",
    "@TotalPages",
    "TotalPages",
  ]);
  const nextPage = totalPages && input.page < totalPages ? input.page + 1 : null;

  return { items, nextPage };
}

async function fetchFortnoxJson(input: {
  fetchFn: FortnoxHttpFetch;
  apiBaseUrl: string;
  accessToken: string;
  path: string;
  query?: Record<string, string>;
}) {
  const url = new URL(input.path, `${input.apiBaseUrl.replace(/\/+$/, "")}/`);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await input.fetchFn(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/json",
    },
  });
  const payload = await parseFortnoxJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Fortnox API request failed: ${fortnoxErrorSummary(payload)}`);
  }

  return payload;
}

async function parseFortnoxJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ProviderRawPayload;
  } catch {
    return { body: text };
  }
}

function fortnoxTokenBundleFromResponse(
  payload: ProviderRawPayload,
  now: Date,
): FortnoxTokenBundle {
  const accessToken = requiredPayloadString(payload, "access_token");
  const refreshToken = requiredPayloadString(payload, "refresh_token");
  const expiresIn = numberFromRecord(payload, ["expires_in"]) ?? 3600;
  const tokenType = stringFromRecord(payload, ["token_type"]);
  const scopes = fortnoxScopesFromPayload(payload);

  if (tokenType !== "bearer" && tokenType !== "Bearer") {
    throw new Error("Fortnox token response did not include a bearer token type");
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    tokenType,
    scopes,
    rawPayload: {
      provider: "fortnox",
      scopes,
      expiresIn,
      tokenType,
    },
  };
}

function fortnoxScopesFromPayload(payload: ProviderRawPayload) {
  const scope = payload.scope;

  if (Array.isArray(scope)) {
    return scope.filter((item): item is string => typeof item === "string");
  }

  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean);
  }

  return [];
}

function fortnoxCustomerExternalObject(
  customer: ProviderRawPayload,
  providerConnectionId: string,
): IntegrationProviderExternalObject {
  const customerNumber = requiredPayloadString(customer, "CustomerNumber", "customerNumber");
  const organizationNumber = maybeNormalizeSwedishOrganizationNumber(
    stringFromRecord(customer, ["OrganisationNumber", "OrganizationNumber", "organizationNumber"]),
  );

  return {
    providerObjectType: "customer",
    providerObjectId: normalizeFortnoxCustomerNumber(customerNumber),
    rawPayload: {
      provider: "fortnox",
      providerConnectionId,
      customerNumber,
      name: stringFromRecord(customer, ["Name", "name"]) ?? null,
      organizationNumber,
      currency: stringFromRecord(customer, ["Currency", "currency"]) ?? null,
      paymentTerms:
        stringFromRecord(customer, ["TermsOfPayment", "TermsOfPayment.Name", "paymentTerms"]) ??
        null,
      sourcePayload: customer,
    },
  };
}

function fortnoxArticleExternalObject(
  article: ProviderRawPayload,
  providerConnectionId: string,
): IntegrationProviderExternalObject {
  const articleNumber = requiredPayloadString(article, "ArticleNumber", "articleNumber");

  return {
    providerObjectType: "article",
    providerObjectId: normalizeFortnoxArticleNumber(articleNumber),
    rawPayload: {
      provider: "fortnox",
      providerConnectionId,
      articleNumber,
      description: stringFromRecord(article, ["Description", "description"]) ?? null,
      unit: stringFromRecord(article, ["Unit", "unit"]) ?? null,
      salesPrice: numberFromRecord(article, ["SalesPrice", "salesPrice"]),
      vat: numberFromRecord(article, ["VAT", "Vat", "vat"]),
      sourcePayload: article,
    },
  };
}

function fortnoxInvoiceExternalObject(
  invoice: ProviderRawPayload,
  providerConnectionId: string,
): IntegrationProviderExternalObject {
  const documentNumber = requiredPayloadString(invoice, "DocumentNumber", "InvoiceNumber");
  const balance = numberFromRecord(invoice, ["Balance", "balance"]);
  const total = numberFromRecord(invoice, ["Total", "total"]);

  return {
    providerObjectType: "invoice",
    providerObjectId: documentNumber,
    rawPayload: {
      provider: "fortnox",
      providerConnectionId,
      documentNumber,
      customerNumber: stringFromRecord(invoice, ["CustomerNumber", "customerNumber"]) ?? null,
      customerName: stringFromRecord(invoice, ["CustomerName", "customerName"]) ?? null,
      invoiceDate: stringFromRecord(invoice, ["InvoiceDate", "invoiceDate"]) ?? null,
      dueDate: stringFromRecord(invoice, ["DueDate", "dueDate"]) ?? null,
      balance,
      total,
      currency: stringFromRecord(invoice, ["Currency", "currency"]) ?? null,
      booked: booleanFromRecord(invoice, ["Booked", "booked"]),
      cancelled: booleanFromRecord(invoice, ["Cancelled", "CancelledInvoice", "cancelled"]),
      paymentState: balance === 0 ? "paid" : "open",
      sourcePayload: invoice,
    },
  };
}

function fortnoxInvoicePaymentExternalObject(
  payment: ProviderRawPayload,
  providerConnectionId: string,
): IntegrationProviderExternalObject {
  const paymentNumber = stringFromRecord(payment, [
    "Number",
    "PaymentNumber",
    "InvoicePaymentNumber",
    "number",
  ]);
  const invoiceNumber = stringFromRecord(payment, [
    "InvoiceNumber",
    "DocumentNumber",
    "invoiceNumber",
  ]);
  const providerObjectId = paymentNumber ?? `payment:${hashProviderPayload(payment)}`;

  return {
    providerObjectType: "payment",
    providerObjectId,
    rawPayload: {
      provider: "fortnox",
      providerConnectionId,
      paymentNumber,
      invoiceNumber,
      amount: numberFromRecord(payment, ["Amount", "amount"]),
      paymentDate: stringFromRecord(payment, ["PaymentDate", "paymentDate"]) ?? null,
      currency: stringFromRecord(payment, ["Currency", "currency"]) ?? null,
      modeOfPayment: stringFromRecord(payment, ["ModeOfPayment", "modeOfPayment"]) ?? null,
      sourcePayload: payment,
    },
  };
}

function parseFortnoxSyncCursor(cursor?: ProviderRawPayload | null): FortnoxSyncCursor | null {
  if (!cursor) {
    return null;
  }

  const resource = cursor.resource;
  const page = cursor.page;

  if (
    (resource === "company" ||
      resource === "customer" ||
      resource === "article" ||
      resource === "invoice" ||
      resource === "payment") &&
    typeof page === "number" &&
    Number.isInteger(page) &&
    page > 0
  ) {
    return { resource, page };
  }

  return null;
}

function fortnoxEnvelope(payload: ProviderRawPayload, key: string): ProviderRawPayload {
  const value = payload[key];

  if (isRecord(value)) {
    return value;
  }

  return payload;
}

function arrayFromRecord(payload: ProviderRawPayload, key: string): ProviderRawPayload[] {
  const value = payload[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function maybeNormalizeSwedishOrganizationNumber(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return normalizeSwedishOrganizationNumber(value);
  } catch {
    return null;
  }
}

function requiredPayloadString(payload: ProviderRawPayload, ...keys: string[]) {
  const value = stringFromRecord(payload, keys);

  if (!value) {
    throw new Error(`Fortnox response is missing required field: ${keys.join(" or ")}`);
  }

  return value;
}

function stringFromRecord(payload: ProviderRawPayload, keys: readonly string[]) {
  for (const key of keys) {
    const value = valueFromPath(payload, key);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function numberFromRecord(payload: ProviderRawPayload, keys: readonly string[]) {
  for (const key of keys) {
    const value = valueFromPath(payload, key);

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function booleanFromRecord(payload: ProviderRawPayload, keys: readonly string[]) {
  for (const key of keys) {
    const value = valueFromPath(payload, key);

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (normalized === "true") {
        return true;
      }

      if (normalized === "false") {
        return false;
      }
    }
  }

  return null;
}

function hashProviderPayload(payload: ProviderRawPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function valueFromPath(payload: ProviderRawPayload, path: string): unknown {
  let current: unknown = payload;

  for (const part of path.split(".")) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[part];
  }

  return current;
}

function fortnoxErrorSummary(payload: ProviderRawPayload) {
  return (
    stringFromRecord(payload, [
      "ErrorInformation.message",
      "ErrorInformation.Message",
      "error_description",
      "message",
      "body",
    ]) ?? "unknown Fortnox error"
  );
}

function isRecord(value: unknown): value is ProviderRawPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mockFortnoxCompany(teamId: string) {
  return {
    companyId: `company_${teamId}`,
    name: "Fortnox Demo AB",
    organizationNumber: normalizeSwedishOrganizationNumber("556677-8899"),
    defaultCurrency: "SEK",
  };
}

async function fortnoxProviderConnection(input: {
  teamId: string;
  actorId: string;
  idempotencyKey: string;
  tokenCodec: FortnoxTokenCodec;
  grantedScopes?: readonly string[];
  licensedScopes?: readonly string[];
  now: Date;
  oauth: Record<string, unknown>;
}): Promise<IntegrationProviderConnection> {
  const tokenBundle = mockFortnoxTokenBundle({
    teamId: input.teamId,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    grantedScopes: input.grantedScopes,
  });
  const health = normalizeFortnoxConnectionHealth({
    grantedScopes: tokenBundle.scopes,
    licensedScopes: input.licensedScopes,
    expiresAt: tokenBundle.expiresAt,
    now: input.now,
  });

  return {
    provider: "fortnox",
    category: "accounting",
    providerConnectionId: `fortnox_${input.teamId}`,
    displayName: "Fortnox Demo AB",
    status: "connected",
    capabilities: ["connect", "sync", "disable"],
    token: await input.tokenCodec.encrypt(tokenBundle),
    rawPayload: {
      mock: true,
      provider: "fortnox",
      teamId: input.teamId,
      company: mockFortnoxCompany(input.teamId),
      oauth: {
        stateValidated: true,
        scopes: ["companyinformation", "customer", "article", "invoice"],
        tokenEndpoint: "https://apps.fortnox.se/oauth-v1/token",
        tokenType: tokenBundle.tokenType,
        expiresAt: tokenBundle.expiresAt,
        ...input.oauth,
      },
      health,
    },
  };
}

function mockFortnoxTokenBundle(input: {
  teamId: string;
  actorId: string;
  idempotencyKey: string;
  grantedScopes?: readonly string[];
}): FortnoxTokenBundle {
  const scopes = [...(input.grantedScopes ?? fortnoxRequiredScopes)];

  return {
    accessToken: `mock_fortnox_access_${input.teamId}_${input.actorId}_${input.idempotencyKey}`,
    refreshToken: `mock_fortnox_refresh_${input.teamId}_${input.actorId}_${input.idempotencyKey}`,
    expiresAt: "2026-06-15T10:30:00.000Z",
    tokenType: "Bearer",
    scopes,
    rawPayload: {
      mock: true,
      provider: "fortnox",
      scopes,
    },
  };
}

async function maybeRefreshFortnoxToken(input: {
  tokenCodec: FortnoxTokenCodec;
  token: IntegrationProviderToken;
  providerConnectionId: string;
  now: Date;
  licensedScopes?: readonly string[];
}) {
  const tokens = await input.tokenCodec.decrypt(input.token);
  const expiresInMs = new Date(tokens.expiresAt).getTime() - input.now.getTime();

  if (expiresInMs > 5 * 60_000) {
    return null;
  }

  const refreshed: FortnoxTokenBundle = {
    ...tokens,
    accessToken: `mock_fortnox_refreshed_${tokens.refreshToken.slice(-12)}`,
    expiresAt: new Date(input.now.getTime() + 60 * 60_000).toISOString(),
    rawPayload: {
      ...tokens.rawPayload,
      refreshed: true,
    },
  };
  const health = normalizeFortnoxConnectionHealth({
    grantedScopes: refreshed.scopes,
    licensedScopes: input.licensedScopes,
    expiresAt: refreshed.expiresAt,
    now: input.now,
  });
  const connectionRawPayload = {
    mock: true,
    provider: "fortnox",
    providerConnectionId: input.providerConnectionId,
    oauth: {
      scopes: refreshed.scopes,
      tokenType: refreshed.tokenType,
      expiresAt: refreshed.expiresAt,
      refreshedAt: input.now.toISOString(),
      tokenEndpoint: "https://apps.fortnox.se/oauth-v1/token",
    },
    health,
  };

  return {
    token: await input.tokenCodec.encrypt(refreshed),
    connectionRawPayload,
    health,
  };
}

function fortnoxObjectsForSync(input: {
  objects: readonly IntegrationProviderExternalObject[];
  partialFailure: boolean;
  cursor?: ProviderRawPayload | null;
}): {
  status: "completed" | "partial";
  objects: IntegrationProviderExternalObject[];
  nextCursor: ProviderRawPayload | null;
  recovery: { message: string; retryCursor: ProviderRawPayload } | null;
  error: string | null;
} {
  if (!input.partialFailure) {
    return {
      status: "completed",
      objects: [...input.objects],
      nextCursor: null,
      recovery: null,
      error: null,
    };
  }

  if (input.cursor?.resumeFrom === "fortnox:article:SUPPORT") {
    return {
      status: "completed",
      objects: input.objects.filter(
        (object) =>
          object.providerObjectType === "article" && object.providerObjectId === "SUPPORT",
      ),
      nextCursor: null,
      recovery: null,
      error: null,
    };
  }

  const retryCursor = {
    resumeFrom: "fortnox:article:SUPPORT",
    objectTypesCompleted: ["company", "customer"],
    failedObjectType: "article",
  };

  return {
    status: "partial",
    objects: input.objects.filter((object) => {
      if (object.providerObjectType === "company" || object.providerObjectType === "customer") {
        return true;
      }

      return object.providerObjectType === "article" && object.providerObjectId === "KONSULT";
    }),
    nextCursor: retryCursor,
    recovery: {
      message: "Fortnox article sync stopped after customers; retry with returned cursor",
      retryCursor,
    },
    error: "Fortnox article sync partially failed",
  };
}

function mockFortnoxCustomers() {
  return [
    {
      customerNumber: "1001",
      name: "Acme Sverige AB",
      organizationNumber: normalizeSwedishOrganizationNumber("556111-2222"),
      currency: "SEK",
      paymentTerms: "30",
    },
    {
      customerNumber: "1002",
      name: "Northwind Konsult AB",
      organizationNumber: normalizeSwedishOrganizationNumber("556333-4444"),
      currency: "SEK",
      paymentTerms: "15",
    },
  ];
}

function mockFortnoxArticles() {
  return [
    {
      articleNumber: "KONSULT",
      description: "Konsulttimme",
      unit: "tim",
      vatRateBasisPoints: 2_500,
      currency: "SEK",
    },
    {
      articleNumber: "SUPPORT",
      description: "Supportavtal",
      unit: "st",
      vatRateBasisPoints: 2_500,
      currency: "SEK",
    },
  ];
}

function mockFortnoxInvoices(): ProviderRawPayload[] {
  return [
    {
      DocumentNumber: "9001",
      CustomerNumber: "1001",
      CustomerName: "Acme Sverige AB",
      InvoiceDate: "2026-06-15",
      DueDate: "2026-07-15",
      Balance: 0,
      Total: 250000,
      Currency: "SEK",
      Booked: true,
      Cancelled: false,
    },
    {
      DocumentNumber: "9002",
      CustomerNumber: "1002",
      CustomerName: "Nordic Supply AB",
      InvoiceDate: "2026-06-18",
      DueDate: "2026-07-18",
      Balance: 125000,
      Total: 125000,
      Currency: "SEK",
      Booked: true,
      Cancelled: false,
    },
  ];
}

function mockFortnoxInvoicePayments(): ProviderRawPayload[] {
  return [
    {
      Number: "7001",
      InvoiceNumber: "9001",
      Amount: 250000,
      PaymentDate: "2026-06-20",
      Currency: "SEK",
      ModeOfPayment: "BG",
    },
  ];
}

function mockPaymentEventFromPayload(input: {
  provider: IntegrationProviderName;
  providerConnectionId: string;
  rawPayload: ProviderRawPayload;
}): IntegrationPaymentEvent {
  const invoiceId = requiredString(input.rawPayload.invoiceId, "payment event invoiceId");
  const amountMinor = requiredNumber(input.rawPayload.amountMinor, "payment event amountMinor");
  const currency =
    typeof input.rawPayload.currency === "string" ? input.rawPayload.currency.toUpperCase() : "USD";
  const paidAt =
    typeof input.rawPayload.paidAt === "string"
      ? input.rawPayload.paidAt
      : "2026-06-15T12:00:00.000Z";
  const providerEventId =
    typeof input.rawPayload.providerEventId === "string"
      ? input.rawPayload.providerEventId
      : `${input.provider}_${input.providerConnectionId}_${invoiceId}_${amountMinor}`;
  const method = typeof input.rawPayload.method === "string" ? input.rawPayload.method : null;

  return {
    providerEventId,
    invoiceId,
    amount: { amountMinor, currency },
    paidAt,
    method,
    rawPayload: input.rawPayload,
  };
}

export function createMockTicSignatureProvider(): TicSignatureProvider {
  return {
    provider: "tic",
    displayName: "Mock TIC Identity",
    async createSignatureRequest(input) {
      const providerSessionId = `tic_session_${hashMockDelivery([
        input.teamId,
        input.documentId,
        input.documentVersionId,
        input.signer.email,
        input.idempotencyKey,
      ])}`;

      return {
        provider: "tic",
        providerSessionId,
        signingUrl: `https://tic.example/sign/${providerSessionId}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        rawPayload: {
          mock: true,
          provider: "tic",
          providerSessionId,
          userVisibleData: input.userVisibleData,
          userNonVisibleDataSha256: createHash("sha256")
            .update(input.userNonVisibleData)
            .digest("hex"),
          callbackUrl: input.callbackUrl ?? null,
        },
      };
    },
    parseCompletionWebhook(input) {
      const payload = JSON.parse(input.body) as Record<string, unknown>;

      return {
        providerEventId: requiredString(payload.providerEventId, "providerEventId"),
        providerSessionId: requiredString(payload.providerSessionId, "providerSessionId"),
        documentPdfSha256: requiredString(payload.documentPdfSha256, "documentPdfSha256"),
        signedAt:
          typeof payload.signedAt === "string" ? payload.signedAt : new Date().toISOString(),
        signerName: requiredString(payload.signerName, "signerName"),
        signerEmail: typeof payload.signerEmail === "string" ? payload.signerEmail : null,
        signerPersonalNumberMasked:
          typeof payload.signerPersonalNumberMasked === "string"
            ? payload.signerPersonalNumberMasked
            : null,
        signatureValue: typeof payload.signatureValue === "string" ? payload.signatureValue : null,
        xmlDsig: typeof payload.xmlDsig === "string" ? payload.xmlDsig : null,
        ocspResponse: typeof payload.ocspResponse === "string" ? payload.ocspResponse : null,
        evidenceObjectKey:
          typeof payload.evidenceObjectKey === "string" ? payload.evidenceObjectKey : null,
        rawPayload: payload,
      };
    },
  };
}

export function createMockTicCompanyRolesProvider(input?: {
  fixtures?: Record<string, Partial<TicCompanyRolesEnrichment>>;
}): TicCompanyRolesProvider {
  const fixtures = input?.fixtures ?? {};

  return {
    provider: "tic",
    displayName: "Mock TIC CompanyRoles",
    async requestCompanyRoles(request) {
      const fixture = fixtures[request.providerSessionId] ?? fixtures[request.idempotencyKey] ?? {};
      const requestedAt = new Date().toISOString();
      const status = fixture.status ?? "completed";
      const providerRequestId =
        fixture.providerRequestId ??
        `tic_company_roles_${hashMockDelivery([
          request.teamId,
          request.providerSessionId,
          request.signatureEvidenceId,
          request.idempotencyKey,
        ])}`;
      const providerEventId = fixture.providerEventId ?? `${providerRequestId}_completed`;
      const companyRegistrationNumber =
        fixture.companyRegistrationNumber ?? request.sourceOrganizationNumber;
      const roles =
        fixture.roles ??
        (status === "completed"
          ? [
              {
                positionType: "signatory",
                positionDescription: "Firmatecknare",
                positionStart: null,
                positionEnd: null,
              },
            ]
          : []);

      return {
        provider: "tic",
        providerRequestId,
        providerEventId: status === "completed" ? providerEventId : null,
        providerSessionId: request.providerSessionId,
        status,
        companyRegistrationNumber: companyRegistrationNumber ?? null,
        legalName: fixture.legalName ?? "Buyer AB",
        legalEntityType: fixture.legalEntityType ?? "Aktiebolag",
        companyStatus: fixture.companyStatus ?? (status === "completed" ? "Aktiv" : null),
        roles,
        signatureDescription: fixture.signatureDescription ?? roles[0]?.positionDescription ?? null,
        signingAuthorityAnalysis:
          fixture.signingAuthorityAnalysis ??
          (status === "completed"
            ? {
                summary: "Mock analysis based on CompanyRoles evidence.",
                confidence: "medium",
                reasons: ["CompanyRoles returned an active signatory role."],
              }
            : null),
        requestedAt,
        completedAt: status === "completed" ? requestedAt : null,
        rawPayload: {
          mock: true,
          provider: "tic",
          capability: "CompanyRoles",
          providerRequestId,
          providerSessionId: request.providerSessionId,
          status,
          ...fixture.rawPayload,
        },
        rawPayloadReference: fixture.rawPayloadReference ?? null,
      };
    },
  };
}

function parseFortnoxTokenBundle(value: unknown): FortnoxTokenBundle {
  if (!value || typeof value !== "object") {
    throw new Error("Fortnox token cannot be decrypted");
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.accessToken !== "string" ||
    typeof record.refreshToken !== "string" ||
    typeof record.expiresAt !== "string" ||
    (record.tokenType !== "Bearer" && record.tokenType !== "bearer") ||
    !Array.isArray(record.scopes)
  ) {
    throw new Error("Fortnox token cannot be decrypted");
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
    tokenType: record.tokenType,
    scopes: record.scopes.filter((scope): scope is string => typeof scope === "string"),
    rawPayload:
      record.rawPayload && typeof record.rawPayload === "object"
        ? (record.rawPayload as ProviderRawPayload)
        : {},
  };
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }

  return value;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Missing ${field}`);
  }

  return value;
}

function hashMockDelivery(parts: readonly string[]) {
  return createHmac("sha256", "mock-integration-delivery")
    .update(parts.join("\n"))
    .digest("hex")
    .slice(0, 12);
}

function mockEncryptedProviderToken(input: {
  provider: IntegrationProviderName | BankingProviderName;
  teamId: string;
  actorId: string;
  idempotencyKey: string;
}): IntegrationProviderToken {
  const token = `mock_secret_${input.provider}_${input.teamId}_${input.actorId}_${input.idempotencyKey}`;
  const encoded = Buffer.from(token).toString("base64");

  return {
    encryptedToken: `mockkms:${encoded}`,
    keyId: "mock-kms-local",
    lastFour: token.slice(-4),
  };
}

function sandboxProviderConnection(input: {
  teamId: string;
  actorId: string;
  providerSessionId: string;
  publicToken: string;
}): BankingProviderConnection {
  return {
    provider: "sandbox-bank",
    providerConnectionId: `sandbox_item_${input.teamId}`,
    institutionName: "Sandbox Bank",
    status: "connected",
    token: mockEncryptedProviderToken({
      provider: "sandbox-bank",
      teamId: input.teamId,
      actorId: input.actorId,
      idempotencyKey: input.publicToken,
    }),
    rawPayload: {
      sandbox: true,
      provider: "sandbox-bank",
      providerSessionId: input.providerSessionId,
      itemId: `sandbox_item_${input.teamId}`,
      tokenLastFour: input.publicToken.slice(-4),
    },
  };
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
