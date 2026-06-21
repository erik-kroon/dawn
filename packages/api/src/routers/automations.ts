import { ORPCError } from "@orpc/server";
import {
  AppError,
  createAutomationRule,
  listAutomationWorkspace,
  runAutomationsForOutboxEvent,
  type DawnRepository,
} from "@dawn/app";
import { RateLimitError } from "@dawn/app/rate-limit";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { appRequestFromSession } from "../context";

const automationWorkspaceInput = z
  .object({
    teamId: z.string().min(1).optional(),
  })
  .optional();

const automationActionTypeInput = z.enum([
  "categorize_transaction",
  "create_notification",
  "create_invoice_draft",
  "request_accounting_export",
]);

const createAutomationRuleInput = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  trigger: z.object({
    type: z.literal("outbox_event"),
    eventType: z.string().trim().min(1).max(120),
  }),
  actionType: automationActionTypeInput,
  actionConfig: z.record(z.string(), z.unknown()),
  approvalPolicy: z.enum(["require_approval", "auto_approve"]),
  idempotencyKey: z.string().min(1),
});

const runAutomationForOutboxEventInput = z.object({
  teamId: z.string().min(1),
  outboxEventId: z.string().min(1),
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

export type AutomationsRouterDependencies = {
  dawnRepository: DawnRepository;
};

export function createAutomationsRouter({ dawnRepository }: AutomationsRouterDependencies) {
  return {
    list: protectedProcedure.input(automationWorkspaceInput).handler(async ({ context, input }) => {
      try {
        return await listAutomationWorkspace(
          dawnRepository,
          appRequestFromSession(context, { teamId: input?.teamId }),
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    createRule: protectedProcedure.input(createAutomationRuleInput).handler(async ({ context, input }) => {
      try {
        return await createAutomationRule(
          dawnRepository,
          appRequestFromSession(context, { teamId: input.teamId }),
          input,
        );
      } catch (error) {
        mapAppError(error);
      }
    }),
    runForOutboxEvent: protectedProcedure
      .input(runAutomationForOutboxEventInput)
      .handler(async ({ context, input }) => {
        try {
          return await runAutomationsForOutboxEvent(
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
