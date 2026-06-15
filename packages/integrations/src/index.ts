import { createHmac, timingSafeEqual } from "node:crypto";

import type { LedgerTransactionDraft, Money } from "@dawn/domain";

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

export type InvoiceEmailDeliveryResult = {
  providerMessageId: string;
  acceptedAt: string;
};

export type InvoiceEmailDeliveryProvider = {
  provider: "mock-email";
  sendInvoice(input: InvoiceEmailMessage): Promise<InvoiceEmailDeliveryResult>;
};

export type IntegrationCategory = "accounting" | "payments" | "messaging" | "email";

export type IntegrationProviderName =
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

export type IntegrationProviderSyncResult = {
  status: "completed";
  recordsSynced: number;
  rawPayload: ProviderRawPayload;
};

export type IntegrationProvider = {
  provider: IntegrationProviderName;
  category: IntegrationCategory;
  displayName: string;
  capabilities: readonly IntegrationProviderCapability[];
  connect(input: {
    teamId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<IntegrationProviderConnection>;
  sync(input: {
    teamId: string;
    providerConnectionId: string;
  }): Promise<IntegrationProviderSyncResult>;
};

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

export function createMockInvoiceEmailDeliveryProvider(): InvoiceEmailDeliveryProvider {
  return {
    provider: "mock-email",
    async sendInvoice(input) {
      return {
        providerMessageId: `mock_email_${input.teamId}_${input.invoiceId}`,
        acceptedAt: "2026-06-15T12:00:00.000Z",
      };
    },
  };
}

export function createMockIntegrationProviders(): IntegrationProvider[] {
  return [
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
  };
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
