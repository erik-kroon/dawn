import { ORPCError } from "@orpc/server";
import { AppError, listBusinessReport, type DawnRepository } from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const reportOverviewInput = z
  .object({
    teamId: z.string().min(1).optional(),
    from: z.iso.datetime().nullable().optional(),
    to: z.iso.datetime().nullable().optional(),
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

export type ReportsRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createReportsRouter({ dawnRepository }: ReportsRouterDependencies) {
  return {
    overview: protectedProcedure.input(reportOverviewInput).handler(async ({ context, input }) => {
      try {
        return await listBusinessReport(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
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
  };
}
