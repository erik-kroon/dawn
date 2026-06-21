import { ORPCError } from "@orpc/server";
import {
  AppError,
  createLedgerCounterparty,
  createLedgerTransaction,
  createLedgerTransferPair,
  createTransactionTag,
  listLedgerSummary,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

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

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type LedgerRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createLedgerRouter({ dawnRepository }: LedgerRouterDependencies) {
  return {
    summary: protectedProcedure.input(ledgerSummaryInput).handler(async ({ context, input }) => {
      try {
        return await listLedgerSummary(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
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
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
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
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createTag: protectedProcedure.input(createTransactionTagInput).handler(async ({ context, input }) => {
      try {
        return await createTransactionTag(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
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
