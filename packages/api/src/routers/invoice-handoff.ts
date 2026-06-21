import { ORPCError } from "@orpc/server";
import {
  AppError,
  approveInvoiceHandoff,
  getInvoiceHandoffForDocument,
  readInvoiceHandoffPolicy,
  requestInvoiceHandoff,
  retryInvoiceHandoff,
  updateInvoiceHandoffPolicy,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const invoiceHandoffPolicyInput = z.object({
  teamId: z.string().min(1),
});

const invoiceHandoffPolicyUpdateInput = z.object({
  teamId: z.string().min(1),
  mode: z.enum(["automatic", "manual"]),
  idempotencyKey: z.string().min(1),
});

const invoiceHandoffForDocumentInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
});

const invoiceHandoffRequestInput = z.object({
  teamId: z.string().min(1),
  documentId: z.string().min(1),
  versionId: z.string().min(1).nullable().optional(),
  connectionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const invoiceHandoffApproveInput = z.object({
  teamId: z.string().min(1),
  handoffId: z.string().min(1),
  rationale: z.string().trim().min(1).max(2_000),
  idempotencyKey: z.string().min(1),
});

const invoiceHandoffRetryInput = z.object({
  teamId: z.string().min(1),
  handoffId: z.string().min(1),
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

export type InvoiceHandoffRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createInvoiceHandoffRouter({
  dawnRepository,
}: InvoiceHandoffRouterDependencies) {
  return {
    policy: protectedProcedure
      .input(invoiceHandoffPolicyInput)
      .handler(async ({ context, input }) => {
        try {
          return await readInvoiceHandoffPolicy(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    updatePolicy: protectedProcedure
      .input(invoiceHandoffPolicyUpdateInput)
      .handler(async ({ context, input }) => {
        try {
          return await updateInvoiceHandoffPolicy(
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
    forDocument: protectedProcedure
      .input(invoiceHandoffForDocumentInput)
      .handler(async ({ context, input }) => {
        try {
          return await getInvoiceHandoffForDocument(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    request: protectedProcedure
      .input(invoiceHandoffRequestInput)
      .handler(async ({ context, input }) => {
        try {
          return await requestInvoiceHandoff(
            dawnRepository,
            appRequestFromSession(context, {
              teamId: input.teamId,
              idempotencyKey: input.idempotencyKey,
            }),
            {
              ...input,
              versionId: input.versionId ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    approve: protectedProcedure
      .input(invoiceHandoffApproveInput)
      .handler(async ({ context, input }) => {
        try {
          return await approveInvoiceHandoff(
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
    retry: protectedProcedure.input(invoiceHandoffRetryInput).handler(async ({ context, input }) => {
      try {
        return await retryInvoiceHandoff(
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
