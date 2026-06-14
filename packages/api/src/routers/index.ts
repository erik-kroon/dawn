import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import {
  AppError,
  createTeam,
  listTeams,
  listTransactionReviewWorkspace,
  reviewTransaction,
} from "@dawn/app";
import { DrizzleTransactionReviewRepository } from "@dawn/db/transaction-review";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";

const transactionReviewRepository = new DrizzleTransactionReviewRepository();

const reviewTransactionInput = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  teamId: z.string().min(1).optional(),
});

const teamContextInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const createTeamInput = z.object({
  name: z.string().min(1),
});

function mapAppError(error: unknown): never {
  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export const appRouter = {
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
    review: protectedProcedure.input(reviewTransactionInput).handler(async ({ context, input }) => {
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
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
