import { ORPCError } from "@orpc/server";
import {
  AppError,
  createMarketProspect,
  promoteMarketProspect,
  seedMarketCompany,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const marketSeedCompanyInput = z.object({
  teamId: z.string().min(1),
  provider: z.string().min(1),
  providerCapability: z.string().min(1),
  providerCompanyId: z.string().nullable().optional(),
  retrievedAt: z.iso.datetime().nullable().optional(),
  legalName: z.string().min(1),
  organizationNumber: z.string().min(1),
  countryCode: z.string().nullable().optional(),
  rawPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  rawPayloadReference: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const marketCreateProspectInput = z.object({
  teamId: z.string().min(1),
  companyId: z.string().min(1),
  companySnapshotId: z.string().min(1),
  sourceGoalId: z.string().nullable().optional(),
  sourceRunId: z.string().nullable().optional(),
  icpId: z.string().nullable().optional(),
  segmentId: z.string().nullable().optional(),
  sourceProvider: z.string().nullable().optional(),
  sourceProviderCapability: z.string().nullable().optional(),
  sourceDecisionSummary: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const marketPromoteProspectInput = z.object({
  teamId: z.string().min(1),
  prospectId: z.string().min(1),
  accountId: z.string().nullable().optional(),
  opportunityName: z.string().min(1),
  amountMinor: z.number().int(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  expectedCloseDate: z.iso.datetime().nullable().optional(),
  primaryOwnerPrincipalId: z.string().nullable().optional(),
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

export type MarketRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createMarketRouter({ dawnRepository }: MarketRouterDependencies) {
  return {
    seedCompany: protectedProcedure
      .input(marketSeedCompanyInput)
      .handler(async ({ context, input }) => {
        try {
          return await seedMarketCompany(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              providerCompanyId: input.providerCompanyId ?? null,
              retrievedAt: input.retrievedAt ?? null,
              countryCode: input.countryCode ?? null,
              rawPayload: input.rawPayload ?? null,
              rawPayloadReference: input.rawPayloadReference ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    createProspect: protectedProcedure
      .input(marketCreateProspectInput)
      .handler(async ({ context, input }) => {
        try {
          return await createMarketProspect(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              sourceGoalId: input.sourceGoalId ?? null,
              sourceRunId: input.sourceRunId ?? null,
              icpId: input.icpId ?? null,
              segmentId: input.segmentId ?? null,
              sourceProvider: input.sourceProvider ?? null,
              sourceProviderCapability: input.sourceProviderCapability ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    promoteProspect: protectedProcedure
      .input(marketPromoteProspectInput)
      .handler(async ({ context, input }) => {
        try {
          return await promoteMarketProspect(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              accountId: input.accountId ?? null,
              expectedCloseDate: input.expectedCloseDate ?? null,
              primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
