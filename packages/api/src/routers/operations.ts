import { ORPCError } from "@orpc/server";
import {
  AppError,
  listOperationsWorkspace,
  requestTeamDataDeletion,
  requestTeamDataExport,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const operationsWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    accountantClose: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
      })
      .optional(),
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

function mapAppError(error: unknown): never {
  if (error instanceof RateLimitError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: error.message });
  }

  if (error instanceof AppError) {
    throw new ORPCError(error.code, { message: error.message });
  }

  throw error;
}

export type OperationsRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createOperationsRouter({ dawnRepository }: OperationsRouterDependencies) {
  return {
    list: protectedProcedure.input(operationsWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listOperationsWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
          {
            teamId: input?.teamId,
            limit: input?.limit,
            accountantClose: input?.accountantClose,
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
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
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
