import { ORPCError } from "@orpc/server";
import {
  AppError,
  listProjectSyncCollection,
  listTransactionSyncCollection,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const syncCollectionInput = z
  .object({
    teamId: z.string().min(1).optional(),
    cursor: z.iso.datetime().nullable().optional(),
  })
  .optional();

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type SyncRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createSyncRouter({ dawnRepository }: SyncRouterDependencies) {
  return {
    transactions: protectedProcedure.input(syncCollectionInput).handler(async ({ context, input }) => {
      try {
        return await listTransactionSyncCollection(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
          { teamId: input?.teamId, cursor: input?.cursor ?? null },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    projects: protectedProcedure.input(syncCollectionInput).handler(async ({ context, input }) => {
      try {
        return await listProjectSyncCollection(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
          { teamId: input?.teamId, cursor: input?.cursor ?? null },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
  };
}
