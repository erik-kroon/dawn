import { ORPCError } from "@orpc/server";
import {
  AppError,
  commitCsvTransactionImport,
  previewCsvTransactionImport,
  suggestCsvTransactionImportMapping,
  type DawnRepository,
  type TransactionImportPayloadStorage,
} from "@dawn/app";
import type { CsvTransactionMappingSuggestionProvider } from "@dawn/ai";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const csvTransactionImportMappingInput = z
  .object({
    postedAt: z.string().min(1),
    description: z.string().min(1),
    amount: z.string().min(1).nullable().optional(),
    debit: z.string().min(1).nullable().optional(),
    credit: z.string().min(1).nullable().optional(),
    currency: z.string().min(1).nullable().optional(),
    balance: z.string().min(1).nullable().optional(),
    invertAmount: z.boolean().optional(),
    categoryId: z.string().min(1).nullable().optional(),
  })
  .refine((mapping) => mapping.amount || mapping.debit || mapping.credit, {
    message: "CSV import mapping requires an amount, debit, or credit column",
  });

const previewCsvTransactionImportInput = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  csvText: z.string().min(1),
  mapping: csvTransactionImportMappingInput,
});

const suggestCsvTransactionImportMappingInput = z.object({
  teamId: z.string().min(1),
  csvText: z.string().min(1),
  sampleRowLimit: z.number().int().min(1).max(20).optional(),
});

const commitCsvTransactionImportInput = previewCsvTransactionImportInput.extend({
  fileName: z.string().min(1).nullable().optional(),
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

export type CsvImportRouterDependencies = {
  dawnRepository: DawnRepository;
  transactionImportPayloadStorage?: TransactionImportPayloadStorage;
  csvTransactionMappingProvider?: CsvTransactionMappingSuggestionProvider;
};

export function createCsvImportRouter({
  dawnRepository,
  transactionImportPayloadStorage,
  csvTransactionMappingProvider,
}: CsvImportRouterDependencies) {
  return {
    suggestMapping: protectedProcedure
      .input(suggestCsvTransactionImportMappingInput)
      .handler(async ({ context, input }) => {
        try {
          return await suggestCsvTransactionImportMapping(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
            { mappingProvider: csvTransactionMappingProvider },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    preview: protectedProcedure.input(previewCsvTransactionImportInput).handler(async ({ context, input }) => {
      try {
        return await previewCsvTransactionImport(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
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
    commit: protectedProcedure.input(commitCsvTransactionImportInput).handler(async ({ context, input }) => {
      try {
        return await commitCsvTransactionImport(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            ...input,
            fileName: input.fileName ?? null,
            mapping: {
              ...input.mapping,
              currency: input.mapping.currency ?? null,
              categoryId: input.mapping.categoryId ?? null,
            },
          },
          {
            payloadStorage:
              context.transactionImportPayloadStorage ?? transactionImportPayloadStorage,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
  };
}
