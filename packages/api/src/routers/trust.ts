import { ORPCError } from "@orpc/server";
import {
  AppError,
  getTrustCheckForSignature,
  readTrustPolicy,
  requestSignerTrustCheck,
  reviewTrustCheck,
  updateTrustPolicy,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { TicCompanyRolesProvider } from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const trustPolicyInput = z.object({
  teamId: z.string().min(1),
});

const trustPolicyUpdateInput = z.object({
  teamId: z.string().min(1),
  mode: z.enum(["disabled", "advisory", "blocking"]),
  idempotencyKey: z.string().min(1),
});

const trustCheckRequestInput = z.object({
  teamId: z.string().min(1),
  signatureRequestId: z.string().min(1),
  signatureEvidenceId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1),
});

const trustCheckForSignatureInput = z.object({
  teamId: z.string().min(1),
  signatureRequestId: z.string().min(1),
});

const trustCheckReviewInput = z.object({
  teamId: z.string().min(1),
  trustCheckId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  rationale: z.string().trim().min(1).max(2_000),
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

export type TrustRouterDependencies = {
  dawnRepository: DawnRepository;
  ticCompanyRolesProvider: TicCompanyRolesProvider;
};

export function createTrustRouter({
  dawnRepository,
  ticCompanyRolesProvider,
}: TrustRouterDependencies) {
  return {
    policy: protectedProcedure.input(trustPolicyInput).handler(async ({ context, input }) => {
      try {
        return await readTrustPolicy(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    updatePolicy: protectedProcedure
      .input(trustPolicyUpdateInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateTrustPolicy(
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
    request: protectedProcedure
      .input(trustCheckRequestInput)
      .handler(async ({ context, input }) => {
        try {
          return await requestSignerTrustCheck(
            dawnRepository,
            ticCompanyRolesProvider,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              signatureEvidenceId: input.signatureEvidenceId ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    forSignature: protectedProcedure
      .input(trustCheckForSignatureInput)
      .handler(async ({ context, input }) => {
        try {
          return await getTrustCheckForSignature(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    review: protectedProcedure.input(trustCheckReviewInput).handler(async ({ context, input }) => {
      try {
        return await reviewTrustCheck(
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
  };
}
