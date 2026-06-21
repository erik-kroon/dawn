import { ORPCError } from "@orpc/server";
import {
  AppError,
  approveAssistantAction,
  getAssistantConversation,
  listAssistantWorkspace,
  rejectAssistantAction,
  sendAssistantMessage,
  type DawnRepository,
  type InvoicePdfRenderer,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import type { InvoiceEmailDeliveryProvider } from "@dawn/integrations";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";
import { enforceAssistantRateLimit } from "../rate-limit";

const assistantWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const assistantConversationInput = z.object({
  teamId: z.string().min(1).optional(),
  threadId: z.string().min(1),
});

const assistantAskInput = z.object({
  teamId: z.string().min(1).optional(),
  threadId: z.string().min(1).nullable().optional(),
  message: z.string().trim().min(1).max(2_000),
});

const assistantActionInput = z.object({
  teamId: z.string().min(1),
  approvalId: z.string().min(1),
});

const assistantApproveActionInput = assistantActionInput.extend({
  idempotencyKey: z.string().min(1),
});

const assistantRejectActionInput = assistantActionInput.extend({
  reason: z.string().max(500).nullable().optional(),
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

export type AssistantRouterDependencies = {
  dawnRepository: DawnRepository;
  invoicePdfRenderer: InvoicePdfRenderer;
  invoiceEmailDeliveryProvider: InvoiceEmailDeliveryProvider;
};

export function createAssistantRouter({
  dawnRepository,
  invoicePdfRenderer,
  invoiceEmailDeliveryProvider,
}: AssistantRouterDependencies) {
  return {
    list: protectedProcedure.input(assistantWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listAssistantWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    thread: protectedProcedure.input(assistantConversationInput).handler(async ({ context, input }) => {
      try {
        return await getAssistantConversation(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            teamId: input.teamId,
            threadId: input.threadId,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    ask: protectedProcedure.input(assistantAskInput).handler(async ({ context, input }) => {
      try {
        enforceAssistantRateLimit({
          actorId: context.session.user.id,
          teamId: input.teamId,
        });
        return await sendAssistantMessage(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          {
            teamId: input.teamId,
            threadId: input.threadId ?? null,
            message: input.message,
          },
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    approveAction: protectedProcedure
      .input(assistantApproveActionInput)
      .handler(async ({ context, input }) => {
        try {
          return await approveAssistantAction(
            dawnRepository,
            invoicePdfRenderer,
            invoiceEmailDeliveryProvider,
            appRequestFromSession(context, { teamId: input.teamId }),
            input,
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
    rejectAction: protectedProcedure
      .input(assistantRejectActionInput)
      .handler(async ({ context, input }) => {
        try {
          return await rejectAssistantAction(
            dawnRepository,
            appRequestFromSession(context, { teamId: input.teamId }),
            {
              ...input,
              reason: input.reason ?? null,
            },
          );
        } catch (error) {
          mapAppError(error);
        }
      }),
  };
}
