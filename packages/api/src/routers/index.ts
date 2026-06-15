import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import {
  AppError,
  acceptInboxMatch,
  acceptTeamInvite,
  approveAssistantAction,
  commitCsvTransactionImport,
  completeBankConnection,
  createLedgerCounterparty,
  connectIntegration,
  createDeterministicInvoicePdfRenderer,
  createBankConnectionSession,
  connectMockBankConnection,
  createApiKey,
  createCustomer,
  createDocumentDownload,
  createDocumentUpload,
  createAutomationRule,
  createDraftInvoice,
  createLedgerTransaction,
  createProduct,
  createProject,
  createTimeEntry,
  createInvoiceFromTimeEntries,
  createRecurringInvoiceSchedule,
  createTransactionTag,
  createTeam,
  createWebhookSubscription,
  disableIntegration,
  disconnectBankConnection,
  generateInboxMatchSuggestions,
  getAssistantConversation,
  inviteTeamMember,
  correctDocumentExtraction,
  listAssistantWorkspace,
  listAutomationWorkspace,
  listBankConnections,
  listBillingWorkspace,
  listDeveloperWorkspace,
  listDocuments,
  listInboxItems,
  listIntegrationWorkspace,
  listLedgerSummary,
  listBusinessReport,
  listOperationsWorkspace,
  listProjectWorkspace,
  listTeamDirectory,
  listTeams,
  listTransactionSyncCollection,
  listTransactionReviewWorkspace,
  previewCsvTransactionImport,
  previewInvoicePdf,
  rejectInboxMatch,
  rejectAssistantAction,
  recordInvoicePayment,
  reviewTransaction,
  requestTeamDataDeletion,
  requestTeamDataExport,
  runAutomationsForOutboxEvent,
  sendInvoice,
  sendAssistantMessage,
  syncIntegration,
  syncBankConnection,
  createLedgerTransferPair,
  type DawnRepository,
  type DocumentExtractionFields,
  type DocumentUrlSigner,
  type InvoicePdfRenderer,
  updateDraftInvoice,
  updateTeamMemberRole,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { env } from "@dawn/env/server";
import {
  createMockBankingProvider,
  createSandboxBankingProvider,
  createMockIntegrationProviders,
  createMockInvoiceEmailDeliveryProvider,
  type BankingProvider,
  type IntegrationProvider,
  type InvoiceEmailDeliveryProvider,
} from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { createDocumentUrlSigner } from "../document-url";
import { enforceAssistantRateLimit } from "../rate-limit";

export type AppRouterDependencies = {
  transactionReviewRepository: DawnRepository;
  bankingProviders: readonly BankingProvider[];
  integrationProviders: readonly IntegrationProvider[];
  documentUrlSigner: DocumentUrlSigner;
  invoicePdfRenderer: InvoicePdfRenderer;
  invoiceEmailDeliveryProvider: InvoiceEmailDeliveryProvider;
};

const reviewTransactionInput = z.object({
  teamId: z.string().min(1),
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const moneyInput = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const ledgerSummaryInput = z
  .object({
    teamId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .optional();

const reportOverviewInput = z
  .object({
    teamId: z.string().min(1).optional(),
    from: z.iso.datetime().nullable().optional(),
    to: z.iso.datetime().nullable().optional(),
  })
  .optional();

const assistantWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const assistantConversationInput = z.object({
  teamId: z.string().min(1).optional(),
  threadId: z.string().min(1),
});

const assistantAskInput = z.object({
  teamId: z.string().min(1).optional(),
  threadId: z.string().min(1).nullable().optional(),
  message: z.string().trim().min(1).max(2_000),
});

const assistantActionInput = z.object({
  teamId: z.string().min(1),
  approvalId: z.string().min(1),
});

const assistantApproveActionInput = assistantActionInput.extend({
  idempotencyKey: z.string().min(1),
});

const assistantRejectActionInput = assistantActionInput.extend({
  reason: z.string().max(500).nullable().optional(),
});

const automationWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const automationActionTypeInput = z.enum([
  "categorize_transaction",
  "create_notification",
  "create_invoice_draft",
  "request_accounting_export",
]);

const createAutomationRuleInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  trigger: z.object({
    type: z.literal("outbox_event"),
    eventType: z.string().trim().min(1).max(120),
  }),
  actionType: automationActionTypeInput,
  actionConfig: z.record(z.string(), z.unknown()),
  approvalPolicy: z.enum(["require_approval", "auto_approve"]),
  idempotencyKey: z.string().min(1),
});

const runAutomationForOutboxEventInput = z.object({
  teamId: z.string().min(1),
  outboxEventId: z.string().min(1),
});

const publicApiScopeInput = z.enum([
  "transactions.read",
  "transactions.write",
  "invoices.read",
  "invoices.write",
  "webhooks.manage",
]);

const developerWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const operationsWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    audit: z
      .object({
        action: z.string().trim().min(1).nullable().optional(),
        entityType: z.string().trim().min(1).nullable().optional(),
        entityId: z.string().trim().min(1).nullable().optional(),
        requestId: z.string().trim().min(1).nullable().optional(),
      })
      .optional(),
  })
  .optional();

const requestTeamDataExportInput = z.object({
  teamId: z.string().min(1),
  format: z.literal("json").optional(),
  idempotencyKey: z.string().min(1),
});

const requestTeamDataDeletionInput = z.object({
  teamId: z.string().min(1),
  confirmTeamId: z.string().min(1),
  reason: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createApiKeyInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  scopes: z.array(publicApiScopeInput).min(1),
  idempotencyKey: z.string().min(1),
});

const createWebhookSubscriptionInput = z.object({
  teamId: z.string().min(1),
  url: z.url(),
  eventTypes: z.array(z.string().trim().min(1).max(120)).min(1),
  idempotencyKey: z.string().min(1),
});

const bankConnectionInput = z.object({
  teamId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const bankProviderInput = z.enum(["mock-bank", "sandbox-bank"]);

const createBankConnectionSessionInput = z.object({
  teamId: z.string().min(1),
  provider: bankProviderInput,
  redirectUrl: z.url(),
  idempotencyKey: z.string().min(1),
});

const completeBankConnectionInput = z.object({
  teamId: z.string().min(1),
  provider: bankProviderInput,
  providerSessionId: z.string().min(1),
  publicToken: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const syncBankConnectionInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const disconnectBankConnectionInput = syncBankConnectionInput;

const integrationProviderInput = z.enum([
  "mock-accounting",
  "mock-payments",
  "mock-messaging",
  "mock-email",
]);

const integrationWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const connectIntegrationInput = z.object({
  teamId: z.string().min(1),
  provider: integrationProviderInput,
  idempotencyKey: z.string().min(1),
});

const syncIntegrationInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const disableIntegrationInput = z.object({
  teamId: z.string().min(1),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const createDocumentUploadInput = z.object({
  teamId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksumSha256: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createDocumentDownloadInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
});

const documentExtractionFieldsInput = z.object({
  documentType: z
    .enum([
      "receipt",
      "invoice_received",
      "invoice_sent",
      "bank_statement",
      "contract",
      "tax_document",
      "other",
    ])
    .nullable()
    .optional(),
  merchantName: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  totalAmountMinor: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  taxAmountMinor: z.number().int().nullable().optional(),
});

const correctDocumentExtractionInput = z.object({
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
  fields: documentExtractionFieldsInput,
  idempotencyKey: z.string().min(1),
});

const generateInboxMatchSuggestionsInput = z.object({
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
});

const acceptInboxMatchInput = z.object({
  teamId: z.string().min(1),
  suggestionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const rejectInboxMatchInput = z.object({
  teamId: z.string().min(1),
  suggestionId: z.string().min(1),
  reason: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createCustomerInput = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  billingAddress: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactRole: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createProductInput = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["product", "service"]),
  description: z.string().nullable().optional(),
  unitPrice: moneyInput,
  defaultTaxRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const invoiceLineInput = z.object({
  productId: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  quantityMilli: z.number().int().positive(),
  unitPrice: moneyInput,
  discountBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
});

const createDraftInvoiceInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  issueDate: z.iso.datetime(),
  dueDate: z.iso.datetime().nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  discountBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(invoiceLineInput).min(1),
  idempotencyKey: z.string().min(1),
});

const updateDraftInvoiceInput = createDraftInvoiceInput.extend({
  invoiceId: z.string().min(1),
});

const invoiceReferenceInput = z.object({
  teamId: z.string().min(1),
  invoiceId: z.string().min(1),
});

const sendInvoiceInput = invoiceReferenceInput.extend({
  toEmail: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  confirm: z.literal(true),
  idempotencyKey: z.string().min(1),
});

const recordInvoicePaymentInput = invoiceReferenceInput.extend({
  amount: moneyInput,
  paidAt: z.iso.datetime(),
  method: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createRecurringInvoiceScheduleInput = z.object({
  teamId: z.string().min(1),
  sourceInvoiceId: z.string().min(1),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.iso.datetime(),
  idempotencyKey: z.string().min(1),
});

const createProjectInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  billableRate: moneyInput,
  idempotencyKey: z.string().min(1),
});

const createTimeEntryInput = z.object({
  teamId: z.string().min(1),
  projectId: z.string().min(1),
  actorId: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  occurredOn: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  billableStatus: z.enum(["billable", "non_billable"]),
  billableRate: moneyInput.nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const createInvoiceFromTimeEntriesInput = z.object({
  teamId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  issueDate: z.iso.datetime(),
  dueDate: z.iso.datetime().nullable().optional(),
  timeEntryIds: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().min(1),
});

const createLedgerTransactionInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  description: z.string().min(1),
  postedAt: z.iso.datetime(),
  money: moneyInput,
  type: z.enum(["income", "expense", "transfer", "fee", "refund", "adjustment"]),
  source: z.enum(["manual", "csv_import", "bank_sync", "provider_webhook"]),
  categoryId: z.string().min(1).nullable().optional(),
  counterpartyId: z.string().min(1).nullable().optional(),
  providerTransactionId: z.string().min(1).nullable().optional(),
  splits: z
    .array(
      z.object({
        categoryId: z.string().min(1).nullable().optional(),
        money: moneyInput,
        note: z.string().nullable().optional(),
      }),
    )
    .optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  idempotencyKey: z.string().min(1),
});

const createLedgerCounterpartyInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  idempotencyKey: z.string().min(1),
});

const createTransactionTagInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().min(1),
});

const createLedgerTransferPairInput = z.object({
  teamId: z.string().min(1),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  postedAt: z.iso.datetime(),
  description: z.string().trim().min(1).max(240),
  money: moneyInput,
  tagIds: z.array(z.string().min(1)).optional(),
  idempotencyKey: z.string().min(1),
});

const csvTransactionImportMappingInput = z.object({
  postedAt: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().min(1),
  currency: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

const previewCsvTransactionImportInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  csvText: z.string().min(1),
  mapping: csvTransactionImportMappingInput,
});

const commitCsvTransactionImportInput = previewCsvTransactionImportInput.extend({
  fileName: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const transactionSyncInput = z
  .object({
    teamId: z.string().min(1).optional(),
    cursor: z.iso.datetime().nullable().optional(),
  })
  .optional();

const createTeamInput = z.object({
  name: z.string().min(1),
});

const inviteTeamRoleInput = z.enum(["admin", "member", "accountant", "viewer"]);

const inviteTeamMemberInput = z.object({
  teamId: z.string().min(1),
  email: z.email(),
  role: inviteTeamRoleInput,
  idempotencyKey: z.string().min(1),
});

const acceptTeamInviteInput = z.object({
  inviteId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const updateTeamMemberRoleInput = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: inviteTeamRoleInput,
  idempotencyKey: z.string().min(1),
});

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

function requireBankingProvider(
  providers: readonly BankingProvider[],
  providerName?: string | null,
): BankingProvider {
  const provider = providers.find((candidate) => candidate.provider === providerName);

  if (!provider) {
    throw new AppError("NOT_FOUND", "Bank provider not found");
  }

  return provider;
}

function createDefaultDependencies(): AppRouterDependencies {
  return {
    transactionReviewRepository: new DrizzleTransactionReviewRepository(),
    bankingProviders: [
      createMockBankingProvider(),
      createSandboxBankingProvider({
        appUrl: env.BETTER_AUTH_URL,
        webhookSecret: env.BETTER_AUTH_SECRET,
      }),
    ],
    integrationProviders: createMockIntegrationProviders(),
    documentUrlSigner: createDocumentUrlSigner({
      baseUrl: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
    }),
    invoicePdfRenderer: createDeterministicInvoicePdfRenderer(),
    invoiceEmailDeliveryProvider: createMockInvoiceEmailDeliveryProvider(),
  };
}

export function createAppRouter(dependencies: AppRouterDependencies = createDefaultDependencies()) {
  const {
    bankingProviders,
    documentUrlSigner,
    integrationProviders,
    invoiceEmailDeliveryProvider,
    invoicePdfRenderer,
    transactionReviewRepository,
  } = dependencies;

  return {
    healthCheck: publicProcedure.handler(() => {
      return "OK";
    }),
    teams: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listTeams(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      create: protectedProcedure.input(createTeamInput).handler(async ({ context, input }) => {
        try {
          return await createTeam(
            transactionReviewRepository,
            {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
            },
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
      directory: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listTeamDirectory(transactionReviewRepository, {
            actor: {
              id: context.session.user.id,
              type: "user",
              email: context.session.user.email,
            },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      invite: protectedProcedure
        .input(inviteTeamMemberInput)
        .handler(async ({ context, input }) => {
          try {
            return await inviteTeamMember(
              transactionReviewRepository,
              {
                actor: {
                  id: context.session.user.id,
                  type: "user",
                  email: context.session.user.email,
                },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      acceptInvite: protectedProcedure
        .input(acceptTeamInviteInput)
        .handler(async ({ context, input }) => {
          try {
            return await acceptTeamInvite(
              transactionReviewRepository,
              {
                actor: {
                  id: context.session.user.id,
                  type: "user",
                  email: context.session.user.email,
                },
                requestId: context.requestId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      updateMemberRole: protectedProcedure
        .input(updateTeamMemberRoleInput)
        .handler(async ({ context, input }) => {
          try {
            return await updateTeamMemberRole(
              transactionReviewRepository,
              {
                actor: {
                  id: context.session.user.id,
                  type: "user",
                  email: context.session.user.email,
                },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    transactionReview: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listTransactionReviewWorkspace(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      review: protectedProcedure
        .input(reviewTransactionInput)
        .handler(async ({ context, input }) => {
          try {
            return await reviewTransaction(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    sync: {
      transactions: protectedProcedure
        .input(transactionSyncInput)
        .handler(async ({ context, input }) => {
          try {
            return await listTransactionSyncCollection(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input?.teamId,
              },
              { teamId: input?.teamId, cursor: input?.cursor ?? null },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    ledger: {
      summary: protectedProcedure.input(ledgerSummaryInput).handler(async ({ context, input }) => {
        try {
          return await listLedgerSummary(
            transactionReviewRepository,
            {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input?.teamId,
            },
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
      createTransaction: protectedProcedure
        .input(createLedgerTransactionInput)
        .handler(async ({ context, input }) => {
          try {
            return await createLedgerTransaction(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                categoryId: input.categoryId ?? null,
                counterpartyId: input.counterpartyId ?? null,
                providerTransactionId: input.providerTransactionId ?? null,
                splits: input.splits?.map((split) => ({
                  categoryId: split.categoryId ?? null,
                  money: split.money,
                  note: split.note ?? null,
                })),
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createCounterparty: protectedProcedure
        .input(createLedgerCounterpartyInput)
        .handler(async ({ context, input }) => {
          try {
            return await createLedgerCounterparty(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createTag: protectedProcedure
        .input(createTransactionTagInput)
        .handler(async ({ context, input }) => {
          try {
            return await createTransactionTag(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createTransferPair: protectedProcedure
        .input(createLedgerTransferPairInput)
        .handler(async ({ context, input }) => {
          try {
            return await createLedgerTransferPair(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    reports: {
      overview: protectedProcedure
        .input(reportOverviewInput)
        .handler(async ({ context, input }) => {
          try {
            return await listBusinessReport(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input?.teamId,
              },
              {
                teamId: input?.teamId,
                from: input?.from ?? null,
                to: input?.to ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    assistant: {
      list: protectedProcedure
        .input(assistantWorkspaceInput)
        .handler(async ({ context, input }) => {
          try {
            return await listAssistantWorkspace(transactionReviewRepository, {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input?.teamId,
            });
          } catch (error) {
            mapAppError(error);
          }
        }),
      thread: protectedProcedure
        .input(assistantConversationInput)
        .handler(async ({ context, input }) => {
          try {
            return await getAssistantConversation(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                teamId: input.teamId,
                threadId: input.threadId,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      ask: protectedProcedure.input(assistantAskInput).handler(async ({ context, input }) => {
        try {
          enforceAssistantRateLimit({
            actorId: context.session.user.id,
            teamId: input.teamId,
          });
          return await sendAssistantMessage(
            transactionReviewRepository,
            {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input.teamId,
            },
            {
              teamId: input.teamId,
              threadId: input.threadId ?? null,
              message: input.message,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
      approveAction: protectedProcedure
        .input(assistantApproveActionInput)
        .handler(async ({ context, input }) => {
          try {
            return await approveAssistantAction(
              transactionReviewRepository,
              invoicePdfRenderer,
              invoiceEmailDeliveryProvider,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      rejectAction: protectedProcedure
        .input(assistantRejectActionInput)
        .handler(async ({ context, input }) => {
          try {
            return await rejectAssistantAction(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                reason: input.reason ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    automations: {
      list: protectedProcedure
        .input(automationWorkspaceInput)
        .handler(async ({ context, input }) => {
          try {
            return await listAutomationWorkspace(transactionReviewRepository, {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input?.teamId,
            });
          } catch (error) {
            mapAppError(error);
          }
        }),
      createRule: protectedProcedure
        .input(createAutomationRuleInput)
        .handler(async ({ context, input }) => {
          try {
            return await createAutomationRule(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      runForOutboxEvent: protectedProcedure
        .input(runAutomationForOutboxEventInput)
        .handler(async ({ context, input }) => {
          try {
            return await runAutomationsForOutboxEvent(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    developers: {
      list: protectedProcedure
        .input(developerWorkspaceInput)
        .handler(async ({ context, input }) => {
          try {
            return await listDeveloperWorkspace(transactionReviewRepository, {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input?.teamId,
            });
          } catch (error) {
            mapAppError(error);
          }
        }),
      createApiKey: protectedProcedure
        .input(createApiKeyInput)
        .handler(async ({ context, input }) => {
          try {
            return await createApiKey(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createWebhookSubscription: protectedProcedure
        .input(createWebhookSubscriptionInput)
        .handler(async ({ context, input }) => {
          try {
            return await createWebhookSubscription(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    operations: {
      list: protectedProcedure
        .input(operationsWorkspaceInput)
        .handler(async ({ context, input }) => {
          try {
            return await listOperationsWorkspace(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input?.teamId,
              },
              {
                teamId: input?.teamId,
                limit: input?.limit,
                audit: input?.audit,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      requestDataExport: protectedProcedure
        .input(requestTeamDataExportInput)
        .handler(async ({ context, input }) => {
          try {
            return await requestTeamDataExport(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      requestDataDeletion: protectedProcedure
        .input(requestTeamDataDeletionInput)
        .handler(async ({ context, input }) => {
          try {
            return await requestTeamDataDeletion(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    banking: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listBankConnections(
            transactionReviewRepository,
            bankingProviders,
            {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input?.teamId,
            },
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
      connectMock: protectedProcedure
        .input(bankConnectionInput)
        .handler(async ({ context, input }) => {
          try {
            return await connectMockBankConnection(
              transactionReviewRepository,
              requireBankingProvider(bankingProviders, "mock-bank"),
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createSession: protectedProcedure
        .input(createBankConnectionSessionInput)
        .handler(async ({ context, input }) => {
          try {
            return await createBankConnectionSession(
              transactionReviewRepository,
              bankingProviders,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      complete: protectedProcedure
        .input(completeBankConnectionInput)
        .handler(async ({ context, input }) => {
          try {
            return await completeBankConnection(
              transactionReviewRepository,
              bankingProviders,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      sync: protectedProcedure
        .input(syncBankConnectionInput)
        .handler(async ({ context, input }) => {
          try {
            const connection = await transactionReviewRepository.getBankConnectionForTeam(
              input.teamId,
              input.connectionId,
            );
            return await syncBankConnection(
              transactionReviewRepository,
              requireBankingProvider(bankingProviders, connection?.provider),
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      disconnect: protectedProcedure
        .input(disconnectBankConnectionInput)
        .handler(async ({ context, input }) => {
          try {
            const connection = await transactionReviewRepository.getBankConnectionForTeam(
              input.teamId,
              input.connectionId,
            );
            return await disconnectBankConnection(
              transactionReviewRepository,
              requireBankingProvider(bankingProviders, connection?.provider),
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    integrations: {
      list: protectedProcedure
        .input(integrationWorkspaceInput)
        .handler(async ({ context, input }) => {
          try {
            return await listIntegrationWorkspace(
              transactionReviewRepository,
              integrationProviders,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input?.teamId,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      connect: protectedProcedure
        .input(connectIntegrationInput)
        .handler(async ({ context, input }) => {
          try {
            return await connectIntegration(
              transactionReviewRepository,
              integrationProviders,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      sync: protectedProcedure.input(syncIntegrationInput).handler(async ({ context, input }) => {
        try {
          return await syncIntegration(
            transactionReviewRepository,
            integrationProviders,
            {
              actor: { id: context.session.user.id, type: "user" },
              requestId: context.requestId,
              teamId: input.teamId,
            },
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
      disable: protectedProcedure
        .input(disableIntegrationInput)
        .handler(async ({ context, input }) => {
          try {
            return await disableIntegration(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    billing: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listBillingWorkspace(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      createCustomer: protectedProcedure
        .input(createCustomerInput)
        .handler(async ({ context, input }) => {
          try {
            return await createCustomer(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                email: input.email ?? null,
                billingAddress: input.billingAddress ?? null,
                contactName: input.contactName ?? null,
                contactEmail: input.contactEmail ?? null,
                contactRole: input.contactRole ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createProduct: protectedProcedure
        .input(createProductInput)
        .handler(async ({ context, input }) => {
          try {
            return await createProduct(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                description: input.description ?? null,
                defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints ?? 0,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createDraftInvoice: protectedProcedure
        .input(createDraftInvoiceInput)
        .handler(async ({ context, input }) => {
          try {
            return await createDraftInvoice(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                dueDate: input.dueDate ?? null,
                discountBasisPoints: input.discountBasisPoints ?? 0,
                notes: input.notes ?? null,
                lines: input.lines.map((line) => ({
                  ...line,
                  productId: line.productId ?? null,
                  discountBasisPoints: line.discountBasisPoints ?? 0,
                  taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
                })),
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      updateDraftInvoice: protectedProcedure
        .input(updateDraftInvoiceInput)
        .handler(async ({ context, input }) => {
          try {
            return await updateDraftInvoice(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                dueDate: input.dueDate ?? null,
                discountBasisPoints: input.discountBasisPoints ?? 0,
                notes: input.notes ?? null,
                lines: input.lines.map((line) => ({
                  ...line,
                  productId: line.productId ?? null,
                  discountBasisPoints: line.discountBasisPoints ?? 0,
                  taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
                })),
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      previewInvoicePdf: protectedProcedure
        .input(invoiceReferenceInput)
        .handler(async ({ context, input }) => {
          try {
            return await previewInvoicePdf(
              transactionReviewRepository,
              invoicePdfRenderer,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      sendInvoice: protectedProcedure
        .input(sendInvoiceInput)
        .handler(async ({ context, input }) => {
          try {
            return await sendInvoice(
              transactionReviewRepository,
              invoicePdfRenderer,
              invoiceEmailDeliveryProvider,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                toEmail: input.toEmail ?? null,
                subject: input.subject ?? null,
                message: input.message ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      recordPayment: protectedProcedure
        .input(recordInvoicePaymentInput)
        .handler(async ({ context, input }) => {
          try {
            return await recordInvoicePayment(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                method: input.method ?? null,
                note: input.note ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createRecurringSchedule: protectedProcedure
        .input(createRecurringInvoiceScheduleInput)
        .handler(async ({ context, input }) => {
          try {
            return await createRecurringInvoiceSchedule(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    projects: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listProjectWorkspace(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      createProject: protectedProcedure
        .input(createProjectInput)
        .handler(async ({ context, input }) => {
          try {
            return await createProject(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                description: input.description ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createTimeEntry: protectedProcedure
        .input(createTimeEntryInput)
        .handler(async ({ context, input }) => {
          try {
            return await createTimeEntry(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                actorId: input.actorId ?? null,
                billableRate: input.billableRate ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      createInvoiceFromTimeEntries: protectedProcedure
        .input(createInvoiceFromTimeEntriesInput)
        .handler(async ({ context, input }) => {
          try {
            return await createInvoiceFromTimeEntries(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                dueDate: input.dueDate ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    documents: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listDocuments(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      createUpload: protectedProcedure
        .input(createDocumentUploadInput)
        .handler(async ({ context, input }) => {
          try {
            return await createDocumentUpload(
              transactionReviewRepository,
              documentUrlSigner,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                checksumSha256: input.checksumSha256 ?? null,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      download: protectedProcedure
        .input(createDocumentDownloadInput)
        .handler(async ({ context, input }) => {
          try {
            return await createDocumentDownload(
              transactionReviewRepository,
              documentUrlSigner,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    inbox: {
      list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
        try {
          return await listInboxItems(transactionReviewRepository, {
            actor: { id: context.session.user.id, type: "user" },
            requestId: context.requestId,
            teamId: input?.teamId,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
      correctExtraction: protectedProcedure
        .input(correctDocumentExtractionInput)
        .handler(async ({ context, input }) => {
          try {
            return await correctDocumentExtraction(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                fields: input.fields as DocumentExtractionFields,
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      suggestMatches: protectedProcedure
        .input(generateInboxMatchSuggestionsInput)
        .handler(async ({ context, input }) => {
          try {
            return await generateInboxMatchSuggestions(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      acceptMatch: protectedProcedure
        .input(acceptInboxMatchInput)
        .handler(async ({ context, input }) => {
          try {
            return await acceptInboxMatch(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      rejectMatch: protectedProcedure
        .input(rejectInboxMatchInput)
        .handler(async ({ context, input }) => {
          try {
            return await rejectInboxMatch(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              input,
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
    csvImport: {
      preview: protectedProcedure
        .input(previewCsvTransactionImportInput)
        .handler(async ({ context, input }) => {
          try {
            return await previewCsvTransactionImport(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                mapping: {
                  ...input.mapping,
                  currency: input.mapping.currency ?? null,
                  categoryId: input.mapping.categoryId ?? null,
                },
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
      commit: protectedProcedure
        .input(commitCsvTransactionImportInput)
        .handler(async ({ context, input }) => {
          try {
            return await commitCsvTransactionImport(
              transactionReviewRepository,
              {
                actor: { id: context.session.user.id, type: "user" },
                requestId: context.requestId,
                teamId: input.teamId,
              },
              {
                ...input,
                fileName: input.fileName ?? null,
                mapping: {
                  ...input.mapping,
                  currency: input.mapping.currency ?? null,
                  categoryId: input.mapping.categoryId ?? null,
                },
              },
            );
          } catch (error) {
            mapAppError(error);
          }
        }),
    },
  };
}

export const appRouter = createAppRouter();
export type AppRouter = ReturnType<typeof createAppRouter>;
export type AppRouterClient = RouterClient<AppRouter>;
