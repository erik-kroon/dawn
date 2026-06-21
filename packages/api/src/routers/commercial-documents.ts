import { ORPCError } from "@orpc/server";
import {
  AppError,
  completeTicSignatureWebhook,
  createCommercialDocument,
  declineCommercialDocumentByRecipient,
  finalizeCommercialDocument,
  getCommercialDocumentPdf,
  getRecipientSigningReceipt,
  getRecipientSigningStatus,
  getRecipientSignatureReceipt,
  getSignatureEvidence,
  previewCommercialDocumentPdf,
  readRecipientSigningSurface,
  reviseCommercialDocument,
  sendCommercialDocument,
  startRecipientTicSignatureRequest,
  startTicSignatureRequest,
  updateCommercialDocumentDraft,
  viewCommercialDocumentByRecipient,
  type CommercialDocumentPdfRenderer,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { TicSignatureProvider } from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { appRequestFromSession } from "../context";

const commercialDocumentLineInput = z.object({
  source: z.enum(["fortnox_article", "freeform"]),
  provider: z.string().nullable().optional(),
  providerConnectionId: z.string().nullable().optional(),
  providerObjectId: z.string().nullable().optional(),
  providerObjectRecordId: z.string().nullable().optional(),
  articleNumber: z.string().nullable().optional(),
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantityMilli: z.number().int().positive(),
  unitPrice: z.object({
    amountMinor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  discountBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  vatRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
});

const commercialDocumentCreateInput = z.object({
  teamId: z.string().min(1),
  opportunityId: z.string().min(1),
  documentType: z.enum(["quote", "contract"]).nullable().optional(),
  title: z.string().min(1),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  validUntil: z.iso.datetime().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  termsVersion: z.string().min(1),
  templateId: z.string().nullable().optional(),
  recipientEmail: z.email().nullable().optional(),
  scope: z.string().nullable().optional(),
  lines: z.array(commercialDocumentLineInput).min(1),
  idempotencyKey: z.string().min(1),
});

const commercialDocumentUpdateInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  documentType: z.enum(["quote", "contract"]).optional(),
  title: z.string().min(1).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  validUntil: z.iso.datetime().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  termsVersion: z.string().min(1).optional(),
  templateId: z.string().nullable().optional(),
  recipientEmail: z.email().nullable().optional(),
  scope: z.string().nullable().optional(),
  lines: z.array(commercialDocumentLineInput).min(1).optional(),
  idempotencyKey: z.string().min(1),
});

const commercialDocumentIdempotentInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const commercialDocumentPdfInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  versionId: z.string().nullable().optional(),
});

const commercialDocumentSendInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  recipientEmail: z.email().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const commercialDocumentRecipientInput = z.object({
  accessToken: z.string().min(1),
});

const recipientSigningTokenInput = z
  .object({
    accessToken: z.string().min(1),
  })
  .strict();

const recipientSigningStartInput = z
  .object({
    accessToken: z.string().min(1),
    signerName: z.string().trim().min(1).nullable().optional(),
    idempotencyKey: z.string().min(1),
  })
  .strict();

const commercialDocumentRecipientDeclineInput = z.object({
  accessToken: z.string().min(1),
  reason: z.string().max(2_000).nullable().optional(),
});

const ticSignatureStartInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  versionId: z.string().nullable().optional(),
  signerName: z.string().min(1),
  signerEmail: z.email(),
  signerRole: z.enum(["external_signer", "internal_countersigner"]).nullable().optional(),
  sellerLegalName: z.string().nullable().optional(),
  sellerOrganizationNumber: z.string().nullable().optional(),
  callbackUrl: z.url().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const ticSignatureEvidenceInput = z.object({
  teamId: z.string().min(1),
  signatureRequestId: z.string().min(1),
});

const ticSignatureWebhookInput = z.object({
  rawBody: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.string().min(1),
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

export type CommercialDocumentsRouterDependencies = {
  dawnRepository: DawnRepository;
  commercialDocumentPdfRenderer: CommercialDocumentPdfRenderer;
  ticSignatureProvider: TicSignatureProvider;
  ticWebhookSecret: string;
};

export function createCommercialDocumentsRouter({
  dawnRepository,
  commercialDocumentPdfRenderer,
  ticSignatureProvider,
  ticWebhookSecret,
}: CommercialDocumentsRouterDependencies) {
  return {
    create: protectedProcedure
      .input(commercialDocumentCreateInput)
      .handler(async ({ context, input }) => {
        try {
          return await createCommercialDocument(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              documentType: input.documentType ?? null,
              currency: input.currency ?? null,
              validUntil: input.validUntil ?? null,
              paymentTerms: input.paymentTerms ?? null,
              templateId: input.templateId ?? null,
              recipientEmail: input.recipientEmail ?? null,
              scope: input.scope ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updateDraft: protectedProcedure
      .input(commercialDocumentUpdateInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateCommercialDocumentDraft(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    previewPdf: protectedProcedure
      .input(commercialDocumentPdfInput)
      .handler(async ({ context, input }) => {
        try {
          return await previewCommercialDocumentPdf(
            dawnRepository,
            commercialDocumentPdfRenderer,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    finalize: protectedProcedure
      .input(commercialDocumentIdempotentInput)
      .handler(async ({ context, input }) => {
        try {
          return await finalizeCommercialDocument(
            dawnRepository,
            commercialDocumentPdfRenderer,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    getPdf: protectedProcedure.input(commercialDocumentPdfInput).handler(async ({ context, input }) => {
      try {
        return await getCommercialDocumentPdf(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            versionId: input.versionId ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    revise: protectedProcedure
      .input(commercialDocumentUpdateInput)
      .handler(async ({ context, input }) => {
        try {
          return await reviseCommercialDocument(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    send: protectedProcedure.input(commercialDocumentSendInput).handler(async ({ context, input }) => {
      try {
        return await sendCommercialDocument(
          dawnRepository,
          appRequestFromSession(context, {
            teamId: input.teamId,
            idempotencyKey: input.idempotencyKey,
          }),
          {
            ...input,
            recipientEmail: input.recipientEmail ?? null,
            expiresAt: input.expiresAt ?? null,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    startTicSignature: protectedProcedure
      .input(ticSignatureStartInput)
      .handler(async ({ context, input }) => {
        try {
          return await startTicSignatureRequest(
            dawnRepository,
            ticSignatureProvider,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              versionId: input.versionId ?? null,
              signerRole: input.signerRole ?? null,
              sellerLegalName: input.sellerLegalName ?? null,
              sellerOrganizationNumber: input.sellerOrganizationNumber ?? null,
              callbackUrl: input.callbackUrl ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    getSignatureEvidence: protectedProcedure
      .input(ticSignatureEvidenceInput)
      .handler(async ({ context, input }) => {
        try {
          return await getSignatureEvidence(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    ticSignatureWebhook: publicProcedure.input(ticSignatureWebhookInput).handler(async ({ input }) => {
      try {
        return await completeTicSignatureWebhook(dawnRepository, ticSignatureProvider, {
          ...input,
          webhookSecret: ticWebhookSecret,
        });
      } catch (error) {
        mapAppError(error);
      }
    }),
    recipientView: publicProcedure
      .input(commercialDocumentRecipientInput)
      .handler(async ({ input }) => {
        try {
          return await viewCommercialDocumentByRecipient(dawnRepository, input);
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientDecline: publicProcedure
      .input(commercialDocumentRecipientDeclineInput)
      .handler(async ({ input }) => {
        try {
          return await declineCommercialDocumentByRecipient(dawnRepository, {
            ...input,
            reason: input.reason ?? null,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientSignatureReceipt: publicProcedure
      .input(commercialDocumentRecipientInput)
      .handler(async ({ input }) => {
        try {
          return await getRecipientSignatureReceipt(dawnRepository, input);
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientSigningRead: publicProcedure
      .input(recipientSigningTokenInput)
      .handler(async ({ input }) => {
        try {
          return await readRecipientSigningSurface(dawnRepository, input);
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientSigningStatus: publicProcedure
      .input(recipientSigningTokenInput)
      .handler(async ({ input }) => {
        try {
          return await getRecipientSigningStatus(dawnRepository, input);
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientSigningStart: publicProcedure
      .input(recipientSigningStartInput)
      .handler(async ({ input }) => {
        try {
          return await startRecipientTicSignatureRequest(dawnRepository, ticSignatureProvider, {
            ...input,
            signerName: input.signerName ?? null,
          });
        } catch (error) {
          mapAppError(error);
        }
      }),
    recipientSigningReceipt: publicProcedure
      .input(recipientSigningTokenInput)
      .handler(async ({ input }) => {
        try {
          return await getRecipientSigningReceipt(dawnRepository, input);
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
