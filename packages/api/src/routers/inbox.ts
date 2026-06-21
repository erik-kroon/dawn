import { ORPCError } from "@orpc/server";
import {
  acceptInboxMatch,
  AppError,
  correctDocumentExtraction,
  dismissInboxItem,
  generateInboxMatchSuggestions,
  listInboxItems,
  rejectInboxMatch,
  requestDocumentExtractionRetry,
  type DawnRepository,
  type DocumentExtractionFields,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

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

const retryDocumentExtractionInput = z.object({
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const dismissInboxItemInput = z.object({
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const generateInboxMatchSuggestionsInput = z.object({
  teamId: z.string().min(1),
  inboxItemId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
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

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type InboxRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createInboxRouter({ dawnRepository }: InboxRouterDependencies) {
  return {
    list: protectedProcedure.input(teamContextInput).handler(async ({ context, input }) => {
      try {
        return await listInboxItems(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    correctExtraction: protectedProcedure
      .input(correctDocumentExtractionInput)
      .handler(async ({ context, input }) => {
        try {
          return await correctDocumentExtraction(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              fields: input.fields as DocumentExtractionFields,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    retryExtraction: protectedProcedure
      .input(retryDocumentExtractionInput)
      .handler(async ({ context, input }) => {
        try {
          return await requestDocumentExtractionRetry(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    dismissItem: protectedProcedure.input(dismissInboxItemInput).handler(async ({ context, input }) => {
      try {
        return await dismissInboxItem(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
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
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    acceptMatch: protectedProcedure.input(acceptInboxMatchInput).handler(async ({ context, input }) => {
      try {
        return await acceptInboxMatch(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    rejectMatch: protectedProcedure.input(rejectInboxMatchInput).handler(async ({ context, input }) => {
      try {
        return await rejectInboxMatch(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
  };
}
