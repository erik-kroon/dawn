import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import {
  AppError,
  acceptTeamInvite,
  commitCsvTransactionImport,
  createLedgerTransaction,
  createTeam,
  inviteTeamMember,
  listLedgerSummary,
  listTeamDirectory,
  listTeams,
  listTransactionSyncCollection,
  listTransactionReviewWorkspace,
  previewCsvTransactionImport,
  reviewTransaction,
  type TransactionReviewRepository,
  updateTeamMemberRole,
} from "@dawn/app";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";

export type AppRouterDependencies = {
  transactionReviewRepository: TransactionReviewRepository;
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
  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

function createDefaultDependencies(): AppRouterDependencies {
  return {
    transactionReviewRepository: new DrizzleTransactionReviewRepository(),
  };
}

export function createAppRouter(dependencies: AppRouterDependencies = createDefaultDependencies()) {
  const { transactionReviewRepository } = dependencies;

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
