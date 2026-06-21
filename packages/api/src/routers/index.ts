import type { RouterClient } from "@orpc/server";
import {
  createDeterministicCommercialDocumentPdfRenderer,
  createDeterministicInvoicePdfRenderer,
  createEmailInboxOAuthStateCodec,
  createFortnoxOAuthStateCodec,
  createBankingProviderRegistry,
  type DawnRepository,
  type AccountantPacketAttachmentResolver,
  type DocumentUrlSigner,
  type EmailInboxOAuthStateCodec,
  type FortnoxOAuthStateCodec,
  type CommercialDocumentPdfRenderer,
  type InvoicePdfRenderer,
  type TransactionImportPayloadStorage,
} from "@dawn/app";
import type { CsvTransactionMappingSuggestionProvider } from "@dawn/ai";
import { getGoogleAuthAccountTokensForUser, type GoogleAuthAccountTokens } from "@dawn/auth";
import { DrizzleDawnRepository } from "@dawn/db/dawn-repository";
import { env } from "@dawn/env/server";
import {
  createMockBankingProvider,
  createSandboxBankingProvider,
  createConfiguredIntegrationProviders,
  createMockTicCompanyRolesProvider,
  createMockTicSignatureProvider,
  createMockInvoiceEmailDeliveryProvider,
  type AccountantPacketEmailDeliveryProvider,
  type BankingProvider,
  type InboxConnector,
  type IntegrationProvider,
  type InvoiceEmailDeliveryProvider,
  type TicCompanyRolesProvider,
  type TicSignatureProvider,
} from "@dawn/integrations";

import { publicProcedure } from "../index";
import { createDocumentUrlSigner } from "../document-url";
import { createDefaultEmailInboxConnectors } from "../email-inbox-connectors";
import { createAssistantRouter } from "./assistant";
import { createAutomationsRouter } from "./automations";
import { createBankingRouter } from "./banking";
import { createBillingRouter } from "./billing";
import { createCommercialDocumentsRouter } from "./commercial-documents";
import { createCrmRouter } from "./crm";
import { createCsvImportRouter } from "./csv-import";
import { createDevelopersRouter } from "./developers";
import { createDocumentsRouter } from "./documents";
import { createEmailInboxRouter } from "./email-inbox";
import { createInboxRouter } from "./inbox";
import { createIntegrationsRouter } from "./integrations";
import { createInvoiceHandoffRouter } from "./invoice-handoff";
import { createLedgerRouter } from "./ledger";
import { createMarketRouter } from "./market";
import { createOperationsRouter } from "./operations";
import { createProjectsRouter } from "./projects";
import { createReportsRouter } from "./reports";
import { createSyncRouter } from "./sync";
import { createTeamsRouter } from "./teams";
import { createTransactionReviewRouter } from "./transaction-review";
import { createTrustRouter } from "./trust";

export type AppRouterDependencies = {
  dawnRepository: DawnRepository;
  bankingProviders: readonly BankingProvider[];
  integrationProviders: readonly IntegrationProvider[];
  emailInboxConnectors: readonly InboxConnector[];
  emailInboxOAuthStateCodec?: EmailInboxOAuthStateCodec;
  fortnoxOAuthStateCodec?: FortnoxOAuthStateCodec;
  googleAuthAccountTokensForUser?: (userId: string) => Promise<GoogleAuthAccountTokens | null>;
  documentUrlSigner: DocumentUrlSigner;
  accountantPacketAttachmentResolver?: AccountantPacketAttachmentResolver;
  accountantPacketEmailDeliveryProvider?: AccountantPacketEmailDeliveryProvider;
  transactionImportPayloadStorage?: TransactionImportPayloadStorage;
  csvTransactionMappingProvider?: CsvTransactionMappingSuggestionProvider;
  commercialDocumentPdfRenderer?: CommercialDocumentPdfRenderer;
  ticSignatureProvider?: TicSignatureProvider;
  ticCompanyRolesProvider?: TicCompanyRolesProvider;
  ticWebhookSecret?: string;
  invoicePdfRenderer: InvoicePdfRenderer;
  invoiceEmailDeliveryProvider: InvoiceEmailDeliveryProvider;
};

function createDefaultDependencies(): AppRouterDependencies {
  return {
    dawnRepository: new DrizzleDawnRepository(),
    bankingProviders: [
      createMockBankingProvider(),
      createSandboxBankingProvider({
        appUrl: env.BETTER_AUTH_URL,
        webhookSecret: env.BETTER_AUTH_SECRET,
      }),
    ],
    integrationProviders: createConfiguredIntegrationProviders({
      fortnoxClientId: env.FORTNOX_CLIENT_ID,
      fortnoxClientSecret: env.FORTNOX_CLIENT_SECRET,
      tokenSecret: env.BETTER_AUTH_SECRET,
    }),
    emailInboxConnectors: createDefaultEmailInboxConnectors(env),
    emailInboxOAuthStateCodec: createEmailInboxOAuthStateCodec({
      secret: env.BETTER_AUTH_SECRET,
      allowedRedirectOrigins: [env.CORS_ORIGIN],
    }),
    fortnoxOAuthStateCodec: createFortnoxOAuthStateCodec({
      secret: env.BETTER_AUTH_SECRET,
      allowedRedirectOrigins: [env.CORS_ORIGIN],
    }),
    googleAuthAccountTokensForUser: getGoogleAuthAccountTokensForUser,
    documentUrlSigner: createDocumentUrlSigner({
      baseUrl: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
    }),
    commercialDocumentPdfRenderer: createDeterministicCommercialDocumentPdfRenderer(),
    ticSignatureProvider: createMockTicSignatureProvider(),
    ticCompanyRolesProvider: createMockTicCompanyRolesProvider(),
    ticWebhookSecret: env.TIC_WEBHOOK_SECRET ?? env.BETTER_AUTH_SECRET,
    invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
    invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
  };
}

export function createAppRouter(dependencies: AppRouterDependencies = createDefaultDependencies()) {
  const {
    bankingProviders,
    documentUrlSigner,
    integrationProviders,
    emailInboxConnectors,
    emailInboxOAuthStateCodec = createEmailInboxOAuthStateCodec({
      secret: env.BETTER_AUTH_SECRET,
      allowedRedirectOrigins: [env.CORS_ORIGIN],
    }),
    fortnoxOAuthStateCodec = createFortnoxOAuthStateCodec({
      secret: env.BETTER_AUTH_SECRET,
      allowedRedirectOrigins: [env.CORS_ORIGIN],
    }),
    googleAuthAccountTokensForUser = getGoogleAuthAccountTokensForUser,
    commercialDocumentPdfRenderer = createDeterministicCommercialDocumentPdfRenderer(),
    invoiceEmailDeliveryProvider,
    invoicePdfRenderer,
    dawnRepository,
    accountantPacketAttachmentResolver,
    accountantPacketEmailDeliveryProvider,
    transactionImportPayloadStorage,
    csvTransactionMappingProvider,
    ticSignatureProvider = createMockTicSignatureProvider(),
    ticCompanyRolesProvider = createMockTicCompanyRolesProvider(),
    ticWebhookSecret = env.TIC_WEBHOOK_SECRET ?? env.BETTER_AUTH_SECRET,
  } = dependencies;
  const bankingProviderRegistry = createBankingProviderRegistry(bankingProviders);

  return {
    healthCheck: publicProcedure.handler(() => {
      return "OK";
    }),
    teams: createTeamsRouter({
      dawnRepository,
    }),
    transactionReview: createTransactionReviewRouter({
      dawnRepository,
      documentUrlSigner,
      accountantPacketAttachmentResolver,
      accountantPacketEmailDeliveryProvider,
    }),
    sync: createSyncRouter({
      dawnRepository,
    }),
    ledger: createLedgerRouter({
      dawnRepository,
    }),
    reports: createReportsRouter({
      dawnRepository,
    }),
    assistant: createAssistantRouter({
      dawnRepository,
      invoicePdfRenderer,
      invoiceEmailDeliveryProvider,
    }),
    automations: createAutomationsRouter({
      dawnRepository,
    }),
    developers: createDevelopersRouter({
      dawnRepository,
    }),
    operations: createOperationsRouter({
      dawnRepository,
    }),
    banking: createBankingRouter({
      dawnRepository,
      bankingProviderRegistry,
    }),
    integrations: createIntegrationsRouter({
      dawnRepository,
      integrationProviders,
      fortnoxOAuthStateCodec,
    }),
    emailInbox: createEmailInboxRouter({
      dawnRepository,
      emailInboxConnectors,
      emailInboxOAuthStateCodec,
      googleAuthAccountTokensForUser,
    }),
    billing: createBillingRouter({
      dawnRepository,
      invoicePdfRenderer,
      invoiceEmailDeliveryProvider,
    }),
    market: createMarketRouter({
      dawnRepository,
    }),
    crm: createCrmRouter({
      dawnRepository,
    }),
    commercialDocuments: createCommercialDocumentsRouter({
      dawnRepository,
      commercialDocumentPdfRenderer,
      ticSignatureProvider,
      ticWebhookSecret,
    }),
    trust: createTrustRouter({
      dawnRepository,
      ticCompanyRolesProvider,
    }),
    invoiceHandoff: createInvoiceHandoffRouter({
      dawnRepository,
    }),
    projects: createProjectsRouter({
      dawnRepository,
    }),
    documents: createDocumentsRouter({
      dawnRepository,
      documentUrlSigner,
    }),
    inbox: createInboxRouter({
      dawnRepository,
    }),
    csvImport: createCsvImportRouter({
      dawnRepository,
      transactionImportPayloadStorage,
      csvTransactionMappingProvider,
    }),
  };
}

export const appRouter = createAppRouter();
export type AppRouter = ReturnType<typeof createAppRouter>;
export type AppRouterClient = RouterClient<AppRouter>;
